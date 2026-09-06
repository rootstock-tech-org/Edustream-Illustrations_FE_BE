"""
Which doorway a detection belongs to, and how many doorways a region holds.

    DOOR-11  two adjacent marked regions and one door box sitting across the
             boundary between them. `match()` was asked one region at a time,
             and each answer was right on its own — the box clears the bar
             against both, so both reported the same state from the same
             pixels, with two timers escalating in step off one physical door.

    DOOR-12  one region drawn across two real doorways. The module tracked
             whichever the model happened to hand it and said nothing about
             the other, so an operator saw a door being timed with no sign
             that a second one was not being watched at all.

    the guards for both. A generously drawn region round one doorway must not
    be reported as holding two, and two regions with a door each must both be
    seen — a rule that makes doors exclusive is easy to write in a way that
    starves the second one.

Door detections are staged. The point of every case here is the exact overlap
between a region and a box, and the shipped weights find at most 0.375 on the
reference footage — measuring an exclusivity rule through a detector that
finds one door in three would be measuring the detector.

Prints one JSON object on its last line.

    cd backend && PYTHONPATH=$PWD .venv/bin/python ../tests/_probe_doorways.py
"""

import json
import sys
import traceback
from pathlib import Path
from typing import Any

import numpy as np

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
sys.path.insert(0, str(REPO / "backend"))

SCRATCH = Path(
    "/tmp/claude-0/-home-user-vikasgroup-visual-analytics-fullstack-beta"
    "/34a9e001-1e22-5fc0-a6b4-dd924c10c2cc/scratchpad/p3agentD"
)

import app.modules.door.service  # noqa: E402,F401
from app.vision.door_regions import DoorRegions  # noqa: E402

# By name from sys.modules rather than as an attribute of the package: the
# door package re-exports a `service` *instance* under that name, so
# `app.modules.door.service` reaches the singleton and not the module it
# lives in.
door_service = sys.modules["app.modules.door.service"]

WIDTH, HEIGHT = 640, 480

#: Two doorways side by side, touching but not overlapping, and one detection
#: straddling them. Each region scores 0.333 against it — comfortably over the
#: 0.25 bar, which is what makes it a contest rather than a near miss.
LEFT_DOORWAY = [0.30, 0.30, 0.50, 0.80]
RIGHT_DOORWAY = [0.50, 0.30, 0.70, 0.80]
STRADDLING_DOOR = [0.40, 0.30, 0.60, 0.80]

#: One region drawn round two doorways, and the two doors inside it.
WIDE_REGION = [0.20, 0.30, 0.80, 0.80]
DOOR_IN_IT_LEFT = [0.22, 0.32, 0.46, 0.78]
DOOR_IN_IT_RIGHT = [0.54, 0.32, 0.78, 0.78]


class Box:
    def __init__(self, box, conf, cls):
        # Fractions in, pixels out: the service scales detections by the
        # frame's own size, so a case written in fractions has to arrive in
        # the units a model would have produced.
        self.xyxy = [
            np.array(
                [box[0] * WIDTH, box[1] * HEIGHT, box[2] * WIDTH, box[3] * HEIGHT],
                dtype=float,
            )
        ]
        self.conf = [float(conf)]
        self.cls = [int(cls)]


class Result:
    def __init__(self, boxes):
        self.boxes = boxes


class FakeModel:
    names = {0: "closed", 1: "open"}

    def __init__(self, boxes):
        self._boxes = boxes

    def __call__(self, picture, **kwargs):
        return [Result(list(self._boxes))]


def fresh(name: str, boxes):
    """A door service watching its own scratch regions, on a stopped clock."""
    path = SCRATCH / name

    if path.exists():
        path.unlink()

    store = DoorRegions(path=path)
    sys.modules["app.modules.door.service"].door_regions = store

    service = door_service.DoorService()
    service._browser_camera = True
    service._get_model = lambda: FakeModel(boxes)

    clock = {"t": 1000.0}
    service._now = lambda: clock["t"]

    return service, store, clock


#: A real frame from the office clip the door findings were measured on.
#: Nothing here is decided by its pixels — the detections are staged — but a
#: picture the gate refuses puts "too flat to check" over every summary in
#: this file and hides the sentence the operator is meant to see.
OFFICE_FRAME = SCRATCH.parent / "diag" / "doorcam_0.png"


