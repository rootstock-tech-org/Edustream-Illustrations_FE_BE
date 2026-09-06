"""
Vehicle in restricted zone — the alarm, the geometry, and the honesty.

The model these weights came with over-triggers badly: across the four clips in
storage/uploads, none of which contains a forklift, it returns a detection on
19% to 85% of frames at 0.25 confidence, and its six most confident outputs
anywhere are five views of a worker's forearm and one of a person at a desk.

So this suite deliberately does not measure "does it find forklifts" — there is
no footage here in which the answer is known, and a suite that pretended
otherwise would be the worst of the three things this project can produce. What
it measures is everything around the model, which is what code can be held to:

    * an area has to be marked before anything is watched at all
    * a vehicle outside the area does not raise an alarm, and one inside does
    * one frame cannot raise an alarm
    * a picture too dark to read is never "Area clear"
    * marking the vehicle area does not move the people area, or the reverse
    * the alarm says the words the operator was promised

Where a detection is needed, the confidence floor is lowered for that probe
only, so the geometry is exercised on whatever the model does return rather
than on a forklift nobody has. That is a test of the rule, not of the weights,
and it is labelled as such.

Run from backend/:

    PYTHONPATH=$PWD .venv/bin/python ../tests/verify_vehicle_zone.py
"""
import sys
from pathlib import Path

import cv2
import numpy as np

from app.modules.vehicle_zone.service import (
    CONFIRM_SIGHTINGS,
    INSIDE_SHARE,
    ITEM_CONFIDENCE,
    WATCH_CONFIDENCE,
    VehicleZoneService,
)
from app.vision.polygon import polygon_manager, vehicle_zone_manager

HERE = Path(__file__).resolve().parent
CLIPS = [
    HERE.parent / "backend" / "storage" / "uploads" / "test_640x480.mp4",
    HERE.parent / "backend" / "storage" / "uploads" / "cctv_demo.webm",
    HERE.parent / "backend" / "storage" / "uploads" / "video.mp4",
]

failures = 0


def check(name: str, ok: bool, detail: str = "") -> bool:
    global failures
    print(("PASS  " if ok else "FAIL  ") + name + (f"  [{detail}]" if not ok and detail else ""))
    if not ok:
        failures += 1
    return ok


def note(text: str) -> None:
    print(f"      {text}")


# Corners are pixels of the picture the area was drawn on, not fractions of it
# — see clean_polygon. Written out here because getting it wrong is silent: a
# "whole frame" in fractions rounds to a one-pixel area that can never contain
# anything, and the module then reports "Area clear" perfectly correctly.


def whole_frame(width, height):
    return [{"x": 0, "y": 0}, {"x": width - 1, "y": 0},
            {"x": width - 1, "y": height - 1}, {"x": 0, "y": height - 1}]


def corner(width, height):
    """A small area in the top-left, away from where anything is detected."""
    w, h = int(width * 0.12), int(height * 0.12)
    return [{"x": 0, "y": 0}, {"x": w, "y": 0}, {"x": w, "y": h}, {"x": 0, "y": h}]


def fresh(confidence=None):
    service = VehicleZoneService()
    if confidence is not None:
        service.configure({"confidence": confidence})
    return service


def first_frame_with_detection(service, clip, limit=200):
    """A frame this model returns something on, and the frame itself."""
    model = service._get_model()
    capture = cv2.VideoCapture(str(clip))
    total = int(capture.get(cv2.CAP_PROP_FRAME_COUNT)) or 1
    for index in range(0, min(total, limit), 4):
        capture.set(cv2.CAP_PROP_POS_FRAMES, index)
        ok, frame = capture.read()
        if not ok:
            break
        found = model(frame, verbose=False, conf=service._confidence)[0]
        if len(found.boxes):
            capture.release()
            box = max(found.boxes, key=lambda b: float(b.conf[0]))
            return frame, [float(v) for v in box.xyxy[0]], float(box.conf[0])
    capture.release()
    return None, None, None


vehicle_zone_manager.clear()
polygon_manager.clear()

# ------------------------------------------------------- 1 · nothing marked

print("--- 1 · nothing is watched until an area is marked\n")

service = fresh()

check("the weights load", service.model_loaded(), "no model")
note(f"default confidence floor {ITEM_CONFIDENCE}, inside share {INSIDE_SHARE}")

blank = np.full((480, 640, 3), 200, dtype=np.uint8)
_annotated, result = service.process(blank)

