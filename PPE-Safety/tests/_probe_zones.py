"""
The restricted zone, at the numbers the debug report printed.

Two defects and six guards, all on the same two real frames the report used.
Nothing synthetic except the polygons, which are the thing under test.

    ZONE-01  the foot silhouette on `fakecam_500.png`. A zone drawn round the
             walking worker's actual feet — x130-225, y405-443, 38px tall,
             feet 100% inside — measured 0.091 against a 0.10 bar and did not
             alert. The sweep either side of it is here too, because the plan
             asks for two things at once: 38px must fire and 23px (5.5% of the
             person's height) must not.

    ZONE-02  the same zone one notch larger — y400-443, baseline overlap
             0.104, inside=True — carried through the report's own
             degradation table. Every level in it flipped the verdict to
             "outside" or lost the person entirely.

    guards   the cases the report lists under "what was attacked and held",
             which this phase must not break:

               near-camera person vs a small distant zone   0.045, no alert
               a 15x15 zone inside a footprint              0.003
               whole-frame zone, frame-edge zone
               concave polygon fill
               a zone drawn at 1280x960 read back at 640x480
               the window/doorway path at the person's own scale

The zone is set in process, by assignment, exactly as the original diagnostic
did — `polygon_manager.save` writes to `storage/restricted_area.json`, and a
verification suite must not leave its test polygons in the product's config.

Prints one JSON object on its last line.

    cd backend && PYTHONPATH=$PWD .venv/bin/python ../tests/_probe_zones.py
"""

import json
import sys
import traceback
from pathlib import Path
from typing import Any, Optional

import cv2
import numpy as np

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
sys.path.insert(0, str(REPO / "backend"))

from app.vision.detector import detector  # noqa: E402
from app.vision.polygon import polygon_manager  # noqa: E402

#: The debugging agents' own frames, kept where they were produced.
DIAG = Path(
    "/tmp/claude-0/-home-user-vikasgroup-visual-analytics-fullstack-beta"
    "/34a9e001-1e22-5fc0-a6b4-dd924c10c2cc/scratchpad/diag"
)

#: The walking worker on `fakecam_500.png`, and the kneeling welder beside
#: him. Both boxes are from the report.
WALKER = (109, 24, 241, 443)
WELDER = (306, 73, 497, 445)


def set_zone(points, width, height) -> None:
    """Mark an area for this process only, touching nothing on disk."""
    polygon_manager.polygon = np.array(points, dtype=np.int32)
    polygon_manager.points = [{"x": int(x), "y": int(y)} for x, y in points]
    polygon_manager.frame_width = width
    polygon_manager.frame_height = height
    polygon_manager.source = "phase3-verification"


def clear_zone() -> None:
    polygon_manager.polygon = None
    polygon_manager.points = []
    polygon_manager.frame_width = None
    polygon_manager.frame_height = None
    polygon_manager.source = None


def near(box, target, slack: int = 20) -> bool:
    """Whether a detection is the one the report named, allowing for jitter."""
    return all(abs(float(a) - float(b)) <= slack for a, b in zip(box, target))


def person_in(state: dict[str, Any], target) -> Optional[dict[str, Any]]:
    return next(
        (p for p in state.get("people", []) if near(p.get("box", ()), target)),
        None,
    )


def look(frame: np.ndarray, target=None) -> dict[str, Any]:
    """One analysis, reduced to what the report measured."""
    _, state = detector.analyse(frame)

    out: dict[str, Any] = {
        "person_inside": bool(state["person_inside"]),
        "person_count": int(state["person_count"]),
        "inside_count": int(state["inside_count"]),
        "people": [
            {
                "box": [int(v) for v in p.get("box", ())],
                "overlap": p.get("overlap"),
                "inside": bool(p.get("inside")),
            }
            for p in state.get("people", [])
        ],
    }

    if target is not None:
        subject = person_in(state, target)
        out["subject"] = (
            None
            if subject is None
            else {
                "box": [int(v) for v in subject["box"]],
                "overlap": subject.get("overlap"),
                "inside": bool(subject.get("inside")),
            }
        )

    return out


def through_the_module(frame: np.ndarray) -> dict[str, Any]:
    """
    The same frame as the operator's screen sees it.

    The detector's `inside` flag is the geometry; this is the sentence. They
    can disagree — Phase 2's gate withholds an alert on a picture nobody can
    read — and where they do, that difference is the finding.

    The zone travels the way this probe's own zones always have: by
    assignment, in memory, nothing written to disk. The module stopped
    reading the single polygon when zones became several and named — it asks
    the zone store for the current camera's zones now — so the polygon under
    test is placed there for the duration of the call and the store is put
    back exactly as it was. `zone_store.add` is deliberately not used: it
    saves to `storage/restricted_zones.json`, and a verification suite must
    not leave its test polygons in the product's config.
    """
    from app.camera import camera_manager
    from app.modules.restricted_zone.service import RestrictedZoneService
    from app.vision.zone_store import zone_store

    checker = RestrictedZoneService().for_session()
    checker._origin = None
    checker.single_frame = True

    key = zone_store._key(camera_manager.current_source)
    parked = zone_store._cameras.get(key)

    if polygon_manager.points:
        zone_store._cameras[key] = {
            "next_id": 2,
            "zones": [
                {
                    "id": 1,
                    "name": "",
                    "points": [dict(p) for p in polygon_manager.points],
                    "frame_width": polygon_manager.frame_width,
                    "frame_height": polygon_manager.frame_height,
                }
            ],
        }

    try:
        _, result = checker.process(frame)
    except Exception as exc:  # noqa: BLE001
        return {"error": f"{type(exc).__name__}: {exc}"}
    finally:
        if parked is None:
            zone_store._cameras.pop(key, None)
        else:
            zone_store._cameras[key] = parked

    return {
        key: result[key]
        for key in (
            "alert", "status", "summary", "readable", "unreadable_reason",
            "people_total", "people_inside", "people_unverified",
        )
        if key in result
    }


