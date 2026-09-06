"""
Does Phase 5 ship?

Phase 2 taught the system when to decline. Phase 3 fixed who alerts. Phase 4
fixed what it takes to be believed. **This phase is the only one that can be
wrong in a way an operator sees**, because it is the only one whose defects
live entirely on the surface — and two of them mean the screen makes a claim
about the system's own state that is not true.

Which is why the suite spends most of its effort on the two claims:

  · an event with no end time means "this is still happening". Every event a
    browser camera ever opened said that, for ever, because nothing closed
    them: a five-minute test recording from days ago read as an ongoing
    hazard. When this suite was written the live database held **241 events,
    of which 209 were still open** — 82 of 84 for safety gear, 64 of 64 for
    doors, every one of them from a camera that stopped watching days ago.

  · a chart of 129, 59 and 27 events drew three bars of zero pixels. React
    computed `height: 45.7364%` and the browser rendered 0 px, because a
    percentage of an indefinite parent is zero. The style is right and the
    picture is empty, so **nothing that reads the markup can catch this** —
    every height below is a `getBoundingClientRect()`.

    1  the events close, and the        Through a real browser, a real socket
       lifecycle nobody ever tested     and the real events API: three
                                        sockets, closed one at a time, with
                                        the survivors still reporting the
                                        same problem. Then the rest of the
                                        lifecycle in process, because no
                                        suite in this repository has ever
                                        asserted that an event gets an
                                        `ended_at` by any route at all.

    2  the CSV export cannot carry      Also never tested. `=cmd|'/C calc'!A1`
       a formula                        in an operator's note is a live
                                        payload in Excel; the defence was
                                        checked once by hand during the
                                        audit and has had no test since.

    3  the day-by-day chart draws       Computed heights at 1440 px and at
                                        390 px, against the percentages the
                                        same payload produced, on the
                                        report's own 129/59/27 and on this
                                        backend's real figures.

    4  every page at 390 px             Eleven pages: what overflows the
                                        viewport, what the layout actually
                                        ellipsised, how many words fit on a
                                        line, how much width the content is
                                        left with, and whether the navigation
                                        can still be reached and used.

    5  both spellings of the system     `/system/status` and
       and camera routes                `/api/system/status`, same for the
                                        camera, and an unknown `/api` path
                                        still 404 on GET and on POST.

    6  the watchlist says how far       FACE-02: registering someone arms
       it reaches                       every camera. Not a bug — a sentence
                                        that was missing.

    7  three phases of work made        `presence_grace_seconds`, `crowded`
       visible                          per door, and Phase 4's `unreliable`
                                        — amber, never green, with words.

    8  a working screen is unchanged    Seven module pages photographed
                                        before this phase began and again
                                        now, pixel for pixel, as Phase 2 did
                                        it.

    9  Phases 4, 3, 2, 1 and 0          Phase 4's suite runs Phase 3's, which
                                        runs Phase 2's, which runs Phase 1's
                                        and Phase 0's. One invocation, all
                                        five.

Two things this suite is careful about, both of which have shipped a wrong
answer in this project before.

**A comparison that cannot see a difference looks exactly like agreement.**
§8 refuses to compare a photograph against a reference taken from the same
build, proves the comparison can see a one-pixel shift before it believes a
zero, and refuses to compare at all if the state behind the screens moved
between the two runs. The verdict baselines have the same weakness in a
different place and Phase 3's suite says so: with nothing marked, the doors,
restricted-zone and workstation rows would agree perfectly with a module that
had been deleted.

**A criterion that the broken build already satisfies is not a criterion.**
At 390 px this product does not scroll sideways — measured, before any of
this phase landed: `documentElement.scrollWidth` is exactly 390 on all three
of the pages the report names. The content is not there to scroll to; it has
been clipped away in silence. "No horizontal page scroll" is asserted below
because a regression would break it, but it proves nothing on its own, and
what actually measures the fix is the width the content is left with and what
falls off the edge.

Usage:

    cd backend && PYTHONPATH=$PWD .venv/bin/python ../tests/verify_phase5.py
    ... [--base URL] [--skip-earlier-phases] [--skip-pixels]
        [--reference DIR] [--capture-reference]

Requires a backend on http://127.0.0.1:8013 — Phase 4's verification owns
8012 and Phase 5's frontend agent owns 8011 — freshly started, and a
`frontend/dist` built from today's source. Both are checked rather than
trusted: a stale backend has produced a wrong answer here four times, twice
green and twice red, and a stale dashboard build would have this suite
measure last week's screens with a straight face.

Nothing here marks a doorway, a workstation or a zone, and nothing writes to
the repository. It does leave events behind: the ones its own browser sockets
open cannot be deleted through any API, so they are listed at the end with
their end times, which is the point of them.
"""

import asyncio
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
FRONTEND = REPO / "frontend"
PYTHON = str(BACKEND / ".venv/bin/python")

SCRATCH = Path(
    "/tmp/claude-0/-home-user-vikasgroup-visual-analytics-fullstack-beta"
    "/34a9e001-1e22-5fc0-a6b4-dd924c10c2cc/scratchpad"
)
WORK = SCRATCH / "p5agentC"

BASE = "http://127.0.0.1:8013"
SKIP_EARLIER = "--skip-earlier-phases" in sys.argv
SKIP_PIXELS = "--skip-pixels" in sys.argv
CAPTURE_REFERENCE = "--capture-reference" in sys.argv
REFERENCE = WORK / "reference"

for index, arg in enumerate(sys.argv):
    if arg == "--base" and index + 1 < len(sys.argv):
        BASE = sys.argv[index + 1]
    if arg == "--reference" and index + 1 < len(sys.argv):
        REFERENCE = Path(sys.argv[index + 1])

#: The seven module pages Phase 2 compared, in the order it compared them.
MODULE_PAGES = [
    "/monitoring/restricted-zone",
    "/monitoring/ppe",
    "/monitoring/gloves",
    "/monitoring/mask",
    "/monitoring/face",
    "/monitoring/workstation",
    "/monitoring/door",
]

#: The three pages this phase and Phase 4 were *required* to change, and the
#: rectangle each was allowed to change, as fractions of the page.
#:
#: "A working screen must look exactly as it looks today" is the right rule for
#: a page nobody was asked to touch, and the wrong one for these three: the
#: contract that produced it also required the workstation page to state its
#: real latency, the door page to show a state it had never had, and the face
#: page to say how far the register reaches. Holding them to pixel identity
#: asserts that three commissioned changes did not happen.
#:
#: So they are held to something narrower instead, and it is not weaker. Every
#: differing pixel must fall inside the rectangle below — the lower part of the
#: settings column — which says the video, the header, the controls and the
#: whole left side of each page are pixel for pixel what they were, and that
#: the phase added a block rather than disturbing a layout. The four pages
#: nobody was asked to touch are still held to the whole screen, and the
#: one-pixel sentinel below still proves the comparison can see a change.
DELIBERATE_CHANGES = {
    "/monitoring/workstation": (
        "Phase 5 · the real time from walking away to an alert",
        (0.50, 0.50, 1.00, 1.00),
    ),
    "/monitoring/door": (
        "Phase 4 · the agreeing sightings before a door counts as open",
        (0.50, 0.50, 1.00, 1.00),
    ),
    "/monitoring/face": (
        "Phase 5 · FACE-02, the register reaches every camera",
        (0.35, 0.50, 1.00, 1.00),
    ),
}

#: Commissioned work that landed after this phase's reference screenshots
#: were taken, and where on every module page it is allowed to show. The
#: reference is deliberately not re-taken — a fresh capture agrees with
#: whatever the product does, defect included — so growth is named the same
#: way the three commissioned pages above are: a region, and a reason.
#:
#: Every differing pixel must fall inside the union of these regions plus
#: the page's own entries below. That is a *stronger* statement than the
#: single rectangle above, not a weaker one: two disjoint commissioned
#: regions no longer have to be covered by one box spanning the page
#: between them.
GROWN_SINCE_REFERENCE = [
    # Two commissioned monitoring modules (vehicle-zone, walkways) and the
    # Cameras register page joined the navigation, so the sidebar's items
    # shifted on every page.
    ("the navigation gained Vehicle in Restricted Zone, Object Blocking "
     "Walkways and Cameras",
     (0.00, 0.00, 0.185, 1.00)),
    # The camera card was commissioned down from five sources to three
    # (device, video file, network camera), and later gained the
    # timestamp-area panel — where a camera's burned-in clock is marked —
    # so the settings column re-flows from the card downward.
    ("the camera card offers the three commissioned sources instead of "
     "five, and carries the timestamp-area panel",
     (0.70, 0.10, 1.00, 1.00)),
]

