"""
Does Phase 1 ship?

Phase 1 is the "stop the system corrupting its own state" phase: timers that
reset when they should not, and numbers that should never have been accepted.
Nothing about detection changes here either, so nothing below measures a model.
Every check asks one of two questions — did an operator action damage state it
had no business touching, or did a value nobody can use get past the door.

    1  one area's alarm survives    DOOR-02 and WS-04. `_calibrate()` and
       work on another             `_mark()` both ended with an unconditional
                                   `self._watched = {}` under a comment
                                   describing a per-region reset. Marking a
                                   second door wiped the first door's live
                                   open-timer and its severity; moving one
                                   workstation reset every other station's
                                   absence clock. Routine maintenance
                                   silently cancelling a live alert.

                                   Also WS-03: `if state["empty_since"]`
                                   treats a legitimate 0.0 as unset, so a desk
                                   that empties at clock zero is reported as
                                   empty for 0.0 seconds for ever.

    2  no unusable number gets in   DOOR-05, DOOR-13, DASH-08. Python's `json`
                                   accepts NaN and Infinity where the
                                   specification does not, so they arrive over
                                   the network as ordinary floats, and every
                                   comparison against NaN is False — which
                                   defeats `value <= 0`, `0 < v < 1` and the
                                   `min`/`max` clamping of a box in exactly the
                                   same way. A NaN door threshold made every
                                   open door "low" severity instantly; a NaN
                                   box coordinate made a marked doorway that
                                   read "not seen yet" for ever. And with no
                                   ceiling at all, `open_seconds: 999999` was
                                   an eleven-day grace period that switches the
                                   alert off while the module reports itself
                                   ready.

                                   Also DOOR-16: a 3-element box, a 5-element
                                   box, `None` and a string were all refused
                                   with "that area is too small to be a door" —
                                   a shape problem reported as a size problem.

    3  degenerate polygons are      DASH-05. `[{-5,99999},{0,0},{1,1}]`, three
       refused                      identical points and `{x: NaN}` were all
                                   accepted with a 200, and the module then
                                   reported `ready: true` while holding an area
                                   that can never raise anything.

    4  what is accepted can be      DOOR-08. `MIN_SIZE` admits a region of
       seen                         0.02 x 0.02 = 0.04% of the frame; the door
                                   module discards any detection under 0.8% of
                                   the frame and then wants an IoU of 0.25
                                   against a survivor. Verified best case was
                                   0.05, so the region was not unlikely to
                                   match — it was arithmetically unable to, and
                                   nobody was told. The floor is computed here
                                   from the module's own constants and then
                                   demonstrated against `match()`.

    5  nothing else moved           Regression guard, and the one that matters
                                   most: six of this report's defects were
                                   introduced by earlier hardening work that
                                   looked right and was never measured.
                                   `capture_baseline.py` recorded what every
                                   module did before Phase 1 started; it is
                                   re-run here and every difference has to be
                                   one somebody meant.

    6  Phase 0 still holds          Phase 1 must not undo Phase 0. Its suite is
                                   run as part of this one rather than trusted.

Usage:

    cd backend && PYTHONPATH=$PWD .venv/bin/python ../tests/verify_phase1.py [--base URL]

Requires a backend on http://127.0.0.1:8012. Sections 2 and 3 write
configuration over the API and put it back; the suite fails loudly if it
cannot.
"""

import json
import math
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Optional

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
BACKEND = REPO / "backend"
PYTHON = str(BACKEND / ".venv/bin/python")

BASE = "http://127.0.0.1:8012"
for index, arg in enumerate(sys.argv):
    if arg == "--base" and index + 1 < len(sys.argv):
        BASE = sys.argv[index + 1]

EXPECTED_MODULES = [
    "restricted-zone",
    "ppe",
    "gloves",
    "mask",
    "face",
    "workstation",
    "door",
    "vehicle-zone",
    "walkways",
    "suspended-load",
]

#: The modules tests/baseline_phase1.json was captured against.
#:
#: `vehicle-zone` and `walkways` were both built long after that capture, so
#: neither has a before-picture in it and every key they own reads as a
#: difference from a baseline that never saw them. That was already costing
#: this suite three failures for vehicle-zone alone before walkways existed —
#: failures that say nothing about Phase 1 and would eventually train somebody
#: to ignore a red result here.
#:
#: The fix is the split phase 2 and phase 3 already use, and not the other one
#: available: re-capturing baseline_phase1.json would turn every check below
#: green by deleting the evidence they exist to weigh. A module with no
#: before-picture is compared against nothing and is said to be new, out loud,
#: in the difference list.
BASELINE_MODULES = [
    "restricted-zone", "ppe", "gloves", "mask", "face", "workstation", "door",
]

NEW_SINCE_BASELINE = [m for m in EXPECTED_MODULES if m not in BASELINE_MODULES]

NAN = float("nan")
INF = float("inf")

