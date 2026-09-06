"""
Whose gear is whose, at the numbers the debug report printed.

    MASK-02  person A `(0,0,260,320)` — large, close, actually maskless — and
             person B nested inside them wearing a mask at (85,10,115,55).
             Processed largest-first against the full box width, A claimed B's
             mask. B must keep it.

    PPE-03   `f_0300.jpg`, unmodified. The detector returns one person box
             spanning two workers; the second man's blue helmet is found at
             0.829, matches nobody, and is dropped. The frame then reads
             `people_total=1`, "Wearing the right gear".

    PPE-08   the same contest decided by size rather than by fit: the larger,
             nearer person always won. A helmet over the smaller person's head
             belongs to the smaller person.

    gloves   the too-far floor Phase 2 left outstanding. On the report's own
             distance frames Safety Gear withholds a verdict and Gloves does
             not, so a person too small to resolve a hand on is reported as
             compliant.

    the two rules, in the modules rather than in the helper. One item goes to
    one person; one person holds at most one of each item; and an item nobody
    can hold is surfaced rather than dropped in silence.

Detections are staged for the geometry cases — the questions are about exact
box coordinates, and no photograph contains a person whose box provably
contains another's. Everything with a number from the report attached is run
on the report's own picture, unmodified.

Prints one JSON object on its last line.

    cd backend && PYTHONPATH=$PWD .venv/bin/python ../tests/_probe_gear.py
"""

import json
import sys
import traceback
from pathlib import Path
from typing import Any, Optional

import cv2
import numpy as np

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
sys.path.insert(0, str(REPO / "backend"))

SCRATCH = Path(
    "/tmp/claude-0/-home-user-vikasgroup-visual-analytics-fullstack-beta"
    "/34a9e001-1e22-5fc0-a6b4-dd924c10c2cc/scratchpad"
)
PPE_FRAME = SCRATCH / "ppe_test" / "f_0300.jpg"
DIST_50 = HERE / "_probe_dist_50.jpg"
DIST_35 = HERE / "_probe_dist_35.jpg"
PHOTO = HERE / "fixtures" / "check_photo.jpg"

#: The two nested people from the report, and the mask on the inner one.
PERSON_A = (0.0, 0.0, 260.0, 320.0)
PERSON_B = (80.0, 0.0, 200.0, 250.0)
NESTED_MASK = (85.0, 10.0, 115.0, 55.0)

#: The same pair for the helmet case, shifted down so both have headroom.
#: A helmet cannot be looked for above a box that starts at row zero — Phase
#: 2's PPE-05 — and that rule would answer the attribution question before it
#: was asked. The containment is identical: B is wholly inside A.
GEAR_PERSON_A = (0.0, 40.0, 260.0, 360.0)
GEAR_PERSON_B = (80.0, 60.0, 200.0, 300.0)
GEAR_HELMET = (85.0, 70.0, 115.0, 115.0)

#: Two people standing apart, each with their own gear. The case that must
#: not break while the nested one is fixed.
LEFT = (100.0, 100.0, 300.0, 700.0)
RIGHT = (320.0, 100.0, 520.0, 700.0)


class Box:
    """One detection, shaped the way ultralytics hands them over."""

    def __init__(self, box, conf, cls):
        self.xyxy = [np.array(box, dtype=float)]
        self.conf = [float(conf)]
        self.cls = [int(cls)]


class Frame:
    def __init__(self, boxes):
        self.boxes = boxes


class FakeModel:
    """A detector that returns exactly what a case is about."""

    def __init__(self, names: dict[int, str], boxes: list[Box]):
        self.names = names
        self._boxes = boxes

    def __call__(self, picture, **kwargs):
        return [Frame(list(self._boxes))]