#: Pages whose own ground was commissioned again after the reference. Each
#: names the work and the region it may occupy; behaviour on these pages is
#: held by their own suites, named beside the region.
GROWN_ROUTES = {
    "/monitoring/restricted-zone": (
        "the marking flow itself was commissioned again — several named "
        "zones with occupancy clocks in place of the single anonymous "
        "area; behaviour is held by tests/verify_restricted_zones.py",
        (0.18, 0.00, 1.00, 1.00),
    ),
    "/monitoring/face": (
        "this page's settings column is wider, so the camera-card change "
        "re-flows from 35% of the page instead of 70%",
        (0.35, 0.10, 1.00, 1.00),
    ),
}

#: Every page the product has. The report names Dashboard, Events and Doors,
#: and the criterion says every page, so every page is measured and the three
#: are called out where they fail.
ALL_PAGES = ["/dashboard", "/events", "/reports", "/about"] + MODULE_PAGES

NAMED_IN_THE_REPORT = ("/dashboard", "/events", "/monitoring/door")

#: What the report measured, so the output carries the before as well as the
#: after and nobody has to hold two documents open.
BEFORE = {
    "content width at 390px": "138 px of a 390 px viewport, sidebar 252 px",
    "words per line, Doors": "1.00 — 14 words on 14 lines",
    "chart bars": "inline height 45.7364%, rendered 0.0 px",
    "events still open": "209 of 241, including 82 of 84 for safety gear",
    "titles truncated at 390px": "Doors, Allowed open time, Past door events",
    "filter dropdowns at 390px": "all four off the right edge, inside a clipped box",
    "/api/system/status": "404 — the real route had no /api prefix",
}

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
    to clear, or where the finding belongs to another phase.
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


def request(path: str, method: str = "GET", timeout: float = 30.0):
    """One HTTP call, returning (status, body) and never raising on 4xx/5xx."""
    req = urllib.request.Request(BASE + path, method=method)

    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return response.status, response.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8", "replace")
    except Exception as exc:  # noqa: BLE001
        return None, f"{type(exc).__name__}: {exc}"


def get_json(path: str, timeout: float = 30.0):
    status, body = request(path, timeout=timeout)

    try:
        return status, json.loads(body)
    except Exception:  # noqa: BLE001
        return status, {"__unparsed__": body[:400]}


def run_node(script: Path, environment: dict, timeout: int = 1800) -> dict:
    """Run one browser probe and return the JSON object it printed."""
    proc = subprocess.run(
        ["node", str(script)],
        cwd=str(HERE),
        capture_output=True,
        text=True,
        env={**os.environ, **environment},
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
        "stdout": proc.stdout[-1500:],
        "stderr": proc.stderr[-1500:],
    }


def newest_under(root: Path, *patterns: str) -> tuple[float, str]:
    """When the newest matching file under `root` was last written."""
    newest = (0.0, "nothing")

    for pattern in patterns:
        for path in root.rglob(pattern):
            if "node_modules" in path.parts or "__pycache__" in path.parts:
                continue
            stamp = path.stat().st_mtime
            if stamp > newest[0]:
                newest = (stamp, str(path.relative_to(REPO)))

    return newest


def when(stamp: float) -> str:
    return time.strftime("%H:%M:%S", time.localtime(stamp))


def build_fingerprint() -> str:
    """What is actually in `frontend/dist` right now."""
    import hashlib

    digest = hashlib.md5()

    for path in sorted((FRONTEND / "dist").rglob("*")):
        if path.is_file():
            digest.update(path.name.encode())
            digest.update(path.read_bytes())

    return digest.hexdigest()[:12]


def differing_pixels(left: Path, right: Path):
    """
    How many pixels of two photographs are not the same colour.

    Returns (count, total) or (None, reason). Any channel differing by any
    amount counts: this is a screenshot of the same build at the same size,
    so there is no compression noise to tolerate and a tolerance would only
    hide the small changes it is here to find.
    """
    try:
        import cv2
        import numpy as np
    except Exception as exc:  # noqa: BLE001
        return None, f"no image library: {exc}"

    before = cv2.imread(str(left))
    after = cv2.imread(str(right))

    if before is None or after is None:
        return None, f"could not read {left.name if before is None else right.name}"

    if before.shape != after.shape:
        return None, f"different sizes: {before.shape} vs {after.shape}"

    return (
        int(np.count_nonzero(np.any(before != after, axis=2))),
        before.shape[0] * before.shape[1],
    )


def changed_region(left: Path, right: Path):
    """
    Where two photographs differ, as a fraction of the page.

    Returns (count, total, box) with box as (x0, y0, x1, y1) in fractions of
    width and height, or (None, reason, None). The box is the bounding box of
    every differing pixel, so "the box is inside the region this phase was
    allowed to touch" is the same statement as "nothing outside that region
    changed" — which is the part worth asserting.
    """
    try:
        import cv2
        import numpy as np
    except Exception as exc:  # noqa: BLE001
        return None, f"no image library: {exc}", None

    before = cv2.imread(str(left))
    after = cv2.imread(str(right))

    if before is None or after is None:
        return None, f"could not read {left.name if before is None else right.name}", None

    if before.shape != after.shape:
        return None, f"different sizes: {before.shape} vs {after.shape}", None

    height, width = before.shape[:2]
    differs = np.any(before != after, axis=2)
    count = int(np.count_nonzero(differs))

    if count == 0:
        return 0, height * width, None

    rows, columns = np.where(differs)

    return (
        count,
        height * width,
        (
            columns.min() / width,
            rows.min() / height,
            (columns.max() + 1) / width,
            (rows.max() + 1) / height,
        ),
    )


def changed_outside(left: Path, right: Path, regions):
    """
    Differing pixels that fall outside every allowed region.

    `regions` is a list of (x0, y0, x1, y1) fractions. Checked pixel by
    pixel rather than by bounding box: a union of disjoint regions has no
    single box, and the statement worth asserting is that *each* differing
    pixel lands in a region somebody has explained.

    Returns (outside, count, total, box) where `box` is the bounding box of
    the unexplained pixels only, or (None, reason, None, None) when the
    pictures cannot be compared.
    """
    try:
        import cv2
        import numpy as np
    except Exception as exc:  # noqa: BLE001
        return None, f"no image library: {exc}", None, None

    before = cv2.imread(str(left))
    after = cv2.imread(str(right))

    if before is None or after is None:
        name = left.name if before is None else right.name
        return None, f"could not read {name}", None, None

    if before.shape != after.shape:
        return None, f"different sizes: {before.shape} vs {after.shape}", None, None

    height, width = before.shape[:2]
    differs = np.any(before != after, axis=2)
    count = int(np.count_nonzero(differs))

    allowed = np.zeros_like(differs)
    for x0, y0, x1, y1 in regions:
        allowed[
            int(y0 * height): int(np.ceil(y1 * height)),
            int(x0 * width): int(np.ceil(x1 * width)),
        ] = True

    unexplained = differs & ~allowed
    outside = int(np.count_nonzero(unexplained))

    box = None
    if outside:
        rows, columns = np.where(unexplained)
        box = (
            columns.min() / width,
            rows.min() / height,
            (columns.max() + 1) / width,
            (rows.max() + 1) / height,
        )

    return outside, count, height * width, box


def numbers_in(text: str) -> list[float]:
    """Every number an operator could read in a piece of text."""
    return [float(match) for match in re.findall(r"\d+(?:\.\d+)?", text)]


def says(text: str, *phrases: str) -> Optional[str]:
    """The first of these phrases the text contains, or None."""
    lowered = text.lower()

    for phrase in phrases:
        if phrase.lower() in lowered:
            return phrase

    return None


