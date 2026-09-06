"""
A doorway sighted too rarely to settle says so, instead of "not seen yet".

Phase 4 made a door's first belief something it has to earn: three sightings of
the same state inside a window, two to one, and 0.8s elapsed. That is the right
bar and it fixed two blocking defects. What it left behind is what the screen
says while the bar is unmet — `state` stays None, which is also what a doorway
marked one second ago looks like, so a box the model has been finding in 2.7%
of frames for a minute and a box nobody has reached yet were shown with the
same three words, and those words invite the one thing that does not help.

## Why this stopped being measurable on the clip, which is worth knowing

It was written against the factory clip's own worst doorway, which used to go
unsettled for 44s and was duly flagged from 37.8s. Two later fixes — asking the
question again on frames where a doorway was not sighted, and letting the
window follow the delivered frame rate — settle that same doorway at 28.6s,
before the starved bar is reached at all. That is the fixes working: most of
what looked like starvation was evidence collected and never re-read.

So starvation is now rare rather than common, and a test that waits for the
clip to produce one would be asserting nothing. It is driven directly here
instead: a sighting every five seconds against a 2.5s window, where each one
ages out before the next arrives and three can never be in hand at once. That
is the case that survives both fixes, and it is the case this label is for.

Run from backend/:

    PYTHONPATH=$PWD .venv/bin/python ../tests/verify_door_starvation.py
"""
import sys
from pathlib import Path

import cv2

from app.modules.door.service import DoorService
from app.vision.door_regions import door_regions
from app.vision.door_state import (
    MIN_CONFIRM_SIGHTINGS,
    STARVED_AFTER_SECONDS,
    STATE_WINDOW_SECONDS,
    observe,
    settle,
    starved,
)

HERE = Path(__file__).resolve().parent
CLIP = HERE.parent / "backend" / "storage" / "uploads" / "door_test.mp4"

SOURCE = "verify-door-starvation"

failures = 0


def check(name: str, ok: bool, detail: str = "") -> bool:
    global failures
    print(("PASS  " if ok else "FAIL  ") + name + (f"  [{detail}]" if not ok and detail else ""))
    if not ok:
        failures += 1
    return ok


def note(text: str) -> None:
    print(f"      {text}")


# --------------------------------------------------- 1 · the starved case

print("--- 1 · sightings too far apart to ever be three at once\n")

#: Comfortably wider than the window, so each sighting has aged out before the
#: next arrives. This is what the detector does on a doorway it can barely see.
APART = 5.0

state: dict = {}
first_flagged = None
moment = 0.0
sightings = 0

# Sixty seconds of it, stepping every 0.5s so the frames between sightings are
# real frames — that is where `settle` and the starved clock are read.
while moment <= 60.0:
    if moment % APART < 1e-9:
        observe(state, "open", moment)
        sightings += 1
    else:
        settle(state, moment)

    if starved(state, moment) and first_flagged is None:
        first_flagged = moment

    moment = round(moment + 0.5, 6)

note(f"{sightings} sightings, {APART}s apart, window {STATE_WINDOW_SECONDS}s, "
     f"bar {STARVED_AFTER_SECONDS}s")

check("a doorway whose sightings never overlap never confirms, which is the "
      "bar doing its job",
      state.get("state") is None,
      f"settled on {state.get('state')!r}")

check("and it stops claiming nobody has looked",
      first_flagged is not None,
      "never flagged, so the row reads 'not seen yet' for as long as it is watched")

if first_flagged is not None:
    check("after the full bar, so a doorway that is merely slow is never "
          "called starved",
          first_flagged >= STARVED_AFTER_SECONDS,
          f"flagged at {first_flagged}s, bar {STARVED_AFTER_SECONDS}s")
    note(f"first called starved at {first_flagged}s")

# Nothing seen at all is a different thing and must stay untouched.
untouched: dict = {}
for moment in (0.5, 1.0, 20.0, 60.0):
    settle(untouched, moment)

check("a doorway nothing has ever been seen at is left alone — 'not seen yet' "
      "is true until something is",
      not starved(untouched, 60.0) and untouched.get("state") is None,
      f"starved={starved(untouched, 60.0)}, state={untouched.get('state')!r}")

# --------------------------------------------------- 2 · what it says

print("\n--- 2 · the words the operator reads\n")

