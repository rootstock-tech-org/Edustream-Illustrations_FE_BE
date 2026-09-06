"""
Restricted zones an operator drew and named, remembered per camera.

The restricted zone began as one polygon in one file, and one polygon is not
how plants are laid out: the floor by the press, the strip behind the loading
door and the electrical cage are three different shapes with three different
names, and an operator marks them separately. Doors and workstations already
answer this with named rectangles per camera in `named_regions`; this is the
same idea for polygons, which zones have always been — a fenced-off patch of
floor is rarely axis-aligned.

What is deliberately kept from `PolygonManager`, whose single area this store
replaces for the restricted-zone module:

    * validation through `clean_polygon`, unchanged — every refusal that
      protected one area protects each of many
    * points stored in the pixels of the frame they were drawn on, with that
      frame's size beside them, and scaled at use — an area drawn at 640 wide
      must land in the same place when the link drops the stream to 512

And what is taken from `named_regions` instead:

    * zones grouped by the camera they were drawn against. Switching cameras
      *hides* a set rather than destroying it — marking out a floor is real
      setup work, and losing it because somebody previewed another camera
      would be its own defect. The single-polygon store cleared on camera
      change, which was right when re-marking cost thirty seconds.
    * identity that survives restarts, so an alert can name the zone it is
      about and keep naming it the same thing tomorrow.

The one store older than both — the single `restricted_area.json` — is
migrated on first load: an area an operator drew before zones had names
becomes zone 1 of its camera, unnamed, and keeps working.
"""

import json
import threading
from pathlib import Path
from typing import Any, Optional

import numpy as np

from app.core.config import STORAGE_DIR
from app.vision.polygon import POLYGON_FILE, clean_polygon

__all__ = ["ZoneStore", "zone_store"]

#: Longest name an operator can give a zone. Same bound as named regions.
MAX_NAME = 60


