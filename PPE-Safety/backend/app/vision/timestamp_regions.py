"""
Where each camera's burned-in timestamp lives, when an operator has said.

The frame clock finds most overlays on its own — burned clocks sit in the
top or bottom strip, and the hunt scans both — but a plant camera can put
its timestamp anywhere, over anything. When auto-detection is not enough,
the operator drags one box over the timestamp on the live picture and the
clock reads exactly there, recognition-only, on every sample.

One box per camera source, keyed the way the region stores key their
cameras — `None`, "" and "browser" collapse to one bucket, everything else
is the source string — so a marked box follows its camera and a different
camera never inherits it. Deliberately not a `NamedRegions` subclass: one
box, no names, no ids, no thresholds. The box itself passes through the
same `clean_box` every marked region passes through.

The store also keeps the register of *live* clocks reading these boxes —
each running `FrameClock` attaches under its source key and detaches when
its capture or socket ends. That is what lets a mark apply the moment it
is saved: the save re-arms every attached clock under the same key, so an
operator watching the warning sees it answered by the running session,
not by the next one. Clocks are held weakly — a session that dies without
detaching is garbage, not a ghost entry.
"""

import json
import threading
import weakref
from pathlib import Path
from typing import Any, Optional

from app.core.config import STORAGE_DIR
from app.vision.named_regions import clean_box

__all__ = ["TimestampRegions", "timestamp_regions"]


class TimestampRegions:
    """The operator-marked timestamp box per camera source, persisted."""

    def __init__(self, path: Optional[Path] = None) -> None:
        self.path = (
            path if path is not None else STORAGE_DIR / "timestamp_regions.json"
        )
        self._lock = threading.Lock()

        #: {source_key: {"box": [l, t, r, b]}}
        self._cameras: dict[str, dict[str, Any]] = {}

        #: {source_key: live FrameClocks reading that source right now}
        self._clocks: dict[str, weakref.WeakSet] = {}

        self._load()

    @staticmethod
    def _key(source: Any) -> str:
        """One bucket per camera, same collapse as the region stores."""
        if source is None:
            return "browser"
        text = str(source).strip()
        if text in ("", "browser", "None", "null"):
            return "browser"
        return text

    def _load(self) -> None:
        if not self.path.exists():
            return
        try:
            data = json.loads(self.path.read_text())
            for key, entry in (data.get("cameras") or {}).items():
                box = entry.get("box")
                if box is not None:
                    self._cameras[key] = {
                        "box": clean_box(box, noun="timestamp area")
                    }
            if self._cameras:
                print(f"[FrameClock] Loaded timestamp areas for "
                      f"{len(self._cameras)} camera(s).")
        except Exception as exc:  # noqa: BLE001
            print(f"[FrameClock] Timestamp areas unreadable, starting "
                  f"empty: {exc}")
            self._cameras = {}

    def _save_locked(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps({"cameras": self._cameras}, indent=2))
        tmp.replace(self.path)

    # ------------------------------------------------------------------

    def get(self, source: Any) -> Optional[list[float]]:
        """This camera's marked box, or None when only the hunt applies."""
        with self._lock:
            entry = self._cameras.get(self._key(source))
            return list(entry["box"]) if entry else None

    def set(self, source: Any, box: Any) -> list[float]:
        """
        Mark where this camera's timestamp is.

        Raises:
            ValueError: the box is not a usable area — same rules, same
                wording as every other marked region.
        """
        cleaned = clean_box(box, noun="timestamp area")
        with self._lock:
            self._cameras[self._key(source)] = {"box": cleaned}
            self._save_locked()
        return list(cleaned)

    def clear(self, source: Any) -> bool:
        """Forget the marked box; auto-detection takes over again."""
        with self._lock:
            removed = self._cameras.pop(self._key(source), None) is not None
            if removed:
                self._save_locked()
            return removed

    # ------------------------------------------------------------------
    # Live clocks — the sessions reading these boxes right now.
    # ------------------------------------------------------------------

    def attach(self, source: Any, clock: Any) -> None:
        """A clock has started reading this source; remember it."""
        with self._lock:
            self._clocks.setdefault(self._key(source), weakref.WeakSet()).add(
                clock
            )

    def detach(self, source: Any, clock: Any) -> None:
        """That clock's capture or socket has ended; forget it."""
        with self._lock:
            live = self._clocks.get(self._key(source))
            if live is not None:
                live.discard(clock)
                if not live:
                    self._clocks.pop(self._key(source), None)

    def rearm(self, source: Any, box: Any) -> int:
        """
        Point every live clock on this source at the new mark, now.

        Called by the save route so a mark answers the session the
        operator is looking at. Returns how many clocks it reached — zero
        when nothing is running, which is not an error.
        """
        with self._lock:
            live = list(self._clocks.get(self._key(source), ()))
        for clock in live:
            clock.set_roi(tuple(box) if box else None)
        return len(live)

    def live_statuses(self) -> list[dict[str, Any]]:
        """Every live clock's status, browser sessions included."""
        with self._lock:
            live = [clock for bucket in self._clocks.values()
                    for clock in bucket]
        return [clock.status() for clock in live]


timestamp_regions = TimestampRegions()
