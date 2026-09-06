"""
What the door module says about twenty-five seconds of real office footage.

    DOOR-01  a glass-panelled office door, visually verified shut for all 375
             frames, that the detector calls open in 303 of them. The module
             believed "open" at t=0.20s — the first sighting, believed
             outright — never once reported "closed" in the whole clip, and
             escalated to "low" at 3.20s and "medium" by 12.20s. An
             uninterrupted, escalating false alarm about a door that is never
             open. (The debug report's 3.27s and 12.27s are the same two
             moments one frame earlier: its replay advanced the clock before
             the first frame and this one does not.)

    the two wooden doors beside it, which are the thing this phase most
             easily breaks. One of them genuinely opens at frame 185
             (t=12.33s, established by watching the footage); the other is
             shut throughout. A first-belief bar that silences the glass door
             by silencing every door has not fixed anything.

    DOOR-10  how long after a door really opens the module says so. 2.67s
             before this phase, against a 0.8s design constant — and the
             price of a confirmation bar on the first belief is paid here, in
             seconds, so it is measured rather than asserted.

The detections are the real model's, run once over the clip at conf >= 0.01
and replayed at 15fps through the shipped `process()`. Replayed rather than
re-inferred because 375 inferences take ten minutes on this CPU and would be
measuring the detector, which this phase does not touch — the pixels of each
frame are still the clip's own, because the legibility gate reads them and a
black frame would put "too flat to check" over every summary in this file.

Prints one JSON object on its last line.

    cd backend && PYTHONPATH=$PWD .venv/bin/python ../tests/_probe_clip.py

    PHASE4_CLIP_PLACEMENTS=0   the primary placement only, skipping the two
                               alternate boxes round the glass door
"""

import json
import os
import pickle
import sys
import traceback
from pathlib import Path
from typing import Any, Optional

import numpy as np

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
sys.path.insert(0, str(REPO / "backend"))

SCRATCH = Path(
    "/tmp/claude-0/-home-user-vikasgroup-visual-analytics-fullstack-beta"
    "/34a9e001-1e22-5fc0-a6b4-dd924c10c2cc/scratchpad"
)
MINE = SCRATCH / "p4agentB"

CLIP = SCRATCH / "doorcam.y4m"

#: Every box the real `door.pt` found in every frame of the clip, at a
#: confidence floor low enough to hold what production discards. Produced by
#: the debug report's own inference run; rebuilt here from the clip if it is
#: missing, and cached, because a measurement that cannot be re-taken is a
#: quotation.
DETECTIONS = SCRATCH / "analysis" / "detections_conf01.pkl"
CACHED = MINE / "detections_conf01.pkl"

import app.modules.door.service  # noqa: E402,F401
from app.vision.door_regions import DoorRegions  # noqa: E402

# By name from sys.modules: the door package re-exports a `service` *instance*
# under that name, so the attribute path reaches the singleton rather than the
# module its constants live in.
door_service = sys.modules["app.modules.door.service"]

WIDTH, HEIGHT = 640, 480
FPS = 15.0
STEP = 1.0 / FPS

#: The three doorways, marked where the debug report marked them.
LEFT = [0.0, 0.38, 0.22, 0.86]
MIDDLE = [0.22, 0.38, 0.40, 0.86]
RIGHT = [0.60, 0.36, 0.90, 0.86]

#: The same glass doorway drawn tightly and drawn generously. The false alarm
#: was reported to survive a change of box (77–82% "open" across three
#: placements), so a fix that only holds for one rectangle is a fix for one
#: rectangle.
MIDDLE_TIGHT = [0.225, 0.43, 0.345, 0.80]
MIDDLE_GENEROUS = [0.19, 0.36, 0.40, 0.88]

#: Ground truth, from watching the clip. The left doorway is shut until frame
#: 185 and open afterwards; the middle (glass) and right doorways are shut for
#: all 375 frames.
TRUE_OPEN_FRAME = 185
TRUE_OPEN_T = TRUE_OPEN_FRAME * STEP


