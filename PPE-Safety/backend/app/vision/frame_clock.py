"""
The clock burned into the picture, read so events can carry the camera's own
time.

A plant does not replay its CCTV footage the moment things happen — a file
recorded in April is reviewed in August, and an intrusion the recording shows
at ``02-04-2026 18:54:29`` is worth nothing logged as "whenever the file was
replayed". Most CCTV systems burn a wall-clock into the frame; this module
reads it, validates it, and keeps a per-source clock that the event store can
ask for a resolved time: the recording's own when it is readable, the system
clock when it is not.

Three design rules, all from the requirement:

    * the burned-in time wins whenever a *valid* one is available, and the
      system clock is the fallback — never the other way round;
    * nothing detected as text is trusted until it parses as a recognized
      date/time shape, lands on a real calendar day, and agrees with the
      clock's own extrapolation — a clock that jumps backward is a clock
      that was misread, and it is invalidated rather than believed;
    * reading is cheap: one OCR every couple of source-seconds on a small
      region, extrapolated between reads through the video's own position,
      so the detector's frame budget is untouched.

The day-first convention is pinned by the requirement's own example —
``02-04-2026 18:54:29`` is the second of April — so a month slot greater
than twelve is a failed read, never a silent flip to month-first.

Timezone honesty: a burned-in clock claims no timezone. The resolved stamp
stores the digits as read, shaped as-if-UTC so every consumer of
``occurred_at`` (lexicographic SQL ranges, ``substr`` day buckets, export
parsing) keeps working; the naive text is carried beside it in the event's
details so the record never pretends the recording told us its zone.

The OCR engine (rapidocr, ONNX models on the already-shipped onnxruntime)
is imported lazily behind a failure latch, exactly the way the face stack
loads insightface: an environment without the engine — or a wheel that
breaks — degrades to the system clock and can never take detection down.

    Install (deliberately not in requirements.txt, where a plain
    ``pip install -r`` would drag rapidocr's own opencv-python over the
    installed opencv-contrib and a CPU onnxruntime over Colab's GPU build):

        pip install --no-deps rapidocr-onnxruntime==1.4.4
        pip install pyclipper shapely
"""

from __future__ import annotations

import re
import threading
import time
from dataclasses import dataclass
from datetime import date, datetime, time as time_of_day, timedelta, timezone
from typing import Any, Callable, Optional

__all__ = [
    "FrameClock",
    "ResolvedStamp",
    "combine_with_anchor",
    "normalize_ocr_text",
    "parse_burned_timestamp",
]

# ----------------------------------------------------------------------
# Tuning. Judgements, each with its reason, none load-bearing to the exact
# decimal — the suite pins the behaviours, not these numbers.
# ----------------------------------------------------------------------

#: One OCR per this many source-seconds while the clock is locked. The
#: burned display ticks once a second; sampling at two keeps the read cost
#: near one percent of a core and still re-anchors long before drift could
#: reach the validation tolerance.
SAMPLE_SECONDS = 2.0

#: While hunting for a clock: attempts come this often, and give up after
#: this many misses. A camera with no burned-in time should stop paying for
#: OCR quickly — after the budget it drops to one probe a minute.
SEEK_INTERVAL = 0.7
SEEK_BUDGET = 12
REPROBE_SECONDS = 60.0

#: How far the clock may coast on its anchor with no fresh read before the
#: honest answer is the system clock again. Position-anchored coasting is
#: exact — the video's own position keeps the arithmetic true through
#: pauses and slow links — so it gets a long leash; wall-anchored coasting
#: genuinely drifts (frame pacing, browser throttling) and gets a short one.
COAST_POSITION_SECONDS = 90.0
COAST_WALL_SECONDS = 15.0

