"""
A door settles on a slow link, and settles exactly as before on a fast one.

Two defects, one measurement.

**Confirmation was only ever re-read on frames where the doorway was sighted.**
The bar has three parts — enough sightings, a majority, and
STATE_CONFIRM_SECONDS elapsed since the first of them — and only the third is
about the passage of time. On the factory clip a doorway found in 2.7% of
frames got its three sightings at 27.6s, 27.8s and 28.0s: count met, majority
met, 0.4s short of the elapsed test at the moment the last one landed. Nothing
asked again until the next sighting 2.2s later, by which time the window had
started dropping the sightings that would have carried it.

**And the window was a minimum frame rate wearing a window's clothes.** Three
sightings inside 2.5s cannot happen below 1.2 sightings a second, and sighting
rate is delivered fps times the share of frames the model finds that doorway
in. The frontend aims at 10fps and calls 5 its floor; over a tunnel the
delivered rate is a ceiling rather than a promise.

What must not change is the fast case. At 3fps and above the window is
identical to the constant, so a healthy stream keeps exactly the behaviour and
exactly the numbers it has today — that is the first thing asserted below.

Run from backend/:

    PYTHONPATH=$PWD .venv/bin/python ../tests/verify_door_cadence.py
"""
import sys
from pathlib import Path

import cv2

from app.modules.door.service import DoorService
from app.vision.cadence import Cadence
from app.vision.door_regions import door_regions
from app.vision.door_state import (
    MIN_CONFIRM_SIGHTINGS,
    STATE_WINDOW_SECONDS,
    observe,
    settle,
)

HERE = Path(__file__).resolve().parent
CLIP = HERE.parent / "backend" / "storage" / "uploads" / "door_test.mp4"

BOXES = {
    "Reliable doorway": (568, 199, 691, 380),   # model finds it ~74% of frames
    "Starved doorway": (502, 203, 587, 407),    # model finds it ~2.7%
}

SOURCE = "verify-door-cadence"

failures = 0


def check(name: str, ok: bool, detail: str = "") -> bool:
    global failures
    print(("PASS  " if ok else "FAIL  ") + name + (f"  [{detail}]" if not ok and detail else ""))
    if not ok:
        failures += 1
    return ok


def note(text: str) -> None:
    print(f"      {text}")


# ------------------------------------------------------- the window itself

print("--- 1 · the window only ever widens, and only on a slow link\n")

for fps, expected in ((30, 2.5), (10, 2.5), (5, 2.5), (3, 2.5)):
    cadence = Cadence(STATE_WINDOW_SECONDS, MIN_CONFIRM_SIGHTINGS)
    moment = 0.0
    for _ in range(40):
        cadence.tick(moment)
        moment += 1.0 / fps
    check(f"at {fps}fps the window is the constant, unchanged",
          abs(cadence.window - expected) < 1e-9,
          f"{cadence.window:.2f}s, wanted {expected}s")

for fps in (2, 1):
    cadence = Cadence(STATE_WINDOW_SECONDS, MIN_CONFIRM_SIGHTINGS)
    moment = 0.0
    for _ in range(40):
        cadence.tick(moment)
        moment += 1.0 / fps
    holds = cadence.window * (fps / 1.0)
    check(f"at {fps}fps the window is wide enough to hold "
          f"{MIN_CONFIRM_SIGHTINGS} sightings at all",
          holds >= MIN_CONFIRM_SIGHTINGS,
          f"{cadence.window:.2f}s holds {holds:.1f} frames")
    note(f"{fps}fps → {cadence.window:.2f}s")

# ------------------------------------------- settling between sightings

print("\n--- 2 · evidence that meets the bar is not thrown away unread\n")

# Three sightings in 0.4s: count and majority met, elapsed test not yet.
# Nothing further is ever seen. The old code asked only on sighting frames,
# so this doorway stayed unconfirmed for ever.
state: dict = {}
for moment in (0.0, 0.2, 0.4):
    observe(state, "open", moment)

