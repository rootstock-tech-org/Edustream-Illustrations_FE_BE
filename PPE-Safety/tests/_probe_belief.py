"""
What a door has to do to be believed, and what happens when it cannot decide.

    DOOR-01  the code half. `_observe_state` resisted change *away from* an
             established state and nothing questioned a state that was simply
             believed first: the first sighting was taken outright, so a model
             wrong on frame one was wrong for the rest of the clip. The bar a
             change has to clear is three sightings, a 2:1 majority since the
             change began, and 0.8s elapsed; a first belief had none of it.

    DOOR-06  a perfect 50/50 alternation locked to whichever state arrived
             first and never revisited it, over 60–120 ticks at 0.1s, from
             either starting side. Where the evidence is a coin flip the
             module is to say so — and a 70/30 stream must still flip, or a
             module that calls every doorway unreliable has failed in the
             other direction.

    DOOR-14  severity computed from the unrounded duration while the rounded
             one is displayed: `open_seconds=1.0` beside `severity="medium"`,
             off a raw 0.96s against a 0.1s allowance.

    DOOR-15  the floor under a per-door allowance — the first severity on a
             0.1s threshold arrived at t=1.2s, and no allowance below the
             confirmation constants buys anything.

    and the four things the debug report verified exact and this phase is not
             to move: escalation at 1.0×/4.0×/10.0× of the threshold to
             ±0.01, staleness forcing severity to None past 30s, regions
             marked at one resolution landing at another, and a region
             matching a detection from 0.25× to 4.0× of its own area.

Every case is put to the shipped module, not to `_observe_state` alone: a
rule being right in a helper is not the same as its being wired into what an
operator reads. Detections are staged — the reference model finds a door in
one frame of three on real footage, and measuring a belief rule through it
would measure the detector.

Prints one JSON object on its last line.

    cd backend && PYTHONPATH=$PWD .venv/bin/python ../tests/_probe_belief.py
"""

import json
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

import app.modules.door.service  # noqa: E402,F401
from app.vision.door_regions import MATCH_IOU, DoorRegions  # noqa: E402

door_service = sys.modules["app.modules.door.service"]

WIDTH, HEIGHT = 640, 480

#: One marked doorway, and a detection sitting exactly on it.
DOORWAY = [0.30, 0.30, 0.50, 0.80]

#: A real frame from the office clip. Nothing here is decided by its pixels —
#: the detections are staged — but Phase 2's gate reads them, and a picture it
#: refuses puts "too flat to check" over every summary in this file.
OFFICE_FRAME = SCRATCH / "diag" / "doorcam_0.png"
CLIP = SCRATCH / "doorcam.y4m"


def picture() -> np.ndarray:
    import cv2  # noqa: PLC0415

    if OFFICE_FRAME.exists():
        frame = cv2.imread(str(OFFICE_FRAME))
    else:
        capture = cv2.VideoCapture(str(CLIP))
        ok, frame = capture.read()
        capture.release()
        if not ok:
            frame = None

    if frame is None:
        raise SystemExit(f"no readable office frame at {OFFICE_FRAME} or {CLIP}")

    return cv2.resize(frame, (WIDTH, HEIGHT))


class Box:
    def __init__(self, class_index: int, box, conf: float, width=WIDTH,
                 height=HEIGHT):
        self.cls = [int(class_index)]
        self.xyxy = [
            np.array(
                [box[0] * width, box[1] * height, box[2] * width, box[3] * height],
                dtype=float,
            )
        ]
        self.conf = [float(conf)]


class Result:
    def __init__(self, boxes):
        self.boxes = boxes


class Staged:
    """A model that reports whatever the current case says it reports."""

    names = {0: "closed", 1: "open"}
    _index = {"closed": 0, "open": 1}

    def __init__(self):
        self.saying: Optional[str] = None
        self.box = DOORWAY
        self.conf = 0.80
        self.size = (WIDTH, HEIGHT)

    def __call__(self, frame, verbose=False, conf=0.40):
        if self.saying is None or self.conf < conf:
            return [Result([])]

        height, width = frame.shape[:2]

        return [
            Result([Box(self._index[self.saying], self.box, self.conf,
                        width=width, height=height)])
        ]