#: A fresh read against the extrapolated expectation: inside the window it
#: re-anchors, behind it the clock was misread or rewound (invalid, per the
#: requirement), ahead of it the footage may genuinely skip (stitched
#: recordings) so the read is held as a candidate until a second read
#: agrees. Asymmetric because OCR latency and one-second display
#: granularity both push reads *late*, never early.
TOLERATE_BEHIND = -2.0
TOLERATE_AHEAD = 3.0

#: Two reads agree on one timeline when they land within this of each
#: other, after accounting for the position between them. Locking needs two
#: — a single read is one misrecognized digit away from a wrong clock.
LOCK_AGREEMENT = 3.0

#: A source position that moves backwards by more than this is a new
#: playback segment — the file looped or was re-wound — not a lying clock.
POSITION_RESET_SLACK = 1.0

#: The two full-width bands auto-detection scans, as fractions of the
#: frame: burned clocks live in the top or bottom strip. Measured against
#: this repo's own demo footage, whose band is the top 26 px of 480.
DETECT_BANDS = ((0.0, 0.0, 1.0, 0.14), (0.0, 0.86, 1.0, 1.0))

#: Padding added around a validated hit's box when adopting it as the
#: session ROI, as a fraction of the box's own size.
ADOPT_PADDING = 0.4

#: Crops whose text would be shorter than this are upscaled before OCR —
#: recognition models want glyphs tens of pixels tall.
MIN_TEXT_HEIGHT = 32

#: The clock states, as words rather than an enum so status payloads and
#: suite output read plainly.
NO_CLOCK = "no_clock"
ACQUIRING = "acquiring"
LOCKED = "locked"
COASTING = "coasting"
INVALID = "invalid"

#: The camera-clock verdicts, as the register, the events and the UI speak
#: them. Distinct from the machine states above: the states are how the
#: reader works, the verdicts are what an operator is told about the
#: camera. UNKNOWN never comes from a running clock — it is what a camera
#: that has not run yet, or a single photograph, honestly is.
CLOCK_VALID = "valid"
CLOCK_CHECKING = "checking"
CLOCK_UNAVAILABLE = "unavailable"
CLOCK_INVALID = "invalid"
CLOCK_UNKNOWN = "unknown"

#: How long a source is probed before its clock is pronounced unavailable:
#: the seek budget at the seek cadence, about eight and a half seconds of
#: watching. One failed OCR frame never decides anything — the verdict
#: needs the whole budget spent — and a pronounced-unavailable source is
#: still re-probed about once a minute, so a clock that appears later is
#: found. Tune SEEK_BUDGET / SEEK_INTERVAL above to move this.
CLOCK_VERDICT_SECONDS = SEEK_BUDGET * SEEK_INTERVAL


# ----------------------------------------------------------------------
# Parsing — pure functions, no OCR, no cv2, unit-tested directly.
# ----------------------------------------------------------------------

#: Confusions OCR engines make inside digit runs, and every dash they
#: invent for a hyphen. Both measured off this engine reading this
#: product's own overlay: the same strip came back with "-", "--" and an
#: em-dash on different crops of the same frame.
_DIGIT_FIXES = str.maketrans({
    "O": "0", "o": "0", "l": "1", "I": "1",
    "–": "-", "—": "-", "−": "-",
})

_DASH_RUNS = re.compile(r"(?<=\d)-{2,}(?=\d)")

#: The seconds colon misread as "." or "-" — measured off a real DVR
#: export, where the same chip came back "18:54:32", "18:54.35" and
#: "18:54-29" on different frames. Only inside a time (the lookbehind
#: demands HH:MM before the separator, which a date's dashes never have)
#: and only onto a closing pair of digits (the lookahead refuses digits
#: that run on, where the pair could be the head of a glued neighbour).
_SECONDS_SEP = re.compile(r"(?<=\d\d:\d\d)[.\-](?=\d\d(?![.:\d]))")

