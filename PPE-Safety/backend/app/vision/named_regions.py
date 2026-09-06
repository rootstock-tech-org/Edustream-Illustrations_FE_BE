"""
Areas an operator drew and named, remembered per camera.

Two capabilities need the same thing: a set of rectangles somebody marked on
the picture, each with a name that survives a restart and its own optional
threshold. Doors were the first — mark each doorway once, and from then on
those are the doors the module watches. Workstations are the second, and the
question is the mirror image: mark the place somebody is meant to be, and
alert when nobody is.

What the shared part buys either of them:

    * identity that survives restarts, because an area is a region somebody
      drew rather than a number assigned in order of appearance
    * a picture that holds still, because the box on screen is the region and
      not a detection that jitters
    * silence outside the marked areas
    * a threshold per area, because a fire exit and a loading bay — or a
      packing bench and a night-shift desk — do not deserve the same
      allowance

Regions are stored as fractions of the picture and grouped by the camera they
were drawn against. Switching cameras hides a set rather than destroying it —
deliberately unlike the restricted-zone polygon, which clears. A polygon is
thirty seconds of drawing; a marked-out set is real setup work, and losing it
because somebody previewed another camera would be its own bug.
"""

import json
import threading
from pathlib import Path
from typing import Any, Optional

from app.core.validate import finite, positive
from app.core.config import STORAGE_DIR

#: Smallest region accepted, as a fraction of the picture in each direction.
#: Below this a stray click becomes a region nothing will ever match.
MIN_SIZE = 0.02

#: Overlap above which a new region is refused as a duplicate of an existing
#: one. Two regions over one doorway would both claim the same detection and
#: report the same door twice.
DUPLICATE_IOU = 0.55

#: Longest a name may be. Long enough for "Loading bay, north end".
MAX_NAME = 60


def iou(a: list[float], b: list[float]) -> float:
    """Intersection over union of two boxes, each [x1, y1, x2, y2]."""
    left = max(a[0], b[0])
    top = max(a[1], b[1])
    right = min(a[2], b[2])
    bottom = min(a[3], b[3])

    if right <= left or bottom <= top:
        return 0.0

    overlap = (right - left) * (bottom - top)
    area_a = max(0.0, a[2] - a[0]) * max(0.0, a[3] - a[1])
    area_b = max(0.0, b[2] - b[0]) * max(0.0, b[3] - b[1])
    union = area_a + area_b - overlap

    return overlap / union if union > 0 else 0.0


def _four_numbers(box: Any, noun: str) -> tuple[float, float, float, float]:
    """
    The four corners of `box` as real numbers.

    Shape and arithmetic are separated deliberately. Everything unusable used
    to come back as one word — *small* — so a three-element box, a five-element
    box, a string and `None` were all reported to an API integrator as "that
    area is too small to be a door", which sends them to measure a rectangle
    when the rectangle is not the problem.

    Raises:
        ValueError: the box is not four values, or one of them is not a real
            number. The message says which of the two it was.
    """
    try:
        parts = list(box)
    except TypeError:
        parts = None

    if parts is None or len(parts) != 4:
        if box is None:
            got = "nothing at all"
        elif parts is None:
            got = f"a single {type(box).__name__}"
        else:
            got = f"{len(parts)} of them"

        raise ValueError(
            f"A {noun} is four numbers — left, top, right and bottom, as "
            f"fractions of the picture. This was {got}."
        )

    # Finiteness in the shared checker rather than here: NaN survives the
    # clamping below untouched, because min() and max() are both False against
    # it, and a NaN corner is what left a marked doorway that could never match
    # anything and read "not seen yet" for ever.
    x1, y1, x2, y2 = (
        finite(value, f"That {noun} corner") for value in parts
    )

    return x1, y1, x2, y2