# ----------------------------------------------------------------------
# Preflight
# ----------------------------------------------------------------------

print(f"Phase 5 verification · {BASE} · {time.strftime('%Y-%m-%d %H:%M:%S')}")
print()
print("      what the report measured, before any of this landed:")
for label, value in BEFORE.items():
    print(f"        {label:28} {value}")

section("Preflight")

WORK.mkdir(parents=True, exist_ok=True)

status, catalog = get_json("/api/modules")

if status != 200 or "data" not in catalog:
    print(f"FAIL  the backend answers on {BASE}  [{status}: "
          f"{json.dumps(catalog)[:200]}]")
    print("\nNothing else can be measured. Start it with:")
    print("  cd backend && .venv/bin/python -m uvicorn app.main:app "
          "--host 0.0.0.0 --port 8013")
    sys.exit(2)

modules = {m["module_id"] for m in catalog["data"]}

#: The exact catalog, not a count. Seven when this phase was written; the two
#: below the line were commissioned afterwards. Named so a module going
#: missing still fails, which a loose `>= 7` would wave through.
EXPECTED_MODULES = {
    "door", "face", "gloves", "mask", "ppe", "restricted-zone", "workstation",
    # after this phase:
    "vehicle-zone", "walkways",
    # later still, and held by tests/verify_suspended_load.py rather than
    # by anything here — this suite only asserts the product's shape.
    "suspended-load",
}

check("the backend answers, and reports every module the product has",
      modules == EXPECTED_MODULES,
      f"got {sorted(modules)}, expected {sorted(EXPECTED_MODULES)}")

"""
Two staleness questions, not one, because this phase is the first whose
answers come from a *built* front end as well as from a running server. A
backend started an hour ago serves yesterday's routes; a `dist` built an hour
ago serves yesterday's screens, and this suite would measure both without
noticing. Three agents are editing at once, so neither is hypothetical.
"""

newest_backend = newest_under(BACKEND / "app", "*.py")
started_at = None

for path in ("/api/system/status", "/system/status"):
    _, payload = get_json(path)

    try:
        hours, minutes, seconds = (
            int(part)
            for part in payload["data"]["system"]["uptime"].split(":")
        )
        started_at = time.time() - (hours * 3600 + minutes * 60 + seconds)
        break
    except Exception:  # noqa: BLE001
        continue

check("the backend says how long it has been running", started_at is not None,
      "no uptime on either spelling of the system status route")

if started_at is not None:
    check("the running backend was started after the newest backend source "
          "file",
          started_at > newest_backend[0],
          f"backend started {when(started_at)}, {newest_backend[1]} last "
          f"written {when(newest_backend[0])} — restart it: cd backend && "
          f".venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 "
          f"--port 8013")

newest_source = newest_under(FRONTEND / "src", "*.jsx", "*.js", "*.css")
newest_build = newest_under(FRONTEND / "dist", "*")

check("the dashboard being served was built after the newest front-end "
      "source file",
      newest_build[0] > newest_source[0],
      f"{newest_build[1]} built {when(newest_build[0])}, {newest_source[1]} "
      f"last written {when(newest_source[0])} — every screen measured below "
      f"would be the previous build. Rebuild it: cd frontend && npm run build")

current_build = build_fingerprint()
print(f"      dashboard build {current_build} · backend started "
      f"{when(started_at) if started_at else 'unknown'}")

check("the photograph the socket probe pushes is present",
      (HERE / "fixtures" / "check_photo.jpg").exists(),
      f"missing {HERE / 'fixtures' / 'check_photo.jpg'}")

check("a browser is available to measure the screens with",
      Path("/opt/pw-browsers/chromium-1194/chrome-linux/chrome").exists(),
      "no chromium at /opt/pw-browsers/chromium-1194/chrome-linux/chrome")

for probe in ("_probe_sockets.js", "_probe_surfaces.js", "_probe_screens.js"):
    check(f"the {probe} probe is present", (HERE / probe).exists(),
          f"missing {HERE / probe}")


# ----------------------------------------------------------------------
# 1 · the events close
# ----------------------------------------------------------------------

section("1 · DASH-02 · events opened by a browser camera close when it goes")

"""
The reported failure: "events 214/215 still returned `ended_at: null` fifteen
minutes after the session ended", and `_close_absent()` only ever runs on a
later frame, which never comes once the camera has gone.

Three sockets are opened from a real Chromium — two browsers on the module
that finds something, one on a module that does not — and closed one at a
time, with the survivors still pushing the same photograph across every
disconnect. That last part is what makes the middle two situations tests
rather than coincidences: the problem is demonstrably still there, so ending
its event would be the system saying a hazard stopped while the camera
watching it says it has not.

Then the rest of the lifecycle in process, on a scratch database, because
**no suite in this repository has ever asserted that an event gets an
`ended_at` by any route**: not the absence path, not the camera-change path,
not this one. `forget_open()` with no argument is the older behaviour and was
kept deliberately, so it is asserted here rather than left to be discovered
when someone deletes it.

One overlap this does not measure, reported by the agent who wrote the fix
rather than found by this suite: a browser socket ending while the
*server-side* MJPEG stream is still feeding the same module ends events that
stream is still reporting, and its next frame opens them again as new rows.
One extra row, not a thousand. The alternative was a leaked count that would
stop events closing at all — the original defect back again — so it is
recorded below rather than failed on.
"""

print("      three browser sockets, six frames each, on a CPU. A minute or two.")

sockets = run_node(HERE / "_probe_sockets.js", {"P5_BASE": BASE}, timeout=900)

(WORK / "sockets.json").write_text(json.dumps(sockets, indent=1))

if not check("the browser socket probe ran",
             not sockets.get("__failed__") and not sockets.get("error"),
             json.dumps({k: v for k, v in sockets.items()
                         if k in ("error", "stderr", "returncode")})[:700]):
    steps: dict[str, Any] = {}
    finder = "mask"
else:
    steps = sockets.get("steps", {})
    finder = sockets["modules"][0]
    stranger = sockets["modules"][1]

    started = sockets.get("startedAt", "")

    def mine(step: str, module_id: str) -> list[dict]:
        """The rows this run opened, not the database's whole history."""
        return [
            row for row in steps.get(step, {}).get(module_id, [])
            if row["occurred_at"] >= started[:19]
        ]

    opened = mine("opened", finder)

    # Nothing below means anything if no event was ever opened: "every event
    # closed" is trivially true of no events, and that is exactly the shape
    # of a suite that passes while measuring nothing.
    if not check(f"the {finder} socket opened an event to close",
                 len(opened) >= 1,
                 f"no {finder} event opened while three sockets pushed "
                 f"{sockets.get('steps', {}).get('opened', {}).get('first', {})}"
                 f" — nothing below is measuring anything"):
        opened = []

    if opened:
        print(f"      opened: " + ", ".join(
            f"#{row['id']} {row['key']}" for row in opened))

        check("a browser watching a different module closing leaves this "
              "module's events open",
              all(row["ended_at"] is None for row in mine("afterStranger", finder)),
              f"{[(r['id'], r['ended_at']) for r in mine('afterStranger', finder)]}"
              f" — the {stranger} socket closed and {finder}'s events ended "
              f"with it")

        check("one of two browsers on the same module closing leaves the "
              "other's events open",
              all(row["ended_at"] is None
                  for row in mine("afterOneOfTwo", finder)),
              f"{[(r['id'], r['ended_at']) for r in mine('afterOneOfTwo', finder)]}"
              f" — the surviving browser was still reporting the same problem")

        check("the last browser watching a module closing ends that module's "
              "open events",
              all(row["ended_at"] is not None for row in mine("afterLast", finder))
              and len(mine("afterLast", finder)) >= 1,
              f"{[(r['id'], r['ended_at']) for r in mine('afterLast', finder)]}")

        check("the situation stayed one event through three disconnects, not "
              "one per frame",
              len(mine("afterLast", finder)) == len(opened),
              f"{len(opened)} row(s) while watching, "
              f"{len(mine('afterLast', finder))} after — a close that "
              f"re-opens on the next frame is the noise this store exists to "
              f"prevent")

        check("no event was invented for the module that found nothing",
              not mine("afterLast", sockets["modules"][1]),
              f"{[(r['id'], r['summary']) for r in mine('afterLast', stranger)]}")

    cameras = steps.get("afterLast", {}).get("cameras") or {}
    check("the camera count comes back to nothing once every socket has gone",
          cameras.get("browser_streams") == 0,
          f"browser_streams={cameras.get('browser_streams')} "
          f"after all three closed")