_DATE_DMY = re.compile(r"(\d{2})[-/.](\d{2})[-/.](\d{4})")
_DATE_YMD = re.compile(r"(\d{4})-(\d{2})-(\d{2})")
#: After a matched date the colons alone are unambiguous; standalone, the
#: guards refuse a time glued onto other digits, where which two digits
#: begin the hour is anyone's guess.
_TIME_AFTER_DATE = re.compile(r"(\d{2}):(\d{2}):(\d{2})")
_TIME_ALONE = re.compile(r"(?<!\d)(\d{2}):(\d{2}):(\d{2})")


def normalize_ocr_text(text: str) -> str:
    """
    OCR output flattened to something the patterns can hold onto.

    Whitespace collapses to single spaces — the repo's own demo overlay
    separates date from time with two, and this engine emits ideographic
    spaces — the classic digit confusions are mapped back, every dash
    variant becomes a hyphen, and a run of hyphens between digits becomes
    one: a burned clock is digits and separators, and "02-04--2026" is a
    reading of the same hyphen twice, not a different date. Last, a "."
    or "-" where the seconds colon belongs becomes a colon — the same
    chip on the same recording came back all three ways, and refusing
    "18:54.35" threw away two thirds of an otherwise readable clock.
    """
    collapsed = " ".join(str(text or "").split())
    dashed = _DASH_RUNS.sub("-", collapsed.translate(_DIGIT_FIXES))
    return _SECONDS_SEP.sub(":", dashed)


def parse_burned_timestamp(
    text: str,
) -> Optional[tuple[Optional[date], time_of_day, str]]:
    """
    A date (maybe) and a time (required) read out of one OCR string.

    Returns ``(date_or_None, time, matched_text)`` or ``None`` when the
    text holds no valid clock. The date is matched first and the time is
    then sought *after* it — the engine glues neighbouring texts together
    ("…202618:54:29"), and once the date has claimed its digits the
    colons that follow are unambiguous. With no date, a time only counts
    when it is not glued onto other digits, because which two digits
    begin the hour would be a guess.

    A time alone is a clock (the date is combined in later); a date alone
    is not — nothing anchors to a day with no time on it. Validity is the
    calendar's: a month of 13 or a 31st of February is a failed read, and
    a day-first string is never silently retried month-first.
    """
    cleaned = normalize_ocr_text(text)
    if not cleaned:
        return None

    parsed_date: Optional[date] = None
    date_text = ""
    remainder = cleaned

    day_first = _DATE_DMY.search(cleaned)
    year_first = _DATE_YMD.search(cleaned) if day_first is None else None

    if day_first is not None:
        day, month, year = (int(part) for part in day_first.groups())
        if not 2000 <= year <= 2099:
            return None
        try:
            parsed_date = date(year, month, day)
        except ValueError:
            return None
        date_text = day_first.group(0)
        remainder = cleaned[day_first.end():]
    elif year_first is not None:
        year, month, day = (int(part) for part in year_first.groups())
        if not 2000 <= year <= 2099:
            return None
        try:
            parsed_date = date(year, month, day)
        except ValueError:
            return None
        date_text = year_first.group(0)
        remainder = cleaned[year_first.end():]

    clock = (
        _TIME_AFTER_DATE.search(remainder)
        if parsed_date is not None
        else _TIME_ALONE.search(cleaned)
    )
    if clock is None:
        return None

    hour, minute, second = (int(part) for part in clock.groups())
    try:
        parsed_time = time_of_day(hour, minute, second)
    except ValueError:
        return None

    matched = (
        f"{date_text} {clock.group(0)}" if parsed_date is not None
        else clock.group(0)
    )
    return parsed_date, parsed_time, matched


def combine_with_anchor(
    parsed_date: Optional[date],
    parsed_time: time_of_day,
    expected: datetime,
) -> datetime:
    """
    A full moment from a possibly date-less read.

    With a date, the answer is simply that date at that time. Without one —
    the bare ``HH:MM:SS`` overlays — the day is whichever of yesterday,
    today or tomorrow (relative to ``expected``) lands the reading nearest
    the expectation. One rule covers both the first backfill (expected is
    the system clock, and the nearest day is today) and midnight rollover
    (23:59:58 → 00:00:03 lands nearest expected+5s on the *next* day).
    """
    if parsed_date is not None:
        return datetime.combine(parsed_date, parsed_time)

    base = expected.date()
    candidates = [
        datetime.combine(base + timedelta(days=offset), parsed_time)
        for offset in (-1, 0, 1)
    ]
    return min(candidates, key=lambda option: abs((option - expected).total_seconds()))


