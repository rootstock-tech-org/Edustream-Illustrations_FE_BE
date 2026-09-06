"""
Several named zones, one camera — and the single-area contract kept intact.

The restricted zone grew from one anonymous polygon to a floor plan: several
zones per camera, each with a name the alert can say. What is checked below,
in order:

    1. the store — add, rename, remove, clear, per-camera isolation, the
       refusals unchanged, and the one-time migration of the old single file
    2. the legacy verb still means what it always meant, because six phase
       suites assert it: {"polygon": P} replaces everything, [] clears,
       degenerate shapes are refused with the same wording
    3. on real footage: people standing in named zones raise an alert that
       names the zone — "Alert! Person is in restricted zone {name}" — an
       empty zone beside them stays clear, and each occupied zone is its own
       event
    4. the occupancy clock: it grows while somebody stands there, survives a
       sub-grace detection gap, restarts after a real absence, treats an
       unreadable stretch as absence, and does not exist for a photograph
    5. a picture too dark to read is never "All zones clear"

Run from backend/:

    PYTHONPATH=$PWD .venv/bin/python ../tests/verify_restricted_zones.py
"""
import json
import sys
import tempfile
from pathlib import Path

import cv2
import numpy as np

import app.vision.zone_store as zone_store_module
from app.vision.zone_store import ZoneStore, zone_store
from app.modules.restricted_zone.service import service as zone_service

HERE = Path(__file__).resolve().parent
CLIP = HERE.parent / "backend" / "storage" / "uploads" / "cctv_demo.webm"

SOURCE = "verify-zones-a"
OTHER = "verify-zones-b"

failures = 0


def check(name: str, ok: bool, detail: str = "") -> bool:
    global failures
    print(("PASS  " if ok else "FAIL  ") + name + (f"  [{detail}]" if not ok and detail else ""))
    if not ok:
        failures += 1
    return ok


def note(text: str) -> None:
    print(f"      {text}")


def square(x, y, side):
    return [
        {"x": x, "y": y}, {"x": x + side, "y": y},
        {"x": x + side, "y": y + side}, {"x": x, "y": y + side},
    ]


# ------------------------------------------------------------- 1 · the store

print("--- 1 · the store: named zones per camera\n")

for src in (SOURCE, OTHER):
    zone_store.clear(src)

a = zone_store.add(SOURCE, square(10, 10, 200), name="Loading bay",
                   frame_width=640, frame_height=480)
b = zone_store.add(SOURCE, square(300, 100, 150), name="Cage",
                   frame_width=640, frame_height=480)

check("two zones can be marked on one camera",
      len(zone_store.for_source(SOURCE)) == 2)

check("each keeps the name it was given",
      [z["name"] for z in zone_store.for_source(SOURCE)] == ["Loading bay", "Cage"])

try:
    zone_store.add(SOURCE, square(50, 50, 80), name="loading BAY",
                   frame_width=640, frame_height=480)
    check("a second zone cannot take a marked zone's name, however it is cased",
          False, "the duplicate was accepted")
except ValueError:
    check("a second zone cannot take a marked zone's name, however it is cased", True)

zone_store.rename(SOURCE, b["id"], "Electrical cage")
check("a zone can be renamed",
      any(z["name"] == "Electrical cage" for z in zone_store.for_source(SOURCE)))

check("another camera sees none of it — zones belong to the camera they "
      "were drawn on",
      zone_store.for_source(OTHER) == [])

for label, bad in (
    ("three identical corners", [{"x": 1, "y": 1}] * 3),
    ("corners in a straight line", [{"x": 1, "y": 1}, {"x": 2, "y": 2}, {"x": 3, "y": 3}]),
    ("a corner outside the picture", square(600, 400, 200)),
    ("a NaN corner", [{"x": float("nan"), "y": 1}, {"x": 100, "y": 1}, {"x": 50, "y": 100}]),
):
    try:
        zone_store.add(SOURCE, bad, frame_width=640, frame_height=480)
        check(f"a zone with {label} is refused", False, "it was accepted")
    except ValueError:
        check(f"a zone with {label} is refused", True)

