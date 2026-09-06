"""
Workstation absence, at the numbers the debug report printed.

    WS-01  the close passer-by. `fakecam_100.png`'s only detection is
           (269,31,512,479) — a worker filling nearly the whole frame. A
           workstation marked at y in [0.469, 0.594] is a plausible background
           desk, and the module called it occupied because the body centre
           (y=255) happens to land in the band. The counter-cases matter as
           much: somebody genuinely standing at that desk, and somebody seated
           at it with their legs hidden, must both still occupy it.

    WS-02  the wrong-empty rate. 375 frames of `doorcam.y4m` with a person
           seated at the desk throughout, a workstation marked over the desk,
           and a ten-second allowance. The report measured 29.1% of frames
           reported empty and a longest wrong run of 3.53 s. Both the raw
           detector's answer and the module's reported answer are recorded
           here, because the phase's fix is hysteresis — the detector is
           expected to go on missing him, and the module is not expected to
           report it.

    WS-06  duplicate rejection is IoU-based, so a workstation drawn wholly
           inside another one is accepted, and one person is then present at
           two workstations at once.

Every store is a scratch file in this suite's own directory, patched in by
module name so the service's own references see it. The product's
`storage/workstation_regions.json` is never opened.

Prints one JSON object on its last line.

    cd backend && PYTHONPATH=$PWD .venv/bin/python ../tests/_probe_stations.py
"""

import json
import os
import sys
import traceback
from pathlib import Path
from typing import Any

import cv2
import numpy as np

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
sys.path.insert(0, str(REPO / "backend"))

SCRATCH = Path(
    "/tmp/claude-0/-home-user-vikasgroup-visual-analytics-fullstack-beta"
    "/34a9e001-1e22-5fc0-a6b4-dd924c10c2cc/scratchpad/p3agentD"
)
DIAG = SCRATCH.parent / "diag"
CLIP = SCRATCH.parent / "doorcam.y4m"

#: The clip's own frame rate. Absence is judged in seconds, so a 25-second
#: clip analysed in three minutes has to be replayed on its own clock or every
#: duration in the run is a measurement of this machine's speed.
FPS = 15.0

#: The desk the report marked, as fractions of the picture.
DESK = [0.03, 0.78, 0.35, 1.0]

#: The background desk the close passer-by must not occupy.
BACKGROUND_DESK = [0.5491, 0.4691, 0.6741, 0.5941]

import app.modules.workstation.service as ws_service  # noqa: E402
from app.vision.workstation_regions import WorkstationRegions  # noqa: E402


def fresh(name: str):
    """A service with its own marked areas, its own clock, and no history."""
    path = SCRATCH / name

    if path.exists():
        path.unlink()

    store = WorkstationRegions(path=path)
    sys.modules["app.modules.workstation.service"].workstation_regions = store

    service = ws_service.WorkstationService()
    service._browser_camera = True

    clock = {"t": 0.0}
    service._now = staticmethod(lambda: clock["t"])

    return service, store, clock


class Box:
    """One detection, shaped the way ultralytics hands them over."""

    def __init__(self, box, conf):
        self.xyxy = [np.array(box, dtype=float)]
        self.conf = [float(conf)]


class Frame:
    def __init__(self, boxes):
        self.boxes = boxes


def staged(service, frame, detections):
    """One frame with the person detector returning exactly these boxes."""
    service._get_model = lambda: (lambda picture, **kw: [Frame(list(detections))])
    return service.process(frame)[1]


def only_detection(frame: np.ndarray):
    """The person the real detector finds in this picture."""
    from app.vision.detector import model

    for result in model(frame, verbose=False, classes=[0], conf=0.45):
        for box in result.boxes:
            return tuple(float(v) for v in box.xyxy[0]), float(box.conf[0])

    return None, None


def station_of(result: dict[str, Any], index: int = 0) -> dict[str, Any]:
    detections = result.get("detections") or []
    return detections[index] if index < len(detections) else {}