note("a browser socket ending while a server camera feeds the same module is "
     "not guarded", False,
     "reported by the agent who wrote the fix: the close ends events the "
     "server stream is still reporting and its next frame opens them again "
     "— one extra row. Guarding it risked a leaked count that would stop "
     "events closing at all. Recorded, not failed on")

"""
The rest of the lifecycle, in process. A scratch database in this suite's own
directory, so nothing here touches the events an operator would read.
"""

sys.path.insert(0, str(BACKEND))

lifecycle_db = WORK / "lifecycle.db"

if lifecycle_db.exists():
    lifecycle_db.unlink()

try:
    from app.events.store import EventStore, RESOLVE_AFTER_SECONDS

    store = EventStore(path=lifecycle_db)

    finding = [{"key": "k", "severity": "low", "summary": "something"}]
    worse = [{"key": "k", "severity": "high", "summary": "something worse"}]

    store.observe("alpha", finding, None)
    store.observe("beta", finding, None)

    def rows(module_id: str) -> list[dict]:
        return store.list(module_id=module_id, limit=50)["events"]

    check("an event opens with no end time, which is what 'still happening' "
          "means",
          len(rows("alpha")) == 1 and rows("alpha")[0]["ended_at"] is None,
          f"{[(r['id'], r['ended_at']) for r in rows('alpha')]}")

    store.observe("alpha", worse, None)

    check("a situation that gets worse escalates in place rather than opening "
          "a second row",
          len(rows("alpha")) == 1 and rows("alpha")[0]["severity"] == "high",
          f"{[(r['id'], r['severity']) for r in rows('alpha')]}")

    store.forget_open("alpha")

    check("ending one module's events by name ends that module's",
          all(row["ended_at"] is not None for row in rows("alpha")),
          f"{[(r['id'], r['ended_at']) for r in rows('alpha')]}")

    check("ending one module's events by name leaves every other module's "
          "open",
          all(row["ended_at"] is None for row in rows("beta")),
          f"{[(r['id'], r['ended_at']) for r in rows('beta')]} — this is the "
          f"direction the browser probe above cannot see, because only one "
          f"module finds anything in the photograph it pushes")

    store.forget_open()

    check("ending every module's events, which is what a camera change still "
          "does, ends beta's too",
          all(row["ended_at"] is not None for row in rows("beta")),
          f"{[(r['id'], r['ended_at']) for r in rows('beta')]}")

    # The ordinary path: the problem goes away while the camera keeps
    # watching. Nobody has ever asserted this either.
    store.observe("gamma", finding, None)
    store.observe("gamma", finding, None)

    check("an event stays open while the problem is still being seen",
          rows("gamma")[0]["ended_at"] is None,
          f"{[(r['id'], r['ended_at']) for r in rows('gamma')]}")

    print(f"      waiting {RESOLVE_AFTER_SECONDS + 1:.0f}s for the "
          f"absence timer")
    time.sleep(RESOLVE_AFTER_SECONDS + 1)
    store.observe("gamma", [], None)

    check("an event ends by itself once the problem has stayed away long "
          "enough",
          all(row["ended_at"] is not None for row in rows("gamma")),
          f"{[(r['id'], r['ended_at']) for r in rows('gamma')]} after "
          f"{RESOLVE_AFTER_SECONDS}s absent")

except Exception as exc:  # noqa: BLE001
    check("the event lifecycle can be measured in process", False,
          f"{type(exc).__name__}: {exc}")


# ----------------------------------------------------------------------
# 2 · the CSV export
# ----------------------------------------------------------------------

section("2 · the export cannot carry a formula into a spreadsheet")

"""
Never tested, by any suite, in this repository. The defence was verified once
by hand during the audit: a cell beginning `=`, `+`, `-` or `@` is prefixed
with an apostrophe, because a spreadsheet reads it as a formula to run when
the file is opened, and event notes are typed by operators.

The trap in testing it — and the reason a naive test fails on correct
behaviour — is that the apostrophe and the quoting are two separate rules.
`csv.writer` quotes minimally: `=cmd|'/C calc'!A1` contains no comma, quote
or newline, so it is written bare with just the apostrophe in front, and a
test demanding `"'=cmd..."` would report a defect that is not there. A note
that *does* contain a comma and a quote is quoted, and its quotes doubled,
per RFC 4180.

Measured against the real route, with the real writer, over a scratch
database swapped in for the length of the check: the payload is adversarial
and does not belong in the history an operator reads.
"""

export_db = WORK / "export.db"

if export_db.exists():
    export_db.unlink()

PAYLOAD = "=cmd|'/C calc'!A1, \"quoted, value\", plain"
BARE = "=cmd|'/C calc'!A1"

try:
    from app.api import event_routes
    from app.events.store import EventStore as Store

    scratch = Store(path=export_db)
    scratch.observe("mask", [{"key": "k", "severity": "high",
                              "summary": BARE}], None)
    opened_id = scratch.list(limit=5)["events"][0]["id"]
    scratch.acknowledge(opened_id, disposition="valid", note=PAYLOAD)

    scratch.observe("ppe", [{"key": "k2", "severity": "low",
                             "summary": "ordinary, with a comma"}], None)

    real_store = event_routes.event_store
    event_routes.event_store = scratch

    try:
        response = event_routes.export_events(days=1)

        # Drained the way the server would drain it. Starlette wraps sync
        # content into an async iterator at construction time, so
        # `body_iterator` is async whatever the route handed over — a plain
        # `for` over it is a TypeError, not a shortcut.
        async def _drain(stream):
            chunks = [
                chunk if isinstance(chunk, bytes) else chunk.encode()
                async for chunk in stream
            ]
            return b"".join(chunks)

        body = asyncio.run(_drain(response.body_iterator)).decode()
    finally:
        event_routes.event_store = real_store

    (WORK / "export.csv").write_text(body)

    lines = [line for line in body.splitlines() if line.strip()]

    check("the export answers with a header and a row per event",
          len(lines) >= 3 and lines[0].startswith("When (UTC)"),
          f"{len(lines)} lines: {lines[:2]}")

    check("a formula in a summary is prefixed with an apostrophe, so a "
          "spreadsheet reads it as text",
          f"'{BARE}" in body,
          f"expected '{BARE} in the export; got "
          f"{[l for l in lines if 'cmd' in l][:1]}")

    check("a bare formula is not quoted as well, because it contains nothing "
          "that needs quoting",
          f'"\'{BARE}"' not in body,
          "the summary cell was quoted — csv.writer quotes minimally and a "
          "test demanding quotes here fails on correct behaviour")

    check("a note containing a comma and a quote is quoted, and its quotes "
          "doubled",
          '"\'=cmd|\'/C calc\'!A1, ""quoted, value"", plain"' in body,
          f"note cell as written: "
          f"{[l for l in lines if 'quoted' in l][:1]}")

    check("an ordinary cell with a comma is quoted and gains no apostrophe",
          '"ordinary, with a comma"' in body,
          f"{[l for l in lines if 'ordinary' in l][:1]}")

    formula_cells = [
        cell for line in lines[1:]
        for cell in next(__import__("csv").reader([line]))
        if cell[:1] in ("=", "+", "-", "@")
    ]

    check("no cell in the export begins with a character a spreadsheet would "
          "execute",
          not formula_cells, f"{formula_cells[:4]}")

except Exception as exc:  # noqa: BLE001
    check("the export can be measured", False, f"{type(exc).__name__}: {exc}")

"""
And the same question of the live endpoint, which is what an operator's
browser actually downloads — with no adversarial payload written into the
real history to ask it.
"""