check("with no area marked the module says so and raises nothing",
      result.get("summary") == "No area marked" and not result.get("alert"),
      f"{result.get('summary')!r} alert={result.get('alert')}")

check("and does not report itself ready",
      not service.is_ready() and not service.is_configured())

# ---------------------------------------------------------- 2 · the geometry

print("\n--- 2 · inside raises, outside does not\n")

probe = fresh(confidence=0.25)   # the rule under test, not the weights
frame, box, conf = None, None, None
for clip in CLIPS:
    if clip.exists():
        frame, box, conf = first_frame_with_detection(probe, clip)
        if frame is not None:
            note(f"probe detection from {clip.name}: conf {conf:.2f} at "
                 f"({box[0]:.0f},{box[1]:.0f})-({box[2]:.0f},{box[3]:.0f})")
            break

if not check("a frame the model returns something on could be found — the "
             "geometry below needs a detection, whatever it is of",
             frame is not None):
    sys.exit(1)

height, width = frame.shape[:2]

# --- the whole frame is the area: the detection is unambiguously inside
probe = fresh(confidence=0.25)
probe.configure({"polygon": whole_frame(width, height),
                 "frame_width": width, "frame_height": height})

result = {}
for _ in range(CONFIRM_SIGHTINGS + 2):
    _annotated, result = probe.process(frame)

check("a vehicle inside the marked area raises the alarm",
      result.get("alert") is True,
      f"alert={result.get('alert')} inside={result.get('vehicles_inside')} "
      f"summary={result.get('summary')!r}")

check("and the summary names the area rather than the picture",
      result.get("summary") == "Forklift inside the restricted area",
      f"{result.get('summary')!r}")

check("and the alarm carries the exact words the operator was promised",
      result.get("spoken") == "Alert! Forklift is inside the restricted zone",
      f"{result.get('spoken')!r}")

check("the zone is drawn back in alarm tone, so the picture agrees with the "
      "sentence",
      any(z.get("tone") == "danger" for z in result.get("zones", [])),
      f"{result.get('zones')}")

# --- a small corner far from the detection: the same frame must be clear
probe = fresh(confidence=0.25)
probe.configure({"polygon": corner(width, height),
                 "frame_width": width, "frame_height": height})

result = {}
for _ in range(CONFIRM_SIGHTINGS + 2):
    _annotated, result = probe.process(frame)

check("the same vehicle outside the marked area raises nothing",
      result.get("alert") is False and result.get("vehicles_inside") == 0,
      f"alert={result.get('alert')} inside={result.get('vehicles_inside')}")

check("and the area is reported clear rather than unwatched",
      result.get("summary") == "Area clear",
      f"{result.get('summary')!r}")

check("and the marked area is drawn as clear, not as a standing warning",
      all(z.get("tone") == "ok" for z in result.get("zones", [])),
      f"{[z.get('tone') for z in result.get('zones', [])]} — amber over an "
      f"empty floor means the page never looks clear")

# --------------------------- 2b · an alarm always shows what raised it

print("\n--- 2b · the alarm is never a red banner over nothing\n")

held = fresh(confidence=0.25)
held.configure({"polygon": whole_frame(width, height),
                "frame_width": width, "frame_height": height})
clock = {"t": 5000.0}
held._now = lambda: clock["t"]

for _ in range(CONFIRM_SIGHTINGS + 2):
    _annotated, result = held.process(frame)
    clock["t"] += 0.2

check("with a vehicle in the area the alarm is up and boxed",
      result.get("alert") is True and len(result.get("regions", [])) >= 1,
      f"alert={result.get('alert')} regions={len(result.get('regions', []))}")

# The same readable picture, with nothing in it the module will now accept —
# the floor is raised past every detection rather than the picture degraded,
# which would trip the legibility gate and drop the alarm for a different
# reason entirely. This is the hold, and only the hold.
held._confidence = 0.999
clock["t"] += 0.2
_annotated, held_result = held.process(frame)

if held_result.get("alert"):
    check("while the alarm is held past the last sighting it still shows the "
          "sighting that raised it, rather than a red banner over nothing",
          len(held_result.get("regions", [])) >= 1,
          "alert with no region — an operator cannot tell a real forklift "
          "from this model deciding a pallet is one")

    check("and says the box is a moment old rather than claiming it is now",
          any("moment ago" in (r.get("label") or "")
              for r in held_result.get("regions", [])),
          f"{[r.get('label') for r in held_result.get('regions', [])]}")
else:
    note("the alarm dropped immediately on this picture, so the hold is not "
         "exercised here")

