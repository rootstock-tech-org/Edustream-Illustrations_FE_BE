"""
What the two region stores accept, and whether what they accept can be seen.

Three questions, all of them in process because the store is where the answers
live and driving them over HTTP would leave marked areas on a real deployment:

  1. Every shape of bad box. NaN and Infinity coordinates were accepted and
     stored unclamped — every comparison against NaN is False, so `min`/`max`
     waved them through — leaving a marked area that could never match anything
     and read "not seen yet" for ever, with no error raised at any point
     (DOOR-13). Wrong-shaped boxes were refused, correctly, with the wrong
     sentence: a 3-element box, a 5-element box, `None` and a string were all
     reported as "too small to be a door" (DOOR-16).

  2. Every shape of bad per-region threshold. `<= 0` is False for NaN, so a
     per-area allowance of NaN was stored, and every later comparison against
     it was False too.

  3. Whether the smallest region the store now accepts can actually be
     matched. `MIN_SIZE = 0.02` per side admits a region of 0.0004 of the
     frame; the door module discards any detection under `MIN_DOOR_AREA` of
     the frame and then wants an IoU of `MATCH_IOU` against one of the
     survivors. The best score a region of area `r` can ever get against a
     detection of area `d` is `r / d` — the detection swallowing the region
     whole — so the floor is computed here from the module's own constants and
     then *demonstrated* by asking `match()` with the best detection the
     module would ever allow. Nothing is assumed.

Both stores are isolated to files in this directory. Prints one JSON object on
stdout. Run with cwd=backend.
"""

import json
from pathlib import Path
from typing import Any, Optional

HERE = Path(__file__).resolve().parent

from app.modules.workstation.service import WorkstationService  # noqa: E402
from app.vision.door_regions import DoorRegions  # noqa: E402
from app.vision.named_regions import iou  # noqa: E402
from app.vision.workstation_regions import WorkstationRegions  # noqa: E402

NAN = float("nan")
INF = float("inf")

#: Every way a box can be wrong, plus the ones that must still work. The nine
#: from `capture_baseline.py` keep their labels so the two can be read side by
#: side.
BOXES: dict[str, Any] = {
    "ordinary": [0.2, 0.2, 0.5, 0.8],
    "tiny": [0.2, 0.2, 0.21, 0.21],
    "nan_left": [NAN, 0.1, 0.3, 0.3],
    "nan_all": [NAN, NAN, NAN, NAN],
    "infinite": [0.1, 0.1, INF, 0.3],
    "negative_infinite": [-INF, 0.1, 0.3, 0.3],
    "reversed": [0.8, 0.8, 0.2, 0.2],
    "outside": [-0.5, -0.5, 1.5, 1.5],
    "far_outside": [-99999, -99999, 99999, 99999],
    "whole_frame": [0.0, 0.0, 1.0, 1.0],
    "zero_area": [0.4, 0.4, 0.4, 0.4],
    "zero_width": [0.4, 0.2, 0.4, 0.8],
    "three_long": [0.1, 0.2, 0.3],
    "five_long": [0.1, 0.2, 0.3, 0.4, 0.5],
    "empty_list": [],
    "not_a_list": "nope",
    "none": None,
    "a_number": 5,
    "nested": [[0.1, 0.2], [0.3, 0.4]],
    "string_numbers": ["0.1", "0.2", "0.5", "0.8"],
    "none_inside": [0.1, None, 0.5, 0.8],
    "bools": [True, False, True, False],
    "dict_keys": {"x1": 0.1, "y1": 0.2, "x2": 0.5, "y2": 0.8},
}

#: Per-region allowances. The two ends of the documented rule, either side of
#: the ceiling, and the values that are not numbers at all.
THRESHOLDS: dict[str, Any] = {
    "none": None,
    "empty_string": "",
    "ordinary": 30,
    "zero": 0,
    "just_above_zero": 1e-9,
    "negative": -1,
    "nan": NAN,
    "infinity": INF,
    "negative_infinity": -INF,
    "huge": 999999,
    "hour": 3600,
    "just_over_an_hour": 3600.001,
    "text": "abc",
    "list": [30],
}


def attempt(call) -> dict[str, Any]:
    """Run `call` and record what came back, or how it refused."""
    try:
        return {"accepted": True, "result": repr(call())}
    except Exception as exc:  # noqa: BLE001
        return {
            "accepted": False,
            "error": type(exc).__name__,
            "message": str(exc),
        }


def try_add(store, box) -> Optional[dict[str, Any]]:
    """Mark a box on a scratch camera, or None if the store refuses it."""
    try:
        return store.add("__smallest__", box, "")
    except ValueError:
        return None


#: Widths tried when hunting for the smallest region a store will take.
#:
#: Fine — one ten-thousandth, the store's own rounding — through the range a
#: minimum-area box can plausibly live in, and coarser above it. A grid coarser
#: than the store's rounding would miss the true minimum: the workstation
#: store's smallest is a square of exactly `MIN_SIZE`, and a sweep that never
#: lands on 0.02 reports something larger and calls it the floor.
SWEEP_WIDTHS = [round(i * 0.0001, 4) for i in range(1, 1001)] + [
    round(0.1 + i * 0.005, 4) for i in range(1, 81)
]