def truth(door: str, frame_index: int) -> str:
    if door == "Left" and frame_index >= TRUE_OPEN_FRAME:
        return "open"
    return "closed"


class Box:
    """One detection in the shape ultralytics hands the service."""

    def __init__(self, class_index: int, box, conf: float):
        self.cls = [int(class_index)]
        self.xyxy = [np.array(box, dtype=float)]
        self.conf = [float(conf)]


class Result:
    def __init__(self, boxes):
        self.boxes = boxes


class FakeModel:
    """The real model's output for one frame of the clip, replayed."""

    names = {0: "closed", 1: "open"}
    _index = {"closed": 0, "open": 1}

    def __init__(self, script: list[list[dict[str, Any]]]):
        self.script = script
        self.frame = 0

    def __call__(self, picture, verbose=False, conf=0.40):
        boxes = [
            Box(self._index[detection["cls"]], detection["box"], detection["conf"])
            for detection in self.script[self.frame]
            # The confidence floor is production's, applied where ultralytics
            # applies it, so a suite that changes `confidence` changes what
            # this model returns exactly as it would in the field.
            if detection["conf"] >= conf and detection["cls"] in self._index
        ]
        return [Result(boxes)]


def detections() -> list[list[dict[str, Any]]]:
    """Every frame's boxes, from the cache or from the clip itself."""
    for path in (DETECTIONS, CACHED):
        if path.exists():
            with path.open("rb") as handle:
                return pickle.load(handle)

    from ultralytics import YOLO  # noqa: PLC0415
    import cv2  # noqa: PLC0415

    model = YOLO(str(REPO / "backend" / "models" / "door.pt"))
    capture = cv2.VideoCapture(str(CLIP))

    script = []

    while True:
        ok, picture = capture.read()
        if not ok:
            break

        found = []
        for result in model(picture, verbose=False, conf=0.01):
            for box in result.boxes:
                found.append(
                    {
                        "cls": model.names[int(box.cls[0])],
                        "conf": float(box.conf[0]),
                        "box": [float(v) for v in box.xyxy[0]],
                    }
                )
        script.append(found)

    capture.release()

    MINE.mkdir(parents=True, exist_ok=True)
    with CACHED.open("wb") as handle:
        pickle.dump(script, handle)

    return script


def frames():
    """The clip's own pixels, one frame at a time."""
    import cv2  # noqa: PLC0415

    capture = cv2.VideoCapture(str(CLIP))

    try:
        while True:
            ok, picture = capture.read()
            if not ok:
                return
            yield picture
    finally:
        capture.release()


def fresh(name: str, script):
    """A door service on its own scratch store, its own clock and this clip."""
    MINE.mkdir(parents=True, exist_ok=True)
    path = MINE / name

    if path.exists():
        path.unlink()

    store = DoorRegions(path=path)
    door_service.door_regions = store

    service = door_service.DoorService()
    service._browser_camera = True

    model = FakeModel(script)
    service._get_model = lambda: model

    clock = {"t": 1000.0}
    service._now = lambda: clock["t"]

    return service, store, clock, model


def runs(timeline: list[tuple[float, Optional[str]]]):
    """A per-frame state trace collapsed into its runs, for reading."""
    collapsed: list[list[Any]] = []

    for when, state in timeline:
        if not collapsed or collapsed[-1][0] != state:
            collapsed.append([state, round(when, 2), round(when, 2)])
        else:
            collapsed[-1][2] = round(when, 2)

    return collapsed