def head_zone_of(frame: np.ndarray, target) -> Optional[list]:
    """
    A rectangle round the top of one person's own segmentation mask.

    The near-camera guard's number depends on the zone sitting exactly on the
    head rather than near it, so it is measured off the mask the same model
    produces rather than typed out.
    """
    from app.vision.detector import model

    height, width = frame.shape[:2]

    for result in model(frame, verbose=False, classes=[0], conf=0.45):
        if result.masks is None:
            continue

        masks = result.masks.data.cpu().numpy()

        for index in range(len(result.boxes)):
            box = tuple(int(v) for v in result.boxes[index].xyxy[0])

            if not near(box, target):
                continue

            mask = masks[index].astype(np.uint8) * 255

            if mask.shape != (height, width):
                mask = cv2.resize(mask, (width, height),
                                  interpolation=cv2.INTER_NEAREST)

            rows = np.flatnonzero(mask.any(axis=1))

            if rows.size == 0:
                return None

            top = int(rows[0])
            columns = np.flatnonzero(mask[top:top + 40].any(axis=0))

            if columns.size == 0:
                return None

            left, right = int(columns.min()), int(columns.max())

            return [(left, top), (right, top), (right, top + 40), (left, top + 40)]

    return None


def darker(frame, factor):
    return np.clip(frame.astype(np.float32) * factor, 0, 255).astype(np.uint8)


def compressed(frame, quality):
    ok, buffer = cv2.imencode(
        ".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), quality]
    )
    return cv2.imdecode(buffer, cv2.IMREAD_COLOR) if ok else frame


def rescaled(frame, size):
    height, width = frame.shape[:2]
    small = cv2.resize(frame, size, interpolation=cv2.INTER_AREA)
    return cv2.resize(small, (width, height), interpolation=cv2.INTER_LINEAR)


