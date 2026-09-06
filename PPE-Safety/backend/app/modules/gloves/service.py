"""
Gloves monitoring.

Unlike the safety-gear model, this one has a negative class: it detects
`hand_glove` and `hand_noglove` directly. A bare hand is therefore positive
evidence rather than something inferred from an absence, which makes this
module both simpler and more trustworthy than helmet/vest checking — there is
no gear-to-person matching to get wrong, and no "a glove on a bench counts as
compliance" failure mode.

Hands are still attributed to people where possible, so an alert can say how
many workers are affected rather than just how many bare hands are visible.

That simplicity was also this module's problem. Alone among the capabilities
it had no safety net at all: no check that the picture could be read, and no
steadying across frames — every frame judged on its own and believed at once,
live or not. A bare hand that the model stopped seeing between one frame and
the next did not become "we cannot tell", it became "everyone is wearing
gloves". Measured on a real frame, the bare hand scored 0.503 at full light,
0.447 at half, and 0.092 at a third — and the sentence on the screen went from
a correct alert to a confident all-clear with nothing in between. Both nets
are here now, and both are the ones Safety Gear already had.

The third net was distance, and it was missing for the same reason: nothing
here had ever asked whether the person was near enough to read a hand on. A
hand is the smallest thing any of these models is asked to find, so this
module needs that floor more than safety gear does and had none at all — it
answered "Everyone is wearing gloves" about three people, one of them at 7.7%
of the frame's height, on the picture where safety gear withheld judgement on
the same worker. See DEFAULT_MIN_PERSON_HEIGHT.
"""

import time
from typing import Any, Optional

import cv2
import numpy as np

from app.core.config import MODELS_DIR
from app.core.validate import fraction, in_range
from app.modules.base import BaseMonitoringService
from app.vision.cadence import Cadence
from app.vision.legibility import Reading, read

MODEL_PATH = MODELS_DIR / "gloves.pt"

#: Default detection confidence.
#:
#: Bare hands scored noticeably lower than gloved hands on the test footage
#: (0.36 against 0.77), which is expected — a gloved hand is a large block of
#: consistent colour, a bare hand is not. Setting this too high would
#: therefore suppress exactly the detections that matter, so it starts
#: permissive and is tunable per deployment.
DEFAULT_CONFIDENCE = 0.35

#: Confidence a hand must reach when it belongs to no detected person.
#:
#: Set apart from DEFAULT_CONFIDENCE deliberately: lowering the floor helps
#: find real bare hands on real people, but every threshold admits noise,
#: and noise with no person attached turns straight into a phantom "person
#: without gloves". A hand nobody is holding needs to be believed harder.
ORPHAN_HAND_CONFIDENCE = 0.5

#: How long a hand's verdict is decided over, in seconds.
#:
#: The same window, match rule and forgetting time Safety Gear uses, for the
#: same reason and with the same numbers — nobody puts a glove on and takes it
#: off nine times a second, and a module that believes they did is measuring
#: its own noise. Ported rather than re-derived: two modules watching the same
#: worker should not disagree about how long a moment is.
#:
#: It is the floor now rather than the whole rule. Read together with
#: ACCUSE_MIN_VOTES this was never a window, it was a minimum frame rate:
#: three sightings inside 1.5s cannot happen below two answers a second, and
#: only some of the frames that do arrive have a hand found in them at all.
#: Driven with a hand in every frame, a bare hand settles on frame 3 at 30,
#: 10, 5, 3 and 2fps, and never at 1fps however long the operator watches. The
#: real thing measures the same: the eleven-frame run verify_phase2 times this
#: module's latency on reports the hand on frame 3 at 2.7 frames a second and
#: never at 1.2 — same pictures, same weights, the verdict decided by how busy
#: the machine happens to be. That is the tell, because what else the CPU is
#: doing is not evidence about a hand. And the frontend aims at 10fps over a
#: tunnel to a hosted GPU, where the aim is a ceiling rather than a promise.
#:
#: So what counts as recent follows the measured cadence — never narrower than
#: this, wider only when answers are arriving more slowly than it assumed. The
#: votes needed, the majority and the confidence bars are all untouched: a slow
#: link stops being a reason this module can never answer, it does not become a
#: reason to accuse anyone on less. See app.vision.cadence.
STEADY_WINDOW_SECONDS = 1.5
STEADY_MATCH_IOU = 0.3
STEADY_FORGET_SECONDS = 2.0