def judge(service, picture: np.ndarray, model=None, faces=None) -> dict[str, Any]:
    """
    One still, judged on its own, optionally with staged detections.

    `faces` stages the *second* model the mask module runs — the face finder,
    which decides whether there is a head to accuse. It is a separate set of
    weights reading the same picture, so staging the boxes it would have
    returned is the same act as staging the detector's, and without it a
    synthetic frame has no faces in it and every staged person comes back
    unchecked whatever the attribution did.
    """
    checker = service.for_session()
    checker._origin = None
    checker.single_frame = True

    if model is not None:
        checker._get_model = lambda: model

    if faces is not None:
        checker._faces = lambda frame: list(faces)

    try:
        _, result = checker.process(picture)
    except Exception as exc:  # noqa: BLE001
        return {"error": f"{type(exc).__name__}: {exc}", "trace": traceback.format_exc()[-800:]}

    height, width = picture.shape[:2]

    kept = {
        key: result[key]
        for key in (
            "summary", "alert", "status", "readable", "unreadable_reason",
            "people_total", "people_unverified", "people_checked",
            "people_not_checked", "people_too_far", "possible_people",
            "wearing_helmet", "missing_helmet", "wearing_vest", "missing_vest",
            "wearing_mask", "missing_mask", "checked",
            "with_gloves", "without_gloves",
            "people_unaccounted", "headcount_mismatch", "unclaimed_items",
            "orphans", "people_possible",
        )
        if key in result
    }

    kept["_keys"] = sorted(result)
    # Boxes back in the picture's own pixels, so a verdict can be matched to
    # the person it is about rather than to a position in a list.
    kept["_people"] = [
        {
            "box": [round(region["box"][0] * width, 1),
                    round(region["box"][1] * height, 1),
                    round(region["box"][2] * width, 1),
                    round(region["box"][3] * height, 1)],
            "label": region.get("label"),
            "tone": region.get("tone"),
        }
        for region in result.get("regions", [])
        if isinstance(region, dict) and "box" in region
    ]

    return kept


def _iou(a, b) -> float:
    """
    Overlap between two boxes.

    Recorded beside every nested case because both gear modules settle a
    person's identity across frames on this number, and two boxes one of
    which contains the other score high on it. Whether that matters is the
    suite's question; producing the figure is this file's job.
    """
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b

    left, top = max(ax1, bx1), max(ay1, by1)
    right, bottom = min(ax2, bx2), min(ay2, by2)

    if right <= left or bottom <= top:
        return 0.0

    overlap = (right - left) * (bottom - top)
    union = (ax2 - ax1) * (ay2 - ay1) + (bx2 - bx1) * (by2 - by1) - overlap

    return overlap / union if union > 0 else 0.0


def label_for(entry: dict[str, Any], box, slack: float = 6.0) -> Optional[str]:
    """What the module said about the person at these coordinates."""
    for person in entry.get("_people", []):
        if all(abs(a - b) <= slack for a, b in zip(person["box"], box)):
            return person["label"]

    return None


