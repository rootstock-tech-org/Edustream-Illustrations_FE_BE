"""
Absence from a workstation.

Every other capability here asks whether something unwanted is present. This
one asks whether something wanted is *missing*, which sounds like the same
question and is not: presence is evidence, absence is the lack of it, and
the lack of evidence is also what a dropped frame, a turned back and an
occluded view produce. So absence is only ever reported after it has
persisted for a while — the allowance below — rather than the moment a
person stops being detected; a workstation somebody was seen at goes on
counting as occupied for a few seconds after the detector loses them, for
the same reason; and none of it is reported at all out of a picture nobody
could have seen anyone in: see the two ways of being unwatchable, below.

No new model. Person detection is the one thing nearly every model in this
system already does, so this reuses the segmentation model the restricted
zone runs: the same weights, already in memory, asked only for people.

The operator marks each workstation and names it, exactly as they mark
doorways, because there is no way to guess where a workstation is — a desk,
a packing bench and a machine station look nothing alike.
"""

import time
from typing import Any, Optional

import cv2
import numpy as np

from app.core.validate import positive
from app.modules.base import BaseMonitoringService
from app.vision.legibility import read
from app.vision.obstruction import is_obstructed
from app.vision.named_regions import MIN_SIZE
from app.vision.workstation_regions import MAX_EMPTY_SECONDS, workstation_regions

#: Confidence a detection needs before it is even considered.
#:
#: The same bar the restricted zone uses. Deliberately not lower: a weak
#: detection keeping a workstation "occupied" would be the failure that
#: matters here, because it silences an alert rather than raising one.
CONF_THRESHOLD = 0.45

#: Share of the picture above which a detection is making a large claim.
#:
#: Attendance is the one verdict in this system where a *false* detection
#: silences the alarm, so the evidence required scales with the size of the
#: claim. A figure taking up half the view is either somebody right at the
#: camera or something covering the lens, and those two have to be told
#: apart before either is called attendance.
LARGE_CLAIM = 0.40

#: Confidence a large detection needs before it counts as a person.
#:
#: Measured rather than picked. Across site footage, an office desk and a
#: two-person close-up, every genuine person filling a good part of the
#: frame was detected at 0.85-0.91. A palm-sized blob of skin filling the
#: whole view — the failure that prompted this — came in at 0.47-0.48. The
#: bar sits in the open water between them, so a person standing at the
#: camera still counts and a lens obstruction does not.
#:
#: A pose model was tried first, on the theory that a real person shows
#: shoulders and a head where a hand shows none. It was dropped after
#: measurement: on the same skin blob the pose model happily reported a
#: nose, both eyes, an ear and a shoulder. Structure can be hallucinated;
#: the detector's own confidence could not be talked into it.
STRONG_CLAIM_CONF = 0.75

#: A workstation is judged unwatchable from the picture itself rather than
#: from what the detector claims — see app/vision/obstruction.py. The person
#: holding a hand over the lens really is standing there, so no amount of
#: interrogating the detector answers the question that matters: whether the
#: camera can see the workstation.
#:
#: There are two ways for that answer to be no, and they are kept apart:
#:
#:   blocked      something is against the lens over *this* workstation. The
#:                room next to it may be perfectly visible, so it is asked per
#:                marked area — see app/vision/obstruction.py.
#:   unreadable   the whole picture is outside the range where anybody has
#:                been shown to be detectable — too dark, too flat, too
#:                blurred, too compressed. It is asked once of the frame —
#:                see app/vision/legibility.py.
#:
#: They have the same consequence and different words. Both stop the module
#: claiming anything about who is present, and both hold the absence clock,
#: because time nobody could watch is not time somebody was away. What the
#: operator is told differs, and that is the point: "a hand over the camera"
#: and "this room is too dark to see anyone in" need different actions, and
#: dimness used to be reported as the first of those. It is now the second.

#: How long a workstation may be empty before it is reported, in seconds.
#:
#: Somebody reaching for a tool, turning to a colleague or stepping out of
#: frame for a moment has not abandoned their post, and a system that says
#: so is one an operator learns to ignore. Ten seconds is long enough to
#: cover the ordinary interruptions and short enough to see in a demo; it is
#: adjustable here and per workstation, because a packing bench and a
#: night-shift desk do not deserve the same allowance.
#:
#: The allowance is counted from the moment the module stops believing
#: somebody is there, which is PRESENCE_GRACE_SECONDS after the last time it
#: saw them — so the real time from an operator walking away to the alert is
#: the two added together. See below.
DEFAULT_EMPTY_SECONDS = 10.0