status, body = request("/api/events/export.csv?days=7")

check("the live export answers with a spreadsheet", status == 200
      and body.startswith("When (UTC)"),
      f"{status}: {body[:120]}")

if status == 200:
    import csv as _csv
    import io as _io

    live_cells = [
        cell
        for row in _csv.reader(_io.StringIO(body))
        for cell in row
        if cell[:1] in ("=", "+", "-", "@")
    ]

    check("nothing in the live export begins with a character a spreadsheet "
          "would execute",
          not live_cells, f"{live_cells[:4]}")


# ----------------------------------------------------------------------
# 3 · the chart
# ----------------------------------------------------------------------

section("3 · DASH-03 · the day-by-day chart draws bars with height in them")

"""
`style="height: 45.7364%"`, rendered height 0.0 px. The column wrapper sits
in a flex row with `items-end`, so it is content-sized rather than stretched,
and a percentage of an indefinite parent resolves to zero.

Every number below is a `getBoundingClientRect().height`. The inline style is
read too, but only to check the arithmetic still happens and to have
something to compare the rendering against — asserting the style is what
would have missed this defect entirely.

The summary the page reads is intercepted and served from a fixed body, so
the heights and the counts they are checked against provably came from the
same numbers: a shared database three agents are writing to moves between one
fetch and the next. Twice — once with this backend's real figures, once with
the report's own 129/59/27 and a day with nothing on it.
"""

for width in (1440, 390):
    chart = run_node(
        HERE / "_probe_surfaces.js",
        {"P5_BASE": BASE, "P5_MODE": "chart", "P5_WIDTH": str(width)},
        timeout=600,
    )

    (WORK / f"chart_{width}.json").write_text(json.dumps(chart, indent=1))

    if not check(f"the chart probe ran at {width}px",
                 not chart.get("__failed__") and not chart.get("error"),
                 json.dumps(chart)[:500]):
        continue

    for name in ("real", "control"):
        measured = chart.get(name) or {}

        if "error" in measured:
            check(f"the day-by-day chart is on the reports page at {width}px "
                  f"({name} figures)", False, measured["error"])
            continue

        container = measured["container"]["height"]
        columns = measured["columns"]

        percentages = []
        for column in columns:
            match = re.search(r"height:\s*([\d.]+)%", column["inlineStyle"] or "")
            percentages.append(float(match.group(1)) if match else None)

        heights = [column["renderedHeight"] for column in columns]

        print(f"      {width}px {name}: container {container:.0f}px · "
              + " · ".join(
                  f"{p:.1f}%→{h:.0f}px" for p, h in zip(percentages, heights)
                  if p is not None))

        check(f"the chart still computes a percentage per day at {width}px "
              f"({name})",
              all(p is not None for p in percentages),
              f"{[c['inlineStyle'] for c in columns]}")

        tallest = max(heights) if heights else 0

        check(f"the tallest bar has real height at {width}px ({name})",
              tallest >= 0.25 * container,
              f"tallest bar {tallest:.1f}px of a {container:.0f}px chart — "
              f"the styles say {[f'{p}%' for p in percentages]}")

        # A bar of a fixed non-zero height would pass the check above and
        # still answer the page's question with nothing.
        pairs = [
            (p, h) for p, h in zip(percentages, heights)
            if p is not None and h is not None
        ]
        biggest = max((p for p, _ in pairs), default=0)

        errors = [
            abs(h - (p / biggest) * tallest)
            for p, h in pairs
        ] if biggest and tallest else []

        check(f"each bar is as tall as its share of the busiest day at "
              f"{width}px ({name})",
              bool(errors) and max(errors) <= max(3.0, 0.06 * tallest),
              f"worst bar is {max(errors, default=0):.1f}px away from its "
              f"share; heights {[round(h, 1) for h in heights]} for "
              f"{[round(p, 1) for p in percentages]}")

        if name == "control":
            # 129/59/0/27: the day with nothing on it still draws its 3%
            # floor, and is unmistakably shorter than a day with 27.
            zero = heights[2]
            check(f"a day with no events draws its floor and nothing more at "
                  f"{width}px",
                  0 < zero < 0.5 * heights[3],
                  f"the empty day rendered {zero:.1f}px beside "
                  f"{heights[3]:.1f}px for 27 events")

        inner = [
            column["innerRenderedHeight"] for column in columns
            if column["innerInlineStyle"]
            and "height: 0%" not in column["innerInlineStyle"]
        ]

        if name == "real":
            # The live window is whatever it honestly is: high-severity
            # events age out of the page's 7-day view, so what is asserted
            # is agreement between the screen and the summary the page
            # draws from — a high share drawn when the window holds one,
            # and none drawn when it does not. Demanding a segment
            # unconditionally made this check a bet on the database's
            # recent history: it flipped between two same-day runs of this
            # suite when two zone intrusions aged past the cutoff.
            _, live_now = get_json("/api/events/summary?days=7")
            live_high = sum(
                day.get("high", 0)
                for day in ((live_now.get("data") or {}).get("by_day") or [])
            )
            check(f"the high-severity share inside a bar draws exactly when "
                  f"the live window holds one at {width}px ({name})",
                  (bool(inner) and all(value > 0 for value in inner))
                  if live_high else not inner,
                  f"window holds {live_high} high event(s); drawn segments "
                  f"{[round(v, 1) for v in inner]} — the severity mix is "
                  f"the second thing this panel says")
        else:
            check(f"the high-severity share inside a bar draws too at "
                  f"{width}px ({name})",
                  bool(inner) and all(value > 0 for value in inner),
                  f"{[round(v, 1) for v in inner]} — the severity mix is "
                  f"the second thing this panel says")


# ----------------------------------------------------------------------
# 4 · every page at 390px
# ----------------------------------------------------------------------

section("4 · DASH-06 · every page is legible and operable at 390px")

"""
The sidebar has no responsive class at all: its two states are 76 px and
252 px, both set by hand, so a 390 px viewport is left with 138 px for
everything. Measured before this phase: the Doors page renders a fourteen-word
paragraph on fourteen lines, three panel titles are ellipsised to nothing, and
all four of the Events page's filter dropdowns sit off the right edge inside a
box that clips them.

What is asserted here is what an operator can read and reach:

  · nothing sits off the right edge of the viewport
  · no heading or button has been ellipsised by the layout
  · body text averages more than two words to a line
  · the content is left most of the screen
  · the navigation is either on screen or one visible control away, and that
    control works

Left-of-viewport is reported rather than failed on: a drawer parked off-canvas
is exactly what the fix looks like, and the navigation check is what proves it
can be brought back.

`documentElement.scrollWidth <= 390` is asserted last and means least. It is
true of the broken build — measured, 390 exactly, on all three pages the
report names — because the content was clipped rather than pushed. A
regression would break it; passing it says nothing.
"""

small = run_node(
    HERE / "_probe_surfaces.js",
    {
        "P5_BASE": BASE,
        "P5_MODE": "small",
        "P5_WIDTH": "390",
        "P5_PATH": ",".join(ALL_PAGES),
    },
    timeout=1800,
)

(WORK / "small_390.json").write_text(json.dumps(small, indent=1))

