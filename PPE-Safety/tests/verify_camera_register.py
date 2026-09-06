"""
The camera register: named cameras, honest identifiers, and events that say
which camera saw them.

What is checked, in order:

    1. the register itself — mandatory name and location, duplicate refusal,
       edit without touching the identifier, enable/disable, removal, the
       NEW_CAMERA_DETECTED-once log, and persistence across a restart with
       statuses honestly reset to offline
    2. the live context — a camera announces itself, events carry its name,
       location and identifier, and a disconnect marks it offline without
       forgetting it; reconnection restores it with no questions asked
    3. the clocks — server_timestamp always, camera_timestamp when the
       source reported its own clock, kept apart; a clock living in the
       wrong month earns a warning and blocks nothing
    4. the spec's own restart scenario, end to end at the store level:
       register Weldbay-1 / Laser Area, raise an event, restart, look the
       camera up again — recognised, not re-asked

Run from backend/:

    PYTHONPATH=$PWD .venv/bin/python ../tests/verify_camera_register.py
"""
import sys
import tempfile
import time
from pathlib import Path

from app.camera.registry import CLOCK_SKEW_WARNING, CameraRegistry

failures = 0


def check(name: str, ok: bool, detail: str = "") -> bool:
    global failures
    print(("PASS  " if ok else "FAIL  ") + name + (f"  [{detail}]" if not ok and detail else ""))
    if not ok:
        failures += 1
    return ok


def note(text: str) -> None:
    print(f"      {text}")