#: How long a workstation goes on counting as occupied after the last frame
#: somebody was actually seen at it, in seconds.
#:
#: Presence used to be decided frame by frame, and the detector is not steady
#: frame to frame. On 375 frames of an ordinary office desk with somebody
#: confirmed seated at it the whole time — legs and torso behind the desk,
#: head and shoulders showing — this module said "empty" on 109 of them,
#: 29.1%, in ten runs:
#:
#:     3.53s   2.47s   0.60s   0.27s   and six single frames
#:
#: Not one of those was the geometry turning somebody away. At the production
#: bar the detector had nothing to say about the desk at all, while on 103 of
#: the 109 a box on that same seated person sat just underneath it, at 0.14 to
#: 0.45. So the answer is not to start believing weaker evidence — see
#: CONF_THRESHOLD for why that is the one direction this module must not go —
#: but to stop asking the question afresh every frame. Somebody who was there
#: a moment ago is still there until there is some reason to think otherwise.
#:
#: Four seconds clears the longest measured run by 13%, and the rest of the
#: distribution several times over. Held in seconds rather than in a count of
#: frames because what is being covered is a person sitting still for three
#: and a half seconds — a duration. Frames are not ours to count: the browser
#: pushes them at whatever rate it manages, and the same run is 18 frames at
#: 5fps and 106 at 30.
#:
#: This is paid for, and the price is the thing to watch. A workstation
#: somebody really has left is now reported four seconds later than it was —
#: 13.93s rather than 10.00s at the default allowance, timed to the frame —
#: because the empty clock does not start until the belief runs out. The trade
#: runs both ways and the distribution above is where to read it: two seconds
#: would cover eight of the ten runs and leave the two longest still reporting
#: an empty desk, while eight would take eighteen seconds to notice a bench
#: somebody really had abandoned.
#:
#: A workstation nobody has ever been seen at is not covered by any of this
#: and is empty from the first frame, which is also what makes a single
#: photograph read the same as it always did.
PRESENCE_GRACE_SECONDS = 4.0

#: The longest allowance an operator may set is MAX_EMPTY_SECONDS, imported
#: above. It is defined next to the per-workstation override it also caps —
#: see app/vision/workstation_regions.py — so there is one number rather than
#: two that can drift apart.

#: Multiples of the threshold at which severity escalates.
ESCALATE_AT = (1.0, 4.0, 10.0)

#: Whether somebody is at a workstation is asked as two questions about
#: where that person *is*, rather than about how much of the area they
#: happen to cover.
#:
#: The difference matters more than it sounds. The first attempt asked what
#: share of the marked area a person's box overlapped, and on real site
#: footage that made almost every small area permanently occupied: a worker
#: walking past a bench has a tall box that clips a good part of it without
#: ever being at it. Every such mistake *silences* an absence alarm, which
#: is the failure this module exists to avoid.
#:
#: So both tests are points, not areas, and neither scales with how big or
#: small the operator drew the box:
#:
#:   their feet   the middle of the bottom of their box, where they meet the
#:                floor — the honest test for somebody standing at a bench.
#:   their body   the centre of their box, which covers somebody seated
#:                whose legs are hidden under a desk and whose box therefore
#:                stops above the floor.
#:
#: Somebody merely passing in front satisfies neither — as long as the second
#: test is bounded, which it was not, and that was WS-01. See SCALE_RATIO.

#: How much taller than a marked area a detection may be and still be judged
#: to be *at* it rather than in front of it.
#:
#: The two tests above are not equally trustworthy, and the difference is the
#: whole of this constant. Feet inside the area is evidence: that is where
#: this person meets the floor, so that is the depth they are standing at,
#: whatever size they happen to appear. A body centre inside the area is a
#: proxy — it stands in for a seated person whose legs the desk hides — and a
#: proxy can be satisfied by coincidence. On real footage a worker filling
#: nearly the whole frame, box (269,31,512,479), has their body centre at
#: y=255, so a workstation marked anywhere across that band was reported
#: occupied by somebody metres in front of it. Every such mistake silences an
#: absence alarm, which is the failure this module exists to avoid.
#:
#: The picture is flat and cannot be asked about depth directly, but apparent
#: size falls with distance: a person at the area's own depth appears at the
#: area's own scale, and one much larger than it is much closer than it. The
#: restricted zone reached the same conclusion and carries its own SCALE_RATIO
#: — the same idea, on its own number, because a doorway and a desk are not
#: the same shape.
#:
#: Both populations were measured rather than assumed:
#:
#:   present   the seated worker on doorcam.y4m, under six ways an operator
#:             might draw that one desk. Every detection the body-centre test
#:             carried measured 1.76 to 2.31 times the marked area's height
#:             (n=65). The feet test carried the rest, from 0.28 to 2.31
#:             (n=1125).
#:   passing   the near worker above, against the report's background desk:
#:             7.47 times its height.
#:
#: Three sits in the open water between them: 30% clear of the tallest person
#: genuinely at a desk, and well under half the reported passer-by. It also
#: turns that same passer-by away from a background desk drawn twice as tall
#: (3.73). It does not turn them away from one drawn across 45% of the frame
#: (2.07) — and no scale test could, because an area that large really does
#: contain them.
#:
#: Measured on height where the restricted zone measures area, and that is
#: deliberate. A doorway's width is fixed by the doorway; a workstation's is
#: the operator's choice of how many benches to take in, so an area ratio
#: would move with a decision that says nothing about how far away anything
#: is. Height in the picture is what perspective fixes for a real object of a
#: given size, which is the question being asked.
SCALE_RATIO = 3.0

