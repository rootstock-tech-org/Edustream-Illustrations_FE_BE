"""
The worker register: who has been registered, and how far through training.

A worker is registered once at a desk; everything after that happens on the
worker's own phone through a link. The link's token is the entire access
control — there is no login anywhere in this product — so it comes from
`secrets` and is long enough that guessing one is not a plan. The token is
how the portal addresses a worker and must never appear in anything the
portal sends back.

The training program is allotted at registration, at random, from the seeded
catalog — that is the brief: a new worker gets one of the site's induction
programs, not a choice of them.

Progress is three one-way steps, each stamped when it happens:

    registered  ->  training complete (a certificate)  ->  assessed (a score
    card)

Completion is idempotent — pressing the button twice must not mint a second
certificate — and assessment can be retaken, keeping the latest attempt: a
worker who failed and re-read the material should be judged on what they
know now.

Persistence follows the camera register: one JSON file, a lock, an atomic
temp-and-replace save after every mutation, and a load that treats a missing
or unreadable file as an empty register rather than a crash. The singleton
is built at import time, before the storage directories exist, so the save
path makes its own parent.
"""

from __future__ import annotations

import json
import random
import secrets
import string
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from app.core.config import STORAGE_DIR
from app.training.programs import PASS_MARK, PROGRAMS, PROGRAMS_BY_ID

#: Longest stored text field. Same bound as the other registers.
MAX_TEXT = 60

#: The blood groups a form may claim. Anything else is a typo, and a wrong
#: blood group on a factory record is worse than a blank one.
BLOOD_GROUPS = ("A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-")

#: Alphabet for certificate and score card ids: uppercase, minus the four
#: characters people misread over a phone (0/O, 1/I).
_ID_ALPHABET = "".join(
    c for c in string.ascii_uppercase + string.digits if c not in "01IO"
)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _short_id(prefix: str) -> str:
    """A readable id like VG-CERT-7FK3MQ — for saying aloud, not for secrecy."""
    code = "".join(secrets.choice(_ID_ALPHABET) for _ in range(6))
    return f"{prefix}-{code}"


def _text(value: Any, label: str, required: bool = False) -> str:
    """A stored text field: trimmed, bounded — and refused only when required."""
    cleaned = str(value or "").strip()[:MAX_TEXT]
    if required and not cleaned:
        raise ValueError(f"{label} is required.")
    return cleaned


def _date(value: Any, label: str) -> str:
    """An optional date, kept only when it reads as one."""
    cleaned = str(value or "").strip()
    if not cleaned:
        return ""
    try:
        datetime.strptime(cleaned, "%Y-%m-%d")
    except ValueError:
        raise ValueError(f"{label} must be a date like 1990-04-27.") from None
    return cleaned