def main() -> int:
    out: dict[str, Any] = {}

    from app.modules.gloves.service import GlovesService
    from app.modules.mask.service import MaskService
    from app.modules.ppe.service import PPEService

    ppe, mask, gloves = PPEService(), MaskService(), GlovesService()

    # A plain picture for the staged cases. Legibility is measured on the
    # picture, not on the boxes, so it has to be one nobody can call
    # unreadable or every staged verdict comes back "too flat to check".
    rng = np.random.default_rng(20260811)
    plain = rng.integers(40, 220, (740, 620, 3), dtype=np.uint8)

    small = plain[:340, :280].copy()

    mask_names = {0: "mask", 1: "person"}
    ppe_names = {0: "person", 1: "helmet", 2: "vest"}

    # ------------------------------------------------------------------
    # MASK-02 · the nested pair
    # ------------------------------------------------------------------
    nested_masks = FakeModel(
        mask_names,
        [
            Box(PERSON_A, 0.90, 1),
            Box(PERSON_B, 0.90, 1),
            Box(NESTED_MASK, 0.90, 0),
        ],
    )

    entry = judge(mask, small, nested_masks)
    out["mask02_nested"] = {
        **entry,
        "person_a": label_for(entry, list(PERSON_A)),
        "person_b": label_for(entry, list(PERSON_B)),
        "iou_of_the_two_boxes": round(_iou(PERSON_A, PERSON_B), 3),
    }

    # The same case with the face finder staged as well — A's own face beside
    # B's, which is what the report's "A is actually maskless" needs to be a
    # statement anybody may make. Without a head in shot Phase 2 correctly
    # refuses to accuse A of anything, and the question of whose mask it is
    # never reaches the screen.
    entry = judge(
        mask, small, nested_masks,
        faces=[
            {"box": (5.0, 10.0, 60.0, 80.0), "conf": 0.8},
            {"box": (110.0, 5.0, 165.0, 70.0), "conf": 0.8},
        ],
    )
    out["mask02_nested_with_faces"] = {
        **entry,
        "person_a": label_for(entry, list(PERSON_A)),
        "person_b": label_for(entry, list(PERSON_B)),
        "iou_of_the_two_boxes": round(_iou(PERSON_A, PERSON_B), 3),
    }

    # The ordinary case the fix must not cost: two people side by side, one
    # mask each.
    side_by_side = FakeModel(
        mask_names,
        [
            Box(LEFT, 0.90, 1),
            Box(RIGHT, 0.90, 1),
            Box((170.0, 150.0, 230.0, 200.0), 0.90, 0),
            Box((390.0, 150.0, 450.0, 200.0), 0.90, 0),
        ],
    )

    entry = judge(mask, plain, side_by_side)
    out["mask_side_by_side"] = {
        **entry,
        "left": label_for(entry, list(LEFT)),
        "right": label_for(entry, list(RIGHT)),
    }

    # One mask, two people, neither nested. Exactly one of them may hold it.
    one_mask = FakeModel(
        mask_names,
        [
            Box(LEFT, 0.90, 1),
            Box(RIGHT, 0.90, 1),
            Box((170.0, 150.0, 230.0, 200.0), 0.90, 0),
        ],
    )

    entry = judge(mask, plain, one_mask)
    out["mask_one_between_two"] = {
        **entry,
        "left": label_for(entry, list(LEFT)),
        "right": label_for(entry, list(RIGHT)),
    }

    # A mask on a table: nobody can hold it, and nobody's verdict may improve.
    orphan_mask = FakeModel(
        mask_names,
        [Box(LEFT, 0.90, 1), Box((560.0, 600.0, 610.0, 650.0), 0.90, 0)],
    )

    entry = judge(mask, plain, orphan_mask)
    out["mask_orphan"] = {**entry, "left": label_for(entry, list(LEFT))}

    # ------------------------------------------------------------------
    # PPE-08 · a contested helmet over the smaller person's head
    # ------------------------------------------------------------------
    #
    # The report's pair, moved down the picture so both of them have headroom
    # above their heads. The containment that makes the case — one box wholly
    # inside the other — is untouched; what the shift removes is Phase 2's
    # top-edge rule, which correctly refuses to judge a helmet on anybody
    # whose box starts at row zero and would therefore answer this question
    # with "head out of shot" whatever the attribution did.
    nested_helmet = FakeModel(
        ppe_names,
        [
            Box(GEAR_PERSON_A, 0.90, 0),
            Box(GEAR_PERSON_B, 0.90, 0),
            Box(GEAR_HELMET, 0.83, 1),
        ],
    )

    entry = judge(ppe, small, nested_helmet)
    out["ppe08_nested_helmet"] = {
        **entry,
        "person_a": label_for(entry, list(GEAR_PERSON_A)),
        "person_b": label_for(entry, list(GEAR_PERSON_B)),
        "iou_of_the_two_boxes": round(_iou(GEAR_PERSON_A, GEAR_PERSON_B), 3),
    }

    # Two people side by side, a helmet each. Neither may take both.
    two_helmets = FakeModel(
        ppe_names,
        [
            Box(LEFT, 0.90, 0),
            Box(RIGHT, 0.90, 0),
            Box((170.0, 130.0, 230.0, 190.0), 0.88, 1),
            Box((390.0, 130.0, 450.0, 190.0), 0.88, 1),
            Box((150.0, 300.0, 250.0, 520.0), 0.80, 2),
            Box((370.0, 300.0, 470.0, 520.0), 0.80, 2),
        ],
    )

    entry = judge(ppe, plain, two_helmets)
    out["ppe_two_people_two_helmets"] = {
        **entry,
        "left": label_for(entry, list(LEFT)),
        "right": label_for(entry, list(RIGHT)),
    }

    # One helmet between two people standing apart. One of them is bare-headed
    # and must be reported as such.
    one_helmet = FakeModel(
        ppe_names,
        [
            Box(LEFT, 0.90, 0),
            Box(RIGHT, 0.90, 0),
            Box((170.0, 130.0, 230.0, 190.0), 0.88, 1),
            Box((150.0, 300.0, 250.0, 520.0), 0.80, 2),
            Box((370.0, 300.0, 470.0, 520.0), 0.80, 2),
        ],
    )

    entry = judge(ppe, plain, one_helmet)
    out["ppe_one_helmet_between_two"] = {
        **entry,
        "left": label_for(entry, list(LEFT)),
        "right": label_for(entry, list(RIGHT)),
    }

    # Two helmets over one person's head band, which is what a merged pair of
    # workers looks like from inside the module. One may be worn; the other is
    # evidence of somebody who was not detected.
    merged = FakeModel(
        ppe_names,
        [
            Box((108.5, 3.7, 426.3, 480.0), 0.772, 0),
            Box((247.4, 0.0, 359.3, 119.1), 0.872, 1),
            Box((352.2, 49.3, 420.0, 136.0), 0.829, 1),
            Box((187.0, 188.7, 382.4, 470.6), 0.741, 2),
        ],
    )

    out["ppe_two_helmets_one_person"] = judge(ppe, plain, merged)

    # A helmet on the ground, nowhere near anybody.
    stray = FakeModel(
        ppe_names,
        [
            Box(LEFT, 0.90, 0),
            Box((170.0, 130.0, 230.0, 190.0), 0.88, 1),
            Box((150.0, 300.0, 250.0, 520.0), 0.80, 2),
            Box((540.0, 640.0, 600.0, 700.0), 0.86, 1),
        ],
    )

    entry = judge(ppe, plain, stray)
    out["ppe_stray_helmet"] = {**entry, "left": label_for(entry, list(LEFT))}

    # ------------------------------------------------------------------
    # PPE-03 · the merged pair, on the real frame
    # ------------------------------------------------------------------
    merged_frame = cv2.imread(str(PPE_FRAME))

    if merged_frame is None:
        out["ppe03"] = {"error": f"missing {PPE_FRAME}"}
    else:
        out["ppe03"] = judge(ppe, merged_frame)
        out["ppe03"]["_detections"] = _raw_detections(ppe, merged_frame)

    # ------------------------------------------------------------------
    # The gloves too-far floor
    # ------------------------------------------------------------------
    distances: dict[str, Any] = {}

    for label, path in (("dist_50", DIST_50), ("dist_35", DIST_35)):
        picture = cv2.imread(str(path))

        if picture is None:
            distances[label] = {"error": f"missing {path}"}
            continue

        distances[label] = {
            "gloves": judge(gloves, picture),
            "ppe": judge(ppe, picture),
        }

    out["distance"] = distances

    # The reference photograph, unmodified, through all three — the case that
    # was right before this phase and has to stay right.
    photo = cv2.imread(str(PHOTO))

    if photo is not None:
        out["reference_photo"] = {
            "ppe": judge(ppe, photo),
            "mask": judge(mask, photo),
            "gloves": judge(gloves, photo),
        }

    print(json.dumps(out))
    return 0


def _raw_detections(service, frame: np.ndarray) -> dict[str, Any]:
    """
    What this module's own weights actually report on this picture.

    The report's claim about PPE-03 is about specific detections — one person
    box spanning two workers, a helmet at 0.829 with nobody to put it on — so
    the boxes are recorded beside the verdict rather than inferred from it.
    """
    model = service._get_model()

    if model is None:
        return {"error": "no model"}

    from app.modules.ppe.service import POSSIBLE_PERSON_CONFIDENCE

    found: dict[str, list] = {"person": [], "helmet": [], "vest": []}

    for result in model(frame, verbose=False, conf=POSSIBLE_PERSON_CONFIDENCE):
        for box in result.boxes:
            name = model.names[int(box.cls[0])]
            found.setdefault(name, []).append(
                {
                    "box": [round(float(v), 1) for v in box.xyxy[0]],
                    "conf": round(float(box.conf[0]), 3),
                }
            )

    return found


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except Exception:  # noqa: BLE001
        print(json.dumps({"__failed__": True, "traceback": traceback.format_exc()}))
        raise SystemExit(1)