def replay(marked: list[tuple[str, list[float]]], name: str,
           script) -> dict[str, Any]:
    """
    The whole clip through the shipped module, and what it said about it.

    Every number here is per marked doorway and in seconds from the start of
    the clip, so it can be read against the report's own figures without
    arithmetic.
    """
    service, store, clock, model = fresh(name, script)

    for label, box in marked:
        store.add("browser", box, name=label)

    watched = {label: {
        "timeline": [],
        "first_state_at": {},
        "first_severity": None,
        "first_severity_at": None,
        "first_medium_at": None,
        "first_high_at": None,
        "severity_frames": 0,
        "correct": 0,
        "wrong": 0,
        "withheld": 0,
        "max_open_seconds": 0.0,
        "severity_disagrees_with_displayed": 0,
        "crowded_frames": 0,
    } for label, _ in marked}

    module_alert_frames = 0
    summaries: dict[str, int] = {}
    first_alert_at = None

    start = clock["t"]

    for index, picture in enumerate(frames()):
        if index >= len(script):
            break

        model.frame = index
        clock["t"] = start + index * STEP

        _, result = service.process(picture)

        elapsed = index * STEP

        if result.get("alert"):
            module_alert_frames += 1
            if first_alert_at is None:
                first_alert_at = round(elapsed, 3)

        summaries[str(result.get("summary"))] = summaries.get(
            str(result.get("summary")), 0
        ) + 1

        for door in result.get("detections", []):
            record = watched.get(door.get("name"))

            if record is None:
                continue

            state = door.get("state")
            severity = door.get("severity")
            shown = door.get("open_seconds")

            record["timeline"].append((elapsed, state))

            if state not in record["first_state_at"]:
                record["first_state_at"][str(state)] = round(elapsed, 3)

            if severity:
                record["severity_frames"] += 1

                if record["first_severity"] is None:
                    record["first_severity"] = severity
                    record["first_severity_at"] = round(elapsed, 3)

                if severity == "medium" and record["first_medium_at"] is None:
                    record["first_medium_at"] = round(elapsed, 3)

                if severity == "high" and record["first_high_at"] is None:
                    record["first_high_at"] = round(elapsed, 3)

            # DOOR-14, asked of every row the operator could read: the
            # severity beside a duration has to be the severity that duration
            # earns.
            expected = service._severity(shown, door.get("threshold_seconds"))
            if expected != severity:
                record["severity_disagrees_with_displayed"] += 1

            record["max_open_seconds"] = max(
                record["max_open_seconds"], float(shown or 0.0)
            )

            if door.get("crowded"):
                record["crowded_frames"] += 1

            expected_state = truth(door["name"], index)

            if state in (None, "unreliable"):
                record["withheld"] += 1
            elif state == expected_state:
                record["correct"] += 1
            else:
                record["wrong"] += 1

    out: dict[str, Any] = {
        "module": {
            "alert_frames": module_alert_frames,
            "first_alert_at": first_alert_at,
            "summaries": dict(sorted(summaries.items(), key=lambda kv: -kv[1])),
        },
        "doors": {},
    }

    for label, record in watched.items():
        timeline = record.pop("timeline")
        record["frames"] = len(timeline)
        record["runs"] = runs(timeline)
        record["states"] = {
            str(state): sum(1 for _, seen in timeline if seen == state)
            for state in {seen for _, seen in timeline}
        }
        out["doors"][label] = record

    store.clear("browser")

    if (MINE / name).exists():
        (MINE / name).unlink()

    return out


def raw(script) -> dict[str, Any]:
    """
    What the detector itself said about each doorway, frame by frame.

    Nothing in this phase can move these numbers — they are the model's, and
    the model is Phase 6 — so they are the proof that the replay is the clip
    the report measured and not some other footage.
    """
    tallies = {
        label: {"open": 0, "closed": 0, "nothing": 0,
                "agrees_with_truth": 0, "contradicts_truth": 0}
        for label, _ in (("Left", LEFT), ("Middle", MIDDLE), ("Right", RIGHT))
    }

    boxes = [LEFT, MIDDLE, RIGHT]
    labels = ["Left", "Middle", "Right"]

    for index, found in enumerate(script):
        scaled = [
            {
                "box": [
                    detection["box"][0] / WIDTH,
                    detection["box"][1] / HEIGHT,
                    detection["box"][2] / WIDTH,
                    detection["box"][3] / HEIGHT,
                ],
                "state": detection["cls"],
                "conf": detection["conf"],
            }
            for detection in found
            if detection["conf"] >= 0.40
            and (detection["box"][2] - detection["box"][0])
            * (detection["box"][3] - detection["box"][1])
            >= door_service.MIN_DOOR_AREA * WIDTH * HEIGHT
        ]

        assigned = DoorRegions.assign(boxes, scaled)

        for position, label in enumerate(labels):
            at = assigned.get(position)

            if at is None:
                tallies[label]["nothing"] += 1
                continue

            state = scaled[at]["state"]
            tallies[label][state] = tallies[label].get(state, 0) + 1

            if state == truth(label, index):
                tallies[label]["agrees_with_truth"] += 1
            else:
                tallies[label]["contradicts_truth"] += 1

    return tallies