def clean_box(
    box: Any, noun: str = "area", min_area: Optional[float] = None
) -> list[float]:
    """
    A box as four fractions of the picture.

    Corners are sorted rather than assumed: dragging up and to the left is as
    natural as down and to the right, and produces a box that is inside out
    unless someone straightens it.

    Args:
        box: whatever arrived from the operator.
        noun: what one of these is called, for the message they read.
        min_area: smallest share of the whole picture this store will accept,
            or None for no such rule. See `NamedRegions.MIN_AREA`.

    Raises:
        ValueError: the box is the wrong shape, carries a value that is not a
            real number, or is too small — each said in its own words.
    """
    x1, y1, x2, y2 = _four_numbers(box, noun)

    left, right = sorted((x1, x2))
    top, bottom = sorted((y1, y2))

    # Clamped rather than refused. Dragging past the edge of the picture is an
    # ordinary thing to do and what the operator meant is the part of the box
    # that is on screen; refusing it would turn a common gesture into an error
    # message. What cannot be clamped is a number that loses every comparison,
    # and that one is already refused above.
    left = min(max(left, 0.0), 1.0)
    right = min(max(right, 0.0), 1.0)
    top = min(max(top, 0.0), 1.0)
    bottom = min(max(bottom, 0.0), 1.0)

    # Rounded before the size rules, not after, so the rules are asked about
    # the box that will actually be stored and matched against. Measured the
    # other way round, a box whose fourth decimal place rounds downward gets in
    # under a floor it does not meet — which is only a rounding error until the
    # floor is the one that decides whether the area can ever be matched.
    left, top, right, bottom = (
        round(left, 4), round(top, 4), round(right, 4), round(bottom, 4)
    )

    width = right - left
    height = bottom - top

    if width < MIN_SIZE or height < MIN_SIZE:
        raise ValueError(
            f"That area is too small to be a {noun}. "
            f"Drag a box over the {noun}."
        )

    if min_area is not None and width * height < min_area:
        raise ValueError(
            # "Too small to rely on", not "impossible to match". The floor is
            # rounded up from the point where matching stops working, so a
            # sliver just under it could still match on a good frame. Claiming
            # it never could would be the same overstatement this phase spent
            # its time removing everywhere else.
            f"That area covers {width * height:.3%} of the picture, and a "
            f"{noun} under {min_area:.3%} is too small for the AI to rely on "
            f"— it would be marked, watched, and mostly never seen. "
            f"Drag a larger box."
        )

    return [left, top, right, bottom]


def _clean_box(box: Any, min_area: Optional[float] = None) -> Optional[list[float]]:
    """
    A box as four fractions of the picture, or None if it is not usable.

    The same rules as `clean_box`, for callers that want a usable/not-usable
    answer rather than a sentence explaining the refusal. Kept because it is
    imported elsewhere; new code should prefer `clean_box`, which can say what
    was wrong.
    """
    try:
        return clean_box(box, min_area=min_area)
    except ValueError:
        return None


class NamedRegions:
    """
    Marked-out areas, per camera.

    Subclasses supply where they are stored, what to call one when refusing
    it, and the name of the per-region threshold field. Two further class
    attributes let a capability tighten what it will take — a minimum area and
    a threshold ceiling — because whether a marked area is any use depends on
    what the capability does with it afterwards, which is not something this
    class can know. Both are None here, which is no extra rule at all.
    """

    #: Where the set lives on disk.