check("and the refusals did not disturb what was already marked",
      len(zone_store.for_source(SOURCE)) == 2)

removed = zone_store.remove(SOURCE, a["id"])
check("one zone can be removed without touching the other",
      removed and len(zone_store.for_source(SOURCE)) == 1
      and zone_store.for_source(SOURCE)[0]["name"] == "Electrical cage")

zone_store.clear(SOURCE)
check("clear empties the camera", zone_store.for_source(SOURCE) == [])

# Migration: the single-area file becomes zone 1, once.
with tempfile.TemporaryDirectory() as tmp:
    tmp = Path(tmp)
    legacy = tmp / "restricted_area.json"
    legacy.write_text(json.dumps({
        "polygon": [{"x": 20, "y": 20}, {"x": 300, "y": 20},
                    {"x": 300, "y": 300}, {"x": 20, "y": 300}],
        "source": "old-camera", "frame_width": 640, "frame_height": 480,
    }))

    kept = zone_store_module.POLYGON_FILE
    zone_store_module.POLYGON_FILE = legacy
    try:
        fresh = ZoneStore(path=tmp / "zones.json")
        migrated = fresh.for_source("old-camera")
        check("an area drawn before zones had names is migrated as zone 1 of "
              "its camera",
              len(migrated) == 1 and migrated[0]["id"] == 1
              and migrated[0]["name"] == ""
              and len(migrated[0]["points"]) == 4,
              f"{migrated}")

        fresh.clear("old-camera")
        again = ZoneStore(path=tmp / "zones.json")
        check("and only once — deleting it does not resurrect it on restart",
              again.for_source("old-camera") == [],
              "the migration ran a second time")
    finally:
        zone_store_module.POLYGON_FILE = kept

# ------------------------------------------------- 2 · the legacy verb holds

print("\n--- 2 · the single-area verb still means what it always meant\n")

service = zone_service
service._source = lambda: SOURCE

zone_store.add(SOURCE, square(10, 10, 100), name="One",
               frame_width=640, frame_height=480)
zone_store.add(SOURCE, square(200, 200, 100), name="Two",
               frame_width=640, frame_height=480)

out = service.configure({
    "polygon": square(50, 50, 300), "frame_width": 640, "frame_height": 480,
})
config = service.get_config()

check("POST {polygon} replaces every zone with exactly that one",
      out["points"] == 4 and len(config["zones"]) == 1
      and config["zones"][0]["name"] == "",
      f"{len(config['zones'])} zones after the legacy save")

check("and GET still answers the single-polygon shape with that area",
      len(config["polygon"]) == 4,
      f"polygon: {config['polygon']}")

try:
    service.configure({
        "polygon": [{"x": 1, "y": 1}] * 3,
        "frame_width": 640, "frame_height": 480,
    })
    check("degenerate polygons are refused exactly as before", False, "accepted")
except ValueError as exc:
    check("degenerate polygons are refused exactly as before",
          "3 different corners" in str(exc), str(exc))

service.configure({"polygon": []})
check("POST {polygon: []} clears the camera and the module stops being ready",
      service.get_config()["zones"] == [] and not service.is_configured())

# ------------------------------------------------- 3 · on the real footage

print("\n--- 3 · people in named zones, on the operator's own footage\n")

if not check("the CCTV clip is present", CLIP.exists(), str(CLIP)):
    sys.exit(1)

capture = cv2.VideoCapture(str(CLIP))
_ok, frame = capture.read()
capture.release()
height, width = frame.shape[:2]

# Where the people actually are, asked of the detector itself rather than
# hardcoded — so this section keeps working if the clip is ever re-encoded.
from app.vision.detector import detector

_a, scout = detector.analyse(frame, zones=[])
people = scout["people"]
note(f"the detector finds {len(people)} people in frame 0")

if not check("there are people to stand in zones", len(people) >= 1):
    sys.exit(1)