def fresh(name: str, threshold: Optional[float] = None):
    """A door service on its own scratch store and its own clock."""
    MINE.mkdir(parents=True, exist_ok=True)
    path = MINE / name

    if path.exists():
        path.unlink()

    store = DoorRegions(path=path)
    door_service.door_regions = store

    service = door_service.DoorService()
    service._browser_camera = True

    model = Staged()
    service._get_model = lambda: model

    clock = {"t": 1000.0}
    service._now = lambda: clock["t"]

    door = store.add("browser", DOORWAY, name="Doorway", open_seconds=threshold)

    return service, store, clock, model, door


def row(service, result: dict[str, Any]) -> dict[str, Any]:
    """The one door's row, as an operator would read it."""
    doors = result.get("detections") or [{}]

    return {
        "state": doors[0].get("state"),
        "severity": doors[0].get("severity"),
        "open_seconds": doors[0].get("open_seconds"),
        "threshold_seconds": doors[0].get("threshold_seconds"),
        "stale": doors[0].get("stale"),
        "summary": result.get("summary"),
        "label": (result.get("regions") or [{}])[0].get("label"),
        "tone": (result.get("regions") or [{}])[0].get("tone"),
        "alert": result.get("alert"),
        "status": result.get("status"),
        "doors_open": result.get("doors_open"),
        "doors_closed": result.get("doors_closed"),
        "doors_unknown": result.get("doors_unknown"),
        "readable": result.get("readable"),
        "unreadable_reason": result.get("unreadable_reason"),
        "people_unverified": result.get("people_unverified"),
        # What would have reached the event history, which is the difference
        # between a state on a screen and an alert somebody is paged about.
        "events": len(service.events(result)),
    }


def feed(service, clock, model, frame, saying: Optional[str], ticks: int,
         step: float = 1 / 15.0) -> list[dict[str, Any]]:
    """`ticks` frames of the model saying one thing, and every row it produced."""
    rows = []

    for _ in range(ticks):
        model.saying = saying
        clock["t"] += step
        _, result = service.process(frame)
        rows.append({**row(service, result), "t": round(clock["t"], 4)})

    return rows


def alternate(service, clock, model, frame, first: str, ticks: int,
              step: float = 0.1, bias: float = 0.5) -> list[dict[str, Any]]:
    """
    A stream split between the two states, `bias` of it saying `first`.

    At bias 0.5 this is the perfect alternation that used to lock to whichever
    side happened to arrive first; at 0.7 it is the biased stream that has to
    go on flipping, because a module that answers "unreliable" to everything
    has replaced one wrong answer with another.

    The two states are interleaved as evenly as the ratio allows rather than
    run together — a block of one followed by a block of the other is a door
    that changed, which is a different thing from a door nobody can read.
    """
    other = "closed" if first == "open" else "open"
    rows = []
    # Primed so the first tick is the state the caller named: which side
    # arrives first is the whole of the reported failure, and a probe whose
    # label says "from open" while it feeds "closed" first would report the
    # right answer to the wrong question.
    credit = 1.0 - bias

    for _ in range(ticks):
        credit += bias

        if credit >= 1.0:
            wanted = first
            credit -= 1.0
        else:
            wanted = other

        model.saying = wanted
        clock["t"] += step
        _, result = service.process(frame)
        rows.append({**row(service, result), "t": round(clock["t"], 4),
                     "said": wanted})

    return rows


def settled(rows: list[dict[str, Any]], state: str) -> Optional[float]:
    """When the module first reported this state, in seconds from the start."""
    if not rows:
        return None

    start = rows[0]["t"]

    for entry in rows:
        if entry["state"] == state:
            return round(entry["t"] - start, 4)

    return None


def first_severity(rows: list[dict[str, Any]]) -> dict[str, Any]:
    if not rows:
        return {"at": None, "severity": None}

    start = rows[0]["t"]

    for entry in rows:
        if entry["severity"]:
            return {"at": round(entry["t"] - start, 4),
                    "severity": entry["severity"],
                    "open_seconds": entry["open_seconds"]}

    return {"at": None, "severity": None}


