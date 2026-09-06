"""
Does marking one area disturb another area that is already in alarm?

DOOR-02 and WS-04 are the same defect in two modules: `_calibrate()` and
`_mark()` both end with an unconditional `self._watched = {}`, under a comment
describing a per-region reset. Marking a second door wipes the first door's
live open-timer and its severity; moving one workstation resets every other
workstation's absence clock. Both are routine maintenance silently cancelling a
live alert.

Every action below goes through the module's own `configure()` — the same call
the Doors and Workstations pages make — and the live state is read back out of
`_summarise()`, which is what the operator's screen is drawn from. Nothing here
reaches into `_watched` directly: a fix that keeps the internal dictionary
intact while the reported timer still resets would be no fix at all.

The clock is patched so a twenty-second-old alert can exist without waiting
twenty seconds, and both region stores are isolated to files in this directory
so nothing here can disturb a real deployment's marked areas.

Prints one JSON object on stdout. Run with cwd=backend.
"""

import json
import sys
from pathlib import Path
from typing import Any, Optional

import numpy as np

HERE = Path(__file__).resolve().parent

from app.modules.door.service import DoorService  # noqa: E402
from app.modules.workstation.service import WorkstationService  # noqa: E402
from app.vision.door_regions import DoorRegions  # noqa: E402
from app.vision.legibility import read
from app.vision.workstation_regions import WorkstationRegions  # noqa: E402

# Through sys.modules, not attribute access: both packages re-export the
# service *instance* under the name `service`, so the obvious form binds the
# object rather than the module and the patch lands on the live singleton.
door_module = sys.modules["app.modules.door.service"]
ws_module = sys.modules["app.modules.workstation.service"]

WIDTH, HEIGHT = 640, 480

clock = {"t": 1_000.0}

DoorService._now = lambda self: clock["t"]
WorkstationService._now = staticmethod(lambda: clock["t"])

out: dict[str, Any] = {"door": {}, "workstation": {}}


def find(entries: list[dict[str, Any]], name: str) -> Optional[dict[str, Any]]:
    for entry in entries:
        if entry.get("name") == name:
            return entry
    return None


# ----------------------------------------------------------------------
# Doors
# ----------------------------------------------------------------------

DOOR_A = [0.05, 0.30, 0.25, 0.95]
DOOR_B = [0.40, 0.30, 0.60, 0.95]
DOOR_C = [0.70, 0.30, 0.90, 0.95]
DOOR_B_MOVED = [0.40, 0.10, 0.60, 0.75]

door_store = DoorRegions(path=HERE / "probe_phase1_doors.json")
door_module.door_regions = door_store


def door_setup() -> tuple[DoorService, dict[str, int]]:
    """Two marked doorways, with A open long enough to be in alarm."""
    door_store.clear("browser")
    clock["t"] = 1_000.0

    service = DoorService()
    service._browser_camera = True

    marked = {}
    for name, box in (("A", DOOR_A), ("B", DOOR_B)):
        reply = service.configure({"door": {"add": {"box": box, "name": name}}})
        marked[name] = reply["door"]["id"]

    for _ in range(20):
        door_tick(service, 1.0)

    return service, marked


def door_tick(service: DoorService, seconds: float) -> dict[str, Any]:
    """One frame in which door A is seen open, and B is not seen at all."""
    clock["t"] += seconds

    marked = door_store.for_source("browser")

    # After a clear there is no A to see. The tick still runs, so the state
    # read back afterwards is the honest empty one rather than an exception.
    box = next((r["box"] for r in marked if r["name"] == "A"), None)

    seen = [] if box is None else [
        {
            "box": (box[0] * WIDTH, box[1] * HEIGHT, box[2] * WIDTH, box[3] * HEIGHT),
            "state": "open",
            "conf": 0.9,
        }
    ]

    tracked = service._watch(marked, seen, clock["t"], WIDTH, HEIGHT)

    return service._summarise(tracked, clock["t"])


def door_state(summary: dict[str, Any]) -> dict[str, Any]:
    door = find(summary.get("detections", []), "A") or {}
    return {
        "state": door.get("state"),
        "open_seconds": door.get("open_seconds"),
        "severity": door.get("severity"),
    }


DOOR_ACTIONS = {
    "marking another door": lambda s, ids: s.configure(
        {"door": {"add": {"box": DOOR_C, "name": "C"}}}
    ),
    "renaming the other door": lambda s, ids: s.configure(
        {"door": {"update": {"id": ids["B"], "name": "B renamed"}}}
    ),
    "moving the other door": lambda s, ids: s.configure(
        {"door": {"update": {"id": ids["B"], "box": DOOR_B_MOVED}}}
    ),
    "re-thresholding the other door": lambda s, ids: s.configure(
        {"door": {"update": {"id": ids["B"], "open_seconds": 30}}}
    ),
    "deleting the other door": lambda s, ids: s.configure(
        {"door": {"remove": ids["B"]}}
    ),
    "clearing every door": lambda s, ids: s.configure({"door": {"clear": True}}),
}