failures: list[str] = []
advisories: list[str] = []
results: list[tuple[str, str, str]] = []


def check(name: str, ok: bool, detail: str = "") -> bool:
    """Record one check. Prints the measured value when it fails."""
    print(("PASS  " if ok else "FAIL  ") + name + (f"  [{detail}]" if detail and not ok else ""))
    results.append(("PASS" if ok else "FAIL", name, "" if ok else detail))
    if not ok:
        failures.append(name)
    return ok


def note(name: str, ok: bool, detail: str = "") -> bool:
    """
    A check that reports but does not block.

    Used where the criterion as written is stricter than what the plan asked
    for, or where the finding belongs outside this phase. Either way the number
    is on the table rather than in a paragraph.
    """
    print(("PASS  " if ok else "NOTE  ") + name + (f"  [{detail}]" if detail and not ok else ""))
    results.append(("PASS" if ok else "NOTE", name, "" if ok else detail))
    if not ok:
        advisories.append(name)
    return ok


def section(title: str) -> None:
    print()
    print(f"--- {title}")


# ----------------------------------------------------------------------
# Plumbing
# ----------------------------------------------------------------------


def get_json(path: str, timeout: float = 30.0):
    with urllib.request.urlopen(BASE + path, timeout=timeout) as response:
        return response.status, json.loads(response.read())


