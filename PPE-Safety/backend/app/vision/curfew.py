"""
The hours a camera's whole view is off limits.

A marked zone answers "is anybody standing *there*". A curfew answers a
different question — "is anybody here *at all*, at this hour" — and the two
are not the same shape. During a curfew nothing needs drawing: the floor
that must stay empty is everything the camera can see, which is why the
operator marks a time rather than an area.

Stored per camera, in its own file, for the reason every other area in this
product has its own: two cameras on one bay may run different hours, and a
schedule that followed the zones would be re-aimed by anybody redrawing
them.

## Crossing midnight

A night curfew is the normal case and it is the one that breaks naive code:
22:00 to 06:00 is not "between 22:00 and 06:00" on a number line, it is
"at or after 22:00, or before 06:00". `covers()` handles both orders, and
a window whose ends are equal is treated as *off* rather than as
twenty-four hours — an operator who typed the same time twice meant
nothing, not everything, and reading it the other way would lock a bay for
a day on a typo.

## Which day, when the window crosses midnight

The day is the day the window *started*, not the day the clock now reads.
A Friday-night curfew running 22:00 to 06:00 covers Saturday's small hours
and does not need Saturday ticked. Anything else makes an operator reason
about midnight to express "Friday night", which nobody should have to do.

## Whose hours these are

A window is typed on somebody's screen and judged on some machine, and
those are rarely the same clock. A control room in India setting 15:53 to
16:00 against a server keeping UTC had its curfew judged five and a half
hours early, watched somebody walk through the bay, and was told the hours
were not running — the arithmetic was right and the hour it was handed was
not.

So the zone the operator was reading is stored with the window, and the
window is judged in it. The IANA name when the machine has the table,
a plain minutes-ahead-of-UTC offset when it does not, and neither for a
curfew saved before any of this existed — which keeps being judged on the
server's own clock, exactly as it was.

A timezone is not part of what makes a window valid: an unusable time or
no days at all is refused, but an unrecognised zone name is dropped and
the curfew saved anyway. Losing a night's watch over a string nobody would
have noticed is the worse failure.
"""

import json
import threading
from datetime import timedelta, timezone as fixed_zone
from pathlib import Path
from typing import Any, Optional
from zoneinfo import ZoneInfo

from app.core.config import STORAGE_DIR

__all__ = ["Curfew", "CurfewStore", "curfew_store", "DAYS"]

#: Monday first, matching `datetime.weekday()`.
DAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")


def _minutes(value: Any, name: str) -> int:
    """
    "HH:MM" as minutes past midnight.

    Raises:
        ValueError: anything that is not a 24-hour clock time. Refused
            rather than coerced — a curfew that silently became midnight
            because "9pm" did not parse is a bay left unwatched.
    """
    text = str(value or "").strip()
    parts = text.split(":")

    if len(parts) != 2:
        raise ValueError(f"{name} must look like HH:MM, not {text!r}.")

    try:
        hour, minute = int(parts[0]), int(parts[1])
    except ValueError:
        raise ValueError(f"{name} must look like HH:MM, not {text!r}.")

    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        raise ValueError(f"{name} must be a real time of day, not {text!r}.")

    return hour * 60 + minute


def _clock(minutes: int) -> str:
    """Minutes past midnight back to "HH:MM"."""
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def _zone_name(value: Any) -> Optional[str]:
    """
    An IANA timezone name this machine can resolve, or None.

    Never raises, unlike everything above it. A zone the browser named and
    this machine has no table for is a string to drop, not a save to
    refuse — the times and the days are the curfew, and losing them over a
    name would leave the bay unwatched.
    """
    text = str(value or "").strip()

    if not text:
        return None

    try:
        ZoneInfo(text)
    except Exception:  # noqa: BLE001
        print(f"[Curfew] No table for timezone {text!r}; using its offset.")
        return None

    return text


def _offset_minutes(value: Any) -> Optional[int]:
    """
    Minutes ahead of UTC, or None.

    The fallback when a zone name will not resolve here. Anything beyond
    fourteen hours either way is not a timezone on this planet, so it is
    dropped rather than trusted.
    """
    if value is None or isinstance(value, bool):
        return None

    try:
        minutes = int(value)
    except (TypeError, ValueError):
        return None

    return minutes if -14 * 60 <= minutes <= 14 * 60 else None


