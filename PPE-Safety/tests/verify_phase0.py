"""
Does Phase 0 ship?

Phase 0 is the "stop the product lying about what it already knows" phase:
six defects where the system holds the right information and puts something
else on the screen. Nothing about detection changes, so nothing here measures
a model — every check below asks whether a fact the backend already knows
reaches the operator intact.

Six checks are the plan's own "done when" list. Two more are regression
guards, because the failure mode this whole remediation exists to stop is a
fix that looked right and was never measured: three of the four defects
Phase 0 closes were themselves introduced by earlier hardening work.

    1  navbar under outage      DASH-01. The System and Camera pills were
                                hardcoded to defaults nobody passed, so the
                                bar read "working" through a full API outage
                                on every page. Checked in a real browser
                                because reading the source is exactly what
                                failed to catch it the first time.

    2  Doors on a fresh install DASH-04. `is_ready()` meant both "the model
                                loaded" and "an operator marked something",
                                so a healthy new deployment's first screen
                                said the door AI was not installed.

    3  a door never detected    DOOR-03. `_summarise()` fell to its else
                                branch for a doorway the model had never
                                managed to look at, and reported "All doors
                                closed" — a confident, wrong, safety-relevant
                                statement in the one line an operator reads.

    4  a model that will not    DOOR-04. `empty_result()` keyed its message
       load                     off the weights file existing rather than
                                loading. Corrupt weights, a torch mismatch
                                and an OOM at load all reported as a healthy
                                camera with nothing in front of it.

    5  an empty upload          DASH-07. `cv2.imdecode` asserts on an empty
                                buffer before the `frame is None` guard, so
                                a zero-byte file got a plain-text 500 where
                                every other bad picture gets a sentence.
                                One code path, seven modules.

    6  door config errors       DASH-09. `KeyError.__str__` re-quotes its
                                argument, so the message reached the screen
                                wrapped in apostrophes.

    7  ready did not move       Regression guard. `ready` is read by the
                                dashboard, the module grid and every
                                monitoring page. Phase 0 adds two facts
                                beside it; if it also changed the one that
                                was there, a truth-telling change has quietly
                                moved the product's behaviour.

    8  nothing loads eagerly    Regression guard. `get_status()` now calls
                                two new methods, and the obvious
                                implementation of either reaches for the
                                model. A module that loads its weights at
                                import or construction turns a fast startup
                                into a slow one and makes every module pay
                                for capabilities nobody opened.

Usage:

    cd backend && PYTHONPATH=$PWD .venv/bin/python <this file> [--base URL]

Requires a backend on http://127.0.0.1:8012 serving the built dashboard
(frontend/dist). Checks 1 and 2 are only meaningful against a dist built
from the current frontend source; the suite says so if dist is older.
"""

import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
BACKEND = REPO / "backend"
PYTHON = str(BACKEND / ".venv/bin/python")
NODE_SCRIPT = HERE / "_probe_browser.js"

BASE = "http://127.0.0.1:8012"
for index, arg in enumerate(sys.argv):
    if arg == "--base" and index + 1 < len(sys.argv):
        BASE = sys.argv[index + 1]

# Every module, in registry order. Eight since the vehicle zone landed;
# the count is spelled out rather than taken from the backend, because a
# check that asks the thing under test what it should contain agrees with
# it whatever it does.
EXPECTED_MODULES = [
    "restricted-zone",
    "ppe",
    "gloves",
    "mask",
    "face",
    "workstation",
    "door",
    "vehicle-zone",
    "walkways",
    "suspended-load",
]

#: What every module reported for `ready` before Phase 0 was written.
#:
#: Read off the untouched services at the start of the remediation, and
#: reproducible from their pre-Phase-0 source: the base class returned True,
#: door returned "model loaded AND a doorway marked", and restricted zone and
#: workstation return False until something is drawn. The preconditions those
#: values depend on — no polygon, no marked doorway, no marked workstation —
#: are asserted alongside, so a machine that has been configured since is
#: reported as a changed precondition rather than as a regression.
BASELINE_READY = {
    "restricted-zone": False,
    "ppe": True,
    "gloves": True,
    "mask": True,
    "face": True,
    "workstation": False,
    "door": False,
}

