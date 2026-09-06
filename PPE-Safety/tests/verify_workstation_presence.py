"""
The workstation presence record: the graphs' data, held to the module's rules.

The page now draws when each station was manned, empty, or not watched, and
how the manned and idle totals compare. A graph is a claim per pixel, so the
record behind it is held to the same standard as every figure on the page:

    1. the recorder's own arithmetic — segments merge, a frame gap becomes
       "unwatched", the window prunes, and the three totals always sum to
       exactly the span of the record
    2. driven through process() on real footage with a fake clock: a person
       standing at a marked station writes "manned", the station emptying
       writes "empty" after the presence grace, a dark stretch writes
       "unwatched" rather than either
    3. a photograph writes nothing — one moment has no timeline
    4. what the page receives: relative seconds, newest edge zero, totals
       matching the segments it will draw

Run from backend/:

    PYTHONPATH=$PWD .venv/bin/python ../tests/verify_workstation_presence.py
"""
import sys
from pathlib import Path

import cv2
import numpy as np

from app.modules.workstation.service import (
    PRESENCE_GAP_SECONDS,
    PRESENCE_HISTORY_SECONDS,
    WorkstationService,
)
from app.vision.workstation_regions import workstation_regions

HERE = Path(__file__).resolve().parent
CLIP = HERE.parent / "backend" / "storage" / "uploads" / "cctv_demo.webm"

SOURCE = "verify-presence"

failures = 0


def check(name: str, ok: bool, detail: str = "") -> bool:
    global failures
    print(("PASS  " if ok else "FAIL  ") + name + (f"  [{detail}]" if not ok and detail else ""))
    if not ok:
        failures += 1
    return ok


def note(text: str) -> None:
    print(f"      {text}")


# ------------------------------------------------ 1 · the recorder's rules

print("--- 1 · the recorder's arithmetic\n")

service = WorkstationService()

for moment in range(0, 10):
    service._presence_note(1, 1000.0 + moment, "manned")
for moment in range(12, 18):
    service._presence_note(1, 1000.0 + moment, "empty")
service._presence_note(1, 1078.0, "manned")

summary = service._presence_summary(1, 1078.0)
states = [segment["state"] for segment in summary["timeline"]]
note(f"states: {states}")

check("consecutive same-state frames merge into one segment",
      states == ["manned", "empty", "unwatched", "manned"],
      str(states))

check("a frame gap wider than the bar is written down as 'not watched', "
      "never as a stretch of whichever state came next",
      states[2] == "unwatched"
      and summary["unwatched_seconds"] >= 60.0 - PRESENCE_GAP_SECONDS,
      f"unwatched {summary['unwatched_seconds']}s")

total = (summary["manned_seconds"] + summary["empty_seconds"]
         + summary["unwatched_seconds"])
check("the three totals sum to exactly the span of the record",
      abs(total - summary["span_seconds"]) < 0.05,
      f"{total} against span {summary['span_seconds']}")

# The window prunes, clamping the straddling segment.
old_service = WorkstationService()
old_service._presence_note(2, 0.0, "manned")
old_service._presence_note(2, PRESENCE_HISTORY_SECONDS + 500.0, "manned")
pruned = old_service._presence_summary(2, PRESENCE_HISTORY_SECONDS + 500.0)
check("the record never reaches beyond its window",
      pruned["span_seconds"] <= PRESENCE_HISTORY_SECONDS + 0.1,
      f"span {pruned['span_seconds']}")

# ------------------------------------ 2 · through process(), real footage

print("\n--- 2 · on the operator's own footage, with the clock in hand\n")

if not check("the CCTV clip is present", CLIP.exists(), str(CLIP)):
    sys.exit(1)

capture = cv2.VideoCapture(str(CLIP))
width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
capture.set(cv2.CAP_PROP_POS_FRAMES, 0)
_ok, manned_frame = capture.read()
capture.set(cv2.CAP_PROP_POS_FRAMES, 110)
_ok2, empty_frame = capture.read()
capture.release()

# The station is drawn where the clip's standing person is at frame 0 —
# measured for the zone suite and reused here.
for existing in list(workstation_regions.for_source(SOURCE)):
    workstation_regions.remove(SOURCE, existing["id"])
