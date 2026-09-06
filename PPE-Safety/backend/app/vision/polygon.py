import json
from pathlib import Path

import cv2
import numpy as np

from app.core.validate import in_range, positive
from app.core.config import STORAGE_DIR

# Path where the restricted area polygon is stored
#: Resolved from the package root rather than the working directory.
#:
#: This was `Path("storage/...")`, which is relative to wherever the process
#: happened to start. Everything documented starts uvicorn from backend/, so it
#: landed in backend/storage and looked correct — but a server started from the
#: repository root read and wrote a second, empty store beside the first, and
#: an operator's marked regions were simply not there. app/core/config.py had
#: already solved this for the model weights, for the same reason.
POLYGON_FILE = STORAGE_DIR / "restricted_area.json"

#: Largest picture, per side, a marked area could plausibly have been drawn on.
#:
#: The area is stored in the pixels of the frame it was drawn against, so
#: "in range" properly means "inside that frame" — and when the frame size was
#: recorded, that is exactly what is checked. Areas drawn before sizes were
#: recorded, and the older /restricted-area route which never sent one, have
#: no frame to be inside; this is the fallback that still refuses the obvious
#: nonsense. 8K video is 7680 wide, so nothing real comes near it, while a
#: corner at 99999 — accepted before, on a 640-pixel picture — does not.
MAX_FRAME_SIDE = 20000.0


def _enclosed_area(corners):
    """How much picture a ring of pixel corners encloses, in square pixels."""
    total = 0.0

    for (x1, y1), (x2, y2) in zip(corners, corners[1:] + corners[:1]):
        total += x1 * y2 - x2 * y1

    return abs(total) / 2.0


def clean_polygon(points, frame_width=None, frame_height=None):
    """
    A drawn area as pixel corners, or a refusal saying what is wrong with it.

    Everything here was accepted silently before, and every one of them
    produced an area the module then reported as fully set up:

        [{-5, 99999}, {0, 0}, {1, 1}]   a corner off the left of a picture
                                        and far below the bottom of it
        three identical points          an area enclosing nothing
        {"x": NaN}                      stored as-is, because Python's json
                                        reads the NaN token the JSON spec
                                        does not have

    None of them can ever detect an intrusion — `overlap_percentage` fills
    the shape into a mask and measures pixels, and all three fill nothing
    that a person could be standing in — while the dashboard, the module's
    own status and the voice all say the zone is being watched. That is the
    worst way for this module to fail: quietly, looking healthy.

    Args:
        points: iterable of objects or mappings carrying `x` and `y`, in the
            pixels of the picture the area was drawn on.
        frame_width, frame_height: that picture's size, when it is known.

    Returns:
        The corners as an int32 array, ready for cv2.

    Raises:
        ValueError: with a message an operator can act on.
    """
    # The picture is the range. A corner outside it marks something that is
    # not in shot, and an area mostly outside it can never hold a person —
    # so it is refused rather than quietly dragged back to the edge, which
    # would move what the operator drew without telling them.
    #
    # `is not None`, not truthiness: a width of zero is a picture nobody can
    # draw on, and it must be refused. Tested as falsy it skipped the check
    # entirely, stored no size at all, and left the area on the "drawn before
    # sizes were recorded" path — where it lands in the wrong part of the
    # picture at any other resolution, with nothing on screen to say so.
    across = (
        positive(frame_width, "The picture width", maximum=MAX_FRAME_SIDE)
        if frame_width is not None
        else MAX_FRAME_SIDE
    )
    down = (
        positive(frame_height, "The picture height", maximum=MAX_FRAME_SIDE)
        if frame_height is not None
        else MAX_FRAME_SIDE
    )

    corners = []

    for index, point in enumerate(points, start=1):
        try:
            x = point["x"] if isinstance(point, dict) else point.x
            y = point["y"] if isinstance(point, dict) else point.y
        except (KeyError, TypeError, AttributeError) as exc:
            raise ValueError(f"Corner {index} needs an x and a y.") from exc

        corners.append(
            (
                in_range(x, f"Corner {index} x", 0.0, across),
                in_range(y, f"Corner {index} y", 0.0, down),
            )
        )

    # Judged on whole pixels, because whole pixels are what gets drawn: the
    # mask the overlap is measured against is filled from these same rounded
    # corners, so an area that rounds away is an area that can never fire.
    pixels = [(int(x), int(y)) for x, y in corners]

    if len(set(pixels)) < 3:
        raise ValueError(
            "An area needs at least 3 different corners. "
            "Mark three separate points around the area."
        )

    if _enclosed_area(pixels) <= 0:
        raise ValueError(
            "Those corners enclose nothing — they lie in a straight line. "
            "Mark a shape with some width to it."
        )

    return np.array(pixels, dtype=np.int32)


