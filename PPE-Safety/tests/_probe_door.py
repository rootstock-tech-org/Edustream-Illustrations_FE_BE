"""
The two door claims that cannot be asked over HTTP.

`_summarise()` and `empty_result()` are reached from the API only through a
running model on a real camera, and neither of the two states Phase 0 is
about — a door nobody has looked at yet, and a model that failed to load —
can be produced on demand that way. So they are exercised in process, on an
isolated region store, exactly as the existing scratchpad regression scripts
do.

Nothing here touches `backend/models/door.pt`. The failed-load case is
produced by pointing the module's `MODEL_PATH` at a file of rubbish bytes in
this directory, which is a stronger test than deleting the real one: the file
*exists* and still fails to load, which is precisely the case
`MODEL_PATH.exists()` got wrong. The real weights' checksum is taken before
and after and reported, so the suite can prove they were left alone.

Prints one JSON object on stdout. Run with cwd=backend.
"""

import hashlib
import json
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
REAL_MODEL = Path("models/door.pt").resolve()


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else "missing"


before = sha(REAL_MODEL)

from app.modules.door.service import DoorService  # noqa: E402
from app.vision.door_regions import DoorRegions  # noqa: E402

# Not `import app.modules.door.service as door_module`. The door package
# re-exports the service *instance* under the name `service`, so that form
# binds the DoorService object and every attribute set on it lands on the
# live singleton instead of the module — silently, and the model then loads
# from the real path while the test believes it patched it.
door_module = sys.modules["app.modules.door.service"]

out: dict = {"door_pt_sha_before": before}

# ----------------------------------------------------------------------
# An isolated store, so nothing here can disturb the running backend's
# marked doorways.
# ----------------------------------------------------------------------

store = DoorRegions(path=HERE / "probe_door_regions.json")
store.clear("browser")

# Reached through sys.modules deliberately: the door package re-exports the
# service instance under the name `service`, so the attribute lookup
# `app.modules.door.service` hands back the DoorService object rather than
# the module.
sys.modules["app.modules.door.service"].door_regions = store

clock = {"t": 1_000.0}
DoorService._now = staticmethod(lambda: clock["t"])

BOX = [0.42, 0.30, 0.60, 0.95]
BOX_B = [0.05, 0.30, 0.22, 0.95]

# ----------------------------------------------------------------------
# 3 · a door that has never been detected
# ----------------------------------------------------------------------

svc = DoorService()
svc._browser_camera = True
door_a = store.add("browser", BOX, "Store room")

now = clock["t"]
marked = store.for_source("browser")

# No detections at all: the model has looked and found nothing, which is the
# state a marked doorway starts in and stays in when the model cannot see it.
tracked = svc._watch(marked, [], now, 640, 480)
never = svc._summarise(tracked, now)

out["never_detected"] = {
    "summary": never["summary"],
    "doors_unknown": never["doors_unknown"],
    "doors_total": never["doors_total"],
    "doors_closed": never["doors_closed"],
}

# A second doorway, this one confirmed closed, alongside the unseen one. The
# mixed case is the one the report actually described: something is known,
# something is not, and the single line the operator reads must not round the
# unknown down to "closed".
door_b = store.add("browser", BOX_B, "Back door")
marked = store.for_source("browser")

svc2 = DoorService()
svc2._browser_camera = True
svc2._watched = {
    door_a["id"]: {
        "state": "closed",
        "since": now,
        "last_seen": now,
        "conf": 0.9,
        "history": [(now, "closed")],
    }
}
tracked = svc2._watch(marked, [], now, 640, 480)
mixed = svc2._summarise(tracked, now)

out["one_closed_one_unseen"] = {
    "summary": mixed["summary"],
    "doors_unknown": mixed["doors_unknown"],
    "doors_closed": mixed["doors_closed"],
}

# And the opposite: everything genuinely confirmed closed must still say so.
# A fix that simply stopped saying "All doors closed" would pass the check
# above and be a worse lie than the one it replaced.
svc3 = DoorService()
svc3._browser_camera = True
svc3._watched = {
    region["id"]: {
        "state": "closed",
        "since": now,
        "last_seen": now,
        "conf": 0.9,
        "history": [(now, "closed")],
    }
    for region in marked
}
tracked = svc3._watch(marked, [], now, 640, 480)
all_closed = svc3._summarise(tracked, now)

out["all_confirmed_closed"] = {
    "summary": all_closed["summary"],
    "doors_unknown": all_closed["doors_unknown"],
    "doors_closed": all_closed["doors_closed"],
}

store.clear("browser")

# ----------------------------------------------------------------------
# 4 · a model that is there and does not load
# ----------------------------------------------------------------------

rubbish = HERE / "not_a_model.pt"
rubbish.write_bytes(b"this is not a torch checkpoint\n" * 64)

door_module.MODEL_PATH = rubbish

broken = DoorService()
broken._browser_camera = True

out["corrupt_model"] = {
    "weights_file_exists": rubbish.exists(),
    # What `/results` says before a single frame has been analysed: the
    # result cached at construction, produced before anything had tried to
    # load anything.
    "results_before_first_frame": broken.get_results()["summary"],
}

out["corrupt_model"]["get_model_returned_none"] = broken._get_model() is None
out["corrupt_model"]["model_loaded_flag"] = bool(
    getattr(broken, "model_loaded", lambda: None)()
)
out["corrupt_model"]["empty_result_summary"] = broken.empty_result()["summary"]

frame = np.full((480, 640, 3), 128, np.uint8)
_, processed = broken.process(frame)
out["corrupt_model"]["process_summary"] = processed["summary"]
out["corrupt_model"]["status_ready"] = broken.get_status().get("ready")
out["corrupt_model"]["status_model_loaded"] = broken.get_status().get("model_loaded")

# The other way a model can be unavailable: no file at all.
door_module.MODEL_PATH = HERE / "definitely_no_model_here.pt"

absent = DoorService()
absent._browser_camera = True
out["missing_model"] = {
    "weights_file_exists": (HERE / "definitely_no_model_here.pt").exists(),
    "get_model_returned_none": absent._get_model() is None,
    "empty_result_summary": absent.empty_result()["summary"],
    "process_summary": absent.process(frame)[1]["summary"],
}

door_module.MODEL_PATH = REAL_MODEL
out["door_pt_sha_after"] = sha(REAL_MODEL)

print(json.dumps(out))