def reading_stream(script, region_box) -> list[Optional[str]]:
    """What the detector said about one doorway, frame by frame."""
    stream: list[Optional[str]] = []

    for found in script:
        scaled = [
            {
                "box": [
                    detection["box"][0] / WIDTH,
                    detection["box"][1] / HEIGHT,
                    detection["box"][2] / WIDTH,
                    detection["box"][3] / HEIGHT,
                ],
                "state": detection["cls"],
                "conf": detection["conf"],
            }
            for detection in found
            if detection["conf"] >= 0.40
            and (detection["box"][2] - detection["box"][0])
            * (detection["box"][3] - detection["box"][1])
            >= door_service.MIN_DOOR_AREA * WIDTH * HEIGHT
        ]

        at = DoorRegions.assign([region_box], scaled).get(0)
        stream.append(None if at is None else scaled[at]["state"])

    return stream


def confidence_stream(script, region_box):
    """The same doorway's readings with the confidence each was given."""
    out = []

    for found in script:
        scaled = [
            {
                "box": [
                    detection["box"][0] / WIDTH,
                    detection["box"][1] / HEIGHT,
                    detection["box"][2] / WIDTH,
                    detection["box"][3] / HEIGHT,
                ],
                "state": detection["cls"],
                "conf": detection["conf"],
            }
            for detection in found
            if detection["conf"] >= 0.40
            and (detection["box"][2] - detection["box"][0])
            * (detection["box"][3] - detection["box"][1])
            >= door_service.MIN_DOOR_AREA * WIDTH * HEIGHT
        ]

        at = DoorRegions.assign([region_box], scaled).get(0)
        out.append(None if at is None else scaled[at])

    return out


def when_a_bar_is_cleared(stream, state: str, from_frame: int,
                          sightings: int, majority: float,
                          span: float, window: float) -> Optional[float]:
    """
    How long a confirmation bar of the module's own shape holds this state off.

    The shape is the one the change rule already uses and the contract asks a
    first belief to copy: `sightings` sightings of the state inside a rolling
    `window`, a `majority`-to-one lead over everything else seen since the
    first of them, and `span` seconds elapsed. Returns seconds after
    `from_frame` until the bar is first cleared, or None if it never is.

    The point of measuring it here, on both doorways, is that a bar is one
    number for the whole module: whatever holds off the doorway that is wrong
    holds off the doorway that is right by the same rule.
    """
    seen: list[tuple[float, str]] = []

    for index in range(from_frame, len(stream)):
        reading = stream[index]

        if reading is None:
            continue

        now = index * STEP
        seen = [entry for entry in seen if now - entry[0] <= window]
        seen.append((now, reading))

        supporting = [when for when, said in seen if said == state]

        if len(supporting) < sightings:
            continue

        against = sum(
            1 for when, said in seen
            if said != state and when >= supporting[0]
        )

        if len(supporting) >= against * majority and (
            now - supporting[0] >= span
        ):
            return round(now - from_frame * STEP, 3)

    return None


