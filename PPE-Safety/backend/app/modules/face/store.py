"""
The register of people the face module watches for.

Registration is the training step: the numbers the AI needs to recognise a
person — one 512-value face signature per photo — are computed once, when the
photos are submitted, and kept here. Recognition later is a comparison against
these signatures, so nothing about a person who was never registered is ever
stored or matched.

Everything lives on disk under ``storage/faces/``:

    people.json          the register itself
    <person-id>/
        photo-1.jpg      the submitted photos, kept as the record of what
        ...              the AI was taught from
        signatures.npy   one unit-length signature per usable photo

Kept as plain files rather than a database for the same reason the rest of
the project is: one Colab machine, a handful of people, and the ability to
inspect what is stored by looking at it.
"""

import json
import re
import threading
import time
import uuid
from typing import Any, Optional

import numpy as np

from app.core.config import STORAGE_DIR

FACES_DIR = STORAGE_DIR / "faces"

#: The register file. Everything except the photos and signatures.
REGISTER_PATH = FACES_DIR / "people.json"

#: Photo limits, enforced here as well as in the API so no caller can slip
#: past them. The minimum is one because a single clear photo is enough to
#: recognise someone; the maximum keeps registration deliberate — five varied
#: photos help, fifty near-duplicates do not.
MIN_PHOTOS = 1
MAX_PHOTOS = 5


def _person_id(name: str) -> str:
    """A URL-safe id from the name plus a suffix, so names may repeat."""
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "person"
    return f"{slug}-{uuid.uuid4().hex[:6]}"


class PeopleStore:
    """
    Thread-safe register of people and their face signatures.

    One instance serves every session: registration applies everywhere at
    once, which is the point of a watchlist.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._people: list[dict[str, Any]] = []

        # (matrix, owners) cache for recognition: matrix rows are signatures,
        # owners[i] is the person that row belongs to. Rebuilt on change.
        self._matrix: Optional[np.ndarray] = None
        self._owners: list[dict[str, Any]] = []

        self._load()

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------

    def _load(self) -> None:
        if not REGISTER_PATH.exists():
            return

        try:
            self._people = json.loads(REGISTER_PATH.read_text())
        except (OSError, ValueError) as exc:
            print(f"[Face] Could not read the register: {exc}")
            self._people = []

    def _save(self) -> None:
        FACES_DIR.mkdir(parents=True, exist_ok=True)
        REGISTER_PATH.write_text(json.dumps(self._people, indent=2))

    # ------------------------------------------------------------------
    # Register
    # ------------------------------------------------------------------

    def add(
        self,
        name: str,
        crime: str,
        photos: list[bytes],
        signatures: list[np.ndarray],
        kind: str = "watchlist",
    ) -> dict[str, Any]:
        """
        Register a person from their photos and the signatures taken of them.

        Args:
            name: who this is. Required.
            crime: the operator's note on why they are watched for. May be
                empty — being on the list is the operator's decision.
            kind: what recognising this person means. "watchlist" — the
                default, and what every entry made before the field existed
                reads as — is the alarm this module was built around.
                "worker" is the opposite: somebody registered through
                worker onboarding, whose recognition is a fact, not an
                alert.
            photos: the submitted photo bytes, one per usable photo, kept as
                the record of what the AI learned from.
            signatures: one unit-length signature per photo, same order.

        Returns:
            The register entry for the new person.
        """
        if not signatures or len(photos) != len(signatures):
            raise ValueError("Each stored photo needs its signature.")

        person = {
            "id": _person_id(name),
            "name": name.strip(),
            "crime": crime.strip(),
            # Anything unrecognised is read as the stricter meaning: a typo
            # must fail toward the alarm, not away from it.
            "kind": kind if kind in ("watchlist", "worker") else "watchlist",
            "photos": len(photos),
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        }

        with self._lock:
            person_dir = FACES_DIR / person["id"]
            person_dir.mkdir(parents=True, exist_ok=True)

            for index, data in enumerate(photos, start=1):
                (person_dir / f"photo-{index}.jpg").write_bytes(data)

            np.save(
                person_dir / "signatures.npy",
                np.stack(signatures).astype(np.float32),
            )

            self._people.append(person)
            self._save()
            self._matrix = None

        return person

    def remove(self, person_id: str) -> bool:
        """Remove a person, their photos and their signatures. True if found."""
        with self._lock:
            match = [p for p in self._people if p["id"] == person_id]

            if not match:
                return False

            self._people = [p for p in self._people if p["id"] != person_id]
            self._save()
            self._matrix = None

            person_dir = FACES_DIR / person_id

            if person_dir.is_dir():
                for path in person_dir.iterdir():
                    path.unlink(missing_ok=True)
                person_dir.rmdir()

        return True

    def people(self) -> list[dict[str, Any]]:
        """
        The register, oldest first.

        Every copy carries a `kind`: entries stored before the field
        existed read as "watchlist", which is exactly what they were.
        """
        with self._lock:
            return [
                {"kind": "watchlist", **p} for p in self._people
            ]

    def count(self) -> int:
        with self._lock:
            return len(self._people)

    # ------------------------------------------------------------------
    # Recognition support
    # ------------------------------------------------------------------

    def signatures(self) -> tuple[Optional[np.ndarray], list[dict[str, Any]]]:
        """
        Every stored signature as one matrix, with its owners.

        Returns:
            (matrix, owners) where matrix is (n, 512) float32 and owners[i]
            is the register entry the i-th row belongs to — or (None, [])
            when nobody is registered. A person whose signature file has
            gone missing is skipped rather than failing everyone else's
            recognition.
        """
        with self._lock:
            if self._matrix is None:
                rows: list[np.ndarray] = []
                owners: list[dict[str, Any]] = []

                for person in self._people:
                    path = FACES_DIR / person["id"] / "signatures.npy"

                    try:
                        stored = np.load(path)
                    except (OSError, ValueError) as exc:
                        print(f"[Face] No signatures for {person['id']}: {exc}")
                        continue

                    for row in stored:
                        rows.append(row)
                        # The same kind-defaulted copy people() hands out,
                        # so a recognition's owner always answers .get(
                        # "kind") the same way however it was reached.
                        owners.append({"kind": "watchlist", **person})

                self._owners = owners
                self._matrix = (
                    np.stack(rows).astype(np.float32) if rows else np.empty((0, 512), np.float32)
                )

            if self._matrix.shape[0] == 0:
                return None, []

            return self._matrix, list(self._owners)


people_store = PeopleStore()