vehicle_zone_manager.clear()

# ------------------------------------------------------ 3 · one frame is not enough

print("\n--- 3 · one frame cannot raise an alarm\n")

probe = fresh(confidence=0.25)
probe.configure({"polygon": whole_frame(width, height),
                 "frame_width": width, "frame_height": height})

_annotated, first = probe.process(frame)

check(f"the first frame does not alarm, however sure it is — {CONFIRM_SIGHTINGS} "
      f"agreeing sightings are the bar",
      first.get("alert") is False,
      f"alert on sighting 1: {first.get('summary')!r}")

# A single uploaded photograph is a different question and answers itself.
still = fresh(confidence=0.25)
still.configure({"polygon": whole_frame(width, height),
                 "frame_width": width, "frame_height": height})
still.single_frame = True
_annotated, shot = still.process(frame)

check("but a single uploaded photograph answers what it shows, having no "
      "second frame to wait for",
      shot.get("alert") is True,
      f"{shot.get('summary')!r}")

# ------------------------------------------------- 4 · unreadable is not clear

print("\n--- 4 · a picture it cannot read is never 'Area clear'\n")

dark = fresh(confidence=0.25)
dark.configure({"polygon": whole_frame(640, 480),
                "frame_width": 640, "frame_height": 480})

_annotated, night = dark.process(np.full((480, 640, 3), 3, dtype=np.uint8))

check("a picture too dark to read is reported unverified, not clear",
      night.get("status") == "unverified" and not night.get("alert"),
      f"status={night.get('status')!r} summary={night.get('summary')!r}")

check("and says why, in words",
      bool(night.get("unreadable_reason")),
      f"{night.get('unreadable_reason')!r}")

check("readable is reported as false, not merely absent",
      night.get("readable") is False,
      f"{night.get('readable')!r}")

# ------------------- 4c · the whole alarm path, at a mismatched resolution

print("\n--- 4c · the alarm fires on a frame smaller than the drawing\n")

# 4b proves the arithmetic. This proves the product: the operator marks on the
# freeze-frame at its native size, the browser then sends smaller frames
# because the link will not carry more, and the alarm has to survive that. It
# is the reported failure end to end rather than one helper in isolation.

# Resized proportionally. Squashing a 4:3 frame into 16:9 loses the vehicle
# entirely, which is a fact about distorting the picture and not about the
# geometry under test — the first version of this probe did exactly that and
# failed for the wrong reason.
small_w = 512
small_h = int(round(frame.shape[0] * small_w / frame.shape[1]))
small = cv2.resize(frame, (small_w, small_h))

# The freeze-frame the operator marked on, at 2.5x the size frames arrive at.
drawn_w, drawn_h = small_w * 5 // 2, small_h * 5 // 2
scale_x, scale_y = drawn_w / small_w, drawn_h / small_h

drawn = [
    {"x": 0, "y": 0},
    {"x": int((small_w - 1) * scale_x), "y": 0},
    {"x": int((small_w - 1) * scale_x), "y": int((small_h - 1) * scale_y)},
    {"x": 0, "y": int((small_h - 1) * scale_y)},
]

mismatched = fresh(confidence=0.25)
mismatched.configure({"polygon": drawn,
                      "frame_width": drawn_w, "frame_height": drawn_h})

note(f"area drawn at {drawn_w}x{drawn_h}, frames arriving at "
     f"{small.shape[1]}x{small.shape[0]}")

result = {}
for _ in range(CONFIRM_SIGHTINGS + 2):
    _annotated, result = mismatched.process(small)

check("a vehicle inside the marked area still raises the alarm when the frame "
      "is smaller than the picture the area was drawn on",
      result.get("alert") is True,
      f"alert={result.get('alert')} inside={result.get('vehicles_inside')} "
      f"summary={result.get('summary')!r}")

check("the model still finds the vehicle at the smaller size — otherwise "
      "nothing below is being measured",
      (result.get("vehicles_total") or 0) > 0,
      f"vehicles_total={result.get('vehicles_total')}")

check("and it is not reported as being outside the area",
      (result.get("vehicles_total") or 0) > 0
      and not any("outside the area" in (r.get("label") or "")
                  for r in result.get("regions", [])),
      f"{[r.get('label') for r in result.get('regions', [])]}")

vehicle_zone_manager.clear()

# ------------------------- 4b · the area is compared in the frame's own pixels

print("\n--- 4b · a frame smaller than the drawing still lands on the area\n")