if check("the 390px probe ran",
         not small.get("__failed__") and not small.get("error"),
         json.dumps(small)[:500]):

    for route in ALL_PAGES:
        record = small.get("pages", {}).get(route, {})
        named = " (named in the report)" if route in NAMED_IN_THE_REPORT else ""

        if record.get("error") or not record.get("measured"):
            check(f"{route}: the page could be measured at 390px{named}",
                  False, str(record.get("error"))[:300])
            continue

        measured = record["measured"]

        off_right = [
            element for element in measured["overflowing"]
            if element["right"] > measured["viewport"] + 1
        ]
        off_left = measured["overflowingCount"] - len(off_right)

        headings = [t for t in measured["truncated"] if t["heading"]]
        controls = [t for t in measured["truncated"] if t["control"]]
        worst = measured["worstParagraphs"][0] if measured["worstParagraphs"] else None

        print(f"      {route:28} main {measured['mainWidth']}px · "
              f"aside {measured['asideWidth']}px · "
              f"{measured['overflowingCount']} off-viewport · "
              f"{len(headings)} clipped titles · "
              f"worst line {worst['perLine'] if worst else 'n/a'} words")

        check(f"{route}: nothing is pushed off the right of a 390px "
              f"screen{named}",
              not off_right,
              f"{len(off_right)}: " + "; ".join(
                  f"{e['tag']}.{e['className'][:24]} right={e['right']} "
                  f"'{e['text'][:24]}'" for e in off_right[:4]))

        check(f"{route}: no title or button is truncated at 390px{named}",
              not headings and not controls,
              "; ".join(
                  f"{t['tag']} '{t['text'][:26]}' {t['scrollWidth']}px into "
                  f"{t['clientWidth']}px"
                  for t in (headings + controls)[:4]))

        check(f"{route}: body text does not wrap to one word a line{named}",
              worst is None or worst["perLine"] >= 2.0,
              f"{worst['perLine']} words a line — {worst['words']} words on "
              f"{worst['lines']} lines: '{worst['text'][:40]}'"
              if worst else "")

        check(f"{route}: the content gets the screen, not a sliver of "
              f"it{named}",
              (measured["mainWidth"] or 0) >= 0.75 * measured["viewport"],
              f"main is {measured['mainWidth']}px of "
              f"{measured['viewport']}px, sidebar {measured['asideWidth']}px")

        reachable = record.get("navAfter") or []

        check(f"{route}: every destination is on screen or one control "
              f"away{named}",
              len(reachable) == 4,
              f"reached {reachable} of ['/dashboard', '/events', '/reports', "
              f"'/monitoring/door']; a menu control was "
              f"{'found: ' + str(record.get('openerName')) if record.get('openerFound') else 'not found'}"
              f"{'; clicking it: ' + str(record.get('openerClickError')) if record.get('openerClickError') else ''}")

        check(f"{route}: the page does not scroll sideways{named}",
              not measured["horizontalScroll"],
              f"scrollWidth {measured['documentScrollWidth']} > "
              f"{measured['viewport']}")

        note(f"{route}: nothing is parked off the left edge",
             off_left == 0,
             f"{off_left} element(s) left of the viewport — a closed drawer "
             f"looks exactly like this, which is why it does not fail")

        if route == "/events":
            selects = measured["selects"]
            check("the Events filter dropdowns are neither off the edge nor "
                  "clipped at 390px (named in the report)",
                  bool(selects) and not any(
                      s["offRight"] or s["insideAClippedBox"] for s in selects),
                  f"{[(s['text'][:10], s['width'], 'off-right' if s['offRight'] else '', 'clipped' if s['insideAClippedBox'] else '') for s in selects]}")


# ----------------------------------------------------------------------
# 5 · both spellings of the routes
# ----------------------------------------------------------------------

section("5 · DASH-10 · the documented paths answer, and unknown ones 404")

"""
`/api/system/*` and `/api/camera/*` are what the documentation says and what
an integrator types; the real routes had no prefix, so the documented ones
fell through to the dashboard's catch-all and returned a page of HTML with a
200. Phase 0 made an unknown `/api` path 404 — the remaining work is serving
the real ones under `/api` **without breaking the unprefixed ones**, because
the front end calls those today and a flag day helps nobody.
"""

for path in ("/system/status", "/api/system/status",
             "/camera/status", "/api/camera/status", "/health"):
    status, payload = get_json(path)

    check(f"GET {path} answers as an endpoint, not as the dashboard",
          status == 200 and isinstance(payload, dict)
          and payload.get("success") is True and "data" in payload,
          f"{status}: {json.dumps(payload)[:160]}")

_, unprefixed = get_json("/system/status")
_, prefixed = get_json("/api/system/status")

check("both spellings of the system status answer with the same thing",
      sorted((unprefixed.get("data") or {}).keys())
      == sorted((prefixed.get("data") or {}).keys())
      and (unprefixed.get("data") or {}).get("model")
      == (prefixed.get("data") or {}).get("model"),
      f"unprefixed keys {sorted((unprefixed.get('data') or {}).keys())} vs "
      f"prefixed {sorted((prefixed.get('data') or {}).keys())}")

_, unprefixed_camera = get_json("/camera/status")
_, prefixed_camera = get_json("/api/camera/status")

check("both spellings of the camera status answer with the same thing",
      unprefixed_camera.get("data") is not None
      and sorted((unprefixed_camera.get("data") or {}).keys())
      == sorted((prefixed_camera.get("data") or {}).keys()),
      f"{json.dumps(unprefixed_camera)[:120]} vs "
      f"{json.dumps(prefixed_camera)[:120]}")

for path in ("/api/no-such-thing", "/api/system/no-such-thing",
             "/api/camera/no-such-thing", "/system/no-such-thing",
             "/camera/no-such-thing"):
    for method in ("GET", "POST"):
        status, body = request(path, method=method)

        check(f"{method} {path} is 404, not the dashboard and not 405",
              status == 404,
              f"{status}: {body[:100]}")

status, body = request("/monitoring/door")

check("a deep link into the dashboard still serves the app",
      status == 200 and "<div id=\"root\"" in body,
      f"{status}: {body[:120]}")


# ----------------------------------------------------------------------
# 6 · the watchlist, and 7 · the invisible three
# ----------------------------------------------------------------------

section("6 · FACE-02 · the watchlist says how far it reaches")

"""
Not a bug: per-session state is properly isolated and the register is a single
global by design. Registering someone arms detection on every camera in the
deployment immediately, and nothing on screen said so. This is the only defect
in the phase whose fix is a sentence.
"""

text = run_node(
    HERE / "_probe_surfaces.js",
    {"P5_BASE": BASE, "P5_MODE": "text"},
    timeout=900,
)

(WORK / "text.json").write_text(json.dumps(text, indent=1))

pages_text = text.get("pages", {}) if not text.get("__failed__") else {}

if check("the page-text probe ran",
         not text.get("__failed__") and not text.get("error"),
         json.dumps(text)[:400]):

    face = pages_text.get("face", "")

    said = says(
        face,
        "every camera", "all cameras", "deployment-wide", "deployment wide",
        "across the deployment", "every camera in", "on every camera",
        "system-wide", "everywhere in",
    )

    check("the face page says the watchlist arms every camera",
          said is not None,
          "nothing on the page says how far a registration reaches; looked "
          "for 'every camera', 'all cameras', 'deployment-wide'. Page says: "
          + " / ".join(line for line in face.splitlines() if line.strip())[:220])

    if said:
        sentence = next(
            (line.strip() for line in face.splitlines()
             if said.lower() in line.lower()), said)
        print(f"      on screen: \"{sentence[:150]}\"")

    note("the watchlist statement is where somebody registering will read it",
         bool(said) and (
             says(face[:face.lower().find(said.lower()) + 400], "register",
                  "add", "watchlist", "watch list") is not None),
         "the sentence is on the page but not near the registration control — "
         "a judgement, not a measurement, and worth an eye rather than a "
         "failure")


section("7 · the three phases of work that nothing on screen read")

"""
Each of these is data the backend already published and no screen showed.

  presence_grace_seconds  the real time from walking away to an alert is the
                          allowance *plus* the grace. The panel said 10
                          seconds; the answer is about 14. The report's
                          "~13.9s" is a measured figure with a frame of
                          jitter in it — what is asserted here is the
                          arithmetic on the constant the backend publishes,
                          because demanding 13.9 exactly would be demanding
                          the screen reproduce a measurement error.

  crowded                 a marked box with two doorways in it warns through
                          the region label and the summary; the per-door rows
                          render a fixed set of fields and never mentioned it.

  unreliable              Phase 4's fourth per-door state, landing alongside
                          this work. Not an alert and not a clean answer:
                          amber, never green, with words — Phase 2's rule for
                          "cannot check", which this product has already
                          settled once.

The door states are measured against a payload injected through the module's
own endpoints. A doorway whose evidence is a coin flip cannot be produced on
demand from a photograph, and the question here is not whether the backend
can reach that state — Phase 4's suite asks that — but what this page draws
when it does. The colours are read off the page's own closed and open rows,
so this suite never has to know what the palette is.
"""