def evidence(script) -> dict[str, Any]:
    """
    How strong the false "open" is beside the true one.

    The phase's rule is that a first belief must clear a bar of the same shape
    as a change of belief. A bar is one number for the whole module, so the
    question that decides whether this clip can be fixed by a bar at all is
    which doorway clears it first: the glass door, which is shut and read
    open, or the wooden door, which really does open at frame 185.

    Measured over a range of bars, from the module's own (3 sightings, 2:1,
    0.8s) up to bars far stricter than anything the contract describes.
    """
    glass = reading_stream(script, MIDDLE)
    wooden = reading_stream(script, LEFT)

    glass_conf = [
        entry["conf"] for entry in confidence_stream(script, MIDDLE)
        if entry and entry["state"] == "open"
    ]
    wooden_conf = [
        entry["conf"] for entry in confidence_stream(script, LEFT)[TRUE_OPEN_FRAME:]
        if entry and entry["state"] == "open"
    ]

    bars = {}

    for sightings, majority, span, window in (
        (3, 2.0, 0.8, 2.5),
        (5, 2.0, 1.5, 2.5),
        (8, 3.0, 2.0, 4.0),
        (15, 4.0, 4.0, 8.0),
        (30, 5.0, 8.0, 15.0),
    ):
        label = f"{sightings} sightings · {majority:.0f}:1 · {span}s in {window}s"
        bars[label] = {
            "glass_false_open_after": when_a_bar_is_cleared(
                glass, "open", 0, sightings, majority, span, window
            ),
            "wooden_true_open_after": when_a_bar_is_cleared(
                wooden, "open", TRUE_OPEN_FRAME, sightings, majority, span,
                window
            ),
        }

    return {
        "bars": bars,
        "glass_open_sightings": sum(1 for state in glass if state == "open"),
        "glass_closed_sightings": sum(1 for state in glass if state == "closed"),
        "glass_mean_confidence": (
            round(sum(glass_conf) / len(glass_conf), 3) if glass_conf else None
        ),
        "wooden_open_sightings_after_it_opens": sum(
            1 for state in wooden[TRUE_OPEN_FRAME:] if state == "open"
        ),
        "wooden_closed_sightings_after_it_opens": sum(
            1 for state in wooden[TRUE_OPEN_FRAME:] if state == "closed"
        ),
        "wooden_mean_confidence": (
            round(sum(wooden_conf) / len(wooden_conf), 3) if wooden_conf else None
        ),
        "frames_the_glass_door_shows_both_states_at_once": sum(
            1 for found in script
            if len({
                detection["cls"] for detection in found
                if detection["conf"] >= 0.40
                and DoorRegions.assign(
                    [MIDDLE],
                    [{
                        "box": [
                            detection["box"][0] / WIDTH,
                            detection["box"][1] / HEIGHT,
                            detection["box"][2] / WIDTH,
                            detection["box"][3] / HEIGHT,
                        ],
                        "state": detection["cls"],
                        "conf": detection["conf"],
                    }],
                )
            }) > 1
        ),
    }


def main() -> int:
    if not CLIP.exists():
        print(json.dumps({"__failed__": True, "missing": str(CLIP)}))
        return 1

    script = detections()

    out: dict[str, Any] = {
        "clip": {
            "frames": len(script),
            "fps": FPS,
            "seconds": round(len(script) * STEP, 2),
            "true_open_frame": TRUE_OPEN_FRAME,
            "true_open_at": round(TRUE_OPEN_T, 3),
        },
        "raw": raw(script),
        "evidence": evidence(script),
    }

    out["primary"] = replay(
        [("Left", LEFT), ("Middle", MIDDLE), ("Right", RIGHT)],
        "clip_primary.json",
        script,
    )

    if os.environ.get("PHASE4_CLIP_PLACEMENTS") != "0":
        out["glass_tight"] = replay(
            [("Middle", MIDDLE_TIGHT)], "clip_tight.json", script
        )
        out["glass_generous"] = replay(
            [("Middle", MIDDLE_GENEROUS)], "clip_generous.json", script
        )

    print(json.dumps(out))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except Exception:  # noqa: BLE001
        print(json.dumps({"__failed__": True,
                          "traceback": traceback.format_exc()}))
        raise SystemExit(1)
