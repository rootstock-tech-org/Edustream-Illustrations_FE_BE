"""
The camera register: which cameras this deployment knows, by name and place.

Every camera the system watches through arrives as one of three things — a
browser device, a network address, or a local index — and none of them is a
name an operator can act on. "Camera 0" and a 64-character device id say
nothing about which doorway is unattended; "Weldbay-1, Laser Area" says
everything. The register maps the stable identifier each source can actually
offer to the name and location an operator gave it, once, and every safety
event carries that identity from then on.

## What "stable" honestly means here, per kind of source

    browser device   the identifier is `MediaDeviceInfo.deviceId`. Browsers
                     keep it stable per device *per origin* while site data
                     survives — clearing the browser's site data, or granting
                     from a different origin, mints a new id for the same
                     physical camera. That is the strongest identifier the
                     web platform exposes; a USB serial number is not
                     available to a page. The registered `source` keeps the
                     device label ("HD WebCam (04f2:b6be)"), so a re-minted
                     id is at least recognisable to a human as the same
                     hardware.

    network camera   the identifier is the normalised address. An address is
                     genuinely stable until somebody re-plans the network —
                     and when they do, it is genuinely a different source.

    local index      the identifier is "local:{n}". An index is the weakest
                     of the three — plugging cameras in a different order
                     renumbers them, and nothing in OpenCV exposes the
                     hardware behind the number — so the limitation is
                     stated here rather than papered over. On this
                     deployment the server owns no cameras, so the case is
                     mostly theoretical.

None of these is pretended to be a hardware serial. They are the most
reliable identifiers each path exposes, which is what a register can honestly
be built on.

## Clocks

A camera's clock is nobody's clock but its own. When a source reports one —
the browser sends its device's epoch when it starts — the *skew* against this
server's clock is stored, and every event written while that camera watches
carries both `server_timestamp` and `camera_timestamp` (the server moment
shifted by the stored skew). A skew beyond CLOCK_SKEW_WARNING marks the
camera with a clock warning: logged, shown on the management page, and
deliberately not blocking — a wrong clock is a thing to flag, not a reason
to stop watching a laser bay.

Storage is the same pattern as every other operator-authored register here —
a JSON file under storage/, atomic replace, a lock — because that is this
product's database and events already live beside it in SQLite untouched.
"""

from __future__ import annotations

import json
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from app.core.config import STORAGE_DIR

__all__ = ["CameraRegistry", "camera_registry", "CLOCK_SKEW_WARNING"]

#: Seconds of camera-against-server clock difference that earn a warning.
#:
#: Wide enough that ordinary drift and a slow page load never trip it — a
#: browser's clock is NTP-disciplined and lands within seconds — and narrow
#: enough that a camera living in the wrong month, the failure ERP
#: reconciliation actually meets, cannot hide. Five minutes.
CLOCK_SKEW_WARNING = 300.0

#: Longest name or location accepted, same bound as every other register.
MAX_TEXT = 60

#: How many register log entries are kept. Enough to reconstruct a week of
#: plugging and unplugging; bounded so the file cannot grow without limit.
MAX_LOG = 200


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


#: The camera-clock half of a registration record, with its rest state.
#: A camera's clock verdict comes from watching its pictures — the frame
#: clock's word, reported through report_clock() — and none of it is
#: assumed across a restart.
_CLOCK_FIELDS = {
    "camera_clock_status": "unknown",
    "last_camera_timestamp": None,
    "last_timestamp_check": None,
    "clock_warning_active": False,
    "clock_warning_created_at": None,
    "clock_last_validated_at": None,
}

#: Why each verdict is what it is, in the words the log carries.
_CLOCK_REASONS = {
    "valid": "A burned-in CCTV timestamp is being read and agrees with itself.",
    "checking": "Looking for a burned-in timestamp in the picture.",
    "unavailable": "No valid CCTV timestamp detected after the full check "
                   "window — events use the system clock.",
    "invalid": "The burned-in timestamp jumped backward and cannot be "
               "trusted — events use the system clock.",
    "unknown": "The camera has not fed frames since this was last reset.",
}