workstation_config = (text.get("/api/workstation/config") or {}).get("data") or {}
grace = workstation_config.get("presence_grace_seconds")
allowance = workstation_config.get("empty_seconds")

check("the backend still publishes the grace this phase has to show",
      isinstance(grace, (int, float)) and grace > 0,
      f"presence_grace_seconds={grace} on /api/workstation/config")

if isinstance(grace, (int, float)) and isinstance(allowance, (int, float)):
    station = pages_text.get("workstation", "")
    expected = allowance + grace

    check("the workstation page states the real time from walking away to an "
          "alert, not just the allowance",
          any(abs(value - expected) <= 0.6 for value in numbers_in(station)),
          f"nothing on the page reads {expected:.0f}s (allowance "
          f"{allowance:.0f}s + grace {grace:.1f}s). Numbers on the page: "
          f"{sorted(set(numbers_in(station)))[:12]}")

    explained = says(
        station,
        "grace", "settle", "settling", "before it counts", "counts as empty",
        "stops believing", "no longer sees", "confirm", "in total", "about "
        f"{expected:.0f}",
    )

    check("the workstation page says why the real time is longer than the "
          "allowance",
          explained is not None,
          "a number with no explanation is a second number to distrust; "
          "looked for 'grace', 'settle', 'before it counts', 'in total'")

door_states = run_node(
    HERE / "_probe_surfaces.js",
    {"P5_BASE": BASE, "P5_MODE": "doors"},
    timeout=900,
)

(WORK / "doors.json").write_text(json.dumps(door_states, indent=1))

if check("the door-state probe ran",
         not door_states.get("__failed__") and not door_states.get("error"),
         json.dumps(door_states)[:400]):

    rows = door_states.get("measured", {}).get("rows", [])
    body_text = door_states.get("measured", {}).get("bodyText", "")

    def row_for(name: str) -> Optional[dict]:
        return next((row for row in rows if name.lower() in row["text"].lower()),
                    None)

    closed = row_for("Loading bay")
    open_row = row_for("Store room")
    unreliable = row_for("Side exit")
    crowded = row_for("Corridor")

    check("the injected doors reach the screen at all",
          all(row is not None for row in (closed, open_row, unreliable, crowded)),
          f"rows found: {[row['text'][:24] for row in rows][:6]}")

    if closed and unreliable:
        print(f"      closed row:     {closed['text'][:60]!r} "
              f"badge {closed['badge']['text'] if closed['badge'] else None} "
              f"{closed['badge']['background'] if closed['badge'] else ''}")
        print(f"      unreliable row: {unreliable['text'][:60]!r} "
              f"badge {unreliable['badge']['text'] if unreliable['badge'] else None} "
              f"{unreliable['badge']['background'] if unreliable['badge'] else ''}")

        check("an unreliable door is not painted like a door that is "
              "confirmed shut",
              unreliable["badge"] != closed["badge"]
              or unreliable["chip"] != closed["chip"],
              f"the unreliable row is painted exactly as the closed row: "
              f"badge {unreliable['badge']}, chip {unreliable['chip']} — this "
              f"is the green all-clear on a doorway whose evidence is a coin "
              f"flip")

        check("an unreliable door says something rather than borrowing the "
              "closed row's words",
              (unreliable["badge"] or {}).get("text", "").strip().lower()
              not in ("", "closed"),
              f"badge reads {(unreliable['badge'] or {}).get('text')!r}")

        if open_row:
            same_as_warning = (
                unreliable["chip"] == open_row["chip"]
                or (unreliable["badge"] or {}).get("background")
                == (open_row["badge"] or {}).get("background")
            )
            note("an unreliable door is painted in the page's own warning "
                 "colour",
                 same_as_warning,
                 f"unreliable chip {unreliable['chip']} vs the page's warning "
                 f"chip {open_row['chip']} — it is not green, which is what "
                 f"blocks; whether this particular amber is the product's "
                 f"amber is a design judgement")

    if crowded:
        said_crowded = says(
            crowded["text"],
            "two doorways", "2 doorways", "more than one doorway",
            "two doors", "2 doors", "crowded", "another doorway",
        )

        check("a marked box with two doorways in it says so on its own row",
              said_crowded is not None,
              f"the row reads {crowded['text'][:80]!r} — the summary and the "
              f"region label warn, and the row an operator reads does not")

    note("the door module publishes the unreliable state this page draws",
         "unreliable" in json.dumps(
             get_json("/api/door/results")[1]).lower()
         or "doors_unreliable" in json.dumps(get_json("/api/door/results")[1]),
         "the backend on this port does not mention `unreliable` in its door "
         "results — Phase 4 was landing while this was written, so the screen "
         "is measured against the contract's payload rather than a live one")


# ----------------------------------------------------------------------
# 8 · a working screen is unchanged
# ----------------------------------------------------------------------

section("8 · a working screen looks exactly as it looked")

"""
Phase 2's frontend agent proved this by pixel comparison — 0 differing pixels
on seven pages — and this phase rebuilds the container every one of those
screens sits in, so it is proved the same way.

The reference was photographed from the build that was live before any of
this phase landed (`reference/BUILD.txt` records which), with the clock's
formatting frozen, the history answered with a fixed empty page, and every
transition stopped. Three things are asked before any pixel is believed:

  · that the reference is not from the build under test. A photograph
    compared against itself agrees perfectly and means nothing — the same
    trap as a verdict baseline whose rows would agree with a module that had
    been deleted.

  · that the state behind the screens has not moved. A doorway marked between
    the two runs changes the Doors page legitimately; that has to read as "no
    comparison", not as a regression.

  · that the comparison can see a change at all, by photographing one page
    shifted a single pixel and confirming the count is not zero.
"""

if SKIP_PIXELS:
    note("a working screen is unchanged", False, "skipped with --skip-pixels")
elif CAPTURE_REFERENCE:
    shots = run_node(
        HERE / "_probe_screens.js",
        {"P5_BASE": BASE, "P5_OUT": str(REFERENCE), "P5_WIDTH": "1440"},
        timeout=1200,
    )
    (REFERENCE / "BUILD.txt").write_text(
        f"{current_build}\ncaptured {time.strftime('%Y-%m-%dT%H:%M:%SZ')}\n"
    )
    (REFERENCE / "fingerprint.json").write_text(
        json.dumps(shots.get("fingerprint", {}), indent=1)
    )
    note("a reference was captured rather than compared against", False,
         f"{len(shots.get('pages', {}))} pages into {REFERENCE} from build "
         f"{current_build}. A reference taken from the build under test "
         f"proves nothing — this is only correct before the change lands")
