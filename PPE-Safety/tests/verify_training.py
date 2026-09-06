"""
Worker registration and the training portal.

A worker is registered at a desk and handed a link; the link runs their
randomly allotted induction program, issues a certificate on completion,
takes a five-question assessment, and produces a score card. What this
measures, in the order it matters:

    * a bad registration is refused with a sentence, not stored wrong
    * the portal payload leaks nothing — no answer key, no token, nobody
      else
    * grading is right on every shape of answer sheet, including malformed
    * the flow's order is enforced: no assessment before the training
    * the certificate is minted once, however often the button is pressed
    * the register survives a restart
    * and the monitoring product is exactly as it was before any of this

The last one is the important one. Registration is the first feature in
this repository that is about people rather than pictures, and the proof
that it stayed out of the monitoring product's way is a check, not a
promise.

Run from `backend/`:

    PYTHONPATH=$PWD .venv/bin/python ../tests/verify_training.py
"""

import json
import sys
from pathlib import Path

SCRATCH = Path("/tmp") / "_training_suite"
SCRATCH.mkdir(parents=True, exist_ok=True)
STORE = SCRATCH / "workers.json"
STORE.unlink(missing_ok=True)

# The registry under test writes to a suite-owned file, never the real one.
import app.training.workers as workers_module
from app.training.programs import PASS_MARK, PROGRAMS, PROGRAMS_BY_ID, public_program
from app.training.workers import WorkerRegistry

failures = 0


def check(name: str, ok: bool, detail: str = "") -> bool:
    global failures
    print(("PASS  " if ok else "FAIL  ") + name + (f"  [{detail}]" if not ok and detail else ""))
    if not ok:
        failures += 1
    return ok


def section(title: str) -> None:
    print(f"\n--- {title}")


print("Training verification")

# ----------------------------------------------------------------------
section("1 · the seed data holds together")
# ----------------------------------------------------------------------

check("three programs, each with sections and a five-question quiz",
      len(PROGRAMS) == 3
      and all(len(p["sections"]) >= 4 for p in PROGRAMS)
      and all(len(p["quiz"]) == 5 for p in PROGRAMS))

check("every answer index points at a real option",
      all(0 <= q["answer"] < len(q["options"])
          for p in PROGRAMS for q in p["quiz"]))

check("the pass mark is reachable and not a giveaway",
      0 < PASS_MARK <= 5)

check("the public shape of a program carries no answer key",
      "answer" not in json.dumps(public_program(PROGRAMS[0]["id"])))

# ----------------------------------------------------------------------
section("2 · registration refuses what it cannot hold")
# ----------------------------------------------------------------------

registry = WorkerRegistry(path=STORE)

for fields, why in (
    ({"first_name": "", "last_name": "S", "employee_id": "E1", "designation": "D"},
     "a blank first name"),
    ({"first_name": "A", "last_name": "S", "employee_id": "", "designation": "D"},
     "a blank employee id"),
    ({"first_name": "A", "last_name": "S", "employee_id": "E1", "designation": ""},
     "a blank designation"),
    ({"first_name": "A", "last_name": "S", "employee_id": "E1", "designation": "D",
      "dob": "not-a-date"},
     "a date of birth that is not a date"),
    ({"first_name": "A", "last_name": "S", "employee_id": "E1", "designation": "D",
      "blood_group": "Q+"},
     "a blood group that does not exist"),
):
    try:
        registry.register(**fields)
        check(f"{why} is refused", False, "it was stored")
    except ValueError as exc:
        check(f"{why} is refused, and the refusal says why", bool(str(exc)))

check("none of those were stored", registry.list_workers() == [])

asha = registry.register(
    first_name="Asha", last_name="Kumari", employee_id="VG-0412",
    designation="Fitter", blood_group="b+",
)

check("a good registration is stored, blood group normalised",
      asha["blood_group"] == "B+")

check("the allotted program is a real one",
      asha["program_id"] in PROGRAMS_BY_ID)

check("the token is long enough to be the only lock on the door",
      len(asha["token"]) >= 20, f"{len(asha['token'])} chars")

try:
    registry.register(first_name="Copy", last_name="Cat",
                      employee_id="vg-0412", designation="Fitter")
    check("a duplicate employee id is refused, case ignored", False, "stored")
except ValueError as exc:
    check("a duplicate employee id is refused, case ignored, naming the holder",
          "Asha" in str(exc), str(exc))

# Allotment is random; over enough registrations every program should be
# hit. Not a statistical claim — just proof the choice is drawn from the
# whole catalog rather than always the first entry.
seen = set()
for index in range(40):
    record = registry.register(
        first_name="W", last_name=str(index),
        employee_id=f"BULK-{index}", designation="Op",
    )
    seen.add(record["program_id"])