# ----------------------------------------------------------------------
# The resolved stamp — what the event store consumes.
# ----------------------------------------------------------------------


@dataclass(frozen=True)
class ResolvedStamp:
    """One resolved CCTV moment, shaped for every existing consumer."""

    #: As-if-UTC ISO, byte-shaped exactly like EventStore._now() —
    #: "2026-04-02T18:54:29+00:00" — so SQL text ranges, substr buckets
    #: and export parsing keep working unchanged.
    iso: str
    #: POSIX seconds of the naive reading treated as UTC; what the store's
    #: clock-domain close arithmetic uses.
    epoch: float
    #: The burned text as matched, for the record.
    raw: str
    #: "YYYY-MM-DD HH:MM:SS" with no zone suffix — the clock face as read,
    #: shown to operators without pretending the recording told us a zone.
    naive: str
    source: str = "cctv"


def _stamp_from(moment: datetime, raw: str) -> ResolvedStamp:
    """Shape one naive datetime into the stamp every consumer expects."""
    aware = moment.replace(tzinfo=timezone.utc)
    return ResolvedStamp(
        iso=aware.isoformat(timespec="seconds"),
        epoch=aware.timestamp(),
        raw=raw,
        naive=moment.strftime("%Y-%m-%d %H:%M:%S"),
    )


# ----------------------------------------------------------------------
# The OCR engine, latched.
# ----------------------------------------------------------------------

_engine: Any = None
_engine_failed = False
_engine_lock = threading.Lock()


def _get_engine() -> Any:
    """
    The rapidocr engine, imported on first use and never twice.

    Same contract as the face stack's insightface load: a missing or broken
    wheel prints its cure once, latches, and every later call is a cheap
    ``None`` — the clock answers "system" for ever rather than costing a
    single frame of detection.
    """
    global _engine, _engine_failed

    if _engine is not None or _engine_failed:
        return _engine

    with _engine_lock:
        if _engine is not None or _engine_failed:
            return _engine
        try:
            from rapidocr_onnxruntime import RapidOCR

            _engine = RapidOCR()
            print("[FrameClock] OCR engine loaded; burned-in timestamps will "
                  "be read.")
        except ModuleNotFoundError:
            _engine_failed = True
            print("[FrameClock] rapidocr_onnxruntime is not installed — "
                  "events will carry the system clock. Install with: "
                  "pip install --no-deps rapidocr-onnxruntime==1.4.4 "
                  "&& pip install pyclipper shapely")
        except Exception as exc:  # noqa: BLE001 — any load failure latches
            _engine_failed = True
            print(f"[FrameClock] OCR engine failed to load ({exc}) — "
                  f"events will carry the system clock.")

    return _engine