service = DoorService()

rows = service._regions(
    [
        {
            "id": 1, "name": "Side exit", "box": (0.0, 0.0, 10.0, 10.0),
            "state": None, "conf": 0.0, "since": 0.0, "last_seen": 0.0,
            "seen_now": False, "stale": True, "calibrated": True,
            "open_seconds": 3.0, "crowded": False, "starved": True,
        },
        {
            "id": 2, "name": "Back door", "box": (0.0, 0.0, 10.0, 10.0),
            "state": None, "conf": 0.0, "since": 0.0, "last_seen": 0.0,
            "seen_now": False, "stale": True, "calibrated": True,
            "open_seconds": 3.0, "crowded": False, "starved": False,
        },
    ],
    now=100.0,
    width=100,
    height=100,
)

labels = {row["label"]: row["tone"] for row in rows}
for label, tone in labels.items():
    note(f"{label!r} · {tone}")

starved_label = next((l for l in labels if "Side exit" in l), "")
unseen_label = next((l for l in labels if "Back door" in l), "")

check("a starved doorway says it is seen too rarely to judge",
      "too rarely" in starved_label,
      f"{starved_label!r}")

check("and is not painted like a doorway nobody has reached yet",
      labels.get(starved_label) != labels.get(unseen_label),
      f"both {labels.get(starved_label)!r}")

check("a doorway nothing has been seen at still says 'not seen yet'",
      "not seen yet" in unseen_label,
      f"{unseen_label!r}")

check("neither is painted like a finding — no danger tone on either",
      labels.get(starved_label) != "danger" and labels.get(unseen_label) != "danger",
      f"{labels}")

# --------------------------------------------------- 3 · on the real clip

print("\n--- 3 · and the clip still settles what it can\n")

if check("the operator's clip is present", CLIP.exists(), str(CLIP)):
    capture = cv2.VideoCapture(str(CLIP))
    source_fps = capture.get(cv2.CAP_PROP_FPS) or 29.0
    width = capture.get(cv2.CAP_PROP_FRAME_WIDTH)
    height = capture.get(cv2.CAP_PROP_FRAME_HEIGHT)
    total = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))

    for existing in list(door_regions.for_source(SOURCE)):
        door_regions.remove(SOURCE, existing["id"])
    door_regions.add(SOURCE, (568 / width, 199 / height, 691 / width, 380 / height),
                     name="Reliable doorway")
    door_regions.add(SOURCE, (502 / width, 203 / height, 587 / width, 407 / height),
                     name="Rarely seen doorway")

    live = DoorService()
    live._source = lambda: SOURCE
    clock = {"t": 1_000_000.0}
    live._now = lambda: clock["t"]

    FPS = 5.0
    step = max(1, round(source_fps / FPS))
    settled: dict[str, tuple[float, str]] = {}
    ever_starved: set[str] = set()
    index = 0
    result: dict = {}

    for number in range(int(FPS * 45)):
        capture.set(cv2.CAP_PROP_POS_FRAMES, index % total)
        ok, frame = capture.read()
        if not ok:
            index = 0
            continue
        _annotated, result = live.process(frame)
        index += step
        clock["t"] += 1.0 / FPS
        for row in result.get("detections", []):
            if row.get("state") is not None and row["name"] not in settled:
                settled[row["name"]] = (number / FPS, row["state"])
            if row.get("starved"):
                ever_starved.add(row["name"])

    capture.release()
    for existing in list(door_regions.for_source(SOURCE)):
        door_regions.remove(SOURCE, existing["id"])

    for name, (when, what) in sorted(settled.items()):
        note(f"{name:<22} settled {what!r} at {when:.1f}s")
    if ever_starved:
        note(f"called starved at some point: {sorted(ever_starved)}")

    check("the well-seen doorway settles promptly",
          "Reliable doorway" in settled and settled["Reliable doorway"][0] <= 3.0,
          f"{settled.get('Reliable doorway')}")

    check("and the barely-seen one is either settled or explained — never "
          "left reading 'not seen yet' once it has been looked at",
          "Rarely seen doorway" in settled or "Rarely seen doorway" in ever_starved,
          "unsettled and unflagged for the whole run")

print(f"\n{'All door starvation checks passed.' if failures == 0 else str(failures) + ' FAILED'}")
sys.exit(1 if failures else 0)