check("random allotment draws from the whole catalog",
      seen == set(PROGRAMS_BY_ID), f"only {sorted(seen)}")

for record in registry.list_workers():
    if record["employee_id"].startswith("BULK-"):
        registry.remove(record["id"])

# ----------------------------------------------------------------------
section("3 · what the portal sends, and what it never sends")
# ----------------------------------------------------------------------

from app.api.worker_routes import _admin_view, _portal_view  # noqa: E402

view = _portal_view(registry.by_token(asha["token"]))
raw = json.dumps(view)

check("the portal payload carries no answer key", '"answer"' not in raw)
check("...and no token", asha["token"] not in raw)
check("...and only this worker",
      "Asha" in raw and not any(
          other["first_name"] in raw
          for other in registry.list_workers() if other["id"] != asha["id"]))
check("an unknown token is nobody", registry.by_token("nope") is None)

# ----------------------------------------------------------------------
section("4 · the flow's order is the flow's meaning")
# ----------------------------------------------------------------------

try:
    registry.grade_assessment(asha["token"], [0, 0, 0, 0, 0])
    check("the assessment is refused before the training", False, "graded")
except ValueError as exc:
    check("the assessment is refused before the training, and says so",
          "training" in str(exc).lower(), str(exc))

first = registry.complete_training(asha["token"])
second = registry.complete_training(asha["token"])

check("completing mints a certificate",
      bool(first["training"] and first["training"]["certificate_id"]))
check("completing twice mints it once",
      first["training"]["certificate_id"] == second["training"]["certificate_id"])

# ----------------------------------------------------------------------
section("5 · grading")
# ----------------------------------------------------------------------

quiz = PROGRAMS_BY_ID[asha["program_id"]]["quiz"]
key = [q["answer"] for q in quiz]

wrong = registry.grade_assessment(asha["token"], [(a + 1) % 4 for a in key])
check("all wrong scores zero and fails",
      wrong["assessment"]["score"] == 0 and not wrong["assessment"]["passed"])

check("the score card is numbered",
      wrong["assessment"]["scorecard_id"].startswith("VG-SCORE-"))

partial_answers = key[:PASS_MARK] + [(a + 1) % 4 for a in key[PASS_MARK:]]
partial = registry.grade_assessment(asha["token"], partial_answers)
check(f"exactly {PASS_MARK} right is a pass — the mark means the mark",
      partial["assessment"]["score"] == PASS_MARK
      and partial["assessment"]["passed"])

right = registry.grade_assessment(asha["token"], key)
check("all right is full marks",
      right["assessment"]["score"] == 5 and right["assessment"]["passed"])

check("the latest attempt replaced the earlier ones",
      right["assessment"]["scorecard_id"] != wrong["assessment"]["scorecard_id"])

check("per-question outcomes line up with the answers",
      right["assessment"]["per_question"] == [True] * 5
      and wrong["assessment"]["per_question"] == [False] * 5)

for bad, why in (
    ([0, 0], "too few answers"),
    ([0] * 9, "too many answers"),
    ("abcde", "not a list at all"),
):
    try:
        registry.grade_assessment(asha["token"], bad)
        check(f"{why} is refused", False, "graded")
    except ValueError:
        check(f"{why} is refused", True)

check("an unanswerable entry counts as wrong, not as a crash",
      registry.grade_assessment(
          asha["token"], [None, "x", *key[2:]]
      )["assessment"]["score"] == 3)

# ----------------------------------------------------------------------
section("5b · the desk's quiz bank, and who may hold the key")
# ----------------------------------------------------------------------

import app.api.worker_routes as routes  # noqa: E402

# The route reads the process-wide singleton; point it at this suite's
# registry so the stats below are about workers this suite made.
_original_registry = routes.worker_registry
routes.worker_registry = registry
try:
    bank = routes.list_assessments()["data"]

    check("the desk's assessment catalog carries the key for every question",
          all("answer" in q for p_ in bank["programs"] for q in p_["quiz"]))

    check("and the key it carries is the key the grader uses",
          all(
              [q["answer"] for q in p_["quiz"]]
              == [q["answer"] for q in PROGRAMS_BY_ID[p_["id"]]["quiz"]]
              for p_ in bank["programs"]
          ))

    mine = next(p_ for p_ in bank["programs"] if p_["id"] == asha["program_id"])
    check("the taken and passed counts describe the workers who took it",
          mine["taken"] == 1 and mine["passed"] == 1,
          f"taken={mine['taken']} passed={mine['passed']}")

    check("the portal payload still carries no key — the desk surface did "
          "not loosen the phone's",
          '"answer"' not in json.dumps(
              _portal_view(registry.by_token(asha["token"]))))
finally:
    routes.worker_registry = _original_registry