class ZoneStore:
    """Named restricted-zone polygons, grouped by camera source."""

    def __init__(self, path: Optional[Path] = None) -> None:
        self.path = path if path is not None else STORAGE_DIR / "restricted_zones.json"
        self._lock = threading.Lock()

        #: {source_key: {"next_id": int, "zones": [zone, ...]}}
        self._cameras: dict[str, dict[str, Any]] = {}

        self.load()

    # ------------------------------------------------------------------

    @staticmethod
    def _key(source: Any) -> str:
        """
        One string per camera, however the source was expressed.

        Mirrors named_regions: None — no camera yet — gets its own bucket
        rather than being folded into a real one.
        """
        return "__none__" if source is None else str(source)

    def load(self) -> None:
        """Read the store, or migrate the single-area file into it."""
        with self._lock:
            self._cameras = {}

            if self.path.exists():
                try:
                    data = json.loads(self.path.read_text())
                    for key, entry in (data.get("cameras") or {}).items():
                        zones = []
                        for zone in entry.get("zones") or []:
                            cleaned = self._usable(zone)
                            if cleaned is not None:
                                zones.append(cleaned)
                        self._cameras[key] = {
                            "next_id": int(entry.get("next_id") or (len(zones) + 1)),
                            "zones": zones,
                        }
                    total = sum(len(e["zones"]) for e in self._cameras.values())
                    print(f"[Zones] Loaded {total} restricted zone(s) across "
                          f"{len(self._cameras)} camera(s).")
                except Exception as exc:  # noqa: BLE001
                    print(f"[Zones] Store unreadable, starting empty: {exc}")
                    self._cameras = {}
                return

            self._migrate_single_area()

    def _migrate_single_area(self) -> None:
        """
        Import the one-polygon store as zone 1 of its camera, once.

        Runs only when this store's own file does not exist yet, so it cannot
        re-import an area the operator has since deleted. The legacy file is
        left in place — the legacy /restricted-area routes still read through
        this store, not that file, so it is inert rather than a second truth.
        """
        if not POLYGON_FILE.exists():
            return

        try:
            legacy = json.loads(POLYGON_FILE.read_text())
        except Exception:  # noqa: BLE001
            return

        points = legacy.get("polygon") or []
        if len(points) < 3:
            return

        zone = self._usable(
            {
                "id": 1,
                "name": "",
                "points": points,
                "frame_width": legacy.get("frame_width"),
                "frame_height": legacy.get("frame_height"),
            }
        )
        if zone is None:
            return

        key = self._key(legacy.get("source"))
        self._cameras[key] = {"next_id": 2, "zones": [zone]}
        self._save_locked()
        print(f"[Zones] Migrated the single restricted area into zone 1 "
              f"of {key!r}.")

    @staticmethod
    def _usable(zone: dict[str, Any]) -> Optional[dict[str, Any]]:
        """A stored zone re-checked on the way in, or None."""
        try:
            points = zone.get("points") or []
            width = zone.get("frame_width")
            height = zone.get("frame_height")
            clean_polygon(points, width, height)
            return {
                "id": int(zone["id"]),
                "name": str(zone.get("name") or "")[:MAX_NAME],
                "points": [
                    {"x": int(p["x"]), "y": int(p["y"])} for p in points
                ],
                "frame_width": int(width) if width is not None else None,
                "frame_height": int(height) if height is not None else None,
            }
        except (ValueError, KeyError, TypeError):
            return None

    def _save_locked(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = {"cameras": self._cameras}
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(payload, indent=2))
        tmp.replace(self.path)

    # ------------------------------------------------------------------

    def for_source(self, source: Any) -> list[dict[str, Any]]:
        """This camera's zones, as copies safe to hand out."""
        with self._lock:
            entry = self._cameras.get(self._key(source))
            if not entry:
                return []
            return [dict(zone, points=[dict(p) for p in zone["points"]])
                    for zone in entry["zones"]]

    def add(
        self,
        source: Any,
        points: Any,
        name: str = "",
        frame_width: Any = None,
        frame_height: Any = None,
    ) -> dict[str, Any]:
        """
        Mark a zone.

        Raises:
            ValueError: the polygon could never enclose anybody — same rules,
                same wording as the single area always had — or the name is
                already another zone's on this camera.
        """
        checked = clean_polygon(points, frame_width, frame_height)
        name = str(name or "").strip()[:MAX_NAME]

        key = self._key(source)

        with self._lock:
            entry = self._cameras.setdefault(key, {"next_id": 1, "zones": []})

            if name and any(z["name"].lower() == name.lower() for z in entry["zones"]):
                raise ValueError(f'A zone called "{name}" is already marked.')

            zone = {
                "id": entry["next_id"],
                "name": name,
                "points": [{"x": int(x), "y": int(y)} for x, y in checked],
                "frame_width": int(frame_width) if frame_width is not None else None,
                "frame_height": int(frame_height) if frame_height is not None else None,
            }
            entry["next_id"] += 1
            entry["zones"].append(zone)
            self._save_locked()

            return dict(zone, points=[dict(p) for p in zone["points"]])

    def rename(self, source: Any, zone_id: int, name: Any) -> dict[str, Any]:
        """Rename a zone. Raises ValueError if it does not exist or clashes."""
        name = str(name or "").strip()[:MAX_NAME]
        key = self._key(source)

        with self._lock:
            entry = self._cameras.get(key)
            zone = next(
                (z for z in (entry or {}).get("zones", []) if z["id"] == int(zone_id)),
                None,
            )
            if zone is None:
                raise ValueError("That zone is not marked on this camera.")

            if name and any(
                z["name"].lower() == name.lower() and z["id"] != zone["id"]
                for z in entry["zones"]
            ):
                raise ValueError(f'A zone called "{name}" is already marked.')

            zone["name"] = name
            self._save_locked()
            return dict(zone, points=[dict(p) for p in zone["points"]])

    def remove(self, source: Any, zone_id: int) -> bool:
        """Forget one zone. True if something was actually removed."""
        key = self._key(source)

        with self._lock:
            entry = self._cameras.get(key)
            if not entry:
                return False

            before = len(entry["zones"])
            entry["zones"] = [z for z in entry["zones"] if z["id"] != int(zone_id)]

            if len(entry["zones"]) == before:
                return False

            self._save_locked()
            return True

    def clear(self, source: Any) -> int:
        """Forget every zone on this camera. Returns how many went."""
        key = self._key(source)

        with self._lock:
            entry = self._cameras.get(key)
            if not entry or not entry["zones"]:
                return 0

            gone = len(entry["zones"])
            entry["zones"] = []
            self._save_locked()
            return gone

    def replace_all(
        self,
        source: Any,
        points: Any,
        frame_width: Any = None,
        frame_height: Any = None,
    ) -> dict[str, Any]:
        """
        The legacy verb: this camera has exactly this one area now.

        What `POST {"polygon": ...}` has always meant, kept meaning it — the
        endpoints that spoke single-polygon still do, through this.
        """
        checked = clean_polygon(points, frame_width, frame_height)

        key = self._key(source)

        with self._lock:
            entry = self._cameras.setdefault(key, {"next_id": 1, "zones": []})
            entry["zones"] = []
            zone = {
                "id": entry["next_id"],
                "name": "",
                "points": [{"x": int(x), "y": int(y)} for x, y in checked],
                "frame_width": int(frame_width) if frame_width is not None else None,
                "frame_height": int(frame_height) if frame_height is not None else None,
            }
            entry["next_id"] += 1
            entry["zones"].append(zone)
            self._save_locked()
            return dict(zone, points=[dict(p) for p in zone["points"]])

    # ------------------------------------------------------------------

    @staticmethod
    def polygon_for(zone: dict[str, Any], width: int, height: int) -> np.ndarray:
        """
        One zone's corners in the coordinates of a picture this size.

        Same scaling contract as PolygonManager.points_for: drawn-frame pixels,
        scaled by the ratio of sizes, unscaled when no size was recorded.
        """
        corners = np.array(
            [[int(p["x"]), int(p["y"])] for p in zone["points"]], dtype=np.int32
        )

        drawn_w = zone.get("frame_width")
        drawn_h = zone.get("frame_height")

        if not drawn_w or not drawn_h or (width, height) == (drawn_w, drawn_h):
            return corners

        return np.array(
            [
                [int(x * width / drawn_w), int(y * height / drawn_h)]
                for x, y in corners
            ],
            dtype=np.int32,
        )


zone_store = ZoneStore()