def states(rows: list[dict[str, Any]]) -> dict[str, int]:
    return {
        str(state): sum(1 for entry in rows if entry["state"] == state)
        for state in {entry["state"] for entry in rows}
    }


def tidy(store, name: str) -> None:
    store.clear("browser")

    if (MINE / name).exists():
        (MINE / name).unlink()


# ----------------------------------------------------------------------


def first_belief(frame) -> dict[str, Any]:
    """
    What it now takes for a door nobody has seen before to be believed.

    Three streams, all from a doorway with no remembered state: a clean
    continuous one, a single sighting followed by silence, and a single
    sighting contradicted by everything after it. The middle one is the glass
    door's failure in miniature — one "open" and nothing else used to be a
    door open on the operator's screen, with a timer running.
    """
    out: dict[str, Any] = {}

    service, store, clock, model, _ = fresh("belief_clean.json")
    # Long enough to cross the module's own three-second allowance, so this
    # case answers both halves of the question: when a new doorway is
    # believed, and whether it still raises anything afterwards.
    rows = feed(service, clock, model, frame, "open", 90)
    out["clean_open_stream"] = {
        "believed_open_after": settled(rows, "open"),
        "states": states(rows),
        "first_severity": first_severity(rows),
        "rows_head": rows[:12],
    }
    tidy(store, "belief_clean.json")

    service, store, clock, model, _ = fresh("belief_once.json")
    rows = feed(service, clock, model, frame, "open", 1)
    rows += feed(service, clock, model, frame, None, 40)
    out["one_sighting_then_silence"] = {
        "believed_open_after": settled(rows, "open"),
        "states": states(rows),
        "first_severity": first_severity(rows),
        "final": rows[-1],
    }
    tidy(store, "belief_once.json")

    service, store, clock, model, _ = fresh("belief_contradicted.json")
    rows = feed(service, clock, model, frame, "open", 1)
    rows += feed(service, clock, model, frame, "closed", 40)
    out["one_sighting_then_contradicted"] = {
        "believed_open_after": settled(rows, "open"),
        "believed_closed_after": settled(rows, "closed"),
        "states": states(rows),
        "first_severity": first_severity(rows),
        "final": rows[-1],
    }
    tidy(store, "belief_contradicted.json")

    return out