# ----------------------------------------------------------------------
section("5c · Skilled at sixty percent, and the photo rule")
# ----------------------------------------------------------------------

from app.api.worker_routes import photo_count_problem  # noqa: E402
from app.training.programs import SKILL_THRESHOLD  # noqa: E402

check("the threshold is sixty percent, named once",
      SKILL_THRESHOLD == 0.6)

# asha currently holds 3/5 from section 5 — exactly sixty percent.
check("three of five — exactly sixty percent — is Skilled",
      _admin_view(registry.by_token(asha["token"]))["skilled"] is True)

two = registry.grade_assessment(
    asha["token"], key[:2] + [(a + 1) % 4 for a in key[2:]]
)
check("two of five is Unskilled",
      _admin_view(two)["skilled"] is False
      and two["assessment"]["score"] == 2)

fresh = registry.register(first_name="New", last_name="Starter",
                          employee_id="SKILL-1", designation="Op")
check("a worker not yet assessed is neither — no verdict is invented",
      _admin_view(fresh)["skilled"] is None)
registry.remove(fresh["id"])

for count, why in ((0, "no photos"), (6, "six photos")):
    check(f"{why} cannot register a worker",
          photo_count_problem(count) is not None)
check("one to five photos can",
      all(photo_count_problem(c) is None for c in (1, 2, 3, 4, 5)))

# ----------------------------------------------------------------------
section("5d · a recognised worker is not an alarm")
# ----------------------------------------------------------------------

from app.modules.face.service import service as face_service  # noqa: E402
from app.modules.face.store import people_store  # noqa: E402

check("entries stored before the kind existed read as watchlist",
      all(p.get("kind") == "watchlist" for p in people_store.people())
      or people_store.count() == 0)

def _assessment(kind):
    return [{
        "box": (0.0, 0.0, 50.0, 50.0),
        "confidence": 0.9,
        "person": {"id": "t-1", "name": "T", "crime": "", "kind": kind},
        "score": 0.9,
    }]

worker_result = face_service._summarise(_assessment("worker"))
watch_result = face_service._summarise(_assessment("watchlist"))

check("a recognised watchlist entry is the alarm it always was",
      watch_result["alert"] is True and watch_result["status"] == "alert")

check("a recognised worker is not an alert and not an 'alert' status",
      worker_result["alert"] is False and worker_result["status"] == "clear",
      f"{worker_result['alert']} {worker_result['status']}")

check("both are still recognised — the fact is reported either way",
      worker_result["recognized_count"] == 1
      and worker_result["recognized"][0]["kind"] == "worker")

check("a watchlist sighting is recorded; a worker's is not",
      len(face_service.events(watch_result)) == 1
      and face_service.events(watch_result)[0]["severity"] == "high"
      and face_service.events(worker_result) == [])

regions_worker = face_service._regions(_assessment("worker"), 100, 100)
regions_watch = face_service._regions(_assessment("watchlist"), 100, 100)
check("on screen: the worker draws green with their name, the watchlist red",
      regions_worker[0]["tone"] == "ok"
      and regions_worker[0]["label"] == "T"
      and regions_watch[0]["tone"] == "danger")

# ----------------------------------------------------------------------
section("6 · the register survives a restart")
# ----------------------------------------------------------------------

registry.attach_face(asha["id"], "test-face-9x9x9x", 3)

reloaded = WorkerRegistry(path=STORE)
back = reloaded.by_token(asha["token"])

check("the face link and photo count survive the restart",
      back["face_person_id"] == "test-face-9x9x9x" and back["photos"] == 3)

check("the worker is still there, progress and all",
      back is not None
      and back["training"]["certificate_id"] == first["training"]["certificate_id"]
      and back["assessment"]["score"] == 2)

removed = reloaded.remove(back["id"])
check("removal forgets the worker, kills the link, and hands back the "
      "record so the route can un-enroll the face",
      removed is not None
      and removed["face_person_id"] == "test-face-9x9x9x"
      and reloaded.by_token(asha["token"]) is None)

# ----------------------------------------------------------------------
section("7 · the monitoring product did not move")
# ----------------------------------------------------------------------

from app.modules import registry as module_registry  # noqa: E402

check("the module catalog is exactly the ten it was",
      sorted(module_registry.list_module_ids()) == sorted([
          "restricted-zone", "vehicle-zone", "walkways", "ppe", "gloves",
          "mask", "face", "workstation", "door", "suspended-load",
      ]),
      str(module_registry.list_module_ids()))

check("the worker registry is not a monitoring module",
      not hasattr(workers_module.worker_registry, "module_id"))

STORE.unlink(missing_ok=True)

print(f"\n{'All training checks passed.' if failures == 0 else str(failures) + ' FAILED'}")
sys.exit(1 if failures else 0)
