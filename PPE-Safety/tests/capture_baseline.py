"""
Record what the system does right now, before a phase starts changing it.

Agent C's Phase 0 report made the case for this: one of that phase's own
done-when criteria was "every module still reports the same readiness it
reported before Phase 0", and by the time anyone came to check, the change had
already landed. The baseline had to be reconstructed by hand from code read
earlier in the session. A criterion that can only be checked against a memory
is not a criterion.

So: run this before the first edit of a phase, commit what it writes, and let
the phase's verification diff against it. A difference is not automatically a
fault — most of them are the point — but every one of them has to be a
difference somebody meant.

    cd backend && PYTHONPATH=$PWD .venv/bin/python ../tests/capture_baseline.py phase1

Nothing here starts a server or touches a camera; it asks the modules
themselves, in process, so the snapshot is of the code rather than of one
machine's configuration.
"""

import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from app.modules.registry import list_services  # noqa: E402
from app.vision.door_regions import door_regions  # noqa: E402
from app.vision.workstation_regions import workstation_regions  # noqa: E402


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


#: Values every configurable module is asked about. Chosen to be the ones a
#: phase is likely to change the handling of — the boundaries, and the two
#: non-numbers that Python's json module lets through as floats.
PROBES: dict[str, Any] = {
    "zero": 0,
    "negative": -1,
    "nan": float("nan"),
    "infinity": float("inf"),
    "huge": 999999,
    "one": 1,
    "half": 0.5,
    "text": "abc",
    "none": None,
}

#: The fields worth probing, per module id. A module not listed is recorded for
#: status only.
FIELDS: dict[str, list[str]] = {
    "door": ["open_seconds", "confidence"],
    "workstation": ["empty_seconds"],
    "ppe": ["min_person_height"],
    "mask": ["min_person_height"],
    "gloves": ["confidence"],
}

BOX_PROBES: dict[str, Any] = {
    "ordinary": [0.2, 0.2, 0.5, 0.8],
    "tiny": [0.2, 0.2, 0.21, 0.21],
    "nan_left": [float("nan"), 0.1, 0.3, 0.3],
    "infinite": [0.1, 0.1, float("inf"), 0.3],
    "reversed": [0.8, 0.8, 0.2, 0.2],
    "outside": [-0.5, -0.5, 1.5, 1.5],
    "three_long": [0.1, 0.2, 0.3],
    "not_a_list": "nope",
    "none": None,
}


def _probe_box(store, box) -> Any:
    """Offer one box to an empty store, and leave it empty again."""
    store.clear("__baseline__")
    return store.add("__baseline__", box, f"probe {box}")


def capture() -> dict[str, Any]:
    snapshot: dict[str, Any] = {"modules": {}, "regions": {}}

    for service in list_services():
        entry: dict[str, Any] = {"status": service.get_status()}

        for field in FIELDS.get(service.module_id, []):
            entry.setdefault("config", {})[field] = {
                label: attempt(lambda s=service, f=field, v=value: s.configure({f: v}))
                for label, value in PROBES.items()
            }

        snapshot["modules"][service.module_id] = entry

    for name, store in (("door", door_regions), ("workstation", workstation_regions)):
        snapshot["regions"][name] = {
            "constants": {
                key: getattr(type(store), key, None)
                for key in ("MIN_SIZE", "DUPLICATE_IOU", "MAX_NAME", "MATCH_IOU")
                if getattr(type(store), key, None) is not None
            },
            # Each box asked of an *empty* store, not of one filling up with the
            # boxes before it. They accumulated at first, and the question
            # silently changed from "is this box acceptable" to "is this box
            # acceptable given the ones already marked" — which came due when
            # workstations learned to refuse a region nested inside another:
            # two probes that had always been accepted started being refused
            # for containing an earlier probe, and a Phase 1 baseline recorded
            # months earlier called it an unexplained regression.
            #
            # Duplicate and containment rules are worth testing. They are not
            # what this is testing.
            "boxes": {
                label: attempt(
                    lambda s=store, b=box: _probe_box(s, b)
                )
                for label, box in BOX_PROBES.items()
            },
        }
        store.clear("__baseline__")

    return snapshot


def main() -> int:
    label = sys.argv[1] if len(sys.argv) > 1 else "baseline"
    out = ROOT / "tests" / f"baseline_{label}.json"

    snapshot = capture()
    out.write_text(json.dumps(snapshot, indent=2, sort_keys=True) + "\n")

    modules = len(snapshot["modules"])
    probes = sum(
        len(field)
        for entry in snapshot["modules"].values()
        for field in entry.get("config", {}).values()
    )
    boxes = sum(len(r["boxes"]) for r in snapshot["regions"].values())

    print(f"Wrote {out.relative_to(ROOT)}")
    print(f"  {modules} modules · {probes} configuration probes · {boxes} region probes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