else:
    reference_build = ""
    build_file = REFERENCE / "BUILD.txt"

    if build_file.exists():
        reference_build = build_file.read_text().splitlines()[0].strip()

    if not check("the photographs taken before this phase began are present",
                 REFERENCE.exists() and any(REFERENCE.glob("*.png")),
                 f"no reference in {REFERENCE} — take one from the build "
                 f"under comparison with --capture-reference, which is only "
                 f"honest before the change lands"):
        pass
    else:
        after = WORK / "after"

        shots = run_node(
            HERE / "_probe_screens.js",
            {"P5_BASE": BASE, "P5_OUT": str(after), "P5_WIDTH": "1440"},
            timeout=1200,
        )

        if check("the screens could be photographed again",
                 not shots.get("__failed__") and not shots.get("error"),
                 json.dumps(shots)[:400]):

            check("the reference is from a different build than the one under "
                  "test",
                  reference_build != "" and reference_build != current_build,
                  f"reference build {reference_build or 'unrecorded'}, "
                  f"current build {current_build} — comparing a build against "
                  f"itself agrees perfectly and measures nothing")

            reference_fingerprint = {}
            fingerprint_file = REFERENCE / "fingerprint.json"

            if fingerprint_file.exists():
                reference_fingerprint = json.loads(fingerprint_file.read_text())

            moved = [
                endpoint
                for endpoint, value in (shots.get("fingerprint") or {}).items()
                if endpoint in reference_fingerprint
                and reference_fingerprint[endpoint] != value
                and "face/config" not in endpoint
            ]

            check("the state behind the screens is the state they were "
                  "photographed in",
                  not moved,
                  f"{moved} answer differently than when the reference was "
                  f"taken — something was marked or unmarked in between, so "
                  f"the pixels below compare two different worlds")

            total_differing = 0

            for route in MODULE_PAGES:
                name = route.lstrip("/").replace("/", "_") + "_1440.png"

                # Every region a difference on this page has an explanation
                # for: the growth every page shares, this page's own
                # commissioned rework, and the rectangle its phase was
                # allowed.
                explained = list(GROWN_SINCE_REFERENCE)
                if route in GROWN_ROUTES:
                    explained.append(GROWN_ROUTES[route])
                if route in DELIBERATE_CHANGES:
                    explained.append(DELIBERATE_CHANGES[route])

                outside, count, extra, box = changed_outside(
                    REFERENCE / name, after / name,
                    [region for _, region in explained],
                )

                if outside is None:
                    check(f"{route} is pixel for pixel what it was outside "
                          f"the regions commissioned work occupies", False,
                          str(count))
                    continue

                total_differing += count

                if route in DELIBERATE_CHANGES and count == 0:
                    # The commissioned change is missing, which the words on
                    # the page are also asked about in sections 5 to 7. Said
                    # here too, because a page that agrees perfectly with its
                    # own before-picture is the one result this criterion can
                    # never call a pass.
                    why = DELIBERATE_CHANGES[route][0]
                    check(f"{route} shows the block this phase added to it",
                          False,
                          f"identical to the reference — {why} did not reach "
                          f"the screen")
                    continue

                print(f"      {route}: {count} px differ "
                      f"({100 * count / extra:.2f}%), "
                      f"{outside} of them unexplained, across "
                      f"{len(explained)} explained region(s)")

                check(f"{route} is pixel for pixel what it was outside the "
                      f"regions commissioned work occupies",
                      outside == 0,
                      f"{outside} unexplained pixel(s) in "
                      f"x {box[0]:.0%}-{box[2]:.0%}, y {box[1]:.0%}-{box[3]:.0%}"
                      f" — every explained region: "
                      + "; ".join(
                          f"x {r[0]:.0%}-{r[2]:.0%} y {r[1]:.0%}-{r[3]:.0%} "
                          f"({w})" for w, r in explained)
                      + f" — {after / name} beside {REFERENCE / name}"
                      if box else str(outside))

            print(f"      {total_differing} differing pixels across "
                  f"{len(MODULE_PAGES)} pages")

            # The instrument, proved rather than trusted.
            tampered = WORK / "tampered"

            run_node(
                HERE / "_probe_screens.js",
                {
                    "P5_BASE": BASE,
                    "P5_OUT": str(tampered),
                    "P5_WIDTH": "1440",
                    "P5_PATHS": MODULE_PAGES[0],
                    "P5_TAMPER": "1",
                },
                timeout=600,
            )

            name = MODULE_PAGES[0].lstrip("/").replace("/", "_") + "_1440.png"
            shifted, _ = differing_pixels(after / name, tampered / name)

            check("the comparison can see a one-pixel change, so a zero above "
                  "means agreement rather than blindness",
                  bool(shifted),
                  f"a page shifted one pixel differs in {shifted} pixels")


# ----------------------------------------------------------------------
# 9 · the phases underneath
# ----------------------------------------------------------------------

section("9 · Phases 4, 3, 2, 1 and 0 still hold")

"""
Phase 4's suite runs Phase 3's, which runs Phase 2's, which runs Phase 1's and
Phase 0's — one invocation measures all five. Run last, and alone: those
suites mark doorways, workstations and zones in the same storage this backend
serves from, and anything measuring a screen while they do is measuring their
setup rather than the product's.
"""

if SKIP_EARLIER:
    note("Phase 4's suite still passes", False,
         "skipped with --skip-earlier-phases")
elif not (HERE / "verify_phase4.py").exists():
    note("Phase 4's suite still passes", False,
         "there is no tests/verify_phase4.py — Phase 4 was landing while this "
         "was written. Phase 3's is run instead, which covers 3, 2, 1 and 0")

    earlier = subprocess.run(
        [PYTHON, str(HERE / "verify_phase3.py"), "--base", BASE],
        cwd=str(BACKEND), capture_output=True, text=True,
        env={**os.environ, "PYTHONPATH": str(BACKEND)}, timeout=10800,
    )

    check("Phase 3's suite still passes, and Phases 2, 1 and 0 inside it",
          earlier.returncode == 0,
          f"exit {earlier.returncode} · " + "; ".join(
              re.findall(r"^FAIL {2}(.+?)(?:  \[|$)", earlier.stdout,
                         re.MULTILINE)[:6]))
else:
    print("      running Phase 4's suite, which runs Phase 3's, which runs "
          "Phase 2's, which runs Phase 1's and Phase 0's. This is the long "
          "part.")

    # --no-restart: Phase 4's restart ritual owns 8012 and refuses any
    # other base — rightly, a chained run must not kill a server it does
    # not own. Its freshness checks still hold the 8013 server to
    # "started after the newest source file", which is the point.
    earlier = subprocess.run(
        [PYTHON, str(HERE / "verify_phase4.py"), "--base", BASE,
         "--no-restart"],
        cwd=str(BACKEND),
        capture_output=True,
        text=True,
        env={**os.environ, "PYTHONPATH": str(BACKEND)},
        timeout=14400,
    )

    (WORK / "earlier_phases.log").write_text(earlier.stdout + "\n" + earlier.stderr)

    tallies = [line.strip() for line in earlier.stdout.splitlines()
               if "checks passed" in line]

    for tally in tallies:
        print(f"      {tally}")

    failed_names = re.findall(r"^FAIL {2}(.+?)(?:  \[|$)", earlier.stdout,
                              re.MULTILINE)

    check("Phase 4's suite still passes, and Phases 3, 2, 1 and 0 inside it",
          earlier.returncode == 0,
          f"exit {earlier.returncode} · {len(failed_names)} failed checks: "
          + "; ".join(failed_names[:6])
          + (f" · see {WORK / 'earlier_phases.log'}" if failed_names else
             earlier.stdout[-300:]))


# ----------------------------------------------------------------------
# Leaving nothing behind
# ----------------------------------------------------------------------

section("Leaving nothing behind")

"""
This suite marks nothing and configures nothing: the door states it measures
are injected into one browser, the export it inspects is written to a scratch
database, and every photograph it takes lives outside the repository. What it
does create is events — real ones, from real frames pushed through a real
socket — and no API deletes an event. They are listed here with their end
times, which is the whole point of them.
"""

for module_id, key in (("door", "doors"), ("workstation", "workstations")):
    _, payload = get_json(f"/api/{module_id}/config")
    check(f"no {key} are marked on this backend",
          not (payload.get("data") or {}).get(key),
          f"{(payload.get('data') or {}).get(key)} — this suite marks none, "
          f"so these are somebody else's, and the pixel comparison above "
          f"photographed them")

_, payload = get_json("/api/restricted-zone/config")
check("no restricted area is drawn on this backend",
      not (payload.get("data") or {}).get("polygon"),
      f"{(payload.get('data') or {}).get('polygon')}")

if steps:
    left_open = [
        row for row in steps.get("afterLast", {}).get(finder, [])
        if row["occurred_at"] >= sockets.get("startedAt", "")[:19]
        and row["ended_at"] is None
    ]

    check("this suite left no event of its own open",
          not left_open,
          f"{[(row['id'], row['summary']) for row in left_open]}")

for scratch_file in (WORK / "lifecycle.db", WORK / "export.db"):
    check(f"the scratch database {scratch_file.name} is outside the "
          f"repository",
          not str(scratch_file).startswith(str(REPO)),
          f"{scratch_file}")

stray = [
    path for path in (REPO / "tests").glob("*")
    if path.name.startswith(("after", "tampered", "reference"))
]

check("no photographs were left in the repository",
      not stray, f"{[str(p) for p in stray]}")


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
    print("\nPhase 5 does not ship.")
    sys.exit(1)

print("\nPhase 5's every done-when criterion holds.")
