"""
Face recognition against a registered watchlist.

Unlike the other modules, this one is taught on the spot: an operator
registers a person with their name, one to five photos, and a note on why
they are watched for. Registration is the training — each photo is reduced
to a 512-value signature of the face (InsightFace, the same approach as the
reference attendance project this was adapted from), and recognition is a
comparison of every face the camera sees against those signatures.

Two properties matter and are kept deliberately:

  - The AI can only name people who were explicitly registered. Everyone
    else is "unknown" — detected as a face, matched against the list,
    and left alone. This is a watchlist, not surveillance of everyone.
  - A match must be strong. Signatures of the same person across photos
    score ~0.9 while different people score ~0.05, so the threshold of
    0.5 sits in open water: a stranger does not become a match by looking
    vaguely similar.
"""

import threading
import time
from collections import Counter
from typing import Any, Optional

import cv2
import numpy as np

from app.core.config import BASE_DIR
from app.vision.cadence import Cadence
from app.vision.legibility import read
from app.modules.base import BaseMonitoringService
from app.modules.face.store import MAX_PHOTOS, MIN_PHOTOS, people_store

#: Where the face model pack lives. The two weight files (a face finder and
#: a signature maker) total ~190 MB, which is over what the repository can
#: carry — missing files are fetched once by the library on first use.
INSIGHTFACE_ROOT = BASE_DIR / "data" / "insightface"

#: The InsightFace model pack: SCRFD face detection + ArcFace signatures.
MODEL_PACK = "buffalo_l"

#: Detection resolution. The pack's standard size; faces the camera can
#: resolve at all are found reliably here.
DET_SIZE = (640, 640)

#: Cosine similarity a face must reach against a person's best signature to
#: be called that person. Measured on this model: the same person across
#: different photos scores 0.9+, different people ~0.05. From the reference
#: project's settings.
MATCH_THRESHOLD = 0.5

#: How long a face's identity is decided over, in seconds. A borderline
#: angle can drop one frame below the threshold; nobody becomes a different
#: person for a frame. Majority of the window wins, ties keep the previous
#: answer — the same steadying the gear modules use.
#:
#: The floor rather than the whole rule. A window in seconds only holds
#: several frames while several frames keep arriving: at 2fps it holds four,
#: at 1fps two, and at 0.5fps exactly one — which is not steadying at all, it
#: is the frame-by-frame identity this constant exists to replace. Driven with
#: a registered face whose score dips below MATCH_THRESHOLD on one frame in
#: three, this module loses the identity on three frames in ten at 0.5fps and
#: on none at all from 1fps up: the same person, the same camera, recognised
#: worse because the link is slower. The browser aims at 10fps and calls 5 its
#: floor, and over a tunnel to a hosted GPU that aim is a ceiling rather than a
#: promise — and here what a dropped identity costs is the alert about
#: somebody on the register, which is the whole point of the module.
#:
#: So what counts as recent follows the measured cadence — never narrower than
#: this, wider only when answers arrive more slowly than it assumed. The
#: threshold a face has to clear to be called somebody is untouched: this
#: decides how long a look lasts, not how sure it has to be. See
#: app.vision.cadence.
STEADY_WINDOW_SECONDS = 1.5

#: How many observations the window above was sized to hold.
#:
#: Not a bar this module applies — an identity needs no minimum number of
#: sightings, and this does not give it one. It is what the cadence needs to
#: know to keep the window able to hold a majority worth the name: the three
#: sightings the gear modules ask for over the same 1.5 seconds, which is the
#: count these windows were all sized around.
STEADY_WINDOW_VOTES = 3

#: Overlap needed to consider a face the same face as last frame.
STEADY_MATCH_IOU = 0.3

#: How long an unseen face's history is kept before it is forgotten.
STEADY_FORGET_SECONDS = 2.0

# Annotation colours, BGR. A recognised person is the alarm here, so they
# draw red; an unknown face is nobody the list cares about, and draws green.
COLOR_MATCH = (0, 0, 220)
COLOR_UNKNOWN = (0, 170, 0)


def _iou(a, b) -> float:
    """Overlap over union of two (x1, y1, x2, y2) boxes."""
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b

    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)

    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0

    inter = (ix2 - ix1) * (iy2 - iy1)
    union = (ax2 - ax1) * (ay2 - ay1) + (bx2 - bx1) * (by2 - by1) - inter

    return inter / union if union > 0 else 0.0


def _signature(face) -> Optional[np.ndarray]:
    """A face's signature, unit length so comparison is a dot product."""
    embedding = getattr(face, "embedding", None)

    if embedding is None:
        return None

    norm = np.linalg.norm(embedding)

    if norm == 0:
        return None

    return (embedding / norm).astype(np.float32)


