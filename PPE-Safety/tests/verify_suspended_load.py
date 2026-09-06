"""
Suspended load detection — the area, the bar, and above all the honesty.

This capability is named for a hazard it cannot yet see. The module reports
who is standing in the floor a lifting machine works over; it knows nothing
about the load. That gap is the thing most likely to hurt somebody — an
operator reading "no suspended load" off a page that has no way of knowing —
so most of this suite is pointed at it rather than at the geometry.

What is measured here:

    * an area has to be marked before anything is watched at all
    * somebody outside the area does not raise an alarm, and inside does
    * one frame cannot raise an alarm
    * a picture too dark to read is never "nobody in the lifting area"
    * the live count and the sentence beside it never contradict each other
    * every load-dependent answer is None, never False
    * marking this area moves neither of the other three areas
    * the event says medium, not high, and says why

What is deliberately not measured: whether it finds every person. It does
not — the module docstring records a worker it misses — and a suite that
asserted otherwise would be worse than no suite.

Run from `backend/`:

    PYTHONPATH=$PWD .venv/bin/python ../tests/verify_suspended_load.py
"""
import sys
from pathlib import Path

import cv2
import numpy as np

from app.modules.suspended_load.service import (
    CONFIRM_SIGHTINGS,
    PERSON_CONFIDENCE,
    UNBUILT_REASON,
    SuspendedLoadService,
    suspended_load_manager,
)
from app.vision.polygon import (
    polygon_manager,
    vehicle_zone_manager,
    walkway_manager,
)

HERE = Path(__file__).resolve().parent
CLIP = HERE.parent / "backend" / "storage" / "uploads" / "cctv_demo.webm"

failures = 0


def check(name: str, ok: bool, detail: str = "") -> bool:
    global failures
    print(("PASS  " if ok else "FAIL  ") + name + (f"  [{detail}]" if not ok and detail else ""))
    if not ok:
        failures += 1
    return ok


def section(title: str) -> None:
    print(f"\n--- {title}")


def frames(count: int, step: float = 0.6):
    """A handful of frames from the demo clip, spread out."""
    cap = cv2.VideoCapture(str(CLIP))
    fps = cap.get(cv2.CAP_PROP_FPS) or 25
    out = []
    for i in range(count):
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(i * fps * step))
        ok, frame = cap.read()
        if not ok:
            break
        out.append(frame)
    cap.release()
    return out


def fresh() -> SuspendedLoadService:
    """A service with no history, the way a new socket gets one."""
    return SuspendedLoadService()


print("Suspended load detection verification")

# ----------------------------------------------------------------------
section("1 · the honesty contract — what it must never claim")
# ----------------------------------------------------------------------

service = fresh()
empty = service.empty_result()

for field in ("load_detected", "load_raised", "suspended_load"):
    check(
        f"{field} is None, not False — 'not built' and 'no' are different answers",
        empty[field] is None,
        f"{field}={empty[field]!r}",
    )

check("machine_state reads UNKNOWN rather than a state it cannot support",
      empty["machine_state"] == "UNKNOWN", f"{empty['machine_state']!r}")

check("and a reason travels with it, so a screen can say why",
      bool(empty.get("state_reason")), f"{empty.get('state_reason')!r}")

check("the reason says plainly that load detection is not built",
      "not built" in UNBUILT_REASON.lower(), UNBUILT_REASON)

check("the config advertises that it does not detect load",
      service.get_config().get("detects_load") is False,
      f"{service.get_config().get('detects_load')!r}")

check("the three keys every module owes are present",
      all(k in empty for k in ("readable", "unreadable_reason", "people_unverified")),
      f"{sorted(empty)}")

# ----------------------------------------------------------------------
section("2 · nothing is watched until an area is marked")
# ----------------------------------------------------------------------

suspended_load_manager.clear()
service = fresh()

check("with nothing marked the module reports itself unconfigured",
      service.is_configured() is False, f"{service.is_configured()!r}")

pictures = frames(6)
check("the demo clip is readable, so the checks below mean something",
      len(pictures) >= 4, f"{len(pictures)} frames")

_annotated, result = service.process(pictures[0])
check("and with nothing marked it raises nothing at all",
      result["alert"] is False and result["status"] == "idle",
      f"alert={result['alert']} status={result['status']}")

check("saying so in words rather than reporting an all-clear",
      "no lifting area" in result["summary"].lower(), result["summary"])

# ----------------------------------------------------------------------
section("3 · the area, the bar, and the sentence beside the count")
# ----------------------------------------------------------------------

height, width = pictures[0].shape[:2]

# The floor across the middle-bottom, where people in this clip walk.
INSIDE_AREA = [
    {"x": int(width * 0.30), "y": int(height * 0.55)},
    {"x": int(width * 0.72), "y": int(height * 0.55)},
    {"x": int(width * 0.80), "y": int(height * 0.95)},
    {"x": int(width * 0.22), "y": int(height * 0.95)},
]
# A patch of ceiling nobody can stand in.
ELSEWHERE_AREA = [
    {"x": int(width * 0.02), "y": int(height * 0.02)},
    {"x": int(width * 0.18), "y": int(height * 0.02)},
    {"x": int(width * 0.18), "y": int(height * 0.14)},
    {"x": int(width * 0.02), "y": int(height * 0.14)},
]

