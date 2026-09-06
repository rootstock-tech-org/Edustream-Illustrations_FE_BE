"""
The ten Phase 2 defects, re-run at the conditions that found them.

Every number the debug report printed came from calling a module directly on
a real picture, so that is what happens here — no HTTP, no websocket, no
browser. Each block reproduces one finding at the exact condition named in
the report, records the whole result payload, and stops. Nothing here decides
anything: the suite reads the numbers and judges.

    PPE-01   brightness 0.17 -> 0.16, JPEG q19 -> q17, blur k11 -> k13, and
             the distance sweep, on `check_photo.jpg`. The report's headline:
             one percentage point of brightness turns "1 without a helmet"
             into "Wearing the right gear".

    PPE-05   waist-up framing. A person whose box touches the top edge of the
             picture has no headroom, so a missing helmet is missing evidence,
             not a bare head. Reproduced by cropping the picture, which is
             what a badly aimed camera does.

    PPE-06   the green "Helmet + vest" label on a person only half of whom was
             checked. At 8% brightness the head band is correctly ruled too
             dark, the vest is compliant, and one compliant item outweighs one
             unjudged one.

    GLOVE-01 a bare hand between 50% and 35% brightness, on a real frame where
             the gloves model reads two bare hands at 0.78 and 0.80. Gloves
             has no darkness check of its own, so this is where the shared
             gate has to do the work.

    GLOVE-02 the gloves model's compliant glove on pure noise.

    MASK-01  `doorcam.y4m` frame 210 — a person walking away, back to the
             camera, accused of not wearing a mask.

    MASK-03  brightness 8.25%, where two people become "Nobody in view".
    MASK-04  blur k=31, the same collapse.
    MASK-05  JPEG q=10, where two people become three.

    WS-05    the obstruction crossover table: ordinary dim light read as a
             covered lens, and a real palm over the lens which must still be.

Prints one JSON object on its last line.

    cd backend && PYTHONPATH=$PWD .venv/bin/python ../tests/_probe_defects.py
"""

import json
import sys
import traceback
from pathlib import Path
from typing import Any

import cv2
import numpy as np

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
sys.path.insert(0, str(REPO / "backend"))

from app.vision.legibility import read  # noqa: E402
from app.vision.obstruction import blind_share, is_obstructed  # noqa: E402

PHOTO = HERE / "fixtures" / "check_photo.jpg"
FRAME_210 = HERE / "_probe_frame210.png"
DIM_ROOM = HERE / "_probe_dimroom.png"
PALM = HERE / "_probe_palm.jpg"
PALM_PARTIAL = HERE / "_probe_palm_partial.jpg"
DIST_50 = HERE / "_probe_dist_50.jpg"
DIST_35 = HERE / "_probe_dist_35.jpg"


def blind_share_before_phase2(patch: np.ndarray) -> float:
    """
    The obstruction test exactly as it was before this phase changed it.

    Kept here — and used nowhere in the product — so WS-05 can be measured as a
    change rather than against a bar somebody chose afterwards. The question
    that matters is not "is this frame obstructed", which needs a label
    somebody argued about; it is "did anything the old test caught stop being
    caught". That is a comparison, and this is the other half of it.

    Laplacian variance of the raw pixels against a fixed constant, in a 4x4
    grid, with a patch too small to divide judged whole. `FLAT_VARIANCE` was
    12.0 and `GRID` 4.
    """
    if patch is None or patch.size == 0:
        return 1.0

    flat_variance, grid = 12.0, 4
    grey = cv2.cvtColor(patch, cv2.COLOR_BGR2GRAY)
    height, width = grey.shape

    if height < grid * 4 or width < grid * 4:
        return 1.0 if cv2.Laplacian(grey, cv2.CV_64F).var() < flat_variance else 0.0

    flat = 0
    for row in range(grid):
        for column in range(grid):
            cell = grey[
                row * height // grid:(row + 1) * height // grid,
                column * width // grid:(column + 1) * width // grid,
            ]
            if cv2.Laplacian(cell, cv2.CV_64F).var() < flat_variance:
                flat += 1

    return flat / (grid * grid)

#: What is worth keeping out of a result. The annotated picture and the
#: per-frame timings differ every run and would drown the numbers.
KEEP = (
    "summary", "alert", "status", "severity",
    "readable", "unreadable_reason", "people_unverified",
    "people_total", "people_checked", "people_not_checked",
    "people_too_dark", "people_too_far",
    "wearing_helmet", "missing_helmet", "wearing_vest", "missing_vest",
    "wearing_mask", "missing_mask", "with_gloves", "without_gloves",
    "checked", "compliance_rate", "person_count", "person_inside",
)


def darker(frame: np.ndarray, factor: float) -> np.ndarray:
    return np.clip(frame.astype(np.float32) * factor, 0, 255).astype(np.uint8)