for label, action in DOOR_ACTIONS.items():
    svc, ids = door_setup()

    before = door_state(door_tick(svc, 0.5))

    try:
        action(svc, ids)
        refused = None
    except Exception as exc:  # noqa: BLE001
        refused = f"{type(exc).__name__}: {exc}"

    after = door_state(door_tick(svc, 0.5))

    out["door"][label] = {"before": before, "after": after, "refused": refused}

door_store.clear("browser")

# ----------------------------------------------------------------------
# Workstations
# ----------------------------------------------------------------------

WS_A = [0.05, 0.40, 0.30, 0.90]
WS_B = [0.40, 0.40, 0.65, 0.90]
WS_C = [0.70, 0.40, 0.95, 0.90]
WS_B_MOVED = [0.40, 0.10, 0.65, 0.60]

# Detailed enough that the obstruction test does not call it a covered lens —
# which would suspend every clock here and prove nothing about resets.
FRAME = np.random.default_rng(7).integers(
    0, 256, (HEIGHT, WIDTH, 3), dtype=np.uint8
)

ws_store = WorkstationRegions(path=HERE / "probe_phase1_workstations.json")
ws_module.workstation_regions = ws_store


def ws_setup(start: float = 1_000.0) -> tuple[WorkstationService, dict[str, int]]:
    """Two marked workstations, both empty long enough for A to be in alarm."""
    ws_store.clear("browser")
    clock["t"] = start

    service = WorkstationService()
    service._browser_camera = True

    marked = {}
    for name, box in (("A", WS_A), ("B", WS_B)):
        reply = service.configure(
            {"workstation": {"add": {"box": box, "name": name}}}
        )
        marked[name] = reply["workstation"]["id"]

    for _ in range(50):
        ws_tick(service, 1.0)

    return service, marked


def ws_tick(service: WorkstationService, seconds: float) -> dict[str, Any]:
    """One frame with nobody at either workstation."""
    clock["t"] += seconds

    marked = ws_store.for_source("browser")
    # `_watch` gained a legibility reading in Phase 2. Passed rather than
    # defaulted: the method dereferences it unconditionally, and this
    # probe's frame measures readable, so the timers behave as before.
    watched = service._watch(marked, [], FRAME, clock["t"], read(FRAME))

    return service._summarise(watched)


def ws_state(summary: dict[str, Any]) -> dict[str, Any]:
    station = find(summary.get("detections", []), "A") or {}
    return {
        "occupied": station.get("occupied"),
        "empty_seconds": station.get("empty_seconds"),
        "severity": station.get("severity"),
        "checkable": station.get("checkable"),
    }


WS_ACTIONS = {
    "marking another workstation": lambda s, ids: s.configure(
        {"workstation": {"add": {"box": WS_C, "name": "C"}}}
    ),
    "renaming the other workstation": lambda s, ids: s.configure(
        {"workstation": {"update": {"id": ids["B"], "name": "B renamed"}}}
    ),
    "moving the other workstation": lambda s, ids: s.configure(
        {"workstation": {"update": {"id": ids["B"], "box": WS_B_MOVED}}}
    ),
    "re-thresholding the other workstation": lambda s, ids: s.configure(
        {"workstation": {"update": {"id": ids["B"], "empty_seconds": 30}}}
    ),
    "deleting the other workstation": lambda s, ids: s.configure(
        {"workstation": {"remove": ids["B"]}}
    ),
    "clearing every workstation": lambda s, ids: s.configure(
        {"workstation": {"clear": True}}
    ),
}

for label, action in WS_ACTIONS.items():
    svc, ids = ws_setup()

    before = ws_state(ws_tick(svc, 0.5))

    try:
        action(svc, ids)
        refused = None
    except Exception as exc:  # noqa: BLE001
        refused = f"{type(exc).__name__}: {exc}"

    after = ws_state(ws_tick(svc, 0.5))

    out["workstation"][label] = {
        "before": before,
        "after": after,
        "refused": refused,
    }

# ----------------------------------------------------------------------
# WS-03 · a desk that empties at clock zero
# ----------------------------------------------------------------------
#
# `if state["empty_since"]` treats a legitimate 0.0 as "not set", so a
# workstation whose absence began at monotonic zero is reported as empty for
# 0.0 seconds for ever, and never escalates.

ws_store.clear("browser")
clock["t"] = 0.0

zero = WorkstationService()
zero._browser_camera = True
zero.configure({"workstation": {"add": {"box": WS_A, "name": "A"}}})

for _ in range(30):
    zero_summary = ws_tick(zero, 1.0)

out["workstation_from_clock_zero"] = {
    "elapsed": clock["t"],
    **ws_state(zero_summary),
}

ws_store.clear("browser")

for scratch in (
    HERE / "probe_phase1_doors.json",
    HERE / "probe_phase1_workstations.json",
):
    scratch.unlink(missing_ok=True)

print(json.dumps(out))