def split_doorway(frame) -> dict[str, Any]:
    """
    A doorway the model cannot read, and one it merely disagrees about.

    60 and 120 ticks at 0.1s, started from each side, because the reported
    failure was that the answer depended on which sighting arrived first and
    on nothing else afterwards.
    """
    out: dict[str, Any] = {}

    for ticks in (60, 120):
        for first in ("open", "closed"):
            name = f"split_{ticks}_{first}.json"
            service, store, clock, model, _ = fresh(name)
            rows = alternate(service, clock, model, frame, first, ticks)

            out[f"fifty_fifty_{ticks}_from_{first}"] = {
                "states": states(rows),
                "final": rows[-1],
                "ever_alerted": any(entry["alert"] for entry in rows),
                "ever_severity": any(entry["severity"] for entry in rows),
                "events_at_end": rows[-1]["events"],
                "settled_open_after": settled(rows, "open"),
                "settled_closed_after": settled(rows, "closed"),
                "unreliable_after": settled(rows, "unreliable"),
                "summaries": sorted({entry["summary"] for entry in rows}),
            }
            tidy(store, name)

    # 70/30, both directions. This one has to reach a state and keep reaching
    # it: the pathology is the coin flip, not disagreement as such.
    for first in ("open", "closed"):
        name = f"seventy_{first}.json"
        service, store, clock, model, _ = fresh(name)
        rows = alternate(service, clock, model, frame, first, 120, bias=0.7)

        out[f"seventy_thirty_from_{first}"] = {
            "states": states(rows),
            "final": rows[-1],
            "settled_after": settled(rows, first),
            "unreliable_after": settled(rows, "unreliable"),
            "said": {
                state: sum(1 for entry in rows if entry["said"] == state)
                for state in ("open", "closed")
            },
        }
        tidy(store, name)

    # And out again. A doorway called unreliable has to be able to stop being
    # unreliable — somebody cleans the lens, the sun moves — or the module has
    # swapped a state it never revisits for another state it never revisits,
    # which is the defect this phase is named for wearing a different word.
    name = "recovery.json"
    service, store, clock, model, _ = fresh(name)
    confused = alternate(service, clock, model, frame, "open", 120)
    recovered_at = clock["t"]
    recovering = feed(service, clock, model, frame, "closed", 90)

    out["recovers_when_the_evidence_clears"] = {
        "unreliable_first": confused[-1]["state"],
        "closed_reported_after": settled(recovering, "closed"),
        "final": recovering[-1],
        "recovery_began_at": round(recovered_at, 3),
        "states_while_recovering": states(recovering),
    }
    tidy(store, name)

    # A door that really does change, once, on a clean stream: the case a
    # split-detector must not mistake for a coin flip.
    name = "genuine_change.json"
    service, store, clock, model, _ = fresh(name)
    settling = feed(service, clock, model, frame, "closed", 60)
    opened_at = clock["t"]
    opening = feed(service, clock, model, frame, "open", 90)

    out["genuine_change_after_settling"] = {
        "closed_first": settling[-1]["state"],
        "open_reported_after": settled(opening, "open"),
        "first_severity": first_severity(opening),
        "unreliable_after": settled(opening, "unreliable"),
        "opened_at": round(opened_at, 3),
        "states_after_opening": states(opening),
    }
    tidy(store, name)

    return out


def constants(frame) -> dict[str, Any]:
    """
    The four numbers the debug report verified exact, re-asked.

    Escalation boundaries, staleness, resolution independence and the region
    size band. None of them is this phase's to move, and all four sit close
    enough to the timing it does move to be worth asking again rather than
    assuming.
    """
    out: dict[str, Any] = {}

    service, store, clock, model, _ = fresh("constants.json")

    # Escalation, from the module's own severity rule, at both the default
    # threshold and a per-door one, either side of every boundary.
    escalation = {}
    for threshold in (3.0, 10.0):
        for multiple in (1.0, 4.0, 10.0):
            for offset in (-0.01, 0.0, +0.01):
                seconds = threshold * multiple + offset
                escalation[f"{threshold}x{multiple}{offset:+}"] = (
                    service._severity(seconds, threshold)
                )
    out["escalation"] = escalation
    out["escalate_at"] = list(door_service.ESCALATE_AT)
    out["stale_after"] = door_service.STALE_AFTER
    out["state_confirm_seconds"] = door_service.STATE_CONFIRM_SECONDS
    out["min_confirm_sightings"] = door_service.MIN_CONFIRM_SIGHTINGS
    out["state_window_seconds"] = door_service.STATE_WINDOW_SECONDS
    tidy(store, "constants.json")

    # Staleness: a door confirmed open, then nothing at all. It escalates up
    # to the cutoff, and past it says so and stops.
    name = "stale.json"
    service, store, clock, model, _ = fresh(name)
    feed(service, clock, model, frame, "open", 40)

    stale_rows = {}
    for unseen in (25.0, 29.0, 31.0, 45.0):
        clock["t"] += 0.5
        model.saying = None
        # Wind the clock to exactly this long since the last sighting.
        held = service._watched[list(service._watched)[0]]
        clock["t"] = held["last_seen"] + unseen
        _, result = service.process(frame)
        stale_rows[f"unseen_{unseen}"] = row(service, result)

    out["staleness"] = stale_rows
    tidy(store, name)

    # Resolution: marked at 640x480, analysed at three sizes.
    import cv2  # noqa: PLC0415

    resolutions = {}
    for label, size in (("640x480", (640, 480)),
                        ("1920x1080", (1920, 1080)),
                        ("320x240", (320, 240))):
        name = f"resolution_{label}.json"
        service, store, clock, model, _ = fresh(name)
        rows = feed(service, clock, model, cv2.resize(frame, size), "open", 60)
        resolutions[label] = {
            "state": rows[-1]["state"],
            "severity": rows[-1]["severity"],
            "open_seconds": rows[-1]["open_seconds"],
            "believed_after": settled(rows, "open"),
            "first_severity": first_severity(rows),
        }
        tidy(store, name)

    out["resolution"] = resolutions

    # The size band a marked region matches a detection across, asked of the
    # matcher the module actually calls.
    band = {}
    for ratio in (0.20, 0.24, 0.25, 0.26, 1.0, 3.9, 4.0, 4.2, 5.0):
        scale = ratio ** 0.5
        cx = (DOORWAY[0] + DOORWAY[2]) / 2
        cy = (DOORWAY[1] + DOORWAY[3]) / 2
        half_w = (DOORWAY[2] - DOORWAY[0]) / 2 * scale
        half_h = (DOORWAY[3] - DOORWAY[1]) / 2 * scale

        detection = {
            "box": [cx - half_w, cy - half_h, cx + half_w, cy + half_h],
            "state": "open",
            "conf": 0.8,
        }
        band[f"{ratio:.2f}x"] = bool(
            DoorRegions.assign([DOORWAY], [detection])
        )

    out["region_size_band"] = band
    out["match_iou"] = MATCH_IOU

    return out