failures: list[str] = []
advisories: list[str] = []
results: list[tuple[str, str, str]] = []


def check(name: str, ok: bool, detail: str = "") -> bool:
    """Record one check. Prints the measured value when it fails."""
    print(("PASS  " if ok else "FAIL  ") + name + (f"  [{detail}]" if detail and not ok else ""))
    results.append(("PASS" if ok else "FAIL", name, "" if ok else detail))
    if not ok:
        failures.append(name)
    return ok


def note(name: str, ok: bool, detail: str = "") -> bool:
    """
    A check that reports but does not block.

    Used where the criterion as written is stricter than what the plan asked
    for, or where the finding belongs to somebody else's file. Either way the
    number is on the table rather than in a paragraph.
    """
    print(("PASS  " if ok else "NOTE  ") + name + (f"  [{detail}]" if detail and not ok else ""))
    results.append(("PASS" if ok else "NOTE", name, "" if ok else detail))
    if not ok:
        advisories.append(name)
    return ok


def section(title: str) -> None:
    print()
    print(f"--- {title}")


# ----------------------------------------------------------------------
# Plumbing
# ----------------------------------------------------------------------


def get_json(path: str, timeout: float = 20.0):
    with urllib.request.urlopen(BASE + path, timeout=timeout) as response:
        return response.status, json.loads(response.read())


