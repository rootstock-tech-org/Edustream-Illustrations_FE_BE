"""
What gets loaded merely by importing the modules package.

Reported by verify_phase0.py as the "no eager loading" guard. Printed as one
JSON object on stdout so the suite can compare it against the baseline; run
in its own interpreter because the answer is only meaningful before anything
has had a chance to touch a model.

Two separate questions are answered here:

    after_import      which registered services are already holding a model
                      object the moment `import app.modules` finishes
    after_construct   which of the seven service classes load a model in
                      their own __init__

The second is the one Phase 0 could plausibly have broken: `get_status()`
gained two methods that reach for the model, and a subclass that called
either one from __init__ — or a base class that called get_status() eagerly —
would turn seven lazy modules into seven that block the import.

Run with cwd=backend.
"""

import json
import sys

MODEL_TYPES = {"YOLO", "FaceAnalysis"}


def held(obj) -> dict:
    return {
        attr: type(value).__name__
        for attr, value in vars(obj).items()
        if type(value).__name__ in MODEL_TYPES
    }


from app.modules import registry  # noqa: E402

after_import = {svc.module_id: held(svc) for svc in registry.list_services()}

# A fresh instance of each class, built the way the registry builds the
# singletons. Anything held here was loaded by __init__ itself.
after_construct = {}
for svc in registry.list_services():
    try:
        fresh = type(svc)()
        after_construct[svc.module_id] = held(fresh)
    except Exception as exc:  # noqa: BLE001
        after_construct[svc.module_id] = {"__error__": f"{type(exc).__name__}: {exc}"}

import app.vision.detector as detector_module  # noqa: E402

print(
    json.dumps(
        {
            "after_import": after_import,
            "after_construct": after_construct,
            # Pre-existing and outside Phase 0: the shared person detector
            # loads yolov8n-seg.pt at module scope, and restricted_zone
            # imports it. Recorded so the number does not silently move.
            "shared_detector_eager": type(
                getattr(detector_module, "model", None)
            ).__name__,
            "python": sys.version.split()[0],
        }
    )
)