def smallest_accepted(store, bisections: int = 30) -> dict[str, Any]:
    """
    The smallest-area box this store will accept, found by asking it.

    Swept rather than read off a constant. The rule is the store's own, it may
    be a per-side rule, an area rule or both, and the point of the exercise is
    to measure what the store *does* rather than to restate what it says it
    does. Every aspect ratio from a thin sliver to a square is tried, and the
    shortest accepted height for each is bisected to a resolution finer than
    the four decimal places the store rounds to.
    """
    # Thousands of marks and unmarks; the file is scratch and rewriting it
    # each time would be the whole cost of the search.
    store._save = lambda: None  # type: ignore[method-assign]

    best: Optional[tuple[float, list[float]]] = None

    for width in SWEEP_WIDTHS:
        low, high = 0.0, 0.5
        accepted = None

        for _ in range(bisections):
            middle = (low + high) / 2

            probe = try_add(store, [0.2, 0.2, 0.2 + width, 0.2 + middle])

            if probe is None:
                low = middle
            else:
                store.remove("__smallest__", probe["id"])
                accepted = probe["box"]
                high = middle

        if accepted is None:
            continue

        area = (accepted[2] - accepted[0]) * (accepted[3] - accepted[1])

        if best is None or area < best[0]:
            best = (area, accepted)

    store.clear("__smallest__")

    if best is None:
        return {"found": False}

    return {"found": True, "area": best[0], "box": best[1]}


out: dict[str, Any] = {"stores": {}}

stores = {
    "door": DoorRegions(path=HERE / "probe_phase1_door_boxes.json"),
    "workstation": WorkstationRegions(
        path=HERE / "probe_phase1_ws_boxes.json"
    ),
}

for name, store in stores.items():
    store.clear("__probe__")
    store.clear("__smallest__")

    entry: dict[str, Any] = {
        "noun": store.noun,
        "constants": {
            key: getattr(type(store), key, None)
            for key in ("MIN_AREA", "MAX_THRESHOLD", "MATCH_IOU")
        },
        "module_constants": {},
        "boxes": {},
        "updates": {},
        "thresholds": {},
    }

    from app.vision import named_regions as shared

    entry["constants"]["MIN_SIZE"] = shared.MIN_SIZE
    entry["constants"]["DUPLICATE_IOU"] = shared.DUPLICATE_IOU

    for label, box in BOXES.items():
        outcome = attempt(
            lambda s=store, b=box: s.add("__probe__", b, f"probe {label}")
        )

        # What was actually written down, rather than what was handed back:
        # the whole of DOOR-13 is that the two used to differ, and a store
        # holding a NaN corner is the defect whatever the reply said.
        if outcome["accepted"]:
            held = store.for_source("__probe__")
            outcome["stored_box"] = held[-1]["box"] if held else None

        entry["boxes"][label] = outcome
        store.clear("__probe__")

    # The same rules must hold when an existing area is moved. `update` had its
    # own, shorter refusal and never consulted the store's area rule at all, so
    # a box refused at marking could be arrived at by marking a legal one and
    # dragging it smaller.
    anchor = store.add("__probe__", [0.2, 0.2, 0.6, 0.8], "anchor")
    for label, box in BOXES.items():
        entry["updates"][label] = attempt(
            lambda s=store, b=box, i=anchor["id"]: s.update(
                "__probe__", i, {"box": b}
            )
        )
    store.clear("__probe__")

    for label, value in THRESHOLDS.items():
        entry["thresholds"][label] = attempt(
            lambda s=store, v=value: s.add(
                "__probe__", [0.2, 0.2, 0.5, 0.8], f"t {label}", v
            )
        )
        store.clear("__probe__")

    entry["smallest_accepted"] = smallest_accepted(store)

    # Either side of that floor, at the finest step the store can tell apart.
    # A floor is only a floor if the box below it is refused and the box above
    # it is taken; measured against where the floor actually is rather than
    # against the constant it is supposed to be.
    if entry["smallest_accepted"].get("found"):
        floor = entry["smallest_accepted"]["box"]
        step = 0.0001

        entry["boundary"] = {
            "at the floor": attempt(
                lambda s=store, b=list(floor): s.add("__probe__", b, "")
            ),
        }
        store.clear("__probe__")

        entry["boundary"]["a hair under it"] = attempt(
            lambda s=store, b=[floor[0], floor[1], floor[2], floor[3] - step]:
            s.add("__probe__", b, "")
        )
        store.clear("__probe__")

        entry["boundary"]["a hair over it"] = attempt(
            lambda s=store, b=[floor[0], floor[1], floor[2], floor[3] + step]:
            s.add("__probe__", b, "")
        )
        store.clear("__probe__")

    out["stores"][name] = entry

# ----------------------------------------------------------------------
# Can the smallest accepted region ever be matched?
# ----------------------------------------------------------------------

door_store = stores["door"]

try:
    from app.vision.door_regions import MIN_DOOR_AREA, MATCH_IOU