station = workstation_regions.add(
    SOURCE,
    [300 / width, 60 / height, 510 / width, 440 / height],
    name="Bench",
)

live = WorkstationService()
live._browser_camera = False
live._source = lambda: SOURCE
clock = {"t": 5_000.0}
live._now = lambda: clock["t"]

STEP = 1.0


def run(frame, seconds):
    last = None
    for _ in range(int(seconds)):
        _annotated, last = live.process(frame)
        clock["t"] += STEP
    return last


occupied_result = run(manned_frame, 10)
row = occupied_result["detections"][0]

check("a person standing at the station is recorded as manned time",
      row["occupied"] and row["presence"] is not None
      and row["presence"]["manned_seconds"] >= 8.0,
      f"occupied={row['occupied']}, presence={row['presence']}")

emptied_result = run(empty_frame, 15)
row = emptied_result["detections"][0]
note(f"after emptying: manned {row['presence']['manned_seconds']}s, "
     f"empty {row['presence']['empty_seconds']}s")

check("the station emptying is recorded as empty time — after the presence "
      "grace has had its say, not before",
      not row["occupied"] and row["presence"]["empty_seconds"] >= 8.0
      and row["presence"]["manned_seconds"] >= 10.0,
      f"{row['presence']}")

dark = (manned_frame * 0.05).astype(np.uint8)
dark_result = run(dark, 8)
row = dark_result["detections"][0]
note(f"after darkness: unwatched {row['presence']['unwatched_seconds']}s")

check("a stretch nobody could watch is recorded as exactly that — neither "
      "presence nor absence",
      row["presence"]["unwatched_seconds"] >= 6.0,
      f"{row['presence']}")

before_hole = row["presence"]["span_seconds"]
clock["t"] += 120.0
hole_result = run(manned_frame, 3)
row = hole_result["detections"][0]

check("two minutes with no frames at all appears in the record as a "
      "'not watched' hole",
      row["presence"]["unwatched_seconds"] >= 120.0,
      f"unwatched {row['presence']['unwatched_seconds']}s")

# ---------------------------------------------------- 3 · one photograph

print("\n--- 3 · a photograph has no timeline\n")

photo = live.for_session()
photo.single_frame = True
photo._source = live._source
photo._now = live._now
_annotated, photo_result = photo.process(manned_frame)

check("a checked photo carries no presence record",
      all(r.get("presence") is None for r in photo_result["detections"]),
      str([r.get("presence") for r in photo_result["detections"]]))

# ------------------------------------------------ 4 · what the page draws

print("\n--- 4 · the payload the graphs are drawn from\n")

presence = hole_result["detections"][0]["presence"]

check("times are relative — the newest edge is (near) zero seconds ago",
      presence["timeline"][-1]["end"] <= STEP,
      f"newest end {presence['timeline'][-1]['end']}")

check("segments are ordered oldest to newest and contiguous",
      all(
          presence["timeline"][i]["end"] >= presence["timeline"][i + 1]["start"] - 0.11
          for i in range(len(presence["timeline"]) - 1)
      ),
      str(presence["timeline"][:6]))

drawn_total = sum(
    segment["start"] - segment["end"] for segment in presence["timeline"]
)
claimed = (presence["manned_seconds"] + presence["empty_seconds"]
           + presence["unwatched_seconds"])
check("what the lanes draw and what the totals claim are the same seconds",
      abs(drawn_total - claimed) < 0.5,
      f"drawn {drawn_total:.1f} against claimed {claimed:.1f}")

check("and the delta the page prints is computable from the same two "
      "figures it shows",
      isinstance(presence["manned_seconds"], float)
      and isinstance(presence["empty_seconds"], float),
      str(presence))

# ------------------------------------------------------------------ tidy

for existing in list(workstation_regions.for_source(SOURCE)):
    workstation_regions.remove(SOURCE, existing["id"])

print(f"\n{'All workstation presence checks passed.' if failures == 0 else str(failures) + ' FAILED'}")
sys.exit(1 if failures else 0)