with tempfile.TemporaryDirectory() as scratch:
    scratch = Path(scratch)
    registry = CameraRegistry(path=scratch / "register.json")

    # ------------------------------------------------------- 1 · the register

    print("--- 1 · the register\n")

    first = registry.lookup("device-aa11")
    check("an identifier never seen is not registered", not first["registered"])

    log_kinds = [e["event"] for e in registry.log_entries()]
    check("and being seen at all is logged, once, as NEW_CAMERA_DETECTED",
          log_kinds.count("NEW_CAMERA_DETECTED") == 1, str(log_kinds))

    registry.lookup("device-aa11")
    log_kinds = [e["event"] for e in registry.log_entries()]
    check("asking twice does not log twice",
          log_kinds.count("NEW_CAMERA_DETECTED") == 1, str(log_kinds))

    for label, name, place in (
        ("an empty name", "  ", "Laser Area"),
        ("an empty location", "Weldbay-1", ""),
    ):
        try:
            registry.register("device-aa11", name, place)
            check(f"{label} is refused — both fields are mandatory", False,
                  "it was accepted")
        except ValueError:
            check(f"{label} is refused — both fields are mandatory", True)

    record = registry.register(
        "device-aa11", "Weldbay-1", "Laser Area",
        source={"kind": "browser", "label": "HD WebCam (04f2:b6be)"},
    )
    check("a camera registers with name, location, source and a timestamp",
          record["camera_name"] == "Weldbay-1"
          and record["location"] == "Laser Area"
          and record["source"]["kind"] == "browser"
          and bool(record["registered_at"])
          and record["status"] == "active",
          str(record))

    try:
        registry.register("device-aa11", "Other", "Elsewhere")
        check("the same identifier cannot be registered twice", False,
              "the duplicate was accepted")
    except ValueError as exc:
        check("the same identifier cannot be registered twice",
              "Weldbay-1" in str(exc), str(exc))

    edited = registry.update("device-aa11", location="Laser Bay 2")
    check("name and location are editable; the identifier is untouched",
          edited["location"] == "Laser Bay 2"
          and edited["camera_id"] == "device-aa11")

    disabled = registry.update("device-aa11", enabled=False)
    check("a camera can be disabled without being forgotten",
          disabled["enabled"] is False
          and registry.get("device-aa11") is not None)
    registry.update("device-aa11", enabled=True)

    try:
        registry.update("device-zz99", camera_name="Ghost")
        check("editing an unregistered camera is refused", False, "it worked")
    except KeyError:
        check("editing an unregistered camera is refused", True)

    # Persistence: a new instance on the same file is the same register,
    # with statuses honestly reset — nothing is active until it feeds.
    registry.set_context("device-aa11")
    check("while feeding, the camera is active",
          registry.get("device-aa11")["status"] == "active")

    reloaded = CameraRegistry(path=scratch / "register.json")
    survivor = reloaded.get("device-aa11")
    check("the registration survives a restart",
          survivor is not None and survivor["camera_name"] == "Weldbay-1"
          and survivor["location"] == "Laser Bay 2")
    check("but its status honestly resets to offline — active is proved by "
          "frames, not remembered",
          survivor["status"] == "offline")

    # -------------------------------------------------- 2 · the live context

    print("\n--- 2 · events carry their camera\n")

    from app.events.store import EventStore

    events = EventStore(path=scratch / "events.db")

    registry.set_context("device-aa11", camera_epoch_ms=time.time() * 1000)

    # The event store reads the module-level singleton, so the singleton is
    # pointed at this scratch register for the duration.
    import app.camera.registry as registry_module

    kept = registry_module.camera_registry
    registry_module.camera_registry = registry
    try:
        events.observe(
            "restricted-zone",
            [{
                "key": "intrusion-zone-1",
                "severity": "high",
                "summary": "Someone entered restricted zone Test",
                "details": {"people_inside": 1},
            }],
        )
    finally:
        registry_module.camera_registry = kept

    recorded = events.list(limit=1)["events"][0]
    details = recorded["details"]
    note(f"event details: { {k: details[k] for k in sorted(details)} }")

    check("the event says which camera saw it, by name and place",
          details.get("camera") == "Weldbay-1"
          and details.get("camera_location") == "Laser Bay 2",
          str(details))

    check("and by identifier, for the machines",
          details.get("camera_id") == "device-aa11", str(details))

    check("the module's own fields survive the merge untouched",
          details.get("people_inside") == 1, str(details))

    registry.clear_context()
    check("disconnecting marks the camera offline",
          registry.get("device-aa11")["status"] == "offline")
    check("but never forgets it",
          registry.get("device-aa11")["camera_name"] == "Weldbay-1")

    registry.set_context("device-aa11")
    check("reconnecting restores it, active again, no questions asked",
          registry.get("device-aa11")["status"] == "active"
          and registry.lookup("device-aa11")["registered"])

    # ------------------------------------------------------------ 3 · clocks

    print("\n--- 3 · two clocks, kept apart\n")

    context = registry.event_context()
    check("server_timestamp is always present",
          "server_timestamp" in context, str(sorted(context)))

    registry.clear_context()
    registry.set_context("device-aa11", camera_epoch_ms=time.time() * 1000)
    context = registry.event_context()
    check("a camera that reported its clock adds camera_timestamp beside it",
          "camera_timestamp" in context and "server_timestamp" in context,
          str(sorted(context)))
    check("an in-sync clock earns no warning",
          registry.get("device-aa11")["clock_warning"] is None)

    # A camera living in the wrong year — the failure ERP reconciliation
    # actually meets.
    wrong_year = (time.time() + 50_000_000) * 1000
    registry.set_context("device-aa11", camera_epoch_ms=wrong_year)
    warning = registry.get("device-aa11")["clock_warning"]
    note(f"warning: {warning}")

    check("a clock in the wrong year earns a warning naming both times",
          warning is not None
          and abs(warning["skew_seconds"]) > CLOCK_SKEW_WARNING
          and warning["camera_time"] and warning["server_time"],
          str(warning))

    check("and blocks nothing — the camera is still active and still the "
          "context",
          registry.get("device-aa11")["status"] == "active"
          and registry.event_context().get("camera") == "Weldbay-1")

    check("a clock warning is logged",
          any(e["event"] == "CAMERA_CLOCK_WARNING" for e in registry.log_entries()))

    registry.set_context("device-aa11", camera_epoch_ms=time.time() * 1000)
    check("a clock that comes back into agreement clears the warning",
          registry.get("device-aa11")["clock_warning"] is None)

    # -------------------------------------- 4 · the spec's restart scenario

    print("\n--- 4 · the restart scenario, exactly as specified\n")

    # Fresh deployment. A camera starts for the first time.
    site = CameraRegistry(path=scratch / "site.json")
    asked = site.lookup("usb-cam-77")
    check("first start: the system does not know the camera, so the popup "
          "would be shown",
          not asked["registered"])

    site.register("usb-cam-77", "Weldbay-1", "Laser Area",
                  source={"kind": "browser", "label": "USB2.0 Camera"})
    site.set_context("usb-cam-77", camera_epoch_ms=time.time() * 1000)

    check("registered and feeding: events would carry Weldbay-1 / Laser Area",
          site.event_context().get("camera") == "Weldbay-1"
          and site.event_context().get("camera_location") == "Laser Area")

    # The application stops and starts again.
    restarted = CameraRegistry(path=scratch / "site.json")
    again = restarted.lookup("usb-cam-77")

    check("after the restart the same camera is recognised — no popup",
          again["registered"] is True
          and again["camera"]["camera_name"] == "Weldbay-1"
          and again["camera"]["location"] == "Laser Area")

    # A registered camera's lookup must not log it as new again — the log
    # carries exactly one NEW_CAMERA_DETECTED for it across the whole life
    # of the register, from before it had a name.
    detections = [
        e for e in restarted.log_entries(200)
        if e["event"] == "NEW_CAMERA_DETECTED" and e.get("camera_id") == "usb-cam-77"
    ]
    check("and it was logged as new exactly once, before it had a name — "
          "never again after",
          len(detections) == 1,
          f"{len(detections)} NEW_CAMERA_DETECTED entries")

print(f"\n{'All camera register checks passed.' if failures == 0 else str(failures) + ' FAILED'}")
sys.exit(1 if failures else 0)