except ImportError:  # pragma: no cover - the constants may live in the service
    from app.modules.door.service import MIN_DOOR_AREA, MATCH_IOU

smallest = out["stores"]["door"]["smallest_accepted"]

door_match: dict[str, Any] = {
    "min_detection_area": MIN_DOOR_AREA,
    "match_iou": MATCH_IOU,
    "region_area": smallest.get("area"),
}

if smallest.get("found"):
    region = smallest["box"]
    region_width = region[2] - region[0]
    region_height = region[3] - region[1]
    region_area = region_width * region_height

    # The best detection the module would ever let through, for this region:
    # the smallest one it does not discard, shaped and placed to swallow the
    # region whole. Nothing scores higher — the intersection cannot exceed the
    # region and the union cannot fall below the detection.
    if region_area >= MIN_DOOR_AREA:
        detection = list(region)
    else:
        scale = (MIN_DOOR_AREA / region_area) ** 0.5
        grow_x = region_width * (scale - 1) / 2
        grow_y = region_height * (scale - 1) / 2
        detection = [
            region[0] - grow_x,
            region[1] - grow_y,
            region[2] + grow_x,
            region[3] + grow_y,
        ]

    detection_area = (detection[2] - detection[0]) * (detection[3] - detection[1])

    best_iou = iou(region, detection)
    matched = door_store.match(region, [{"box": detection}])

    door_match.update(
        {
            "region_box": region,
            "best_detection_box": detection,
            "best_detection_area": detection_area,
            "best_possible_iou": best_iou,
            "match_returned": matched,
            "matchable": matched is not None,
            # How much room there is between the best a legal region can do and
            # the bar it has to clear. Zero means the smallest legal region is
            # matchable only against a detection of exactly the smallest legal
            # size, perfectly centred.
            "headroom": best_iou - MATCH_IOU,
        }
    )

    # The same smallest-permitted region against a detection of the size a
    # real door actually comes back as — 1.9% of the frame was the smallest on
    # the office footage. This is the number that decides whether a region at
    # the floor is any use in the field, as opposed to in the limit.
    typical_door_area = 0.019
    door_match["against_a_real_door_detection"] = {
        "detection_area": typical_door_area,
        "best_possible_iou": region_area / typical_door_area,
        "matchable": region_area / typical_door_area >= MATCH_IOU,
        # DOOR-08 in its own terms: the band of region sizes the marking API
        # accepts and no realistic detection can ever match. It shrinks as the
        # floor rises and closes when the floor reaches MATCH_IOU times the
        # size a real door comes back as.
        "accepted_but_dead_below": MATCH_IOU * typical_door_area,
        "accepted_but_dead_band": (
            [region_area, MATCH_IOU * typical_door_area]
            if region_area < MATCH_IOU * typical_door_area
            else None
        ),
    }

    # A real doorway, for contrast: the office footage's smallest was 1.9% of
    # the frame. It must clear the bar comfortably, or the floor is in the
    # wrong place.
    ordinary = [0.30, 0.30, 0.44, 0.94]
    ordinary_detection = [0.31, 0.32, 0.43, 0.92]
    door_match["an_ordinary_doorway"] = {
        "region_area": (ordinary[2] - ordinary[0]) * (ordinary[3] - ordinary[1]),
        "iou": iou(ordinary, ordinary_detection),
        "match_returned": door_store.match(
            ordinary, [{"box": ordinary_detection}]
        ),
    }

out["door_matchability"] = door_match

# ----------------------------------------------------------------------
# And the workstation store, which matches by point rather than by overlap
# ----------------------------------------------------------------------
#
# There is no minimum detection size and no IoU bar in this module: a person
# is at a workstation when their feet or their body centre land inside it. So
# the question "can the smallest region the store accepts ever be occupied"
# is asked of `_at` with a person standing in it.

ws_smallest = out["stores"]["workstation"]["smallest_accepted"]

if ws_smallest.get("found"):
    region = ws_smallest["box"]
    width, height = 640, 480
    pixels = (
        region[0] * width,
        region[1] * height,
        region[2] * width,
        region[3] * height,
    )

    # Somebody standing at it: their feet in the middle of the region.
    centre_x = (region[0] + region[2]) / 2 * width
    feet_y = (region[1] + region[3]) / 2 * height
    person = (centre_x - 30, feet_y - 200, centre_x + 30, feet_y)

    # And somebody walking past it, well clear.
    passer = (10.0, 10.0, 70.0, 210.0)

    out["workstation_occupiable"] = {
        "region_box": region,
        "region_area": (region[2] - region[0]) * (region[3] - region[1]),
        "person_at_it_counts": WorkstationService._at(person, pixels),
        "passer_by_does_not": WorkstationService._at(passer, pixels),
    }

for store in stores.values():
    store.clear("__probe__")
    store.clear("__smallest__")

for scratch in (
    HERE / "probe_phase1_door_boxes.json",
    HERE / "probe_phase1_ws_boxes.json",
):
    scratch.unlink(missing_ok=True)

print(json.dumps(out))