def rounded_severity(frame) -> dict[str, Any]:
    """
    DOOR-14 · the severity beside a duration must be that duration's severity.

    A 0.1s allowance, so every tenth of a second crosses a boundary and the
    rounding that produced `open_seconds=1.0 · severity="medium"` happens
    dozens of times in one run rather than once in a lucky frame. Every row is
    checked against the module's own severity rule applied to the number
    printed next to it.

    The same run answers DOOR-15: the first severity a 0.1s allowance can
    reach, which is the floor under any per-door threshold.
    """
    name = "rounding.json"
    service, store, clock, model, _ = fresh(name, threshold=0.1)

    rows = []
    for _ in range(400):
        model.saying = "open"
        clock["t"] += 0.01
        _, result = service.process(frame)
        rows.append({**row(service, result), "t": round(clock["t"], 4)})

    disagreements = [
        {
            "t": round(entry["t"] - rows[0]["t"], 3),
            "open_seconds": entry["open_seconds"],
            "severity": entry["severity"],
            "severity_the_displayed_duration_earns": service._severity(
                entry["open_seconds"], entry["threshold_seconds"]
            ),
        }
        for entry in rows
        if entry["state"] == "open"
        and entry["severity"] != service._severity(
            entry["open_seconds"], entry["threshold_seconds"]
        )
    ]

    out = {
        "rows": len(rows),
        "open_rows": sum(1 for entry in rows if entry["state"] == "open"),
        "disagreements": len(disagreements),
        "examples": disagreements[:6],
        "first_severity": first_severity(rows),
        "believed_open_after": settled(rows, "open"),
        "threshold": rows[-1]["threshold_seconds"],
    }

    # The reported row itself: a door open for a real 0.96 seconds against a
    # 0.1s allowance, which is displayed as 1.0 — the case that put
    # `open_seconds: 1.0` beside `severity: "medium"` when 1.0 earns "high".
    # Reached by winding the clock to a known distance from the moment the
    # module itself says the door opened, so it does not depend on a tick
    # landing there by luck.
    held = service._watched.get(list(service._watched)[0], {}) \
        if service._watched else {}
    since = held.get("since")

    if since is not None:
        model.saying = "open"
        clock["t"] = since + 0.96
        _, result = service.process(frame)
        reported = row(service, result)
        out["reported_case"] = {
            "raw_open_seconds": 0.96,
            "displayed": reported["open_seconds"],
            "severity": reported["severity"],
            "severity_the_displayed_duration_earns": service._severity(
                reported["open_seconds"], reported["threshold_seconds"]
            ),
            "severity_the_raw_duration_earns": service._severity(
                0.96, reported["threshold_seconds"]
            ),
        }

    tidy(store, name)

    # The same allowance on a door that was already settled shut, which is the
    # case DOOR-15 was measured on: the floor is what a change of state costs,
    # not what a first sighting costs.
    name = "floor.json"
    service, store, clock, model, _ = fresh(name, threshold=0.1)
    feed(service, clock, model, frame, "closed", 60)
    opened_at = clock["t"]
    rows = feed(service, clock, model, frame, "open", 90)

    out["floor_after_a_change"] = {
        "first_severity": first_severity(rows),
        "believed_open_after": settled(rows, "open"),
        "opened_at": round(opened_at, 3),
    }

    tidy(store, name)

    return out