# The defect this is for: an area drawn on a 640-wide freeze-frame, and frames
# arriving 512 wide because the link could not sustain 640 — the browser steps
# between 640, 576 and 512 mid-session. Compared unscaled, a forklift standing
# squarely on the marked floor reported "outside the area", and the alarm only
# arrived once it had wandered far enough to overlap where the unscaled area
# happened to land. Read as lag; it was geometry.

# Drawn on a 1280x720 freeze-frame; frames arrive 512x288, which is what the
# browser sends when the link will not carry more. Scale 0.4.
vehicle_zone_manager.clear()
vehicle_zone_manager.save(
    [{"x": 200, "y": 200}, {"x": 600, "y": 200},
     {"x": 600, "y": 500}, {"x": 200, "y": 500}],
    source="probe", frame_width=1280, frame_height=720,
)

# In the frame's own pixels this box sits squarely inside that area — the area
# scales to x 80-240, y 80-200 at 512x288. Unscaled, the area is still at
# y 200-500 and the box does not touch it at all: share 0.00, "outside the
# area", which is exactly what a forklift on the marked floor reported.
probe_box = (100, 100, 220, 190)

unscaled = vehicle_zone_manager.overlap_percentage(*probe_box)
scaled = vehicle_zone_manager.overlap_percentage(
    *probe_box, frame_width=512, frame_height=288)

note(f"area drawn at 1280x720, box measured on 512x288 — "
     f"unscaled {unscaled:.2f}, scaled {scaled:.2f}")

check("the two coordinate spaces really do disagree, so this probe is "
      "measuring the defect rather than restating a pass",
      unscaled < INSIDE_SHARE <= scaled,
      f"unscaled {unscaled:.2f}, scaled {scaled:.2f} — if these agree the "
      f"probe cannot see the bug it is for")

check("a box inside the marked area reads as inside it, even when the frame "
      "is smaller than the picture the area was drawn on",
      scaled >= 0.99,
      f"share {scaled:.3f}")

check("and the module asks for it in the frame's own pixels",
      VehicleZoneService()._share_inside(probe_box, 512, 288) >= 0.99,
      "the service is still comparing across coordinate spaces")

vehicle_zone_manager.clear()

# ------------------------------------------------ 5 · the two areas are separate

print("\n--- 5 · marking one area does not re-aim the other\n")

vehicle_zone_manager.clear()
polygon_manager.clear()

people = fresh()
people_points = [{"x": 0, "y": 0}, {"x": 192, "y": 0},
                 {"x": 192, "y": 144}, {"x": 0, "y": 144}]
vehicle_points = [{"x": 384, "y": 288}, {"x": 608, "y": 288},
                  {"x": 608, "y": 456}, {"x": 384, "y": 456}]

polygon_manager.save(people_points, source="probe", frame_width=640, frame_height=480)
people.configure({"polygon": vehicle_points, "frame_width": 640, "frame_height": 480})

check("the vehicle area is stored somewhere of its own",
      vehicle_zone_manager.path != polygon_manager.path,
      f"{vehicle_zone_manager.path} and {polygon_manager.path}")

check("marking the vehicle area leaves the people area exactly where it was",
      [[int(p["x"]), int(p["y"])] for p in polygon_manager.as_points()]
      == [[0, 0], [192, 0], [192, 144], [0, 144]],
      f"{polygon_manager.as_points()}")

check("and the two areas are genuinely different shapes",
      polygon_manager.as_points() != vehicle_zone_manager.as_points(),
      "both areas read back the same points")

# ----------------------------------- 5b · a near miss is not an all-clear

print("\n--- 5b · the screen has two answers about the floor, and no third\n")

# The floor set high enough that the probe detection cannot clear it, but not
# so high that the model stops returning it. This is the exact shape of the
# defect an operator hit: a forklift in the marked area, and a page saying the
# area was clear.
near = fresh(confidence=min(0.95, conf + 0.10))
near.configure({"polygon": whole_frame(width, height),
                "frame_width": width, "frame_height": height})

result = {}
for _ in range(CONFIRM_SIGHTINGS + 2):
    _annotated, result = near.process(frame)

note(f"detection scores {conf:.2f}; alarm setting {near._confidence:.2f}; "
     f"watch floor {WATCH_CONFIDENCE}")

check("a detection under the alarm setting raises nothing, which is the "
      "setting doing its job",
      result.get("alert") is False,
      f"alert={result.get('alert')}")

check("but it is counted rather than discarded",
      result.get("vehicles_watching", 0) >= 1,
      f"watching={result.get('vehicles_watching')}")