def frame() -> np.ndarray:
    import cv2

    picture = cv2.imread(str(OFFICE_FRAME))

    if picture is None:
        raise SystemExit(f"missing {OFFICE_FRAME}")

    return cv2.resize(picture, (WIDTH, HEIGHT))


def run(service, clock, ticks: int = 6, step: float = 0.5) -> dict[str, Any]:
    """A few frames, because a doorway is believed over several sightings."""
    picture = frame()
    last: dict[str, Any] = {}

    for _ in range(ticks):
        clock["t"] += step
        last = service.process(picture)[1]

    return {
        key: last[key]
        for key in ("summary", "alert", "status", "doors_total", "doors_open",
                    "doors_unknown", "doors_crowded", "calibrated")
        if key in last
    }, [
        {
            key: door.get(key)
            for key in ("id", "name", "state", "seen_now", "crowded",
                        "stale", "open_seconds", "severity")
            if key in door
        }
        for door in (last.get("detections") or [])
    ], [
        {"label": region.get("label"), "tone": region.get("tone")}
        for region in (last.get("regions") or [])
        if isinstance(region, dict)
    ], sorted(last)


def case(name: str, regions, boxes, ticks: int = 6) -> dict[str, Any]:
    service, store, clock = fresh(f"door_{name}.json", boxes)

    for label, box in regions:
        store.add("browser", box, name=label)

    summary, doors, drawn, keys = run(service, clock, ticks=ticks)

    return {
        "summary": summary,
        "doors": doors,
        "regions": drawn,
        "result_keys": keys,
    }


def main() -> int:
    out: dict[str, Any] = {}

    # ------------------------------------------------------------------
    # DOOR-11 · one door, two regions that both fit it
    # ------------------------------------------------------------------
    out["door11_one_door_two_regions"] = case(
        "door11",
        [("Left", LEFT_DOORWAY), ("Right", RIGHT_DOORWAY)],
        [Box(STRADDLING_DOOR, 0.82, 1)],
    )

    # The guard: a door each, and both must be seen. An exclusivity rule that
    # hands the second region nothing has swapped a double-count for a blind
    # spot.
    out["door11_guard_one_each"] = case(
        "door11guard",
        [("Left", LEFT_DOORWAY), ("Right", RIGHT_DOORWAY)],
        [
            Box([0.31, 0.31, 0.49, 0.79], 0.85, 1),
            Box([0.51, 0.31, 0.69, 0.79], 0.84, 0),
        ],
    )

    # ------------------------------------------------------------------
    # DOOR-12 · one region drawn across two doorways
    # ------------------------------------------------------------------
    out["door12_two_doorways_one_region"] = case(
        "door12",
        [("Corridor", WIDE_REGION)],
        [Box(DOOR_IN_IT_LEFT, 0.86, 1), Box(DOOR_IN_IT_RIGHT, 0.84, 0)],
    )

    # The guard: one doorway generously marked. Nobody may be told there are
    # two doors in it.
    out["door12_guard_one_doorway"] = case(
        "door12guard",
        [("Corridor", WIDE_REGION)],
        [Box([0.30, 0.32, 0.70, 0.78], 0.86, 1)],
    )

    # And the same region with a second door that is nowhere near it.
    out["door12_guard_door_elsewhere"] = case(
        "door12guard2",
        [("Corridor", WIDE_REGION)],
        [
            Box([0.30, 0.32, 0.70, 0.78], 0.86, 1),
            Box([0.02, 0.02, 0.14, 0.28], 0.80, 1),
        ],
    )

    # ------------------------------------------------------------------
    # What a single marked doorway with a single door does, unchanged
    # ------------------------------------------------------------------
    out["ordinary_single_door"] = case(
        "ordinary",
        [("Fire door", LEFT_DOORWAY)],
        [Box([0.31, 0.31, 0.49, 0.79], 0.88, 0)],
    )

    for leftover in SCRATCH.glob("door_*.json"):
        leftover.unlink()

    print(json.dumps(out))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except Exception:  # noqa: BLE001
        print(json.dumps({"__failed__": True, "traceback": traceback.format_exc()}))
        raise SystemExit(1)
