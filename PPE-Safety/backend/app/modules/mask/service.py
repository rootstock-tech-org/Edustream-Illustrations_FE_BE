"""
Face mask monitoring.

The trained model detects `person` and `mask`. Like the safety-gear model it
has no "no-mask" class, so non-compliance cannot be read from a detection —
it is inferred by working out which mask belongs to which person. A mask must
sit where a face is: the upper part of a person's box. A mask detected on a
table belongs to nobody and proves nothing about anyone.

Which person, though, was the second thing this module got wrong. Anybody's
box could claim any mask inside it, and people were dealt with largest box
first, so a near person standing behind a masked one took their mask and was
reported compliant while its actual wearer was accused. The rule that decides
it now lives in `app/vision/anatomy`, is shared with safety gear, and is
applied to the face evidence below as well as to the mask itself — the two
have to move together or half the defect stays.

Structurally this is the safety-gear module with one item instead of two, and
it deliberately keeps that module's judgement rules: someone whose head is out
of shot, or who is too far for the model to resolve a mask on, is reported as
unknown rather than as a violation. "I cannot see" and "they are not wearing
one" are different findings, and only one of them should sound an alarm.

That paragraph was a claim about this code, and for the very case it uses as
its example it was false. The only thing standing between a person and an
accusation was a box-height floor, which says nothing about whether a face is
in shot: a person walking away with their back fully turned was reported as
"No mask", and so was a person whose head and shoulders had been erased from
the picture entirely. A head has to be seen now — see FACE_MODEL_PACK —
before a missing mask is anybody's fault.

And the picture as a whole has to be worth judging: see app/vision/legibility.
Dim the room far enough and the people simply stopped being detected, which
this module reported as "Nobody in view" — the same words, and the same
colour on screen, as an empty and therefore safe room.
"""

import threading
import time
from typing import Any, Optional

import cv2
import numpy as np

from app.core.config import BASE_DIR, MODELS_DIR
from app.core.validate import in_range
from app.modules.base import BaseMonitoringService
from app.vision.anatomy import claim
from app.vision.cadence import Cadence
from app.vision.legibility import read

#: Trained weights. Absent means the module reports itself as not ready
#: instead of failing on the first frame.
MODEL_PATH = MODELS_DIR / "mask.pt"

#: Detection confidence. Below this a detection is treated as noise.
CONF_THRESHOLD = 0.35

#: Where a mask has to sit to be somebody's — the face band — is not a
#: constant here any more. It is `anatomy.head_band`, measured against real
#: faces found in real person boxes, and shared with safety gear so that two
#: modules asking the same question of the same picture cannot answer it
#: differently. The number it settled on is the one this module already used.

#: How long a person's verdict is decided over, in seconds. Same steadying
#: as safety gear: judged frame by frame the verdict flickers with every
#: borderline detection, and nobody takes a mask on and off nine times a
#: second. Majority of the last moment's observations wins; a tie keeps
#: the previous answer.
#:
#: The floor rather than the whole rule. A window in seconds is only a window
#: while frames keep arriving: at 2fps it holds four observations, at 1fps
#: two, and at 0.5fps exactly one — which is not steadying at all, it is the
#: frame-by-frame verdict this constant exists to replace. Driven with a mask
#: the detector loses on one frame in three, this module reports a bare face
#: on three frames in ten at 0.5fps and on none at all from 1fps up: the same
#: worker, the same detections, judged worse because the link is slower. The
#: browser aims at 10fps and calls 5 its floor, and over a tunnel to a hosted
#: GPU that aim is a ceiling rather than a promise.
#:
#: So what counts as recent follows the measured cadence — never narrower than
#: this, wider only when answers arrive more slowly than it assumed. Nothing
#: about the majority changes; the evidence is counted over a moment that is
#: still a moment on a slow link. See app.vision.cadence.
STEADY_WINDOW_SECONDS = 1.5

