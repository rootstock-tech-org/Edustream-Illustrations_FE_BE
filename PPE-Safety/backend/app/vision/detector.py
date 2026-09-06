from ultralytics import YOLO
import cv2
import numpy as np

from app.vision.alarm import alarm
from app.vision.polygon import polygon_manager

# --------------------------------------------------
# Load YOLOv8 Segmentation Model
# --------------------------------------------------

model = YOLO("yolov8n-seg.pt")

print("=" * 60)
print("YOLOv8 Segmentation Model Loaded")
print("=" * 60)

# How much of a person's mask must fall in the restricted area before the
# window/doorway test below will call it an intrusion.
#
# Whole-body overlap, and it is the right measure for exactly one of the two
# ways of being in an area — see SCALE_RATIO. It used to gate the other one
# too, which is what ZONE-01 was.
OVERLAP_THRESHOLD = 0.10

# The picture is flat, and overlap alone cannot tell "standing in the area"
# from "standing in front of it". A person near the camera covered a small
# marked area high in the frame with their head and shoulders and was called
# an intrusion from metres away.
#
# What separates the two is *which part* of the person touches the area.
# Someone standing in a place touches it with their lower body; someone
# merely blocking the view of it covers it with their upper body while their
# legs sit below it in the picture. So a marked patch of floor is decided on
# the lower body alone:
#
#   LOWER_BAND            the bottom fraction of the visible mask that is
#                         asked about — measured from what is visible, so a
#                         person whose feet are hidden behind a desk is
#                         judged by the lowest part of them that shows.
#   LOWER_OVERLAP_THRESHOLD  how much of that band must be inside the area.
LOWER_BAND = 0.35

# 0.18, and it used to be 0.05 — because this used to be the second half of a
# test whose first half was whole-body overlap, and now it is the whole test.
#
# Under the old pairing a floor zone had to cover 10-15% of a standing
# person's height before anything fired: their whole mask is the denominator,
# and a zone drawn round somebody's actual stance can only ever be a small
# slice of it. The reported case is one worker's own foot silhouette, both
# feet fully inside it, scoring 0.091 against the 0.10 bar and raising
# nothing. Measured on their lower body instead, the same zone scores 0.251.
#
# Set from two distributions rather than from that one worker:
#
#   a zone round a real footprint — the bottom 9% of a person's visible
#   height, which is what an operator drawing round somebody's stance gets —
#   measured 0.099 to 0.298 across 28 people in 12 frames, median 0.198
#
#   half that zone, the bottom 4.5%, never once exceeded 0.144
#
# and bounded either side by the degradation sweep on the reported worker,
# where the footprint zone never fell below 0.216 and the half-height zone
# never rose above 0.143 through dim light, blur, JPEG and a 640-160-640
# downscale. So the bar sits in [0.144, 0.216] whichever measurement is
# asked, and 0.18 is near the middle of it: 25% clear of the highest a half
# footprint has ever reached, 20% clear of the lowest a real footprint has.
#
# The two distributions overlap at their tails, so no value separates every
# case, and this one does not. Posture is why: an upright worker's bottom 9%
# is a quarter of their lower body (0.251, 0.258, 0.285 on three of them),
# while a crouching worker's is half that (0.116 and 0.149), because
# crouching spreads the lower body sideways and the bottom of it stops being
# most of it. So a zone drawn round a kneeling worker's own footprint still
# does not fire; one drawn round their stance — 12% of their height, knees
# included — does, where before it took 15%. That gap is real and stays
# written down rather than closed by moving this number under the
# half-footprint measurements, which would alert on half a footprint
# everywhere in exchange.
LOWER_OVERLAP_THRESHOLD = 0.18

# The lower-body test alone is too strict for areas drawn above the floor. A
# person standing at a marked window fails it — the sill is above their
# waist, so their visible bottom hangs below the area — and that person was
# being called clear while standing exactly where the operator pointed.
#
# Perspective offers the missing signal: apparent size falls with distance,
# together. A person at the area's depth appears at the area's scale; the
# person who covered that same window from metres in front of it appeared
# ten times its size, because they were ten times closer. So a person no
# bigger than this many times the area is believably at its depth, and
# their overlap is taken at face value even when their lower body is not in
# it. Someone far larger than the area must touch it with their lower body
# — which, being closer, they cannot.
SCALE_RATIO = 2.5