def unreadable(frame) -> dict[str, Any]:
    """
    Phase 2's one-directional rule, on a door that is also in every state.

    `readable: false` must produce `status: "unverified"` and nothing else may
    — including, now, a doorway the module has decided it cannot read, which
    is a different sentence about a different thing and must not borrow this
    one's status.
    """
    # The two ways Phase 2's gate refuses a picture, and a picture it accepts.
    # Both refusals are produced from the clip's own frame rather than from a
    # constant array, so what is being tested is the gate and not a shortcut
    # through it.
    dark = (frame.astype("float32") * 0.02).astype("uint8")
    flat = np.full_like(frame, 128)

    out: dict[str, Any] = {}

    for label, picture_in in (("dark", dark), ("flat", flat),
                              ("readable", frame)):
        name = f"unreadable_{label}.json"
        service, store, clock, model, _ = fresh(name)
        rows = feed(service, clock, model, picture_in, "open", 40)
        out[label] = rows[-1]
        tidy(store, name)

    return out


def uncertainty(frame) -> dict[str, Any]:
    """
    Phase 2's three keys, on every shape of answer this module can give.

    Contract §2: doors report `readable`, `unreadable_reason` and
    `people_unverified`, and `people_unverified` stays 0 — including on
    whatever the new state turns out to be called, which is the one shape of
    answer no earlier suite has ever seen.
    """
    name = "uncertainty.json"
    service, store, clock, model, _ = fresh(name)

    seen: dict[str, dict[str, Any]] = {}

    rows = feed(service, clock, model, frame, None, 3)
    rows += feed(service, clock, model, frame, "closed", 40)
    rows += alternate(service, clock, model, frame, "open", 120)
    rows += feed(service, clock, model, frame, "open", 60)

    for entry in rows:
        seen.setdefault(str(entry["state"]), entry)

    tidy(store, name)

    return {
        "by_state": seen,
        "people_unverified_always_zero": all(
            entry["people_unverified"] == 0 for entry in rows
        ),
        "keys_always_present": all(
            "readable" in entry and "unreadable_reason" in entry
            and "people_unverified" in entry
            for entry in rows
        ),
    }


def documentation() -> dict[str, Any]:
    """
    Where an operator setting a threshold would find the two numbers.

    DOOR-10 and DOOR-15 are design defects: the fix is a published figure, so
    what is collected here is every string the settings page is served or the
    module carries about itself, for the suite to read the numbers out of.
    """
    service = door_service.DoorService()

    config = service.get_config()

    return {
        "config_keys": sorted(config),
        "config_strings": {
            key: value for key, value in config.items()
            if isinstance(value, str)
        },
        "config": {
            key: value for key, value in config.items()
            if not isinstance(value, (list, dict))
        },
        "docstrings": {
            "module": door_service.__doc__ or "",
            "service": door_service.DoorService.__doc__ or "",
            "configure": door_service.DoorService.configure.__doc__ or "",
            "get_config": door_service.DoorService.get_config.__doc__ or "",
            "calibrate": door_service.DoorService._calibrate.__doc__ or "",
            "observe_state": door_service._observe_state.__doc__ or "",
        },
    }


def main() -> int:
    frame = picture()

    out = {
        "first_belief": first_belief(frame),
        "split": split_doorway(frame),
        "constants": constants(frame),
        "rounding": rounded_severity(frame),
        "uncertainty": uncertainty(frame),
        "unreadable": unreadable(frame),
        "documentation": documentation(),
    }

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