class FaceService(BaseMonitoringService):
    """Watches for the people on the operator's register."""

    module_id = "face"
    name = "Face Recognition"
    description = (
        "The AI recognises registered people the moment they appear on camera."
    )

    def __init__(self) -> None:
        self._app = None
        self._load_failed = False
        self._load_error: Optional[str] = None
        self._load_lock = threading.Lock()

        # Per-face observation history for steady identities; see _steady().
        # Session copies get their own in reset_session_state.
        self._memory: list[dict[str, Any]] = []

        # How fast frames are actually arriving, and so how long a vote stays
        # recent. One per session, like the history it prunes: frames arrive
        # at one rate for the whole module, not one rate per face.
        self._cadence = Cadence(STEADY_WINDOW_SECONDS, STEADY_WINDOW_VOTES)

        super().__init__()

        # The pack is fetched on first use when its files are missing, which
        # on a fresh deployment is a large download. Started now, in the
        # background, so it has usually finished before anyone needs it —
        # rather than landing on the first registration or frame.
        threading.Thread(target=self._get_app, daemon=True).start()

    def reset_session_state(self) -> None:
        self._memory = []

        # A new instance rather than a reset: for_session() copies shallowly,
        # so until this is replaced the copy is measuring the origin's frames
        # as well as its own.
        self._cadence = Cadence(STEADY_WINDOW_SECONDS, STEADY_WINDOW_VOTES)

    def reset(self) -> None:
        super().reset()
        self._memory = []

        # A new camera is a new measurement — the old one's frame rate says
        # nothing about this one's.
        self._cadence.reset()

    # ------------------------------------------------------------------
    # Model
    # ------------------------------------------------------------------

    def _get_app(self):
        """
        Load the face model on first use.

        Downloads the pack if it is not on disk, so first use on a fresh
        machine takes as long as the download does. Failure marks the module
        unavailable instead of failing every frame.
        """
        if self._app is not None or self._load_failed:
            return self._app

        with self._load_lock:
            if self._app is not None or self._load_failed:
                return self._app

            try:
                from insightface.app import FaceAnalysis

                app = FaceAnalysis(
                    name=MODEL_PACK,
                    root=str(INSIGHTFACE_ROOT),
                    # GPU when the deployment has one, CPU otherwise. These
                    # models are ONNX rather than torch, so they do not
                    # follow the GPU the detection models already use — left
                    # on CPU they cost about 400ms a frame, which is the
                    # whole frame budget on a machine that has a GPU sitting
                    # idle. An unavailable provider is skipped rather than
                    # fatal, so this list is safe everywhere.
                    providers=[
                        "CUDAExecutionProvider",
                        "CPUExecutionProvider",
                    ],
                    # Only the face finder and the signature maker; the
                    # pack's landmark and age/gender models are not used.
                    allowed_modules=["detection", "recognition"],
                )

                # ctx_id picks the device for the pack's own preprocessing:
                # 0 is the first GPU, -1 is CPU. Matched to what the session
                # actually got, so the two cannot disagree.
                on_gpu = "CUDAExecutionProvider" in (
                    app.models.get("detection").session.get_providers()
                    if app.models.get("detection")
                    else []
                )

                app.prepare(ctx_id=0 if on_gpu else -1, det_size=DET_SIZE)

                print(
                    "[Face] Running on "
                    + ("the GPU." if on_gpu else "the CPU.")
                )

                self._app = app
                self._load_error = None
                print("[Face] Recognition model loaded.")
            except ModuleNotFoundError as exc:
                # The most likely deployment fault, so name the cure, not
                # just the symptom: an old install cell that predates this
                # module leaves these packages missing.
                self._load_failed = True
                self._load_error = (
                    f"The server is missing the '{exc.name}' package — "
                    "run: pip install insightface onnxruntime, "
                    "then restart the backend."
                )
                print(f"[Face] {self._load_error}")
            except Exception as exc:  # noqa: BLE001
                self._load_failed = True
                self._load_error = (
                    f"The face model could not be loaded: {exc}. "
                    "If this was a download failure, restart the backend "
                    "to try again."
                )
                print(f"[Face] {self._load_error}")

        return self._app

    def _retry_load(self):
        """
        One fresh load attempt, clearing a previous failure.

        Used on explicit operator actions (registration), so installing the
        missing package can be picked up without hunting for a restart —
        while failed *frames* keep the latch and stay cheap.
        """
        if self._app is None:
            self._load_failed = False

        return self._get_app()

    def is_ready(self) -> bool:
        # Optimistic while the model is still warming up in the background:
        # "not ready" is reserved for a load that actually failed.
        return not self._load_failed

    def get_status(self) -> dict[str, Any]:
        status = super().get_status()
        status["people_registered"] = people_store.count()

        # The reason the module is not ready, when known — so the screen can
        # say what to fix instead of only that something is wrong.
        if self._load_error:
            status["problem"] = self._load_error

        return status

    # ------------------------------------------------------------------
    # Registration — the training step
    # ------------------------------------------------------------------

    def signature_from_photo(self, photo: np.ndarray) -> Optional[np.ndarray]:
        """
        The face signature from one registration photo.

        The largest face in the photo is taken as the subject — a
        registration photo is of one person, and anyone smaller in the
        background must not be taught as them. None when no face is found.
        """
        app = self._get_app()

        if app is None:
            raise RuntimeError("The face recognition AI is not available.")

        faces = app.get(photo)

        if not faces:
            return None

        subject = max(
            faces,
            key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]),
        )

        return _signature(subject)

    def install_routes(self, router) -> None:
        """
        Registration endpoints, mounted beside the standard module API.

        The standard surface covers watching; registering a person is a
        multipart upload (name, note, photos) that has no place in a JSON
        config call, so this module adds its own endpoints:

            GET    /api/face/people        the register
            POST   /api/face/people        register a person
            DELETE /api/face/people/{id}   remove a person
        """
        from fastapi import File, Form, HTTPException, UploadFile

        # Mirrors the frame limits in the shared router: registration photos
        # are pictures from the same cameras and phones.
        max_bytes = 8 * 1024 * 1024
        max_pixels = 16_000_000

        @router.get("/people")
        def list_people() -> dict[str, Any]:
            """Everyone the AI has been taught to recognise."""
            return {
                "success": True,
                "data": {
                    "people": people_store.people(),
                    "count": people_store.count(),
                },
            }

        @router.post("/people")
        async def register_person(
            name: str = Form(...),
            crime: str = Form(""),
            photos: list[UploadFile] = File(...),
        ) -> dict[str, Any]:
            """
            Teach the AI a person from their photos.

            Between one and five photos. Each photo must show the person's
            face; a photo where no face can be found is skipped and reported,
            and registration succeeds if at least one photo was usable.
            """
            if not name.strip():
                raise HTTPException(
                    status_code=400, detail="A name is required."
                )

            if not MIN_PHOTOS <= len(photos) <= MAX_PHOTOS:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Between {MIN_PHOTOS} and {MAX_PHOTOS} photos are "
                        f"required; {len(photos)} were sent."
                    ),
                )

            if self._retry_load() is None:
                raise HTTPException(
                    status_code=503,
                    detail=(
                        self._load_error
                        or "The face recognition AI is not available."
                    ),
                )

            usable_photos: list[bytes] = []
            signatures: list[np.ndarray] = []
            skipped: list[dict[str, Any]] = []

            for index, upload in enumerate(photos, start=1):
                data = await upload.read()

                if len(data) > max_bytes:
                    skipped.append(
                        {"photo": index, "reason": "The photo is too large."}
                    )
                    continue

                # Checked before decoding, not after. cv2.imdecode asserts on an
                # empty buffer rather than returning None, so an empty file in a
                # registration batch took down the whole upload with a raw 500
                # instead of skipping one photo and registering the rest.
                if not data:
                    skipped.append(
                        {"photo": index, "reason": "The photo is empty."}
                    )
                    continue

                frame = cv2.imdecode(
                    np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR
                )

                if frame is None:
                    skipped.append(
                        {
                            "photo": index,
                            "reason": "Could not read the photo. Use JPEG or PNG.",
                        }
                    )
                    continue

                if frame.shape[0] * frame.shape[1] > max_pixels:
                    skipped.append(
                        {"photo": index, "reason": "The photo is too large."}
                    )
                    continue

                signature = self.signature_from_photo(frame)

                if signature is None:
                    skipped.append(
                        {
                            "photo": index,
                            "reason": "No face could be seen in this photo.",
                        }
                    )
                    continue

                usable_photos.append(data)
                signatures.append(signature)

            if not signatures:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "No face could be seen in the photos. Use clear, "
                        "well-lit photos of the person's face."
                    ),
                )

            person = people_store.add(
                name=name, crime=crime, photos=usable_photos,
                signatures=signatures,
            )

            return {
                "success": True,
                "data": {
                    "person": person,
                    "photos_used": len(signatures),
                    "photos_skipped": skipped,
                },
            }

        @router.delete("/people/{person_id}")
        def remove_person(person_id: str) -> dict[str, Any]:
            """Remove a person; the AI stops recognising them immediately."""
            if not people_store.remove(person_id):
                raise HTTPException(
                    status_code=404, detail="That person is not registered."
                )

            return {"success": True, "data": {"removed": person_id}}

    # ------------------------------------------------------------------
    # Analysis
    # ------------------------------------------------------------------

    def process(self, frame: np.ndarray) -> tuple[np.ndarray, dict[str, Any]]:
        app = self._get_app()

        if app is None:
            return frame, self._store(self.empty_result())

        reading = read(frame, self.module_id)

        faces = app.get(frame)

        matrix, owners = people_store.signatures()

        assessments: list[dict[str, Any]] = []

        for face in faces:
            x1, y1, x2, y2 = (float(v) for v in face.bbox)
            signature = _signature(face)

            person = None
            score = 0.0

            if signature is not None and matrix is not None:
                similarities = matrix @ signature
                best = int(np.argmax(similarities))
                score = float(similarities[best])

                if score >= MATCH_THRESHOLD:
                    person = owners[best]

            assessments.append(
                {
                    "box": (x1, y1, x2, y2),
                    "confidence": float(face.det_score),
                    "person": person,
                    "score": score,
                }
            )

        # Once per processed frame, before anything votes: how long a vote is
        # kept is decided by how often they are actually arriving.
        now = time.time()
        self._cadence.tick(now)

        assessments = self._steady(assessments, now)

        height, width = frame.shape[:2]

        annotated = self._annotate(frame, assessments)

        result = self._summarise(assessments, reading)
        result["regions"] = self._regions(assessments, width, height)

        return annotated, self._store(result)

    def _steady(
        self, assessments: list[dict[str, Any]], now: float
    ) -> list[dict[str, Any]]:
        """
        Replace each face's per-frame identity with the settled one.

        Faces are matched to their own recent history by overlap; the
        reported identity is the majority of the window, and a tie keeps
        the previous answer. People from the register are looked up by id,
        so a settled identity survives a frame where the score dips.

        How long a vote survives is the one thing here that is not fixed: it
        is STEADY_WINDOW_SECONDS while frames arrive as fast as that assumed,
        and as wide as the measured cadence needs when they do not — so that
        "the majority of the window" is still a majority of several sightings
        on a link that only delivers one a second.
        """
        by_id = {p["id"]: p for p in people_store.people()}

        # What counts as recent, on this frame. Read once so every face in
        # the frame is judged over the same moment.
        window = self._cadence.window

        for a in assessments:
            best, best_iou = None, STEADY_MATCH_IOU

            for entry in self._memory:
                overlap = _iou(a["box"], entry["box"])
                if overlap >= best_iou:
                    best, best_iou = entry, overlap

            identity = a["person"]["id"] if a["person"] else None

            if best is None:
                best = {"box": a["box"], "votes": [], "identity": identity,
                        "score": a["score"]}
                self._memory.append(best)

            best["box"] = a["box"]
            best["last_seen"] = now
            best["votes"].append((now, identity, a["score"]))
            best["votes"] = [v for v in best["votes"] if now - v[0] <= window]

            counts = Counter(v[1] for v in best["votes"])
            ranked = counts.most_common(2)

            # A clear majority changes the settled identity; a tie keeps it.
            if len(ranked) == 1 or ranked[0][1] > ranked[1][1]:
                best["identity"] = ranked[0][0]

            scores = [v[2] for v in best["votes"] if v[1] == best["identity"]]
            best["score"] = max(scores) if scores else a["score"]

            settled = best["identity"]
            a["person"] = by_id.get(settled) if settled else None
            a["score"] = best["score"]

        self._memory = [
            e
            for e in self._memory
            if now - e.get("last_seen", now) <= STEADY_FORGET_SECONDS
        ]

        return assessments

    # ------------------------------------------------------------------
    # Reporting
    # ------------------------------------------------------------------

    def _summarise(
        self,
        assessments: list[dict[str, Any]],
        reading: Any = None,
    ) -> dict[str, Any]:
        recognized = [
            {
                "id": a["person"]["id"],
                "name": a["person"]["name"],
                "crime": a["person"]["crime"],
                # What recognising them means. Entries stored before the
                # field existed read as "watchlist", which is what they were.
                "kind": a["person"].get("kind", "watchlist"),
                "confidence": round(a["score"] * 100),
            }
            for a in assessments
            if a["person"]
        ]

        # Only the watchlist raises the alarm. A registered worker being
        # recognised is the system working — being known is the opposite of
        # being wanted — so their sighting is reported, never alarmed.
        watchlist = [r for r in recognized if r["kind"] != "worker"]

        unknown = len(assessments) - len(recognized)

        names = sorted({r["name"] for r in recognized})

        if recognized:
            summary = f"Recognized: {', '.join(names)}"
        elif assessments:
            summary = (
                "1 face in view, nobody recognized"
                if len(assessments) == 1
                else f"{len(assessments)} faces in view, nobody recognized"
            )
        else:
            summary = "Nobody in view"

        # A picture too dark, blurred or broken to read cannot clear anybody.
        # This module reported "nobody recognized" at sixteen quality levels
        # it could see nothing through — the same words it uses for a room it
        # has genuinely checked and found no one it knows in.
        unreadable = reading is not None and not reading.readable

        return {
            "alert": bool(watchlist) and not unreadable,
            "status": (
                "alert" if watchlist and not unreadable
                else "unverified" if unreadable
                else "clear" if assessments
                else "idle"
            ),
            "summary": reading.reason if unreadable else summary,
            # Faces seen in a picture too poor to judge are unverified: not
            # recognised, and not cleared of being somebody on the register.
            **self.uncertainty(reading, len(assessments) if unreadable else 0),
            "detections": [
                {
                    "recognized": bool(a["person"]),
                    "name": a["person"]["name"] if a["person"] else None,
                }
                for a in assessments
            ],
            "faces_total": len(assessments),
            "recognized": recognized,
            "recognized_count": len(recognized),
            "unknown_count": unknown,
            "people_registered": people_store.count(),
        }

    def _regions(self, assessments, width, height) -> list[dict[str, Any]]:
        """The same boxes the annotation draws, for the browser to draw itself."""
        regions = []

        for a in assessments:
            if a["person"] and a["person"].get("kind", "watchlist") == "worker":
                # A recognised worker is the system working, not a threat:
                # green, named, unmistakably different from the watchlist's
                # red and from a stranger's anonymous box.
                tone = "ok"
                label = a["person"]["name"]
            elif a["person"]:
                tone = "danger"
                label = a["person"]["name"]
            else:
                tone = "ok"
                label = "Unknown"

            regions.append(
                self.region(a["box"], width, height, label=label, tone=tone)
            )

        return regions

    def events(self, result: dict[str, Any]) -> list[dict[str, Any]]:
        """One event per registered person currently on camera."""
        events = []

        for match in result.get("recognized", []):
            # A worker's sighting is not an incident. A plant with fifty
            # registered workers must not log fifty sightings a minute, and
            # a history of high-severity rows that mean "an employee came
            # to work" would bury the one that means an intruder did.
            if match.get("kind") == "worker":
                continue

            details = {
                "name": match["name"],
                "confidence": match["confidence"],
            }

            if match["crime"]:
                details["note"] = match["crime"]

            events.append(
                {
                    # Keyed on who, not where or when: the same person on
                    # camera is one continuing sighting.
                    "key": f"recognized-{match['id']}",
                    "severity": "high",
                    "summary": f"{match['name']} recognized on camera",
                    "details": details,
                }
            )

        return events

    def empty_result(self) -> dict[str, Any]:
        result = super().empty_result()
        result.update(
            {
                "summary": "Nobody in view",
                "faces_total": 0,
                "recognized": [],
                "recognized_count": 0,
                "unknown_count": 0,
                "people_registered": people_store.count(),
            }
        )
        return result

    # ------------------------------------------------------------------
    # Annotation
    # ------------------------------------------------------------------

    def _annotate(
        self, frame: np.ndarray, assessments: list[dict[str, Any]]
    ) -> np.ndarray:
        """One box per face: the person's name when matched, Unknown when not."""
        annotated = frame.copy()

        for a in assessments:
            x1, y1, x2, y2 = (int(v) for v in a["box"])

            if a["person"] and a["person"].get("kind", "watchlist") == "worker":
                color = COLOR_UNKNOWN
                label = f"{a['person']['name']} ({round(a['score'] * 100)}%)"
            elif a["person"]:
                color = COLOR_MATCH
                label = f"{a['person']['name']} ({round(a['score'] * 100)}%)"
            else:
                color = COLOR_UNKNOWN
                label = "Unknown"

            cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
            cv2.putText(
                annotated,
                label,
                (x1, max(y1 - 8, 14)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.55,
                color,
                2,
                cv2.LINE_AA,
            )

        return annotated


service = FaceService()