class CameraRegistry:
    """Registered cameras, their status, their clocks, and a log of changes."""

    def __init__(self, path: Optional[Path] = None) -> None:
        self.path = path if path is not None else STORAGE_DIR / "camera_registry.json"
        self._lock = threading.Lock()

        #: camera_id -> registration record.
        self._cameras: dict[str, dict[str, Any]] = {}

        #: Append-only happenings: detections, registrations, status changes.
        self._log: list[dict[str, Any]] = []

        #: The camera currently feeding analysis, process-wide:
        #: {"camera_id", "camera_name", "location", "clock_skew"} or None.
        #: Last-writer-wins when several browsers push at once — the same
        #: best-effort aggregate the dashboard's occupancy already is, and
        #: said here rather than discovered.
        self._context: Optional[dict[str, Any]] = None

        #: Unregistered identifiers already logged as NEW_CAMERA_DETECTED,
        #: so a camera the operator declined to register is one log line,
        #: not one per start.
        self._seen_unregistered: set[str] = set()

        self.load()

    # ------------------------------------------------------------- storage

    def load(self) -> None:
        with self._lock:
            self._cameras = {}
            self._log = []

            if not self.path.exists():
                print("[Cameras] No camera register yet.")
                return

            try:
                data = json.loads(self.path.read_text())
                for record in data.get("cameras") or []:
                    if record.get("camera_id"):
                        # Whatever was live when the process died is not live
                        # now; a camera proves it is active by feeding frames,
                        # not by having been active once.
                        record["status"] = "offline"

                        # The clock verdict is revalidated the same way: a
                        # clock that was valid last week proves nothing about
                        # today, and a warning from the old run should not
                        # ring before the new run has looked. History fields
                        # (last validated, last read) survive; the verdict
                        # does not.
                        for field, default in _CLOCK_FIELDS.items():
                            record.setdefault(field, default)
                        record["camera_clock_status"] = "unknown"
                        record["clock_warning_active"] = False

                        self._cameras[str(record["camera_id"])] = record
                self._log = list(data.get("log") or [])[-MAX_LOG:]
                print(f"[Cameras] {len(self._cameras)} registered camera(s) loaded.")
            except Exception as exc:  # noqa: BLE001
                print(f"[Cameras] Register unreadable, starting empty: {exc}")

    def _save_locked(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "cameras": list(self._cameras.values()),
            "log": self._log[-MAX_LOG:],
        }
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(payload, indent=2))
        tmp.replace(self.path)

    def _record_locked(self, kind: str, **fields: Any) -> None:
        self._log.append({"event": kind, "at": _utc_now(), **fields})
        self._log = self._log[-MAX_LOG:]

    # ------------------------------------------------------------ questions

    def get(self, camera_id: str) -> Optional[dict[str, Any]]:
        with self._lock:
            record = self._cameras.get(str(camera_id))
            return dict(record) if record else None

    def list(self) -> list[dict[str, Any]]:
        with self._lock:
            return [dict(r) for r in self._cameras.values()]

    def log_entries(self, limit: int = 50) -> list[dict[str, Any]]:
        with self._lock:
            return list(self._log[-limit:])[::-1]

    def lookup(self, camera_id: str) -> dict[str, Any]:
        """
        Whether this identifier is registered — the question the popup hangs on.

        An unregistered identifier is logged as NEW_CAMERA_DETECTED the first
        time it is ever asked about, which is exactly the moment the system
        first learned the camera exists.
        """
        camera_id = str(camera_id or "").strip()

        if not camera_id:
            return {"registered": False, "camera": None}

        with self._lock:
            record = self._cameras.get(camera_id)

            if record is None and camera_id not in self._seen_unregistered:
                self._seen_unregistered.add(camera_id)
                self._record_locked(
                    "NEW_CAMERA_DETECTED",
                    camera_id=camera_id,
                    camera_name="Pending registration",
                    location="Pending registration",
                )
                self._save_locked()
                print(f"[Cameras] New camera detected: {camera_id[:48]}")

            return {
                "registered": record is not None,
                "camera": dict(record) if record else None,
            }

    # ------------------------------------------------------------- writing

    def register(
        self,
        camera_id: str,
        camera_name: str,
        location: str,
        source: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """
        Register a camera, once.

        Raises:
            ValueError: empty identifier, empty name or location — both are
                mandatory, the popup's rule enforced where it cannot be
                bypassed — or an identifier that is already registered.
        """
        camera_id = str(camera_id or "").strip()
        camera_name = str(camera_name or "").strip()[:MAX_TEXT]
        location = str(location or "").strip()[:MAX_TEXT]

        if not camera_id:
            raise ValueError("The camera did not offer a usable identifier.")
        if not camera_name:
            raise ValueError("A camera name is required.")
        if not location:
            raise ValueError("A location is required.")

        with self._lock:
            if camera_id in self._cameras:
                held = self._cameras[camera_id]
                raise ValueError(
                    f'That camera is already registered as '
                    f'"{held["camera_name"]}" ({held["location"]}).'
                )

            record = {
                "camera_id": camera_id,
                "camera_name": camera_name,
                "location": location,
                "source": dict(source or {}),
                "status": "active",
                "enabled": True,
                "clock_warning": None,
                **dict(_CLOCK_FIELDS),
                "registered_at": _utc_now(),
                "updated_at": _utc_now(),
            }
            self._cameras[camera_id] = record
            self._seen_unregistered.discard(camera_id)
            self._record_locked(
                "CAMERA_REGISTERED",
                camera_id=camera_id,
                camera_name=camera_name,
                location=location,
            )
            self._save_locked()
            print(f'[Cameras] Registered "{camera_name}" ({location}).')

            return dict(record)

    def update(
        self,
        camera_id: str,
        camera_name: Any = None,
        location: Any = None,
        enabled: Any = None,
    ) -> dict[str, Any]:
        """
        Change what an operator may change: name, location, enabled.

        The identifier itself is deliberately not changeable — it is the one
        fact the register exists to hold still.
        """
        with self._lock:
            record = self._cameras.get(str(camera_id))
            if record is None:
                raise KeyError("That camera is not registered.")

            if camera_name is not None:
                camera_name = str(camera_name).strip()[:MAX_TEXT]
                if not camera_name:
                    raise ValueError("A camera name is required.")
                record["camera_name"] = camera_name

            if location is not None:
                location = str(location).strip()[:MAX_TEXT]
                if not location:
                    raise ValueError("A location is required.")
                record["location"] = location

            if enabled is not None:
                record["enabled"] = bool(enabled)

            record["updated_at"] = _utc_now()
            self._record_locked(
                "CAMERA_UPDATED",
                camera_id=record["camera_id"],
                camera_name=record["camera_name"],
                location=record["location"],
                enabled=record["enabled"],
            )
            self._save_locked()
            return dict(record)

    def remove(self, camera_id: str) -> bool:
        with self._lock:
            record = self._cameras.pop(str(camera_id), None)
            if record is None:
                return False
            self._record_locked(
                "CAMERA_REMOVED",
                camera_id=str(camera_id),
                camera_name=record.get("camera_name"),
            )
            if self._context and self._context.get("camera_id") == str(camera_id):
                self._context = None
            self._save_locked()
            return True

    # ------------------------------------------------------- live presence

    def set_context(
        self,
        camera_id: str,
        camera_epoch_ms: Any = None,
    ) -> dict[str, Any]:
        """
        This camera is the one feeding analysis now.

        Args:
            camera_id: the stable identifier the source offered. May be
                unregistered — events then carry the id alone, which is
                still more than they carried before.
            camera_epoch_ms: the source's own clock at this moment, if it
                has one to report. The skew against this server's clock is
                stored and checked; a camera living in the wrong month is
                flagged, not blocked.
        """
        camera_id = str(camera_id or "").strip()
        now = time.time()

        with self._lock:
            record = self._cameras.get(camera_id)

            skew = None
            if camera_epoch_ms is not None:
                try:
                    skew = float(camera_epoch_ms) / 1000.0 - now
                except (TypeError, ValueError):
                    skew = None

            if record is not None:
                previous = record.get("status")
                record["status"] = "active" if record.get("enabled", True) else "disabled"

                if skew is not None and abs(skew) > CLOCK_SKEW_WARNING:
                    record["clock_warning"] = {
                        "skew_seconds": round(skew, 1),
                        "camera_time": datetime.fromtimestamp(
                            now + skew, timezone.utc
                        ).isoformat(timespec="seconds"),
                        "server_time": datetime.fromtimestamp(
                            now, timezone.utc
                        ).isoformat(timespec="seconds"),
                        "noticed_at": _utc_now(),
                    }
                    self._record_locked(
                        "CAMERA_CLOCK_WARNING",
                        camera_id=camera_id,
                        camera_name=record["camera_name"],
                        skew_seconds=round(skew, 1),
                    )
                    print(
                        f'[Cameras] Clock warning: "{record["camera_name"]}" is '
                        f"{skew:+.0f}s from this server."
                    )
                elif skew is not None:
                    record["clock_warning"] = None

                if previous != record["status"]:
                    self._record_locked(
                        "CAMERA_ONLINE",
                        camera_id=camera_id,
                        camera_name=record["camera_name"],
                        location=record["location"],
                    )
                self._save_locked()

            self._context = {
                "camera_id": camera_id or None,
                "camera_name": record["camera_name"] if record else None,
                "location": record["location"] if record else None,
                "clock_skew": skew,
            }

            return dict(self._context)

    def clear_context(self, camera_id: Optional[str] = None) -> None:
        """
        The camera stopped feeding analysis.

        Its registration is deliberately kept — a camera that disconnects is
        offline, not forgotten, and reconnecting restores its name and place
        with no questions asked.
        """
        with self._lock:
            if camera_id is not None and self._context:
                if self._context.get("camera_id") != str(camera_id):
                    return

            leaving = self._context
            self._context = None

            if leaving and leaving.get("camera_id"):
                record = self._cameras.get(leaving["camera_id"])
                if record is not None and record.get("status") == "active":
                    record["status"] = "offline"
                    self._record_locked(
                        "CAMERA_OFFLINE",
                        camera_id=record["camera_id"],
                        camera_name=record["camera_name"],
                    )
                    self._save_locked()

    def report_clock(
        self,
        camera_id: Any,
        status: str,
        last_read: Optional[str] = None,
    ) -> None:
        """
        The frame clock's verdict on a camera, deduplicated to changes.

        Called freely — per resolved frame if the pipeline likes — and
        cheap when nothing changed: an unchanged verdict is one dict
        lookup and a compare, no write. On a change it is logged as
        CAMERA_CLOCK_STATUS_CHANGED with the reason in words, and the
        warning lives its lifecycle here: created once when the verdict
        first turns unavailable or invalid — never re-created per frame —
        and resolved, with its own log line, the moment the verdict turns
        valid. A camera that is not registered is not tracked; there is
        no record to hang the warning on.
        """
        camera_id = str(camera_id or "").strip()
        if not camera_id or status not in _CLOCK_REASONS:
            return

        with self._lock:
            record = self._cameras.get(camera_id)
            if record is None:
                return

            previous = record.get("camera_clock_status", "unknown")
            if previous == status:
                if last_read and last_read != record.get("last_camera_timestamp"):
                    # The reading ticks on without a verdict change; worth
                    # remembering, not worth a log line or a disk write per
                    # tick — it lands with the next change.
                    record["last_camera_timestamp"] = last_read
                return

            now = _utc_now()
            record["camera_clock_status"] = status
            record["last_timestamp_check"] = now
            if last_read:
                record["last_camera_timestamp"] = last_read

            self._record_locked(
                "CAMERA_CLOCK_STATUS_CHANGED",
                camera_id=camera_id,
                camera_name=record["camera_name"],
                previous=previous,
                new=status,
                reason=_CLOCK_REASONS[status],
            )

            if status == "valid":
                record["clock_last_validated_at"] = now
                if record.get("clock_warning_active"):
                    record["clock_warning_active"] = False
                    self._record_locked(
                        "CAMERA_CLOCK_RESOLVED",
                        camera_id=camera_id,
                        camera_name=record["camera_name"],
                        timestamp_source="cctv",
                    )
                    print(f'[Cameras] Clock detected: "{record["camera_name"]}" '
                          f"now stamps events from its own footage.")
            elif status in ("unavailable", "invalid"):
                if not record.get("clock_warning_active"):
                    record["clock_warning_active"] = True
                    record["clock_warning_created_at"] = now
                    print(f'[Cameras] Clock warning: "{record["camera_name"]}" '
                          f"offers no usable timestamp — events use the "
                          f"system clock.")

            self._save_locked()

    def camera_for_source(self, source: Any) -> Optional[str]:
        """
        The registered camera behind a server-side source, if any.

        A network camera registers under its address and a local device
        under "local:{n}", so both spellings are tried. An uploaded
        recording matches nothing — it is footage, not a camera — and
        answers None.
        """
        # `is None`, not truthiness: device index 0 is a real source, and
        # `source or ""` would silently swallow exactly that camera.
        text = "" if source is None else str(source).strip()
        if not text:
            return None

        with self._lock:
            if text in self._cameras:
                return text
            local = f"local:{text}"
            if local in self._cameras:
                return local
        return None

    def active_camera_id(self) -> Optional[str]:
        """The registered camera feeding analysis right now, if any."""
        with self._lock:
            if self._context is None:
                return None
            return self._context.get("camera_id")

    def event_context(self) -> dict[str, Any]:
        """
        What the record of a safety event should say about its camera.

        Always carries `server_timestamp`; adds the camera's identity when
        one is feeding, and `camera_timestamp` — the same moment on the
        camera's own clock — when that clock ever reported itself. The two
        stay separate on purpose: they will be reconciled against ERP time
        by somebody who needs to know which clock said what.
        """
        now = time.time()
        stamp = lambda t: datetime.fromtimestamp(t, timezone.utc).isoformat(  # noqa: E731
            timespec="seconds"
        )

        with self._lock:
            details: dict[str, Any] = {"server_timestamp": stamp(now)}

            if self._context is None:
                return details

            if self._context.get("camera_name"):
                details["camera"] = self._context["camera_name"]
                details["camera_location"] = self._context["location"]
            if self._context.get("camera_id"):
                details["camera_id"] = self._context["camera_id"]
            if self._context.get("clock_skew") is not None:
                details["camera_timestamp"] = stamp(now + self._context["clock_skew"])

            return details


camera_registry = CameraRegistry()
