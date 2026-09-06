"""
Worker registration and the training portal.

Two surfaces over one register, split by who is holding the phone:

    /api/workers   the desk side — register a worker, list them, remove one,
                   and read the program catalog the Registration and
                   Programs pages draw from.

    /api/portal    the worker side — everything a handed-out link can do,
                   addressed by its token and nothing else. The portal never
                   lists anyone, never echoes the token back, and never
                   sends a quiz answer key: grading happens here, against
                   the seed data the browser cannot see.

Neither is a monitoring module, deliberately: the phase suites pin the
module catalog exactly, and a person register is not a camera capability.
Mounted like the camera register — a plain router under /api.
"""

import asyncio
from typing import Any, Optional

import cv2
import numpy as np
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.modules.face.service import service as face_service
from app.modules.face.store import (
    FACES_DIR,
    MAX_PHOTOS,
    MIN_PHOTOS,
    people_store,
)
from app.modules.router_factory import MAX_FRAME_BYTES, MAX_FRAME_PIXELS
from app.training.programs import (
    PASS_MARK,
    PROGRAMS,
    SKILL_THRESHOLD,
    public_program,
)
from app.training.workers import worker_registry

router = APIRouter(prefix="/workers", tags=["Workers"])
portal_router = APIRouter(prefix="/portal", tags=["Training portal"])


# ----------------------------------------------------------------------
# Shapes
# ----------------------------------------------------------------------


class Answers(BaseModel):
    answers: list[Any]


def photo_count_problem(count: int) -> Optional[str]:
    """
    Why this many photos cannot register a worker, or None when they can.

    A function rather than an inline check so the rule is testable without
    a face model in the room: the count rule is arithmetic, and only the
    face-finding beyond it needs the AI.
    """
    if not MIN_PHOTOS <= count <= MAX_PHOTOS:
        return (
            f"Between {MIN_PHOTOS} and {MAX_PHOTOS} photos are required to "
            f"register a worker; {count} were sent."
        )
    return None


def _admin_view(record: dict[str, Any]) -> dict[str, Any]:
    """
    A worker as the desk side sees them: everything, plus their link path.

    The token is part of this view on purpose — the desk is where the link
    is handed out, and a lost link must be recoverable from the list.
    """
    view = dict(record)
    view["link_path"] = f"/worker/{record['token']}"
    view["program_name"] = _program_name(record["program_id"])

    # The Status page's verdict, derived here so every reader shares one
    # arithmetic: None until they have been assessed at all, then Skilled
    # at sixty percent or better. Today that coincides with the pass mark
    # — 3 of 5 — and the two rules stay separately named on purpose.
    result = record.get("assessment")
    view["skilled"] = (
        None
        if not result
        else (result["score"] / result["total"]) >= SKILL_THRESHOLD
    )
    return view


def _program_name(program_id: str) -> str:
    for program in PROGRAMS:
        if program["id"] == program_id:
            return program["name"]
    return program_id


def _portal_view(record: dict[str, Any]) -> dict[str, Any]:
    """
    A worker as their own link sees them.

    Only what the portal screens need: the name to greet with, the program
    to run, and how far they have got. No token — the browser already has
    it in the address bar, and a payload is one copy too many — no employee
    ID beyond what the certificate needs, and nobody else's anything.
    """
    return {
        "first_name": record["first_name"],
        "last_name": record["last_name"],
        "employee_id": record["employee_id"],
        "designation": record["designation"],
        "program": public_program(record["program_id"]),
        "training": dict(record["training"]) if record["training"] else None,
        "assessment": dict(record["assessment"]) if record["assessment"] else None,
    }


# ----------------------------------------------------------------------
# The desk side
# ----------------------------------------------------------------------