def post_json(path: str, payload: Any, timeout: float = 30.0):
    """
    POST a JSON body, NaN and Infinity included.

    `json.dumps` writes them as bare `NaN` and `Infinity` tokens, which the
    JSON specification does not allow and Python's own parser accepts — which
    is exactly the route these values took into the product in the first place.
    A stricter encoder here would test a door nobody comes through.
    """
    request = urllib.request.Request(
        BASE + path,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read().decode()
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode()


def detail_of(body: str) -> str:
    try:
        parsed = json.loads(body)
    except json.JSONDecodeError:
        return body[:200]

    detail = parsed.get("detail", body[:200]) if isinstance(parsed, dict) else body[:200]
    return detail if isinstance(detail, str) else json.dumps(detail)


def run_probe(script: Path, interpreter: list[str], timeout: int = 900) -> dict:
    """Run one probe and return the JSON object it printed on its last line."""
    proc = subprocess.run(
        interpreter + [str(script)],
        cwd=str(BACKEND),
        capture_output=True,
        text=True,
        env={**os.environ, "PYTHONPATH": str(BACKEND), "PHASE0_BASE": BASE},
        timeout=timeout,
    )
    for line in reversed(proc.stdout.splitlines()):
        line = line.strip()
        if line.startswith("{"):
            try:
                return json.loads(line)
            except json.JSONDecodeError:
                continue
    return {
        "__failed__": True,
        "stdout": proc.stdout[-2000:],
        "stderr": proc.stderr[-2000:],
    }


def finite_everywhere(value: Any, path: str = "") -> list[str]:
    """Every path inside `value` holding a number that is not finite."""
    bad = []

    if isinstance(value, dict):
        for key, item in value.items():
            bad += finite_everywhere(item, f"{path}.{key}")
    elif isinstance(value, list):
        for index, item in enumerate(value):
            bad += finite_everywhere(item, f"{path}[{index}]")
    elif isinstance(value, float) and not math.isfinite(value):
        bad.append(f"{path}={value}")

    return bad


# ----------------------------------------------------------------------
# Preflight
# ----------------------------------------------------------------------

print(f"Phase 1 verification · {BASE} · {time.strftime('%Y-%m-%d %H:%M:%S')}")

section("Preflight")

try:
    _, catalog = get_json("/api/modules")
    modules = {m["module_id"]: m for m in catalog["data"]}
except Exception as exc:  # noqa: BLE001
    print(f"FAIL  the backend answers on {BASE}  [{type(exc).__name__}: {exc}]")
    print("\nNothing else can be measured. Start it with:")
    print("  cd backend && .venv/bin/python -m uvicorn app.main:app "
          "--host 0.0.0.0 --port 8012")
    sys.exit(2)

check("the backend answers, and reports every module",
      sorted(modules) == sorted(EXPECTED_MODULES),
      f"got {sorted(modules)}")

# Everything below writes configuration and puts it back. What it puts back is
# read here, once, so a suite that dies half way through says what the machine
# was left holding.
original_config: dict[str, Any] = {}
for module_id in EXPECTED_MODULES:
    if not modules[module_id].get("configurable"):
        continue
    try:
        _, payload = get_json(f"/api/{module_id}/config")
        original_config[module_id] = payload["data"]
    except Exception as exc:  # noqa: BLE001
        original_config[module_id] = {"__unreadable__": str(exc)}

check("nothing is marked on this deployment, so the phase can be measured "
      "from a clean start",
      not (original_config.get("door", {}).get("doors")
           or original_config.get("workstation", {}).get("workstations")
           or original_config.get("restricted-zone", {}).get("polygon")),
      f"door={original_config.get('door', {}).get('doors')} "
      f"workstation={original_config.get('workstation', {}).get('workstations')} "
      f"polygon={original_config.get('restricted-zone', {}).get('polygon')}")

# ----------------------------------------------------------------------
# 1 · one area's alarm survives work on another
# ----------------------------------------------------------------------

section("1 · no operator action on one area disturbs another area's live state")

isolation = run_probe(HERE / "_probe_isolation.py", [PYTHON])

if isolation.get("__failed__"):
    check("the isolation probe runs", False, isolation.get("stderr", "")[-600:])
else:
    for capability, timer, alarm in (
        ("door", "open_seconds", "severity"),
        ("workstation", "empty_seconds", "severity"),
    ):
        for label, measured in isolation[capability].items():
            before, after = measured["before"], measured["after"]

            if measured.get("refused"):
                check(f"{capability}: {label} is accepted at all", False,
                      measured["refused"])
                continue

            if label.startswith("clearing"):
                # The one action that legitimately forgets everything: the
                # operator has just said there is nothing to watch.
                check(f"{capability}: {label} does forget everything, "
                      "which is what clear means",
                      after[timer] is None,
                      f"after {label}, the other area still reads {after}")
                continue

            check(f"{capability}: {label} leaves the first area timing",
                  after[timer] is not None
                  and before[timer] is not None
                  and after[timer] >= before[timer],
                  f"{timer} {before[timer]} -> {after[timer]} across {label}")

            check(f"{capability}: {label} leaves the first area in alarm",
                  after[alarm] == before[alarm] and before[alarm] is not None,
                  f"{alarm} {before[alarm]!r} -> {after[alarm]!r} across {label}")

    zero = isolation.get("workstation_from_clock_zero", {})
    check("a workstation that empties at clock zero still counts the seconds",
          isinstance(zero.get("empty_seconds"), (int, float))
          and zero["empty_seconds"] >= zero.get("elapsed", 0) - 1.5,
          f"empty for {zero.get('empty_seconds')} after {zero.get('elapsed')} "
          "seconds of nobody there")
    check("and it escalates like any other",
          zero.get("severity") is not None,
          f"severity={zero.get('severity')} after {zero.get('elapsed')} seconds")

# ----------------------------------------------------------------------
# 2 · no unusable number reaches a store or a model
# ----------------------------------------------------------------------

section("2a · every numeric setting, over the real API")

#: What each numeric field documents about itself, and therefore which values
#: sit either side of its limits.
#:
#:   seconds       above zero, at or under the module ceiling
#:   open_unit     strictly between 0 and 1 — a confidence of 0 accepts
#:                 everything and 1 accepts nothing
#:   closed_unit   0 to 1 inclusive
MAX_SECONDS = 3600.0

FIELDS: dict[tuple[str, str], str] = {
    ("door", "open_seconds"): "seconds",
    ("workstation", "empty_seconds"): "seconds",
    ("door", "confidence"): "open_unit",
    ("gloves", "confidence"): "open_unit",
    ("ppe", "min_person_height"): "closed_unit",
    ("mask", "min_person_height"): "closed_unit",
}

#: Values every field is asked about, and whether it should take them.
#: "refuse" everywhere means the value is not a usable number at all.
NOT_NUMBERS: dict[str, Any] = {
    "NaN": NAN,
    "positive infinity": INF,
    "negative infinity": -INF,
    "a word": "abc",
    "null": None,
    "an empty string": "",
    "a list": [0.5],
    "an object": {"value": 0.5},
}

BY_KIND: dict[str, dict[str, tuple[Any, str]]] = {
    "seconds": {
        "zero": (0, "refuse"),
        "negative": (-1, "refuse"),
        "just above zero": (1e-9, "accept"),
        "an ordinary value": (5, "accept"),
        "the ceiling itself": (MAX_SECONDS, "accept"),
        "just over the ceiling": (MAX_SECONDS + 0.001, "refuse"),
        "eleven days": (999999, "refuse"),
    },
    "open_unit": {
        "zero": (0, "refuse"),
        "just above zero": (1e-9, "accept"),
        "a half": (0.5, "accept"),
        "just under one": (0.999999, "accept"),
        "one": (1, "refuse"),
        "just over one": (1.000001, "refuse"),
        "negative": (-0.5, "refuse"),
        "huge": (999999, "refuse"),
    },
    "closed_unit": {
        "zero": (0, "accept"),
        "just under zero": (-1e-9, "refuse"),
        "a half": (0.5, "accept"),
        "one": (1, "accept"),
        "just over one": (1.000001, "refuse"),
        "negative": (-0.5, "refuse"),
        "huge": (999999, "refuse"),
    },
}

for (module_id, field), kind in FIELDS.items():
    probes = dict(BY_KIND[kind])
    probes.update({label: (value, "refuse") for label, value in NOT_NUMBERS.items()})

    for label, (value, expected) in probes.items():
        status, body = post_json(f"/api/{module_id}/config", {field: value})

        if expected == "refuse":
            check(f"{module_id}.{field} refuses {label}",
                  status == 400,
                  f"status {status} · {detail_of(body)[:140]!r}")
            check(f"{module_id}.{field} explains why it refused {label}",
                  status == 400 and detail_of(body).strip() != ""
                  and "'" not in detail_of(body),
                  f"status {status} · detail {detail_of(body)[:140]!r}")
        else:
            check(f"{module_id}.{field} still accepts {label}",
                  status == 200,
                  f"status {status} · {detail_of(body)[:140]!r}")

# Read every configuration back: a value that was accepted and is not a real
# number would be sitting in a module right now, ready for the next frame.
for module_id in EXPECTED_MODULES:
    if not modules[module_id].get("configurable"):
        continue

    _, payload = get_json(f"/api/{module_id}/config")
    unusable = finite_everywhere(payload["data"], module_id)

    check(f"{module_id} is not holding a value that is not a real number",
          not unusable,
          "; ".join(unusable))

# The one module with no numeric settings at all must not quietly take one.
status, body = post_json("/api/face/config", {"confidence": 0.5})
check("face, which is not configurable, accepts no numeric setting",
      status in (404, 405),
      f"status {status} · {detail_of(body)[:140]!r}")
note("and says so with a 404 rather than a 405",
     status == 404,
     f"status {status} — the SPA catch-all answers GET on any path, so an "
     "unmounted API path exists for one method and not the other. Same shape "
     "as DASH-10, which is Phase 5")

# Booleans are numbers to Python and not to an operator. Reported rather than
# blocked: it is a JSON typing wrinkle, not one of this phase's defects.
status, _ = post_json("/api/ppe/config", {"min_person_height": True})
note("a JSON boolean is not accepted as a number",
     status == 400, f"status {status} — True was read as 1.0")

section("2b · every shape of bad region box and per-area threshold")

regions = run_probe(HERE / "_probe_regions.py", [PYTHON])

if regions.get("__failed__"):
    check("the region probe runs", False, regions.get("stderr", "")[-600:])
else:
    for store_name, store in regions["stores"].items():
        noun = store["noun"]

        for label in ("nan_left", "nan_all", "infinite", "negative_infinite"):
            outcome = store["boxes"][label]
            check(f"{store_name}: a {label.replace('_', ' ')} box is refused",
                  not outcome["accepted"],
                  f"accepted, and stored {outcome.get('result')}")
            check(f"{store_name}: and refused for being a number nobody can "
                  f"use, not for its size ({label})",
                  not outcome["accepted"]
                  and "real number" in outcome.get("message", ""),
                  f"message {outcome.get('message')!r}")

        # DOOR-16: the shape complaints must be about shape.
        for label in ("three_long", "five_long", "empty_list", "none",
                      "a_number", "nested"):
            outcome = store["boxes"][label]
            message = outcome.get("message", "")
            check(f"{store_name}: a {label.replace('_', ' ')} box is refused "
                  "for its shape, not its size",
                  not outcome["accepted"]
                  and "too small" not in message
                  and "four numbers" in message,
                  f"accepted={outcome['accepted']} message={message!r}")

        for label in ("not_a_list", "none_inside", "dict_keys"):
            outcome = store["boxes"][label]
            message = outcome.get("message", "")
            check(f"{store_name}: a {label.replace('_', ' ')} box is refused "
                  "for what it contains, not its size",
                  not outcome["accepted"] and "too small" not in message,
                  f"accepted={outcome['accepted']} message={message!r}")

        # And the boxes that must still work, or the fix has broken marking.
        for label in ("ordinary", "reversed", "whole_frame"):
            outcome = store["boxes"][label]
            check(f"{store_name}: an {label.replace('_', ' ')} box is still "
                  "accepted",
                  outcome["accepted"],
                  f"refused with {outcome.get('message')!r}")

        # Whatever the store did accept, what it wrote down has to be four
        # real numbers inside the picture — that is the whole of DOOR-13, and
        # the reply saying so is not the same as the file holding it.
        for label, outcome in store["boxes"].items():
            if not outcome["accepted"]:
                continue

            held = outcome.get("stored_box")
            check(f"{store_name}: the {label.replace('_', ' ')} box it "
                  "accepted was stored as four real numbers inside the picture",
                  isinstance(held, list) and len(held) == 4
                  and all(isinstance(v, (int, float)) and math.isfinite(v)
                          and 0.0 <= v <= 1.0 for v in held),
                  f"stored {held!r}")

        # The smallest area this store will take, and the boxes either side of
        # it. Measured, not read off a constant — the point is where the floor
        # actually is.
        boundary = store.get("boundary", {})
        floor = store["smallest_accepted"]

        check(f"{store_name}: the smallest area it takes is {floor.get('area')} "
              "of the picture, and it takes it",
              boundary.get("at the floor", {}).get("accepted") is True,
              f"refused its own floor: {boundary.get('at the floor')}")
        check(f"{store_name}: a hair under that floor is refused",
              boundary.get("a hair under it", {}).get("accepted") is False,
              f"accepted {boundary.get('a hair under it')}")
        check(f"{store_name}: a hair over it is still accepted",
              boundary.get("a hair over it", {}).get("accepted") is True,
              f"refused {boundary.get('a hair over it')}")

        # The same rules, on the path that moves an area that already exists.
        for label in ("nan_left", "infinite", "three_long", "none"):
            outcome = store["updates"][label]
            check(f"{store_name}: moving an area onto a {label.replace('_', ' ')} "
                  "box is refused too",
                  not outcome["accepted"],
                  f"accepted: {outcome.get('result')}")

        for label, expected in (
            ("nan", "refuse"),
            ("infinity", "refuse"),
            ("negative_infinity", "refuse"),
            ("zero", "refuse"),
            ("negative", "refuse"),
            ("text", "refuse"),
            ("huge", "refuse"),
            ("just_over_an_hour", "refuse"),
            ("ordinary", "accept"),
            ("hour", "accept"),
            ("none", "accept"),
        ):
            outcome = store["thresholds"][label]
            ok = outcome["accepted"] == (expected == "accept")
            check(f"{store_name}: a per-area allowance of "
                  f"{label.replace('_', ' ')} is {expected}d",
                  ok,
                  f"accepted={outcome['accepted']} "
                  f"message={outcome.get('message', '')!r}")

# The API path, once, so the 400 mapping is proved and nothing is left marked.
for module_id, verb, box_field in (
    ("door", "door", "open_seconds"),
    ("workstation", "workstation", "empty_seconds"),
):
    for label, box in (
        ("a NaN corner", [NAN, 0.1, 0.4, 0.9]),
        ("an infinite corner", [0.1, 0.1, INF, 0.9]),
        ("three numbers", [0.1, 0.2, 0.3]),
        ("no box at all", None),
    ):
        status, body = post_json(
            f"/api/{module_id}/config", {verb: {"add": {"box": box}}}
        )
        check(f"{module_id}: marking an area with {label} is a 400",
              status == 400,
              f"status {status} · {detail_of(body)[:140]!r}")

    status, body = post_json(
        f"/api/{module_id}/config",
        {verb: {"add": {"box": [0.2, 0.2, 0.5, 0.9], "name": "phase1 probe",
                        box_field: NAN}}},
    )
    check(f"{module_id}: marking an area with a NaN allowance is a 400",
          status == 400,
          f"status {status} · {detail_of(body)[:140]!r}")

    _, payload = get_json(f"/api/{module_id}/config")
    marked = payload["data"].get("doors" if module_id == "door" else "workstations")
    check(f"{module_id}: and none of that left anything marked",
          not marked, f"marked: {marked}")

# ----------------------------------------------------------------------
# 3 · degenerate polygons
# ----------------------------------------------------------------------

section("3 · every degenerate polygon from the report is refused")


def zone_ready() -> bool:
    _, payload = get_json("/api/restricted-zone/status")
    return bool(payload["data"].get("ready"))


def points(*pairs) -> list[dict[str, Any]]:
    return [{"x": x, "y": y} for x, y in pairs]


DEGENERATE = {
    # The report's own three, verbatim.
    "the report's out-of-range triangle": points((-5, 99999), (0, 0), (1, 1)),
    "three identical points": points((100, 100), (100, 100), (100, 100)),
    "a NaN coordinate": points((NAN, 100), (200, 100), (150, 300)),
    # And the neighbours of each.
    "an infinite coordinate": points((INF, 100), (200, 100), (150, 300)),
    "one point": points((100, 100)),
    "two points": points((100, 100), (200, 200)),
    "three collinear points": points((0, 0), (100, 100), (200, 200)),
    "two distinct points repeated": points((0, 0), (100, 100), (0, 0), (100, 100)),
    "a negative coordinate": points((-40, 100), (200, 100), (150, 300)),
    "a coordinate past the frame": points((100, 100), (99999, 100), (150, 300)),
    "a coordinate that is a word": points(("left", 100), (200, 100), (150, 300)),
    "a point with no y": [{"x": 10}, {"x": 200, "y": 100}, {"x": 150, "y": 300}],
}

for label, polygon in DEGENERATE.items():
    status, body = post_json(
        "/api/restricted-zone/config",
        {"polygon": polygon, "frame_width": 640, "frame_height": 480},
    )

    check(f"a polygon with {label} is refused",
          status == 400,
          f"status {status} · {detail_of(body)[:140]!r}")
    check(f"and a polygon with {label} does not leave the zone ready",
          not zone_ready(),
          "the module reports ready: true while holding it")

# A frame size is a number the store keeps and later divides by: the area is
# drawn in the pixels of one particular picture, and the recorded size is what
# lets it be scaled to the same view at another resolution. A size that is not
# a usable number takes that with it — and a *zero* one is quietly filed as
# "no size recorded", which is the same falsy-is-unset mistake as WS-03 and
# leaves the area landing in the wrong part of the picture at any other
# resolution, with nothing on screen to say so.
for field in ("frame_width", "frame_height"):
    for label, size in (
        ("NaN", NAN), ("infinite", INF), ("zero", 0), ("negative", -640),
        ("a word", "wide"),
    ):
        payload = {
            "polygon": points((10, 10), (300, 10), (300, 300), (10, 300)),
            "frame_width": 640,
            "frame_height": 480,
        }
        payload[field] = size

        status, body = post_json("/api/restricted-zone/config", payload)

        check(f"a {label} {field.replace('_', ' ')} is refused",
              status == 400,
              f"status {status} · {detail_of(body)[:140]!r}")

        if status == 200:
            post_json("/api/restricted-zone/config", {"polygon": []})

# And an ordinary area must still save, or the fix has closed the feature.
status, body = post_json(
    "/api/restricted-zone/config",
    {"polygon": points((80, 200), (400, 200), (400, 460), (80, 460)),
     "frame_width": 640, "frame_height": 480},
)
check("an ordinary four-cornered area is still saved",
      status == 200, f"status {status} · {detail_of(body)[:140]!r}")
check("and the zone then reports itself ready",
      zone_ready(),
      "saved an area and the module still says it is not ready")

status, body = post_json("/api/restricted-zone/config", {"polygon": []})
check("clearing the area puts the deployment back as it was found",
      status == 200 and not zone_ready(),
      f"status {status} · ready={zone_ready()}")

# ----------------------------------------------------------------------
# 4 · a region the store accepts can actually be matched
# ----------------------------------------------------------------------

section("4 · the smallest area each store accepts can still be seen")

if not regions.get("__failed__"):
    door = regions.get("door_matchability", {})
    real = door.get("against_a_real_door_detection", {})

    check("the smallest region the door store accepts is at least the size "
          "the matching maths needs",
          isinstance(door.get("best_possible_iou"), float)
          and door["best_possible_iou"] >= door["match_iou"],
          f"a region of {door.get('region_area')} of the frame scores at best "
          f"IoU {door.get('best_possible_iou')} against the smallest detection "
          f"the module allows ({door.get('min_detection_area')} of the frame), "
          f"and the bar is {door.get('match_iou')} — short by "
          f"{-(door.get('headroom') or 0):.2e}. The floor is set to exactly "
          f"the bar times the smallest detection, so it has no margin at all: "
          f"the same region scores {real.get('best_possible_iou')} against a "
          f"detection the size of a real door")

    check("and match() actually returns it, rather than the arithmetic merely "
          "allowing it",
          door.get("matchable") is True,
          f"match() returned {door.get('match_returned')!r} for the best "
          f"detection this module will ever produce for that region")

    note("the smallest accepted region can also match a detection the size of "
         "a real door",
         real.get("matchable") is True,
         f"IoU {real.get('best_possible_iou')} against a detection of "
         f"{real.get('detection_area')} of the frame — the smallest real door "
         f"on the office footage — versus a bar of {door.get('match_iou')}. "
         f"Regions between {(real.get('accepted_but_dead_band') or [0])[0]} "
         f"and {real.get('accepted_but_dead_below')} of the frame are still "
         "accepted and can match nothing a real doorway produces")

    ordinary = door.get("an_ordinary_doorway", {})
    check("a region drawn round a real doorway matches comfortably",
          ordinary.get("match_returned") is not None,
          f"IoU {ordinary.get('iou')} for a region of "
          f"{ordinary.get('region_area')} of the frame")

    ws = regions.get("workstation_occupiable", {})
    check("the smallest region the workstation store accepts can be occupied",
          ws.get("person_at_it_counts") is True,
          f"a person standing in a region of {ws.get('region_area')} of the "
          "frame did not count as being at it")
    check("while somebody walking past it still does not occupy it",
          ws.get("passer_by_does_not") is False,
          "a person elsewhere in the picture counted as being at it")

# ----------------------------------------------------------------------
# 5 · nothing else moved
# ----------------------------------------------------------------------

section("5 · what Phase 1 changed, against what the system did before it")

BASELINE = HERE / "baseline_phase1.json"
AFTER_LABEL = "phase1_after"
AFTER = HERE / f"baseline_{AFTER_LABEL}.json"

#: Every difference Phase 1 is allowed to make, and why. A difference that
#: matches none of these is a difference nobody can explain, which is a
#: failure whether or not it looks harmless.
INTENDED = [
    (r"^modules\.restricted-zone\.status\.description$",
     "the module grew named multi-zone marking after this baseline was "
     "captured, and its description says what it does now — the alert names "
     "the zone that was entered"),
    (r"^modules\.(door|workstation)\.config\.(open_seconds|empty_seconds)\."
     r"(nan|infinity)\.",
     "DOOR-05 — a grace period that is not a real number is refused"),
    (r"^modules\.(door|workstation)\.config\.(open_seconds|empty_seconds)\."
     r"huge\.",
     "DASH-08 — a grace period above the one-hour ceiling is refused"),
    (r"^modules\.(restricted-zone|workstation)\.status\.configured$",
     "contract §5 — configured now means an operator set it up"),
    (r"^regions\.(door|workstation)\.boxes\.(nan_left|infinite)\.",
     "DOOR-13 — a box corner that is not a real number is refused"),
    (r"^regions\.(door|workstation)\.boxes\."
     r"(three_long|not_a_list|none)\.message$",
     "DOOR-16 — a wrong-shaped box is refused for its shape, not its size"),
    (r"^regions\.door\.constants\.",
     "contract §2 and §3 — the door store gained a minimum area and a "
     "threshold ceiling"),
    (r"^regions\.(door|workstation)\.boxes\.[a-z_]+\.result$",
     "the probes ahead of these are now refused, so the ids handed out shift"),
    (r"^modules\.(door|gloves)\.config\.confidence\.[a-z_]+\.message$",
     "contract §1 — the shared number checker words its refusals its own way. "
     "Only the wording: whether each value is accepted is compared separately"),
    # Added when Phase 1 was closed rather than merely met. Safety Gear,
    # Masks and Gloves were outside every agent's ownership, so they kept
    # hand-rolled checks that let a JSON boolean through as 1.0. Moving them
    # onto the shared checker fixed that and reworded their refusals; every
    # value they already refused is still refused, which is compared apart
    # from the wording.
    (r"^modules\.(ppe|mask)\.config\.min_person_height\.[a-z_]+\.message$",
     "closing Phase 1 — Safety Gear and Masks moved onto the shared number "
     "checker, which words its refusals its own way"),
]


def flatten(value: Any, path: str = "") -> dict[str, Any]:
    if isinstance(value, dict):
        flat: dict[str, Any] = {}
        for key, item in value.items():
            flat.update(flatten(item, f"{path}.{key}" if path else str(key)))
        return flat
    return {path: value}


def without_ids(value: Any) -> Any:
    """A recorded result with its region id taken out."""
    if isinstance(value, str):
        return re.sub(r"'id': \d+, ", "", value)
    return value


capture = subprocess.run(
    [PYTHON, str(HERE / "capture_baseline.py"), AFTER_LABEL],
    cwd=str(BACKEND),
    capture_output=True,
    text=True,
    env={**os.environ, "PYTHONPATH": str(BACKEND)},
    timeout=900,
)

if not check("the baseline can be captured again", AFTER.exists(),
             capture.stderr[-600:] or capture.stdout[-600:]):
    differences: list[tuple[str, Any, Any]] = []
else:
    before = flatten(json.loads(BASELINE.read_text()))
    after = flatten(json.loads(AFTER.read_text()))

    differences = []
    for key in sorted(set(before) | set(after)):
        was = before.get(key, "<absent>")
        now = after.get(key, "<absent>")

        if key.endswith(".result"):
            if without_ids(was) == without_ids(now):
                continue
        elif was == now:
            continue

        differences.append((key, was, now))

    print(f"\n      {len(differences)} difference(s) against "
          f"tests/{BASELINE.name}\n")

    def is_new_module(key: str, was: Any) -> bool:
        """
        Whether this key belongs to a module the baseline never saw.

        `was == "<absent>"` is load-bearing, not decoration: it restricts this
        to keys that only *appeared*. A module built after the capture can
        still be held to everything the baseline does contain, and a value
        that genuinely moved is never excused by this.
        """
        return was == "<absent>" and any(
            key.startswith(f"modules.{module}.") for module in NEW_SINCE_BASELINE
        )

    unexplained = []
    for key, was, now in differences:
        if is_new_module(key, was):
            print(f"      [new since baseline] {key}")
            print(f"                 now: {str(now)[:110]}")
            continue

        reason = next(
            (why for pattern, why in INTENDED if re.match(pattern, key)), None
        )
        mark = "intended" if reason else "UNEXPLAINED"
        print(f"      [{mark}] {key}")
        print(f"                 was: {str(was)[:110]}")
        print(f"                 now: {str(now)[:110]}")
        if reason:
            print(f"                 why: {reason}")
        else:
            unexplained.append(key)

    print()

    check("every difference from the baseline is one Phase 1 meant to make",
          not unexplained,
          f"{len(unexplained)} unexplained: {'; '.join(unexplained[:6])}")

    # The values the plan explicitly promised would not move. Only the modules
    # that existed to make the promise: asking whether a module built months
    # later reports the same `ready` as before Phase 1 compares False against
    # nothing, and answers no every time.
    for module_id in BASELINE_MODULES:
        key = f"modules.{module_id}.status.ready"
        check(f"{module_id} still reports the same ready it reported before "
              "Phase 1",
              before.get(key) == after.get(key),
              f"ready {before.get(key)} -> {after.get(key)}")

    if NEW_SINCE_BASELINE:
        print(f"      not compared, built after the baseline: "
              f"{', '.join(NEW_SINCE_BASELINE)}")

    AFTER.unlink(missing_ok=True)

# ----------------------------------------------------------------------
# 6 · Phase 0 still holds
# ----------------------------------------------------------------------

section("6 · Phase 1 did not undo Phase 0")

phase0 = subprocess.run(
    [PYTHON, str(HERE / "verify_phase0.py"), "--base", BASE],
    cwd=str(BACKEND),
    capture_output=True,
    text=True,
    env={**os.environ, "PYTHONPATH": str(BACKEND)},
    timeout=1800,
)

tally = ""
phase0_failures: list[str] = []
in_failures = False

for line in phase0.stdout.splitlines():
    if "checks passed" in line:
        tally = line.strip()
    if line.startswith("FAILED:"):
        in_failures = True
        continue
    if in_failures and line.startswith("  · "):
        phase0_failures.append(line[4:].strip())
    elif in_failures and not line.strip():
        continue

#: Phase 0 checks that cannot run without the reference photograph the debug
#: report was written against. It is not in this working tree — not ignored by
#: git either, so it was deleted rather than never committed — and its absence
#: is a missing fixture, not a Phase 1 regression. Named individually so a real
#: regression in the same area still fails.
PHOTO = REPO / "tests" / "fixtures" / "check_photo.jpg"
NEEDS_THE_PHOTO = {
    "the browser-camera socket accepts a connection",
    "and a real photograph is still analysed",
}

fixture_only = (
    not PHOTO.exists()
    and phase0_failures
    and set(phase0_failures) <= NEEDS_THE_PHOTO
)

if fixture_only:
    note("Phase 0's own suite still passes in full", False,
         f"{tally} — every failure needs {PHOTO}, which is not in this "
         f"working tree: {'; '.join(phase0_failures)}. Not a Phase 1 "
         "regression, but Phase 0's guarantee about real pictures is "
         "unmeasured until the file is restored")
else:
    check("Phase 0's own suite still passes in full",
          phase0.returncode == 0,
          f"exit {phase0.returncode} · {tally} · "
          f"{'; '.join(phase0_failures[:6])}"
          or phase0.stdout[-600:])

check("Phase 0 ran enough checks to be worth believing",
      "checks passed" in tally and int(tally.split("/")[0]) > 60,
      f"tally {tally!r} · exit {phase0.returncode} · "
      f"{phase0.stderr[-300:]}")

if tally:
    print(f"      Phase 0 reported: {tally}")

# ----------------------------------------------------------------------
# Putting the deployment back
# ----------------------------------------------------------------------

section("Restoring what this suite changed")

for module_id, fields in (
    ("door", ("open_seconds", "confidence")),
    ("workstation", ("empty_seconds",)),
    ("ppe", ("min_person_height",)),
    ("mask", ("min_person_height",)),
    ("gloves", ("confidence",)),
):
    was = original_config.get(module_id, {})
    for field in fields:
        if field not in was:
            continue
        status, body = post_json(f"/api/{module_id}/config", {field: was[field]})
        check(f"{module_id}.{field} is back at {was[field]}",
              status == 200, f"status {status} · {detail_of(body)[:120]!r}")

_, payload = get_json("/api/restricted-zone/config")
check("the restricted area is as empty as it was found",
      payload["data"].get("polygon") == (
          original_config.get("restricted-zone", {}).get("polygon")
      ),
      f"{payload['data'].get('polygon')} vs "
      f"{original_config.get('restricted-zone', {}).get('polygon')}")

for module_id, key in (("door", "doors"), ("workstation", "workstations")):
    _, payload = get_json(f"/api/{module_id}/config")
    check(f"no {key} were left marked by this suite",
          not payload["data"].get(key), f"{payload['data'].get(key)}")

# ----------------------------------------------------------------------

section("Result")

passed = sum(1 for outcome, _, _ in results if outcome == "PASS")
print(f"{passed}/{len(results)} checks passed · "
      f"{len(failures)} failed · {len(advisories)} advisory")

if advisories:
    print("\nAdvisory (reported, not blocking):")
    for name in advisories:
        print(f"  · {name}")

if failures:
    print("\nFAILED:")
    for name in failures:
        print(f"  · {name}")
    print("\nPhase 1 does not ship.")
    sys.exit(1)

print("\nPhase 1's every done-when criterion holds.")
