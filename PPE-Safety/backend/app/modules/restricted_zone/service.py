"""
Restricted Zone monitoring module.

This was the reference implementation every other module followed, and it has
now followed two of them back: zones are marked the way doors and workstations
are — several per camera, each with a name — instead of the single anonymous
polygon it began with. A plant floor is not one shape: the strip behind the
loading door and the electrical cage are different zones with different names,
and the alert an operator acts on should say which one was entered.

The analysis itself is unchanged and still lives in `app.vision.detector`:
the YOLO call, the two overlap tests — floor-patch and window — and the
annotation. This class hands it the zones to judge against and reports state
in the shared result shape.

Two contracts are deliberately preserved from the single-zone years, because
they are asserted by the phase suites and used by the legacy routes:

    * ``POST config {"polygon": [...]}`` still means "this camera has exactly
      this one area now", and ``{"polygon": []}`` still clears. Both now act
      on the zone store, so the old verb and the new ones cannot disagree.
    * the summary for an unnamed zone is still "Person inside restricted
      area" — the sentence only changes when there is a name to say.
"""

import time
from typing import Any, Optional

import numpy as np

from app.vision.legibility import read
from app.modules.base import BaseMonitoringService
from app.vision.detector import detector
from app.vision.zone_store import zone_store
from app.vision.curfew import DAYS as CURFEW_DAYS, curfew_store

#: How long a zone's occupancy clock survives not seeing its occupant.
#:
#: The clock answers "how long has somebody been in this zone", and a
#: detector is not a metronome: at the browser's 3-10 fps a person is
#: occasionally missed for a frame or two, and without a grace every miss
#: would restart the clock — a 40-second intrusion reported as eight
#: five-second ones. Two seconds bridges a couple of missed frames at the
#: slowest delivered rate while staying well under any meaningful exit and
#: return. A judgement, not a measurement, same as the walkway module's
#: hold — and it bridges the clock only: the alert itself still follows
#: the frame-by-frame verdict it always has.
#:
#: An unreadable stretch is treated exactly like a missed detection — time
#: nobody could watch is not time somebody was measured to be inside, so a
#: long enough one ends the measured stretch rather than counting toward it.
OCCUPIED_GRACE = 2.0


def _list_names(names: list[str]) -> str:
    """'A', 'A and B', 'A, B and C' — how the zones read in one sentence."""
    if len(names) <= 1:
        return names[0] if names else ""
    return ", ".join(names[:-1]) + " and " + names[-1]