check("three quick sightings do not confirm on the spot — the bar still "
      "wants time to pass",
      state.get("state") is None,
      f"state {state.get('state')!r} at 0.4s")

for moment in (0.6, 0.8, 1.0, 1.2):
    settle(state, moment)

check("and a later frame with nothing seen finishes the argument",
      state.get("state") == "open",
      f"state {state.get('state')!r} after settling to 1.2s with no new sighting")

check("dated from when the state was first seen, not from when we were "
      "convinced",
      state.get("since") == 0.0,
      f"since {state.get('since')}")

# A doorway with too little evidence must still not confirm off settle alone.
thin: dict = {}
observe(thin, "open", 0.0)
observe(thin, "open", 0.2)
for moment in (0.4, 0.6, 0.8, 1.0, 1.2, 1.4):
    settle(thin, moment)

check("two sightings still confirm nothing, however long anybody waits — "
      "settling re-reads the evidence, it does not lower the bar",
      thin.get("state") is None,
      f"state {thin.get('state')!r} off {MIN_CONFIRM_SIGHTINGS - 1} sightings")

# ------------------------------------------------------ on the real clip

print("\n--- 3 · the operator's own clip, at the rate a tunnel delivers\n")

if not check("the clip is present", CLIP.exists(), str(CLIP)):
    sys.exit(1)


def run(fps: float, seconds: float) -> dict:
    """Drive the real service over the clip at a delivered rate."""
    capture = cv2.VideoCapture(str(CLIP))
    source_fps = capture.get(cv2.CAP_PROP_FPS) or 29.0
    width = capture.get(cv2.CAP_PROP_FRAME_WIDTH)
    height = capture.get(cv2.CAP_PROP_FRAME_HEIGHT)
    total = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))

    for existing in list(door_regions.for_source(SOURCE)):
        door_regions.remove(SOURCE, existing["id"])
    for name, (x1, y1, x2, y2) in BOXES.items():
        door_regions.add(
            SOURCE,
            (x1 / width, y1 / height, x2 / width, y2 / height),
            name=name,
        )

    service = DoorService()
    service._source = lambda: SOURCE
    clock = {"t": 1_000_000.0}
    service._now = lambda: clock["t"]

    step = max(1, round(source_fps / fps))
    settled: dict[str, tuple[float, str]] = {}
    index = 0

    for number in range(int(fps * seconds)):
        capture.set(cv2.CAP_PROP_POS_FRAMES, index % total)
        ok, frame = capture.read()
        if not ok:
            index = 0
            continue

        _annotated, result = service.process(frame)
        index += step
        elapsed = number / fps
        clock["t"] += 1.0 / fps

        for row in result.get("detections", []):
            if row.get("state") is not None and row["name"] not in settled:
                settled[row["name"]] = (elapsed, row["state"])

    capture.release()
    for existing in list(door_regions.for_source(SOURCE)):
        door_regions.remove(SOURCE, existing["id"])
    return settled


fast = run(10.0, 30.0)
slow = run(2.0, 60.0)

for name, when in sorted(fast.items()):
    note(f"10fps  {name:<18} settled {when[1]!r} at {when[0]:.1f}s")
for name, when in sorted(slow.items()):
    note(f" 2fps  {name:<18} settled {when[1]!r} at {when[0]:.1f}s")

check("a well-seen doorway still settles promptly at 10fps",
      "Reliable doorway" in fast and fast["Reliable doorway"][0] <= 3.0,
      f"{fast.get('Reliable doorway')}")

check("and still settles at 2fps, where the old window could not hold three "
      "sightings of it",
      "Reliable doorway" in slow,
      "never settled at 2fps")

check("both rates agree on what the doorway is, not merely on when",
      "Reliable doorway" in fast and "Reliable doorway" in slow
      and fast["Reliable doorway"][1] == slow["Reliable doorway"][1],
      f"{fast.get('Reliable doorway')} against {slow.get('Reliable doorway')}")

print(f"\n{'All door cadence checks passed.' if failures == 0 else str(failures) + ' FAILED'}")
sys.exit(1 if failures else 0)
