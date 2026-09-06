"""
Safety gear (PPE) monitoring — helmet and vest.

The trained model detects `person`, `helmet` and `vest`. It has no
"no-helmet" class, so non-compliance cannot be read from a detection; it has
to be inferred by working out which person each helmet and vest belongs to.

Counting alone is not good enough:

    * a helmet resting on a bench is a helmet detection belonging to nobody
    * with two workers and one helmet, counting says "50%" but cannot say
      which worker is at risk — and the alert needs to point at a person

So each helmet and vest is matched to a person by position — see
`app/vision/anatomy`, which does the matching for this module and the mask
one, because both got it wrong in the same way.

That care was spent entirely on the gear and none of it on the person
underneath. Every rule here withheld an accusation when an *item* could not be
read, and none of them noticed when the *person* could not be seen — so
dimming the room, blurring the lens or standing further back deleted the
worker and their violation together, and the screen went green. This module
now asks whether the picture can be judged at all before it says anything
about it, keeps people the detector is only half sure of as unverified rather
than absent, and refuses the fully-verified green to anybody only half of whom
was checked.

The last way a worker could vanish was the matching itself. "Anything that
matches nobody is ignored rather than counted as compliance" was true, and
half of it was the defect: on a real frame two workers standing one behind
the other came back as a single person box, and the man behind — blue helmet,
detected at 0.829 — matched nobody and was dropped without a word, leaving
"1 person, wearing the right gear". Gear nobody can be holding is now
evidence of somebody the detector merged away, and it is reported.

All of that care went into deciding *what* to say and none into deciding when
it had changed. Every rule above was steadied per person per item and the
things they are computed from were not, so the sentence on the screen changed
1.7-3.2 times a second over footage where nobody moved — 175 and 160 changes a
minute on the two demo clips at 5fps, the median run of one stable sentence
being a single frame. Two thirds of that was the headcount, which nothing
steadied at all, and most of the rest was a distance or a brightness
measurement of one frame being read straight into the verdict. Presence is now
a vote over a window like the gear verdict is, gear already believed survives a
weaker sighting than it took to establish, and the reasons a person cannot be
judged are voted on with everything else.

Measured over the same two clips, one set of cached detections replayed into
both versions so nothing but the module differs:

                            cctv_demo.webm        video.mp4
    summary changes/min     178.8 ->  57.5       160.0 ->  72.0
    headcount changes/min   145.0 ->  55.0       142.0 ->  54.0
    status changes/min       78.8 ->  15.0        60.0 ->  28.0
    median stable run          1f  ->    3f          1f  ->    2f
    first alert on frame        3  ->     3           3  ->     3

Nothing waits, and that last row is the one that had to hold: a rolling window
costs no time-to-alert for anybody already in shot, where a fixed one was
measured to cost 4.5s. Somebody walking in mid-stream costs 6 frames rather
than 3, which is PRESENCE_FRACTION's entry and the one real price here. Single
stills bypass every word of it, because a photograph has no sequence to settle
over.
"""

import time
from typing import Any, Optional

import cv2
import numpy as np

from app.core.config import MODELS_DIR
from app.core.validate import in_range
from app.modules.base import BaseMonitoringService
from app.vision.anatomy import claim
from app.vision.cadence import Cadence
from app.vision.legibility import Reading, read

#: Trained weights. Absent means the module reports itself as not ready
#: instead of failing on the first frame.
MODEL_PATH = MODELS_DIR / "ppe.pt"

#: Confidence a person's *gear* must clear before it is judged at all.
#:
#: This used to be the only bar in the module, applied to every class the
#: model has, `person` included — and that is how the worst defect in the
#: system was built. See PERSON_CONFIDENCE.
CONF_THRESHOLD = 0.35

#: Confidence a *person* must reach to be reported at all.
#:
#: Deliberately far below CONF_THRESHOLD, because the two mistakes are not
#: comparable: a noisy person box costs an "unverified" on the screen, and a
#: missed person costs a human being. On the reference photograph the
#: bare-headed man in the left third scores 0.248 against the old flat 0.35 —
#: so with nothing done to the picture at all, he did not exist, and the
#: system reported "Wearing the right gear" about the one worker it could see.
#:
#: Measured on that photograph across all twenty-one quality levels the bench
#: sweeps. Person boxes recovered between this bar and the old one:
#:
#:     bar    conditions where the second man reappears   invented people
#:     0.25   none — his 0.248 is below it                0
#:     0.20   8 of 21 (untouched, x0.50, x0.35, x0.25,    0
#:            x0.17, x0.16, jpeg q30, and x0.20 where
#:            the old bar already had him)
#:     0.15   10 of 21                                    1 (x0.16)
#:     0.12   14 of 21                                    4
#:
#: 0.20 is the lowest bar with real margin over the highest score this model
#: puts on something that is not a person. Measured on pictures with nobody
#: in them: pure noise 0.065, flat grey and solid black nothing at all, an
#: empty patch of the site's ground 0.053 — and, the one that decides it,
#: 0.144 on a crop of the same photograph's sky and steelwork. A bar of 0.15
#: would sit six thousandths of confidence above that, so it is not a bar at
#: all; 0.20 clears it by 39%.
#:
#: The cost of that margin is on the record: at blur k=5 and k=9 the picture
#: still passes the legibility gate and this man scores 0.173 and 0.123, so
#: he is lost with no warning while the hi-vis worker beside him holds 0.795
#: and 0.761. That asymmetry is PPE-02 and no threshold fixes it — bright
#: hi-vis makes a person easy to detect and plain clothes make them easy to
#: lose, which is a training-data problem.
#:
#: A person found between this bar and CONF_THRESHOLD is never accused of
#: anything — they are reported as unverified, which is the honest state for
#: somebody the detector is only half sure it can see.
PERSON_CONFIDENCE = 0.20

#: Below `PERSON_CONFIDENCE`, the score above which a box is still worth
#: reporting as *possibly* somebody.
#:
#: The legibility gate answers "can this picture be read". It cannot answer
#: "was somebody lost from a picture that reads perfectly well", and on this
#: model that happens: a blur kernel of 3 — a softness nobody would call
#: blurred — takes the plainly-dressed worker from 0.248 to 0.197, under the
#: bar, while the hi-vis worker beside him holds 0.805. The picture is fine;
#: the model has simply stopped being sure about the person who matters.
#:
#: Measured decay of that worker under blur: 0.248, 0.197, 0.173, 0.123,
#: 0.110 at kernels 1, 3, 5, 9, 11. The highest score this model was measured
#: to give something that is not a person at all is 0.144, on a crop of sky
#: and steelwork. This sits just above that, so a possible person is reported
#: and a phantom is not.
#:
#: It closes the gap at kernel 5 and not at 9, where the real worker scores
#: below the phantom ceiling and no single frame can tell them apart. What
#: separates them there is a headcount that falls between frames, which needs
#: a stream rather than a photograph. Stated rather than papered over.
POSSIBLE_PERSON_CONFIDENCE = 0.145

#: How long a person's verdict is decided over, in seconds.
#:
#: Judged frame by frame, the verdict flickered: a borderline detection
#: crossing the confidence bar on odd frames read "No vest" one second and
#: "No helmet or vest" the next, about a person who had not moved. Nobody
#: changes gear nine times a second, so each person's helmet and vest are
#: now reported as the majority of the last moment's observations — ties
#: keep the previous answer — and the screen changes only when the evidence
#: has actually changed.
#:
#: This is the floor rather than the whole rule. Read together with
#: ACCUSE_MIN_VOTES below it was never a window, it was a minimum frame rate:
#: three sightings inside 1.5s cannot happen below two answers a second, and
#: only some of the frames that do arrive have the person found in them.
#: Driven with a person in every frame, a bare head is reported on frame 4 at
#: 30, 10, 5, 3 and 2fps and never at 1fps — and the browser aims at 10fps
#: over a tunnel to a hosted GPU, where the aim is a ceiling rather than a
#: promise. A person the module can never finish judging is not a safe
#: failure: the screen holds "Checking" over somebody with no helmet on for as
#: long as anybody watches.
#:
#: So what counts as recent follows the measured cadence — never narrower than
#: this, wider only when answers arrive more slowly than it assumed. The
#: sightings an accusation needs, the majority it needs, and every confidence
#: bar are untouched; only the clock they are counted against is. See
#: app.vision.cadence.
STEADY_WINDOW_SECONDS = 1.5