#: Smallest person, as a fraction of frame height, whose hands can be judged.
#:
#: Safety gear has had one of these since before the audit; this module never
#: did, and failed towards compliance because of it. The number is not
#: borrowed from safety gear — a hand is far smaller than a vest, so the two
#: models give out at different distances and the floor was measured here.
#:
#: One real photograph of two workers in gloves, scaled down step by step onto
#: a flat background, everything else untouched. What the model said about the
#: nearer worker's gloved hand at each size:
#:
#:     person height   hand    verdict            truth
#:     0.399 of frame  30px    glove 0.82         right
#:     0.356           27px    glove 0.79         right
#:     0.333           26px    glove 0.84         right
#:     0.315           25px    glove 0.78         right
#:     0.303           24px    glove 0.57         right
#:     0.286           22px    glove 0.58         right
#:     0.281           22px    glove 0.42         right
#:     0.256           20px    NOGLOVE 0.70       wrong — a false accusation
#:     0.245           --      nothing found      wrong — a false all-clear
#:     0.233           17px    NOGLOVE 0.58       wrong
#:     0.216           15px    NOGLOVE 0.35       wrong
#:     0.201           14px    NOGLOVE 0.54       wrong
#:     0.171           13px    NOGLOVE 0.36       wrong
#:     0.159           --      nothing found      wrong
#:
#: Every reading down to 0.281 is right and every reading from 0.256 down is
#: wrong, in one direction or the other — the model does not become uncertain
#: about a hand it cannot resolve, it becomes confidently wrong about it. The
#: floor sits above the whole wrong half with room to spare rather than on the
#: boundary, because the sample is one photograph and the failure below it is
#: not graceful.
#:
#: On the picture from the report — three workers, the third at 7.7% of the
#: frame — this is what stops "Everyone is wearing gloves" being said about
#: somebody the model never found a hand on.
#:
#: Like safety gear's, it depends entirely on how far the cameras are mounted
#: and is configurable per deployment via POST /api/gloves/config.
DEFAULT_MIN_PERSON_HEIGHT = 0.30

#: Why a hand could not be judged. Plain words: they are drawn on the picture.
REASON_TOO_FAR = "Too far to check"

#: How many sightings an accusation needs, and how one-sided they must be.
#:
#: Reporting a bare hand is an accusation and needs sustained, clearly
#: one-sided evidence; a glove needs none. The asymmetry is Safety Gear's, and
#: it is the reason a helmet scoring either side of the bar in a dim bay no
#: longer accuses the man wearing it on alternate frames.
ACCUSE_MIN_VOTES = 3
ACCUSE_MAJORITY = 2.0

COLOR_OK = (0, 170, 0)
COLOR_VIOLATION = (0, 0, 220)
COLOR_PERSON = (150, 110, 0)
#: A hand that was bare and is no longer being found. Amber: not an
#: accusation, and certainly not an all-clear.
COLOR_UNCONFIRMED = (0, 170, 220)
#: A hand in a picture that cannot be judged at all.
COLOR_UNKNOWN = (140, 140, 140)


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