def compressed(frame: np.ndarray, quality: int) -> np.ndarray:
    ok, buffer = cv2.imencode(
        ".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), quality]
    )
    return cv2.imdecode(buffer, cv2.IMREAD_COLOR) if ok else frame


def blurred(frame: np.ndarray, kernel: int) -> np.ndarray:
    return cv2.GaussianBlur(frame, (kernel, kernel), 0)


def judge(service, picture: np.ndarray) -> dict[str, Any]:
    """
    One still, judged on its own, with the picture's own measurements beside it.

    A detached session copy every time, and `single_frame` set, exactly as the
    photo endpoint does — a verdict steadied across pictures that are not a
    sequence would be measuring this probe's frame order, not the module.
    """
    checker = service.for_session()
    checker._origin = None
    checker.single_frame = True

    try:
        _, result = checker.process(picture)
    except Exception as exc:  # noqa: BLE001
        return {"error": f"{type(exc).__name__}: {exc}"}

    reading = read(picture)

    kept = {key: result[key] for key in KEEP if key in result}
    kept["_keys"] = sorted(result)
    kept["_regions"] = [
        {"label": r.get("label"), "tone": r.get("tone")}
        for r in result.get("regions", [])
        if isinstance(r, dict)
    ]
    kept["_gate"] = {
        "readable": reading.readable,
        "reason": reading.reason,
        "brightness": round(reading.brightness, 1),
        "contrast": round(reading.contrast, 1),
        "sharpness": round(reading.sharpness, 1),
        "blockiness": round(reading.blockiness, 2),
    }
    return kept


def sequence(service, pictures: list[np.ndarray]) -> list[dict[str, Any]]:
    """
    A run of frames through *one* session, so temporal steadying is exercised.

    `single_frame` deliberately left false here: this is the case a stream is,
    and the question is whether one contradicting frame in a run can flip the
    answer on its own.
    """
    checker = service.for_session()
    checker._origin = None

    out = []
    for picture in pictures:
        try:
            _, result = checker.process(picture)
        except Exception as exc:  # noqa: BLE001
            out.append({"error": f"{type(exc).__name__}: {exc}"})
            continue
        out.append({key: result[key] for key in KEEP if key in result})

    return out


