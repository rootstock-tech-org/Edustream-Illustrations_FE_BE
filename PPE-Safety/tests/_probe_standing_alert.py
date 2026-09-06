"""
What happens to a live alert when the camera stops being usable?

This is the clause in the contract that is easy to satisfy backwards. A module
that suppresses its alert on an unreadable picture has done half the job: the
operator was told about a problem, then told nothing, and nothing reads as
resolved. Contract §3 — "unreadable is a third state, not a quiet one" —
requires the alert to become `unverified`, with the reason, so the operator
learns the camera stopped being usable rather than that the problem went away.

So each module is given a *run* of frames through one session, not a still:

    eight frames of a real violation, at full light, long enough for any
    steady window or accusation vote to settle

    then four of the same picture at 16% of that light, which the shared gate
    calls too dark to check

and every frame's verdict is recorded. The suite asks two things of the run:
that it was genuinely alerting before the light went, and that what it says
afterwards is `unverified` with words, rather than silence.

Prints one JSON object on its last line.
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

PHOTO = HERE / "fixtures" / "check_photo.jpg"
DIM_ROOM = HERE / "_probe_dimroom.png"

BRIGHT_FRAMES = 8
DARK_FRAMES = 4

#: The light level every module calls unreadable.
#:
#: This was 0.16 — the exact value where Safety Gear used to turn "1 without a
#: helmet" into "Wearing the right gear", which made it the obvious choice.
#: It stopped being the right one when the floors became per module: measured
#: against their own weights, Masks and Gloves read a 16% picture perfectly
#: well and go on judging it, correctly. A test about what happens when the
#: light goes has to turn the light off for everybody, or three modules fail
#: it for doing the right thing.
DARK_FACTOR = 0.08

KEEP = (
    "summary", "alert", "status", "readable", "unreadable_reason",
    "people_unverified", "people_total", "missing_helmet", "missing_vest",
    "missing_mask", "without_gloves",
)


def run(service, pictures: list[np.ndarray]) -> list[dict[str, Any]]:
    """One session, one run of frames — so temporal state is real."""
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
    photo = cv2.imread(str(PHOTO))
    dim = cv2.imread(str(DIM_ROOM))

    if photo is None:
        print(json.dumps({"__failed__": True, "why": f"missing {PHOTO}"}))
        return 1

    from app.modules.gloves.service import GlovesService
    from app.modules.mask.service import MaskService
    from app.modules.ppe.service import PPEService

    width = photo.shape[1]

    # One real violation per module, on a picture the gate reads as fine.
    #
    #   ppe     the left 60% of the photograph, where the bare-headed worker
    #           in the grey t-shirt is detected alongside the compliant one
    #   mask    the whole photograph: neither worker is masked
    #   gloves  the construction frame where the model reads two bare hands
    #           at 0.78 and 0.80
    violations = {
        "ppe": (PPEService(), photo[:, : int(width * 0.60)]),
        "mask": (MaskService(), photo),
    }

    if dim is not None:
        violations["gloves"] = (GlovesService(), dim)

    runs = {}

    for module_id, (service, picture) in violations.items():
        dark = np.clip(
            picture.astype(np.float32) * DARK_FACTOR, 0, 255
        ).astype(np.uint8)

        runs[module_id] = run(
            service, [picture] * BRIGHT_FRAMES + [dark] * DARK_FRAMES
        )

    print(json.dumps({
        "bright_frames": BRIGHT_FRAMES,
        "dark_frames": DARK_FRAMES,
        "dark_factor": DARK_FACTOR,
        "runs": runs,
    }))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except Exception:  # noqa: BLE001
        print(json.dumps({"__failed__": True, "traceback": traceback.format_exc()}))
        raise SystemExit(1)