def main() -> int:
    out: dict[str, Any] = {}

    passerby_frame = cv2.imread(str(DIAG / "fakecam_100.png"))

    if passerby_frame is None:
        print(json.dumps({"__failed__": True, "why": f"missing {DIAG}"}))
        return 1

    height, width = passerby_frame.shape[:2]

    # ------------------------------------------------------------------
    # WS-01 · a close passer-by and a background desk
    # ------------------------------------------------------------------
    box, conf = only_detection(passerby_frame)

    region_top = BACKGROUND_DESK[1] * height
    region_bottom = BACKGROUND_DESK[3] * height
    region_height = region_bottom - region_top

    ws01: dict[str, Any] = {
        "detection": None if box is None else [round(v) for v in box],
        "detection_conf": conf,
        "region": BACKGROUND_DESK,
        "region_height_px": round(region_height, 1),
        "box_height_px": None if box is None else round(box[3] - box[1], 1),
        "times_the_regions_height": (
            None if box is None else round((box[3] - box[1]) / region_height, 2)
        ),
    }

    service, store, clock = fresh("ws01_passerby.json")
    store.add("browser", BACKGROUND_DESK, name="Background desk")
    clock["t"] = 0.0
    result = service.process(passerby_frame)[1]
    ws01["passerby_occupies_it"] = bool(station_of(result).get("occupied"))
    ws01["summary"] = result.get("summary")

    # The counter-cases, staged so the geometry is exactly what is claimed.
    # A person at the desk's own depth is the size a person at that depth
    # looks; that is the whole content of the guard, and a fix that rejects
    # them too has traded one wrong answer for a worse one.
    mid_x = (box[0] + box[2]) / 2 if box else width / 2
    desk_x1, desk_x2 = BACKGROUND_DESK[0] * width, BACKGROUND_DESK[2] * width

    for label, person, person_conf in (
        (
            "standing_at_it",
            (mid_x - 25, region_bottom - 2.2 * region_height,
             mid_x + 25, region_bottom - 2.0),
            0.88,
        ),
        (
            "seated_at_it_legs_hidden",
            (mid_x - 22, region_top - 0.4 * region_height,
             mid_x + 22, region_top + 0.6 * region_height),
            0.86,
        ),
        (
            "standing_at_its_left_edge",
            (desk_x1 - 5, region_bottom - 2.0 * region_height,
             desk_x1 + 45, region_bottom - 2.0),
            0.90,
        ),
    ):
        service, store, clock = fresh(f"ws01_{label}.json")
        store.add("browser", BACKGROUND_DESK, name="Background desk")
        clock["t"] = 0.0
        staged_result = staged(service, passerby_frame, [Box(person, person_conf)])
        ws01[label] = {
            "box": [round(v) for v in person],
            "height_px": round(person[3] - person[1], 1),
            "times_the_regions_height": round(
                (person[3] - person[1]) / region_height, 2
            ),
            "occupied": bool(station_of(staged_result).get("occupied")),
        }

    # Where the guard's boundary actually falls, so the number is on the
    # table rather than implied by three cases either side of it.
    #
    # Everybody here is centred on the desk with their feet below it, which is
    # the only way to reach the guard at all: somebody whose feet are *in* the
    # marked area is standing at that depth whatever their size, and is
    # admitted before any question of scale is asked. What changes down the
    # sweep is how tall they are, which is how near the camera they are.
    ws01["boundary"] = []
    region_middle = (region_top + region_bottom) / 2

    for multiple in (1.0, 1.5, 2.0, 2.3, 2.5, 3.0, 3.5, 4.0, 5.0, 7.5):
        service, store, clock = fresh("ws01_boundary.json")
        store.add("browser", BACKGROUND_DESK, name="Background desk")
        clock["t"] = 0.0
        half = multiple * region_height / 2
        person = (
            mid_x - 25, region_middle - half, mid_x + 25, region_middle + half,
        )
        staged_result = staged(service, passerby_frame, [Box(person, 0.88)])
        ws01["boundary"].append(
            {
                "times_the_regions_height": multiple,
                "feet_below_the_area": person[3] > region_bottom,
                "occupied": bool(station_of(staged_result).get("occupied")),
            }
        )

    out["ws01"] = ws01

    # ------------------------------------------------------------------
    # WS-02 · the wrong-empty rate over the whole clip
    # ------------------------------------------------------------------
    if os.environ.get("PHASE3_SKIP_CLIP"):
        # Only this block. WS-01 and WS-06 are two frames and a store; the
        # clip is 375 inferences and is the reason anybody skips anything.
        out["ws02"] = {"error": "skipped with PHASE3_SKIP_CLIP"}
    elif not CLIP.exists():
        out["ws02"] = {"error": f"missing {CLIP}"}
    else:
        service, store, clock = fresh("ws02_desk.json")
        station = store.add("browser", DESK, name="Desk", empty_seconds=10.0)

        capture = cv2.VideoCapture(str(CLIP))

        reported: list[bool] = []
        raw: list[bool] = []
        severities: list[Any] = []
        checkable: list[bool] = []

        # What the module said before this phase, measured beside what it says
        # now. Written out here rather than imported, for the same reason
        # `blind_share_before_phase2` is: the question is not "is 29.1% a bad
        # number", it is "did this phase move it", and half of that comparison
        # has to survive the code changing underneath it.
        at = _at_before

        while True:
            ok, frame = capture.read()

            if not ok:
                break

            index = len(reported)
            clock["t"] = index / FPS

            result = service.process(frame)[1]
            detection = station_of(result)

            reported.append(bool(detection.get("occupied")))
            severities.append(detection.get("severity"))
            checkable.append(bool(detection.get("checkable", True)))

            people = _people_in(frame)
            box = detection.get("box") or (
                DESK[0] * frame.shape[1], DESK[1] * frame.shape[0],
                DESK[2] * frame.shape[1], DESK[3] * frame.shape[0],
            )
            raw.append(any(at(person, tuple(box)) for person in people))

        capture.release()

        out["ws02"] = {
            "station": station,
            "frames": len(reported),
            "detector_found_him": sum(raw),
            "detector_wrong_empty_pct": _pct(raw),
            "module_reported_occupied": sum(reported),
            "module_wrong_empty_pct": _pct(reported),
            "module_longest_wrong_run_frames": _longest_false_run(reported),
            "module_longest_wrong_run_seconds": round(
                _longest_false_run(reported) / FPS, 2
            ),
            "detector_longest_wrong_run_seconds": round(
                _longest_false_run(raw) / FPS, 2
            ),
            "frames_with_severity": sum(1 for s in severities if s),
            "frames_unwatchable": sum(1 for c in checkable if not c),
            "first_alerting_frame": next(
                (i for i, s in enumerate(severities) if s), None
            ),
        }

    # ------------------------------------------------------------------
    # WS-06 · one workstation drawn inside another
    # ------------------------------------------------------------------
    service, store, clock = fresh("ws06_nested.json")
    outer = store.add("browser", [0.10, 0.10, 0.90, 0.90], name="Outer")

    nested: dict[str, Any] = {
        "outer": outer,
        "config_before": _config_of(service),
    }

    try:
        inner = store.add("browser", [0.40, 0.40, 0.60, 0.60], name="Inner")
        nested["inner_accepted"] = True
        nested["inner"] = inner
        nested["refusal"] = None
    except ValueError as exc:
        nested["inner_accepted"] = False
        nested["inner"] = None
        nested["refusal"] = str(exc)

    if nested["inner_accepted"]:
        # One person, standing in both. Whether that is reported as one
        # presence or two is the question the report leaves open.
        clock["t"] = 0.0
        centre = (width * 0.45, height * 0.30, width * 0.55, height * 0.58)
        result = staged(service, passerby_frame, [Box(centre, 0.9)])
        nested["one_person_counts_at"] = sum(
            1 for d in result.get("detections", []) if d.get("occupied")
        )
        nested["workstations_total"] = result.get("workstations_total")
        nested["summary"] = result.get("summary")
        nested["result_keys"] = sorted(result)
        nested["config_after"] = _config_of(service)

    out["ws06"] = nested

    for leftover in SCRATCH.glob("ws0*.json"):
        leftover.unlink()

    print(json.dumps(out))
    return 0