def _engine_read(frame: Any, region: Optional[tuple], detect: bool) -> list:
    """
    One OCR pass, normalised to ``[(text, box_fractions_or_None), ...]``.

    ``region`` is an ``(l, t, r, b)`` fraction box to crop first. With
    ``detect`` the full pipeline runs inside the crop and each hit's box
    comes back in *full-frame* fractions (that is what ROI adoption
    stores); without it the crop goes straight to recognition — the cheap
    path the locked sampler lives on. Small crops are upscaled first: the
    recognition model wants glyphs tens of pixels tall.
    """
    engine = _get_engine()
    if engine is None or frame is None:
        return []

    import cv2

    height, width = frame.shape[:2]
    view = frame
    offset_x = offset_y = 0.0

    if region is not None:
        left, top, right, bottom = region
        x0, y0 = max(0, int(left * width)), max(0, int(top * height))
        x1, y1 = min(width, int(right * width)), min(height, int(bottom * height))
        if x1 - x0 < 8 or y1 - y0 < 4:
            return []
        view = frame[y0:y1, x0:x1]
        offset_x, offset_y = float(x0), float(y0)

    scale = 1.0
    if view.shape[0] < MIN_TEXT_HEIGHT:
        scale = 2.0
        view = cv2.resize(view, None, fx=scale, fy=scale,
                          interpolation=cv2.INTER_CUBIC)

    try:
        if detect:
            result, _ = engine(view)
            rows = []
            for quad, text, _score in (result or []):
                xs = [point[0] for point in quad]
                ys = [point[1] for point in quad]
                rows.append((
                    text,
                    (
                        (min(xs) / scale + offset_x) / width,
                        (min(ys) / scale + offset_y) / height,
                        (max(xs) / scale + offset_x) / width,
                        (max(ys) / scale + offset_y) / height,
                    ),
                ))
        else:
            result, _ = engine(view, use_det=False, use_cls=False)
            rows = [(text, None) for text, _score in (result or [])]
    except Exception:  # noqa: BLE001 — a bad frame must never take the loop
        return []

    return rows


# ----------------------------------------------------------------------
# The per-source clock.
# ----------------------------------------------------------------------


