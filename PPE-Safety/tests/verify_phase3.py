"""
Does Phase 3 ship?

Phase 0 and 1 changed what the system *said*. Phase 2 changed when it declined
to speak. **This phase changes who alerts**, so a mistake in it is a wrong
alarm or a missed one rather than a missing sentence — and the expensive
direction is the second one. Every defect it closes is a rule measuring the
wrong thing: a zone measured against a whole body instead of a footprint, a
mask claimed from a full box instead of a head, a workstation occupied by
whoever's centre happens to pass through it, a doorway matched by two regions
at once.

So the suite spends its effort on two questions. Does each of the eleven
reported failures now come out the other way, at the exact numbers that found
it? And what did that cost the verdicts that were already right?

    1  the eleven defects, at the         ZONE-01, ZONE-02, WS-01, WS-02,
       numbers that found them            WS-06, MASK-02, PPE-03, PPE-08,
                                          DOOR-11, DOOR-12, and the gloves
                                          too-far floor. Each re-run on the
                                          report's own picture, at the
                                          report's own coordinates.

    2  nothing that correctly alerted     The risk of the phase, and the
       before has stopped                 reason it is not shipped with Phase
                                          2. All 147 baseline verdicts are
                                          classed correct, honest or wrong
                                          against what is actually in the
                                          photograph, before and after, and a
                                          verdict that was right and is not
                                          any more fails — whatever it now
                                          says instead.

    3  the guards that already worked     The report's own "attacked and
       still work                         held" list, on the same frames: the
                                          near-camera person against a small
                                          distant zone (0.045 vs a 0.10 bar),
                                          concave polygons, frame-edge and
                                          whole-frame zones, cross-resolution
                                          storage, and two people side by
                                          side each keeping their own helmet.

    4  attribution is exclusive and       One item, one owner; a person holds
       orphans are surfaced               at most one of each item; an item
                                          nobody can hold is reported rather
                                          than dropped. Asked of the modules,
                                          not of `anatomy.claim` — a helper
                                          being right is not the same as its
                                          being wired in.

    5  Phase 2 is intact                  Its per-module legibility floors,
                                          the three uncertainty keys, the
                                          one-directional `readable: false =>
                                          status "unverified"`, and the
                                          possible-person band. Then its
                                          suite is run, and Phase 1's and
                                          Phase 0's inside it.

    6  the baseline diff                  Every one of the 147 verdicts,
                                          key by key, each difference
                                          attributed to a rule this phase
                                          introduced or reported as
                                          unexplained.

A note on §5, because it is the easiest section to write wrongly. The floors
are per module — `ppe` refuses a picture at 16% brightness that `gloves`
reads fine at 10% — and that disagreement is the product working as designed.
Any check that holds all seven modules to one answer about one picture is
measuring something this system does not do, and would fail on a correct
build. What is asserted here is that each module's own floor is where Phase 2
left it, and that two modules with different floors do in fact disagree.

Usage:

    cd backend && PYTHONPATH=$PWD .venv/bin/python ../tests/verify_phase3.py
    ... [--base URL] [--skip-earlier-phases] [--skip-clip]

Requires a backend on http://127.0.0.1:8012, freshly started — the preflight
refuses one that predates the code it is serving, because a stale server has
produced a wrong answer in this project four times, twice green and twice red.
Nothing here writes configuration: the marked areas all live in scratch
stores, the zones are set in process, and what the suite creates it removes.
"""

import json
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

SCRATCH = Path(
    "/tmp/claude-0/-home-user-vikasgroup-visual-analytics-fullstack-beta"
    "/34a9e001-1e22-5fc0-a6b4-dd924c10c2cc/scratchpad"
)

BASELINE = HERE / "verdicts_phase3.json"
PHOTO = HERE / "fixtures" / "check_photo.jpg"

BASE = "http://127.0.0.1:8012"
SKIP_EARLIER = "--skip-earlier-phases" in sys.argv
SKIP_CLIP = "--skip-clip" in sys.argv

for index, arg in enumerate(sys.argv):
    if arg == "--base" and index + 1 < len(sys.argv):
        BASE = sys.argv[index + 1]

#: Every module the backend serves, for the catalog check below.
EXPECTED_MODULES = [
    "restricted-zone", "ppe", "gloves", "mask", "face", "workstation", "door",
    "vehicle-zone", "walkways", "suspended-load",
]

#: The modules the committed baseline was captured against.
#:
#: Everything below that compares against that baseline iterates this list and
#: not the one above. `vehicle-zone` and `walkways` were both built after the
#: capture, so neither has a before-picture here — and the one thing this suite
#: must never do to make itself pass is re-take the baseline it exists to
#: measure against. Both are covered on their own ground, by
#: tests/verify_vehicle_zone.py and tests/verify_walkways.py, which hold them
#: to the same third-state contract.
BASELINE_MODULES = [
    "restricted-zone", "ppe", "gloves", "mask", "face", "workstation", "door",
]

#: What is actually in `check_photo.jpg` — a construction site with two
#: workers, one kneeling in a yellow helmet and hi-vis vest, one standing in a
#: grey t-shirt with neither. Both wear gloves, neither wears a mask, both
#: faces are visible, and nothing is marked on any module. Every "correct"
#: below is measured against this, exactly as Phase 2 measured it, so the two
#: phases' tallies mean the same thing.
TRUTH = {
    "people": 2,
    "without_helmet": 1,
    "without_vest": 1,
    "without_gloves": 0,
    "without_mask": 2,
    "faces": 2,
}

#: The rules this phase introduces, and the modules each is allowed to change
#: the verdicts of. A difference in the baseline that no rule here can account
#: for is unexplained, and unexplained is a failure — "it looks better" is not
#: a classification.
PHASE3_RULES: dict[str, tuple[str, ...]] = {
    "ppe": (
        "gear attributed by fit rather than by size (PPE-08)",
        "gear nobody can be holding reported as a possible extra person "
        "(PPE-03)",
    ),
    "mask": (
        "a mask matched against a head band rather than a whole box "
        "(MASK-02)",
    ),
    "gloves": ("a too-far floor, so a person too small to resolve a hand on "
               "is not counted compliant",),
    "restricted-zone": (
        "the floor path gated on grounded-band containment rather than "
        "whole-mask overlap (ZONE-01, ZONE-02)",
    ),
    "workstation": (
        "a scale guard on attendance (WS-01)",
        "presence hysteresis (WS-02)",
    ),
    "door": (
        "one detection matched to one region (DOOR-11)",
        "a region holding two doorways reported (DOOR-12)",
    ),
    "face": (),
}

#: Where each module's verdicts on the baseline photograph *can* legitimately
#: move, given that nothing is marked on three of the seven. With no polygon
#: drawn there is no floor path to gate, with no workstation marked there is
#: nothing to be occupied, and with no doorway marked there is nothing to
#: match — so a difference in those three is a change to something this phase
#: was not supposed to touch.
CAN_MOVE_ON_THE_BASELINE = ("ppe", "mask", "gloves")

#: Keys that say what a module *concluded*, which is what this phase moves.
#: A difference confined to these is a rule reaching a different verdict about
#: the same detections.
VERDICT_KEYS = frozenset({
    "summary", "alert", "status", "severity", "checked",
    "people_checked", "people_not_checked", "people_unverified",
    "people_too_dark", "people_unaccounted",
    "wearing_helmet", "missing_helmet", "wearing_vest", "missing_vest",
    "wearing_mask", "missing_mask", "with_gloves", "without_gloves",
    "person_inside", "people_inside",
})

#: Keys that say what the module *saw*. Nothing in this phase changes person
#: detection or legibility — contract §3 — so a difference in one of these is
#: a change somebody made outside the phase's scope, however harmless it
#: looks, and is reported as unexplained rather than waved through.
OUT_OF_SCOPE_KEYS = frozenset({
    "people_total", "person_count", "readable", "unreadable_reason", "reason",
})


