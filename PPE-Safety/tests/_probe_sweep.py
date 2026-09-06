"""
What every module says, at every quality level, right now.

`capture_verdicts.py` recorded 147 verdicts on a real photograph before Phase
2 started, and `verdicts_phase2.json` is that recording. This runs the same
sweep again — importing the degradations from that file rather than copying
them, so "the same conditions" is a fact and not an intention — and keeps a
wider set of keys, because Phase 2 adds three that did not exist when the
baseline was taken.

Two questions need the extra keys:

    the contract's payload   `readable`, `unreadable_reason` and
                             `people_unverified` on all seven modules, always
                             present, whatever the picture

    the third state          `status` must be able to say "unverified", and
                             that must reach a region's tone as well as the
                             summary, or the screen still renders it green

Prints one JSON object on its last line.

    cd backend && PYTHONPATH=$PWD .venv/bin/python ../tests/_probe_sweep.py
"""

import json
import sys
import traceback
from pathlib import Path
from typing import Any

import cv2

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
sys.path.insert(0, str(REPO / "backend"))
sys.path.insert(0, str(HERE))

from capture_verdicts import FIXTURE, INTERESTING, conditions  # noqa: E402

from app.modules.registry import list_services  # noqa: E402
from app.vision.legibility import read  # noqa: E402

#: The baseline's keys, plus what the contract adds. The baseline set is
#: imported rather than restated, so a diff against `verdicts_phase2.json`
#: compares exactly the fields it holds.
KEEP = tuple(INTERESTING) + (
    "unreadable_reason",
    "people_unverified",
    "people_checked",
    "compliance_rate",
)


def main() -> int:
    frame = cv2.imread(str(FIXTURE))

    if frame is None:
        print(json.dumps({"__failed__": True, "why": f"missing {FIXTURE}"}))
        return 1

    out: dict[str, Any] = {"modules": {}, "gate": {}}

    # A gate reading per module, not one shared reading.
    #
    # The first version of this probe asked `read(picture)` once and held every
    # module to that answer. That was right when the floors were shared and
    # became wrong the moment they stopped being: the floors are now measured
    # against the weights each module actually runs, so Masks legitimately goes
    # on judging a picture Safety Gear cannot read. Held to one shared answer,
    # a module doing exactly the right thing fails.
    #
    # `None` keeps the shared reading, which is what a caller naming no module
    # gets, so the two can still be compared.
    for module_id in [None] + [s.module_id for s in list_services()]:
        key = module_id or "__shared__"
        out["gate"][key] = {}

        for label, picture in conditions(frame).items():
            reading = read(picture, module_id)
            out["gate"][key][label] = {
                "readable": reading.readable,
                "reason": reading.reason,
                "brightness": round(reading.brightness, 1),
                "contrast": round(reading.contrast, 1),
                "sharpness": round(reading.sharpness, 1),
                "blockiness": round(reading.blockiness, 2),
            }

    for service in list_services():
        if not service.model_loaded():
            continue

        per_condition: dict[str, Any] = {}

        for label, picture in conditions(frame).items():
            # Detached, and judged as a single still — the same way the
            # baseline was taken, or the two are not comparable.
            checker = service.for_session()
            checker._origin = None
            checker.single_frame = True

            try:
                _, result = checker.process(picture)
            except Exception as exc:  # noqa: BLE001
                per_condition[label] = {"error": f"{type(exc).__name__}: {exc}"}
                continue

            entry = {key: result[key] for key in KEEP if key in result}

            # Recorded separately from the values, so "the key is missing" and
            # "the key is None" stay distinguishable — the contract requires
            # all three keys present, and `unreadable_reason` is legitimately
            # None on a picture that reads fine.
            entry["_present"] = {
                key: (key in result)
                for key in ("readable", "unreadable_reason", "people_unverified")
            }
            entry["_types"] = {
                key: type(result.get(key)).__name__
                for key in ("readable", "unreadable_reason", "people_unverified")
                if key in result
            }
            # The list, not the set: PPE-06 is a question about *how many*
            # boxes are painted as fully verified against how many people were
            # actually fully checked, and a set cannot answer it.
            entry["_tones"] = [
                r.get("tone")
                for r in result.get("regions", [])
                if isinstance(r, dict)
            ]
            entry["_labels"] = [
                r.get("label")
                for r in result.get("regions", [])
                if isinstance(r, dict)
            ]

            per_condition[label] = entry

        out["modules"][service.module_id] = per_condition

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