class GlovesService(BaseMonitoringService):
    """Checks that gloves are being worn where they are required."""

    module_id = "gloves"
    name = "Gloves"
    description = "The AI checks that gloves are being worn where they are required."

    def __init__(self) -> None:
        self._model = None
        self._load_failed = False
        self._confidence = DEFAULT_CONFIDENCE
        self._min_person_height = DEFAULT_MIN_PERSON_HEIGHT

        # Per-hand observation history for the steady verdicts; see _steady().
        # Session copies get their own in reset_session_state.
        self._memory: list[dict[str, Any]] = []

        # How fast frames are actually arriving, and so how long a vote stays
        # recent. One per session, like the history it prunes: frames arrive
        # at one rate for the whole module, not one rate per hand.
        self._cadence = Cadence(STEADY_WINDOW_SECONDS, ACCUSE_MIN_VOTES)

        super().__init__()

    def reset_session_state(self) -> None:
        self._memory = []

        # A new instance rather than a reset: for_session() copies shallowly,
        # so until this is replaced the copy is measuring the origin's frames
        # as well as its own.
        self._cadence = Cadence(STEADY_WINDOW_SECONDS, ACCUSE_MIN_VOTES)

    def reset(self) -> None:
        super().reset()
        self._memory = []

        # A new camera is a new measurement — the old one's frame rate says
        # nothing about this one's.
        self._cadence.reset()

    # ------------------------------------------------------------------

    def _get_model(self):
        if self._model is not None or self._load_failed:
            return self._model

        if not MODEL_PATH.exists():
            self._load_failed = True
            print(f"[Gloves] No model at {MODEL_PATH}; module disabled.")
            return None

        try:
            from ultralytics import YOLO

            self._model = YOLO(str(MODEL_PATH))
            print(f"[Gloves] Model loaded: {self._model.names}")
        except Exception as exc:  # noqa: BLE001
            self._load_failed = True
            print(f"[Gloves] Could not load model: {exc}")

        return self._model

    def is_ready(self) -> bool:
        return self._get_model() is not None

    # ------------------------------------------------------------------

    def process(self, frame: np.ndarray) -> tuple[np.ndarray, dict[str, Any]]:
        model = self._get_model()

        if model is None:
            return frame, self._store(self.empty_result())

        results = model(frame, verbose=False, conf=self._confidence)

        people: list[dict[str, Any]] = []
        hands: list[dict[str, Any]] = []

        for result in results:
            for box in result.boxes:
                label = model.names[int(box.cls[0])]
                x1, y1, x2, y2 = (float(v) for v in box.xyxy[0])
                item = {"box": (x1, y1, x2, y2), "conf": float(box.conf[0])}

                if label == "person":
                    people.append(item)
                elif label in ("hand_glove", "hand_noglove"):
                    item["gloved"] = label == "hand_glove"
                    hands.append(item)

        # A hand on a detected person is corroborated by the person; a hand
        # near nobody has only its own score to stand on, so it is held to a
        # higher one. The styled demo footage produced a 0.39-confidence
        # "hand" the size of a torso on empty floor — kept, it became a
        # phantom person without gloves in the count.
        hands = [
            h
            for h in hands
            if h["conf"] >= ORPHAN_HAND_CONFIDENCE
            or self._owner(h, people) is not None
        ]

        reading = read(frame, self.module_id)

        height, width = frame.shape[:2]

        # Before anything is said about a hand: is its owner near enough for
        # this model to have read one? Done here, where the picture's size is
        # known, so that everything downstream — the sentence, the counts,
        # the colours — is answering the same question.
        self._reach(people, hands, height)

        # Once per processed frame, before anything votes: how long a vote is
        # kept is decided by how often they are actually arriving.
        now = time.time()
        self._cadence.tick(now)

        hands, unconfirmed = self._steady(hands, now)

        annotated = self._annotate(frame, people, hands, reading)

        result = self._summarise(people, hands, reading, unconfirmed)
        result["regions"] = self._regions(people, hands, width, height, reading)

        return annotated, self._store(result)

    def _regions(
        self, people, hands, width, height, reading=None
    ) -> list[dict[str, Any]]:
        """Hands prominently, people faintly — the hand is what to look at."""
        regions = [
            self.region(p["box"], width, height, tone="muted")
            for p in people
        ]

        regions += [
            self.region(h["box"], width, height, **self._hand_verdict(h, reading))
            for h in hands
        ]

        return regions

    @staticmethod
    def _hand_verdict(
        hand: dict[str, Any], reading: Optional[Reading] = None
    ) -> dict[str, str]:
        """
        How one hand reads on the screen: its words and its tone.

        One place, so the browser's overlay and the annotated picture cannot
        disagree — a red "No glove" box, or a green one, drawn over a page
        that has just said it cannot judge the picture is the same
        contradiction this phase exists to remove.
        """
        if reading is not None and not reading.readable:
            # Nothing drawn on an unjudgeable picture may read as a verdict,
            # in either direction. The boxes stay, so the operator can still
            # see where to look; the colour that means "we checked" does not.
            return {"label": "Glove" if hand["gloved"] else "Hand", "tone": "muted"}

        if not hand.get("judged", True):
            # Whoever this belongs to is too far off for the model to read a
            # hand on. The box says where to look and nothing else — at this
            # size the model does not hedge, it commits to the wrong answer.
            return {"label": REASON_TOO_FAR, "tone": "muted"}

        if hand["gloved"]:
            return {"label": "Glove", "tone": "ok"}

        # A bare hand seen once is not an accusation the evidence has earned.
        if not hand.get("settled", True):
            return {"label": "Checking hand", "tone": "warning"}

        return {"label": "No glove", "tone": "danger"}

    # ------------------------------------------------------------------

    def _steady(
        self, hands: list[dict[str, Any]], now: float
    ) -> tuple[list[dict[str, Any]], int]:
        """
        Replace each hand's per-frame verdict with the settled one.

        Hands are matched to their own recent history by overlap, votes older
        than the window are dropped, and the reported answer is the majority
        of what remains. Granting a glove takes a bare majority; taking one
        away is an accusation and takes ACCUSE_MIN_VOTES sightings at
        ACCUSE_MAJORITY to one.

        How long a vote survives is the one thing here that is not fixed: it
        is STEADY_WINDOW_SECONDS while frames arrive as fast as that assumed,
        and as wide as the measured cadence needs when they do not. How many
        sightings, and how one-sided, are the same on any link.

        Returns the hands and the number of hands that were settled bare
        within the window and are no longer being detected at all. Those are
        the reason this exists: the reported failure was not a hand judged
        wrongly, it was a hand that stopped being found — 0.503 at full light,
        0.092 at a third of it — and the module answering "everyone is wearing
        gloves" a frame later. They raise nothing and draw nothing; they only
        stop the all-clear until the window has actually run out.

        A photograph gets none of this. There is no sequence to steady a still
        against, and the operator asked about this picture.
        """
        if self.single_frame:
            for hand in hands:
                hand["settled"] = True
            return hands, 0

        # What counts as recent, on this frame: STEADY_WINDOW_SECONDS while
        # answers arrive as fast as that was sized for, wider when they do
        # not. Read once so every hand in the frame is judged over the same
        # moment.
        window = self._cadence.window

        for hand in hands:
            if not hand.get("judged", True):
                # Too far to have been read, so there is no verdict to steady
                # and no business in the history of one. Left out entirely
                # rather than remembered as bare: a hand nobody judged must
                # not later be reported as a bare one that stopped being
                # found.
                continue

            best, best_iou = None, STEADY_MATCH_IOU

            for entry in self._memory:
                overlap = _iou(hand["box"], entry["box"])
                if overlap >= best_iou:
                    best, best_iou = entry, overlap

            if best is None:
                best = {"box": hand["box"], "votes": [], "gloved": hand["gloved"]}
                self._memory.append(best)

            best["box"] = hand["box"]
            best["last_seen"] = now
            best["seen_at"] = now
            best["votes"].append((now, hand["gloved"]))
            best["votes"] = [v for v in best["votes"] if now - v[0] <= window]

            gloved = sum(1 for v in best["votes"] if v[1])
            bare = len(best["votes"]) - gloved

            if best["gloved"]:
                if bare >= ACCUSE_MIN_VOTES and bare >= gloved * ACCUSE_MAJORITY:
                    best["gloved"] = False
            elif gloved > bare:
                best["gloved"] = True

            hand["gloved"] = best["gloved"]
            hand["settled"] = len(best["votes"]) >= ACCUSE_MIN_VOTES

        unconfirmed = sum(
            1
            for entry in self._memory
            if not entry["gloved"] and entry.get("seen_at") != now
        )

        self._memory = [
            entry
            for entry in self._memory
            if now - entry.get("last_seen", now) <= STEADY_FORGET_SECONDS
        ]

        return hands, unconfirmed

    # ------------------------------------------------------------------

    #: How far outside a person's box their hand may sit, as a fraction of
    #: the box's width and height.
    #:
    #: The person class in this model draws tight: with arms outstretched the
    #: hands land at or just beyond the box's edge. Requiring the hand's
    #: centre strictly inside meant a person holding both hands out was
    #: counted as nobody — and their two bare hands then read as two separate
    #: people. Arms reach about half a box-width past the shoulder at full
    #: stretch, so a third of the width covers it without claiming hands from
    #: the next person over.
    OWNER_MARGIN = (0.35, 0.12)

    @classmethod
    def _owner(
        cls, hand: dict[str, Any], people: list[dict[str, Any]]
    ) -> Optional[int]:
        """
        Index of the person this hand belongs to, or None.

        The nearest person whose box — grown by OWNER_MARGIN — contains the
        hand's centre. Nearest, because grown boxes can overlap where people
        stand together, and a hand should not be handed to whoever happens to
        come first in detection order.
        """
        hx1, hy1, hx2, hy2 = hand["box"]
        cx, cy = (hx1 + hx2) / 2, (hy1 + hy2) / 2

        best: Optional[int] = None
        best_distance = float("inf")

        for index, person in enumerate(people):
            px1, py1, px2, py2 = person["box"]
            grow_x = (px2 - px1) * cls.OWNER_MARGIN[0]
            grow_y = (py2 - py1) * cls.OWNER_MARGIN[1]

            if (
                px1 - grow_x <= cx <= px2 + grow_x
                and py1 - grow_y <= cy <= py2 + grow_y
            ):
                mx, my = (px1 + px2) / 2, (py1 + py2) / 2
                distance = (cx - mx) ** 2 + (cy - my) ** 2

                if distance < best_distance:
                    best = index
                    best_distance = distance

        return best

    def _reach(
        self,
        people: list[dict[str, Any]],
        hands: list[dict[str, Any]],
        height: int,
    ) -> None:
        """
        Mark who is too far away to read a hand on, and which hands follow.

        Marks rather than filters, on purpose: a person too far off is still
        somebody standing there, and a hand that cannot be judged is still
        worth drawing so the operator knows where to look. What changes is
        that neither is allowed to be evidence — of compliance or of a
        breach.

        A hand goes unjudged with its owner. One belonging to nobody detected
        keeps its own verdict: it has already cleared the higher bar unowned
        hands are held to, and there is no person's size to measure it by.
        """
        floor = height * self._min_person_height

        for person in people:
            person["too_far"] = (person["box"][3] - person["box"][1]) < floor

        for hand in hands:
            owner = self._owner(hand, people)
            hand["judged"] = owner is None or not people[owner]["too_far"]

    def _summarise(
        self,
        people: list[dict[str, Any]],
        hands: list[dict[str, Any]],
        reading: Optional[Reading] = None,
        unconfirmed: int = 0,
    ) -> dict[str, Any]:
        readable = reading is None or reading.readable
        reason = None if readable else reading.reason

        # Only hands near enough to have been read count as evidence either
        # way. Below the distance floor this model does not go quiet, it goes
        # confidently wrong — see DEFAULT_MIN_PERSON_HEIGHT — so a hand out
        # there neither clears its owner nor accuses them.
        judged = [h for h in hands if h.get("judged", True)]
        distant = [h for h in hands if not h.get("judged", True)]

        near = [p for p in people if not p.get("too_far")]
        too_far = [p for p in people if p.get("too_far")]

        gloved = [h for h in judged if h["gloved"]]
        # A bare hand seen for the first time is not yet an accusation; it is
        # a hand we are still looking at.
        bare = [h for h in judged if not h["gloved"] and h.get("settled", True)]
        watching = [
            h for h in judged if not h["gloved"] and not h.get("settled", True)
        ]

        # People with at least one bare hand. A worker with one hand out of
        # shot and one bare hand is still one worker at risk, not two.
        affected: set[int] = set()
        unattributed_bare = 0

        for hand in bare:
            owner = self._owner(hand, people)
            if owner is None:
                unattributed_bare += 1
            else:
                affected.add(owner)

        # Hands that belong to nobody detected still mean someone — but
        # people come with two hands, so a pair of orphan bare hands is one
        # person, not two. Counting each hand as its own person had a single
        # worker with both hands out reported as "2 people without gloves".
        people_affected = len(affected) + (unattributed_bare + 1) // 2

        # Nobody the module reached a verdict about. An unreadable picture
        # makes that everybody in it; otherwise it is the hands still being
        # watched, the ones that were bare a moment ago and have stopped
        # being found — the exact case that used to read as an all-clear —
        # and anybody standing too far off to have been read at all.
        pending = len(watching) + unconfirmed
        unverified = (
            len(people)
            if not readable
            else (pending + 1) // 2 + len(too_far)
        )

        # Set by the branches whose own words already account for the people
        # standing too far off, so the clause after them does not say it
        # twice.
        already_said = False

        if not readable:
            summary = reason.rstrip(".")
            if people:
                summary += f" — {self._people(len(people))} unverified"
            already_said = True
        elif not hands and not people and not pending:
            summary = "Nobody in view"
        elif bare:
            summary = (
                "1 person without gloves"
                if people_affected == 1
                else f"{people_affected} people without gloves"
            )
        elif pending:
            summary = (
                f"{self._people(unverified)} unverified — "
                "a bare hand was seen and cannot be confirmed"
                if unconfirmed
                else f"Checking {self._hands(pending)}"
            )
            already_said = unconfirmed > 0
        elif people and not near:
            # Everybody in the picture is smaller than this model can read a
            # hand on. Phrased as the gear pages phrase it, because an
            # operator moving between them is reading about the same camera.
            summary = "People in view, but too far away to check"
            already_said = True
        else:
            # "Everyone" is a claim about everybody in the picture, so it is
            # only available when everybody in the picture was looked at.
            summary = (
                "Everyone is wearing gloves"
                if len(near) > 1 and not too_far
                else "Gloves are being worn"
            )

        if too_far and not already_said:
            summary += f" — {self._people(len(too_far))} unverified"

        return {
            "alert": bool(bare) and readable,
            "status": (
                "unverified" if not readable
                else "alert" if bare
                else "unverified" if pending or too_far
                else "clear" if (people or hands)
                else "idle"
            ),
            "summary": summary,
            # Whether this picture could be judged at all, and how many people
            # were standing in it either way. PHASE2_CONTRACT §2.
            "readable": readable,
            "unreadable_reason": reason,
            "people_unverified": unverified,
            "detections": [
                {"gloved": h["gloved"], "confidence": round(h["conf"], 2)}
                for h in judged
            ],
            "people_total": len(people),
            # Hands, and the compliance rate over them, count only the ones
            # that were actually read. A hand out at the far end of the yard
            # in the "1 of 2 gloved" line is a hand this module did not look
            # at, and putting it there is the arithmetic version of the
            # sentence this phase exists to stop saying.
            "hands_total": len(judged),
            "hands_gloved": len(gloved),
            "hands_bare": len(bare),
            "hands_too_far": len(distant),
            "people_too_far": len(too_far),
            "people_affected": people_affected if readable else 0,
            "violations": people_affected if readable else 0,
            "compliance_rate": (
                round(len(gloved) / len(judged) * 100) if judged else None
            ),
        }

    @staticmethod
    def _people(count: int) -> str:
        return "1 person" if count == 1 else f"{count} people"

    @staticmethod
    def _hands(count: int) -> str:
        return "1 hand" if count == 1 else f"{count} hands"

    def events(self, result: dict[str, Any]) -> list[dict[str, Any]]:
        """One event while bare hands are visible, however many."""
        affected = result.get("people_affected", 0)

        if not affected:
            return []

        return [
            {
                "key": "no-gloves",
                "severity": "medium",
                "summary": (
                    "Someone working without gloves"
                    if affected == 1
                    else f"{affected} people working without gloves"
                ),
                "details": {
                    "people_affected": affected,
                    "hands_bare": result.get("hands_bare", 0),
                    "hands_gloved": result.get("hands_gloved", 0),
                },
            }
        ]

    def empty_result(self) -> dict[str, Any]:
        result = super().empty_result()
        result.update(
            {
                "summary": (
                    "Nobody in view"
                    if MODEL_PATH.exists()
                    else "Glove checking is not available"
                ),
                # Always present, whether or not anything has been analysed:
                # a screen that has to test for the key cannot tell a missing
                # answer from a confident one. PHASE2_CONTRACT §2.
                "readable": True,
                "unreadable_reason": None,
                "people_unverified": 0,
                "people_total": 0,
                "hands_total": 0,
                "hands_gloved": 0,
                "hands_bare": 0,
                "hands_too_far": 0,
                "people_too_far": 0,
                "people_affected": 0,
                "violations": 0,
                "compliance_rate": None,
            }
        )
        return result

    # ------------------------------------------------------------------

    def is_configurable(self) -> bool:
        return True

    def get_config(self) -> dict[str, Any]:
        return {
            "confidence": self._confidence,
            "confidence_default": DEFAULT_CONFIDENCE,
            "min_person_height": self._min_person_height,
            "min_person_height_default": DEFAULT_MIN_PERSON_HEIGHT,
        }

    def configure(self, payload: dict[str, Any]) -> dict[str, Any]:
        """
        Set how certain the system must be, and how near.

        Args:
            payload: ``{"confidence": 0.0-1.0}`` — lower catches more bare
                hands and more false alarms, higher does the reverse — and/or
                ``{"min_person_height": 0.0-1.0}`` as a fraction of frame
                height, below which a person's hands are reported as
                unchecked rather than judged. Either may be sent alone.
        """
        confidence = payload.get("confidence")
        floor = payload.get("min_person_height")

        # Named after the setting this module has always had, so a payload
        # that mentions neither says what it has always said.
        if confidence is None and floor is None:
            raise ValueError("confidence is required")

        # Range and finiteness in one place, so neither can be checked
        # without the other — and so a JSON boolean, which float()
        # happily turns into 1.0, is refused rather than stored. Both are
        # read before either is stored, so a payload with one good value and
        # one bad one changes nothing.
        if confidence is not None:
            confidence = fraction(confidence, "confidence")
        if floor is not None:
            floor = in_range(floor, "min_person_height", 0.0, 1.0)

        if confidence is not None:
            self._confidence = confidence
        if floor is not None:
            self._min_person_height = floor

        # The reply echoes what it changed and nothing else, so asking for
        # the setting this module has always had gets back the answer it has
        # always given.
        result: dict[str, Any] = {
            "success": True,
            "message": (
                "Sensitivity updated."
                if floor is None
                else "Distance setting updated."
                if confidence is None
                else "Sensitivity and distance settings updated."
            ),
        }

        if confidence is not None:
            result["confidence"] = self._confidence
        if floor is not None:
            result["min_person_height"] = self._min_person_height

        return result

    # ------------------------------------------------------------------

    def _annotate(
        self,
        frame: np.ndarray,
        people: list[dict[str, Any]],
        hands: list[dict[str, Any]],
        reading: Optional[Reading] = None,
    ) -> np.ndarray:
        """
        Draw hands prominently and people faintly.

        The hand is what the operator needs to look at; the person box is
        context for where to look.

        When the picture cannot be read the boxes are still drawn — somebody
        is there and the operator should see where — but nothing on them is
        called a violation. The words and the tone come from `_hand_verdict`,
        the same place the browser's overlay gets them.
        """
        annotated = frame.copy()

        for person in people:
            x1, y1, x2, y2 = (int(v) for v in person["box"])
            cv2.rectangle(annotated, (x1, y1), (x2, y2), COLOR_PERSON, 1)

        tones = {
            "ok": COLOR_OK,
            "warning": COLOR_UNCONFIRMED,
            "danger": COLOR_VIOLATION,
            "muted": COLOR_UNKNOWN,
        }

        for hand in hands:
            x1, y1, x2, y2 = (int(v) for v in hand["box"])

            verdict = self._hand_verdict(hand, reading)
            label = verdict["label"]
            colour = tones[verdict["tone"]]

            cv2.rectangle(annotated, (x1, y1), (x2, y2), colour, 2)

            (tw, th), _ = cv2.getTextSize(
                label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 2
            )
            top = max(y1 - th - 8, 0)

            cv2.rectangle(
                annotated, (x1, top), (x1 + tw + 8, top + th + 8), colour, -1
            )
            cv2.putText(
                annotated,
                label,
                (x1 + 4, top + th + 2),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                (255, 255, 255),
                2,
            )

        return annotated


service = GlovesService()