#: Resolved from the package root rather than the working directory.
#:
#: This was `Path("storage/...")`, which is relative to wherever the process
#: happened to start. Everything documented starts uvicorn from backend/, so it
#: landed in backend/storage and looked correct — but a server started from the
#: repository root read and wrote a second, empty store beside the first, and
#: an operator's marked regions were simply not there. app/core/config.py had
#: already solved this for the model weights, for the same reason.
    path: Path = STORAGE_DIR / "regions.json"

    #: What one of these is, in operator language, for messages and logs.
    noun: str = "area"

    #: The per-region threshold's field name, kept in the stored shape and in
    #: the API so each capability reads in its own terms — a door's allowance
    #: is time open, a workstation's is time empty.
    threshold_field: str = "seconds"

    #: Smallest region this store will accept, as a fraction of the *whole*
    #: picture, or None for no such rule.
    #:
    #: `MIN_SIZE` above is per side and knows nothing about what happens after
    #: marking. Whether a region can ever be matched is a question only the
    #: capability using it can answer: doors discard any detection under
    #: `MIN_DOOR_AREA` of the frame and then require an IoU against it, which
    #: together put a floor on region area that has nothing to do with either
    #: side's length. So the rule is a hook rather than a number here — a store
    #: with a matching rule sets it, and one without leaves it alone.
    #:
    #: None is exactly today's behaviour: only the per-side `MIN_SIZE` applies.
    MIN_AREA: Optional[float] = None

    #: Largest per-region threshold this store will accept, in seconds, or
    #: None for no ceiling.
    #:
    #: Same reasoning as the module-level ceilings: an allowance of 999999
    #: seconds switches the alert off while the module goes on reporting itself
    #: ready, and a per-region override must not be the way round the module's
    #: own limit. The number belongs to the capability, so the store carries
    #: only the hook.
    MAX_THRESHOLD: Optional[float] = None

    def __init__(self, path: Optional[Path] = None) -> None:
        if path is not None:
            self.path = path

        # source -> {"regions": [...], "next_id": n}
        self._cameras: dict[str, dict[str, Any]] = {}

        # Marking comes in over HTTP while frames are analysed on worker
        # threads, so reads and writes genuinely overlap.
        self._lock = threading.Lock()

        self.load()

    # ------------------------------------------------------------------
    # Storage
    # ------------------------------------------------------------------

    def load(self) -> None:
        if not self.path.exists():
            self._cameras = {}
            return

        try:
            data = json.loads(self.path.read_text())
            cameras = data.get("cameras", {})

            self._cameras = {}

            for source, entry in cameras.items():
                # Through _key, not str: files written before the browser
                # picture and "no source" were one identity hold regions
                # under "None", and those marks must come back as the
                # operator's rather than nobody's. Merged rather than
                # replaced, in case a file carries both spellings.
                key = self._key(None if source in ("None", "null") else source)

                merged = self._cameras.setdefault(
                    key, {"regions": [], "next_id": 1}
                )
                for region in entry.get("regions", []):
                    if not region.get("box"):
                        continue

                    # A file written before the corner check existed can hold a
                    # NaN box, and coming back through here it would be exactly
                    # the region the check was added to prevent: marked,
                    # watched and impossible to match. Said out loud rather
                    # than kept, because an area nobody can be told about is
                    # the defect.
                    #
                    # Deliberately without this store's MIN_AREA: that rule
                    # arrived after these were drawn, and applying it here
                    # would delete an operator's existing work on the next
                    # restart rather than at the moment they drew it.
                    if _clean_box(region["box"]) is None:
                        print(
                            f"[{type(self).__name__}] Dropped a stored "
                            f"{self.noun} with an unusable box: "
                            f"{region.get('box')}"
                        )
                        continue

                    merged["regions"].append(region)
                merged["next_id"] = max(
                    merged["next_id"], int(entry.get("next_id", 1))
                )

            total = sum(len(e["regions"]) for e in self._cameras.values())
            print(
                f"[{type(self).__name__}] Loaded {total} {self.noun}(s) "
                f"across {len(self._cameras)} camera(s)."
            )
        except Exception as exc:  # noqa: BLE001
            # A corrupt file must not stop the module loading; the operator
            # can mark the areas again.
            print(f"[{type(self).__name__}] Could not read {self.path}: {exc}")
            self._cameras = {}

    def _save(self) -> None:
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            self.path.write_text(json.dumps({"cameras": self._cameras}, indent=2))
        except Exception as exc:  # noqa: BLE001
            print(f"[{type(self).__name__}] Could not write {self.path}: {exc}")

    @staticmethod
    def _key(source: Any) -> str:
        """
        Camera identity as a dictionary key.

        Sources are ints for a local device and strings for a file or URL, and
        JSON keys are always strings — so the same camera must not become two
        entries depending on which side of a save it is read on.

        No source at all and "browser" are the same identity: the picture on
        the operator's page. Marking goes through the registered module, which
        with no server camera open has no source and used to file the areas
        under "None" — while the copy analysing the operator's frames looked
        them up under "browser", found nothing, and carried on regardless.
        One door marked, two doors reported.
        """
        if source is None or source == "" or source == "browser":
            return "browser"

        return str(source)

    # ------------------------------------------------------------------
    # Reading
    # ------------------------------------------------------------------

    def for_source(self, source: Any) -> list[dict[str, Any]]:
        """
        The areas marked on this camera, or [] if none have been.

        Copies are returned. The caller holds these across frames while
        marking may be rewriting them underneath.
        """
        with self._lock:
            entry = self._cameras.get(self._key(source))
            return [dict(region) for region in entry["regions"]] if entry else []

    def is_calibrated(self, source: Any) -> bool:
        return bool(self.for_source(source))

    # ------------------------------------------------------------------
    # Marking
    # ------------------------------------------------------------------

    def add(
        self, source: Any, box: Any, name: str = "", threshold: Any = None
    ) -> dict[str, Any]:
        """
        Mark an area.

        Raises:
            ValueError: the box is unusable, the name is taken, or it lands on
                an area that is already marked. An unusable box says which
                rule it broke — shape, arithmetic or size — rather than
                reporting all three as a size.
        """
        clean = clean_box(box, self.noun, self.MIN_AREA)

        name = self._clean_name(name)
        threshold = self._clean_threshold(threshold)

        key = self._key(source)

        with self._lock:
            entry = self._cameras.setdefault(key, {"regions": [], "next_id": 1})

            for existing in entry["regions"]:
                if iou(clean, existing["box"]) >= DUPLICATE_IOU:
                    raise ValueError(
                        f"That overlaps \"{existing['name'] or f'an existing {self.noun}'}\". "
                        "Move or delete that one first."
                    )

                if name and existing["name"].lower() == name.lower():
                    raise ValueError(
                        f'There is already a {self.noun} called "{name}".'
                    )

            region = {
                "id": entry["next_id"],
                "name": name,
                "box": clean,
                self.threshold_field: threshold,
            }

            entry["next_id"] += 1
            entry["regions"].append(region)

            self._save()

        return dict(region)

    def update(
        self, source: Any, region_id: int, changes: dict[str, Any]
    ) -> dict[str, Any]:
        """Move, resize, rename, or re-threshold a marked area."""
        key = self._key(source)

        with self._lock:
            entry = self._cameras.get(key)
            target = self._find(entry, region_id)

            if target is None:
                raise ValueError(f"That {self.noun} is not marked on this camera.")

            if "box" in changes:
                clean = clean_box(changes["box"], self.noun, self.MIN_AREA)

                for other in entry["regions"]:
                    if other is target:
                        continue
                    if iou(clean, other["box"]) >= DUPLICATE_IOU:
                        raise ValueError(
                            f"That would overlap \"{other['name'] or f'another {self.noun}'}\"."
                        )

                target["box"] = clean

            if "name" in changes:
                name = self._clean_name(changes["name"])

                for other in entry["regions"]:
                    if other is target or not name:
                        continue
                    if other["name"].lower() == name.lower():
                        raise ValueError(
                            f'There is already a {self.noun} called "{name}".'
                        )

                target["name"] = name

            if self.threshold_field in changes:
                target[self.threshold_field] = self._clean_threshold(
                    changes[self.threshold_field]
                )

            self._save()
            return dict(target)

    def remove(self, source: Any, region_id: int) -> bool:
        key = self._key(source)

        with self._lock:
            entry = self._cameras.get(key)

            if not entry:
                return False

            before = len(entry["regions"])
            entry["regions"] = [
                region for region in entry["regions"] if region["id"] != region_id
            ]

            if len(entry["regions"]) == before:
                return False

            self._save()
            return True

    def clear(self, source: Any) -> int:
        """Forget this camera's marked areas."""
        key = self._key(source)

        with self._lock:
            entry = self._cameras.get(key)

            if not entry:
                return 0

            removed = len(entry["regions"])
            entry["regions"] = []

            self._save()
            return removed

    # ------------------------------------------------------------------

    @staticmethod
    def _find(entry, region_id) -> Optional[dict[str, Any]]:
        if not entry:
            return None

        for region in entry["regions"]:
            if region["id"] == region_id:
                return region

        return None

    @staticmethod
    def _clean_name(name: Any) -> str:
        """
        An area's name, as it will be shown and exported.

        Control characters are stripped rather than escaped: this text reaches
        event summaries, the CSV export and the operator's screen, and a name
        containing a newline would break a spreadsheet row in half. Formula
        characters are dealt with at the point of export, where the danger
        actually is.
        """
        if name is None:
            return ""

        text = "".join(
            character
            for character in str(name)
            if character.isprintable() or character == " "
        ).strip()

        return text[:MAX_NAME]

    def _clean_threshold(self, value: Any) -> Optional[float]:
        """
        An area's own allowance, or None to follow the module default.

        Checked with the shared number checker rather than by hand: `<= 0` is
        False for NaN, so a per-region allowance of NaN used to be stored, and
        every later comparison against it was False too — an area whose alert
        could never fire, marked and reported as watched.

        An instance method rather than a static one so the ceiling can be a
        per-store decision; `MAX_THRESHOLD` is None here, which is no ceiling
        and exactly today's behaviour.
        """
        if value is None or value == "":
            return None

        return positive(
            value, "The allowed time", maximum=self.MAX_THRESHOLD
        )