#: How many observations the window above was sized to hold.
#:
#: Not a bar this module applies — it has none, and this does not add one. It
#: is what the cadence needs to know to keep the window able to hold a
#: majority worth the name: the three sightings gloves and safety gear ask for
#: over the same 1.5 seconds, which is the count these windows were all sized
#: around.
STEADY_WINDOW_VOTES = 3

#: Overlap needed to consider a detection the same person as last frame.
STEADY_MATCH_IOU = 0.3

#: How long an unseen person's history is kept before it is forgotten.
STEADY_FORGET_SECONDS = 2.0

#: Smallest person, as a fraction of frame height, whose face can be judged.
#: A mask is a small object: below this the model cannot resolve one, and
#: "nothing detected" would mean "too small to see", not "not wearing it".
DEFAULT_MIN_PERSON_HEIGHT = 0.20

#: The face finder that decides whether there is a head to accuse.
#:
#: This module's own weights know two things, `mask` and `person`, so to them
#: a worker facing away is identical to a worker facing us with nothing on
#: their face. Some second signal has to say which, and what it should be was
#: settled by measurement rather than preference — on the two frames where the
#: answer is known, plus the two the debug report used:
#:
#:     signal                    2 faces to camera   head erased   back turned
#:     haar frontal (default)    0 of 2 found        none          none
#:     haar frontal (alt2)       0 of 2 found        none          none
#:     haar profile              1 of 2 found        none          none
#:     SCRFD (this)              2 of 2, .71 / .72   none          none
#:
#: The cascades are useless in the direction that matters: they miss real
#: faces at this scale and lighting, which would turn genuine violators into
#: "unchecked", and they cost 162ms per person to do it. SCRFD found both real
#: faces and nothing at all on any of the three pictures with no face in them.
#: It runs once per frame rather than once per person, and costs about a sixth
#: of this module's own inference on the same machine — 90ms against 556ms
#: measured alone, 270ms against 1753ms with both models resident.
#:
#: Structure that can be hallucinated was ruled out before this. A pose model
#: was tried in the workstation module on the same idea and reported a nose,
#: both eyes, an ear and a shoulder on a blank patch of skin; a keypoint is
#: cheap for a model to invent, a whole face is not.
FACE_MODEL_PACK = "buffalo_l"

#: Where the face model pack lives — the same directory the face recognition
#: module fetches it into, so a machine that has one has the other.
INSIGHTFACE_ROOT = BASE_DIR / "data" / "insightface"

#: Detection resolution for the face finder. Faces the camera can resolve at
#: all are found here; at 320 the two nearest were still found and a face 43
#: pixels tall was not, so the extra 66ms buys the far end of the room.
FACE_DET_SIZE = (640, 640)

#: Confidence a face needs to count as a head being present. The pack's own
#: default, and left there because nothing measured argues for moving it:
#: genuine faces scored 0.51-0.82, and every picture with no face in it
#: produced no detection at all, at any score.
#:
#: It is not infallible, and the tuning does not exist to make it so. On
#: doorcam frame 224 it reported a face at 0.52 on an office chair's headrest,
#: while a real face in profile on frame 213 scored 0.51 — there is no bar
#: that keeps one and drops the other at these sizes. What protects the person
#: is not the threshold but the claim rule: a face only counts for somebody
#: when it falls inside *their* face band, so a phantom in the furniture
#: accuses nobody.
FACE_CONFIDENCE = 0.5

#: Why somebody's face could not be judged. Plain words, because they are
#: drawn on the picture over the person they are about.
REASON_TOO_FAR = "Too far to check"
REASON_NO_FACE = "Face not visible"
REASON_NO_FINDER = "Face checking is not available"

# Annotation colours, BGR.
COLOR_OK = (0, 170, 0)
COLOR_VIOLATION = (0, 0, 220)
COLOR_UNKNOWN = (140, 140, 140)


# The face finder is loaded once for the process, not once per session copy:
# it holds no per-session state, and for_session() shallow-copies this module
# several times over when several browsers watch at once.
_face_finder = None
_face_finder_failed = False
_face_finder_lock = threading.Lock()


