"""
Record what each module *says* about a degraded picture, before a phase changes it.

`capture_baseline.py` records configuration behaviour. This records verdicts —
the thing Phase 2 exists to change — because the defect is not that a number
is wrong but that a sentence is: at 17% of daylight the system reports "1
without a helmet" and at 16% it reports "Wearing the right gear", and both are
said with the same confidence.

    cd backend && PYTHONPATH=$PWD .venv/bin/python ../tests/capture_verdicts.py phase2

Every judgement here is made on a real photograph, degraded by the same
operations the debug report measured with. Nothing synthetic.
"""

import json
import sys
from pathlib import Path
from typing import Any

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from app.modules.registry import list_services  # noqa: E402

FIXTURE = ROOT / "tests" / "fixtures" / "check_photo.jpg"

#: The conditions the debug report found the cliffs in, plus the levels either
#: side of each one.
def conditions(frame: np.ndarray) -> dict[str, np.ndarray]:
    out: dict[str, np.ndarray] = {"baseline": frame}

    for factor in (0.50, 0.35, 0.25, 0.20, 0.17, 0.16, 0.10, 0.08):
        out[f"brightness_{factor:.2f}"] = np.clip(
            frame.astype(np.float32) * factor, 0, 255
        ).astype(np.uint8)

    for kernel in (5, 9, 11, 13, 21, 31):
        out[f"blur_k{kernel}"] = cv2.GaussianBlur(frame, (kernel, kernel), 0)

    for quality in (30, 21, 19, 17, 10, 5):
        ok, buffer = cv2.imencode(
            ".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), quality]
        )
        if ok:
            out[f"jpeg_q{quality}"] = cv2.imdecode(buffer, cv2.IMREAD_COLOR)

    return out


#: Keys worth recording from a result. Deliberately not the whole payload:
#: annotated pictures and per-frame timings differ every run and would drown
#: the diff that matters.
#
# `unreadable_reason` and `people_unverified` are here because they were
# missed first time round: the bench recorded `readable` and neither of its
# two companions, so a module could set the flag, forget both fields the
# contract requires beside it, and diff perfectly clean. An instrument that
# cannot see two thirds of what a phase promised is not measuring the phase.
INTERESTING = (
    "summary", "alert", "status", "severity",
    "unreadable_reason", "people_unverified",
    "people_total", "people_not_checked", "people_too_dark",
    "wearing_helmet", "missing_helmet", "wearing_vest", "missing_vest",
    "wearing_mask", "missing_mask", "checked",
    "with_gloves", "without_gloves",
    "person_count", "person_inside",
    "readable", "reason",
)


def capture() -> dict[str, Any]:
    frame = cv2.imread(str(FIXTURE))

    if frame is None:
        raise SystemExit(f"Fixture missing: {FIXTURE}")

    snapshot: dict[str, Any] = {}

    for service in list_services():
        if not service.model_loaded():
            continue

        per_condition: dict[str, Any] = {}

        for label, picture in conditions(frame).items():
            # A detached copy per condition, judged as a single still, so no
            # verdict is steadied across pictures that are not a sequence.
            checker = service.for_session()
            checker._origin = None
            checker.single_frame = True

            try:
                _, result = checker.process(picture)
            except Exception as exc:  # noqa: BLE001
                per_condition[label] = {"error": f"{type(exc).__name__}: {exc}"}
                continue

            per_condition[label] = {
                key: result[key] for key in INTERESTING if key in result
            }

        snapshot[service.module_id] = per_condition

    return snapshot


def main() -> int:
    label = sys.argv[1] if len(sys.argv) > 1 else "verdicts"
    out = ROOT / "tests" / f"verdicts_{label}.json"

    snapshot = capture()
    out.write_text(json.dumps(snapshot, indent=2, sort_keys=True) + "\n")

    verdicts = sum(len(conditions) for conditions in snapshot.values())
    print(f"Wrote {out.relative_to(ROOT)}")
    print(f"  {len(snapshot)} modules · {verdicts} verdicts on a real photograph")

    # The headline the phase exists to change, printed so it is on the record
    # rather than buried in the file: how many different things each module
    # found to say across every quality level from pristine to unusable. One
    # is the defect — the same sentence, with the same confidence, whether or
    # not the picture could be read.
    print()
    for module_id, per_condition in sorted(snapshot.items()):
        said = {
            entry.get("summary")
            for entry in per_condition.values()
            if "summary" in entry
        }
        note = "  <-- says one thing at every quality level" if len(said) == 1 else ""
        print(f"  {module_id:<16}{len(said)} distinct verdict(s) "
              f"across {len(per_condition)} conditions{note}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