class WorkerRegistry:
    """The registered workers, keyed by id, indexed by portal token."""

    def __init__(self, path: Optional[Path] = None) -> None:
        self.path = path if path is not None else STORAGE_DIR / "worker_registry.json"
        self._lock = threading.Lock()

        #: worker id -> record. Insertion order is registration order.
        self._workers: dict[str, dict[str, Any]] = {}

        #: portal token -> worker id. Rebuilt on load; the file stores the
        #: token on the record, this is just the hot-path lookup.
        self._by_token: dict[str, str] = {}

        self.load()

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------

    def load(self) -> None:
        with self._lock:
            self._workers = {}
            self._by_token = {}

            if not self.path.exists():
                print("[Workers] No worker register yet.")
                return

            try:
                payload = json.loads(self.path.read_text())
            except Exception:  # noqa: BLE001
                print("[Workers] Register unreadable, starting empty.")
                return

            for record in payload.get("workers", []):
                worker_id = str(record.get("id") or "")
                token = str(record.get("token") or "")
                if not worker_id or not token:
                    continue
                self._workers[worker_id] = record
                self._by_token[token] = worker_id

            print(f"[Workers] Loaded {len(self._workers)} worker(s).")

    def _save_locked(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = {"workers": list(self._workers.values())}
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(payload, indent=2))
        tmp.replace(self.path)

    # ------------------------------------------------------------------
    # Registration
    # ------------------------------------------------------------------

    def register(self, **fields: Any) -> dict[str, Any]:
        """
        Register a worker and allot them a program.

        Raises:
            ValueError: when a required field is blank, the employee id is
                already registered, or an optional field is unusable —
                refused rather than stored wrong.
        """
        first_name = _text(fields.get("first_name"), "First name", required=True)
        last_name = _text(fields.get("last_name"), "Last name", required=True)
        employee_id = _text(fields.get("employee_id"), "Employee ID", required=True)
        designation = _text(fields.get("designation"), "Designation", required=True)

        department = _text(fields.get("department"), "Department")
        phone = _text(fields.get("phone"), "Phone")
        dob = _date(fields.get("dob"), "Date of birth")
        date_of_joining = _date(fields.get("date_of_joining"), "Date of joining")

        blood_group = _text(fields.get("blood_group"), "Blood group").upper()
        if blood_group and blood_group not in BLOOD_GROUPS:
            raise ValueError(
                "Blood group must be one of "
                + ", ".join(BLOOD_GROUPS)
                + " — leave it blank if it is not known."
            )

        contact = fields.get("emergency_contact") or {}
        emergency_contact = {
            "name": _text(contact.get("name"), "Emergency contact name"),
            "phone": _text(contact.get("phone"), "Emergency contact phone"),
        }

        with self._lock:
            for existing in self._workers.values():
                if existing["employee_id"].lower() == employee_id.lower():
                    holder = f"{existing['first_name']} {existing['last_name']}".strip()
                    raise ValueError(
                        f"Employee ID {employee_id} is already registered "
                        f"to {holder}."
                    )

            worker_id = f"w{len(self._workers) + 1}"
            while worker_id in self._workers:
                worker_id = f"w{int(worker_id[1:]) + 1}"

            token = secrets.token_urlsafe(16)
            while token in self._by_token:  # vanishingly unlikely; cheap to hold
                token = secrets.token_urlsafe(16)

            record = {
                "id": worker_id,
                "token": token,
                "first_name": first_name,
                "last_name": last_name,
                "employee_id": employee_id,
                "designation": designation,
                "department": department,
                "phone": phone,
                "dob": dob,
                "date_of_joining": date_of_joining,
                "blood_group": blood_group,
                "emergency_contact": emergency_contact,
                # The allotment the brief asked for: one of the site's
                # programs, at random, bound to this worker's link.
                "program_id": random.choice(PROGRAMS)["id"],
                "registered_at": _utc_now(),
                # Filled in by attach_face once the photos are enrolled —
                # after registration, because the face entry's id does not
                # exist until the enrollment that needs a valid worker.
                "face_person_id": None,
                "photos": 0,
                "training": None,
                "assessment": None,
            }

            self._workers[worker_id] = record
            self._by_token[token] = worker_id
            self._save_locked()

            return dict(record)

    def remove(self, worker_id: str) -> Optional[dict[str, Any]]:
        """
        Forget a worker. Their link stops answering.

        Returns the removed record rather than a bare True, because the
        route also has to un-enroll their face and needs the person id to
        do it — a deleted worker takes their enrollment with them.
        """
        with self._lock:
            record = self._workers.pop(worker_id, None)
            if record is None:
                return None
            self._by_token.pop(record.get("token", ""), None)
            self._save_locked()
            return dict(record)

    def attach_face(
        self, worker_id: str, face_person_id: str, photos: int
    ) -> dict[str, Any]:
        """
        Record which face-register entry this worker's photos became.

        Raises:
            KeyError: unknown worker — the enrollment outlived the record.
        """
        with self._lock:
            if worker_id not in self._workers:
                raise KeyError("That worker is not registered.")
            record = self._workers[worker_id]
            record["face_person_id"] = str(face_person_id)
            record["photos"] = int(photos)
            self._save_locked()
            return dict(record)

    # ------------------------------------------------------------------
    # Reading
    # ------------------------------------------------------------------

    def list_workers(self) -> list[dict[str, Any]]:
        """Every registered worker, registration order, as copies."""
        with self._lock:
            return [dict(record) for record in self._workers.values()]

    def by_token(self, token: str) -> Optional[dict[str, Any]]:
        """The worker a portal token belongs to, or None."""
        with self._lock:
            worker_id = self._by_token.get(str(token or ""))
            if worker_id is None:
                return None
            return dict(self._workers[worker_id])

    def allotment_counts(self) -> dict[str, int]:
        """How many workers each program has been allotted to."""
        with self._lock:
            counts = {program["id"]: 0 for program in PROGRAMS}
            for record in self._workers.values():
                if record["program_id"] in counts:
                    counts[record["program_id"]] += 1
            return counts

    # ------------------------------------------------------------------
    # Progress
    # ------------------------------------------------------------------

    def complete_training(self, token: str) -> dict[str, Any]:
        """
        Mark a worker's training complete and mint their certificate.

        Idempotent: completing twice returns the same certificate. A second
        press of a button must not produce a second certificate number.

        Raises:
            KeyError: unknown token.
        """
        with self._lock:
            worker_id = self._by_token.get(str(token or ""))
            if worker_id is None:
                raise KeyError("That link is not valid.")

            record = self._workers[worker_id]

            if record["training"] is None:
                record["training"] = {
                    "completed_at": _utc_now(),
                    "certificate_id": _short_id("VG-CERT"),
                }
                self._save_locked()

            return dict(record)

    def grade_assessment(self, token: str, answers: Any) -> dict[str, Any]:
        """
        Grade a worker's answers against their program and keep the result.

        The latest attempt replaces any earlier one — a worker who failed,
        re-read the material and passed should be judged on the pass.

        Raises:
            KeyError: unknown token.
            ValueError: training not yet complete (the flow is program,
                certificate, then assessment), or answers malformed.
        """
        with self._lock:
            worker_id = self._by_token.get(str(token or ""))
            if worker_id is None:
                raise KeyError("That link is not valid.")

            record = self._workers[worker_id]

            if record["training"] is None:
                raise ValueError(
                    "Finish the training first — the assessment checks what "
                    "the training taught."
                )

            quiz = PROGRAMS_BY_ID[record["program_id"]]["quiz"]

            if not isinstance(answers, list) or len(answers) != len(quiz):
                raise ValueError(
                    f"The assessment has {len(quiz)} questions — send one "
                    "answer for each, in order."
                )

            per_question: list[bool] = []
            for given, question in zip(answers, quiz):
                try:
                    chosen = int(given)
                except (TypeError, ValueError):
                    chosen = -1
                per_question.append(chosen == question["answer"])

            score = sum(per_question)

            record["assessment"] = {
                "scorecard_id": _short_id("VG-SCORE"),
                "score": score,
                "total": len(quiz),
                "passed": score >= PASS_MARK,
                "per_question": per_question,
                "taken_at": _utc_now(),
            }
            self._save_locked()

            return dict(record)


worker_registry = WorkerRegistry()