def face_finder():
    """
    The face finder, loaded on first use, or None if it cannot be had.

    Deliberately not the face recognition module's own instance. That one
    carries the signature model as well — 190MB and about 400ms a frame on a
    CPU — to answer *who* somebody is, where all that is wanted here is
    whether there is a face at all. Borrowing it would also make mask
    checking depend on a capability an operator may never have opened.
    """
    global _face_finder, _face_finder_failed

    if _face_finder is not None or _face_finder_failed:
        return _face_finder

    with _face_finder_lock:
        if _face_finder is not None or _face_finder_failed:
            return _face_finder

        try:
            from insightface.app import FaceAnalysis

            finder = FaceAnalysis(
                name=FACE_MODEL_PACK,
                root=str(INSIGHTFACE_ROOT),
                # An unavailable provider is skipped rather than fatal, so
                # this list is safe on a machine with no GPU.
                providers=["CUDAExecutionProvider", "CPUExecutionProvider"],
                # Finding faces only. The signature model is what makes this
                # pack expensive and it answers a question nobody asked here.
                allowed_modules=["detection"],
            )

            on_gpu = "CUDAExecutionProvider" in (
                finder.models["detection"].session.get_providers()
                if finder.models.get("detection")
                else []
            )

            finder.prepare(
                ctx_id=0 if on_gpu else -1,
                det_thresh=FACE_CONFIDENCE,
                det_size=FACE_DET_SIZE,
            )

            _face_finder = finder
            print("[Mask] Face finder loaded; heads will be checked before accusing.")
        except Exception as exc:  # noqa: BLE001
            _face_finder_failed = True
            print(
                f"[Mask] No face finder ({exc}); nobody's mask can be judged. "
                "Run: pip install insightface onnxruntime, then restart."
            )

    return _face_finder



def _iou(a, b) -> float:
    """Overlap over union of two (x1, y1, x2, y2) boxes."""
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b

    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)

    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0

    inter = (ix2 - ix1) * (iy2 - iy1)
    union = (
        (ax2 - ax1) * (ay2 - ay1) + (bx2 - bx1) * (by2 - by1) - inter
    )

    return inter / union if union > 0 else 0.0