class FrameClock:
    """
    One video source's burned-in clock, sampled, validated, extrapolated.

    States: ``no_clock`` → ``acquiring`` → ``locked`` ⇄ ``coasting``, plus
    ``invalid`` after a backward jump. ``resolve()`` answers with a
    :class:`ResolvedStamp` only from ``locked``/``coasting`` inside the
    coast horizon; every other answer is ``None``, which the event store
    reads as "use the system clock".

    Thread-safe for the one real concurrency in the product: two MJPEG
    watchers feeding the same server-side source. The cadence gate makes
    the second feeder a no-op; OCR itself runs outside the lock on a crop.

    ``ocr`` and ``mono`` are injectable for the verification suite — the
    state machine is tested against a scripted reader and a hand-advanced
    clock, no engine involved.
    """

    def __init__(
        self,
        source_key: Optional[str] = None,
        roi: Optional[tuple] = None,
        ocr: Optional[Callable[[Any, Optional[tuple], bool], list]] = None,
        mono: Optional[Callable[[], float]] = None,
    ) -> None:
        self.source_key = source_key
        self.configured_roi = tuple(roi) if roi else None
        self._adopted_roi: Optional[tuple] = None

        self._ocr = ocr if ocr is not None else _engine_read
        self._mono = mono if mono is not None else time.monotonic

        self._lock = threading.Lock()
        self.state = NO_CLOCK

        #: (naive datetime, position-or-None, monotonic) of the last
        #: accepted read; the whole clock hangs off this.
        self._anchor: Optional[tuple[datetime, Optional[float], float]] = None
        #: First read while acquiring, awaiting a second that agrees.
        self._first: Optional[tuple[datetime, Optional[float], float]] = None
        #: A forward-skipping read held until a second confirms it.
        self._pending: Optional[tuple[datetime, Optional[float], float]] = None

        self._last_pos: Optional[float] = None
        self._last_try_mono: Optional[float] = None
        self._last_try_pos: Optional[float] = None
        self._seek_attempts = 0
        self._dormant = False
        self._last_raw: Optional[str] = None

    # ------------------------------------------------------------------

    def set_roi(self, roi: Optional[tuple]) -> None:
        """Adopt an operator-marked region and hunt again from scratch."""
        with self._lock:
            self.configured_roi = tuple(roi) if roi else None
            self._adopted_roi = None
            self._reset_locked(rearm=True)

    def _reset_locked(self, rearm: bool) -> None:
        self.state = NO_CLOCK
        self._anchor = None
        self._first = None
        self._pending = None
        if rearm:
            self._seek_attempts = 0
            self._dormant = False
            self._last_try_mono = None
            self._last_try_pos = None

    # ------------------------------------------------------------------

    def _roi(self) -> Optional[tuple]:
        return self.configured_roi or self._adopted_roi

    def _delta(
        self,
        older: tuple[datetime, Optional[float], float],
        pos: Optional[float],
        mono: float,
    ) -> float:
        """Seconds elapsed since ``older``, by the best clock available."""
        _, old_pos, old_mono = older
        if old_pos is not None and pos is not None:
            return pos - old_pos
        return mono - old_mono

    def _expected(
        self,
        anchor: tuple[datetime, Optional[float], float],
        pos: Optional[float],
        mono: float,
    ) -> datetime:
        return anchor[0] + timedelta(seconds=self._delta(anchor, pos, mono))

    # ------------------------------------------------------------------

    def observe_frame(self, frame: Any, position_seconds: Optional[float] = None) -> None:
        """
        Feed one frame; maybe OCR it, per the cadence; never judge it.

        Cheap by design: a non-due frame costs one lock and a couple of
        float compares. ``position_seconds`` is the source's own position
        (video file time); ``None`` for sources without one.
        """
        pos = position_seconds if isinstance(position_seconds, (int, float)) else None

        with self._lock:
            mono = self._mono()

            # The file looped or was re-wound: a new playback segment whose
            # burned clock legitimately restarts too. Re-acquire, do not
            # condemn.
            if (
                pos is not None
                and self._last_pos is not None
                and pos < self._last_pos - POSITION_RESET_SLACK
            ):
                self._reset_locked(rearm=True)
            if pos is not None:
                self._last_pos = pos

            if not self._due(pos, mono):
                return

            self._last_try_mono = mono
            self._last_try_pos = pos
            hunting = self.state in (NO_CLOCK, ACQUIRING, INVALID)
            if hunting and not self._dormant:
                self._seek_attempts += 1
            region = self._roi()

        # OCR outside the lock — the expensive part must not hold up a
        # second feeder's cadence check.
        rows = self._read(frame, region)

        with self._lock:
            accepted = self._ingest(rows, pos, self._mono())

            if accepted:
                self._seek_attempts = 0
                self._dormant = False
            else:
                if self.state in (LOCKED, COASTING):
                    self.state = COASTING
                elif self._seek_attempts >= SEEK_BUDGET:
                    # Enough asked of a picture with no clock in it: drop
                    # to a slow probe so a live camera stops paying.
                    self._dormant = True
                    self._seek_attempts = 0

    def _due(self, pos: Optional[float], mono: float) -> bool:
        if self._ocr is _engine_read and _engine_failed:
            return False
        if self._last_try_mono is None:
            return True

        if self.state in (LOCKED, COASTING):
            if pos is not None and self._last_try_pos is not None:
                return pos - self._last_try_pos >= SAMPLE_SECONDS
            return mono - self._last_try_mono >= SAMPLE_SECONDS

        interval = REPROBE_SECONDS if self._dormant else SEEK_INTERVAL
        return mono - self._last_try_mono >= interval

    def _read(self, frame: Any, region: Optional[tuple]) -> list:
        """
        One OCR pass over the region, or the hunt bands without one.

        Bands are tried top first and the second is skipped on a hit —
        burned clocks overwhelmingly live in the top strip, and a detect
        pass costs half a second where the marked-region path costs
        milliseconds.
        """
        if region is not None:
            return self._ocr(frame, region, False)

        rows: list = []
        for band in DETECT_BANDS:
            found = self._ocr(frame, band, True)
            rows.extend(found)
            joined = " ".join(str(row[0]) for row in found)
            if parse_burned_timestamp(joined) is not None:
                break
        return rows

    def _ingest(self, rows: list, pos: Optional[float], mono: float) -> bool:
        """
        Parse one reading out of everything OCR saw, and judge it.

        The rows are parsed *joined*, not one by one: the detector returns
        the date and the time of one overlay as separate boxes, and a
        per-row parse would drop the date on the floor — an April
        recording backfilled with today's date, which is the exact lie
        this module exists to prevent.
        """
        if not rows:
            return False

        joined = " ".join(str(row[0]) for row in rows)
        parsed = parse_burned_timestamp(joined)
        if parsed is None:
            return False

        parsed_date, parsed_time, matched = parsed

        reference = self._anchor or self._pending or self._first
        if reference is not None:
            expected = self._expected(reference, pos, mono)
        else:
            expected = datetime.now(timezone.utc).replace(tzinfo=None)

        moment = combine_with_anchor(parsed_date, parsed_time, expected)

        if self._accept(moment, pos, mono):
            self._last_raw = matched
            # A hit found by the band hunt pins the session ROI — the
            # union of the rows that actually carried the clock, and only
            # those. Adopting the whole band was measured to break the
            # follow-up reads: a camera-name row merges into the digits
            # under recognition-only ("CAM0102-04-—2026…") and neither
            # the date nor the time parses again, so the clock read once
            # and starved. Tight to the clock, every later sample is a
            # recognition-only crop costing milliseconds and reading
            # exactly what it read the first time.
            if self._roi() is None:
                tokens = matched.split()
                boxes = [
                    row[1] for row in rows
                    if row[1] is not None
                    and any(
                        token in normalize_ocr_text(str(row[0]))
                        for token in tokens
                    )
                ]
                if boxes:
                    self._adopted_roi = _padded((
                        min(box[0] for box in boxes),
                        min(box[1] for box in boxes),
                        max(box[2] for box in boxes),
                        max(box[3] for box in boxes),
                    ))
            return True

        return False

    def _accept(self, moment: datetime, pos: Optional[float], mono: float) -> bool:
        """The state machine: one validated reading arrives."""
        reading = (moment, pos, mono)

        if self._anchor is None:
            # Hunting: two reads on one timeline lock the clock.
            if self._first is None:
                self._first = reading
                self.state = ACQUIRING
                return True

            expected = self._expected(self._first, pos, mono)
            if abs((moment - expected).total_seconds()) <= LOCK_AGREEMENT:
                self._anchor = reading
                self._first = None
                self._pending = None
                self.state = LOCKED
                return True

            # Disagreement: the newer read becomes the candidate timeline.
            self._first = reading
            self.state = ACQUIRING
            return True

        error = (moment - self._expected(self._anchor, pos, mono)).total_seconds()

        if TOLERATE_BEHIND <= error <= TOLERATE_AHEAD:
            self._anchor = reading
            self._pending = None
            self.state = LOCKED
            return True

        if error < TOLERATE_BEHIND:
            # The clock ran backwards: a misread or a rewind either way,
            # and the requirement says invalid. Re-locking needs the same
            # two-read agreement acquiring needed.
            self._reset_locked(rearm=True)
            self.state = INVALID
            self._first = reading
            return True

        # Forward skip — stitched footage does this honestly. Held until a
        # second read agrees; meanwhile the old anchor keeps answering.
        if self._pending is not None:
            expected = self._expected(self._pending, pos, mono)
            if abs((moment - expected).total_seconds()) <= LOCK_AGREEMENT:
                self._anchor = reading
                self._pending = None
                self.state = LOCKED
                return True
        self._pending = reading
        return True

    # ------------------------------------------------------------------

    def resolve(self, position_seconds: Optional[float] = None) -> Optional[ResolvedStamp]:
        """
        The moment this frame shows, or ``None`` meaning "system clock".

        Extrapolates from the anchor by the video's own position when both
        ends have one — exact through pauses and slow links — else by wall
        time. Beyond the coast horizon the anchor is stale and the honest
        answer is ``None``; the hunt re-arms.
        """
        pos = position_seconds if isinstance(position_seconds, (int, float)) else None

        with self._lock:
            if self._anchor is None or self.state not in (LOCKED, COASTING):
                return None

            anchor_time, anchor_pos, anchor_mono = self._anchor
            mono = self._mono()

            if anchor_pos is not None and pos is not None:
                delta = pos - anchor_pos
                if delta < -POSITION_RESET_SLACK:
                    return None
                horizon = COAST_POSITION_SECONDS
            else:
                delta = mono - anchor_mono
                horizon = COAST_WALL_SECONDS

            if delta > horizon:
                # Too long since anything was read: back to the hunt, and
                # this frame is honestly the system's to stamp.
                self._reset_locked(rearm=True)
                return None

            moment = anchor_time + timedelta(seconds=delta)
            return _stamp_from(
                moment.replace(microsecond=0), self._last_raw or ""
            )

    # ------------------------------------------------------------------

    def clock_status(self) -> str:
        """
        The one-word verdict on this source's clock, for the register.

        `valid` while anchored (locked or honestly coasting), `invalid`
        after a backward jump until two readings agree again, `unavailable`
        once the whole seek budget has been spent finding nothing — never
        before, so one unreadable frame decides nothing — and `checking`
        while the hunt is still inside its budget.
        """
        with self._lock:
            if self.state in (LOCKED, COASTING):
                return CLOCK_VALID
            if self.state == INVALID:
                return CLOCK_INVALID
            if self._dormant:
                return CLOCK_UNAVAILABLE
            return CLOCK_CHECKING

    def status(self) -> dict:
        """The clock as it stands, for the debug route and the suite."""
        with self._lock:
            anchor_time = self._anchor[0] if self._anchor else None

            # The same verdict clock_status() gives, computed inline
            # because this lock is already held.
            if self.state in (LOCKED, COASTING):
                verdict = CLOCK_VALID
            elif self.state == INVALID:
                verdict = CLOCK_INVALID
            elif self._dormant:
                verdict = CLOCK_UNAVAILABLE
            else:
                verdict = CLOCK_CHECKING

            return {
                "source": self.source_key,
                "state": self.state,
                "clock": verdict,
                "roi": list(self.configured_roi) if self.configured_roi else None,
                "roi_auto": list(self._adopted_roi) if self._adopted_roi else None,
                "anchor": anchor_time.strftime("%Y-%m-%d %H:%M:%S")
                if anchor_time
                else None,
                "last_read": self._last_raw,
                "dormant": self._dormant,
            }

    # ------------------------------------------------------------------

    @staticmethod
    def read_still(frame: Any) -> Optional[ResolvedStamp]:
        """
        One photograph's burned clock, if it has one.

        A still has no position to extrapolate through and no second read
        to agree with, so this is a single hunt over the bands: a valid
        parse answers cctv with the system date backfilled for a bare
        time; anything less answers ``None`` and the photo is stamped by
        the system clock, as photos always were.

        The band's rows are parsed joined, exactly as the live path
        parses them — the detector returns a date and its time as
        separate boxes, and a per-row parse silently drops the date.
        """
        for band in DETECT_BANDS:
            rows = _engine_read(frame, band, True)
            joined = " ".join(str(text) for text, _box in rows)
            parsed = parse_burned_timestamp(joined)
            if parsed is None:
                continue
            parsed_date, parsed_time, matched = parsed
            now = datetime.now(timezone.utc).replace(tzinfo=None)
            moment = combine_with_anchor(parsed_date, parsed_time, now)
            return _stamp_from(moment, matched)
        return None


def _padded(box: tuple) -> tuple:
    """A hit's box widened by the adoption padding, clamped to the frame."""
    left, top, right, bottom = box
    pad_x = (right - left) * ADOPT_PADDING
    pad_y = (bottom - top) * ADOPT_PADDING
    return (
        max(0.0, left - pad_x),
        max(0.0, top - pad_y),
        min(1.0, right + pad_x),
        min(1.0, bottom + pad_y),
    )