def main() -> int:
    out: dict[str, Any] = {}

    frame = cv2.imread(str(DIAG / "fakecam_500.png"))
    street = cv2.imread(str(DIAG / "stillcam_0.png"))

    if frame is None:
        print(json.dumps({"__failed__": True, "why": f"missing {DIAG}"}))
        return 1

    height, width = frame.shape[:2]
    out["frame"] = {"width": width, "height": height}

    # ------------------------------------------------------------------
    # ZONE-01 · the foot silhouette
    # ------------------------------------------------------------------
    set_zone([(130, 405), (225, 405), (225, 443), (130, 443)], width, height)
    out["zone01_foot_silhouette"] = look(frame, WALKER)
    out["zone01_foot_silhouette"]["module"] = through_the_module(frame)

    # The sweep either side of it. Zones grow upward from the worker's feet
    # at y=443, so every one of them is a patch of floor he is standing on;
    # what changes is how much of him is above it. The report's two named
    # points are 23px (5.5% of his height, must not fire) and 43px (10.3%,
    # must fire), with the silhouette itself at 38px between them.
    sweep = []

    for top_y in (443, 430, 425, 420, 415, 410, 405, 400, 390, 380, 360,
                  340, 320, 300, 280, 260, 240):
        set_zone([(130, top_y), (225, top_y), (225, 443), (130, 443)],
                 width, height)
        seen = look(frame, WALKER)
        subject = seen["subject"]
        sweep.append(
            {
                "top_y": top_y,
                "zone_height_px": 443 - top_y,
                "pct_of_body_height": round((443 - top_y) / (443 - 24) * 100, 1),
                "overlap": None if subject is None else subject["overlap"],
                "inside": None if subject is None else subject["inside"],
            }
        )

    out["zone01_sweep"] = sweep

    # ------------------------------------------------------------------
    # ZONE-02 · the boundary under ordinary degradation
    # ------------------------------------------------------------------
    boundary = [(130, 400), (225, 400), (225, 443), (130, 443)]
    degraded: dict[str, Any] = {}

    def measure(label: str, picture: np.ndarray) -> None:
        set_zone(boundary, width, height)
        seen = look(picture, WALKER)
        degraded[label] = {
            "found": seen["subject"] is not None,
            "overlap": None if seen["subject"] is None else seen["subject"]["overlap"],
            "inside": None if seen["subject"] is None else seen["subject"]["inside"],
            "person_count": seen["person_count"],
            "inside_count": seen["inside_count"],
            "module": through_the_module(picture),
        }

    measure("baseline", frame)

    for factor in (0.50, 0.25, 0.12, 0.06):
        measure(f"brightness_{factor:.2f}", darker(frame, factor))

    for kernel in (5, 15, 25, 35):
        measure(f"blur_k{kernel}", cv2.GaussianBlur(frame, (kernel, kernel), 0))

    for quality in (50, 20, 10, 5):
        measure(f"jpeg_q{quality}", compressed(frame, quality))

    for size in ((320, 240), (160, 120)):
        measure(f"downscale_{size[0]}", rescaled(frame, size))

    out["zone02_degradation"] = degraded

    # ------------------------------------------------------------------
    # The guards
    # ------------------------------------------------------------------
    guards: dict[str, Any] = {}

    # The false positive the scale guard was built to prevent, which the
    # report confirms does not reproduce: a person filling the frame whose
    # head happens to cover a small area high up in it. 0.045 against 0.10.
    #
    # The zone is derived from where the welder's head actually is — the top
    # forty rows of his own mask, at that band's own width — rather than from
    # coordinates typed out beside the picture, because that is how the
    # report's 0.045 was produced and a hand-placed rectangle a few pixels
    # off measures something else.
    head = head_zone_of(frame, WELDER)

    if head is None:
        guards["near_camera_small_high_zone"] = {"error": "welder not found"}
    else:
        set_zone(head, width, height)
        guards["near_camera_small_high_zone"] = look(frame, WELDER)
        guards["near_camera_small_high_zone"]["zone"] = head

    # The same idea with a rectangle typed out over his head instead, which
    # is the other place the report's number could have come from.
    set_zone([(340, 80), (400, 80), (400, 110), (340, 110)], width, height)
    guards["near_camera_small_high_zone_hand_placed"] = look(frame, WELDER)

    # A 15x15 patch inside the walking worker's foot silhouette. The report
    # measured 0.003 and called it unable to alert whatever happens.
    set_zone([(175, 425), (190, 425), (190, 440), (175, 440)], width, height)
    guards["tiny_zone_under_a_foot"] = look(frame, WALKER)

    # The window/doorway path: an area at the person's own apparent scale,
    # covering their upper body only, with their feet hanging below it.
    set_zone([(105, 24), (245, 24), (245, 250), (105, 250)], width, height)
    guards["window_at_the_persons_own_scale"] = look(frame, WALKER)

    # The same idea far too small to be at their depth.
    set_zone([(160, 40), (190, 40), (190, 70), (160, 70)], width, height)
    guards["window_far_smaller_than_the_person"] = look(frame, WALKER)

    # Whole frame.
    set_zone([(0, 0), (width - 1, 0), (width - 1, height - 1), (0, height - 1)],
             width, height)
    guards["whole_frame_zone"] = look(frame, WALKER)

    # A zone with nobody in the picture at all.
    set_zone(boundary, width, height)
    guards["empty_scene"] = look(
        np.full((height, width, 3), 120, dtype=np.uint8)
    )

    # Frame-edge zone over a person the frame cuts off, on the street photo.
    if street is not None:
        street_h, street_w = street.shape[:2]
        set_zone([(0, 300), (50, 300), (50, 386), (0, 386)], street_w, street_h)
        guards["frame_edge_zone"] = look(street)

        # Several people, an area under two of them only.
        set_zone([(30, 380), (280, 380), (280, 404), (30, 404)],
                 street_w, street_h)
        guards["several_people_one_marked_patch"] = look(street)
    else:
        guards["frame_edge_zone"] = {"error": "missing stillcam_0.png"}

    # Concave fill, measured on the mask itself rather than through a
    # detection, because the question is whether the polygon encloses what it
    # looks like it encloses.
    corners = [
        (100, 300), (180, 300), (180, 380), (420, 380),
        (420, 300), (500, 300), (500, 460), (100, 460),
    ]
    concave_mask = np.zeros((height, width), dtype=np.uint8)
    cv2.fillPoly(concave_mask, [np.array(corners, dtype=np.int32)], 255)
    guards["concave_polygon"] = {
        "notch_is_outside": int(concave_mask[340, 300]) == 0,
        "left_arm_is_inside": int(concave_mask[340, 140]) == 255,
        "base_is_inside": int(concave_mask[430, 300]) == 255,
    }

    # A zone drawn on a 1280x960 canvas, read back for a 640x480 frame.
    set_zone([(260, 810), (450, 810), (450, 886), (260, 886)], 1280, 960)
    guards["cross_resolution"] = {
        "points_at_640x480": polygon_manager.points_for(width, height).tolist(),
        "expected": [[130, 405], [225, 405], [225, 443], [130, 443]],
        "verdict_matches_the_direct_zone": look(frame, WALKER),
    }

    out["guards"] = guards

    clear_zone()

    print(json.dumps(out))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except Exception:  # noqa: BLE001
        print(json.dumps({"__failed__": True, "traceback": traceback.format_exc()}))
        raise SystemExit(1)