def attribute(module_id: str, before: dict, now: dict, changed: list[str]):
    """
    Which rule this phase introduced accounts for one changed verdict.

    Returns the rule's own words, or None when nothing in this phase can
    reach the difference — which is the answer that stops the phase.
    """
    if module_id not in CAN_MOVE_ON_THE_BASELINE:
        return None

    out_of_scope = [key for key in changed if key in OUT_OF_SCOPE_KEYS]

    if out_of_scope:
        return None

    if not set(changed) <= VERDICT_KEYS:
        return None

    said_before = str(before.get("summary") or "")
    says_now = str(now.get("summary") or "")
    headcount = "verify headcount"

    if module_id == "ppe":
        # `people_unaccounted` is not in the baseline's key list — it did not
        # exist when the baseline was taken — so a PPE-03 change reaches the
        # diff only as a shift in `people_unverified`, which carries it. That
        # is a limit of the instrument rather than of the rule, and it is
        # named here rather than left to be inferred from a wrong label.
        gear_moved = {
            "wearing_helmet", "missing_helmet", "wearing_vest", "missing_vest",
        } & set(changed)

        if "people_unaccounted" in changed or not gear_moved or (
            (headcount in said_before) != (headcount in says_now)
        ):
            return PHASE3_RULES["ppe"][1]

        return PHASE3_RULES["ppe"][0]

    return PHASE3_RULES[module_id][0]


failures: list[str] = []
advisories: list[str] = []
results: list[tuple[str, str, str]] = []


def check(name: str, ok: bool, detail: str = "") -> bool:
    """Record one check. Prints the measured value when it fails."""
    print(("PASS  " if ok else "FAIL  ") + name
          + (f"  [{detail}]" if detail and not ok else ""))
    results.append(("PASS" if ok else "FAIL", name, "" if ok else detail))
    if not ok:
        failures.append(name)
    return ok


def note(name: str, ok: bool, detail: str = "") -> bool:
    """
    A check that reports but does not block.

    Used where the criterion as written is stricter than the plan asked for,
    where the answer is a measurement somebody has to read rather than a bar
    to clear, or where the finding belongs to another phase. Either way the
    number is on the table rather than in a paragraph.
    """
    print(("PASS  " if ok else "NOTE  ") + name
          + (f"  [{detail}]" if detail and not ok else ""))
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


def run_probe(script: Path, timeout: int = 3600,
              environment: Optional[dict] = None) -> dict:
    """Run one probe and return the JSON object it printed on its last line."""
    proc = subprocess.run(
        [PYTHON, str(script)],
        cwd=str(BACKEND),
        capture_output=True,
        text=True,
        env={**os.environ, "PYTHONPATH": str(BACKEND), **(environment or {})},
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
        "returncode": proc.returncode,
        "stdout": proc.stdout[-2000:],
        "stderr": proc.stderr[-2000:],
    }


