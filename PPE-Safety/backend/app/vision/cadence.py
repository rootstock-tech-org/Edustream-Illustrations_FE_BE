"""
How fast frames are actually arriving, and how wide a vote window that makes.

Every module that steadies a verdict over time keeps its recent votes for a
fixed number of *seconds* and asks for a fixed number of *votes* — three
sightings inside 1.5s for the gear modules, three inside 2.5s for doors. Read
together those two constants are not a window at all, they are a minimum frame
rate: three votes in 1.5s cannot happen below two answers a second, however
long the operator watches.

That was invisible while the browser and the server were on the same machine.
The frontend aims at 10fps and calls 5 its floor — `RATE_FLOOR` in
hooks/captureSizing.js — and over a tunnel to a hosted GPU the delivered rate
is a ceiling rather than a promise. Multiply what does arrive by the share of
frames the model finds the thing in, and modules stop settling: measured on the
factory clip, a doorway the detector finds in 2.7% of frames confirms at 44s at
29fps and never at 3fps. The same coupling made two gloves checks fail on a
loaded box and pass on an idle one, which is the tell — a safety verdict is not
supposed to depend on what else the CPU is doing.

So the window follows the cadence. It is still "several recent votes"; recent
is measured against how often answers actually arrive rather than against a
wall clock that assumed a fast link. It only ever widens — a fast stream keeps
exactly the behaviour it has today, and every existing measurement with it.

What this deliberately does not do is lower any bar. The number of votes, the
majority, and the time a state must hold are all untouched. A slow link stops
being a reason a module can never answer; it does not become a reason to
believe less evidence.
"""
from typing import Optional

#: The slowest gap between frames that widens the window, in seconds.
#:
#: Beyond this the link is not slow, it is stopped — the operator paused, the
#: tab slept, the upload stalled — and folding those gaps in would leave a
#: window minutes wide once frames resumed. Clamping rather than discarding,
#: because a genuinely 2s-per-frame link is a real deployment and should get a
#: window that fits it.
MAX_INTERVAL_SECONDS = 2.0

#: A gap longer than this is a different run, not a slow one.
#:
#: The measured cadence starts again from nothing rather than carrying an
#: average across a stop and a restart, which would describe neither.
RESUME_AFTER_SECONDS = 10.0

#: How much of the average each new gap moves. Low enough that one slow frame
#: does not widen the window, high enough to follow a link that degrades.
SMOOTHING = 0.25


class Cadence:
    """
    The measured gap between frames, and the vote window it justifies.

    One per session — frames arrive at one rate for the whole module, not per
    person or per doorway.
    """

    def __init__(
        self,
        base_seconds: float,
        votes: int,
        cap_seconds: Optional[float] = None,
    ) -> None:
        """
        Args:
            base_seconds: the window as it stands today. Never narrowed.
            votes: how many votes the caller's rule asks for. The window has to
                be able to hold this many, or the rule can never be satisfied.
            cap_seconds: the widest the window may get. Defaults to four times
                the base — past that "recent" has stopped meaning anything and
                the honest answer is that this link cannot support the module.
        """
        self.base_seconds = float(base_seconds)
        self.votes = int(votes)
        self.cap_seconds = float(
            cap_seconds if cap_seconds is not None else 4.0 * base_seconds
        )

        self._interval: Optional[float] = None
        self._last: Optional[float] = None

    def tick(self, now: float) -> None:
        """Note that a frame arrived. Once per processed frame, before voting."""
        if self._last is not None:
            gap = now - self._last

            # Time going backwards is a clock being replaced, not a fast frame.
            if gap < 0 or gap > RESUME_AFTER_SECONDS:
                self._interval = None
            else:
                gap = min(gap, MAX_INTERVAL_SECONDS)
                self._interval = (
                    gap
                    if self._interval is None
                    else (1 - SMOOTHING) * self._interval + SMOOTHING * gap
                )

        self._last = now

    @property
    def interval(self) -> Optional[float]:
        """The measured gap between frames, or None before the second one."""
        return self._interval

    @property
    def window(self) -> float:
        """
        How long votes are worth keeping, in seconds.

        `votes + 1` gaps rather than `votes - 1`, which is the arithmetic
        minimum: the model does not find the thing in every frame, and a window
        sized to exactly fit the votes needed would be emptied by one miss.
        """
        if self._interval is None:
            return self.base_seconds

        return min(
            self.cap_seconds,
            max(self.base_seconds, (self.votes + 1) * self._interval),
        )

    @property
    def widened(self) -> bool:
        """Whether the link is slow enough that the window has had to grow."""
        return self.window > self.base_seconds

    def reset(self) -> None:
        """Forget the measured cadence — a new camera is a new measurement."""
        self._interval = None
        self._last = None