class RestrictedZoneService(BaseMonitoringService):
    """Raises an alert while a person is standing inside any marked zone."""

    module_id = "restricted-zone"
    name = "Restricted Zone"
    description = (
        "The AI watches every marked zone and alerts the moment someone "
        "steps into one, naming the zone they entered."
    )

    def __init__(self) -> None:
        #: zone id -> {"since": first moment of this occupied stretch,
        #:             "last_inside": last frame somebody was measured in it}
        self._occupied: dict[int, dict[str, float]] = {}
        super().__init__()

    def _now(self) -> float:
        """The clock, in one place so a test can advance it by hand."""
        return time.time()

    def reset_session_state(self) -> None:
        """Give this copy its own clocks, so two browsers do not share one."""
        self._occupied = {}

    # ------------------------------------------------------------------

    def _source(self):
        """The camera whose zones apply, read at call time not import time."""
        from app.camera import camera_manager

        return camera_manager.current_source

    #: The id the whole-view curfew zone carries.
    #:
    #: Negative, so it can never collide with a marked zone's id — the store
    #: hands those out from 1 upward and never reuses them. It has to be an
    #: id at all because the occupancy clocks are keyed by one, and a curfew
    #: breach deserves the same "how long have they been there" the marked
    #: zones get.
    CURFEW_ZONE_ID = -1

    def _curfew_now(self, curfew=None):
        """
        The moment to judge the curfew against, and where it came from.

        Returns (datetime, source) where source is "cctv" or "system",
        because a page that shows a curfew as active has to be able to say
        which clock decided — the two disagree by months when a recording
        is being reviewed, and an operator looking at an alarm needs to
        know which one they are arguing with.

        Three readings, in order:

            * the footage's own burned-in clock, when this source has a
              readable one, and deliberately **not** converted. An overlay
              burned into a recording is already the plant's own wall
              time; putting it through a zone would move a night curfew
              off the night it was shot, which is the one thing that path
              exists to get right.

            * the wall clock, converted into the zone the operator was
              reading when they typed the window. This is the case that
              was wrong: a control room in India setting 15:53 to 16:00
              against a server keeping UTC had it judged at 10:25, was
              told the hours were not running, and watched somebody cross
              the bay unremarked.

            * the server's own clock, unconverted, for a window stored
              before any zone was recorded with it. The legacy reading, so
              nothing already saved moves underneath anybody.
        """
        from datetime import datetime, timezone

        stamp = getattr(self, "observed_clock", None)

        if stamp is not None:
            naive = getattr(stamp, "naive", None)
            if naive:
                try:
                    return datetime.fromisoformat(str(naive)), "cctv"
                except ValueError:
                    pass

        zone = curfew.tzinfo() if curfew is not None else None

        if zone is None:
            return datetime.now(), "system"

        return datetime.now(timezone.utc).astimezone(zone), "system"

    @staticmethod
    def _curfew_zone(curfew, clock) -> Optional[str]:
        """
        The zone to name on screen, or None when there is nothing to name.

        Nothing when the recording's own clock decided: that clock answers
        for itself, and offering a zone beside it would suggest a
        conversion that deliberately did not happen.
        """
        if curfew is None or clock != "system":
            return None
        return curfew.zone_label()

    @staticmethod
    def _whole_view(width: int, height: int) -> "np.ndarray":
        """Every pixel the camera can see, as a polygon."""
        return np.array(
            [(0, 0), (width - 1, 0), (width - 1, height - 1), (0, height - 1)],
            dtype=np.int32,
        )

    def _zones_for(self, width: int, height: int) -> list[dict[str, Any]]:
        """This camera's zones, scaled to this picture."""
        return [
            {
                "id": zone["id"],
                "name": zone["name"],
                "polygon": zone_store.polygon_for(zone, width, height),
            }
            for zone in zone_store.for_source(self._source())
        ]

    # ------------------------------------------------------------------

    def process(self, frame: np.ndarray) -> tuple[np.ndarray, dict[str, Any]]:
        """
        Analyse one frame against every zone marked on this camera.

        Uses analyse() rather than process(): the latter publishes its verdict
        onto the shared detector, and reading it back afterwards is a race the
        moment two frames are in flight.
        """
        height, width = frame.shape[:2]
        now = self._now()

        marked = self._zones_for(width, height)

        # A curfew, if this camera has one running at the moment the footage
        # says it is. While it runs the whole view is the restricted area —
        # that is what a curfew means, and it is why the operator marks a
        # time rather than a shape. The marked zones are not consulted:
        # everything they cover is inside the whole view anyway, and keeping
        # them would double-count the same person in two zones.
        curfew = curfew_store.for_source(self._source())
        curfew_at, curfew_clock = self._curfew_now(curfew)
        curfew_on = bool(curfew and curfew.covers(curfew_at))

        if curfew_on:
            marked = [
                {
                    "id": self.CURFEW_ZONE_ID,
                    "name": "Curfew",
                    "polygon": self._whole_view(width, height),
                }
            ]

        # The painted stream's zone captions, from the clocks as they stood
        # after the previous frame — the current frame's occupancy does not
        # exist until analyse() runs, and a caption one frame behind is
        # invisible at any real rate.
        #
        # Only for a zone seen occupied within the last second, not for every
        # zone with a live clock entry: an entry survives its grace window so
        # a detection gap does not restart the count, and painting during
        # that window put a running clock on a zone the list was rightly
        # calling clear. And a plain hyphen, not a typographic dot — cv2's
        # Hershey fonts are ASCII, and the dot was rendered as "??".
        for zone in marked:
            entry = self._occupied.get(zone["id"])
            if entry is not None and now - entry["last_inside"] <= 1.0:
                held = int(now - entry["since"])
                shown = zone["name"] or f"Zone {zone['id']}"
                zone["label"] = f"{shown} - {held}s"

        annotated, state = detector.analyse(frame, zones=marked)

        # Asked before anything is concluded. This module used to report
        # "Area clear" on a picture so degraded it could find neither of the
        # two people standing in it.
        reading = read(frame, self.module_id)

        person_inside = bool(state["person_inside"]) and reading.readable

        # The zones with somebody in them, in the words the operator gave
        # them. An unnamed zone — the legacy single area, or one added without
        # a name — keeps the sentence this module has always said.
        occupied = [
            zone for zone in state["zones"] if zone["people_inside"] > 0
        ]

        # The clocks. Presence only counts when it was measured — somebody
        # the detector saw, in a picture the gate could read — and a stretch
        # survives a gap no longer than OCCUPIED_GRACE. One photograph has no
        # duration, so the photo path never starts a clock.
        if not self.single_frame:
            for zone in state["zones"]:
                entry = self._occupied.get(zone["id"])
                if zone["people_inside"] > 0 and reading.readable:
                    if entry is None or now - entry["last_inside"] > OCCUPIED_GRACE:
                        entry = {"since": now}
                    entry["last_inside"] = now
                    self._occupied[zone["id"]] = entry
                elif entry is not None and now - entry["last_inside"] > OCCUPIED_GRACE:
                    del self._occupied[zone["id"]]

            # A zone that was unmarked takes its clock with it.
            still_marked = {zone["id"] for zone in state["zones"]}
            for gone in [z for z in self._occupied if z not in still_marked]:
                del self._occupied[gone]
        named = [zone["name"] for zone in occupied if zone["name"]]

        if not person_inside:
            summary = reading.reason if not reading.readable else (
                "Nobody here during the curfew" if curfew_on
                else "All zones clear" if len(state["zones"]) > 1
                else "Area clear"
            )
            spoken = None
        elif curfew_on:
            # Before the named-zone branch, not after: during a curfew the
            # one zone in play is the synthetic whole-view one, and it has a
            # name, so the branch below would happily say "in restricted
            # zone Curfew" — a zone nobody drew, named after an hour.
            inside_total = sum(zone["people_inside"] for zone in occupied)
            # Named for the hours rather than for a place, because during a
            # curfew there is no particular place to name — the whole view
            # is the area, and "in restricted zone Curfew" would read as a
            # zone somebody drew and forgot.
            window = f"{curfew.as_dict()['start']} to {curfew.as_dict()['end']}"
            sentence = (
                f"Somebody is here during the {window} curfew"
                if inside_total <= 1
                else f"{inside_total} people are here during the {window} curfew"
            )
            summary = sentence
            spoken = f"Alert! {sentence}"
        elif named:
            inside_total = sum(zone["people_inside"] for zone in occupied)
            if len(named) == 1 and inside_total == 1:
                sentence = f"Person is in restricted zone {named[0]}"
            elif len(named) == 1:
                sentence = (
                    f"{inside_total} people are in restricted zone {named[0]}"
                )
            else:
                sentence = f"People are in restricted zones {_list_names(named)}"
            summary = sentence
            spoken = f"Alert! {sentence}"
        else:
            summary = "Person inside restricted area"
            spoken = "Alert! Person is in restricted zone"

        regions = [
            self.region(
                person["box"],
                width,
                height,
                label="In restricted area" if person["inside"] else "Clear",
                tone="danger" if person["inside"] else "ok",
                outline=person.get("outline"),
            )
            for person in state["people"]
        ]

        def _held(zone) -> Optional[float]:
            """How long this zone has been occupied, when that is measured."""
            entry = self._occupied.get(zone["id"])
            if (
                entry is None
                or self.single_frame
                or zone["people_inside"] == 0
                or not reading.readable
            ):
                return None
            return round(now - entry["since"], 1)

        zones = [
            {
                "id": zone["id"],
                "name": zone["name"],
                "points": [
                    [round(float(x) / width, 4), round(float(y) / height, 4)]
                    for x, y in zone["polygon"]
                ],
                "people_inside": zone["people_inside"],
                # How long somebody has been in it, or None when nobody
                # measurably is. The browser overlay and the zone list print
                # it; the spoken sentence deliberately does not, so the alarm
                # never turns into a counter being read aloud.
                "occupied_seconds": _held(zone),
                "tone": (
                    "danger"
                    if zone["people_inside"] > 0 and reading.readable
                    else "warning"
                ),
            }
            for zone in state["zones"]
        ]

        result = self._store(
            {
                "alert": person_inside,
                "status": (
                    "alert" if person_inside
                    else "unverified" if not reading.readable
                    else "clear"
                ),
                "summary": summary,
                "spoken": spoken,
                "detections": [],
                "regions": regions,
                "zones": zones,
                "people_total": state["person_count"],
                "people_inside": state["inside_count"],
                "zones_total": len(state["zones"]),
                "zones_occupied": len(occupied),
                "zone_configured": len(state["zones"]) > 0,
                # The curfew, and which clock decided it. `curfew_clock`
                # is not decoration: with a recording under review the
                # footage's clock and the wall clock disagree by months,
                # and an operator looking at a curfew alarm has to be able
                # to tell which one raised it.
                "curfew": curfew.as_dict() if curfew else None,
                "curfew_active": curfew_on,
                "curfew_clock": curfew_clock,
                "curfew_now": curfew_at.strftime("%Y-%m-%d %H:%M:%S"),
                # And in whose hours. Sent even when it is None, so the
                # page never has to guess whether a missing zone means
                # "the recording's clock" or "we forgot to say".
                "curfew_zone": self._curfew_zone(curfew, curfew_clock),
                # Everyone in a picture nobody can read is unverified: not
                # inside the area, and not cleared of being inside it.
                **self.uncertainty(
                    reading,
                    state["person_count"] if not reading.readable else 0,
                ),
            }
        )

        return annotated, result

    def events(self, result: dict[str, Any]) -> list[dict[str, Any]]:
        """
        One event per occupied zone, keyed on the zone.

        Keyed on the zone rather than the person — the model has no identity
        across frames — and per zone rather than per module, so somebody in
        the cage and somebody behind the loading door are two events, each
        naming its own place, each closing when its own zone empties.
        """
        if not result.get("alert"):
            return []

        occupied = [
            zone for zone in result.get("zones", [])
            if zone.get("people_inside", 0) > 0
        ]

        if not occupied:
            # Alert with no per-zone account — should not happen, but an
            # intrusion must never go unrecorded because of a payload gap.
            return [
                {
                    "key": "intrusion",
                    "severity": "high",
                    "summary": "Someone entered the restricted area",
                    "details": {},
                }
            ]

        events = []
        # A curfew breach is its own kind of event, keyed apart from the
        # marked zones. Same severity — being somewhere you must not be is
        # the same hazard however the boundary was drawn — but a site that
        # keeps finding people in the bay at night has a different problem
        # from one that keeps finding them in the cage, and one key covering
        # both would hide which.
        if result.get("curfew_active"):
            inside = int(result.get("people_inside", 0))
            window = result.get("curfew") or {}
            span = f"{window.get('start')} to {window.get('end')}"
            return [
                {
                    "key": "curfew-breach",
                    "severity": "high",
                    "summary": (
                        f"Somebody was here during the {span} curfew"
                        if inside <= 1
                        else f"{inside} people were here during the {span} curfew"
                    ),
                    "details": {
                        "curfew_start": window.get("start"),
                        "curfew_end": window.get("end"),
                        "curfew_days": window.get("days"),
                        "people_inside": inside,
                        # Which clock said the curfew was running, and what
                        # it read. Without these a breach filed against
                        # footage reviewed months later cannot be argued.
                        "judged_by": result.get("curfew_clock"),
                        "judged_at": result.get("curfew_now"),
                        "judged_zone": result.get("curfew_zone"),
                    },
                }
            ]

        for zone in occupied:
            name = zone.get("name") or ""
            inside = int(zone.get("people_inside", 0))
            place = f'restricted zone "{name}"' if name else "the restricted area"
            events.append(
                {
                    "key": f"intrusion-zone-{zone.get('id')}",
                    "severity": "high",
                    "summary": (
                        f"Someone entered {place}"
                        if inside <= 1
                        else f"{inside} people entered {place}"
                    ),
                    "details": {
                        "zone_id": zone.get("id"),
                        "zone_name": name or None,
                        "people_inside": inside,
                        # As it stood when the event opened. The live figure
                        # is on the page; the record's own opened/ended
                        # timestamps are the full measurement.
                        "occupied_seconds": zone.get("occupied_seconds"),
                    },
                }
            )
        return events

    def empty_result(self) -> dict[str, Any]:
        result = super().empty_result()
        result["people_total"] = 0
        result["people_inside"] = 0
        result["zones_total"] = 0
        result["curfew"] = None
        result["curfew_active"] = False
        result["curfew_clock"] = "system"
        result["curfew_now"] = None
        result["curfew_zone"] = None
        result["zones_occupied"] = 0
        result["zone_configured"] = self.is_configured()
        result["spoken"] = None
        return result

    def reset(self) -> None:
        """
        Forget the last verdict when the camera changes — and only that.

        The zones themselves survive, the way doors and workstations do:
        they are stored against the camera they were drawn on, and switching
        cameras hides a set rather than destroying it. The single-polygon
        years cleared here instead, which was right when re-marking cost
        thirty seconds and wrong the moment a floor plan of named zones is
        real setup work.
        """
        super().reset()
        self._occupied = {}

    def model_loaded(self) -> bool:
        """
        Whether the segmentation model is available.

        Always true, and honestly so: the model is built at import time in
        app/vision/detector.py, so weights that will not load take the import
        down rather than leaving this module running without them.
        """
        return True

    def is_configured(self) -> bool:
        """
        Whether this camera is set up — a marked zone, or a curfew.

        A curfew is the entire setup for a camera that needs no shape
        drawn: while one runs the area is everything in view, which is
        why the operator marks a time instead. Answering on zones alone
        had such a camera calling itself unconfigured, the module not
        ready, and the page headlined "Not watching any zone" over a view
        that was wholly restricted.

        Until somebody sets a curfew — which is every camera, today —
        this is the same answer it has always given.
        """
        try:
            if len(zone_store.for_source(self._source())) > 0:
                return True
        except Exception:  # noqa: BLE001
            return False

        try:
            return curfew_store.for_source(self._source()) is not None
        except Exception:  # noqa: BLE001
            return False

    def is_ready(self) -> bool:
        """
        Ready only once a zone has been marked, or a curfew set.

        With neither, the detector still runs and annotates people, but it
        can never raise an intrusion — so reporting "ready" would tell the
        operator zones are being watched when none are.
        """
        return self.model_loaded() and self.is_configured()

    # ------------------------------------------------------------------
    # Configuration — the marked zones
    # ------------------------------------------------------------------

    def is_configurable(self) -> bool:
        return True

    def get_config(self) -> dict[str, Any]:
        """
        The marked zones — and the first one under the old key.

        ``polygon`` carries the first zone's corners so every reader of the
        single-polygon shape, the phase suites included, keeps getting what
        it always got: the area this camera has marked, empty when none is.
        """
        zones = zone_store.for_source(self._source())

        curfew = curfew_store.for_source(self._source())
        at, clock = self._curfew_now(curfew)

        return {
            "polygon": list(zones[0]["points"]) if zones else [],
            "curfew": curfew.as_dict() if curfew else None,
            "curfew_active": bool(curfew and curfew.covers(at)),
            "curfew_clock": clock,
            # What that clock reads *now*, and in whose hours. The window
            # and the clock judging it were only ever shown separately,
            # so a five-and-a-half-hour gap between them was invisible on
            # the one screen that could have named it.
            "curfew_now": at.strftime("%Y-%m-%d %H:%M:%S"),
            "curfew_zone": self._curfew_zone(curfew, clock),
            "curfew_days": list(CURFEW_DAYS),
            "zones": [
                {
                    "id": zone["id"],
                    "name": zone["name"],
                    "points": zone["points"],
                    "frame_width": zone["frame_width"],
                    "frame_height": zone["frame_height"],
                }
                for zone in zones
            ],
        }

    def configure(self, payload: dict[str, Any]) -> dict[str, Any]:
        """
        Mark, rename or forget zones.

        Two verbs, old and new, writing through one store:

            {"polygon": [...], "frame_width": ..., "frame_height": ...}
                the camera has exactly this one area now; [] clears them all.
                What this endpoint has always meant.

            {"zone": {"add": {"polygon": [...], "name": "..."}}}
            {"zone": {"rename": {"id": n, "name": "..."}}}
            {"zone": {"remove": n}}
            {"zone": {"clear": true}}
                the multi-zone verbs, shaped like the door module's.

        Raises:
            ValueError: if a polygon could never enclose anybody — same rules
                and wording as ever, from clean_polygon — or a name clashes,
                or the verb is malformed.
        """

        # The curfew, before the zone verbs: it is its own setting and does
        # not touch a single marked shape.
        #
        #   {"curfew": {"start": "22:00", "end": "06:00",
        #               "days": ["fri", "sat"], "enabled": true}}
        #   {"curfew": null}          forget it; zones watch the view again
        if "curfew" in payload:
            wanted = payload["curfew"]

            if wanted in (None, {}, ""):
                cleared = curfew_store.clear(self._source())
                return {
                    "success": True,
                    "message": (
                        "Curfew cleared — the marked zones watch this camera "
                        "again." if cleared else "No curfew was set."
                    ),
                    "curfew": None,
                }

            if not isinstance(wanted, dict):
                raise ValueError(
                    "A curfew needs a start, an end and the days it runs."
                )

            curfew = curfew_store.set(
                self._source(),
                start=wanted.get("start"),
                end=wanted.get("end"),
                days=wanted.get("days"),
                enabled=wanted.get("enabled", True),
                # The zone the browser was showing when these times were
                # typed. Optional, and dropped rather than refused if it
                # will not resolve here — see curfew.py.
                timezone=wanted.get("timezone"),
                utc_offset_minutes=wanted.get("utc_offset_minutes"),
            )

            # Nothing about the marked zones is touched, and the occupancy
            # clocks are: the whole view becoming the area is a different
            # question, so a stretch measured against a zone must not carry
            # into it.
            self._occupied = {}

            at, clock = self._curfew_now(curfew)
            return {
                "success": True,
                "message": "Curfew saved.",
                "curfew": curfew.as_dict(),
                "curfew_active": curfew.covers(at),
                "curfew_clock": clock,
                "curfew_now": at.strftime("%Y-%m-%d %H:%M:%S"),
                "curfew_zone": self._curfew_zone(curfew, clock),
            }

        if "zone" in payload:
            return self._manage(payload["zone"] or {}, payload)

        points = payload.get("polygon") or []
        source = self._source()

        if not points:
            zone_store.clear(source)
            return {
                "success": True,
                "message": "Restricted area cleared.",
                "points": 0,
            }

        zone = zone_store.replace_all(
            source,
            points,
            frame_width=payload.get("frame_width"),
            frame_height=payload.get("frame_height"),
        )

        return {
            "success": True,
            "message": "Restricted area saved.",
            "points": len(zone["points"]),
        }

    def _manage(
        self, action: dict[str, Any], payload: dict[str, Any]
    ) -> dict[str, Any]:
        """The door-shaped verbs: add, rename, remove, clear."""
        source = self._source()

        if "add" in action:
            spec = action["add"] or {}
            zone = zone_store.add(
                source,
                spec.get("polygon") or [],
                name=spec.get("name", ""),
                frame_width=spec.get("frame_width", payload.get("frame_width")),
                frame_height=spec.get(
                    "frame_height", payload.get("frame_height")
                ),
            )
            message = (
                f'Marked "{zone["name"]}".' if zone["name"] else "Zone marked."
            )
            return {
                "success": True,
                "message": message,
                "zone": zone,
                "zones": zone_store.for_source(source),
            }

        if "rename" in action:
            spec = action["rename"] or {}
            if spec.get("id") is None:
                raise ValueError("Which zone to rename is required.")
            zone = zone_store.rename(source, int(spec["id"]), spec.get("name"))
            return {
                "success": True,
                "message": "Zone renamed.",
                "zone": zone,
                "zones": zone_store.for_source(source),
            }

        if "remove" in action:
            removed = zone_store.remove(source, int(action["remove"]))
            if not removed:
                raise ValueError("That zone is not marked on this camera.")
            return {
                "success": True,
                "message": "Zone removed.",
                "zones": zone_store.for_source(source),
            }

        if action.get("clear"):
            gone = zone_store.clear(source)
            return {
                "success": True,
                "message": f"{gone} zone(s) cleared.",
                "zones": [],
            }

        raise ValueError(
            "The zone action must be one of add, rename, remove or clear."
        )


service = RestrictedZoneService()