suspended_load_manager.save(
    INSIDE_AREA, source="suite", frame_width=width, frame_height=height
)
service = fresh()

check("once marked the module reports itself configured",
      service.is_configured() is True)

first = service.process(pictures[0])[1]
check(f"one frame cannot raise the alarm — {CONFIRM_SIGHTINGS} agreeing sightings are required",
      first["alert"] is False, f"alert={first['alert']} after one frame")

check("and it says it is checking rather than reporting nobody there",
      first["workers_in_area"] == 0 or "checking" in first["summary"].lower(),
      f"in_area={first['workers_in_area']} summary={first['summary']!r}")

# The contradiction this branch exists to remove.
contradictions = []
alerted = False
for picture in pictures:
    state = service.process(picture)[1]
    if state["workers_in_area"] > 0 and "nobody" in state["summary"].lower():
        contradictions.append((state["workers_in_area"], state["summary"]))
    alerted = alerted or state["alert"]

check("the count and the sentence beside it never contradict each other",
      not contradictions, f"{contradictions[:2]}")

check("somebody standing in the marked area does raise the alarm",
      alerted, "never alerted across the clip")

# Same frames, an area nobody can be standing in.
suspended_load_manager.save(
    ELSEWHERE_AREA, source="suite", frame_width=width, frame_height=height
)
service = fresh()
elsewhere_alerted = any(service.process(p)[1]["alert"] for p in pictures)
check("the same people against an area they are not in raise nothing",
      not elsewhere_alerted, "alerted on an area nobody is standing in")

# ----------------------------------------------------------------------
section("4 · a picture it cannot read is never an all-clear")
# ----------------------------------------------------------------------

suspended_load_manager.save(
    INSIDE_AREA, source="suite", frame_width=width, frame_height=height
)
service = fresh()

dark = (pictures[0] * 0.03).astype(np.uint8)
dark_result = service.process(dark)[1]

check("a picture too dark to read is reported unverified",
      dark_result["readable"] is False and dark_result["status"] == "unverified",
      f"readable={dark_result['readable']} status={dark_result['status']}")

check("and never says nobody is in the lifting area",
      "nobody" not in dark_result["summary"].lower(), dark_result["summary"])

check("the reason is in the operator's words",
      bool(dark_result["unreadable_reason"]), f"{dark_result['unreadable_reason']!r}")

# ----------------------------------------------------------------------
section("5 · the record it leaves")
# ----------------------------------------------------------------------

service = fresh()
event = None
for picture in pictures:
    state = service.process(picture)[1]
    found = service.events(state)
    if found:
        event = found[0]
        break

check("an alarm writes exactly one event", event is not None)

if event:
    check("keyed on the area rather than the person, so one situation is one row",
          event["key"] == "worker-in-lifting-area", event["key"])

    # Pinned rather than merely observed: the operator chose medium and
    # chose to have it sound. A later phase that detects a real suspended
    # load must earn `high` on its own event and leave this one alone, so a
    # site tuned to this alarm is not re-pointed underneath it.
    check("severity is medium — high is not spent before the load is detectable",
          event["severity"] == "medium", event["severity"])

    check("and it is an alarm rather than a silent log line",
          state.get("alert") is True and bool(state.get("spoken")),
          f"alert={state.get('alert')} spoken={state.get('spoken')!r}")

    check("and the record carries why the load half is unanswered",
          event["details"].get("suspended_load") is None
          and bool(event["details"].get("state_reason")),
          f"{event['details']}")

quiet = fresh()
quiet_state = quiet.process(dark)[1]
check("a picture that could not be read writes nothing to the record",
      quiet.events(quiet_state) == [],
      f"{quiet.events(quiet_state)}")

# ----------------------------------------------------------------------
section("6 · marking this area moves none of the other three")
# ----------------------------------------------------------------------

polygon_manager.clear()
vehicle_zone_manager.clear()
walkway_manager.clear()

suspended_load_manager.save(
    INSIDE_AREA, source="suite", frame_width=width, frame_height=height
)

check("the restricted area is still unmarked", not polygon_manager.as_points())
check("the vehicle area is still unmarked", not vehicle_zone_manager.as_points())
check("the walkway is still unmarked", not walkway_manager.as_points())
check("and this module's own area is the one that was set",
      len(suspended_load_manager.as_points()) == len(INSIDE_AREA))

check("they are four separate files on disk",
      len({
          suspended_load_manager.path,
          polygon_manager.path,
          vehicle_zone_manager.path,
          walkway_manager.path,
      }) == 4)

# ----------------------------------------------------------------------
section("7 · a photograph is judged on its own")
# ----------------------------------------------------------------------

service = fresh()
service.single_frame = True
photo = service.process(pictures[2])[1]

check("a single photo does not wait for a second sighting it will never get",
      photo["alert"] is True or photo["workers_in_area"] == 0,
      f"alert={photo['alert']} in_area={photo['workers_in_area']}")

check("and it still refuses to answer the load question",
      photo["suspended_load"] is None, f"{photo['suspended_load']!r}")

# ----------------------------------------------------------------------

suspended_load_manager.clear()

print(
    f"\n{'All suspended load checks passed.' if failures == 0 else str(failures) + ' FAILED'}"
)
sys.exit(1 if failures else 0)
