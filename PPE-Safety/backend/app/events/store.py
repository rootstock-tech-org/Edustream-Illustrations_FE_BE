"""
The record of what the system has seen.

Until now every module reported what was true *right now* and nothing was
kept, so an operator who stepped away learned nothing and there was nothing to
report on at the end of a week. This is the memory: one row per thing that
happened, the picture that proves it, and whether a human has looked at it.

Two ideas do most of the work here.

**A situation is one event, not one per frame.** A door left open for five
minutes at ten frames a second is one event that escalates, not three thousand
rows. Modules describe what is *currently* wrong on each frame — `observe()`
works out what is new, what is continuing, and what has stopped.

**Every event carries its evidence.** A summary without a picture is a claim;
with one it is a finding an operator can check in a second and sign off. The
snapshot is written when the event opens, showing the moment it started rather
than whatever the camera happened to see later.

Storage is SQLite: it is in the standard library, it needs no server to
install alongside the app, and the volumes here — a few events a minute — are
nowhere near its limits. The columns are deliberately the same shape the
production design calls for, so moving to Postgres later is a migration rather
than a redesign.
"""

import json
import sqlite3
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import cv2

from app.core.config import SNAPSHOTS_DIR, STORAGE_DIR

DB_PATH = STORAGE_DIR / "events.db"

#: Where event evidence is written. Separate from operator-taken snapshots so
#: clearing one does not destroy the other.
EVIDENCE_DIR = SNAPSHOTS_DIR / "events"

#: How long a problem must be absent before its event is treated as over.
#:
#: Detection is not perfect frame to frame — a worker turns and their vest is
#: briefly not seen, someone passes in front of a door. Closing an event the
#: instant a detection is missed would split one situation into a dozen, which
#: is exactly the noise that makes an operator stop reading the list.
RESOLVE_AFTER_SECONDS = 5.0

#: Widest an evidence snapshot is stored at, and its JPEG quality.
#:
#: Big enough to see who and what, small enough that a week of events is
#: megabytes rather than gigabytes.
SNAPSHOT_WIDTH = 960
SNAPSHOT_QUALITY = 75

#: Severities, weakest first. Order matters: an event may escalate up this
#: list while it is open, and never quietly drops back down.
SEVERITIES = ("low", "medium", "high")

#: What a human concluded about an event once they looked at it.
DISPOSITIONS = ("valid", "false_alarm", "resolved")

SCHEMA = """
CREATE TABLE IF NOT EXISTS events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    module_id       TEXT    NOT NULL,
    event_key       TEXT    NOT NULL,
    occurred_at     TEXT    NOT NULL,
    ended_at        TEXT,
    severity        TEXT    NOT NULL,
    summary         TEXT    NOT NULL,
    snapshot        TEXT,
    details         TEXT    NOT NULL DEFAULT '{}',
    acknowledged    INTEGER NOT NULL DEFAULT 0,
    acknowledged_at TEXT,
    disposition     TEXT,
    note            TEXT
);

CREATE INDEX IF NOT EXISTS ix_events_time
    ON events (occurred_at DESC);

CREATE INDEX IF NOT EXISTS ix_events_module
    ON events (module_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS ix_events_open
    ON events (acknowledged, occurred_at DESC);
"""