class MaskService(BaseMonitoringService):
    """Checks that each person visible is wearing a face mask."""

    module_id = "mask"
    name = "Face Masks"
    description = "The AI checks that face masks are being worn."

    def __init__(self) -> None:
        # Set before super().__init__(), which builds the initial result and
        # therefore reads this state.
        self._model = None
        self._load_failed = False
        self._min_person_height = DEFAULT_MIN_PERSON_HEIGHT

        # Per-person observation history for the steady verdicts; see
        # _steady(). Session copies get their own in reset_session_state.
        self._memory: list[dict[str, Any]] = []

        # How fast frames are actually arriving, and so how long a vote stays
        # recent. One per session, like the history it prunes: frames arrive
        # at one rate for the whole module, not one rate per person.
        self._cadence = Cadence(STEADY_WINDOW_SECONDS, STEADY_WINDOW_VOTES)

        super().__init__()

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

    def _get_model(self):
        """
        Load the weights on first use.

        Deferred so the backend starts, and every other module keeps working,
        when these weights are not installed.
        """
        if self._model is not None or self._load_failed:
            return self._model

        if not MODEL_PATH.exists():
            self._load_failed = True
            print(f"[Mask] No model at {MODEL_PATH}; module disabled.")
            return None

        try:
            from ultralytics import YOLO

            self._model = YOLO(str(MODEL_PATH))
            print(f"[Mask] Model loaded: {self._model.names}")
        except Exception as exc:  # noqa: BLE001
            self._load_failed = True
            print(f"[Mask] Could not load model: {exc}")

        return self._model

    def is_ready(self) -> bool:
        return self._get_model() is not None

    # ------------------------------------------------------------------
    # Analysis
    # ------------------------------------------------------------------

    def process(self, frame: np.ndarray) -> tuple[np.ndarray, dict[str, Any]]:
        model = self._get_model()

        if model is None:
            return frame, self._store(self.empty_result())

        # Asked of the whole picture before anything is asked of the people
        # in it. Below this the detector starts losing people outright, and a
        # person who was never detected carries their violation away with
        # them — which used to read on screen as an empty, and therefore
        # safe, room.
        reading = read(frame, self.module_id)

        results = model(frame, verbose=False, conf=CONF_THRESHOLD)

        people: list[dict[str, Any]] = []
        masks: list[dict[str, Any]] = []

        names = model.names

        for result in results:
            for box in result.boxes:
                label = names[int(box.cls[0])]
                x1, y1, x2, y2 = (float(v) for v in box.xyxy[0])
                item = {
                    "box": (x1, y1, x2, y2),
                    "conf": float(box.conf[0]),
                }

                if label == "person":
                    people.append(item)
                elif label == "mask":
                    masks.append(item)

        height, width = frame.shape[:2]

        # Skipped when the picture cannot be judged anyway: nobody is going to
        # be accused off this frame, so there is nothing for the face finder
        # to protect and no reason to spend the time.
        faces = self._faces(frame) if reading.readable else None

        assessments = self._assess(people, masks, faces, width, height, reading)

        # Once per processed frame, before anything votes: how long a vote is
        # kept is decided by how often they are actually arriving.
        now = time.time()
        self._cadence.tick(now)

        assessments = self._steady(assessments, now)

        annotated = self._annotate(frame, assessments)

        result = self._summarise(assessments, reading)
        result["regions"] = self._regions(assessments, width, height)

        return annotated, self._store(result)

    def _faces(self, frame: np.ndarray) -> Optional[list[dict[str, Any]]]:
        """
        Every face in the frame, or None when there is no face finder.

        None and an empty list mean different things and are kept apart: no
        faces found is evidence that nobody is facing the camera, while no
        finder is the absence of evidence, and the second must not be read as
        the first.
        """
        finder = face_finder()

        if finder is None:
            return None

        return [
            {
                "box": tuple(float(v) for v in face.bbox),
                "conf": float(face.det_score),
            }
            for face in finder.get(frame)
        ]

    def _regions(self, assessments, width, height) -> list[dict[str, Any]]:
        """The same boxes the annotation draws, for the browser to draw itself."""
        regions = []

        for a in assessments:
            if not self._checkable(a):
                tone = "muted"
                # Why, rather than one phrase covering four different reasons
                # — "Too far to check" was drawn over a back-turned person
                # standing a metre from the camera.
                label = self._why_not_checked(a).rstrip(".")
            elif self._is_violation(a):
                tone = "danger"
                label = "No mask"
            else:
                tone = "ok"
                label = "Mask"

            regions.append(
                self.region(a["box"], width, height, label=label, tone=tone)
            )

        return regions

    # ------------------------------------------------------------------
    # Association
    # ------------------------------------------------------------------

    def _assess(
        self,
        people: list[dict[str, Any]],
        masks: list[dict[str, Any]],
        faces: Optional[list[dict[str, Any]]],
        width: int,
        height: int,
        reading,
    ) -> list[dict[str, Any]]:
        """
        Decide, per person, whether they are wearing a mask.

        A mask goes to exactly one person and a person holds at most one, so
        a single mask cannot make two workers compliant and a near person
        whose box contains somebody else's cannot take theirs. Faces are
        matched by the same rule and for the same reason — one face is one
        head, and it belongs to one of the people in the picture.

        The leftovers are deliberately dropped here, where safety gear treats
        its own as evidence of a worker the detector merged away. Neither
        leftover means that in this module. A mask on a table is the case the
        module was built to ignore, and an unheld *face* is the one thing the
        claim rule exists to contain: this finder scored 0.52 on an office
        chair's headrest, and it accuses nobody only because a face has to
        fall inside somebody's own band to count. Reporting it as a possible
        person would hand that phantom back the vote it was taken away from.
        """
        mask_of, _ = claim(people, masks)
        face_of, _ = claim(people, faces) if faces is not None else ({}, [])

        # Turned round: what each person has, rather than who has each item.
        wears_mask = {person: item for item, person in mask_of.items()}
        shows_face = set(face_of.values())

        assessments = []

        for index, person in enumerate(people):
            _, y1, _, y2 = person["box"]
            box_height = max(y2 - y1, 1.0)

            mask_index = wears_mask.get(index)

            # A mask sitting on this person's face is itself proof that the
            # face is there, and a good mask hides most of what the face
            # finder looks for. Without this, wearing one properly would be
            # the surest way to be reported as unverified.
            head = index in shows_face or mask_index is not None

            # Everyone detected and near enough is judged, wherever the
            # frame cuts them — the edge rules that refused webcam portraits
            # and closeups as "partly visible" were removed at the
            # operator's request. What replaced them is narrower and about
            # the face rather than the crop: a person whose head is out of
            # shot, or turned away, has no face here to have a mask on.
            too_far = box_height < height * self._min_person_height

            assessments.append(
                {
                    "box": person["box"],
                    "confidence": person["conf"],
                    "mask": mask_index is not None,
                    "too_far": too_far,
                    "head": head,
                    # Whether anything was in a position to answer that.
                    "head_known": faces is not None,
                    "unreadable": None if reading.readable else reading.reason,
                }
            )

        return assessments

    def _steady(
        self, assessments: list[dict[str, Any]], now: float
    ) -> list[dict[str, Any]]:
        """
        Replace each person's per-frame verdict with the settled one.

        Matched to their own recent history by overlap; the reported answer
        is the majority of the window, and a tie keeps the previous answer.

        Whether their head was in shot is steadied over the same window and
        the same way, with one difference: a tie is read as *not* seen. One
        borderline frame should not start an accusation, and somebody turning
        away from the camera stops being judged as they turn rather than a
        window later.

        One history, one person, within a frame. Two people can overlap
        enough to look like one across time — the reported nested pair score
        0.346 against a 0.3 bar — and sharing a history hands the nearer
        person's verdict to the further one a frame later, which is the very
        attribution this phase took away from them. The same exclusivity the
        claim rule uses, for the same reason.

        Both histories are kept for the same window, and that window is the
        one thing here that is not fixed: STEADY_WINDOW_SECONDS while frames
        arrive as fast as that assumed, as wide as the measured cadence needs
        when they do not. The majority rules are the same on any link.
        """
        taken: set[int] = set()

        # What counts as recent, on this frame. Read once so both histories
        # and every person in the frame are judged over the same moment.
        window = self._cadence.window

        for a in assessments:
            best, best_iou = None, STEADY_MATCH_IOU

            for index, entry in enumerate(self._memory):
                if index in taken:
                    continue
                overlap = _iou(a["box"], entry["box"])
                if overlap >= best_iou:
                    best, best_iou = index, overlap

            if best is None:
                self._memory.append(
                    {
                        "box": a["box"],
                        "votes": [],
                        "heads": [],
                        "mask": a["mask"],
                    }
                )
                best = len(self._memory) - 1

            taken.add(best)
            best = self._memory[best]

            best["box"] = a["box"]
            best["last_seen"] = now
            best["votes"].append((now, a["mask"]))
            best["votes"] = [v for v in best["votes"] if now - v[0] <= window]
            # Only frames where the question was actually asked get a vote.
            # A frame too dark to look at is not evidence that nobody was
            # facing the camera, and counting it as one would keep somebody
            # unjudged for a window after the lights came back.
            if a["head_known"]:
                best.setdefault("heads", []).append((now, a["head"]))

            best["heads"] = [
                v for v in best.get("heads", []) if now - v[0] <= window
            ]

            worn = sum(1 for v in best["votes"] if v[1])
            missing = len(best["votes"]) - worn

            if worn != missing:
                best["mask"] = worn > missing

            seen = sum(1 for v in best["heads"] if v[1])

            a["mask"] = best["mask"]
            a["head"] = seen > len(best["heads"]) - seen

        self._memory = [
            e
            for e in self._memory
            if now - e.get("last_seen", now) <= STEADY_FORGET_SECONDS
        ]

        return assessments

    # ------------------------------------------------------------------
    # Reporting
    # ------------------------------------------------------------------

    @staticmethod
    def _why_not_checked(a: dict[str, Any]) -> Optional[str]:
        """
        Why this person's face cannot be judged, or None when it can.

        Ordered by how much it explains: a picture nobody could read says
        nothing about anyone in it, and neither distance nor a missing head
        adds anything to that.
        """
        if a["unreadable"]:
            return a["unreadable"]

        if a["too_far"]:
            return REASON_TOO_FAR

        if not a["head_known"]:
            return REASON_NO_FINDER

        if not a["head"]:
            # The finding this module was built claiming to make and did not:
            # no face in shot is no evidence, and no evidence is not guilt.
            return REASON_NO_FACE

        return None

    @classmethod
    def _checkable(cls, a: dict[str, Any]) -> bool:
        """
        Whether this person's face can be judged at all.

        Someone too small for the model to resolve a mask on, or whose face
        the camera never saw, is missing evidence, not a breach.
        """
        return cls._why_not_checked(a) is None

    @classmethod
    def _is_violation(cls, a: dict[str, Any]) -> bool:
        """A violation is a missing mask on a face we can actually see."""
        return cls._checkable(a) and not a["mask"]

    def _summarise(self, assessments: list[dict[str, Any]], reading) -> dict[str, Any]:
        total = len(assessments)

        assessable = [a for a in assessments if self._checkable(a)]
        violations = [a for a in assessments if self._is_violation(a)]
        unverified = total - len(assessable)

        wearing = len(assessable) - len(violations)

        rate = round(wearing / len(assessable) * 100) if assessable else None

        no_face = [
            a for a in assessments if self._why_not_checked(a) == REASON_NO_FACE
        ]

        def people(count: int) -> str:
            return "1 person" if count == 1 else f"{count} people"

        if not reading.readable:
            # In the operator's words, not a count of nothing. "Nobody in
            # view" was the defect: at 8.25% of daylight the people stopped
            # being detected and an unreadable picture got the same sentence,
            # and the same green, as an empty and therefore safe room.
            #
            # Phrased exactly as the gear pages phrase it, because an
            # operator moving between them is reading the same sentence about
            # the same camera.
            summary = reading.reason.rstrip(".")
            if total:
                summary += f" — {people(total)} unverified"
        elif not total:
            summary = "Nobody in view"
        elif not assessable:
            summary = (
                "People in view, but too far away to check"
                if not no_face
                else "People in view, but no faces to check"
            )
        elif violations:
            summary = (
                "1 person without a mask"
                if len(violations) == 1
                else f"{len(violations)} people without masks"
            )
        elif unverified:
            # "Everyone" would be a claim about people this never looked at.
            summary = f"{people(wearing)} wearing a mask"
        else:
            summary = (
                "Everyone is wearing a mask"
                if len(assessable) > 1
                else "Wearing a mask"
            )

        if reading.readable and assessable and unverified:
            summary += f", {unverified} not checked"

        return {
            # An unjudgeable picture cannot raise a violation: with nobody
            # checkable there are no violations to raise, and this says so
            # rather than leaving it to arithmetic.
            "alert": bool(violations) and reading.readable,
            "status": (
                "unverified" if not reading.readable
                else "alert" if violations
                else "idle" if not total
                # People in view and not one of them judged is not "clear".
                else "unverified" if not assessable
                else "clear"
            ),
            "summary": summary,
            "detections": [
                {
                    "mask": a["mask"],
                    "checked": self._checkable(a),
                    "reason": self._why_not_checked(a),
                }
                for a in assessments
            ],
            "readable": reading.readable,
            "unreadable_reason": reading.reason,
            # The same people as people_not_checked, under the name every
            # module reports it by.
            "people_unverified": unverified,
            "people_total": total,
            "people_checked": len(assessable),
            "people_not_checked": unverified,
            "people_too_far": len([a for a in assessments if a["too_far"]]),
            "people_no_face": len(no_face),
            "wearing_mask": wearing,
            "missing_mask": len(violations),
            "violations": len(violations),
            "compliance_rate": rate,
        }

    def events(self, result: dict[str, Any]) -> list[dict[str, Any]]:
        """
        One event while anyone checkable is without a mask.

        Nothing is recorded off a picture that could not be read: with nobody
        checkable there is no `missing_mask` to record, so a dimming room
        stops the history growing rather than writing an accusation into it.
        The live result still says `unverified` — the operator is told the
        camera stopped being usable; the permanent record simply does not
        gain a violation nobody could see.
        """
        missing = result.get("missing_mask", 0)

        if not missing:
            return []

        return [
            {
                "key": "no-mask",
                "severity": "medium",
                "summary": (
                    "Someone working without a mask"
                    if missing == 1
                    else f"{missing} people working without masks"
                ),
                "details": {
                    "people_affected": missing,
                    "people_checked": result.get("people_checked", 0),
                    "people_in_view": result.get("people_total", 0),
                    "people_unverified": result.get("people_unverified", 0),
                },
            }
        ]

    def empty_result(self) -> dict[str, Any]:
        result = super().empty_result()
        result.update(
            {
                # Checks the file rather than calling is_ready(), so building
                # the initial result does not force the model to load.
                "summary": (
                    "Nobody in view"
                    if MODEL_PATH.exists()
                    else "Mask checking is not available"
                ),
                # Nothing has been looked at yet, which is not the same as
                # having looked and failed: an idle module is readable.
                "readable": True,
                "unreadable_reason": None,
                "people_unverified": 0,
                "people_total": 0,
                "people_checked": 0,
                "people_not_checked": 0,
                "people_too_far": 0,
                "people_no_face": 0,
                "wearing_mask": 0,
                "missing_mask": 0,
                "violations": 0,
                "compliance_rate": None,
            }
        )
        return result

    # ------------------------------------------------------------------
    # Configuration
    # ------------------------------------------------------------------

    def is_configurable(self) -> bool:
        return True

    def get_config(self) -> dict[str, Any]:
        return {
            "min_person_height": self._min_person_height,
            "min_person_height_default": DEFAULT_MIN_PERSON_HEIGHT,
        }

    def configure(self, payload: dict[str, Any]) -> dict[str, Any]:
        """
        Set how small a person may be before their face is judged.

        Args:
            payload: ``{"min_person_height": 0.0-1.0}`` as a fraction of
                frame height.
        """
        value = payload.get("min_person_height")

        if value is None:
            raise ValueError("min_person_height is required")

        # Range and finiteness in one place, so neither can be checked
        # without the other — and so a JSON boolean, which float()
        # happily turns into 1.0, is refused rather than stored.
        value = in_range(value, "min_person_height", 0.0, 1.0)

        self._min_person_height = value

        return {
            "success": True,
            "message": "Distance setting updated.",
            "min_person_height": value,
        }

    # ------------------------------------------------------------------
    # Annotation
    # ------------------------------------------------------------------

    def _annotate(
        self, frame: np.ndarray, assessments: list[dict[str, Any]]
    ) -> np.ndarray:
        """
        Draw one box per person, labelled with the verdict.

        Individual mask boxes are deliberately not drawn: the operator needs
        to see who is at risk, not every detection the model made.
        """
        annotated = frame.copy()

        for a in assessments:
            x1, y1, x2, y2 = (int(v) for v in a["box"])

            if not self._checkable(a):
                color = COLOR_UNKNOWN
                label = self._why_not_checked(a).rstrip(".")
            elif self._is_violation(a):
                color = COLOR_VIOLATION
                label = "No mask"
            else:
                color = COLOR_OK
                label = "Mask"

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


service = MaskService()