COLOR_OCCUPIED = (0, 170, 0)
COLOR_EMPTY = (0, 170, 220)
COLOR_ALERT = (0, 0, 220)
COLOR_UNKNOWN = (140, 140, 140)


#: How much presence history each workstation keeps, for the page's graphs.
#:
#: Half an hour: long enough that a shift handover can see the pattern of the
#: last stretch, short enough that the payload stays a few kilobytes. History
#: is memory only, per session, and starts when watching starts — the same
#: lifetime as every other live figure on the page.
PRESENCE_HISTORY_SECONDS = 1800.0

#: Frames further apart than this are a hole in the record, not a stretch of
#: whatever state happened to come next. The gap is drawn as "not watched" —
#: this module's oldest rule, applied to its own history: time nobody could
#: watch is never reported as time somebody was there, nor as time they were
#: away.
PRESENCE_GAP_SECONDS = 5.0

#: Hard cap on stored segments per workstation, against pathological flicker.
#: At the 3-second poll a full half hour is ~600 samples that merge into far
#: fewer segments; 800 is comfortably beyond anything real.
PRESENCE_MAX_SEGMENTS = 800


class WorkstationService(BaseMonitoringService):
    """Watches marked workstations and reports any left unattended."""

    module_id = "workstation"
    name = "Workstation Absence"
    description = (
        "The AI watches each marked workstation and alerts when nobody is there."
    )

    def __init__(self) -> None:
        self._empty_seconds = DEFAULT_EMPTY_SECONDS

        # region id -> {"empty_since": float|None, "people": int, "seen": float}
        self._watched: dict[int, dict[str, Any]] = {}

        # region id -> [{"state": "manned"|"empty"|"unwatched",
        #                "from": t, "to": t}, ...] — the presence record the
        # page draws. Same clock as everything else here, bounded, and per
        # session like the timers beside it.
        self._presence: dict[int, list[dict[str, Any]]] = {}

        # Frames pushed from a browser belong to the operator's own camera;
        # the registered singleton watches whatever the server captured.
        self._browser_camera = False

        super().__init__()

    def reset(self) -> None:
        """Forget every timer. The marked areas themselves are untouched."""
        super().reset()
        self._watched = {}
        self._presence = {}

    def reset_session_state(self) -> None:
        self._watched = {}
        self._presence = {}
        self._browser_camera = True

    def _source(self):
        """Which camera's marked workstations apply to the frames analysed."""
        if self._browser_camera:
            return "browser"

        # Imported here: app.camera reaches back into the vision package, and
        # taking the dependency at module scope closes the loop.
        from app.camera import camera_manager

        return camera_manager.current_source

    @staticmethod
    def _now() -> float:
        return time.monotonic()

    # ------------------------------------------------------------------
    # Model
    # ------------------------------------------------------------------

    def _get_model(self):
        """
        The person detector, borrowed rather than loaded.

        This is the same object the restricted zone runs — the weights are
        already in memory, and loading a second copy of a person detector to
        ask the same question would cost a GPU's worth of memory for nothing.
        """
        from app.vision.detector import model

        return model

    def model_loaded(self) -> bool:
        """
        Whether the person detector is available.

        Always true, and honestly so: the detector this borrows is built at
        import time in app/vision/detector.py, so weights that will not load
        take the import down rather than leaving a module running without
        them. There is no half-loaded state here to report.
        """
        return True

    def is_configured(self) -> bool:
        """Whether an operator has marked a workstation on the camera in use."""
        return bool(workstation_regions.is_calibrated(self._source()))

    def is_ready(self) -> bool:
        # Ready once there is something to watch. With nothing marked the
        # module cannot report anything, and saying otherwise would put a
        # capability on the dashboard that is silently doing nothing.
        #
        # Same answer as before, now said in terms of the two facts under it.
        # The module used to report configured=True with nothing marked, which
        # is the same conflation that had the Doors page telling a healthy
        # install its AI was not installed.
        return self.model_loaded() and self.is_configured()

    # ------------------------------------------------------------------
    # Analysis
    # ------------------------------------------------------------------

    def process(self, frame: np.ndarray) -> tuple[np.ndarray, dict[str, Any]]:
        height, width = frame.shape[:2]
        now = self._now()

        marked = workstation_regions.for_source(self._source())

        if not marked:
            result = self.empty_result()
            result["summary"] = "No workstations marked"
            return frame, self._store(result)

        # Asked of the whole picture, once, before anything is asked of the
        # people in it: below this the detector loses people outright, and a
        # workstation nobody can be seen at reads exactly like an abandoned
        # one.
        reading = read(frame, self.module_id)

        model = self._get_model()

        results = model(
            frame, verbose=False, classes=[0], conf=CONF_THRESHOLD
        )

        picture = float(width * height)

        people: list[tuple[float, float, float, float]] = []

        for result in results:
            for box in result.boxes:
                x1, y1, x2, y2 = (float(v) for v in box.xyxy[0])
                confidence = float(box.conf[0])
                claim = ((x2 - x1) * (y2 - y1)) / picture

                # The bigger the claim, the stronger the evidence it needs.
                if claim >= LARGE_CLAIM and confidence < STRONG_CLAIM_CONF:
                    continue

                people.append((x1, y1, x2, y2))

        watched = self._watch(marked, people, frame, now, reading)

        # Something against the lens, specifically. Not the same claim as
        # "this picture cannot be read", which the reading makes about the
        # whole frame and which used to be reported as this one.
        blocked = any(station["blocked"] for station in watched)

        annotated = self._annotate(frame, watched)

        summary = self._summarise(watched, blocked, reading)
        summary["regions"] = self._regions(watched, width, height)
        summary["people_total"] = len(people)
        summary["view_blocked"] = blocked
        # People the detector found in a picture nobody should be trusting.
        # Judging where they are standing would be reading meaning into it.
        summary["people_unverified"] = 0 if reading.readable else len(people)

        return annotated, self._store(summary)

    def _watch(
        self,
        marked: list[dict[str, Any]],
        people: list[tuple[float, float, float, float]],
        frame: np.ndarray,
        now: float,
        reading,
    ) -> list[dict[str, Any]]:
        """Update each marked workstation's occupancy and empty timer."""
        height, width = frame.shape[:2]
        watched = []

        for region in marked:
            x1, y1, x2, y2 = region["box"]
            box = (x1 * width, y1 * height, x2 * width, y2 * height)

            # Asked of this workstation alone: a hand over one bench must not
            # blind the others, and the answer decides whether anything else
            # said about it is worth anything. Not asked at all when the
            # picture as a whole cannot be read — the answer is already no,
            # and it would only be measuring how dark the room is.
            blocked = reading.readable and is_obstructed(
                frame[int(box[1]):int(box[3]), int(box[0]):int(box[2])]
            )

            unwatchable = blocked or not reading.readable

            present = [] if unwatchable else [
                person for person in people if self._at(person, box)
            ]

            state = self._watched.setdefault(
                region["id"],
                # `seen_at` is None rather than `now`: a workstation nobody
                # has ever been seen at has no presence to hold on to, so it
                # is empty from the first frame exactly as it always was. The
                # grace holds a belief; it does not invent one.
                {"empty_since": now, "seen_at": None, "people": 0, "at": now},
            )

            if unwatchable:
                # Time that passes behind a covered lens, or in a room too
                # dark to see anyone in, is time nobody watched. Counting it
                # would let somebody earn an absence alert — or wait one out
                # — by holding a hand up or turning the lights off, so the
                # clock is carried forward instead of running.
                #
                # The last sighting is carried with it, for the same reason
                # and in the same breath: a minute behind a hand must neither
                # spend the grace nor extend it, so that a bench which was
                # about to be called empty still is, and one somebody was at
                # a moment before the lens went dark still is that too.
                held = now - state.get("at", now)

                if state["empty_since"] is not None:
                    state["empty_since"] += held
                if state["seen_at"] is not None:
                    state["seen_at"] += held
            elif present:
                # Somebody is there: the clock is not merely paused, it is
                # cleared. An operator who steps away again has been away
                # since they left, not since the first time they left.
                state["seen_at"] = now
                state["empty_since"] = None
            elif (
                state["seen_at"] is not None
                and now - state["seen_at"] < PRESENCE_GRACE_SECONDS
            ):
                # Nobody found this frame, but somebody was here a moment ago
                # and people do not leave a desk between two frames. Nothing
                # happens: the belief stands and the empty clock stays
                # stopped. See PRESENCE_GRACE_SECONDS.
                pass
            elif state["empty_since"] is None:
                state["empty_since"] = now

            state["at"] = now
            # What was seen this frame, not what is believed. During the grace
            # this reads zero while the workstation reads occupied, which is
            # the honest pair: the module is standing by an earlier sighting,
            # not claiming a fresh one, and remembering a headcount nobody
            # can currently see would be inventing people.
            state["people"] = len(present)

            # Occupied while somebody has been seen recently enough — which
            # covers `present`, seen this very frame. Never while the view is
            # unwatchable: a belief held from before the lens was covered is
            # still not something anyone can see now.
            occupied = (
                not unwatchable
                and state["seen_at"] is not None
                and now - state["seen_at"] < PRESENCE_GRACE_SECONDS
            )

            # Asked as "is there a clock running", not "is the clock a
            # truthy number". A desk that emptied at monotonic zero has an
            # `empty_since` of 0.0, which is a perfectly good moment and a
            # falsy one — so this took the else branch for ever and the
            # timer read 0.0 seconds thirty seconds into an empty bench.
            empty_for = (
                now - state["empty_since"]
                if state["empty_since"] is not None
                else 0.0
            )

            threshold = region.get("empty_seconds") or self._empty_seconds

            # The record the graphs are drawn from. Written at the same
            # moment the verdict is reached, in the verdict's own terms —
            # unwatchable frames are holes in the record, never presence and
            # never absence. A photograph is one moment and has no timeline.
            if not self.single_frame:
                self._presence_note(
                    region["id"],
                    now,
                    "unwatched" if unwatchable else
                    ("manned" if occupied else "empty"),
                )

            watched.append(
                {
                    "id": region["id"],
                    "name": region["name"],
                    "box": box,
                    "occupied": occupied,
                    "presence": self._presence_summary(region["id"], now),
                    "people": len(present),
                    # Whether the answer above is worth anything at all.
                    "checkable": not unwatchable,
                    # Which of the two reasons it is not, so the operator is
                    # told to clear the lens or turn a light on, not both.
                    "blocked": blocked,
                    "reason": (
                        "View blocked" if blocked
                        else None if reading.readable
                        else reading.reason
                    ),
                    "empty_seconds": round(empty_for, 1),
                    "threshold_seconds": threshold,
                    "severity": (
                        None if unwatchable
                        else self._severity(empty_for, threshold)
                    ),
                }
            )

        # A workstation that has been unmarked stops being timed, and its
        # history goes with it — a lane for a station that no longer exists
        # would be a graph of nothing.
        live = {region["id"] for region in marked}
        self._watched = {
            key: value for key, value in self._watched.items() if key in live
        }
        self._presence = {
            key: value for key, value in self._presence.items() if key in live
        }

        return watched

    @staticmethod
    def _at(person: tuple[float, float, float, float], box: tuple) -> bool:
        """Whether this person counts as being at this workstation."""
        px1, py1, px2, py2 = person
        bx1, by1, bx2, by2 = box

        def within(x: float, y: float) -> bool:
            return bx1 <= x <= bx2 and by1 <= y <= by2

        middle = (px1 + px2) / 2

        # Where they meet the floor. Nothing is asked about their size here:
        # the point where a person touches the ground is the depth they are
        # standing at, so somebody marked out by their own footprint counts
        # however tall they loom over it.
        if within(middle, py2):
            return True

        # Where their body is — the seated case, and the one that has to be
        # bounded, because a body centre inside the area is not evidence of
        # standing in it. A detection this much taller than the area is
        # nearer the camera than the area is, and is passing in front of a
        # workstation rather than sitting at one. See SCALE_RATIO.
        #
        # Written as a multiplication rather than a ratio so a marked area of
        # no height refuses everything instead of dividing by zero.
        if (py2 - py1) > SCALE_RATIO * (by2 - by1):
            return False

        return within(middle, (py1 + py2) / 2)

    def _severity(
        self, seconds: float, threshold: Optional[float] = None
    ) -> Optional[str]:
        """How serious an absence this long is, or None if within limits."""
        limit = threshold or self._empty_seconds

        if seconds < limit:
            return None

        if seconds >= limit * ESCALATE_AT[2]:
            return "high"
        if seconds >= limit * ESCALATE_AT[1]:
            return "medium"

        return "low"

    # ------------------------------------------------------------------
    # Reporting
    # ------------------------------------------------------------------

    @staticmethod
    def _describe(seconds: Optional[float]) -> str:
        if not seconds or seconds < 1:
            return "just now"
        if seconds < 60:
            return f"{int(seconds)} seconds"
        if seconds < 3600:
            return f"{int(seconds // 60)} minutes"
        return f"{int(seconds // 3600)} hours"

    def _presence_note(self, station_id: int, now: float, state: str) -> None:
        """
        One frame's verdict appended to the station's presence record.

        Consecutive same-state frames extend one segment, so the record grows
        with *changes*, not with time. A gap between frames longer than
        PRESENCE_GAP_SECONDS is written down as "unwatched" — the camera was
        not delivering, and the record must say so rather than stretch
        whichever state happened to be last.
        """
        segments = self._presence.setdefault(station_id, [])

        if segments:
            last = segments[-1]

            if now - last["to"] > PRESENCE_GAP_SECONDS:
                if last["state"] == "unwatched":
                    last["to"] = now
                else:
                    segments.append(
                        {"state": "unwatched", "from": last["to"], "to": now}
                    )
                last = segments[-1]

            if last["state"] == state:
                last["to"] = now
            else:
                segments.append({"state": state, "from": last["to"], "to": now})
        else:
            segments.append({"state": state, "from": now, "to": now})

        # Prune to the window, clamping the segment that straddles its edge.
        horizon = now - PRESENCE_HISTORY_SECONDS
        while segments and segments[0]["to"] <= horizon:
            segments.pop(0)
        if segments and segments[0]["from"] < horizon:
            segments[0]["from"] = horizon

        # The cap is a backstop against flicker, not a policy: the oldest
        # segments go first, which the window was going to take anyway.
        if len(segments) > PRESENCE_MAX_SEGMENTS:
            del segments[: len(segments) - PRESENCE_MAX_SEGMENTS]

    def _presence_summary(
        self, station_id: int, now: float
    ) -> Optional[dict[str, Any]]:
        """
        The station's recent record, as the page draws it.

        Times are seconds *before now*, newest edge zero — relative on
        purpose, so the page never has to reconcile this process's clock
        with the browser's. Totals are the same segments summed; the page's
        delta is manned minus empty, computed where it is shown.
        """
        segments = self._presence.get(station_id)

        if not segments:
            return None

        timeline = [
            {
                "state": segment["state"],
                "start": round(now - segment["from"], 1),
                "end": round(now - segment["to"], 1),
            }
            for segment in segments
        ]

        totals = {"manned": 0.0, "empty": 0.0, "unwatched": 0.0}
        for segment in segments:
            totals[segment["state"]] += segment["to"] - segment["from"]

        return {
            "timeline": timeline,
            "manned_seconds": round(totals["manned"], 1),
            "empty_seconds": round(totals["empty"], 1),
            "unwatched_seconds": round(totals["unwatched"], 1),
            "window_seconds": PRESENCE_HISTORY_SECONDS,
            "span_seconds": round(now - segments[0]["from"], 1),
        }

    def _summarise(
        self,
        watched: list[dict[str, Any]],
        blocked: bool = False,
        reading=None,
    ) -> dict[str, Any]:
        occupied = [w for w in watched if w["occupied"]]
        overdue = [w for w in watched if w["severity"]]
        unwatchable = [w for w in watched if not w["checkable"]]

        readable = reading is None or reading.readable

        longest = max(
            (w["empty_seconds"] for w in watched if not w["occupied"]),
            default=0.0,
        )

        if not readable:
            # The operator's own words for it, from the reading, and phrased
            # as the gear pages phrase it so one camera reads the same way
            # wherever it is shown. A dim room used to be reported as a
            # covered lens, which sends somebody to wipe a clean camera.
            summary = reading.reason.rstrip(".")
            if watched:
                summary += (
                    " — 1 workstation not being watched"
                    if len(watched) == 1
                    else f" — {len(watched)} workstations not being watched"
                )
        elif overdue:
            # Before the blocked line, not after it: a bench with a hand over
            # it is a reason to say nothing about *that* bench, and an
            # unrelated one that has been empty for a minute is still the
            # most important thing on the screen.
            names = [w["name"] or f"Workstation {w['id']}" for w in overdue]
            summary = (
                f"{names[0]} is empty"
                if len(names) == 1
                else f"{len(names)} workstations are empty"
            )
        elif blocked:
            # Said plainly rather than dressed up as either answer: with the
            # lens covered there is no workstation to report on.
            summary = "Camera blocked — cannot check the workstations"
        elif not watched:
            summary = "No workstations marked"
        elif len(occupied) == len(watched):
            summary = (
                "Everyone is at their workstation"
                if len(watched) > 1
                else "Somebody is at the workstation"
            )
        else:
            summary = (
                f"{len(occupied)} of {len(watched)} workstations occupied"
            )

        return {
            # A picture nobody could read raises nothing. Nothing is overdue
            # in that state anyway — an unwatchable station has no severity —
            # and this says so rather than leaving it to arithmetic.
            "alert": bool(overdue) and readable,
            "status": (
                # Not "idle". A view nobody can judge is a thing that
                # happened, and the screen has to be able to say so — an
                # idle module and a blinded one used to look the same.
                "unverified" if not readable
                else "alert" if overdue
                else "unverified" if unwatchable
                else "clear" if watched
                else "idle"
            ),
            "summary": summary,
            "readable": readable,
            "unreadable_reason": None if readable else reading.reason,
            "detections": watched,
            # Who is missing, for the page to announce by name.
            "empty": [
                {
                    "id": w["id"],
                    "name": w["name"] or f"Workstation {w['id']}",
                    "empty_seconds": w["empty_seconds"],
                }
                for w in overdue
            ],
            "workstations_total": len(watched),
            "workstations_occupied": len(occupied),
            "workstations_empty": len(overdue),
            "longest_empty_seconds": round(longest, 1),
            "threshold_seconds": self._empty_seconds,
        }

    def _regions(self, watched, width, height) -> list[dict[str, Any]]:
        """The same boxes the annotation draws, for the browser to draw itself."""
        regions = []

        for station in watched:
            name = station["name"] or f"Workstation {station['id']}"

            if not station["checkable"]:
                tone = "muted"
                label = f"{name} — {station['reason'].rstrip('.').lower()}"
            elif station["severity"]:
                tone = "danger"
                label = f"{name} — empty {self._describe(station['empty_seconds'])}"
            elif station["occupied"]:
                tone = "ok"
                label = name
            else:
                tone = "warning"
                label = f"{name} — empty"

            regions.append(
                self.region(station["box"], width, height, label=label, tone=tone)
            )

        return regions

    def events(self, result: dict[str, Any]) -> list[dict[str, Any]]:
        """
        One continuing event per workstation left unattended.

        A station nobody could watch has no severity and so records nothing:
        the history never gains an absence that was really a covered lens or
        a room too dark to see. The live result says `unverified` while that
        is true, so the operator is not left to infer it from silence.
        """
        events = []

        for station in result.get("detections", []):
            if not station["severity"]:
                continue

            name = station["name"] or f"Workstation {station['id']}"

            events.append(
                {
                    # Keyed on which workstation, not on when: one absence is
                    # one event that escalates, not a row per frame.
                    "key": f"empty-{station['id']}",
                    "severity": station["severity"],
                    "summary": (
                        f"{name} left unattended for "
                        f"{self._describe(station['empty_seconds'])}"
                    ),
                    "details": {
                        "workstation": name,
                        "empty_seconds": station["empty_seconds"],
                        "allowed_seconds": station["threshold_seconds"],
                    },
                }
            )

        return events

    def empty_result(self) -> dict[str, Any]:
        result = super().empty_result()
        result.update(
            {
                "summary": "Not watching",
                "empty": [],
                # Nothing has been looked at yet, which is not the same as
                # having looked and failed: an idle module is readable.
                "readable": True,
                "unreadable_reason": None,
                "people_unverified": 0,
                "workstations_total": 0,
                "workstations_occupied": 0,
                "workstations_empty": 0,
                "longest_empty_seconds": 0.0,
                "people_total": 0,
                "view_blocked": False,
                "threshold_seconds": self._empty_seconds,
            }
        )
        return result

    # ------------------------------------------------------------------
    # Configuration
    # ------------------------------------------------------------------

    def is_configurable(self) -> bool:
        return True

    def get_config(self) -> dict[str, Any]:
        source = self._source()

        return {
            "empty_seconds": self._empty_seconds,
            "empty_seconds_default": DEFAULT_EMPTY_SECONDS,
            # Published rather than left implicit: the allowance an operator
            # sets is counted from when the module stops believing somebody
            # is there, so the time from walking away to the alert is this
            # much longer than the number they typed. An allowance shorter
            # than the grace cannot beat it either.
            "presence_grace_seconds": PRESENCE_GRACE_SECONDS,
            "workstations": workstation_regions.for_source(source),
            "calibrated": workstation_regions.is_calibrated(source),
            # The same three limits the door module publishes, in the same
            # words, because one canvas draws both and it should ask whichever
            # module it is drawing for rather than carry its own copy.
            # `min_area` is None here: a workstation is judged by whether
            # somebody is standing in it, not by overlap against a detected
            # object, so there is no area below which matching stops working.
            "min_side": MIN_SIZE,
            "min_area": workstation_regions.MIN_AREA,
            "max_empty_seconds": MAX_EMPTY_SECONDS,
        }

    def configure(self, payload: dict[str, Any]) -> dict[str, Any]:
        """
        Set how long a workstation may be empty, or mark one out.

        Args:
            payload: ``{"empty_seconds": > 0}``, or a marking action under
                ``{"workstation": ...}`` — see `_mark`.
        """
        if "workstation" in payload:
            return self._mark(payload["workstation"])

        if "empty_seconds" not in payload:
            raise ValueError("empty_seconds is required")

        # Checked in one place with every other number an operator can send —
        # see app/core/validate.py. The hand-rolled version here read
        # `value <= 0`, which is False for NaN, so NaN was stored as the
        # allowance and every comparison against it afterwards was False too.
        value = positive(
            payload["empty_seconds"], "empty_seconds", maximum=MAX_EMPTY_SECONDS
        )

        self._empty_seconds = value

        return {
            "success": True,
            "message": "Allowed time updated.",
            "empty_seconds": value,
        }

    def _mark(self, action: dict[str, Any]) -> dict[str, Any]:
        """
        Mark, adjust or forget a workstation on the camera being watched.

        Args:
            action: ``{"add": {"box": [...], "name": ..., "empty_seconds": ...}}``
                or ``{"update": {"id": n, ...}}``
                or ``{"remove": n}``
                or ``{"clear": true}``.

        Boxes are fractions of the picture, so an area marked at one
        resolution still lands correctly at another.
        """
        source = self._source()

        # Which workstation this change invalidates the timer of. None means
        # no existing area moved, so nothing that is being timed has changed.
        touched: Optional[int] = None

        if "add" in action:
            spec = action["add"] or {}
            station = workstation_regions.add(
                source,
                spec.get("box"),
                spec.get("name", ""),
                spec.get("empty_seconds"),
            )
            message = (
                f"Marked \"{station['name']}\"."
                if station["name"]
                else "Workstation marked."
            )
            # A workstation that did not exist a moment ago has no clock to
            # forget, and the benches already being watched are exactly where
            # they were.

        elif "update" in action:
            spec = dict(action["update"] or {})
            station_id = spec.pop("id", None)

            if station_id is None:
                raise ValueError("Which workstation to change is required.")

            station = workstation_regions.update(source, int(station_id), spec)
            message = "Workstation updated."
            touched = int(station_id)

        elif "remove" in action:
            station_id = int(action["remove"])

            if not workstation_regions.remove(source, station_id):
                raise ValueError("That workstation is not marked on this camera.")

            station = None
            message = "Workstation removed."
            touched = station_id

        elif action.get("clear"):
            removed = workstation_regions.clear(source)
            station = None
            message = f"Cleared {removed} marked workstation(s)."

            # Nothing is marked any more, so no clock still refers to anything.
            self._watched = {}

        else:
            raise ValueError("add, update, remove or clear is required.")

        if touched is not None:
            # The timer belongs to the shape that was just changed, so a moved
            # or deleted workstation starts again rather than carrying an
            # absence from the area it used to cover.
            #
            # It used to clear every timer on the camera under this same
            # comment. Two benches empty fifty seconds, one of them already at
            # "medium" — nudging the *other* one reset the alerting bench to
            # 0.0 seconds and no severity on the next frame. Routine
            # maintenance on one bench silently cancelled an escalating alert
            # on an unrelated one.
            self._watched.pop(touched, None)

        return {
            "success": True,
            "message": message,
            "workstation": station,
            "workstations": workstation_regions.for_source(source),
            "calibrated": workstation_regions.is_calibrated(source),
        }

    # ------------------------------------------------------------------
    # Annotation
    # ------------------------------------------------------------------

    def _annotate(
        self, frame: np.ndarray, watched: list[dict[str, Any]]
    ) -> np.ndarray:
        """One box per workstation, labelled with who is — or is not — there."""
        annotated = frame.copy()

        for station in watched:
            x1, y1, x2, y2 = (int(v) for v in station["box"])
            name = station["name"] or f"Workstation {station['id']}"

            if not station["checkable"]:
                color = COLOR_UNKNOWN
                label = f"{name}: {station['reason'].rstrip('.').lower()}"
            elif station["severity"]:
                color = COLOR_ALERT
                label = f"{name}: empty {self._describe(station['empty_seconds'])}"
            elif station["occupied"]:
                color = COLOR_OCCUPIED
                label = name
            else:
                color = COLOR_EMPTY
                label = f"{name}: empty"

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


service = WorkstationService()