# A zone drawn around the first person's feet, named; and an empty zone in a
# corner of the picture nobody's feet reach.
x1, y1, x2, y2 = people[0]["box"]
feet = [
    {"x": max(0, x1 - 20), "y": (y1 + y2) // 2},
    {"x": min(width - 1, x2 + 20), "y": (y1 + y2) // 2},
    {"x": min(width - 1, x2 + 20), "y": min(height - 1, y2 + 20)},
    {"x": max(0, x1 - 20), "y": min(height - 1, y2 + 20)},
]

lowest = max(p["box"][3] for p in people)
clear_of_people = [
    {"x": 2, "y": 2}, {"x": 60, "y": 2}, {"x": 60, "y": 40}, {"x": 2, "y": 40},
] if lowest > 60 else None

service.configure({
    "zone": {"add": {"polygon": feet, "name": "Server room floor"}},
    "frame_width": width, "frame_height": height,
})
if clear_of_people:
    service.configure({
        "zone": {"add": {"polygon": clear_of_people, "name": "Store corner"}},
        "frame_width": width, "frame_height": height,
    })

_annotated, result = service.process(frame)

note(f"summary: {result['summary']!r}")
note(f"spoken : {result['spoken']!r}")
note(f"zones  : {[(z['name'], z['people_inside'], z['tone']) for z in result['zones']]}")

by_name = {z["name"]: z for z in result["zones"]}

check("somebody standing in a named zone raises the alert",
      result["alert"] and by_name["Server room floor"]["people_inside"] >= 1,
      f"alert={result['alert']}, inside={by_name['Server room floor']['people_inside']}")

check("the alert names the zone, in the promised words",
      result["spoken"] is not None
      and result["spoken"].startswith("Alert! ")
      and "restricted zone" in result["spoken"]
      and "Server room floor" in result["spoken"],
      f"{result['spoken']!r}")

if by_name["Server room floor"]["people_inside"] == 1 and len(
    [z for z in result["zones"] if z["people_inside"] > 0]
) == 1:
    check("one person, one zone: the sentence is exactly the requested one",
          result["spoken"] == "Alert! Person is in restricted zone Server room floor",
          f"{result['spoken']!r}")

if clear_of_people:
    check("the empty zone beside them stays clear and is not painted red",
          by_name["Store corner"]["people_inside"] == 0
          and by_name["Store corner"]["tone"] != "danger",
          f"{by_name['Store corner']}")

events = service.events(result)
note(f"events : {[(e['key'], e['summary']) for e in events]}")

check("each occupied zone is its own event, keyed on the zone and naming it",
      len(events) >= 1
      and all(e["key"].startswith("intrusion-zone-") for e in events)
      and any("Server room floor" in e["summary"] for e in events),
      f"{events}")

check("no event is raised about the empty zone",
      not any("Store corner" in e["summary"] for e in events),
      f"{events}")

# ----------------------------------------- 4 · how long somebody was inside

print("\n--- 4 · the zone's clock: how long somebody has been in it\n")

# Driven with a fake clock over real frames. The clock must grow while the
# person stands there, survive a detection gap shorter than OCCUPIED_GRACE,
# start over after a real absence, treat an unreadable stretch as absence
# rather than presence, and never exist for a single photograph.

from app.modules.restricted_zone.service import OCCUPIED_GRACE

service.configure({"polygon": []})
service.configure({
    "zone": {"add": {"polygon": feet, "name": "Hold point"}},
    "frame_width": width, "frame_height": height,
})

# A frame where the same zone is empty, found rather than assumed: the clip
# is people moving about, so some frame has nobody at this spot.
hold_zone = service._zones_for(width, height)
empty_frame = None
capture = cv2.VideoCapture(str(CLIP))
total = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
for number in range(0, total, 10):
    capture.set(cv2.CAP_PROP_POS_FRAMES, number)
    ok, candidate = capture.read()
    if not ok:
        continue
    _a, probe = detector.analyse(candidate, zones=hold_zone)
    if probe["zones"][0]["people_inside"] == 0:
        empty_frame = candidate
        note(f"frame {number} leaves the zone empty")
        break
capture.release()

if check("the clip has a frame where the zone is empty", empty_frame is not None,
         "no such frame — the clock cannot be exercised"):
    clock = {"t": 10_000_000.0}
    service._now = lambda: clock["t"]
    service._occupied = {}

    def run(picture, seconds):
        """Process `picture` once a second for `seconds`, return the last result."""
        last = None
        for _ in range(int(seconds)):
            _a, last = service.process(picture)
            clock["t"] += 1.0
        return last

    held = run(frame, 10)
    zone_row = held["zones"][0]

    check("the clock grows while somebody stands in the zone",
          zone_row["occupied_seconds"] is not None
          and 8.0 <= zone_row["occupied_seconds"] <= 10.0,
          f"occupied_seconds={zone_row['occupied_seconds']} after 10s inside")

    # One second of the detector losing them — under the grace — then back.
    run(empty_frame, 1)
    resumed = run(frame, 1)

    check("a detection gap shorter than the grace does not restart it",
          resumed["zones"][0]["occupied_seconds"] is not None
          and resumed["zones"][0]["occupied_seconds"] >= 11.0,
          f"occupied_seconds={resumed['zones'][0]['occupied_seconds']} "
          f"after a 1s gap in a 12s stay")

    # A real absence, longer than the grace: the next stay is a new stretch.
    run(empty_frame, int(OCCUPIED_GRACE) + 3)
    fresh = run(frame, 2)

    check("after a real absence the next stay starts from zero",
          fresh["zones"][0]["occupied_seconds"] is not None
          and fresh["zones"][0]["occupied_seconds"] <= 2.5,
          f"occupied_seconds={fresh['zones'][0]['occupied_seconds']} "
          f"on a stay 2s old")

    check("and while the zone stood empty, no duration was reported",
          all(
              z["occupied_seconds"] is None
              for z in run(empty_frame, int(OCCUPIED_GRACE) + 3)["zones"]
          ),
          "an empty zone carried a duration")

    # An unreadable stretch is absence, not presence: the clock must neither
    # grow through it nor survive one longer than the grace.
    run(frame, 2)
    dark_frame = (frame * 0.06).astype(np.uint8)
    blind = run(dark_frame, int(OCCUPIED_GRACE) + 3)
    after_blind = run(frame, 1)

    check("an unreadable stretch does not count as time inside",
          blind["zones"][0]["occupied_seconds"] is None
          and after_blind["zones"][0]["occupied_seconds"] is not None
          and after_blind["zones"][0]["occupied_seconds"] <= 1.5,
          f"during={blind['zones'][0]['occupied_seconds']} "
          f"after={after_blind['zones'][0]['occupied_seconds']}")

    # One photograph has no duration to measure.
    photo_copy = service.for_session()
    photo_copy.single_frame = True
    photo_copy._source = service._source
    _a, photo_result = photo_copy.process(frame)

    check("a checked photo reports no duration — one picture has none",
          all(z["occupied_seconds"] is None for z in photo_result["zones"]),
          f"{[z['occupied_seconds'] for z in photo_result['zones']]}")

    service._now = lambda: __import__("time").time()

# ------------------------------------------------- 5 · an unreadable picture

print("\n--- 5 · a dark picture is not a clear floor\n")

dark = (frame * 0.06).astype(np.uint8)
_annotated, unread = service.process(dark)

note(f"summary: {unread['summary']!r}, status {unread['status']!r}")

check("it does not report clear zones",
      unread["status"] != "clear" and "clear" not in str(unread["summary"]).lower(),
      f"{unread['summary']!r}")

check("and nobody in it is called safe — everyone is unverified",
      unread["people_unverified"] == unread["people_total"],
      f"{unread['people_unverified']} of {unread['people_total']}")

# ------------------------------------------------------------------ tidy up

zone_store.clear(SOURCE)
zone_store.clear(OTHER)

print(f"\n{'All restricted-zone checks passed.' if failures == 0 else str(failures) + ' FAILED'}")
sys.exit(1 if failures else 0)