def post_photo(module_id: str, path: Path) -> dict:
    """Upload one photo the way the page does, and return what came back."""
    boundary = "----phase3verification"
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{path.name}"\r\n'
        f"Content-Type: image/jpeg\r\n\r\n"
    ).encode() + path.read_bytes() + f"\r\n--{boundary}--\r\n".encode()

    request = urllib.request.Request(
        f"{BASE}/api/{module_id}/photo",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            return json.loads(response.read()).get("data", {})
    except Exception as exc:  # noqa: BLE001
        return {"error": f"{type(exc).__name__}: {exc}"}


def classify(module_id: str, entry: dict) -> str:
    """
    correct / honest / wrong, for one module's verdict on one picture.

    Phase 2's classifier, unchanged, because the point of using it here is
    that the two phases' tallies are comparable. "honest" is a decline — not
    a right answer, the absence of a wrong one — and it is counted separately
    so the price of a phase is visible rather than averaged away.
    """
    if "error" in entry:
        return "error"

    summary = str(entry.get("summary") or "")
    status = entry.get("status")
    total = entry.get("people_total")

    if status == "unverified" or entry.get("readable") is False:
        return "honest"

    if module_id == "ppe":
        both = (entry.get("missing_helmet") or 0) >= TRUTH["without_helmet"] and (
            entry.get("missing_vest") or 0) >= TRUTH["without_vest"]
        return "correct" if both else "wrong"

    if module_id == "gloves":
        return (
            "correct"
            if total == TRUTH["people"] and "without gloves" not in summary
            else "wrong"
        )

    if module_id == "mask":
        return (
            "correct"
            if total == TRUTH["people"]
            and (entry.get("missing_mask") or 0) == TRUTH["without_mask"]
            else "wrong"
        )

    if module_id == "restricted-zone":
        return "correct" if (total or 0) >= TRUTH["people"] else "wrong"

    if module_id == "face":
        return "correct" if summary.startswith(f"{TRUTH['faces']} faces") else "wrong"

    if module_id in ("door", "workstation"):
        return "correct" if "marked" in summary.lower() else "wrong"

    return "wrong"


def measured(payload: dict, *path, default=None):
    """One value out of a probe's output, or `default` if the probe fell over."""
    current: Any = payload

    for key in path:
        if not isinstance(current, (dict, list)):
            return default
        try:
            current = current[key]
        except (KeyError, IndexError, TypeError):
            return default

    return default if current is None else current


def says(entry: dict, *words: str) -> bool:
    """Whether a payload says any of these things anywhere an operator reads."""
    text = json.dumps(
        {
            key: entry.get(key)
            for key in ("summary", "regions", "detections", "reason",
                        "unreadable_reason", "message", "_people")
            if key in entry
        }
    ).lower()

    return any(word.lower() in text for word in words)


# ----------------------------------------------------------------------
# Preflight
# ----------------------------------------------------------------------

print(f"Phase 3 verification · {BASE} · {time.strftime('%Y-%m-%d %H:%M:%S')}")

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

"""
A running server holds the code it was started with, and four agents are
editing these modules at once. A backend started an hour ago answers with
yesterday's payload while everything measured in process answers with today's.
Asked twice, because the two ways of asking fail differently: comparing
answers misses a stale server whose answers happen to agree, and comparing
timestamps misses an edit that changed nothing.
"""

newest = max(
    (path.stat().st_mtime, str(path.relative_to(REPO)))
    for path in (BACKEND / "app").rglob("*.py")
)

started_at = None

for path in ("/api/system/status", "/system/status"):
    # Both spellings, because the documented `/api` one currently returns the
    # app's HTML with a 200 — DASH-10, Phase 5 — and will start working when
    # that lands. Neither this suite nor the next should need editing for it.
    try:
        _, status = get_json(path)
        hours, minutes, seconds = (
            int(part) for part in status["data"]["system"]["uptime"].split(":")
        )
        started_at = time.time() - (hours * 3600 + minutes * 60 + seconds)
        break
    except Exception:  # noqa: BLE001
        continue

note("the backend reports how long it has been running", started_at is not None,
     "no uptime on /api/system/status or /system/status — the staleness check "
     "below cannot run")

if started_at is not None:
    check("the running backend was started after the newest source file",
          started_at > newest[0],
          f"backend started {time.strftime('%H:%M:%S', time.localtime(started_at))}"
          f", {newest[1]} last written "
          f"{time.strftime('%H:%M:%S', time.localtime(newest[0]))} — restart "
          f"it: cd backend && .venv/bin/python -m uvicorn app.main:app "
          f"--host 0.0.0.0 --port 8012")

check("the photograph every number in this suite is measured on is present",
      PHOTO.exists(), f"missing {PHOTO}")

check("the 147 verdicts taken before this phase are present to diff against",
      BASELINE.exists(), f"missing {BASELINE}")

baseline = json.loads(BASELINE.read_text()) if BASELINE.exists() else {}

check("the baseline holds 147 verdicts across seven modules",
      sum(len(conditions) for conditions in baseline.values()) == 147
      and len(baseline) == 7,
      f"{len(baseline)} modules, "
      f"{sum(len(c) for c in baseline.values())} verdicts")

for fixture in (
    SCRATCH / "diag" / "fakecam_500.png",
    SCRATCH / "diag" / "fakecam_100.png",
    SCRATCH / "diag" / "stillcam_0.png",
    SCRATCH / "diag" / "doorcam_0.png",
    SCRATCH / "ppe_test" / "f_0300.jpg",
    HERE / "_probe_dist_50.jpg",
    HERE / "_probe_dist_35.jpg",
):
    check(f"the fixture {fixture.name} the report measured on is present",
          fixture.exists(), f"missing {fixture}")

note("the 375-frame occupied clip is present", (SCRATCH / "doorcam.y4m").exists(),
     f"missing {SCRATCH / 'doorcam.y4m'} — WS-02 cannot be measured")

"""
`anatomy.py` is committed and nobody's to edit — contract §1 — and two of its
numbers were settled by measurement against the very failures this phase
closes. Asserted rather than assumed, because a suite that tests three modules
against a helper somebody quietly retuned is testing nothing.
"""

sys.path.insert(0, str(BACKEND))

try:
    from app.vision.anatomy import HEAD_HEIGHT, claim, head_band

    band = head_band((100.0, 200.0, 300.0, 600.0))

    check("the head band is still the top 45% of a person's box, at full width",
          HEAD_HEIGHT == 0.45 and band == (100.0, 200.0, 300.0, 380.0),
          f"HEAD_HEIGHT={HEAD_HEIGHT} band={band}")
except Exception as exc:  # noqa: BLE001
    check("the head band is still the top 45% of a person's box, at full width",
          False, f"{type(exc).__name__}: {exc}")


# ----------------------------------------------------------------------
# The measurements
# ----------------------------------------------------------------------

print("      running the probes — the zone sweep, the gear cases, the "
      "doorways, and 375 frames of real footage on a CPU. A few minutes.")

zones = run_probe(HERE / "_probe_zones.py")
gear = run_probe(HERE / "_probe_gear.py")
doors = run_probe(HERE / "_probe_doorways.py")
# `--skip-clip` skips the 375 frames, not WS-01 and WS-06, which are two
# pictures and a scratch store.
stations = run_probe(
    HERE / "_probe_stations.py",
    environment={"PHASE3_SKIP_CLIP": "1"} if SKIP_CLIP else None,
)

for label, payload in (("zones", zones), ("gear", gear),
                       ("doorways", doors), ("workstations", stations)):
    check(f"the {label} probe ran",
          not payload.get("__failed__"),
          json.dumps({k: v for k, v in payload.items()
                      if k != "__failed__"})[:900])

"""
The second half of the staleness question, asked the other way. The timestamp
check above depends on an endpoint that is documented at a path it does not
answer on (DASH-10, Phase 5) and could stop answering at all; this one depends
on nothing but the product. Three modules judge the reference photograph in
process and over HTTP, and the two have to say the same thing.
"""

drifted = []

for module_id in ("ppe", "mask", "gloves"):
    in_process = measured(gear, "reference_photo", module_id, default={})
    over_http = post_photo(module_id, PHOTO)

    if in_process.get("summary") != over_http.get("summary"):
        drifted.append(
            f"{module_id}: the server says {over_http.get('summary')!r}, the "
            f"code on disk says {in_process.get('summary')!r}"
        )

check("the running backend is the code this suite just measured",
      not drifted,
      "; ".join(drifted) + " — restart it: cd backend && .venv/bin/python -m "
      "uvicorn app.main:app --host 0.0.0.0 --port 8012")


# ----------------------------------------------------------------------
# 1 · the eleven defects, at the numbers that found them
# ----------------------------------------------------------------------

section("1 · the eleven defects, at the numbers that found them")

"""
The two scale guards first, because contract §2 asks whoever implements one to
state the number they chose and the case they chose it against, and a number
nobody can read afterwards is not a stated one. They do not have to agree — a
doorway and a desk are different shapes — but each has to be a measurement.
Printed here, at the top of the section whose checks depend on them.
"""

try:
    from app.modules.workstation.service import SCALE_RATIO as DESK_RATIO
    from app.vision.detector import (
        LOWER_OVERLAP_THRESHOLD,
        OVERLAP_THRESHOLD,
        SCALE_RATIO as ZONE_RATIO,
    )

    print(f"      restricted zone: a person up to {ZONE_RATIO}x the area's own "
          f"*area* is at its depth · floor path fires at "
          f"{LOWER_OVERLAP_THRESHOLD} of the grounded band · whole-mask "
          f"overlap still {OVERLAP_THRESHOLD}")
    print(f"      workstation:     a person over {DESK_RATIO}x the area's own "
          f"*height* is passing, not at it")

    note("the whole-mask overlap bar was not simply lowered to make ZONE-01 "
         "fire",
         OVERLAP_THRESHOLD >= 0.10,
         f"OVERLAP_THRESHOLD is {OVERLAP_THRESHOLD}, and the report's foot "
         f"silhouette measured 0.091 — moving the bar under it would close "
         f"ZONE-01 by making every marginal case an intrusion")
except Exception as exc:  # noqa: BLE001
    note("both scale guards state the number they chose", False,
         f"{type(exc).__name__}: {exc}")

"""
ZONE-01. A zone drawn round the walking worker's actual feet on
`fakecam_500.png` — x130-225, y405-443, 38 pixels tall, his feet wholly inside
it — measured 0.091 of his whole body mask against a 0.10 bar and did not
alert. The plan asks for two things at once here, and they are only 1.7x
apart: the 38-pixel silhouette must fire, and a 23-pixel zone covering 5.5% of
his height must not. Both are patches of floor he is standing on, so the
second is a boundary somebody chose rather than a fact about the picture; it
is checked because the plan states it, and the whole sweep is printed beside
it so the boundary is visible rather than implied.
"""

foot = measured(zones, "zone01_foot_silhouette", "subject", default={})
foot_module = measured(zones, "zone01_foot_silhouette", "module", default={})

check("ZONE-01 · a zone drawn round somebody's feet now fires",
      foot.get("inside") is True,
      f"overlap {foot.get('overlap')} of the whole body mask, inside="
      f"{foot.get('inside')} — the report measured 0.091 against a 0.10 bar")

check("ZONE-01 · and the module says so, not only the geometry",
      foot_module.get("alert") is True
      and "restricted area" in str(foot_module.get("summary", "")).lower(),
      f"{foot_module.get('summary')!r} alert={foot_module.get('alert')} "
      f"status={foot_module.get('status')!r}")

sweep = measured(zones, "zone01_sweep", default=[])
at_23px = next((row for row in sweep if row["zone_height_px"] == 23), {})
at_43px = next((row for row in sweep if row["zone_height_px"] == 43), {})

check("ZONE-01 · a zone covering 5% of a person's height still does not fire",
      at_23px.get("inside") is False,
      f"23px = {at_23px.get('pct_of_body_height')}% of his height, overlap "
      f"{at_23px.get('overlap')}, inside={at_23px.get('inside')}")

check("ZONE-01 · the case the report measured at 0.104 still fires",
      at_43px.get("inside") is True,
      f"43px, overlap {at_43px.get('overlap')}, inside={at_43px.get('inside')}")

fires_at = [row for row in sweep if row.get("inside")]
print("      the boundary, on his own feet: fires from "
      + (f"{fires_at[0]['zone_height_px']}px "
         f"({fires_at[0]['pct_of_body_height']}% of his height)"
         if fires_at else "nowhere in the sweep")
      + " · " + " ".join(
          f"{row['zone_height_px']}px:{'in' if row['inside'] else 'out'}"
          for row in sweep if row["zone_height_px"] in (13, 18, 23, 28, 33, 38, 43, 53)
      ))

"""
ZONE-02. The same zone one notch larger — y400-443, which measured 0.104 and
alerted — carried through the report's own degradation table. Every level in
it either flipped the verdict to "outside" or lost the person altogether. The
two cases are different and are judged differently: while the worker is still
detected standing in the marked area, the answer must not change; once he is
gone from the picture, the module must not say the area is clear, which is
Phase 2's rule and is checked here because this phase is where the boundary
stopped protecting it.
"""

degradation = measured(zones, "zone02_degradation", default={})

flipped = [
    f"{label}: overlap {entry['overlap']} inside={entry['inside']}"
    for label, entry in degradation.items()
    if entry.get("found") and not entry.get("inside")
]

check("ZONE-02 · the verdict at the boundary survives dim light, blur, "
      "compression and a round trip through 160x120",
      not flipped,
      f"{len(flipped)} of {len(degradation)} levels flip while the worker is "
      f"still detected standing in the area: " + " | ".join(flipped[:6]))

lost = {
    label: entry for label, entry in degradation.items()
    if not entry.get("found")
}

still_claiming = [
    f"{label}: {entry['module'].get('summary')!r}"
    for label, entry in lost.items()
    if entry.get("module", {}).get("status") == "clear"
]

check("ZONE-02 · where degradation takes the person out of the picture, the "
      "module declines rather than reporting the area clear",
      not still_claiming,
      f"{len(still_claiming)} of {len(lost)}: " + " | ".join(still_claiming[:4]))

"""
WS-01. `fakecam_100.png`'s only detection is (269,31,512,479) — a worker
filling nearly the whole frame. A workstation marked at y in [0.469, 0.594] is
a plausible background desk, and the module called it occupied because his
body centre lands in the band. The counter-cases carry the same weight: this
is the one verdict in the system where a false detection *silences* an alarm,
so a guard that rejects the person genuinely at the desk has made the module
worse, not better.
"""

ws01 = measured(stations, "ws01", default={})

check("WS-01 · a worker filling the frame no longer occupies a background desk",
      ws01.get("passerby_occupies_it") is False,
      f"box {ws01.get('detection')} is "
      f"{ws01.get('times_the_regions_height')}x the region's own height and "
      f"still reports occupied — {ws01.get('summary')!r}")

for label, description in (
    ("standing_at_it", "somebody standing at that desk still occupies it"),
    ("seated_at_it_legs_hidden",
     "somebody seated at it with their legs hidden still occupies it"),
    ("standing_at_its_left_edge",
     "somebody at its left-hand edge still occupies it"),
):
    case = ws01.get(label) or {}
    check(f"WS-01 · {description}",
          case.get("occupied") is True,
          f"box {case.get('box')}, {case.get('times_the_regions_height')}x the "
          f"region's height, occupied={case.get('occupied')}")

boundary = ws01.get("boundary") or []
rejected_from = next(
    (row["times_the_regions_height"] for row in boundary
     if not row["occupied"]),
    None,
)

print("      the guard's boundary, everyone centred on the desk with their "
      "feet below it: "
      + " ".join(
          f"{row['times_the_regions_height']}x:"
          f"{'at it' if row['occupied'] else 'passing'}"
          for row in boundary
      ))

check("WS-01 · the sweep actually reaches the scale guard",
      rejected_from is not None,
      "no person in the sweep was turned away, so the boundary printed above "
      "is not the guard's. The module has two presence tests and only the "
      "body-centre one is scale-guarded — a person whose feet are inside the "
      "marked area is standing at that depth whatever their size, and is "
      "admitted before scale is asked about. A sweep that leaves the feet "
      "inside measures the wrong path and reports coverage it does not have")

note("WS-01 · the scale guard admits everybody the report measured as "
     "genuinely at a desk",
     rejected_from is not None and rejected_from > 2.31,
     f"a person {rejected_from}x the marked area's height is turned away, and "
     f"people genuinely at a desk were measured at up to 2.31x — the guard is "
     f"inside the population it is meant to admit")

"""
WS-02. 375 frames of real footage with a person seated at the desk throughout.
The report measured 29.1% of frames reported empty and a longest wrong run of
3.53 s against a ten-second allowance — under it, but close enough that a
worse run or a lower threshold fires a false alert.

"Wrong-empty rate below 5% at the alert level" needs saying plainly, because
the phrase can be read two ways and one of them is already true: no alert
fired in the original run either, so counting alerts measures nothing. What is
measured here is the module's own reported occupancy — the value that drives
the absence clock and therefore the alert — against the detector's raw answer,
which this phase is not allowed to change and which is expected to stay at
29.1%. The gap between the two is the hysteresis, and it is the whole fix.
"""

ws02 = measured(stations, "ws02", default={})

if "error" in ws02 or not ws02:
    note("WS-02 · the wrong-empty rate on the 375-frame occupied clip", False,
         ws02.get("error", "the workstation probe produced nothing"))
else:
    check("WS-02 · the module reports the desk empty on under 5% of 375 frames "
          "it was occupied for",
          (ws02.get("module_wrong_empty_pct") or 100.0) < 5.0,
          f"{ws02.get('module_wrong_empty_pct')}% of "
          f"{ws02.get('frames')} frames — the report measured 29.1%")

    check("WS-02 · and the longest wrong run is well inside the allowance",
          (ws02.get("module_longest_wrong_run_seconds") or 99.0) < 2.0,
          f"{ws02.get('module_longest_wrong_run_seconds')}s against a "
          f"{ws02.get('station', {}).get('empty_seconds')}s allowance — the "
          f"report measured 3.53s")

    check("WS-02 · no absence alert fires on a desk that was never empty",
          (ws02.get("frames_with_severity") or 0) == 0,
          f"{ws02.get('frames_with_severity')} frames carried a severity, "
          f"first at frame {ws02.get('first_alerting_frame')}")

    note("WS-02 · the detector's own miss rate is untouched by this phase",
         abs((ws02.get("detector_wrong_empty_pct") or 0) - 29.1) < 3.0,
         f"the detector answered 'nobody there' on "
         f"{ws02.get('detector_wrong_empty_pct')}% of frames against the "
         f"report's 29.1% — a large move here would mean this phase changed "
         f"detection rather than the rule reading it")

"""
WS-06. Duplicate rejection is IoU-based, so a workstation drawn wholly inside
another one slips through and one person is present at two workstations at
once. The plan allows either answer — treat containment as a duplicate, or
state plainly that nesting is allowed — so what is checked is that the module
takes one of them rather than doing it silently.
"""

ws06 = measured(stations, "ws06", default={})

if ws06:
    refused = ws06.get("inner_accepted") is False
    counted_once = (ws06.get("one_person_counts_at") or 0) <= 1
    said_so = says(ws06, "inside", "contains", "nested", "overlap", "both",
                   "duplicate")

    check("WS-06 · a workstation drawn inside another is either refused or "
          "declared, never silently double-counted",
          refused or counted_once or said_so,
          f"accepted with no refusal, one person counted at "
          f"{ws06.get('one_person_counts_at')} workstations, and nothing in "
          f"the payload says so: {ws06.get('summary')!r}")

    if refused:
        print(f"      refused: {ws06.get('refusal')!r}")

"""
MASK-02. Person A `(0,0,260,320)` — large, close, and actually maskless —
contains person B entirely. People are processed largest-first and a mask was
claimed on the full box width, so A took B's mask and B was left unchecked:
the mirror image of the failure the code guards against.
"""

mask02 = measured(gear, "mask02_nested_with_faces", default={})
mask02_no_faces = measured(gear, "mask02_nested", default={})

check("MASK-02 · the mask goes to the person wearing it, not to the larger "
      "person whose box contains them",
      mask02.get("person_b") == "Mask" and mask02.get("person_a") != "Mask",
      f"person A (0,0,260,320) reads {mask02.get('person_a')!r} and person B "
      f"reads {mask02.get('person_b')!r} — {mask02.get('summary')!r}. The two "
      f"boxes overlap at IoU {mask02.get('iou_of_the_two_boxes')}")

check("MASK-02 · and the larger person, who is actually maskless, is the one "
      "reported",
      (mask02.get("missing_mask") or 0) == 1
      and (mask02.get("wearing_mask") or 0) == 1,
      f"missing_mask={mask02.get('missing_mask')} "
      f"wearing_mask={mask02.get('wearing_mask')} — {mask02.get('summary')!r}")

check("MASK-02 · with no face finder in the picture, B still keeps the mask "
      "and nobody is accused",
      mask02_no_faces.get("person_b") == "Mask"
      and (mask02_no_faces.get("missing_mask") or 0) == 0,
      f"A reads {mask02_no_faces.get('person_a')!r} and B reads "
      f"{mask02_no_faces.get('person_b')!r} — {mask02_no_faces.get('summary')!r}")

"""
PPE-03. `f_0300.jpg`, unmodified: the detector returns one person box spanning
two workers at 0.772, the second man's blue helmet is found at 0.829, matches
nobody, and is dropped in silence. The frame then reads `people_total=1`,
"Wearing the right gear". Gear nobody can be holding is evidence of a person
who was merged away, and the plan's answer is to say so rather than to accuse
anybody.
"""

ppe03 = measured(gear, "ppe03", default={})
helmets = measured(gear, "ppe03", "_detections", "helmet", default=[])

note("PPE-03 · the frame still reproduces: one person box, two helmets, one "
     "of them at 0.829",
     len(helmets) >= 2 and any(abs(h["conf"] - 0.829) < 0.02 for h in helmets),
     f"helmets found: {[h.get('conf') for h in helmets]}")

check("PPE-03 · two workers merged into one box no longer read as one worker "
      "in the right gear",
      not (str(ppe03.get("summary", "")).strip() == "Wearing the right gear"
           and (ppe03.get("people_total") or 0) == 1),
      f"{ppe03.get('summary')!r} with people_total="
      f"{ppe03.get('people_total')}")

check("PPE-03 · the discarded helmet is surfaced as a headcount to verify",
      (ppe03.get("people_unaccounted") or 0) >= 1
      or says(ppe03, "verify headcount", "additional person"),
      f"{ppe03.get('summary')!r}, people_unaccounted="
      f"{ppe03.get('people_unaccounted')}, keys={ppe03.get('_keys')}")

check("PPE-03 · and it does not become an accusation — nobody is alerted on "
      "for gear that might belong to somebody who was never detected",
      ppe03.get("alert") is not True,
      f"alert={ppe03.get('alert')} status={ppe03.get('status')!r} "
      f"{ppe03.get('summary')!r}")

"""
PPE-08. The same contest settled by size rather than by fit: the larger,
nearer person always won a contested helmet. A helmet over the smaller
person's head belongs to the smaller person, and the larger one is then
bare-headed and must be reported as such.
"""

ppe08 = measured(gear, "ppe08_nested_helmet", default={})

check("PPE-08 · a contested helmet goes to the person whose head it is on, "
      "not to the nearer person",
      ppe08.get("person_b") is not None
      and "helmet" not in str(ppe08.get("person_b", "")).lower()
      and "helmet" in str(ppe08.get("person_a", "")).lower(),
      f"person A (the larger) reads {ppe08.get('person_a')!r} and person B "
      f"(wearing it) reads {ppe08.get('person_b')!r}. Both are staged with "
      f"headroom above their heads, so neither label can be 'head out of "
      f"shot' and the two must differ")

check("PPE-08 · and one helmet does not make two people compliant",
      (ppe08.get("wearing_helmet") or 0) <= 1,
      f"wearing_helmet={ppe08.get('wearing_helmet')} from one staged helmet — "
      f"{ppe08.get('summary')!r}")

check("PPE-08 · nor does it vanish, leaving the person wearing it accused",
      (ppe08.get("wearing_helmet") or 0) == 1,
      f"one helmet was staged over person B's head and "
      f"wearing_helmet={ppe08.get('wearing_helmet')} — A reads "
      f"{ppe08.get('person_a')!r}, B reads {ppe08.get('person_b')!r}. The two "
      f"boxes overlap at IoU {ppe08.get('iou_of_the_two_boxes')}")

"""
DOOR-11 and DOOR-12. Matching was asked one region at a time and each answer
was right on its own, so a box across the boundary between two adjacent
doorways was handed to both — two doors' worth of events and two timers
escalating in step off one physical door. And a region drawn across two real
doorways tracked whichever the model handed it and said nothing about the
other.
"""

door11 = measured(doors, "door11_one_door_two_regions", default={})
seen = [d for d in door11.get("doors", []) if d.get("seen_now")]

check("DOOR-11 · one door box across two marked doorways is claimed by one "
      "of them, not by both",
      len(seen) == 1,
      f"{len(seen)} of {len(door11.get('doors', []))} regions report seeing "
      f"it: {[(d['name'], d['state'], d['seen_now']) for d in door11.get('doors', [])]}")

guard = measured(doors, "door11_guard_one_each", default={})

check("DOOR-11 · and two doorways with a door each are both still seen",
      len([d for d in guard.get("doors", []) if d.get("seen_now")]) == 2,
      f"{[(d['name'], d['state'], d['seen_now']) for d in guard.get('doors', [])]}")

door12 = measured(doors, "door12_two_doorways_one_region", default={})

flagged = any(d.get("crowded") for d in door12.get("doors", []))
told = "doorway" in json.dumps(
    [door12.get("summary"), door12.get("regions")]
).lower()

check("DOOR-12 · a region drawn across two doorways is flagged as holding two",
      flagged,
      f"doors={[(d['name'], d.get('crowded')) for d in door12.get('doors', [])]}")

check("DOOR-12 · and the operator is told, in words, on the screen",
      told,
      f"{door12.get('summary', {}).get('summary')!r} · "
      f"regions={door12.get('regions')}")

for label, description in (
    ("door12_guard_one_doorway",
     "one doorway generously marked is not reported as two"),
    ("door12_guard_door_elsewhere",
     "a second door elsewhere in the picture is not counted into a region"),
):
    case = measured(doors, label, default={})
    check(f"DOOR-12 · {description}",
          not any(d.get("crowded") for d in case.get("doors", [])),
          f"{case.get('summary', {}).get('summary')!r} doors="
          f"{[(d['name'], d.get('crowded')) for d in case.get('doors', [])]}")

"""
The gloves too-far floor. Phase 2 closed the darkness gate and the steady
window and left this one open with the number on the table: on the report's
own distance frames Safety Gear withholds two people as too far to judge and
Gloves reports everybody compliant, about a person eight percent of the
frame's height. It fails towards compliance, which is the wrong direction for
this product, and it is in this phase's list.
"""

for label in ("dist_50", "dist_35"):
    gloves_far = measured(gear, "distance", label, "gloves", default={})
    ppe_far = measured(gear, "distance", label, "ppe", default={})

    withheld = (
        (gloves_far.get("people_unverified") or 0) > 0
        or (gloves_far.get("people_not_checked") or 0) > 0
        or (gloves_far.get("people_too_far") or 0) > 0
        or gloves_far.get("status") == "unverified"
    )

    check(f"gloves · at {label.replace('dist_', '')}% scale a person too small "
          f"to resolve a hand on is not reported as wearing gloves",
          withheld,
          f"Gloves says {gloves_far.get('summary')!r} about "
          f"{gloves_far.get('people_total')} people with none withheld, while "
          f"Safety Gear says {ppe_far.get('summary')!r} and withholds "
          f"{ppe_far.get('people_too_far')} as too far on the same picture")


# ----------------------------------------------------------------------
# 2 · nothing that correctly alerted before has stopped
# ----------------------------------------------------------------------

section("2 · nothing that correctly alerted before has stopped")

"""
The risk of this phase, and the reason it is not shipped alongside Phase 2:
both change what alerts, in opposite directions, and merged there is no number
that says which change caused what.

Every one of the 147 baseline verdicts is classed against what is actually in
the photograph — correct, honest (the module declined), or wrong — before and
after. A verdict that was correct and is not any more fails, and it fails
whichever way it went: "wrong" is an obvious regression, and "honest" is one
too, because Phase 3 is not allowed to touch legibility (contract §3) and has
no other route to a decline it did not make before.
"""

after_path = HERE / "verdicts_phase3_after.json"

capture = subprocess.run(
    [PYTHON, str(HERE / "capture_verdicts.py"), "phase3_after"],
    cwd=str(BACKEND),
    capture_output=True,
    text=True,
    env={**os.environ, "PYTHONPATH": str(BACKEND)},
    timeout=3600,
)

check("the 147 verdicts can be re-taken on the same photograph, at the same "
      "twenty-one quality levels",
      after_path.exists() and capture.returncode == 0,
      f"exit {capture.returncode}: {capture.stderr[-500:]}")

after = json.loads(after_path.read_text()) if after_path.exists() else {}

tally: dict[str, dict[str, dict[str, int]]] = {}

for module_id, conditions in sorted(baseline.items()):
    before_counts: dict[str, int] = {}
    after_counts: dict[str, int] = {}

    for label, entry in conditions.items():
        before_counts[classify(module_id, entry)] = (
            before_counts.get(classify(module_id, entry), 0) + 1
        )
        now = after.get(module_id, {}).get(label)
        outcome = "missing" if now is None else classify(module_id, now)
        after_counts[outcome] = after_counts.get(outcome, 0) + 1

    tally[module_id] = {"before": before_counts, "after": after_counts}

print("      module            correct        honest         wrong")
for module_id, counts in tally.items():
    before_counts, after_counts = counts["before"], counts["after"]
    print(f"      {module_id:<16}"
          f"{before_counts.get('correct', 0):>3} -> "
          f"{after_counts.get('correct', 0):<8}"
          f"{before_counts.get('honest', 0):>3} -> "
          f"{after_counts.get('honest', 0):<8}"
          f"{before_counts.get('wrong', 0):>3} -> "
          f"{after_counts.get('wrong', 0):<8}")

lost_correct: list[str] = []
gained_wrong: list[str] = []

for module_id, conditions in baseline.items():
    for label, entry in conditions.items():
        was = classify(module_id, entry)
        now_entry = after.get(module_id, {}).get(label)
        now = "missing" if now_entry is None else classify(module_id, now_entry)

        if was == "correct" and now != "correct":
            lost_correct.append(
                f"{module_id}/{label}: {was} -> {now} · "
                f"{entry.get('summary')!r} -> "
                f"{(now_entry or {}).get('summary')!r}"
            )

        if was != "wrong" and now == "wrong":
            gained_wrong.append(
                f"{module_id}/{label}: {was} -> wrong · "
                f"{(now_entry or {}).get('summary')!r}"
            )

check("no verdict that was right about the photograph has stopped being right",
      not lost_correct,
      f"{len(lost_correct)}: " + " | ".join(lost_correct[:5]))

check("and nothing that was right or honest has become wrong",
      not gained_wrong,
      f"{len(gained_wrong)}: " + " | ".join(gained_wrong[:5]))

before_total = sum(
    counts["before"].get("correct", 0) for counts in tally.values()
)
after_total = sum(counts["after"].get("correct", 0) for counts in tally.values())

check("the phase does not cost correct verdicts overall",
      after_total >= before_total,
      f"{before_total} correct before, {after_total} after")

"""
The three cases in this suite that were *right* before this phase and are the
ones a geometry change is most likely to break. They are not in the 147 —
nothing is marked on the baseline photograph — so they are checked here by
name.
"""

for label, description, condition in (
    (
        "window_at_the_persons_own_scale",
        "somebody standing at a marked window of their own scale still alerts",
        lambda entry: entry.get("subject", {}).get("inside") is True,
    ),
    (
        "whole_frame_zone",
        "a zone covering the whole picture still catches everyone in it",
        lambda entry: entry.get("subject", {}).get("inside") is True,
    ),
    (
        "frame_edge_zone",
        "a zone at the frame's edge still catches the person the frame cuts off",
        lambda entry: entry.get("inside_count", 0) >= 1,
    ),
):
    entry = measured(zones, "guards", label, default={})
    check(f"still right · {description}",
          condition(entry),
          json.dumps(entry)[:400])

two_helmets = measured(gear, "ppe_two_people_two_helmets", default={})

check("still right · two people side by side each keep their own helmet",
      two_helmets.get("left") == "Helmet + vest"
      and two_helmets.get("right") == "Helmet + vest",
      f"left={two_helmets.get('left')!r} right={two_helmets.get('right')!r} — "
      f"{two_helmets.get('summary')!r}")

side_by_side = measured(gear, "mask_side_by_side", default={})

check("still right · two people side by side each keep their own mask",
      side_by_side.get("left") == "Mask" and side_by_side.get("right") == "Mask",
      f"left={side_by_side.get('left')!r} right={side_by_side.get('right')!r} — "
      f"{side_by_side.get('summary')!r}")

one_helmet = measured(gear, "ppe_one_helmet_between_two", default={})

check("still right · one helmet between two people leaves one of them "
      "bare-headed and says so",
      (one_helmet.get("missing_helmet") or 0) == 1
      and one_helmet.get("alert") is True,
      f"missing_helmet={one_helmet.get('missing_helmet')} "
      f"alert={one_helmet.get('alert')} — {one_helmet.get('summary')!r}")

ordinary_door = measured(doors, "ordinary_single_door", default={})

check("still right · one marked doorway with one door in it reports that door",
      [d.get("state") for d in ordinary_door.get("doors", [])] == ["closed"],
      f"{ordinary_door.get('summary', {}).get('summary')!r} "
      f"{ordinary_door.get('doors')}")


# ----------------------------------------------------------------------
# 3 · the guards that already worked still work
# ----------------------------------------------------------------------

section("3 · the guards that already worked still work")

"""
The report's own "what was attacked and held" list, on the same frames. Every
one of these is a case where the system was already right, and every one of
them is geometry — which is what this phase changes. The near-camera guard is
the one that matters most: it is the false positive the scale rule was built
to prevent, and a fix for ZONE-01 that simply lowers the overlap bar would
reopen it.
"""

near = measured(zones, "guards", "near_camera_small_high_zone", default={})
near_subject = near.get("subject") or {}

check("a person at the camera whose head covers a small distant zone is still "
      "not in it",
      near_subject.get("inside") is False,
      f"overlap {near_subject.get('overlap')} against a 0.10 bar — the report "
      f"measured 0.045 — inside={near_subject.get('inside')}, zone "
      f"{near.get('zone')}")

small_window = measured(zones, "guards", "window_far_smaller_than_the_person",
                        default={})

check("a marked window far smaller than the person in front of it is still "
      "not occupied by them",
      (small_window.get("subject") or {}).get("inside") is False,
      f"overlap {(small_window.get('subject') or {}).get('overlap')} — the "
      f"report measured 0.023 for a scaled-down copy")

concave = measured(zones, "guards", "concave_polygon", default={})

check("concave polygons still enclose what they look like they enclose",
      concave.get("notch_is_outside") is True
      and concave.get("left_arm_is_inside") is True
      and concave.get("base_is_inside") is True,
      json.dumps(concave))

cross = measured(zones, "guards", "cross_resolution", default={})

check("an area drawn at 1280x960 still lands on the same pixels at 640x480",
      cross.get("points_at_640x480") == cross.get("expected"),
      f"{cross.get('points_at_640x480')} against {cross.get('expected')}")

direct = measured(zones, "zone01_foot_silhouette", "subject", default={})
rescaled = measured(zones, "guards", "cross_resolution",
                    "verdict_matches_the_direct_zone", "subject", default={})

check("and it produces the same verdict as the same area drawn directly",
      direct.get("inside") == rescaled.get("inside"),
      f"drawn at 640x480: inside={direct.get('inside')} "
      f"(overlap {direct.get('overlap')}); stored at 1280x960: "
      f"inside={rescaled.get('inside')} (overlap {rescaled.get('overlap')})")

empty = measured(zones, "guards", "empty_scene", default={})

check("a marked area with nobody in the picture raises nothing",
      empty.get("person_inside") is False and empty.get("person_count") == 0,
      json.dumps(empty)[:200])

tiny = measured(zones, "guards", "tiny_zone_under_a_foot", default={})

note("a 15x15 patch inside a footprint is still not an intrusion",
     (tiny.get("subject") or {}).get("inside") is False,
     f"overlap {(tiny.get('subject') or {}).get('overlap')} — the report "
     f"measured 0.003 and called it unable to alert whatever happens. Which "
     f"way this should go is not settled anywhere: a person is standing on "
     f"it. Reported rather than failed")

crowd = measured(zones, "guards", "several_people_one_marked_patch", default={})
inside_now = [p for p in crowd.get("people", []) if p.get("inside")]

note("the same defect on a second photograph: a marked patch of floor under "
     "two pedestrians' feet",
     len(inside_now) >= 1,
     f"nobody is inside it — overlaps "
     f"{[p['overlap'] for p in crowd.get('people', [])]} on a street scene "
     f"with four people, two of them standing in the marked patch. Not one of "
     f"the report's numbered defects; the same rule as ZONE-01, on a picture "
     f"nobody tuned against")


# ----------------------------------------------------------------------
# 4 · attribution is exclusive, and orphans are surfaced
# ----------------------------------------------------------------------

section("4 · attribution is exclusive, and orphans are surfaced")

"""
Contract §1's two rules, asked of the modules rather than of the helper that
implements them. `anatomy.claim` is committed and verified against all three
reported failures, and none of that means a module actually calls it: the
failure mode this section exists for is a correct helper beside an untouched
`_claim` in a service.

One item goes to one person. One person holds at most one of each item. And an
item nobody can hold is evidence of somebody the detector merged away, so it
is reported rather than dropped.
"""

one_mask = measured(gear, "mask_one_between_two", default={})

check("one mask between two people is worn by exactly one of them",
      (one_mask.get("wearing_mask") or 0) == 1,
      f"wearing_mask={one_mask.get('wearing_mask')} from one staged mask — "
      f"left={one_mask.get('left')!r} right={one_mask.get('right')!r}")

orphan_mask = measured(gear, "mask_orphan", default={})

check("a mask nobody could be wearing makes nobody compliant",
      (orphan_mask.get("wearing_mask") or 0) == 0
      and orphan_mask.get("left") != "Mask",
      f"wearing_mask={orphan_mask.get('wearing_mask')} "
      f"person={orphan_mask.get('left')!r} — {orphan_mask.get('summary')!r}")

merged = measured(gear, "ppe_two_helmets_one_person", default={})

check("two helmets over one person's head band make that person compliant "
      "once, not twice",
      (merged.get("wearing_helmet") or 0) <= 1,
      f"wearing_helmet={merged.get('wearing_helmet')} for "
      f"{merged.get('people_total')} person — {merged.get('summary')!r}")

check("and the second helmet is reported as somebody who may not have been "
      "detected",
      (merged.get("people_unaccounted") or 0) >= 1
      or says(merged, "verify headcount", "additional person"),
      f"{merged.get('summary')!r} people_unaccounted="
      f"{merged.get('people_unaccounted')}")

stray = measured(gear, "ppe_stray_helmet", default={})

check("a helmet on the ground far from anybody is surfaced too, and improves "
      "nobody's verdict",
      (stray.get("people_unaccounted") or 0) >= 1
      or says(stray, "verify headcount", "additional person"),
      f"{stray.get('summary')!r} people_unaccounted="
      f"{stray.get('people_unaccounted')} — a 0.86 helmet nobody can hold")

two_masks = measured(gear, "mask_side_by_side", default={})

check("neither of two people standing apart can take the other's mask",
      (two_masks.get("wearing_mask") or 0) == 2,
      f"wearing_mask={two_masks.get('wearing_mask')} from two staged masks — "
      f"{two_masks.get('summary')!r}")

check("nor either of two helmets",
      (two_helmets.get("wearing_helmet") or 0) == 2,
      f"wearing_helmet={two_helmets.get('wearing_helmet')} from two staged "
      f"helmets — {two_helmets.get('summary')!r}")

wired = {
    module_id: bool(
        re.search(
            r"from app\.vision\.anatomy import|anatomy\.claim",
            (BACKEND / "app" / "modules" / module_id / "service.py").read_text(),
        )
    )
    for module_id in ("ppe", "mask")
    if (BACKEND / "app" / "modules" / module_id / "service.py").exists()
}

note("the two modules with an attribution defect use the shared helper "
     "rather than their own",
     all(wired.values()),
     f"{wired} — contract §1 says to use `claim` and not to write another "
     f"centre-in-box test. The behaviour above is what is actually asserted; "
     f"this only says where it came from. Gloves is deliberately not in this "
     f"list: its Phase 3 defect is a distance floor, not an attribution one")


# ----------------------------------------------------------------------
# 5 · Phase 2 is intact
# ----------------------------------------------------------------------

section("5 · Phase 2 is intact")

"""
Contract §3: nothing in this phase touches legibility. A picture that could be
judged before must still be judged, and one that could not must still not be.

The floors are per module and that is the point of them — Safety Gear's own
weights lose people at 16% of daylight where the gloves weights hold to 7% —
so the check is that each module's floor is where Phase 2 measured it, and
that two modules with different floors do in fact give different answers about
the same picture. A check that demanded one shared answer would fail on a
correct build.
"""

try:
    from app.vision.legibility import DEFAULT_FLOORS, FLOORS, read

    expected_floors = {
        "ppe": (16.0, 8.0, 22.0, 1.80),
        "mask": (13.0, 7.0, 9.5, 1.80),
        "gloves": (10.0, 6.0, 6.0, 1.80),
        "restricted-zone": (10.0, 6.0, 6.0, 1.80),
        "workstation": (10.0, 6.0, 6.0, 1.80),
        "face": (6.0, 4.0, 5.0, 4.00),
    }

    actual_floors = {
        module_id: (floors.brightness, floors.contrast, floors.sharpness,
                    floors.blockiness)
        for module_id, floors in FLOORS.items()
    }

    # Compared over the floors Phase 2 actually measured rather than over the
    # whole dictionary. The guarantee worth keeping is that no measured floor
    # has moved; a module added later has a floor Phase 2 never took, and
    # holding the dictionary to an exact match would make adding any module at
    # all read as a floor being retuned.
    check("every floor Phase 2 measured is still where Phase 2 measured it",
          {k: v for k, v in actual_floors.items() if k in expected_floors}
          == expected_floors,
          f"{ {k: v for k, v in actual_floors.items() if k in expected_floors} }")

    since = sorted(set(actual_floors) - set(expected_floors))

    check("and no module Phase 2 measured has lost its floor",
          not set(expected_floors) - set(actual_floors),
          f"missing: {sorted(set(expected_floors) - set(actual_floors))}")

    if since:
        print(f"      floors added since Phase 2, unmeasured by its sweep: "
              + ", ".join(f"{m} {actual_floors[m]}" for m in since))

    """
    Measured across the product's own sweep rather than at a level chosen
    here, because a level chosen here is a level somebody tuned to make the
    check pass. Twenty-one quality levels, seven modules: at least one of them
    has to split the modules, or the floors have all collapsed to one answer
    and Phase 2's whole per-module argument has been quietly undone.
    """
    split: list[str] = []

    for label in sorted({
        condition
        for conditions in after.values()
        for condition in conditions
    }):
        refused = {
            module_id
            for module_id, conditions in after.items()
            if conditions.get(label, {}).get("readable") is False
        }
        judged = {
            module_id
            for module_id, conditions in after.items()
            if conditions.get(label, {}).get("readable") is True
        }

        if refused and judged:
            split.append(f"{label}: refused by {sorted(refused)}")

    check("and the modules still disagree about the same picture, which is "
          "what per-module floors are for",
          bool(split),
          "no quality level in the sweep splits the seven modules — every "
          "picture is readable by all of them or by none, which is the one "
          "shared answer Phase 2's per-module floors exist to replace")

    print(f"      {len(split)} of 21 quality levels split the modules · "
          + " · ".join(split[:3]))
except Exception as exc:  # noqa: BLE001
    check("every module's legibility floor is where Phase 2 measured it",
          False, f"{type(exc).__name__}: {exc}")

missing_keys: list[str] = []
served: dict[str, dict] = {}

for module_id in BASELINE_MODULES:
    payload = post_photo(module_id, PHOTO)
    served[module_id] = payload

    if "error" in payload:
        missing_keys.append(f"{module_id}: {payload['error']}")
        continue

    if not isinstance(payload.get("readable"), bool):
        missing_keys.append(f"{module_id}: readable={payload.get('readable')!r}")
    if "unreadable_reason" not in payload:
        missing_keys.append(f"{module_id}: no unreadable_reason")
    if not isinstance(payload.get("people_unverified"), int):
        missing_keys.append(
            f"{module_id}: people_unverified="
            f"{payload.get('people_unverified')!r}"
        )

check("all seven modules still carry `readable`, `unreadable_reason` and "
      "`people_unverified`, on every answer",
      not missing_keys, "; ".join(missing_keys[:6]))

one_way: list[str] = []
declined_but_readable = 0

for module_id, conditions in after.items():
    for label, entry in conditions.items():
        if entry.get("readable") is False and entry.get("status") != "unverified":
            one_way.append(
                f"{module_id}/{label}: readable=False status="
                f"{entry.get('status')!r}"
            )
        if entry.get("readable") is True and entry.get("status") == "unverified":
            declined_but_readable += 1

check("`readable: false` still means `status: \"unverified\"`",
      not one_way, "; ".join(one_way[:6]))

check("and the implication is still one-directional — a module may decline a "
      "picture it could read perfectly well",
      declined_but_readable > 0,
      f"{declined_but_readable} verdicts across the sweep say unverified about "
      f"a readable picture; none would mean the two had been collapsed into "
      f"one flag")

try:
    from app.modules.ppe.service import (
        PERSON_CONFIDENCE,
        POSSIBLE_PERSON_CONFIDENCE,
    )

    check("the possible-person band is where Phase 2 left it",
          (POSSIBLE_PERSON_CONFIDENCE, PERSON_CONFIDENCE) == (0.145, 0.20),
          f"possible={POSSIBLE_PERSON_CONFIDENCE} person={PERSON_CONFIDENCE}")
except Exception as exc:  # noqa: BLE001
    check("the possible-person band is where Phase 2 left it", False,
          f"{type(exc).__name__}: {exc}")


# ----------------------------------------------------------------------
# 6 · the baseline diff
# ----------------------------------------------------------------------

section("6 · the baseline diff — every one of the 147 verdicts")

"""
147 verdicts on a real photograph, taken before any of this work, compared key
by key against the same 147 taken now. Every difference has to be one somebody
meant, and this phase changes who alerts, so "it looks better" is not a
classification: each one is attributed to a rule this phase introduced, or it
is unexplained and the phase does not ship.

Three of the seven modules have nothing marked on this photograph — no
polygon, no doorway, no workstation — so for them there is no floor path to
gate, no detection to match and nothing to be occupied. A difference in those
three cannot be explained by anything in this phase, and is reported as
unexplained even if it looks harmless.
"""

differences: list[tuple[str, str, str]] = []
unexplained: list[str] = []
identical = 0

for module_id, conditions in sorted(baseline.items()):
    for label, entry in sorted(conditions.items()):
        now = after.get(module_id, {}).get(label)

        if now is None:
            unexplained.append(f"{module_id}/{label}: missing from the re-run")
            continue

        changed = sorted(
            key for key in set(entry) | set(now)
            if entry.get(key) != now.get(key)
        )

        if not changed:
            identical += 1
            continue

        moved = (
            f"{module_id}/{label}: " + ", ".join(
                f"{key} {entry.get(key)!r} -> {now.get(key)!r}"
                for key in changed[:4]
            )
        )

        rule = attribute(module_id, entry, now, changed)

        if rule is not None:
            differences.append((module_id, moved, rule))
        elif module_id not in CAN_MOVE_ON_THE_BASELINE:
            unexplained.append(
                moved + f" — nothing is marked on {module_id} in this "
                f"baseline, so no rule in this phase can reach it"
            )
        else:
            unexplained.append(
                moved + " — no rule in this phase changes what a module sees, "
                "only what it concludes from it"
            )

print(f"      {identical} of 147 verdicts are identical · "
      f"{len(differences)} changed and attributed · "
      f"{len(unexplained)} unexplained")

for rule in sorted({reason for _, _, reason in differences}):
    rows = [row for _, row, reason in differences if reason == rule]
    print(f"      {len(rows)} changed by: {rule}")
    for row in rows[:5]:
        print(f"        · {row}")
    if len(rows) > 5:
        print(f"        · ... and {len(rows) - 5} more")

check("every difference in the 147 is attributed to a rule this phase "
      "introduced",
      not unexplained,
      f"{len(unexplained)} unexplained: " + " | ".join(unexplained[:5]))

changed_modules = {m for m, _, _ in differences}

# Modules this phase changes that the baseline cannot see it change.
# Deliberately not "every module outside CAN_MOVE": face is untouched by this
# phase and its twenty-one rows are perfectly good coverage of that fact,
# where a doorway module with no doorway marked is not coverage of anything.
blind = sorted(
    module_id for module_id, rules in PHASE3_RULES.items()
    if rules and module_id not in CAN_MOVE_ON_THE_BASELINE
)

note("the baseline can see everything this phase changes",
     not blind,
     f"it cannot: {blind} have nothing marked on this photograph, so their "
     f"{sum(len(baseline.get(m, ())) for m in blind)} rows read the same setup "
     f"sentence at every quality level and would agree perfectly with a "
     f"module that had been deleted. Their agreement above is not coverage — "
     f"§1 and §3 are the only things measuring them")

note("the phase left a mark on the baseline at all",
     bool(differences),
     "all 147 verdicts are byte-identical to the pre-phase capture, which "
     "means either that nothing landed or that nothing this phase changed is "
     "visible on a photograph with no zone, no doorway and no workstation "
     "marked on it — the second is possible and is why §1 exists")

if changed_modules:
    print(f"      modules whose verdicts moved: {sorted(changed_modules)}")


# ----------------------------------------------------------------------
# 7 · the phases underneath
# ----------------------------------------------------------------------

section("7 · Phases 2, 1 and 0 still hold")

"""
Phase 2's suite runs Phase 1's, which runs Phase 0's, so one invocation
measures all three. Run rather than trusted: this phase changes the geometry
under every verdict Phase 2 taught the system to withhold.
"""

if SKIP_EARLIER:
    note("Phase 2's suite still passes", False,
         "skipped with --skip-earlier-phases")
else:
    earlier = subprocess.run(
        [PYTHON, str(HERE / "verify_phase2.py"), "--base", BASE],
        cwd=str(BACKEND),
        capture_output=True,
        text=True,
        env={**os.environ, "PYTHONPATH": str(BACKEND)},
        timeout=7200,
    )

    phase2_failures = re.findall(r"^FAIL {2}(.+?)(?:  \[|$)", earlier.stdout,
                                 re.MULTILINE)
    phase2_tally = next(
        (line for line in earlier.stdout.splitlines()
         if "checks passed" in line),
        "",
    ).strip()

    if phase2_tally:
        print(f"      Phase 2 reported: {phase2_tally}")

    check("Phase 2's suite still passes, and Phases 1 and 0 inside it",
          earlier.returncode == 0,
          f"exit {earlier.returncode} · {phase2_tally} · "
          f"{'; '.join(phase2_failures[:6])}" or earlier.stderr[-400:])


# ----------------------------------------------------------------------
# Leaving nothing behind
# ----------------------------------------------------------------------

section("Leaving nothing behind")

"""
Everything this suite marks is marked in a scratch store under its own
directory, and every zone it draws is set in process. What it does create is
the re-taken verdict file, which belongs in a scratch directory rather than in
the repository beside the baseline it is not.
"""

if after_path.exists():
    (SCRATCH / "p3agentD").mkdir(parents=True, exist_ok=True)
    (SCRATCH / "p3agentD" / "verdicts_after.json").write_text(
        after_path.read_text()
    )
    after_path.unlink()

check("the re-taken verdicts were not left in the repository beside the "
      "baseline",
      not after_path.exists(), f"{after_path} is still there")

for module_id in ("door", "workstation"):
    _, payload = get_json(f"/api/{module_id}/config")
    key = "doors" if module_id == "door" else "workstations"
    check(f"no {key} were left marked by this suite",
          not payload["data"].get(key), f"{payload['data'].get(key)}")

_, payload = get_json("/api/restricted-zone/config")
check("no restricted area was left drawn by this suite",
      not payload["data"].get("polygon"), f"{payload['data'].get('polygon')}")


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
    print("\nPhase 3 does not ship.")
    sys.exit(1)

print("\nPhase 3's every done-when criterion holds.")