def _now() -> str:
    """Current time, ISO 8601 in UTC.

    Stored as text: SQLite has no date type, and an ISO string in UTC sorts
    correctly as text and carries its own timezone, so a reader can never
    mistake it for local time.
    """
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class EventStore:
    """Persists events, deduplicates them, and answers questions about them."""

    def __init__(self, path: Path = DB_PATH) -> None:
        self._path = path
        self._lock = threading.Lock()

        # Which problems are currently open, and the row each one belongs to.
        # In memory rather than queried back: this is live state about the
        # current camera, not history, and it is worthless after a restart.
        self._open: dict[tuple[str, str], dict[str, Any]] = {}

        self._ready = False

    # ------------------------------------------------------------------
    # Storage
    # ------------------------------------------------------------------

    def _connect(self) -> sqlite3.Connection:
        """
        A connection for one operation.

        Opened per call rather than held: frames are analysed on worker
        threads, and a single shared SQLite connection across threads is a
        well-known way to corrupt one. At a few events a minute the cost of
        opening is irrelevant next to being obviously correct.
        """
        self._path.parent.mkdir(parents=True, exist_ok=True)

        connection = sqlite3.connect(self._path, timeout=5.0)
        connection.row_factory = sqlite3.Row

        if not self._ready:
            # Write-ahead logging so a reader listing events never blocks the
            # analysis thread trying to record one.
            connection.execute("PRAGMA journal_mode=WAL")
            connection.executescript(SCHEMA)
            connection.commit()
            self._ready = True

        return connection

    # ------------------------------------------------------------------
    # Recording
    # ------------------------------------------------------------------

    def observe(
        self,
        module_id: str,
        findings: list[dict[str, Any]],
        frame=None,
        resolved=None,
        clock_status: Optional[str] = None,
    ) -> None:
        """
        Take one module's view of the current frame and update the record.

        Args:
            module_id: which capability is reporting.
            findings: what is wrong *right now*, each as
                ``{"key", "severity", "summary", "details"}``. `key` identifies
                the problem, not the moment — the same key on the next frame is
                understood as the same situation continuing.
            frame: the annotated picture, saved as evidence when an event
                opens.
            resolved: the frame's own moment, when the source's burned-in
                clock could be read — a ``frame_clock.ResolvedStamp``. None
                means the system clock stamps this frame, which is every
                caller that predates the resolver and every source without a
                readable overlay.
            clock_status: the source's camera-clock verdict as the frame
                clock speaks it — valid / checking / unavailable / invalid —
                recorded on the event so "stamped by the system" can never
                be mistaken for "the camera clock is fine". None, from
                callers that predate the verdict or a single photograph,
                records as "unknown".

        Called on every analysed frame, so it must be cheap when nothing is
        happening: with no findings and nothing open, it does no I/O at all.
        """
        seen_at = time.monotonic()
        present: set[tuple[str, str]] = set()

        for finding in findings:
            key = finding.get("key")
            if not key:
                continue

            identity = (module_id, str(key))
            present.add(identity)

            severity = finding.get("severity", "low")
            if severity not in SEVERITIES:
                severity = "low"

            open_event = self._open.get(identity)

            if open_event is None:
                entry = {
                    "id": self._insert(
                        module_id, str(key), finding, severity, frame,
                        resolved, clock_status,
                    ),
                    "severity": severity,
                    "last_seen": seen_at,
                    # When this event began, on the monotonic timeline — what
                    # a late-locking burned-in clock needs to say when it
                    # began on the recording's timeline.
                    "opened_mono": seen_at,
                }
                # An event opened on the recording's clock must end on it
                # too, whoever ends it: the offset pins that clock to the
                # monotonic timeline at open, so the close needs no live
                # resolver — the no-frame closers (socket gone, source
                # changed) have none to ask.
                if resolved is not None:
                    entry["cctv_offset"] = resolved.epoch - seen_at
                self._open[identity] = entry
                continue

            open_event["last_seen"] = seen_at

            # A situation that gets worse stays one event and is raised in
            # place. Opening a second row would report the same door twice and
            # make "how many events today" meaningless.
            if SEVERITIES.index(severity) > SEVERITIES.index(open_event["severity"]):
                open_event["severity"] = severity
                self._escalate(open_event["id"], severity, finding.get("summary"))

        self._close_absent(module_id, present, seen_at)

    def _close_absent(
        self, module_id: str, present: set[tuple[str, str]], seen_at: float
    ) -> None:
        """Finish events whose problem has stayed away long enough."""
        for identity in list(self._open):
            if identity[0] != module_id or identity in present:
                continue

            entry = self._open[identity]

            if seen_at - entry["last_seen"] < RESOLVE_AFTER_SECONDS:
                continue

            self._open.pop(identity, None)
            self._mark_ended(entry["id"], entry.get("cctv_offset"))

    def _insert(
        self,
        module_id: str,
        key: str,
        finding: dict[str, Any],
        severity: str,
        frame,
        resolved=None,
        clock_status: Optional[str] = None,
    ) -> Optional[int]:
        # The event's moment: the recording's own clock when the source's
        # burned-in timestamp resolved, the system's otherwise. A resolved
        # stamp is byte-shaped exactly like _now(), so everything downstream
        # — range SQL, the substr day buckets, the snapshot filename — reads
        # both the same. The raw OCR text never reaches a filename.
        occurred_at = resolved.iso if resolved is not None else _now()
        snapshot = self._write_snapshot(frame, module_id, occurred_at)

        # Which camera saw this, and what the clocks said. Merged under the
        # finding's own details so a module's fields always win a collision,
        # and read at insert time because that is the moment the event is
        # about. server_timestamp is always present; camera_timestamp only
        # when the watching camera ever reported its own clock — the two are
        # kept apart deliberately, for whoever reconciles them with ERP time.
        try:
            from app.camera.registry import camera_registry

            context = camera_registry.event_context()
        except Exception:  # noqa: BLE001
            # The register must never take the record down with it.
            context = {}

        # Where the event's clock came from, on every record — "cctv" is the
        # burned-in overlay, "system" the server's own time. The burned text
        # rides beside it naive (no zone suffix) because a recording claims
        # no timezone and the record must not invent one.
        stamped: dict[str, Any] = {
            "timestamp_source": resolved.source if resolved is not None else "system",
            # The camera's clock verdict, kept apart from the timestamp
            # source on purpose: an event stamped by the system clock while
            # the camera's own clock is unavailable must say both, or the
            # system stamp reads as the camera being fine.
            "camera_clock_status": clock_status or "unknown",
        }
        if resolved is not None:
            stamped["cctv_timestamp"] = resolved.naive
            stamped["cctv_raw"] = resolved.raw

        details = {
            **context,
            **stamped,
            **(finding.get("details") or {}),
        }

        try:
            with self._lock, self._connect() as connection:
                cursor = connection.execute(
                    """
                    INSERT INTO events
                        (module_id, event_key, occurred_at, severity, summary,
                         snapshot, details)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        module_id,
                        key,
                        occurred_at,
                        severity,
                        finding.get("summary") or "Something needs attention",
                        snapshot,
                        json.dumps(details),
                    ),
                )
                return cursor.lastrowid
        except Exception as exc:  # noqa: BLE001
            # Recording must never take the analysis down with it. A camera
            # that keeps watching without a history is degraded; one that
            # stops watching because a disk filled up is broken.
            print(f"[Events] Could not record: {exc}")
            return None

    def _escalate(
        self, event_id: Optional[int], severity: str, summary: Optional[str]
    ) -> None:
        if event_id is None:
            return

        try:
            with self._lock, self._connect() as connection:
                connection.execute(
                    "UPDATE events SET severity = ?, summary = COALESCE(?, summary)"
                    " WHERE id = ?",
                    (severity, summary, event_id),
                )
        except Exception as exc:  # noqa: BLE001
            print(f"[Events] Could not escalate {event_id}: {exc}")

    def _mark_ended(
        self, event_id: Optional[int], cctv_offset: Optional[float] = None
    ) -> None:
        """
        Stamp the end, in the clock domain the event was opened in.

        An event opened on a recording's burned-in clock carries the offset
        between that clock and the monotonic timeline; its end is derived
        through the same offset, so `ended_at - occurred_at` is the real
        elapsed time and never the months between an April recording and an
        August replay. System-opened events end on _now(), exactly as ever.
        """
        if event_id is None:
            return

        if cctv_offset is not None:
            ended_at = (
                datetime.fromtimestamp(
                    cctv_offset + time.monotonic(), timezone.utc
                ).isoformat(timespec="seconds")
            )
        else:
            ended_at = _now()

        try:
            with self._lock, self._connect() as connection:
                connection.execute(
                    "UPDATE events SET ended_at = ? WHERE id = ? AND ended_at IS NULL",
                    (ended_at, event_id),
                )
        except Exception as exc:  # noqa: BLE001
            print(f"[Events] Could not close {event_id}: {exc}")

    def _write_snapshot(self, frame, module_id: str, occurred_at: str) -> Optional[str]:
        """
        Save the picture that proves it.

        Returns the filename, or None when there was no frame to save — an
        event without evidence is still worth more than no event, so a failure
        here is reported and stepped over rather than raised.
        """
        if frame is None:
            return None

        try:
            EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)

            height, width = frame.shape[:2]

            if width > SNAPSHOT_WIDTH:
                scale = SNAPSHOT_WIDTH / width
                frame = cv2.resize(
                    frame,
                    (SNAPSHOT_WIDTH, int(height * scale)),
                    interpolation=cv2.INTER_AREA,
                )

            stamp = occurred_at.replace(":", "-").replace("+00-00", "Z")
            name = f"{module_id}_{stamp}_{int(time.time() * 1000) % 100000}.jpg"

            ok, buffer = cv2.imencode(
                ".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), SNAPSHOT_QUALITY]
            )

            if not ok:
                return None

            (EVIDENCE_DIR / name).write_bytes(buffer.tobytes())
            return name
        except Exception as exc:  # noqa: BLE001
            print(f"[Events] Could not save evidence: {exc}")
            return None

    def restamp_open(self, module_id: str, resolved) -> None:
        """
        Move a module's still-open events onto the recording's clock.

        A burned-in clock cannot be *trusted* until a second reading agrees
        with the first, so the opening seconds of a replay are stamped by
        the system — and the violation is usually already on screen in
        frame one. The moment the clock locks, the events opened during
        that hunt are re-stamped to the moment they began on the
        recording's own timeline, derived through one offset from when
        each was opened. `server_timestamp` in their details keeps the
        original wall-clock receipt, so the correction hides nothing.

        Bounded deliberately: only this module's rows, only rows still
        open, only rows the system stamped — an event that already
        carries a recording's clock is never touched.
        """
        offset = resolved.epoch - time.monotonic()

        for identity, entry in list(self._open.items()):
            if identity[0] != module_id or entry.get("id") is None:
                continue
            if entry.get("cctv_offset") is not None:
                continue

            opened_epoch = offset + entry.get("opened_mono", 0.0)
            moment = datetime.fromtimestamp(opened_epoch, timezone.utc)
            occurred_at = moment.isoformat(timespec="seconds")
            naive = moment.strftime("%Y-%m-%d %H:%M:%S")

            try:
                with self._lock, self._connect() as connection:
                    row = connection.execute(
                        "SELECT details FROM events WHERE id = ? "
                        "AND ended_at IS NULL",
                        (entry["id"],),
                    ).fetchone()
                    if row is None:
                        continue

                    details = json.loads(row["details"] or "{}")
                    details["timestamp_source"] = "cctv"
                    details["camera_clock_status"] = "valid"
                    details["cctv_timestamp"] = naive
                    details["cctv_raw"] = resolved.raw

                    connection.execute(
                        "UPDATE events SET occurred_at = ?, details = ? "
                        "WHERE id = ? AND ended_at IS NULL",
                        (occurred_at, json.dumps(details), entry["id"]),
                    )
                entry["cctv_offset"] = offset
            except Exception as exc:  # noqa: BLE001
                print(f"[Events] Could not restamp {entry['id']}: {exc}")

    def forget_open(self, module_id: Optional[str] = None) -> None:
        """
        Stop tracking what is open, and end the rows rather than abandoning them.

        Called when the camera reporting them stops: the source changed
        server-side, or the last browser watching a module disconnected. Both
        mean the same thing — no later frame is coming, and `observe()` only
        ever closes an event on a later frame showing the problem gone. Left
        alone the rows stay open for ever, and "still open" on the Events page
        and in every export comes to mean nothing more than that nobody has
        looked since.

        Carrying them over instead would be worse: the next camera's first
        frame would be recorded as a continuation of the last one's, so one
        event would span two different places.

        Args:
            module_id: end only this module's events. Omitted, every module's
                are ended — right when the whole picture changes, wrong when
                one browser leaves, which says nothing about the modules it
                was not watching.
        """
        # Iterated over a snapshot: analysis runs on worker threads, and
        # another module opening an event mid-loop would otherwise raise
        # "dictionary changed size during iteration" and leave the rest open.
        for identity in list(self._open):
            if module_id is not None and identity[0] != module_id:
                continue

            entry = self._open.pop(identity, None)

            if entry is not None:
                self._mark_ended(entry["id"], entry.get("cctv_offset"))

    # ------------------------------------------------------------------
    # Reading
    # ------------------------------------------------------------------

    def list(
        self,
        module_id: Optional[str] = None,
        severity: Optional[str] = None,
        acknowledged: Optional[bool] = None,
        since: Optional[str] = None,
        until: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> dict[str, Any]:
        """Events newest first, with the total the filter matches."""
        where = []
        params: list[Any] = []

        if module_id:
            where.append("module_id = ?")
            params.append(module_id)

        if severity:
            where.append("severity = ?")
            params.append(severity)

        if acknowledged is not None:
            where.append("acknowledged = ?")
            params.append(1 if acknowledged else 0)

        if since:
            where.append("occurred_at >= ?")
            params.append(since)

        if until:
            where.append("occurred_at <= ?")
            params.append(until)

        clause = f"WHERE {' AND '.join(where)}" if where else ""

        # Bounded regardless of what is asked for: an unbounded page is a way
        # to make the server build a response big enough to fall over on.
        limit = max(1, min(int(limit), 500))
        offset = max(0, int(offset))

        with self._lock, self._connect() as connection:
            total = connection.execute(
                f"SELECT COUNT(*) FROM events {clause}", params
            ).fetchone()[0]

            rows = connection.execute(
                f"""
                SELECT * FROM events {clause}
                ORDER BY occurred_at DESC, id DESC
                LIMIT ? OFFSET ?
                """,
                [*params, limit, offset],
            ).fetchall()

        return {
            "events": [_as_event(row) for row in rows],
            "total": total,
            "limit": limit,
            "offset": offset,
        }

    def get(self, event_id: int) -> Optional[dict[str, Any]]:
        with self._lock, self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM events WHERE id = ?", (event_id,)
            ).fetchone()

        return _as_event(row) if row else None

    def acknowledge(
        self, event_id: int, disposition: str, note: Optional[str] = None
    ) -> Optional[dict[str, Any]]:
        """
        Record that a human looked at this and what they concluded.

        The disposition is the point: an operator marking false alarms is
        measuring the system, and that measurement is what the accuracy figure
        in the report is built from. Without it "150 events this week" says
        nothing about whether the system is any good.
        """
        if disposition not in DISPOSITIONS:
            raise ValueError(
                f"disposition must be one of {', '.join(DISPOSITIONS)}"
            )

        with self._lock, self._connect() as connection:
            changed = connection.execute(
                """
                UPDATE events
                   SET acknowledged = 1, acknowledged_at = ?,
                       disposition = ?, note = ?
                 WHERE id = ?
                """,
                (_now(), disposition, note, event_id),
            ).rowcount

        return self.get(event_id) if changed else None

    def summary(self, since: str) -> dict[str, Any]:
        """
        The figures the reports page is built from.

        Everything is computed here in one pass rather than by the page
        filtering a list of events, so a long history stays a fast page and
        the numbers cannot drift apart from the ones the export produces.
        """
        with self._lock, self._connect() as connection:
            totals = connection.execute(
                """
                SELECT
                    COUNT(*)                                        AS total,
                    SUM(CASE WHEN acknowledged = 0 THEN 1 ELSE 0 END) AS open_count,
                    SUM(CASE WHEN severity = 'high' THEN 1 ELSE 0 END) AS high,
                    SUM(CASE WHEN severity = 'medium' THEN 1 ELSE 0 END) AS medium,
                    SUM(CASE WHEN severity = 'low' THEN 1 ELSE 0 END) AS low,
                    SUM(CASE WHEN disposition = 'valid' THEN 1 ELSE 0 END) AS valid,
                    SUM(CASE WHEN disposition = 'false_alarm' THEN 1 ELSE 0 END) AS false_alarm
                  FROM events
                 WHERE occurred_at >= ?
                """,
                (since,),
            ).fetchone()

            by_module = connection.execute(
                """
                SELECT module_id,
                       COUNT(*) AS total,
                       SUM(CASE WHEN acknowledged = 0 THEN 1 ELSE 0 END) AS open_count,
                       SUM(CASE WHEN severity = 'high' THEN 1 ELSE 0 END) AS high
                  FROM events
                 WHERE occurred_at >= ?
                 GROUP BY module_id
                 ORDER BY total DESC
                """,
                (since,),
            ).fetchall()

            by_day = connection.execute(
                """
                SELECT substr(occurred_at, 1, 10) AS day,
                       COUNT(*) AS total,
                       SUM(CASE WHEN severity = 'high' THEN 1 ELSE 0 END) AS high
                  FROM events
                 WHERE occurred_at >= ?
                 GROUP BY day
                 ORDER BY day
                """,
                (since,),
            ).fetchall()

            busiest = connection.execute(
                """
                SELECT substr(occurred_at, 12, 2) AS hour, COUNT(*) AS total
                  FROM events
                 WHERE occurred_at >= ?
                 GROUP BY hour
                 ORDER BY total DESC
                 LIMIT 1
                """,
                (since,),
            ).fetchone()

        judged = (totals["valid"] or 0) + (totals["false_alarm"] or 0)

        return {
            "since": since,
            "total": totals["total"] or 0,
            "unacknowledged": totals["open_count"] or 0,
            "by_severity": {
                "high": totals["high"] or 0,
                "medium": totals["medium"] or 0,
                "low": totals["low"] or 0,
            },
            "by_module": [dict(row) for row in by_module],
            "by_day": [dict(row) for row in by_day],
            "busiest_hour": busiest["hour"] if busiest and busiest["total"] else None,
            # How many of the period's events fall in that hour, so the
            # screen can say whether "busiest" means a pattern or two events.
            "busiest_hour_count": busiest["total"] if busiest else 0,
            # Only over events a human actually judged. Counting unreviewed
            # events as correct would flatter the system for being ignored.
            "reviewed": judged,
            "confirmed": totals["valid"] or 0,
            "false_alarms": totals["false_alarm"] or 0,
            "accuracy": round((totals["valid"] or 0) / judged * 100) if judged else None,
        }


def _as_event(row: sqlite3.Row) -> dict[str, Any]:
    event = dict(row)
    event["acknowledged"] = bool(event["acknowledged"])

    try:
        event["details"] = json.loads(event["details"] or "{}")
    except json.JSONDecodeError:
        event["details"] = {}

    return event


event_store = EventStore()