#: How closely a person's outline may stray from their mask, as a fraction of
#: the mask's perimeter.
#:
#: The raw contour of one person runs to several hundred points. Sent every
#: frame that would cost more than the annotated picture this replaced, so it
#: is simplified before it leaves. At this tolerance a person comes out around
#: 25-45 points, which still reads as a body rather than a blob.
OUTLINE_TOLERANCE = 0.004

#: Hard ceiling on the points sent for one person, however complex the shape.
MAX_OUTLINE_POINTS = 60


def outline_from(contours):
    """
    A person's shape as a short list of points.

    Takes the largest contour: someone standing behind a machine is detected
    as one mask but traced as several fragments, and the body is the piece
    worth drawing. Returns [] when there is no usable shape, which callers
    fall back from to the bounding box.
    """
    if not contours:
        return []

    contour = max(contours, key=cv2.contourArea)
    perimeter = cv2.arcLength(contour, True)

    if perimeter <= 0:
        return []

    tolerance = OUTLINE_TOLERANCE
    points = contour

    # Coarsen until it fits the ceiling. A person against a busy background
    # can trace a ragged edge that the usual tolerance barely simplifies.
    for _ in range(6):
        points = cv2.approxPolyDP(contour, tolerance * perimeter, True)
        if len(points) <= MAX_OUTLINE_POINTS:
            break
        tolerance *= 1.6

    if len(points) < 3:
        return []

    return [(int(p[0][0]), int(p[0][1])) for p in points]


def _grounded_share(person_mask, polygon_mask):
    """
    How much of this person's lower body is inside the marked area.

    Both masks are 0/255 at frame size. The band is taken from the person's
    *visible* extent, so someone whose legs are hidden behind furniture is
    judged by the lowest part of them that shows — which is also what makes a
    person genuinely standing in the area pass while a closer person merely
    covering it from in front does not.

    Returns:
        The share of the band inside the area, 0.0 to 1.0. It used to return
        the comparison rather than the number, because it was a second opinion
        on a verdict whole-body overlap had already reached. It is the verdict
        now for anything at floor level, so the caller compares it and the
        picture is labelled with it — a person called out for standing in an
        area should have the figure that says so printed beside them.
    """
    rows = np.flatnonzero(person_mask.any(axis=1))

    if rows.size == 0:
        return 0.0

    top, bottom = int(rows[0]), int(rows[-1])
    band_start = top + int((bottom - top) * (1 - LOWER_BAND))

    lower = person_mask[band_start:]
    lower_pixels = cv2.countNonZero(lower)

    if lower_pixels == 0:
        return 0.0

    lower_inside = cv2.countNonZero(
        cv2.bitwise_and(lower, polygon_mask[band_start:])
    )

    return lower_inside / lower_pixels