#: Overlap needed to consider a detection the same person as last frame.
STEADY_MATCH_IOU = 0.3

#: How long an unseen person's history is kept before it is forgotten.
#:
#: The presence vote below needs that history to still exist to be counted, so
#: what is actually used is the wider of this and PRESENCE_WINDOW_SECONDS —
#: see `_forget()`. Left at its measured value rather than raised, because it
#: is also what decides how long a stale box can sit in memory waiting to be
#: matched by whoever walks through the same patch of floor next.
STEADY_FORGET_SECONDS = 2.0

#: How long a person's *presence* is decided over, in seconds.
#:
#: The gear verdict was steadied per person and the headcount was not, so the
#: screen went on changing about a yard where nobody had moved. Of 305 measured
#: summary changes, 65.6% were the person count moving, and 87% of those were
#: the detector emitting no box at all for somebody it had found a frame
#: earlier. Steadying what each person wears while letting how many of them
#: there are flicker is steadying the adjective and not the noun.
#:
#: So presence is a vote, over a window sized from how long those holes
#: actually last. Person boxes tracked by overlap across cctv_demo.webm and
#: video.mp4 at 5fps — 26 disappearances that later closed:
#:
#:     1 frame x11 · 3 x3 · 4 · 5 x2 · 6 · 7 · 8      20 of them, up to 1.6s
#:     9 · 12 x2 · 13 · 17 · 19                        6 of them, 1.8-3.8s
#:
#: A window this wide at PRESENCE_FRACTION tolerates an absence of
#: (1 - fraction) x window = 1.75s, which covers all twenty of the first group
#: — every hole the detector blinked through — and none of the second, which
#: are people walking behind something and coming back. That is the line worth
#: drawing: the first group is the detector failing, the second is the world
#: changing, and only the first is noise.
#:
#: A fixed "collect three or four seconds, then answer" window was measured
#: first and rejected. It added 4.5s on average and up to 6.25s to a real
#: violation alert, and it broke the module outright — STEADY_FORGET_SECONDS
#: reaped each person's vote history between windows, so `settled` never
#: became true and nobody was ever accused of anything. Rolling gives the same
#: steadiness with no added time-to-alert for anybody already in shot.
PRESENCE_WINDOW_SECONDS = 3.5

#: What share of that window's frames a person must be found in to be counted.
#:
#: Half, and the same half in both directions, which is what makes this a
#: filter rather than a ratchet: the bar that keeps somebody the detector
#: dropped is the bar that keeps a one-frame phantom out of the headcount.
#: Higher and real people fall out of the count while they are still standing
#: there; lower and the module holds onto people who have genuinely walked
#: out, and an alert about somebody who is no longer in the picture is an
#: alert nobody can act on.
#:
#: The cost is on the arrival side, and getting it wrong there was the one
#: mistake this work actually made. Counted against every frame the session
#: had processed, somebody walking into a watched scene waited half a window
#: — 1.75s — before they were counted at all, and a violator arriving took 11
#: frames from their first sighting to the alert against the 3 the same
#: violator takes in a fresh session. A rolling filter was chosen over a fixed
#: one *because* the fixed one added 4.5s to an alert; charging a newcomer for
#: a window they were not in the room for is the same defect in a smaller
#: place. `_track()` counts them against the frames since they appeared
#: instead, floored so a flickering box still cannot get in, and the same
#: violator is now alerted 6 frames after their first sighting.
#:
#: That floor is not free and the number is here rather than in a commit
#: message: against the same cached detections, holding a newcomer to the
#: whole window scored 76% and 61% fewer sentence changes on the two demo
#: clips, and letting them in early scores 68% and 55%. Steadiness was the
#: cheaper thing to spend. The alert is the product.
#:
#: They are not hidden while they wait, which is what makes the trade honest:
#: an unsettled sighting is reported through the same unverified path as a
#: person the detector is only half sure it can see, so the screen says
#: somebody may be there rather than settling into a confident green. See
#: `_track()` and `_unconfirmed()`.
PRESENCE_FRACTION = 0.5

#: Confidence a helmet or vest must reach before it can make somebody
#: compliant.
#:
#: Higher than the floor above, deliberately, because the costs are not
#: symmetric: a weakly-believed detection that raises a question gets a
#: second look, but a weakly-believed vest that grants a green tick hides an
#: unprotected worker behind "all clear" — a grey sweatshirt read as a vest
#: marked a man with no vest compliant. Real gear is not weak evidence: on
#: the test footage helmets score 0.88 and vests 0.76, so this bar costs
#: nothing on the true positives it exists to protect.
ITEM_CONFIDENCE = 0.55

#: Confidence a piece of gear *already believed worn* keeps being believed at.
#:
#: The bar above is where a belief is established and it has not moved. What
#: was missing was the other half of it: below that bar an item fell through
#: every branch in `process()` in silence — it became neither gear, nor a
#: possible person, nor left-over gear implying somebody the detector merged
#: away. A vest at 0.54 on a man who had plainly been wearing one for ten
#: seconds simply stopped existing, and he was accused of not wearing it.
#: 15.1% of the measured summary changes were a gear score crossing 0.55 and
#: nothing else happening.
#:
#: Gear boxes by score, measured over both demo clips at 5fps:
#:
#:     0.145-0.40   helmet 37 · vest 68     left exactly where they were
#:     0.40 -0.55   helmet 15 · vest 35     kept, but only for a belief that
#:                                          already stands
#:     0.55+        helmet 162 · vest 162   establishes a belief on its own
#:
#: So a third of that dead band comes back and the two thirds nearest the
#: noise floor do not. The asymmetry is the point, and it is the same one
#: ITEM_CONFIDENCE was chosen for: this bar can only ever *keep* a green tick
#: that stronger evidence already granted, never grant one. A grey sweatshirt
#: at 0.41 still makes nobody compliant, because nothing above 0.55 ever said
#: it was a vest.
ITEM_KEEP_CONFIDENCE = 0.40

#: The part of a person's box read to decide whether a helmet *could* have
#: been seen on them.
#:
#: Not the band a helmet is matched in — that is `anatomy.head_band`, which is
#: measured against real faces and is deeper. This one is Phase 2's, it is the
#: patch of picture whose brightness and sharpness decide whether a bare head
#: is a finding or a failure to look, and it is deliberately left where it was
#: measured: moving it would change which pictures can be judged, which this
#: phase is not allowed to touch.
HEAD_BAND = 0.40

#: The same, for the vest. See HEAD_BAND.
TORSO_BAND = (0.15, 0.80)

#: How much two gear detections must overlap to be one piece of gear.
#:
#: A person holds one helmet and one vest, so a second box drawn round the
#: same vest is left over — and left-over gear is now read as evidence of a
#: person nobody detected. Measured on the bench's own photograph, where the
#: detector draws two boxes round one worker's vest under dimming, blur and
#: compression: those pairs overlap at 0.69-0.70, while the genuinely
#: unheld gear on the two-worker frame overlaps what was claimed at 0.00 and
#: 0.03. The gap is twenty-fold; this sits in the middle of it, and it is the
#: same number the steadying uses for "the same person as last frame",
#: because it is the same question asked of a different box.
DUPLICATE_GEAR_IOU = 0.30