check("the operator is told the area is clear, because as far as the alarm "
      "setting is concerned it is",
      result.get("summary") == "Area clear",
      f"{result.get('summary')!r}")

check("nothing under the setting is drawn, so the picture does not argue "
      "with the sentence",
      not result.get("regions"),
      f"{[r.get('label') for r in result.get('regions', [])]}")

check("but what was half-seen is still in the payload for whoever is tuning "
      "the setting",
      (result.get("vehicles_watching") or 0) >= 1
      and result.get("watching_confidence") is not None,
      f"watching={result.get('vehicles_watching')} "
      f"at {result.get('watching_confidence')}")

# ------------------------------------------------------- 6 · what it claims

print("\n--- 6 · the module does not claim more than the weights can do\n")

# Every sentence this module can put on the screen, swept rather than listed
# from memory: the two answers, plus the two that are the absence of an answer
# rather than a third one — nothing marked, and a picture nobody can read.
ALLOWED = {
    "Forklift inside the restricted area",
    "Area clear",
    "No area marked",
}

seen_summaries = set()

sweep = fresh(confidence=0.25)
sweep.configure({"polygon": whole_frame(width, height),
                 "frame_width": width, "frame_height": height})

for picture in (frame, np.full((480, 640, 3), 3, dtype=np.uint8),
                np.full((480, 640, 3), 200, dtype=np.uint8)):
    for _ in range(CONFIRM_SIGHTINGS + 2):
        _annotated, swept = sweep.process(picture)
    seen_summaries.add(swept.get("summary"))

high = fresh(confidence=0.95)
high.configure({"polygon": whole_frame(width, height),
                "frame_width": width, "frame_height": height})
for _ in range(CONFIRM_SIGHTINGS + 2):
    _annotated, swept = high.process(frame)
seen_summaries.add(swept.get("summary"))

unreadable = {s for s in seen_summaries if s not in ALLOWED}

note("summaries produced: " + " · ".join(sorted(str(x) for x in seen_summaries)))

check("every sentence about the floor is one of the two answers",
      not (unreadable - {u for u in unreadable if u and "check" in u.lower()}),
      f"unexpected: {sorted(unreadable)}")

check("and a picture nobody can read still refuses to say the area is clear, "
      "which is the absence of an answer rather than a third one",
      any(u and "check" in u.lower() for u in unreadable),
      f"{sorted(seen_summaries)}")

vehicle_zone_manager.clear()

config = fresh().get_config()

check("the configuration names the one class these weights have",
      config.get("classes") == ["forklift"],
      f"{config.get('classes')!r}")

check("and publishes the confidence floor rather than hiding it",
      config.get("confidence") == ITEM_CONFIDENCE,
      f"{config.get('confidence')!r}")

check("the alarm floor is under what a real forklift scores on this site — "
      "a floor above that is the silent miss this number has already caused "
      "once",
      ITEM_CONFIDENCE <= 0.76,
      f"floor {ITEM_CONFIDENCE}, forklifts measured at 0.76-0.84")

check("and above the strongest thing measured that was not a forklift",
      ITEM_CONFIDENCE > 0.41,
      f"floor {ITEM_CONFIDENCE}, pallet racking measured at 0.41")

check("the watch floor is below the alarm floor, so there is a band to read",
      WATCH_CONFIDENCE < ITEM_CONFIDENCE,
      f"watch {WATCH_CONFIDENCE}, alarm {ITEM_CONFIDENCE}")

# Both directions, not both phrasings. A note that only warns about false
# alarms invites raising the floor until a forklift can stand in the area
# unreported, which is the first way this number was got wrong; one that only
# warns about misses invites the second.
note_text = (config.get("confidence_note") or "").lower()

check("the note says what lowering the floor costs",
      any(w in note_text for w in ("false alarm", "pallet", "qualify")),
      f"{config.get('confidence_note')!r}")

check("and what raising it costs, which is the failure that is silent",
      any(w in note_text for w in ("unreported", "all-clear", "missed", "lost")),
      f"{config.get('confidence_note')!r}")

check("and it quotes what was measured rather than asserting a preference",
      any(n in note_text for n in ("0.76", "0.41", "65%")),
      f"{config.get('confidence_note')!r}")

vehicle_zone_manager.clear()
polygon_manager.clear()

print(f"\n{'All vehicle zone checks passed.' if failures == 0 else str(failures) + ' FAILED'}")
sys.exit(1 if failures else 0)