def main() -> int:
    out: dict[str, Any] = {}

    photo = cv2.imread(str(PHOTO))
    if photo is None:
        print(json.dumps({"__failed__": True, "why": f"missing {PHOTO}"}))
        return 1

    from app.modules.gloves.service import GlovesService
    from app.modules.mask.service import MaskService
    from app.modules.ppe.service import PPEService

    ppe = PPEService()
    mask = MaskService()
    gloves = GlovesService()

    # ------------------------------------------------------------------
    # PPE-01 · the cliffs, and the levels either side of each
    # ------------------------------------------------------------------
    out["ppe_cliffs"] = {
        "brightness_0.20": judge(ppe, darker(photo, 0.20)),
        "brightness_0.17": judge(ppe, darker(photo, 0.17)),
        "brightness_0.16": judge(ppe, darker(photo, 0.16)),
        "jpeg_q19": judge(ppe, compressed(photo, 19)),
        "jpeg_q17": judge(ppe, compressed(photo, 17)),
        "blur_k11": judge(ppe, blurred(photo, 11)),
        "blur_k13": judge(ppe, blurred(photo, 13)),
    }

    # PPE-01's fourth axis. The report's own sweep frames, kept as they were
    # produced: the picture scaled down onto a plain background, which is what
    # "further from the camera" looks like to a fixed lens.
    out["ppe_distance"] = {}
    out["gloves_distance"] = {}

    for label, path in (("dist_50", DIST_50), ("dist_35", DIST_35)):
        picture = cv2.imread(str(path))

        if picture is None:
            out["ppe_distance"][label] = {"error": f"missing {path}"}
            out["gloves_distance"][label] = {"error": f"missing {path}"}
            continue

        out["ppe_distance"][label] = judge(ppe, picture)

        # The same pictures through Gloves. The report lists three safety nets
        # Safety Gear has and Gloves does not — darkness, distance, and
        # temporal steadying — and the plan's Phase 2 bullet names two of them.
        # This measures the third, on the same frames, so whether it is closed
        # is a number rather than an assumption.
        out["gloves_distance"][label] = judge(gloves, picture)

    # ------------------------------------------------------------------
    # PPE-05 · waist-up framing
    # ------------------------------------------------------------------
    height = photo.shape[0]
    out["ppe_waist_up"] = {
        "full_frame": judge(ppe, photo),
        # The top 40% removed: the helmet is outside the picture and the
        # person's box starts at row zero. 30% is kept as the control — the
        # same crop with the helmet still in shot.
        "crop_top_30pct": judge(ppe, photo[int(height * 0.30):, :]),
        "crop_top_40pct": judge(ppe, photo[int(height * 0.40):, :]),
    }

    # ------------------------------------------------------------------
    # PPE-06 · half-checked, fully green
    # ------------------------------------------------------------------
    out["ppe_partial"] = {
        "brightness_0.10": judge(ppe, darker(photo, 0.10)),
        "brightness_0.08": judge(ppe, darker(photo, 0.08)),
    }

    # ------------------------------------------------------------------
    # GLOVE-01 · a bare hand as the light goes
    # ------------------------------------------------------------------
    dim = cv2.imread(str(DIM_ROOM))

    if dim is None:
        out["gloves_dark"] = {"error": f"missing {DIM_ROOM}"}
    else:
        out["gloves_dark"] = {
            f"brightness_{factor:.2f}": judge(gloves, darker(dim, factor))
            for factor in (1.00, 0.50, 0.45, 0.35, 0.25)
        }
        out["gloves_dark"]["blur_k5"] = judge(gloves, blurred(dim, 5))

        # How long a run of frames it takes Gloves to report a bare hand it can
        # plainly see. Gloves gains Safety Gear's steady window in this phase,
        # and a steady window is latency — the report's complaint was that
        # Gloves had none, and the cost of adding one is measured rather than
        # assumed free. One dim frame in the middle, which the gate calls
        # unreadable, so the run also shows what a momentary loss of light does
        # to a verdict that was settled.
        run = [dim] * 8 + [darker(dim, 0.45)] + [dim] * 2
        out["gloves_steady"] = sequence(gloves, run)

    # ------------------------------------------------------------------
    # GLOVE-02 · a compliant glove on pure noise
    # ------------------------------------------------------------------
    rng = np.random.default_rng(20260811)
    out["gloves_noise"] = []
    for _ in range(4):
        noise = rng.integers(0, 256, photo.shape, dtype=np.uint8)
        out["gloves_noise"].append(judge(gloves, noise))

    # ------------------------------------------------------------------
    # MASK-01 · the back-turned person
    # ------------------------------------------------------------------
    frame210 = cv2.imread(str(FRAME_210))
    out["mask_backturned"] = (
        judge(mask, frame210) if frame210 is not None
        else {"error": f"missing {FRAME_210}"}
    )

    # ------------------------------------------------------------------
    # MASK-03 / 04 / 05 · the silent collapses
    # ------------------------------------------------------------------
    out["mask_collapse"] = {
        "brightness_0.0950": judge(mask, darker(photo, 0.095)),
        "brightness_0.0825": judge(mask, darker(photo, 0.0825)),
        "blur_k21": judge(mask, blurred(photo, 21)),
        "blur_k31": judge(mask, blurred(photo, 31)),
        "jpeg_q10": judge(mask, compressed(photo, 10)),
    }

    # ------------------------------------------------------------------
    # WS-05 · dim light against a covered lens
    # ------------------------------------------------------------------
    out["ws_obstruction"] = {"dim": [], "true_obstructions": {}}

    if dim is not None:
        for factor in (1.00, 0.50, 0.45, 0.40, 0.30, 0.25, 0.20, 0.15,
                       0.12, 0.10, 0.08, 0.05):
            picture = darker(dim, factor)
            grey = cv2.cvtColor(picture, cv2.COLOR_BGR2GRAY)
            out["ws_obstruction"]["dim"].append(
                {
                    "factor": factor,
                    "mean": round(float(grey.mean()), 1),
                    "blind_share": round(float(blind_share(picture)), 3),
                    "was": round(float(blind_share_before_phase2(picture)), 3),
                    "obstructed": bool(is_obstructed(picture)),
                }
            )

    # Every one of these is measured twice — as the module reads it now, and as
    # it read before this phase — so a true obstruction that has stopped being
    # caught can be told apart from one that never was.
    obstructions: dict[str, Any] = {
        "solid_black": np.zeros((240, 320, 3), np.uint8),
        "solid_grey": np.full((240, 320, 3), 128, np.uint8),
        "lens_blur_k41": cv2.GaussianBlur(photo, (41, 41), 0),
    }

    for label, path in (("skin_against_the_lens", PALM),
                        ("palm_over_90pct_of_the_lens", PALM_PARTIAL)):
        picture = cv2.imread(str(path))
        if picture is not None:
            obstructions[label] = picture

    # A covered lens in a dark room: both failures at once, and the case the
    # contrast stretch is most likely to have broken.
    if PALM.exists():
        palm = cv2.imread(str(PALM))
        if palm is not None:
            obstructions["skin_against_the_lens_at_20pct_light"] = darker(palm, 0.20)

    for label, picture in obstructions.items():
        out["ws_obstruction"]["true_obstructions"][label] = {
            "blind_share": round(float(blind_share(picture)), 3),
            "was": round(float(blind_share_before_phase2(picture)), 3),
            "obstructed": bool(is_obstructed(picture)),
            # Whether the shared gate would have refused this picture anyway.
            # An obstruction the obstruction test misses on a frame the gate
            # already calls unreadable costs the operator the right words, not
            # the judgement — the workstation is withheld either way.
            "gate_readable": bool(read(picture).readable),
        }

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