class Curfew:
    """One camera's window: when it runs, and on which days it starts."""

    __slots__ = (
        "start", "end", "days", "enabled", "timezone", "utc_offset_minutes",
    )

    def __init__(
        self,
        start: int,
        end: int,
        days: tuple[str, ...],
        enabled: bool = True,
        timezone: Optional[str] = None,
        utc_offset_minutes: Optional[int] = None,
    ) -> None:
        self.start = start
        self.end = end
        self.days = days
        self.enabled = enabled

        #: The zone the operator was reading when they typed these times.
        #: Both None for a curfew stored before this was recorded, which is
        #: judged on the server's own clock the way it always was.
        self.timezone = timezone
        self.utc_offset_minutes = utc_offset_minutes

    @property
    def crosses_midnight(self) -> bool:
        return self.end < self.start

    def covers(self, moment) -> bool:
        """
        Whether `moment` — a naive or aware datetime — falls in the window.

        The day tested is the day the window started, so a Friday night
        curfew needs only Friday ticked however far past midnight it runs.
        """
        if not self.enabled or self.start == self.end or not self.days:
            return False

        minutes = moment.hour * 60 + moment.minute
        weekday = DAYS[moment.weekday()]

        if not self.crosses_midnight:
            return self.start <= minutes < self.end and weekday in self.days

        if minutes >= self.start:
            # The evening half: today started it.
            return weekday in self.days

        if minutes < self.end:
            # The small hours: yesterday started it.
            yesterday = DAYS[(moment.weekday() - 1) % 7]
            return yesterday in self.days

        return False

    def tzinfo(self):
        """
        The zone these times were meant in, or None for the legacy reading.

        None is not an error and not UTC: it means this window was stored
        before the operator's zone was, and its caller judges it on the
        server's own clock — unchanged, so nothing already saved moves.
        """
        if self.timezone:
            try:
                return ZoneInfo(self.timezone)
            except Exception:  # noqa: BLE001
                # Saved on a machine with a fuller table than this one.
                pass

        if self.utc_offset_minutes is not None:
            return fixed_zone(timedelta(minutes=self.utc_offset_minutes))

        return None

    def zone_label(self) -> Optional[str]:
        """
        What to call this window's zone on screen.

        Names the zone the operator would recognise where it resolves, and
        falls back to the plain offset rather than to nothing: "UTC+05:30"
        still tells somebody arguing with an alarm which clock decided.
        """
        if self.timezone:
            try:
                ZoneInfo(self.timezone)
                return self.timezone
            except Exception:  # noqa: BLE001
                pass

        if self.utc_offset_minutes is None:
            return None

        sign = "-" if self.utc_offset_minutes < 0 else "+"
        minutes = abs(self.utc_offset_minutes)

        return f"UTC{sign}{minutes // 60:02d}:{minutes % 60:02d}"

    def as_dict(self) -> dict[str, Any]:
        return {
            "start": _clock(self.start),
            "end": _clock(self.end),
            "days": list(self.days),
            "enabled": bool(self.enabled),
            "crosses_midnight": self.crosses_midnight,
            "timezone": self.timezone,
            "utc_offset_minutes": self.utc_offset_minutes,
            # The one of those two to put on screen.
            "zone": self.zone_label(),
        }


class CurfewStore:
    """Per-camera curfews, persisted."""

    def __init__(self, path: Optional[Path] = None) -> None:
        self.path = path if path is not None else STORAGE_DIR / "zone_curfew.json"
        self._lock = threading.Lock()

        #: {source_key: Curfew}
        self._cameras: dict[str, Curfew] = {}

        self.load()

    @staticmethod
    def _key(source: Any) -> str:
        """One bucket per camera, the same collapse the zone store uses."""
        if source is None:
            return "browser"
        text = str(source).strip()
        if text in ("", "browser", "None", "null"):
            return "browser"
        return text

    def load(self) -> None:
        if not self.path.exists():
            return

        try:
            data = json.loads(self.path.read_text())
            for key, entry in (data.get("cameras") or {}).items():
                try:
                    self._cameras[key] = Curfew(
                        start=_minutes(entry.get("start"), "The start time"),
                        end=_minutes(entry.get("end"), "The end time"),
                        days=tuple(
                            d for d in (entry.get("days") or []) if d in DAYS
                        ),
                        enabled=bool(entry.get("enabled", True)),
                        timezone=_zone_name(entry.get("timezone")),
                        utc_offset_minutes=_offset_minutes(
                            entry.get("utc_offset_minutes")
                        ),
                    )
                except ValueError:
                    # One unusable entry must not cost the others. A curfew
                    # that will not parse is dropped rather than guessed at.
                    print(f"[Curfew] Unusable schedule for {key}; ignored.")
            if self._cameras:
                print(f"[Curfew] Loaded {len(self._cameras)} schedule(s).")
        except Exception as exc:  # noqa: BLE001
            print(f"[Curfew] Schedules unreadable, starting empty: {exc}")
            self._cameras = {}

    def _save_locked(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "cameras": {
                key: {
                    "start": _clock(c.start),
                    "end": _clock(c.end),
                    "days": list(c.days),
                    "enabled": c.enabled,
                    "timezone": c.timezone,
                    "utc_offset_minutes": c.utc_offset_minutes,
                }
                for key, c in self._cameras.items()
            }
        }
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(payload, indent=2))
        tmp.replace(self.path)

    # ------------------------------------------------------------------

    def for_source(self, source: Any) -> Optional[Curfew]:
        """This camera's curfew, or None when it has none."""
        with self._lock:
            return self._cameras.get(self._key(source))

    def set(
        self,
        source: Any,
        start: Any,
        end: Any,
        days: Any,
        enabled: bool = True,
        timezone: Any = None,
        utc_offset_minutes: Any = None,
    ) -> Curfew:
        """
        Set this camera's window.

        Raises:
            ValueError: unreadable times, no days, or a zero-length window.
                Refused rather than stored, because every one of those reads
                on screen as a curfew that is set and watching.
        """
        # Both read before either is stored.
        first = _minutes(start, "The start time")
        last = _minutes(end, "The end time")

        wanted = tuple(
            d for d in DAYS if d in {str(x).strip().lower()[:3] for x in (days or [])}
        )

        if not wanted:
            raise ValueError("Pick at least one day for the curfew to run.")

        if first == last:
            raise ValueError(
                "The start and end are the same, so the curfew would cover "
                "nothing. Pick two different times."
            )

        curfew = Curfew(
            first,
            last,
            wanted,
            bool(enabled),
            # Read after the strict fields, and forgivingly: a zone that
            # will not resolve costs the label, never the window.
            timezone=_zone_name(timezone),
            utc_offset_minutes=_offset_minutes(utc_offset_minutes),
        )

        with self._lock:
            self._cameras[self._key(source)] = curfew
            self._save_locked()

        return curfew

    def clear(self, source: Any) -> bool:
        """Forget this camera's curfew. The view is watched by zones again."""
        with self._lock:
            removed = self._cameras.pop(self._key(source), None) is not None
            if removed:
                self._save_locked()
            return removed


curfew_store = CurfewStore()