#: Smallest person, as a fraction of frame height, whose gear can be judged.
#:
#: Below this the model cannot resolve a helmet or a vest, so "nothing
#: detected" means "too small to see", not "not wearing it". On the test
#: footage a worker at 18% of frame height was flagged for no helmet and no
#: vest while visibly wearing hi-vis; the workers it judged correctly were
#: 76-79%.
#:
#: The right value depends entirely on how far the cameras are mounted, so it
#: is configurable per deployment via POST /api/ppe/config and must be tuned
#: on the client's own footage before the numbers mean anything.
DEFAULT_MIN_PERSON_HEIGHT = 0.20

#: How many sightings an accusation needs before it is reported at all.
#:
#: Missing gear is inferred from the model *not* finding any — so every
#: momentary miss reads as a breach, and a helmet whose score wanders
#: across the bar accuses the same person on and off. Measured on this
#: model, a helmet in a dim scene scores 0.56 where the bar is 0.55: not
#: wrong, just undecided, and reported as guilt. Compliance still needs no
#: waiting; only the accusation does.
ACCUSE_MIN_VOTES = 3

#: How far the sightings must favour "missing" before a settled verdict is
#: overturned into one. A bare majority is not enough to accuse; the same
#: two-to-one rule the doors use, for the same reason.
ACCUSE_MAJORITY = 2.0

#: The reasons a person's gear cannot be judged that are decided over time.
#:
#: Each of these is a measurement of one frame — how tall the box came back,
#: how sure the detector was of it, how bright and sharp a patch of picture is
#: — and each was read straight into the verdict. So a man standing still by a
#: doorway crossed in and out of "Too far to check" while nothing about him
#: changed, and the sentence changed with him: 12.1% of the 305 measured
#: summary changes were one of these five flipping with no gear detection
#: moving at all.
#:
#: They are voted on in the same per-person window as the gear, so what is
#: reported is what the last moment mostly said rather than what this frame
#: happens to say. Ties keep the previous answer, as everywhere else here.
#:
#: What is deliberately not in this list is `unreadable_reason`. That is the
#: whole picture's legibility rather than one person's, it is Phase 2's third
#: state, and a camera that has just gone dark has to say so on the frame it
#: goes dark — not two thirds of a window later, with an alert still standing
#: about a picture nobody can see.
JUDGEMENT_GATES = (
    "too_far",
    "low_confidence",
    "helmet_cropped",
    "helmet_dark",
    "vest_dark",
)

#: How close to the top of the picture a person's box may start before their
#: head is taken to be out of shot.
#:
#: A helmet is inferred from the model *not* finding one, so a head that is
#: not in the picture reads as a bare head. Waist-up framing accused somebody
#: on seven of thirty-two evenly sampled frames of the demo clip — two
#: workers filling the frame from the chest down, heads well above the top
#: edge, reported as "2 without a helmet, 2 without a vest".
#:
#: "Touching" has to mean touching, not near: this is a fraction of frame
#: height so it survives whatever resolution the camera runs at, and it was
#: chosen from the gap between the two populations, measured on real footage.
#:
#:     genuinely head-out-of-shot   y1 = 0.0px (720p) · 0.0-2.6px (480p)
#:     head plainly in shot         4.9px = 1.03% of height (cctv_demo f49)
#:                                  8.7px = 1.81% (check_photo, left worker)
#:
#: 0.5% is 2.4px at 480 and 3.6px at 720 — inside the detector's own
#: quantisation of a box that starts at row zero, and nowhere near the
#: nearest person whose head really is in the picture.
TOP_EDGE_FRACTION = 0.005

# Annotation colours, BGR.
COLOR_OK = (0, 170, 0)
COLOR_VIOLATION = (0, 0, 220)
COLOR_UNKNOWN = (140, 140, 140)
#: Half-checked: one item confirmed, the other unjudgeable. Amber, because it
#: is neither the green that says we looked and it is fine nor the red that
#: says we looked and it is not.
COLOR_PARTIAL = (0, 170, 220)



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