def _config_of(service) -> dict[str, Any]:
    try:
        config = service.get_config()
    except Exception as exc:  # noqa: BLE001
        return {"error": f"{type(exc).__name__}: {exc}"}

    return {
        key: value for key, value in config.items() if key != "workstations"
    }


def _at_before(person, box) -> bool:
    """
    Whether somebody counted as being at a workstation before this phase.

    Two points and no scale guard, exactly as `_at` read when the report
    measured 29.1%: the middle of the bottom of their box, or the middle of
    the box itself, falling inside the marked area.
    """
    px1, _, px2, py2 = person
    py1 = person[1]
    bx1, by1, bx2, by2 = box

    middle = (px1 + px2) / 2

    def within(x, y):
        return bx1 <= x <= bx2 and by1 <= y <= by2

    return within(middle, py2) or within(middle, (py1 + py2) / 2)


def _people_in(frame: np.ndarray) -> list[tuple[float, float, float, float]]:
    """The person boxes the shared detector reports, at the module's own bar."""
    from app.vision.detector import model

    people = []

    for result in model(frame, verbose=False, classes=[0],
                        conf=ws_service.CONF_THRESHOLD):
        for box in result.boxes:
            people.append(tuple(float(v) for v in box.xyxy[0]))

    return people


def _pct(flags: list[bool]) -> float:
    return round(100.0 * sum(1 for f in flags if not f) / max(len(flags), 1), 1)


def _longest_false_run(flags: list[bool]) -> int:
    longest = run = 0

    for flag in flags:
        run = 0 if flag else run + 1
        longest = max(longest, run)

    return longest


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except Exception:  # noqa: BLE001
        print(json.dumps({"__failed__": True, "traceback": traceback.format_exc()}))
        raise SystemExit(1)