def post_json(path: str, payload: dict, timeout: float = 20.0):
    request = urllib.request.Request(
        BASE + path,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read().decode(), response.headers.get_content_type()
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode(), exc.headers.get_content_type()


def post_file(path: str, content: bytes, filename: str, timeout: float = 120.0):
    """Multipart upload, hand-built so the suite needs nothing but stdlib."""
    boundary = "----phase0verify"
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        f"Content-Type: application/octet-stream\r\n\r\n"
    ).encode() + content + f"\r\n--{boundary}--\r\n".encode()

    request = urllib.request.Request(
        BASE + path,
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read().decode(), response.headers.get_content_type()
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode(), exc.headers.get_content_type()


def run_probe(script: Path, interpreter: list[str]) -> dict:
    """Run one probe and return the JSON object it printed on its last line."""
    proc = subprocess.run(
        interpreter + [str(script)],
        cwd=str(BACKEND),
        capture_output=True,
        text=True,
        env={**os.environ, "PYTHONPATH": str(BACKEND), "PHASE0_BASE": BASE},
        timeout=600,
    )
    for line in reversed(proc.stdout.splitlines()):
        line = line.strip()
        if line.startswith("{"):
            try:
                return json.loads(line)
            except json.JSONDecodeError:
                continue
    return {
        "__failed__": True,
        "stdout": proc.stdout[-2000:],
        "stderr": proc.stderr[-2000:],
    }


# ----------------------------------------------------------------------
# Preflight
# ----------------------------------------------------------------------

print(f"Phase 0 verification · {BASE} · {time.strftime('%Y-%m-%d %H:%M:%S')}")

section("Preflight")

try:
    _, catalog = get_json("/api/modules")
    modules = {m["module_id"]: m for m in catalog["data"]}
except Exception as exc:  # noqa: BLE001
    print(f"FAIL  the backend answers on {BASE}  [{type(exc).__name__}: {exc}]")
    print("\nNothing else can be measured. Start it with:")
    print("  cd backend && .venv/bin/python -m uvicorn app.main:app "
          "--host 0.0.0.0 --port 8012")
    sys.exit(2)

check("the backend answers, and reports every module",
      sorted(modules) == sorted(EXPECTED_MODULES),
      f"got {sorted(modules)}")

dist_index = REPO / "frontend/dist/index.html"
newest_src = max(
    (p.stat().st_mtime for p in (REPO / "frontend/src").rglob("*") if p.is_file()),
    default=0.0,
)
dist_age = dist_index.stat().st_mtime if dist_index.exists() else 0.0
dist_fresh = dist_index.exists() and dist_age >= newest_src

check("the dashboard being tested was built from the current frontend source",
      dist_fresh,
      "frontend/dist is missing" if not dist_index.exists() else
      f"dist built {round((newest_src - dist_age) / 60, 1)} min before the newest "
      "src file — run `npm run build` in frontend/ or checks 1 and 2 are testing "
      "yesterday's screen")

# ----------------------------------------------------------------------
# 5 · an empty upload to /photo
# ----------------------------------------------------------------------

section("5 · an empty upload is refused politely, on every module")

for module_id in EXPECTED_MODULES:
    status, body, content_type = post_file(f"/api/{module_id}/photo", b"", "empty.jpg")

    parsed = None
    try:
        parsed = json.loads(body)
    except json.JSONDecodeError:
        pass

    check(f"an empty photo to {module_id} is refused with 400, not a server error",
          status == 400,
          f"status {status} · {body[:120]!r}")
    check(f"and {module_id} explains itself in JSON, not plain text",
          content_type == "application/json"
          and isinstance(parsed, dict)
          and isinstance(parsed.get("detail"), str)
          and parsed["detail"].strip() != "",
          f"content-type {content_type} · body {body[:160]!r}")

# The neighbouring inputs the report found already handled. A guard that
# refuses empty files by breaking everything else is not a fix.
status, body, _ = post_file("/api/door/photo", b"this is not an image at all", "notes.txt")
check("a non-image file is still refused with 400",
      status == 400, f"status {status} · {body[:120]!r}")

status, body, _ = post_file("/api/door/photo", b"\xff\xd8\xff\xe0" + b"\x00" * 64, "truncated.jpg")
check("a truncated JPEG is still refused with 400",
      status == 400, f"status {status} · {body[:120]!r}")

status, body, _ = post_file("/api/door/photo", b"x" * (9 * 1024 * 1024), "huge.jpg")
check("an oversized upload is still refused with 413",
      status == 413, f"status {status} · {body[:120]!r}")

# A real picture must still be analysed — the check that proves the new guard
# rejects nothing it should not.
real_photo = Path(HERE / "fixtures" / "check_photo.jpg")
if real_photo.exists():
    status, body, _ = post_file("/api/door/photo", real_photo.read_bytes(), "check.jpg")
    check("and a real photograph is still analysed",
          status == 200 and json.loads(body).get("success") is True,
          f"status {status} · {body[:160]!r}")
else:
    note("and a real photograph is still analysed", False,
         f"reference photo missing at {real_photo}")

# The browser-camera socket decodes bytes the same way, with the same guard
# the assertion jumps over — and there it costs the whole session, not one
# request.
socket_probe = run_probe(HERE / "_probe_socket.py", [PYTHON])

if socket_probe.get("__error__") or socket_probe.get("__failed__"):
    check("the browser-camera socket accepts a connection", False,
          socket_probe.get("__error__") or socket_probe.get("stderr", "")[-400:])
else:
    check("an empty frame over the browser-camera socket is answered, not crashed on",
          isinstance(socket_probe.get("empty_frame_reply"), dict)
          and "empty" in str(socket_probe["empty_frame_reply"].get("error", "")).lower(),
          f'reply={socket_probe.get("empty_frame_reply")!r}')
    check("and the socket survives it, so one bad frame does not end the session",
          socket_probe.get("socket_survived_empty_frame") is True,
          f'next real frame answered with an error: {socket_probe.get("photo_reply_keys")}')
    check("a non-image frame over the socket is still answered and survived",
          isinstance(socket_probe.get("non_image_reply"), dict)
          and socket_probe.get("socket_survived_non_image") is True,
          f'reply={socket_probe.get("non_image_reply")!r} '
          f'survived={socket_probe.get("socket_survived_non_image")}')

# ----------------------------------------------------------------------
# 6 · door config errors carry no stray apostrophes
# ----------------------------------------------------------------------

section("6 · a door config error reads like a sentence")

CONFIG_ERRORS = [
    ("nothing to change", {}),
    ("no calibration verb", {"door": {}}),
    ("an update with no id", {"door": {"update": {}}}),
    # Reached from the Doors page every time a door is renamed or moved, and
    # the one call in the calibration surface that still raises KeyError —
    # from NamedRegions.update rather than from the door module itself.
    ("renaming a door that is not marked", {"door": {"update": {"id": 987654, "name": "x"}}}),
    ("moving a door that is not marked",
     {"door": {"update": {"id": 987654, "box": [0.1, 0.1, 0.3, 0.6]}}}),
    ("removing a door that is not marked", {"door": {"remove": 987654}}),
    ("a box too small to be a door", {"door": {"add": {"box": [0.5, 0.5, 0.501, 0.501]}}}),
    ("a threshold of zero", {"open_seconds": 0}),
    ("a confidence that is not a number", {"confidence": "very"}),
]

for label, payload in CONFIG_ERRORS:
    status, body, _ = post_json("/api/door/config", payload)

    try:
        detail = json.loads(body).get("detail", "")
    except json.JSONDecodeError:
        detail = body

    detail = detail if isinstance(detail, str) else json.dumps(detail)

    check(f"{label} is a 400, not a 500",
          status == 400, f"status {status} · {detail[:120]!r}")
    check(f"{label} reports a message with no stray apostrophes",
          "'" not in detail and detail.strip() != "",
          f"detail {detail!r}")

# The same re-quoting lives in the shared region store, so it reaches the
# workstation page too. Outside Phase 0's stated scope, hence reported.
status, body, _ = post_json(
    "/api/workstation/config",
    {"workstation": {"update": {"id": 987654, "name": "x"}}},
)
try:
    ws_detail = json.loads(body).get("detail", "")
except json.JSONDecodeError:
    ws_detail = body
note("the same error on the workstation page is clean too",
     isinstance(ws_detail, str) and "'" not in ws_detail,
     f"status {status} · detail {ws_detail!r}")

# ----------------------------------------------------------------------
# 7 · ready did not move, and the two new facts are there
# ----------------------------------------------------------------------

section("7 · the status payload gained two facts and changed none")

_, door_config = get_json("/api/door/config")
_, ws_status = get_json("/api/workstation/status")

marked_doors = len(door_config["data"].get("doors") or [])
preconditions = (
    f"marked doors={marked_doors} · "
    f"door configured={modules['door'].get('configured')} · "
    f"zone ready={modules['restricted-zone']['ready']}"
)

check("nothing is marked on this deployment, so the baseline still applies",
      marked_doors == 0, preconditions)

for module_id in EXPECTED_MODULES:
    payload = modules[module_id]

    if module_id in BASELINE_READY:
        check(f"{module_id} still reports the same ready it reported before Phase 0",
              payload.get("ready") == BASELINE_READY[module_id],
              f"ready={payload.get('ready')} expected={BASELINE_READY[module_id]} · {preconditions}")
    else:
        # A module built after this baseline was taken has no "before Phase 0"
        # to still agree with, and inventing one would turn a comparison into
        # a restatement of whatever it does today. It is held to the spelling
        # check below like every other module, and to its own suite; what it
        # is not held to is a number nobody measured on it.
        print(f"      {module_id} postdates this baseline, so there is no "
              f"earlier ready to compare — it reports "
              f"ready={payload.get('ready')}")

    check(f"{module_id} now reports model_loaded and configured, spelled as agreed",
          isinstance(payload.get("model_loaded"), bool)
          and isinstance(payload.get("configured"), bool),
          f"keys={sorted(payload)}")

check("the door module separates a loaded model from an empty setup",
      modules["door"].get("model_loaded") is True
      and modules["door"].get("configured") is False,
      f"model_loaded={modules['door'].get('model_loaded')} "
      f"configured={modules['door'].get('configured')}")

# The same conflation DASH-04 describes lives in two more modules. Phase 0
# was scoped to doors, so this reports rather than blocks.
note("restricted zone and workstation do not claim to be configured when they are not",
     all(
         modules[m]["ready"] == (modules[m]["model_loaded"] and modules[m]["configured"])
         for m in ("restricted-zone", "workstation")
     ),
     "; ".join(
         f"{m}: ready={modules[m]['ready']} model_loaded={modules[m]['model_loaded']} "
         f"configured={modules[m]['configured']}"
         for m in ("restricted-zone", "workstation")
     ))

# ----------------------------------------------------------------------
# 3 and 4 · the two door messages, in process
# ----------------------------------------------------------------------

section("3 · a door that has never been detected")

door_probe = run_probe(HERE / "_probe_door.py", [PYTHON])

if door_probe.get("__failed__"):
    check("the door probe runs", False, door_probe.get("stderr", "")[-400:])
else:
    never = door_probe["never_detected"]
    check("a doorway the model has never managed to look at is called unconfirmed",
          "unconfirmed" in never["summary"].lower(),
          f'summary={never["summary"]!r} doors_unknown={never["doors_unknown"]}')
    check("and it is never called closed",
          "closed" not in never["summary"].lower(),
          f'summary={never["summary"]!r}')

    mixed = door_probe["one_closed_one_unseen"]
    check("one confirmed closed and one never seen does not round down to all closed",
          "unconfirmed" in mixed["summary"].lower()
          and mixed["summary"].strip().lower() != "all doors closed",
          f'summary={mixed["summary"]!r}')

    settled = door_probe["all_confirmed_closed"]
    check("but doors genuinely confirmed closed are still reported as closed",
          settled["summary"].strip().lower() == "all doors closed",
          f'summary={settled["summary"]!r} — an unconditional relabel is not a fix')

section("4 · a model that will not load")

if not door_probe.get("__failed__"):
    corrupt = door_probe["corrupt_model"]

    check("weights that exist and do not load are reported as unavailable",
          "not available" in corrupt["empty_result_summary"].lower(),
          f'weights_on_disk={corrupt["weights_file_exists"]} '
          f'summary={corrupt["empty_result_summary"]!r}')
    check("and never as a camera with no doors in view",
          "no doors in view" not in corrupt["empty_result_summary"].lower(),
          f'summary={corrupt["empty_result_summary"]!r}')
    check("a frame analysed with an unloadable model says the same thing",
          "not available" in corrupt["process_summary"].lower(),
          f'summary={corrupt["process_summary"]!r}')
    check("and the status payload says the model is not loaded",
          corrupt["status_model_loaded"] is False,
          f'model_loaded={corrupt["status_model_loaded"]}')

    absent = door_probe["missing_model"]
    check("a missing weights file is reported the same way",
          "not available" in absent["empty_result_summary"].lower(),
          f'summary={absent["empty_result_summary"]!r}')

    check("the real door.pt was left exactly as it was found",
          door_probe["door_pt_sha_before"] == door_probe["door_pt_sha_after"]
          and door_probe["door_pt_sha_before"] != "missing",
          f'{door_probe["door_pt_sha_before"][:16]} -> {door_probe["door_pt_sha_after"][:16]}')

    # Stricter than the plan's wording, and it does not currently hold:
    # `empty_result()` is cached at construction, before anything has tried
    # to load anything, so /results answers "No doors in view" until the
    # first frame is analysed.
    note("before its first frame, a module with unloadable weights does not claim an empty camera",
         "no doors in view" not in corrupt["results_before_first_frame"].lower(),
         f'GET /results would say {corrupt["results_before_first_frame"]!r} '
         "until the first frame is processed")

# ----------------------------------------------------------------------
# 8 · nothing loads its model eagerly
# ----------------------------------------------------------------------

section("8 · no module pulls its weights in at import or construction")

import_probe = run_probe(HERE / "_probe_import.py", [PYTHON])

if import_probe.get("__failed__"):
    check("the import probe runs", False, import_probe.get("stderr", "")[-400:])
else:
    eager_import = {
        module_id: held
        for module_id, held in import_probe["after_import"].items()
        if held
    }
    eager_construct = {
        module_id: held
        for module_id, held in import_probe["after_construct"].items()
        if held
    }

    # Face warms its recognition model on a background thread by design and
    # was doing so before Phase 0; it is the one permitted name here.
    check("importing the modules package pulls in no module's weights but face's",
          set(eager_import) <= {"face"},
          f"holding a model after import: {eager_import}")

    check("constructing a module loads nothing at all",
          eager_construct == {},
          f"loaded in __init__: {eager_construct}")

    note("the shared person detector still loads at import, as it did before Phase 0",
         import_probe["shared_detector_eager"] == "YOLO",
         f'app.vision.detector.model is {import_probe["shared_detector_eager"]} '
         "(pre-existing, outside Phase 0)")

# ----------------------------------------------------------------------
# 1 and 2 · what the operator actually reads
# ----------------------------------------------------------------------

section("1 · the navbar during a backend outage · 2 · the Doors page on a fresh install")

browser_probe = run_probe(NODE_SCRIPT, ["node"])

if browser_probe.get("__failed__") or browser_probe.get("error"):
    check("the headless browser drives the dashboard", False,
          browser_probe.get("error") or browser_probe.get("stderr", "")[-400:])
else:
    up = browser_probe.get("navbar_backend_up", "")
    down = browser_probe.get("navbar_backend_down", "")

    check("with the backend unreachable, the navbar says it is not responding",
          "not responding" in down.lower(),
          f"navbar read {down.strip()!r}")
    check("and it does not still claim the system is working",
          "not responding" in down.lower() or "working" not in down.lower(),
          f"navbar read {down.strip()!r}")
    check("while with the backend up it does not cry outage",
          "not responding" not in up.lower(),
          f"navbar read {up.strip()!r}")

    doors = browser_probe.get("doors_text", "")

    # A blank page contains no forbidden string either, so prove the page is
    # the Doors page before believing anything absent from it.
    check("the Doors page rendered at all",
          "Doors" in doors and len(doors) > 200,
          f"{len(doors)} characters: {doors[:200]!r}")

    check("a fresh install's Doors page never says the door AI is not installed",
          "not installed" not in doors.lower(),
          "page reads: " + " / ".join(
              line for line in doors.splitlines() if "not installed" in line.lower()
          )[:200])
    check("and it offers to be set up instead",
          bool(re.search(r"mark|doorway", doors, re.I)),
          "page text: " + doors[:200].replace("\n", " / "))
    check("the model really is loaded on the deployment that page was read from",
          (browser_probe.get("doors_status") or {}).get("model_loaded") is True,
          f'status={browser_probe.get("doors_status")}')

# ----------------------------------------------------------------------

section("Result")

passed = sum(1 for outcome, _, _ in results if outcome == "PASS")
print(f"{passed}/{len(results)} checks passed · "
      f"{len(failures)} failed · {len(advisories)} advisory")

if advisories:
    print("\nAdvisory (reported, not blocking):")
    for name in advisories:
        print(f"  · {name}")

if failures:
    print("\nFAILED:")
    for name in failures:
        print(f"  · {name}")
    print("\nPhase 0 does not ship.")
    sys.exit(1)

print("\nPhase 0's every done-when criterion holds.")