class PolygonManager:

    def __init__(self, path=None, noun="restricted area"):
        """
        Args:
            path: where this area is stored. Defaults to the original file, so
                the deployment-wide restricted area keeps the path it has
                always had and nothing has to be migrated.
            noun: what to call it in the log line, since there is now more
                than one and "[Polygon] No restricted area found." said twice
                about two different areas is not a useful thing to read.

        A second area was needed for the vehicle module — a forklift aisle and
        a people-restricted floor are not the same shape and an operator marks
        them separately — and every rule about what makes an area usable, how
        it binds to the camera it was drawn on, and how overlap is measured
        was already right here. Giving this a path was the whole of the change.
        """
        self.path = path if path is not None else POLYGON_FILE
        self.noun = noun

        self.polygon = None

        # Points exactly as stored on disk. Kept alongside `polygon` so reads
        # round-trip what was written, even when there are too few points to
        # form a usable area.
        self.points = []

        # What the area was drawn against. An area is a set of coordinates on
        # one particular picture: applied to a different camera it means
        # nothing, and applied at a different resolution it lands in the wrong
        # place. Recording both is what makes those cases detectable instead
        # of silently wrong.
        self.source = None
        self.frame_width = None
        self.frame_height = None

        self.load()

    def load(self):
        """
        Load restricted area polygon from JSON.
        """

        if not self.path.exists():
            self._forget()
            print(f"[Polygon] No {self.noun} found.")
            return

        try:
            with open(self.path, "r") as f:
                data = json.load(f)

            points = data.get("polygon", [])

            self.points = points
            self.source = data.get("source")
            self.frame_width = data.get("frame_width")
            self.frame_height = data.get("frame_height")

            if len(points) < 3:
                self.polygon = None
                print("[Polygon] Polygon has fewer than 3 points.")
                return

            try:
                self.polygon = clean_polygon(
                    points, self.frame_width, self.frame_height
                )
            except ValueError as exc:
                # An area written before it was checked, or by hand. The
                # points are kept so a read still round-trips the file, but
                # there is no usable area — which is what `is_ready` and the
                # dashboard now say, instead of reporting a zone that cannot
                # detect anything as fully set up.
                self.polygon = None
                print(f"[Polygon] Stored area is not usable: {exc}")
                return

            print(
                f"[Polygon] Loaded {len(points)} points "
                f"for {self.source or 'an unknown source'} "
                f"at {self.frame_width}x{self.frame_height}"
            )

        except Exception as e:
            print("[Polygon] Error:", e)
            self._forget()

    def _forget(self):
        self.polygon = None
        self.points = []
        self.source = None
        self.frame_width = None
        self.frame_height = None

    def save(self, points, source=None, frame_width=None, frame_height=None):
        """
        Persist the restricted area polygon and reload it into memory.

        Args:
            points: iterable of objects or mappings carrying `x` and `y`.
            source: what the area was drawn on, so it can be recognised as
                belonging to a different camera later.
            frame_width, frame_height: the picture size the points are in, so
                they can be scaled if the same camera runs at another size.

        Returns:
            The number of points saved.

        Raises:
            ValueError: if the area could never detect anything — see
                clean_polygon. Checked here rather than in the module, so the
                older /restricted-area route cannot write past it either.
        """

        checked = clean_polygon(points, frame_width, frame_height)

        serialised = [{"x": int(x), "y": int(y)} for x, y in checked]

        self.path.parent.mkdir(parents=True, exist_ok=True)

        with open(self.path, "w") as file:
            json.dump(
                {
                    "polygon": serialised,
                    "source": str(source) if source is not None else None,
                    # Written as whole pixels rather than as they arrived:
                    # clean_polygon has just proved they are real numbers, and
                    # points_for divides by them, which a size that came over
                    # the wire as the string "640" would not survive.
                    "frame_width": (
                        int(frame_width) if frame_width is not None else None
                    ),
                    "frame_height": (
                        int(frame_height) if frame_height is not None else None
                    ),
                },
                file,
                indent=4,
            )

        self.load()

        return len(serialised)

    def points_for(self, width, height):
        """
        The area in the coordinates of a picture this size, or None.

        The stored points are in the pixel space of whatever the area was
        drawn on. Applying them unscaled to a different-sized picture puts
        the area somewhere else entirely — a zone drawn on 1280x720 covers
        only the top-left corner of the same view at 1920x1080.

        Returns None when there is no usable area.
        """

        if self.polygon is None:
            return None

        if not self.frame_width or not self.frame_height:
            # Drawn before sizes were recorded. Assume it matches, which is
            # what the old behaviour did.
            return self.polygon

        if (width, height) == (self.frame_width, self.frame_height):
            return self.polygon

        scale_x = width / self.frame_width
        scale_y = height / self.frame_height

        return np.array(
            [[int(x * scale_x), int(y * scale_y)] for x, y in self.polygon],
            dtype=np.int32,
        )

    def belongs_to(self, source):
        """
        Whether the stored area was drawn on this source.

        An area with no recorded source is treated as belonging to whatever
        is running, so areas drawn before this was tracked keep working.
        """

        if self.source is None:
            return True

        return str(source) == self.source

    def clear(self):
        """
        Remove the restricted area and reload, leaving an empty polygon file.
        """

        self.path.parent.mkdir(parents=True, exist_ok=True)

        with open(self.path, "w") as file:
            json.dump({"polygon": []}, file, indent=4)

        self.load()

    def as_points(self):
        """
        Current polygon as a list of {"x": ..., "y": ...} dicts.

        Returns exactly what is stored on disk, so a read round-trips a write.
        Empty when no area is configured.
        """

        return list(self.points)

    def inside(self, point):
        """
        Check whether a point lies inside the restricted polygon.
        """

        if self.polygon is None:
            return False

        result = cv2.pointPolygonTest(
            self.polygon,
            point,
            False,
        )

        return result >= 0

    def overlap_percentage(self, x1, y1, x2, y2, frame_width=None, frame_height=None):
        """
        How much of a box lies inside the marked area, from 0 to 1.

        `frame_width` and `frame_height` are the size of the picture the box
        was measured on, and leaving them out is a bug waiting to happen.

        The stored area is in the pixels of whatever it was drawn on. The
        browser does not push frames at one size — it steps between 640, 576
        and 512 wide depending on what the link sustains, and it changes step
        mid-session — so a box measured on a 512-wide frame and an area drawn
        on a 640-wide one are two different coordinate spaces. Compared
        unscaled, a forklift standing squarely on the marked floor reported
        "outside the area", and the alarm only arrived once it had wandered far
        enough to overlap where the unscaled area happened to land. That is
        what this argument is for; `points_for` has always known how to do it.

        Returns:
            float between 0 and 1.
        """

        area = (
            self.points_for(frame_width, frame_height)
            if frame_width and frame_height
            else self.polygon
        )

        if area is None:
            return 0.0

        width = max(x2, area[:, 0].max()) + 5
        height = max(y2, area[:, 1].max()) + 5

        polygon_mask = np.zeros((height, width), dtype=np.uint8)
        box_mask = np.zeros((height, width), dtype=np.uint8)

        # Draw polygon
        cv2.fillPoly(
            polygon_mask,
            [area],
            255,
        )

        # Draw person's bounding box
        cv2.rectangle(
            box_mask,
            (x1, y1),
            (x2, y2),
            255,
            -1,
        )

        # Pixels common to both
        intersection = cv2.bitwise_and(
            polygon_mask,
            box_mask,
        )

        overlap_pixels = cv2.countNonZero(intersection)
        box_pixels = cv2.countNonZero(box_mask)

        if box_pixels == 0:
            return 0.0

        return overlap_pixels / box_pixels

    def debug_grid(self, x1, y1, x2, y2, grid_size=10):
        """
        Returns every sampled point and whether it lies
        inside the restricted area.

        Used only for visualization/debugging.
        """

        points = []

        if self.polygon is None:
            return points

        if x2 <= x1 or y2 <= y1:
            return points

        step_x = (x2 - x1) / (grid_size - 1)
        step_y = (y2 - y1) / (grid_size - 1)

        for row in range(grid_size):

            for col in range(grid_size):

                px = int(x1 + col * step_x)
                py = int(y1 + row * step_y)

                points.append(
                    (
                        (px, py),
                        self.inside((px, py)),
                    )
                )

        return points


polygon_manager = PolygonManager()

#: Where a forklift may not go, which is its own shape.
#:
#: Kept apart from the area above rather than shared. The two answer different
#: questions — one is floor people must stay off, the other is floor a vehicle
#: must stay out of — and in a real bay they are frequently the inverse of each
#: other: the aisle a forklift owns is exactly the strip people are kept out
#: of. Sharing one polygon would make marking either one silently re-aim the
#: other.
vehicle_zone_manager = PolygonManager(
    STORAGE_DIR / "vehicle_restricted_area.json",
    noun="vehicle restricted area",
)

#: The walkway that has to stay clear, which is its own shape again.
#:
#: Third area, same reasoning as the second and it applies more strongly here.
#: The other two mark floor something must stay *out of*; this marks floor
#: something must stay *on* — the lane people walk down. In a real bay the
#: walkway is very often the exact strip a forklift is excluded from, so
#: sharing a polygon with either of the others would make marking one silently
#: re-aim the rest.
walkway_manager = PolygonManager(
    STORAGE_DIR / "walkway_area.json",
    noun="walkway",
)