@router.post("")
async def register_worker(
    first_name: str = Form(...),
    last_name: str = Form(...),
    employee_id: str = Form(...),
    designation: str = Form(...),
    department: str = Form(""),
    phone: str = Form(""),
    dob: str = Form(""),
    date_of_joining: str = Form(""),
    blood_group: str = Form(""),
    emergency_name: str = Form(""),
    emergency_phone: str = Form(""),
    photos: list[UploadFile] = File(...),
) -> dict[str, Any]:
    """
    Register a worker; the answer carries the link to hand them.

    Multipart, because registration now requires 1-5 photographs — they
    become the worker's picture on the desk pages and their enrollment in
    face recognition, so the cameras know registered workers by name. A
    worker enrolled this way is recognised, never alarmed: their entry is
    kind="worker", which is the opposite of the watchlist.

    Ordered so no failure leaves an orphan: the photos are judged first
    (nothing written), the worker stored second (a duplicate employee id
    stops here), the face entry written third, and a failure after storage
    removes the worker again.
    """
    problem = photo_count_problem(len(photos))
    if problem:
        raise HTTPException(status_code=400, detail=problem)

    # The model, before any photo work: _retry_load is the only call that
    # clears the loader's failure latch, and skipping it turns an honest
    # 503 sentence into a bare 500 from deeper in.
    if face_service._retry_load() is None:
        raise HTTPException(
            status_code=503,
            detail=face_service._load_error
            or "The face recognition AI is not available.",
        )

    usable: list[bytes] = []
    signatures: list[Any] = []
    skipped: list[dict[str, Any]] = []

    for index, upload in enumerate(photos, start=1):
        data = await upload.read()

        def skip(reason: str) -> None:
            skipped.append({"photo": index, "reason": reason})

        if len(data) > MAX_FRAME_BYTES:
            skip("The photo is too large.")
            continue

        # Before imdecode, which asserts on an empty buffer instead of
        # returning None.
        if not data:
            skip("The photo is empty.")
            continue

        frame = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)

        if frame is None:
            skip("Could not read the photo. Use JPEG or PNG.")
            continue

        if frame.shape[0] * frame.shape[1] > MAX_FRAME_PIXELS:
            skip("The photo is too large.")
            continue

        # Blocking ONNX inference — off the event loop, or every other
        # request on the server waits behind each photograph.
        signature = await asyncio.to_thread(
            face_service.signature_from_photo, frame
        )

        if signature is None:
            skip("No face could be seen in this photo.")
            continue

        usable.append(data)
        signatures.append(signature)

    if not signatures:
        raise HTTPException(
            status_code=400,
            detail=(
                "No face could be seen in the photos. Use clear, well-lit "
                "photos of the worker's face."
            ),
        )

    try:
        record = worker_registry.register(
            first_name=first_name,
            last_name=last_name,
            employee_id=employee_id,
            designation=designation,
            department=department,
            phone=phone,
            dob=dob,
            date_of_joining=date_of_joining,
            blood_group=blood_group,
            emergency_contact={
                "name": emergency_name,
                "phone": emergency_phone,
            },
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        person = people_store.add(
            name=f"{record['first_name']} {record['last_name']}".strip(),
            crime="",
            photos=usable,
            signatures=signatures,
            kind="worker",
        )
        record = worker_registry.attach_face(
            record["id"], person["id"], len(usable)
        )
    except Exception as exc:  # noqa: BLE001
        # The worker is stored but their face is not — half a registration
        # is worse than none, so take the record back out and say why.
        worker_registry.remove(record["id"])
        raise HTTPException(
            status_code=500,
            detail=f"The photos could not be enrolled: {exc}",
        ) from exc

    view = _admin_view(record)
    view["photos_used"] = len(usable)
    view["photos_skipped"] = skipped
    return {"success": True, "data": view}


@router.get("")
def list_workers() -> dict[str, Any]:
    """Every registered worker, with program and progress."""
    return {
        "success": True,
        "data": {
            "workers": [
                _admin_view(record) for record in worker_registry.list_workers()
            ],
        },
    }


@router.delete("/{worker_id}")
def remove_worker(worker_id: str) -> dict[str, Any]:
    """Forget a worker — and their face enrollment goes with them."""
    record = worker_registry.remove(worker_id)
    if record is None:
        raise HTTPException(
            status_code=404, detail="That worker is not registered."
        )

    if record.get("face_person_id"):
        # Best effort: the worker is already gone, and a face entry whose
        # files were hand-deleted must not resurrect the 404.
        try:
            people_store.remove(record["face_person_id"])
        except Exception as exc:  # noqa: BLE001
            print(f"[Workers] Face entry not removed: {exc}")

    return {"success": True, "data": {"removed": worker_id}}


@router.get("/{worker_id}/photo")
def worker_photo(worker_id: str) -> FileResponse:
    """
    The worker's first registered photo, for the desk pages' avatars.

    Served from the face store, where the photos live — registration keeps
    one copy of a person's pictures, not two.
    """
    record = next(
        (w for w in worker_registry.list_workers() if w["id"] == worker_id),
        None,
    )

    if record is None or not record.get("face_person_id"):
        raise HTTPException(status_code=404, detail="No photo for that worker.")

    path = FACES_DIR / record["face_person_id"] / "photo-1.jpg"

    if not path.is_file():
        raise HTTPException(status_code=404, detail="No photo for that worker.")

    return FileResponse(path, media_type="image/jpeg")


@router.get("/programs")
def list_programs() -> dict[str, Any]:
    """
    The training catalog, for the Programs page.

    Full sections, question count rather than questions — the desk side has
    no reason to hold the quiz, let alone the key — and how many workers
    each program has been allotted to.
    """
    counts = worker_registry.allotment_counts()

    return {
        "success": True,
        "data": {
            "pass_mark": PASS_MARK,
            "programs": [
                {
                    "id": program["id"],
                    "name": program["name"],
                    "summary": program["summary"],
                    "sections": [dict(s) for s in program["sections"]],
                    "questions": len(program["quiz"]),
                    "allotted": counts.get(program["id"], 0),
                }
                for program in PROGRAMS
            ],
        },
    }


@router.get("/assessments")
def list_assessments() -> dict[str, Any]:
    """
    The quizzes themselves, for the Assessment page.

    This is the one surface that carries the answer key, and it is a desk
    surface: the people who own the quiz may read it. The worker-facing
    portal still never sees an answer — grading stays server-side — so a
    worker on their phone cannot reach the key their assessment is marked
    against without walking to the control room.

    Beside each program's quiz: how its workers have done so far, because a
    page called Assessment should say how the assessment is going.
    """
    taken: dict[str, int] = {}
    passed: dict[str, int] = {}
    for worker in worker_registry.list_workers():
        result = worker.get("assessment")
        if not result:
            continue
        taken[worker["program_id"]] = taken.get(worker["program_id"], 0) + 1
        if result.get("passed"):
            passed[worker["program_id"]] = passed.get(worker["program_id"], 0) + 1

    return {
        "success": True,
        "data": {
            "pass_mark": PASS_MARK,
            "programs": [
                {
                    "id": program["id"],
                    "name": program["name"],
                    "quiz": [
                        {
                            "question": q["question"],
                            "options": list(q["options"]),
                            "answer": q["answer"],
                        }
                        for q in program["quiz"]
                    ],
                    "taken": taken.get(program["id"], 0),
                    "passed": passed.get(program["id"], 0),
                }
                for program in PROGRAMS
            ],
        },
    }


# ----------------------------------------------------------------------
# The worker side
# ----------------------------------------------------------------------


@portal_router.get("/{token}")
def portal_state(token: str) -> dict[str, Any]:
    """
    Everything a worker's link needs to resume where they left off.

    404 for a token the register does not hold — a revoked or mistyped link
    reads as invalid, not as an error inside the system.
    """
    record = worker_registry.by_token(token)
    if record is None:
        raise HTTPException(status_code=404, detail="That link is not valid.")

    return {"success": True, "data": _portal_view(record)}


@portal_router.post("/{token}/complete")
def complete_training(token: str) -> dict[str, Any]:
    """Mark the training complete. Idempotent — one certificate, ever."""
    try:
        record = worker_registry.complete_training(token)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc.args[0])) from exc

    return {"success": True, "data": _portal_view(record)}


@portal_router.post("/{token}/assessment")
def take_assessment(token: str, payload: Answers) -> dict[str, Any]:
    """Grade the answers server-side; the score card comes back."""
    try:
        record = worker_registry.grade_assessment(token, payload.answers)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc.args[0])) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {"success": True, "data": _portal_view(record)}