class PPEService(BaseMonitoringService):
    """Checks that each person visible is wearing a helmet and a safety vest."""

    module_id = "ppe"
    name = "Safety Gear"
    description = "The AI checks that helmets and safety vests are being worn."

    def __init__(self) -> None:
        # Set before super().__init__(), which builds the initial result and
        # therefore reads this state.
        self._model = None
        self._load_failed = False
        self._min_person_height = DEFAULT_MIN_PERSON_HEIGHT

        # Per-person observation history for the steady verdicts; see
        # _steady(). Session copies get their own in reset_session_state.
        self._memory: list[dict[str, Any]] = []

        # When the recent frames arrived. The denominator of the presence
        # vote: "found in half the frames" needs to know how many there were,
        # and that is a property of the stream rather than of any one person.
        self._frames: list[float] = []

        # How many people could not be confirmed on each recent frame; see
        # _unconfirmed(). Separate from _memory because these are boxes the
        # module deliberately does not track — it is a count, not a person.
        self._doubts: list[tuple[float, int]] = []

        # How fast frames are actually arriving, and so how long a vote stays
        # recent. One per session, like the history it prunes: frames arrive
        # at one rate for the whole module, not one rate per person.
        self._cadence = Cadence(STEADY_WINDOW_SECONDS, ACCUSE_MIN_VOTES)

        super().__init__()

    def reset_session_state(self) -> None:
        self._memory = []
        self._frames = []
        self._doubts = []

        # A new instance rather than a reset: for_session() copies shallowly,
        # so until this is replaced the copy is measuring the origin's frames
        # as well as its own.
        self._cadence = Cadence(STEADY_WINDOW_SECONDS, ACCUSE_MIN_VOTES)

    def reset(self) -> None:
        super().reset()
        self._memory = []
        self._frames = []
        self._doubts = []

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
            print(f"[PPE] No model at {MODEL_PATH}; module disabled.")
            return None

        try:
            from ultralytics import YOLO

            self._model = YOLO(str(MODEL_PATH))
            print(f"[PPE] Model loaded: {self._model.names}")
        except Exception as exc:  # noqa: BLE001
            self._load_failed = True
            print(f"[PPE] Could not load model: {exc}")

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

        # Run the detector at the *person* bar, which is the lowest of the
        # three, and apply the higher bars per class below. One inference,
        # three thresholds — a missed person is not the same mistake as a
        # weakly-believed vest and must not share a number with it.
        results = model(frame, verbose=False, conf=POSSIBLE_PERSON_CONFIDENCE)

        possible = 0
        people: list[dict[str, Any]] = []
        helmets: list[dict[str, Any]] = []
        vests: list[dict[str, Any]] = []
        # Gear the detector believes in too weakly to establish anything with,
        # but strongly enough to keep a belief that already stands alive. See
        # ITEM_KEEP_CONFIDENCE; these used to be dropped in silence.
        weak_helmets: list[dict[str, Any]] = []
        weak_vests: list[dict[str, Any]] = []

        names = model.names

        for result in results:
            for box in result.boxes:
                label = names[int(box.cls[0])]
                x1, y1, x2, y2 = (float(v) for v in box.xyxy[0])
                item = {
                    "box": (x1, y1, x2, y2),
                    "conf": float(box.conf[0]),
                }

                if label == "person" and item["conf"] < PERSON_CONFIDENCE:
                    # Too weak to say somebody is there, too strong to
                    # dismiss. Counted, never drawn on, never judged — the
                    # point is that the headline stops reading as an
                    # all-clear about a picture somebody has gone missing
                    # from.
                    possible += 1
                    continue

                if label == "person":
                    # Below the old flat bar the person is reported but not
                    # judged: seen well enough to say somebody is there,
                    # not well enough to accuse them of anything.
                    item["low_confidence"] = item["conf"] < CONF_THRESHOLD
                    people.append(item)
                elif label in ("helmet", "vest"):
                    strong = helmets if label == "helmet" else vests
                    weak = weak_helmets if label == "helmet" else weak_vests

                    if item["conf"] >= ITEM_CONFIDENCE:
                        strong.append(item)
                    elif item["conf"] >= ITEM_KEEP_CONFIDENCE:
                        weak.append(item)

        height, width = frame.shape[:2]

        # Once per processed frame, before anything votes — and how many
        # people there are is a vote now too, so this comes before the
        # headcount rather than after it. How long a vote is kept is decided
        # by how often they are actually arriving.
        now = time.time()
        self._cadence.tick(now)

        # Who is in the picture, as against who the detector happened to draw
        # a box round this time. `unsettled` is somebody it drew a box round
        # whose presence has not carried the vote yet — not counted, and not
        # quietly dropped either.
        people, unsettled = self._track(people, now)

        reading = read(frame, self.module_id)

        # Worked out once and handed to both halves: the same attribution
        # decides what each person is wearing and how much gear was left
        # over, and those two answers have to be the same answer.
        attribution = self._attribute(people, helmets, vests)
        *_, unclaimed = attribution

        assessments = self._assess(
            people, helmets, vests, frame, reading, attribution,
            weak_helmets, weak_vests,
        )

        assessments = self._steady(assessments, now)

        annotated = self._annotate(frame, assessments)

        result = self._summarise(
            assessments,
            reading,
            self._unconfirmed(possible + unsettled, now),
            unclaimed,
        )
        result["regions"] = self._regions(assessments, width, height)

        return annotated, self._store(result)

    def _regions(self, assessments, width, height) -> list[dict[str, Any]]:
        """The same boxes the annotation draws, for the browser to draw itself."""
        return [
            self.region(a["box"], width, height, **self._verdict(a))
            for a in assessments
        ]

    @classmethod
    def _verdict(cls, a: dict[str, Any]) -> dict[str, str]:
        """
        How one person reads on the screen: their words and their colour.

        One place, because the overlay the browser draws and the picture the
        server annotates disagreed about exactly the case this fixes — a
        person with a compliant vest and an unreadable head band was drawn
        green and labelled "Helmet + vest" in both, on the strength of the one
        item that could be seen. Half-checked has its own tone now, and it is
        never the fully-verified one.
        """
        if not cls._checkable(a):
            return {"label": cls._unchecked_label(a), "tone": "muted"}

        if cls._is_violation(a):
            missing = []
            if cls._judged(a, "helmet") and not a["helmet"]:
                missing.append("helmet")
            if cls._judged(a, "vest") and not a["vest"]:
                missing.append("vest")
            return {"label": "No " + " or ".join(missing), "tone": "danger"}

        if cls._fully_checked(a):
            return {"label": "Helmet + vest", "tone": "ok"}

        # Exactly one item confirmed worn and the other unjudgeable.
        seen, unseen = (
            ("Vest", "helmet") if cls._judged(a, "vest") else ("Helmet", "vest")
        )
        return {"label": f"{seen} OK, {unseen} not checked", "tone": "warning"}

    @staticmethod
    def _unchecked_label(a: dict[str, Any]) -> str:
        """Why nothing could be said about this person, in their own words."""
        if a.get("unreadable_reason"):
            # The whole picture, not this person: still the truest thing we
            # can say about them.
            return a["unreadable_reason"].rstrip(".")
        if a["too_far"]:
            return "Too far to check"
        if a.get("low_confidence"):
            return "Not clearly enough seen to check"
        # The band reasons before the framing one: a head out of shot only
        # explains the helmet, and if we are here the vest could not be read
        # either — that is the thing an operator can do something about.
        if a.get("helmet_dark") or a.get("vest_dark"):
            return (a.get("vest_reason") or a.get("helmet_reason")).rstrip(".")
        if a.get("helmet_cropped"):
            return "Head out of shot"
        return "Not checked yet"

    # ------------------------------------------------------------------
    # Presence
    # ------------------------------------------------------------------

    @staticmethod
    def _new_track(person: dict[str, Any]) -> dict[str, Any]:
        """
        A person's history, the first time they are seen.

        The gear beliefs start at False rather than at this frame's answer,
        which reads like a change and is not one: on a track's first frame the
        vote list holds exactly one vote, so a helmet found grants the belief
        through the ordinary majority on the same frame, and a helmet not
        found leaves it where it started. The two routes were checked against
        each other before this was written down.
        """
        return {
            "box": person["box"],
            "conf": person["conf"],
            "low_confidence": bool(person.get("low_confidence")),
            # When this person was found, and what was found about them.
            # Sightings decide whether they are here at all; votes decide what
            # they are wearing and whether that can be judged. Different
            # windows, so different lists.
            "seen": [],
            "votes": [],
            "last_seen": None,
            "helmet": False,
            "vest": False,
            "gates": {},
            # Whether this person has ever been watched long enough to be
            # accused of anything. See the end of `_steady()`.
            "settled": False,
            # The last words we had for an unreadable band. `helmet_dark` is a
            # majority now and the reason is a single frame's, so the two can
            # disagree — and `_unchecked_label` dereferences the reason as
            # soon as the flag is up. Kept so the flag always has words.
            "helmet_reason": None,
            "vest_reason": None,
            "present": False,
        }

    def _track(
        self, people: list[dict[str, Any]], now: float
    ) -> tuple[list[dict[str, Any]], int]:
        """
        Who is in the picture, rather than who the detector drew a box round.

        A person counts as present when they were found in PRESENCE_FRACTION
        of the frames of the last PRESENCE_WINDOW_SECONDS. That cuts both
        ways, and both ways are the point: somebody the detector loses for a
        moment stays counted and keeps their box, and a box that appears for
        one frame does not become a person.

        People are matched to their history by the same overlap rule
        `_steady()` has always used, on the same `self._memory`, because there
        is one question here — is this the person we were looking at? — and
        two answers to it would disagree the moment a stream got difficult.
        The matched history is handed on in the person's own dict, so the
        match is made once rather than made again downstream and hoped to
        agree.

        Returns ``(people, unsettled)``: everybody present — those the
        detector found this frame, plus those it did not with their last known
        box — and how many boxes it drew this frame that the vote has not
        seated yet. Those are handed to the caller as *possible* people rather
        than dropped — see PRESENCE_FRACTION. Nobody disappears quietly from
        this module; that is the whole history of the file above.

        `unsettled` is this frame's count and is not steady on its own. It is
        not meant to be: `_unconfirmed()` holds it, along with every other
        person the module cannot confirm, so there is one answer to "how many
        might be here" rather than two that disagree.
        """
        self._frames.append(now)
        self._frames = [
            t for t in self._frames if now - t <= PRESENCE_WINDOW_SECONDS
        ]

        taken: set[int] = set()

        for person in people:
            best, best_iou = None, STEADY_MATCH_IOU

            for index, entry in enumerate(self._memory):
                if index in taken:
                    continue
                overlap = _iou(person["box"], entry["box"])
                if overlap >= best_iou:
                    best, best_iou = index, overlap

            if best is None:
                self._memory.append(self._new_track(person))
                best = len(self._memory) - 1

            taken.add(best)

            entry = self._memory[best]
            entry["box"] = person["box"]
            entry["conf"] = person["conf"]
            entry["low_confidence"] = bool(person.get("low_confidence"))
            entry["last_seen"] = now
            entry["seen"].append(now)

            person["track"] = entry

        frames = len(self._frames)

        # The shortest span this module decides anything over, on this link.
        # A track younger than that is judged against it rather than against
        # its own handful of frames — see below.
        settling = sum(1 for t in self._frames if now - t <= self._cadence.window)

        for entry in self._memory:
            entry["seen"] = [
                t for t in entry["seen"] if now - t <= PRESENCE_WINDOW_SECONDS
            ]

            # Out of how many frames. For anybody who has been here a while
            # that is the whole window, and the arithmetic in
            # PRESENCE_WINDOW_SECONDS is about that case: they survive an
            # absence of 1.75s and no longer.
            #
            # For somebody who has just walked in it is the frames since they
            # walked in, because the alternative is charging them for a window
            # they were not in the room for — measured, that put a violator
            # arriving into a watched scene 11 frames from their first
            # sighting to the alert, against the 8 frames the streaming probe
            # allows and the 3 the same violator takes in a fresh session. A
            # rolling filter was chosen over a fixed window precisely to not
            # pay that, and paying it here would have been the same defect in
            # a smaller place.
            #
            # Floored at `settling` so it is not a way in for noise: a box the
            # detector finds once cannot be one-for-one and therefore present,
            # and one found in a third of the frames stays out for as long as
            # it keeps that up. A person really walking in is one-for-one, so
            # they are counted halfway through that floor — 4 frames at 5fps,
            # alert on 6, inside the budget with room for the detector to miss
            # one.
            since = (
                sum(1 for t in self._frames if t >= entry["seen"][0])
                if entry["seen"]
                else frames
            )

            # A still is not a sequence: one sighting is all there will ever
            # be, and a photograph of somebody is a photograph of somebody.
            entry["present"] = self.single_frame or (
                len(entry["seen"])
                >= PRESENCE_FRACTION * min(frames, max(since, settling))
            )

        present = [p for p in people if p["track"]["present"]]
        unsettled = len(people) - len(present)

        if not self.single_frame:
            # People the detector lost this frame and the vote says are still
            # there. Their last known box, because it is the last true thing
            # we have about where they are, and an operator watching a box sit
            # still for a fifth of a second is better served than one watching
            # it blink out and the alert with it.
            present.extend(
                {
                    "box": entry["box"],
                    "conf": entry["conf"],
                    "low_confidence": entry["low_confidence"],
                    "track": entry,
                    "unseen": True,
                }
                for index, entry in enumerate(self._memory)
                if index not in taken and entry["present"]
            )

        return present, unsettled

    def _unconfirmed(self, count: int, now: float) -> int:
        """
        How many people are here that the module cannot confirm, held steady.

        Two things arrive here: a box the detector drew and was too unsure of
        to call a person at all (PERSON_CONFIDENCE), and a box it was sure
        enough of whose presence has not carried the vote yet. Both are the
        same sentence on the screen — "somebody may be here we have not
        judged" — and both were counted per frame, so both flickered.

        Held rather than voted, and that choice is the whole of it. A majority
        under-reports doubt by construction: somebody the detector half sees
        on two frames in five is, by definition, in fewer than half of them,
        so a vote would round them off the screen — and rounding a
        half-detected person off the screen is the defect this entire module
        was rewritten to stop. Holding over-reports instead, which is the safe
        direction and the one it has always erred in.

        So a doubt lives exactly as long as the evidence for a person does,
        PRESENCE_WINDOW_SECONDS, and what is reported is the most that were
        doubted at once inside it — the most at once rather than the sum,
        because two boxes a second apart are more likely one person the
        tracker split than two people, and "the fewest consistent with both"
        is how `_summarise` already reads its other headcount.

        Measured on the two demo clips at 5fps: the weak boxes alone moved
        that number 45 and 48 times a minute and the unseated sightings 124
        and 134, and with the headcount and the gear steadied this was the
        largest thing left moving the sentence. Steadying the noun and leaving
        the doubt to flicker would have been a poor trade.
        """
        if self.single_frame:
            return count

        self._doubts.append((now, count))
        self._doubts = [
            d for d in self._doubts if now - d[0] <= PRESENCE_WINDOW_SECONDS
        ]

        return max(doubted for _, doubted in self._doubts)

    def _forget(self, now: float) -> None:
        """
        Drop the histories of people who are neither here nor coming back.

        Wider than STEADY_FORGET_SECONDS on its own, because a presence vote
        cannot be counted against a history that has been thrown away: at
        PRESENCE_FRACTION the longest absence that can still count as present
        is 1.75s, which is inside the 2.0s reap only by luck, and the luck
        would run out the first time somebody tuned the fraction down.
        """
        horizon = max(STEADY_FORGET_SECONDS, PRESENCE_WINDOW_SECONDS)

        self._memory = [
            e
            for e in self._memory
            if now - (e["last_seen"] if e["last_seen"] is not None else now)
            <= horizon
        ]

    # ------------------------------------------------------------------
    # Association
    # ------------------------------------------------------------------

    @staticmethod
    def _band_reason(frame: np.ndarray, x1, x2, top, bottom) -> Optional[str]:
        """
        Why this band of the picture cannot be judged, or None if it can.

        Asked of the head band for a helmet and the torso band for a vest,
        because a face in shadow above a lit hi-vis vest is one region the
        model can read and one it cannot.

        This used to carry its own brightness and contrast constants, measured
        on this module's own footage. They are gone: one legibility test is
        asked the same question everywhere in the system, so a band that is
        too dark, too flat, too blurred or too compressed is unreadable for
        the same stated reason on every screen — and there is one set of
        numbers to argue with rather than seven.
        """
        height, width = frame.shape[:2]

        left, right = max(0, int(x1)), min(width, int(x2))
        upper, lower = max(0, int(top)), min(height, int(bottom))

        if right - left < 4 or lower - upper < 4:
            return None         # nothing to measure; judged on other grounds

        return read(frame[upper:lower, left:right], PPEService.module_id).reason

    @staticmethod
    def _unheld(
        items: list[dict[str, Any]],
        owner_of: dict[int, int],
        spare: list[int],
    ) -> list[int]:
        """
        Which leftovers are really leftovers.

        A person holds one helmet and one vest, so a second box drawn round
        gear somebody is already wearing has nowhere to go and comes back as
        unheld. That is a duplicate detection, not a second worker, and it
        must not be allowed to invent one: on the bench photograph the
        detector draws two boxes round the same vest under dimming, blur and
        compression, and without this it would have put a phantom person on
        the screen at thirteen of the bench's twenty-one quality levels. The
        fourteenth leftover on that photograph is real — at JPEG quality 5 the
        person detector finds nobody and the vest is still there at 0.871.
        """
        return [
            index
            for index in spare
            if not any(
                _iou(items[index]["box"], items[held]["box"]) >= DUPLICATE_GEAR_IOU
                for held in owner_of
            )
        ]

    @classmethod
    def _attribute(
        cls,
        people: list[dict[str, Any]],
        helmets: list[dict[str, Any]],
        vests: list[dict[str, Any]],
    ) -> tuple[dict[int, int], dict[int, int], int]:
        """
        Whose gear is whose, and how many people the leftovers imply.

        The matching itself is `anatomy.claim`, shared with the mask module
        because both modules had the same defect: an item was given to
        whichever person's box happened to contain its centre, largest box
        first, so a near person could take the gear of somebody standing in
        front of them. There is no size ordering here any more — an item goes
        to exactly one person, a person holds at most one of each item, and
        where two people's bands both contain an item the tighter band wins.

        Returns ``(helmet_of, vest_of, unclaimed)`` — the wearer of each
        helmet and each vest by item index, and the fewest people the unheld
        gear implies. Fewest, because a worker wears a helmet *and* a vest:
        when the detector loses somebody entirely both of their items are
        left over, and that is one missing person, not two.
        """
        helmet_of, spare_helmets = claim(people, helmets)
        vest_of, spare_vests = claim(people, vests, band=False)

        spare_helmets = cls._unheld(helmets, helmet_of, spare_helmets)
        spare_vests = cls._unheld(vests, vest_of, spare_vests)

        return helmet_of, vest_of, max(len(spare_helmets), len(spare_vests))

    @staticmethod
    def _kept(
        people: list[dict[str, Any]],
        weak: list[dict[str, Any]],
        held: set[int],
        *,
        band: bool,
    ) -> set[int]:
        """
        Who has a below-bar item on them that a standing belief could rest on.

        Matched separately from the established gear and after it, never
        alongside it. `claim` settles a contest on which band fits tightest
        and knows nothing about confidence, so a weak duplicate box drawn
        nearer the centre of a person's head band than their real helmet would
        have taken the helmet's place and demoted a worker who is plainly
        wearing one. Anybody already holding an established item is dropped
        here for the same reason: the second box round the same helmet is a
        duplicate, not a spare.

        The leftovers are deliberately not returned. What implies a person the
        detector merged away is gear it is *sure* of with nowhere to put it —
        that measurement is ITEM_CONFIDENCE's and DUPLICATE_GEAR_IOU's, made
        on real frames, and a 0.41 box has no business moving a headcount.
        """
        owner_of, _ = claim(people, weak, band=band)

        return {person for _, person in owner_of.items() if person not in held}

    def _assess(
        self,
        people: list[dict[str, Any]],
        helmets: list[dict[str, Any]],
        vests: list[dict[str, Any]],
        frame: np.ndarray,
        reading: Optional[Reading] = None,
        attribution: Optional[tuple[dict[int, int], dict[int, int], int]] = None,
        weak_helmets: Optional[list[dict[str, Any]]] = None,
        weak_vests: Optional[list[dict[str, Any]]] = None,
    ) -> list[dict[str, Any]]:
        """
        Decide, per person, whether they are wearing a helmet and a vest.

        `reading` is the whole picture's legibility, measured once by the
        caller. Left out, it is measured here — so a caller holding a frame
        and three lists of boxes cannot accidentally skip the gate.
        `attribution` is `_attribute`'s answer, likewise measured once by the
        caller and likewise worked out here when it is not supplied.
        `weak_helmets` and `weak_vests` are the items between
        ITEM_KEEP_CONFIDENCE and ITEM_CONFIDENCE. They are recorded per person
        and never decided here: whether one of them counts depends on what was
        already believed about that person, which is `_steady`'s to know.
        """
        height, width = frame.shape[:2]

        if reading is None:
            reading = read(frame, self.module_id)

        if attribution is None:
            attribution = self._attribute(people, helmets, vests)

        helmet_of, vest_of, _ = attribution

        weak_helmet_on = self._kept(
            people, weak_helmets or [], set(helmet_of.values()), band=True
        )
        weak_vest_on = self._kept(
            people, weak_vests or [], set(vest_of.values()), band=False
        )

        # Turned round: what each person is wearing, rather than who is
        # wearing each item.
        wears_helmet = {person: item for item, person in helmet_of.items()}
        wears_vest = {person: item for item, person in vest_of.items()}

        assessments = []

        for index, person in enumerate(people):
            x1, y1, x2, y2 = person["box"]
            box_height = max(y2 - y1, 1.0)

            head_limit = y1 + box_height * HEAD_BAND
            torso_top = y1 + box_height * TORSO_BAND[0]
            torso_bottom = y1 + box_height * TORSO_BAND[1]

            helmet_index = wears_helmet.get(index)
            vest_index = wears_vest.get(index)

            # Everyone detected and near enough is judged, wherever the
            # frame cuts them *sideways*. The edge rules that once made
            # clipped people "partly visible" refused person after person who
            # was plainly in view — webcam portraits, closeups — and were
            # removed at the operator's request. The one edge that is not a
            # matter of taste is the top: a box that starts at row zero has
            # no headroom, so the head is out of the picture and a helmet
            # cannot be looked for. That is missing evidence, not a bare head.
            too_far = box_height < height * self._min_person_height
            no_headroom = y1 <= height * TOP_EDGE_FRACTION

            # Judged per band: a helmet found is a helmet, however dark it
            # was or however the frame cut them, so everything below only
            # ever withholds an accusation.
            helmet_reason = (
                self._band_reason(frame, x1, x2, y1, head_limit)
                if helmet_index is None
                else None
            )
            vest_reason = (
                self._band_reason(frame, x1, x2, torso_top, torso_bottom)
                if vest_index is None
                else None
            )

            assessments.append(
                {
                    "box": person["box"],
                    "confidence": person["conf"],
                    "helmet": helmet_index is not None,
                    "vest": vest_index is not None,
                    # A below-bar item sitting on them. Evidence, not a
                    # verdict: `_steady` decides whether it counts, because
                    # only it knows what was already believed.
                    "helmet_weak": index in weak_helmet_on,
                    "vest_weak": index in weak_vest_on,
                    "too_far": too_far,
                    "low_confidence": bool(person.get("low_confidence")),
                    "helmet_cropped": helmet_index is None and no_headroom,
                    "helmet_dark": helmet_reason is not None,
                    "vest_dark": vest_reason is not None,
                    "helmet_reason": helmet_reason,
                    "vest_reason": vest_reason,
                    # Whether the picture as a whole could be judged. Kept per
                    # person so every rule downstream asks one question.
                    "unreadable_reason": None if reading.readable else reading.reason,
                    # This person's own history, matched once in `_track()`,
                    # and whether the detector actually found them this frame
                    # or the presence vote is holding them here.
                    "track": person.get("track"),
                    "unseen": bool(person.get("unseen")),
                }
            )

        return assessments

    def _steady(
        self, assessments: list[dict[str, Any]], now: float
    ) -> list[dict[str, Any]]:
        """
        Replace each person's per-frame verdict with the settled one.

        People are matched to their own recent history by overlap, votes
        older than the window are dropped, and the reported answer is the
        majority of what remains — a tie keeps the previous answer. One
        frame of noise can no longer flip the screen; a real change carries
        the vote within the window.

        One history, one person, within a frame. Two people can overlap
        enough to look like one across time — the reported nested pair score
        0.346 against a 0.3 bar — and sharing a history hands the nearer
        person's verdict to the further one a frame later, which is the very
        attribution this phase took away from them. The same exclusivity the
        claim rule uses, for the same reason.

        How long a vote survives is the one thing here that is not fixed: it
        is STEADY_WINDOW_SECONDS while frames arrive as fast as that assumed,
        and as wide as the measured cadence needs when they do not. How many
        sightings an accusation takes, and how one-sided, are the same on any
        link.

        Three things vote now rather than one. The gear, as it always did; the
        reasons the gear could not be judged, which were a single frame's
        measurement of a box height or a patch of brightness and flipped the
        sentence with no detection moving (see JUDGEMENT_GATES); and, before
        either, whether the person is there at all, which `_track()` decides
        and this method only reads. Somebody the presence vote is holding here
        casts no vote of their own — the detector did not find them, and
        "not found" is not evidence of a bare head. Their verdict is frozen at
        what was actually seen and decays honestly as those sightings expire.
        """
        taken: set[int] = set()

        # What counts as recent, on this frame. Read once so every person in
        # the frame is judged over the same moment.
        window = self._cadence.window

        for a in assessments:
            best = a.get("track")

            if best is None:
                # Nothing tracked this person for us. `process()` always
                # does; a caller assembling assessments by hand does not, and
                # this module's own bench is full of them.
                best, best_iou = None, STEADY_MATCH_IOU

                for index, entry in enumerate(self._memory):
                    if index in taken or entry["last_seen"] == now:
                        continue
                    overlap = _iou(a["box"], entry["box"])
                    if overlap >= best_iou:
                        best, best_iou = index, overlap

                if best is None:
                    self._memory.append(
                        self._new_track(
                            {
                                "box": a["box"],
                                "conf": a.get("confidence"),
                                "low_confidence": a.get("low_confidence"),
                            }
                        )
                    )
                    best = len(self._memory) - 1

                taken.add(best)
                best = self._memory[best]
                best["box"] = a["box"]
                best["last_seen"] = now
                best["seen"].append(now)

            # A piece of gear below ITEM_CONFIDENCE counts only where the
            # belief it would support is already standing. A new one still
            # has to be established at the full bar — this can keep a green
            # tick alive, never grant one. See ITEM_KEEP_CONFIDENCE.
            worn = {
                item: a[item] or (a.get(f"{item}_weak", False) and best[item])
                for item in ("helmet", "vest")
            }

            for item in ("helmet", "vest"):
                # A helmet found is a helmet, however dark the band it was
                # found in — the rule the established bar has always had,
                # extended to the box this frame kept below it. Without this a
                # worker whose vest is read at 0.48 in a dim bay is believed
                # to be wearing it and reported as unchecked in the same
                # breath.
                if worn[item] and a.get(f"{item}_weak", False):
                    a[f"{item}_dark"] = False
                    a[f"{item}_reason"] = None
                    if item == "helmet":
                        # And a helmet found on somebody is a helmet whether
                        # or not their head has room above it in the frame.
                        a["helmet_cropped"] = False

                if a[f"{item}_reason"] is not None:
                    best[f"{item}_reason"] = a[f"{item}_reason"]

            if not a.get("unseen"):
                best["votes"].append(
                    (
                        now,
                        {
                            **worn,
                            **{gate: a[gate] for gate in JUDGEMENT_GATES},
                        },
                    )
                )

            best["votes"] = [v for v in best["votes"] if now - v[0] <= window]

            for item in ("helmet", "vest"):
                yes = sum(1 for _, vote in best["votes"] if vote[item])
                missing = len(best["votes"]) - yes

                if best[item]:
                    # Taking gear away from somebody is an accusation, and
                    # needs more than the bare majority that granting it
                    # does. A helmet scoring either side of the bar in a dim
                    # bay produced exactly the alternating verdict this
                    # refuses to follow.
                    if missing >= ACCUSE_MIN_VOTES and missing >= yes * ACCUSE_MAJORITY:
                        best[item] = False
                elif yes > missing:
                    best[item] = True

                a[item] = best[item]

            if not self.single_frame:
                for gate in JUDGEMENT_GATES:
                    raised = sum(1 for _, vote in best["votes"] if vote[gate])

                    # A plain majority either way, and a tie keeps the last
                    # answer. Not the two-to-one an accusation needs: these
                    # only ever *withhold* a verdict, so being slow to raise
                    # one costs somebody an accusation they had coming and
                    # being slow to lower one costs an operator a moment of
                    # "not checked" — and the first of those is the one that
                    # hurts.
                    if raised * 2 != len(best["votes"]):
                        best["gates"][gate] = raised * 2 > len(best["votes"])

                    a[gate] = best["gates"].get(gate, a[gate])

                for item in ("helmet", "vest"):
                    # The flag is a majority and the words are one frame's, so
                    # a gate can stand on a frame that has nothing to say
                    # about why. `_unchecked_label` dereferences the reason as
                    # soon as the flag is up, and it must find words there.
                    if a[f"{item}_dark"] and a[f"{item}_reason"] is None:
                        a[f"{item}_reason"] = best[f"{item}_reason"]

            # Nobody is accused on the strength of their first moment in
            # frame. Compliance needs no such wait — only the accusation.
            #
            # Reached once, it holds for as long as the person does. The vote
            # window is 1.5s and the presence window is 3.5s, so a person the
            # detector blinks past keeps their place in the picture and loses
            # the sightings that justified their verdict, and the screen went
            # from "1 without a helmet" to "not checked yet" and back about a
            # man standing still — 50 changes a minute of it, measured, and
            # the largest thing left moving the sentence once the headcount
            # was steady. Nothing is un-known by not being looked at again:
            # the belief cannot change without votes to change it, and when
            # the sightings run out altogether the presence vote drops them
            # from the picture and this goes with it.
            if len(best["votes"]) >= ACCUSE_MIN_VOTES:
                best["settled"] = True

            a["settled"] = self.single_frame or best["settled"]

        self._forget(now)

        return assessments

    # ------------------------------------------------------------------
    # Reporting
    # ------------------------------------------------------------------

    @staticmethod
    def _judged(a: dict[str, Any], item: str) -> bool:
        """
        Whether this one item can be judged on this person.

        Six ways it cannot: the picture as a whole cannot be read, the
        detector is only half sure this is a person at all, they are too small
        for the model to resolve gear on, their head is outside the picture,
        the band where the item belongs is unreadable, or we have not watched
        them long enough to accuse anybody of anything. Each is missing
        evidence rather than a breach, and flagging them is what makes
        operators stop trusting a system.
        """
        return (
            a.get("unreadable_reason") is None
            and not a.get("low_confidence", False)
            and not a["too_far"]
            and not (item == "helmet" and a.get("helmet_cropped", False))
            and not a.get(f"{item}_dark", False)
            and a.get("settled", True)
        )

    @classmethod
    def _checkable(cls, a: dict[str, Any]) -> bool:
        """Whether anything at all can be said about this person's gear."""
        return cls._judged(a, "helmet") or cls._judged(a, "vest")

    @classmethod
    def _fully_checked(cls, a: dict[str, Any]) -> bool:
        """Whether both items were judged — the only route to the green tick."""
        return cls._judged(a, "helmet") and cls._judged(a, "vest")

    @classmethod
    def _is_violation(cls, a: dict[str, Any]) -> bool:
        """A violation is gear missing where its absence could be seen."""
        return (cls._judged(a, "helmet") and not a["helmet"]) or (
            cls._judged(a, "vest") and not a["vest"]
        )

    @classmethod
    def _unverified(cls, a: dict[str, Any]) -> bool:
        """
        Somebody in the picture we did not reach a verdict on.

        Not accused, and not cleared either. Counting these was the whole
        point of the phase: a person the detector half saw, a person too far
        off, a head in shadow, a torso out of shot — each of them used to
        leave the screen reading exactly as it does when everybody present is
        wearing everything they should.
        """
        return not cls._is_violation(a) and not cls._fully_checked(a)

    @staticmethod
    def _people(count: int) -> str:
        return "1 person" if count == 1 else f"{count} people"

    def _summarise(
        self,
        assessments: list[dict[str, Any]],
        reading: Optional[Reading] = None,
        possible: int = 0,
        unclaimed: int = 0,
    ) -> dict[str, Any]:
        total = len(assessments)

        readable = reading is None or reading.readable
        reason = None if readable else reading.reason

        # People the picture implies and never showed us. `possible` is a box
        # the detector drew and was too unsure of to call a person;
        # `unclaimed` is gear nobody in the picture could be holding. Both say
        # "there may be somebody here we did not judge", and on the frame this
        # was measured on they are the same worker — so they are not added
        # together. What is reported is the fewest people consistent with
        # both, and only the part of it the weak boxes do not already explain
        # is called out separately.
        extra = max(0, unclaimed - possible)

        assessable = [a for a in assessments if self._checkable(a)]
        violations = [a for a in assessments if self._is_violation(a)]
        unverified = [a for a in assessments if self._unverified(a)]

        no_helmet = [
            a for a in assessments if self._judged(a, "helmet") and not a["helmet"]
        ]
        no_vest = [
            a for a in assessments if self._judged(a, "vest") and not a["vest"]
        ]

        compliant = len(assessable) - len(violations)

        rate = round(compliant / len(assessable) * 100) if assessable else None

        if not readable:
            # The one sentence that must never be "Wearing the right gear".
            # An unjudgeable picture says so, and says how many people were
            # standing in it while it could not be judged.
            summary = reason.rstrip(".")
            if total:
                summary += f" — {self._people(total)} unverified"
        elif not total:
            # Gear the model is sure of, and nobody in the picture to put it
            # on. "Nobody in view" is the sentence this module says about an
            # empty and therefore safe yard, and a helmet lying in it is not
            # that.
            summary = (
                "Gear in view, but nobody detected — verify headcount"
                if extra
                else "Nobody in view"
            )
        elif violations:
            missing = []
            if no_helmet:
                missing.append(
                    f"{len(no_helmet)} without a helmet"
                )
            if no_vest:
                missing.append(f"{len(no_vest)} without a vest")
            summary = ", ".join(missing)
        elif not assessable:
            summary = (
                "People in view, but too far away to check"
                if all(a["too_far"] for a in assessments)
                else f"{self._people(total)} in view, none could be checked"
            )
        else:
            # Half-checked people get their own sentence, never the green
            # one. A vest confirmed above an unreadable head band is not a
            # worker in the right gear; it is a worker we looked at once.
            partial = [a for a in assessable if not self._fully_checked(a)]

            if partial:
                summary = self._partly_checked_summary(partial, len(assessable))
            else:
                summary = (
                    "Everyone is wearing the right gear"
                    if len(assessable) > 1
                    else "Wearing the right gear"
                )

            # People nobody could say anything about at all, on top of the
            # half-checked ones already named in the sentence.
            others = len(unverified) - len(partial) + possible
            if others > 0:
                summary += f" — {self._people(others)} unverified"

        # A helmet at 0.829 with no head to put it on used to be dropped in
        # silence, and the screen read "1 person, wearing the right gear"
        # about a frame with two workers in it. It is a question about the
        # headcount rather than an accusation, so it never raises the alert —
        # but it does stop the sentence being an all-clear.
        if extra and total:
            summary += (
                " — possible additional person, verify headcount"
                if extra == 1
                else f" — {extra} possible additional people, verify headcount"
            )

        return {
            # Gear nobody could be holding is not a breach — nobody has been
            # shown doing anything wrong — so it never raises the alert. It
            # does take the verdict out of "clear", because a headcount we
            # cannot make add up is precisely somebody we could not judge.
            "alert": bool(violations) and readable,
            "status": (
                "unverified" if not readable
                else "alert" if violations
                else "unverified" if unverified or possible or extra
                else "idle" if not total
                else "clear"
            ),
            "summary": summary,
            # Whether this picture could be judged at all, and how many people
            # were standing in it either way. PHASE2_CONTRACT §2.
            "readable": readable,
            "unreadable_reason": reason,
            # Plus anybody the model could only half-see, and anybody its own
            # gear detections say is there when its person detections do not.
            # They are the whole point: without them the headline reads
            # "Wearing the right gear" about a picture the violator has
            # quietly dropped out of.
            "people_unverified": len(unverified) + possible + extra,
            # People implied only by gear nobody could be holding. Reported
            # apart from the rest because the operator's answer to it is
            # different: not "improve the picture", but "count the workers".
            "people_unaccounted": extra,
            "detections": [
                {
                    "helmet": a["helmet"],
                    "vest": a["vest"],
                    "checked": self._checkable(a),
                }
                for a in assessments
            ],
            "people_total": total,
            "people_checked": len(assessable),
            "people_not_checked": total - len(assessable),
            "people_too_far": len([a for a in assessments if a["too_far"]]),
            # A helmet the model actually found is evidence in its own right,
            # not an inference from an absence — so unlike every count below
            # it, this one is not withheld when the picture is hard to read.
            # The gates exist to stop accusations, and there is nothing here
            # to accuse anybody of.
            "wearing_helmet": len([a for a in assessments if a["helmet"]]),
            "missing_helmet": len(no_helmet),
            "wearing_vest": len([a for a in assessments if a["vest"]]),
            "missing_vest": len(no_vest),
            # People whose gear went unjudged because the light was against
            # us, kept apart from those simply too far away.
            "people_too_dark": len(
                [
                    a
                    for a in assessments
                    if not a["too_far"]
                    and (a.get("helmet_dark") or a.get("vest_dark"))
                ]
            ),
            "violations": len(violations) if readable else 0,
            "compliance_rate": rate,
        }

    @classmethod
    def _partly_checked_summary(
        cls, partial: list[dict[str, Any]], assessable: int
    ) -> str:
        """The sentence for people only half of whom could be looked at."""
        if assessable == 1:
            a = partial[0]
            seen, unseen = (
                ("Vest", "helmet") if cls._judged(a, "vest") else ("Helmet", "vest")
            )
            return f"{seen} OK, {unseen} not checked"

        return f"{len(partial)} of {assessable} only partly checked"

    def events(self, result: dict[str, Any]) -> list[dict[str, Any]]:
        """
        Helmets and vests recorded apart.

        A site that keeps forgetting vests has a different problem from one
        that keeps forgetting helmets, and one key covering both would hide
        which. Kept separate so the report can say which.
        """
        found = []

        for item, missing in (
            ("helmet", result.get("missing_helmet", 0)),
            ("vest", result.get("missing_vest", 0)),
        ):
            if not missing:
                continue

            found.append(
                {
                    "key": f"no-{item}",
                    "severity": "medium",
                    "summary": (
                        f"Someone working without a {item}"
                        if missing == 1
                        else f"{missing} people working without a {item}"
                    ),
                    "details": {
                        "item": item,
                        "people_affected": missing,
                        "people_checked": result.get("people_checked", 0),
                        "people_in_view": result.get("people_total", 0),
                    },
                }
            )

        return found

    def empty_result(self) -> dict[str, Any]:
        result = super().empty_result()
        result.update(
            {
                # Checks the file rather than calling is_ready(), so building
                # the initial result does not force the model to load.
                "summary": (
                    "Nobody in view"
                    if MODEL_PATH.exists()
                    else "Safety gear checking is not available"
                ),
                # Always present, whether or not anything has been analysed:
                # a screen that has to test for the key cannot tell a missing
                # answer from a confident one. PHASE2_CONTRACT §2.
                "readable": True,
                "unreadable_reason": None,
                "people_unverified": 0,
                "people_unaccounted": 0,
                "people_total": 0,
                "people_checked": 0,
                "people_not_checked": 0,
                "people_too_far": 0,
                "people_too_dark": 0,
                "wearing_helmet": 0,
                "missing_helmet": 0,
                "wearing_vest": 0,
                "missing_vest": 0,
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
        Set how small a person may be before their gear is judged.

        Args:
            payload: ``{"min_person_height": 0.0-1.0}`` as a fraction of frame
                height. Lower values check people further away, at the cost of
                more false alarms; higher values check only those close enough
                for the model to resolve gear on.
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
        Draw one box per person, labelled with what is missing.

        Individual helmet and vest boxes are deliberately not drawn: the
        operator needs to see who is at risk, not every detection the model
        made.

        The words and the colour come from `_verdict()`, the same place the
        browser's overlay gets them, so the painted picture and the drawn one
        can no longer disagree about who is fine.
        """
        annotated = frame.copy()

        tones = {
            "muted": COLOR_UNKNOWN,
            "danger": COLOR_VIOLATION,
            "warning": COLOR_PARTIAL,
            "ok": COLOR_OK,
        }

        for a in assessments:
            x1, y1, x2, y2 = (int(v) for v in a["box"])

            verdict = self._verdict(a)
            label = verdict["label"]
            colour = tones[verdict["tone"]]

            cv2.rectangle(annotated, (x1, y1), (x2, y2), colour, 2)

            # Filled strip behind the text, so it stays readable against a
            # bright floor or dark machinery.
            (tw, th), _ = cv2.getTextSize(
                label, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2
            )
            top = max(y1 - th - 10, 0)

            cv2.rectangle(
                annotated, (x1, top), (x1 + tw + 10, top + th + 10), colour, -1
            )
            cv2.putText(
                annotated,
                label,
                (x1 + 5, top + th + 3),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.55,
                (255, 255, 255),
                2,
            )

        return annotated


service = PPEService()