class PersonDetector:

    def __init__(self):
        self.model = model
        self.person_inside = False

        # Counts from the most recent frame. Reporting only, derived from
        # detections that already happen below — no change to what is
        # detected or to how an intrusion is decided.
        self.person_count = 0
        self.inside_count = 0

    def process(self, frame):
        """
        Analyse a frame and record the verdict on this instance.

        Kept for the server-side capture path and for the dashboard's overall
        occupancy figures. Callers that need the verdict for *their own* frame
        must use analyse() instead: reading self.person_inside after this
        returns is a race as soon as two frames are in flight, and one
        caller will read another's answer.
        """
        annotated, state = self.analyse(frame)

        self.person_inside = state["person_inside"]
        self.person_count = state["person_count"]
        self.inside_count = state["inside_count"]

        return annotated

    def analyse(self, frame, zones=None):
        """
        Analyse a frame and return the verdict with it.

        Args:
            frame: BGR picture.
            zones: the areas to judge against — [{"id", "name", "polygon"}]
                with each polygon in this frame's pixels. None keeps the
                legacy behaviour and reads the single stored area, which is
                what the server-capture preview still runs on.

        Returns:
            (annotated_frame, state) where state carries person_inside,
            person_count and inside_count for *this* frame, plus a per-zone
            account under "zones". Nothing is stored on the instance, so
            concurrent callers cannot see each other's results.
        """

        results = self.model(
            frame,
            verbose=False,
            classes=[0],
            conf=0.45,
        )

        annotated = frame.copy()

        height, width = frame.shape[:2]

        # --------------------------------------------------
        # The areas to judge against, each with its own mask
        # --------------------------------------------------

        if zones is None:
            # Legacy path: the single stored area, unnamed.
            single = polygon_manager.points_for(width, height)
            zones = (
                [{"id": 1, "name": "", "polygon": single}]
                if single is not None
                else []
            )

        judged = []
        for zone in zones:
            mask = np.zeros((height, width), dtype=np.uint8)
            cv2.fillPoly(mask, [zone["polygon"]], 255)
            judged.append(
                {
                    "id": zone["id"],
                    "name": zone.get("name") or "",
                    # What the painted stream captions the zone with — the
                    # name, or the name with its occupancy clock appended by
                    # the caller. Kept apart from `name` so the caption never
                    # leaks into summaries or event records.
                    "label": zone.get("label") or zone.get("name") or "",
                    "polygon": zone["polygon"],
                    "mask": mask,
                    "pixels": cv2.countNonZero(mask),
                    "people_inside": 0,
                }
            )

        for zone in judged:
            cv2.polylines(
                annotated,
                [zone["polygon"]],
                True,
                (0, 255, 255),
                2,
            )

            if zone["label"]:
                anchor = zone["polygon"][zone["polygon"][:, 1].argmin()]
                cv2.putText(
                    annotated,
                    zone["label"],
                    (int(anchor[0]), max(16, int(anchor[1]) - 8)),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.55,
                    (0, 255, 255),
                    2,
                )

        # The corner dots were marking aids from when there was one area and
        # no other way to see what had been saved. With several areas they are
        # clutter, so they survive only on a single unnamed one — the legacy
        # look, unchanged.
        if len(judged) == 1 and not judged[0]["name"]:
            for i, point in enumerate(judged[0]["polygon"]):
                x, y = map(int, point)
                cv2.circle(annotated, (x, y), 5, (0, 255, 255), -1)
                cv2.putText(
                    annotated,
                    str(i),
                    (x + 8, y - 8),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.5,
                    (0, 255, 255),
                    2,
                )

        person_inside = False
        person_count = 0
        inside_count = 0

        # Boxes kept alongside the drawing, so a caller can hand the geometry
        # to a browser instead of shipping the painted picture.
        boxes_out = []

        # --------------------------------------------------
        # Process every detected person
        # --------------------------------------------------

        for result in results:

            if result.masks is None:
                continue

            masks = result.masks.data.cpu().numpy()
            boxes = result.boxes

            for i in range(len(boxes)):

                # ------------------------------
                # Bounding Box
                # ------------------------------

                x1, y1, x2, y2 = map(
                    int,
                    boxes[i].xyxy[0],
                )

                confidence = float(boxes[i].conf[0])

                # ------------------------------
                # Person Segmentation Mask
                # ------------------------------

                person_mask = masks[i].astype(np.uint8)

                # Convert mask to 0/255
                person_mask *= 255

                # YOLO returns masks at the model's inference resolution,
                # not the frame's. They match only when the source happens to
                # be 640x480; at 1280x720 the model returns 384x640 and the
                # overlap below fails with a size mismatch. Scale to the frame
                # so the mask, the polygon and the annotation share one
                # coordinate space. Nearest keeps the mask binary.
                if person_mask.shape != (height, width):
                    person_mask = cv2.resize(
                        person_mask,
                        (width, height),
                        interpolation=cv2.INTER_NEAREST,
                    )

                # ------------------------------
                # Compute Overlap, zone by zone
                # ------------------------------

                person_pixels = cv2.countNonZero(person_mask)

                # Judged against every marked zone; a person can only be
                # standing in one patch of floor, but zones may overlap and
                # the alert has to name the right one either way.
                inside_zone_ids = []
                overlap = 0.0
                grounded = 0.0

                # Two ways to be in a marked area, each now measured against
                # the thing it is actually a question about.
                #
                # Standing in a patch of *floor* is a question about the
                # person's lower body, so the lower body is the denominator.
                # It used to be the whole mask, head to toe, with the lower
                # body only asked afterwards for confirmation — and a zone
                # drawn round somebody's actual stance is only ever a small
                # slice of a whole person, so it could not pass. A worker's
                # own foot silhouette, both feet fully inside it, scored 0.091
                # against the 0.10 bar and raised nothing; a floor zone had to
                # cover 10-15% of a standing person's height before it fired
                # at all, and a small one never could however long they stood
                # in it.
                #
                # Standing at a marked *window or doorway* is a question about
                # perspective — the area is off the floor, so the lower-body
                # test cannot answer it and correctly says no. There the whole
                # mask is right and is kept: a person-sized zone above that
                # same worker's feet scores 0.561 and alerts, and a
                # scaled-down copy of it 0.023 and does not.
                #
                # A closer person covering an area from in front still
                # satisfies neither: their legs sit below it in the picture,
                # and being closer they dwarf it.
                for zone in judged:
                    zone_overlap = (
                        cv2.countNonZero(
                            cv2.bitwise_and(person_mask, zone["mask"])
                        ) / person_pixels
                        if person_pixels > 0
                        else 0.0
                    )

                    at_areas_scale = (
                        zone["pixels"] > 0
                        and person_pixels <= SCALE_RATIO * zone["pixels"]
                    )

                    zone_grounded = _grounded_share(person_mask, zone["mask"])

                    in_this_zone = zone_grounded >= LOWER_OVERLAP_THRESHOLD or (
                        at_areas_scale and zone_overlap >= OVERLAP_THRESHOLD
                    )

                    if in_this_zone:
                        inside_zone_ids.append(zone["id"])
                        zone["people_inside"] += 1

                    # The figures reported and printed are the strongest case
                    # against this person, whichever zone made it.
                    if zone_overlap > overlap:
                        overlap = zone_overlap
                    if zone_grounded > grounded:
                        grounded = zone_grounded

                inside = bool(inside_zone_ids)

                person_count += 1

                if inside:
                    person_inside = True
                    inside_count += 1

                # ------------------------------
                # Color
                # ------------------------------

                color = (
                    (0, 0, 255)
                    if inside
                    else (0, 255, 0)
                )

                # ------------------------------
                # Draw Segmentation Contour
                # ------------------------------

                contours, _ = cv2.findContours(
                    person_mask,
                    cv2.RETR_EXTERNAL,
                    cv2.CHAIN_APPROX_SIMPLE,
                )

                # The same shape the contour below draws, kept so a caller can
                # hand it to a browser instead of shipping the painted picture.
                boxes_out.append(
                    {
                        "box": (x1, y1, x2, y2),
                        "outline": outline_from(contours),
                        "inside": inside,
                        "zone_ids": inside_zone_ids,
                        "overlap": round(overlap, 3),
                        # Both shares, because either one can be the reason.
                        # Reporting only the whole-body figure meant a person
                        # flagged for standing in a patch of floor came with
                        # the one number that did not explain why.
                        "grounded": round(grounded, 3),
                    }
                )

                overlay = annotated.copy()

                cv2.drawContours(
                    overlay,
                    contours,
                    -1,
                    color,
                    -1,
                )

                annotated = cv2.addWeighted(
                    overlay,
                    0.25,
                    annotated,
                    0.75,
                    0,
                )

                cv2.drawContours(
                    annotated,
                    contours,
                    -1,
                    color,
                    2,
                )

                # ------------------------------
                # Bounding Box
                # ------------------------------

                cv2.rectangle(
                    annotated,
                    (x1, y1),
                    (x2, y2),
                    color,
                    2,
                )

                # ------------------------------
                # Label
                # ------------------------------

                # The figure beside the verdict is the one that produced it.
                # A floor-level intrusion is decided on the lower body, and
                # printing the whole-body overlap here would put "Restricted
                # (9.1%)" on the picture beside a documented 10% bar — a
                # label arguing with its own verdict.
                if grounded >= LOWER_OVERLAP_THRESHOLD:
                    measure = f"feet {grounded * 100:.1f}%"
                else:
                    measure = f"{overlap * 100:.1f}%"

                if inside:
                    label = f"Restricted ({measure})"
                else:
                    label = f"Person ({measure})"

                cv2.putText(
                    annotated,
                    label,
                    (x1, y1 - 10),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.6,
                    color,
                    2,
                )

        # --------------------------------------------------
        # Alarm
        # --------------------------------------------------

        if person_inside:
            alarm.start()
            status_text = "PERSON INSIDE RESTRICTED AREA"
            status_color = (0, 0, 255)
        else:
            alarm.stop()
            status_text = "NO INTRUSION"
            status_color = (0, 255, 0)

        # --------------------------------------------------
        # Global Status
        # --------------------------------------------------

        cv2.putText(
            annotated,
            status_text,
            (20, 40),
            cv2.FONT_HERSHEY_SIMPLEX,
            1,
            status_color,
            3,
        )

        return annotated, {
            "person_inside": person_inside,
            "person_count": person_count,
            "inside_count": inside_count,
            "people": boxes_out,
            # The first zone's shape, kept under the old key for the callers
            # that predate there being more than one.
            "area": judged[0]["polygon"] if judged else None,
            "zones": [
                {
                    "id": zone["id"],
                    "name": zone["name"],
                    "polygon": zone["polygon"],
                    "people_inside": zone["people_inside"],
                }
                for zone in judged
            ],
            "frame_width": width,
            "frame_height": height,
        }


detector = PersonDetector()