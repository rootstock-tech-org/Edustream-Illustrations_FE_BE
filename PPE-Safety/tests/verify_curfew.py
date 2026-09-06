"""
The curfew — the hours a camera's whole view is off limits.

A marked zone asks "is anybody standing there". A curfew asks "is anybody
here at all, at this hour", and the difference is not cosmetic: while one
runs, the area is everything the camera can see and nothing needs drawing.

What this measures:

    * a camera with no curfew behaves exactly as it did before
    * a curfew set but not running behaves exactly as it did before
    * a curfew running turns the whole view into the restricted area
    * the window is judged on the footage's own clock when there is one
    * and otherwise in the timezone the operator typed it in, not the
      server's — the failure this section was written for
    * midnight: a Friday-night curfew covers Saturday's small hours with
      only Friday ticked
    * an unusable window is refused rather than stored and shown as set
    * a breach is its own event key, and records which clock judged it

The first two are the important ones. Everything else in this product
watches marked shapes, and a feature that changed what those do on cameras
nobody set a curfew on would be a regression wearing a new feature's name.

Run from `backend/`:

    PYTHONPATH=$PWD .venv/bin/python ../tests/verify_curfew.py
"""
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

import cv2

from app.modules.restricted_zone.service import RestrictedZoneService
from app.vision.curfew import Curfew, CurfewStore, DAYS, _minutes, curfew_store
from app.vision.zone_store import zone_store

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


def window(start: str, end: str, days) -> Curfew:
    return Curfew(_minutes(start, "s"), _minutes(end, "e"), tuple(days))


def frames(count: int = 5):
    cap = cv2.VideoCapture(str(CLIP))
    out = []
    for i in range(count):
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(i * 15))
        ok, frame = cap.read()
        if ok:
            out.append(frame)
    cap.release()
    return out


print("Curfew verification")

# ----------------------------------------------------------------------
section("1 · the window itself — midnight is where this goes wrong")
# ----------------------------------------------------------------------

night = window("22:00", "06:00", ["fri"])

check("a Friday-night curfew covers Friday evening",
      night.covers(datetime(2026, 8, 21, 23, 30)))

check("and Saturday's small hours, with only Friday ticked — the day tested "
      "is the day the window started",
      night.covers(datetime(2026, 8, 22, 2, 0)))

check("but not Saturday evening, which Friday never started",
      not night.covers(datetime(2026, 8, 22, 23, 30)))

check("it ends exactly at the end, not a minute after",
      night.covers(datetime(2026, 8, 22, 5, 59))
      and not night.covers(datetime(2026, 8, 22, 6, 0)))

check("and starts exactly at the start, not a minute before",
      night.covers(datetime(2026, 8, 21, 22, 0))
      and not night.covers(datetime(2026, 8, 21, 21, 59)))

day = window("09:00", "17:00", ["mon"])
check("a daytime window needs no midnight reasoning",
      day.covers(datetime(2026, 8, 24, 12, 0))
      and not day.covers(datetime(2026, 8, 26, 12, 0)))

check("start and end the same means off, not twenty-four hours — that is a "
      "typo, and the other reading locks a bay for a day",
      not window("08:00", "08:00", ["mon"]).covers(datetime(2026, 8, 24, 12, 0)))

check("a disabled curfew never covers anything",
      not Curfew(_minutes("22:00", "s"), _minutes("06:00", "e"), ("fri",),
                 enabled=False).covers(datetime(2026, 8, 21, 23, 30)))

# ----------------------------------------------------------------------
section("2 · an unusable window is refused, not stored")
# ----------------------------------------------------------------------

store = CurfewStore(path=Path("/tmp/_curfew_suite.json"))

for bad, why in (
    ({"start": "9pm", "end": "06:00", "days": ["fri"]}, "a time that is not HH:MM"),
    ({"start": "25:00", "end": "06:00", "days": ["fri"]}, "an hour that does not exist"),
    ({"start": "22:00", "end": "06:00", "days": []}, "no days at all"),
    ({"start": "08:00", "end": "08:00", "days": ["fri"]}, "a zero-length window"),
):
    try:
        store.set("suite", **bad)
        check(f"{why} is refused", False, "it was stored")
    except ValueError as exc:
        check(f"{why} is refused", True)
        check(f"  ...and the refusal says why: {str(exc)[:52]!r}", bool(str(exc)))

check("nothing was stored by any of those",
      store.for_source("suite") is None)

# ----------------------------------------------------------------------
section("3 · which clock judges the window")
# ----------------------------------------------------------------------

service = RestrictedZoneService()

service.observed_clock = SimpleNamespace(naive="2026-04-02 23:30:00")
at, clock = service._curfew_now()
check("the footage's own burned-in clock decides when there is one",
      clock == "cctv" and at.hour == 23 and at.day == 2, f"{clock} {at}")

service.observed_clock = None
_at, clock = service._curfew_now()
check("the system clock decides when there is not",
      clock == "system", clock)

service.observed_clock = SimpleNamespace(naive="not a timestamp")
_at, clock = service._curfew_now()
check("an unreadable stamp falls back rather than raising",
      clock == "system", clock)

# ----------------------------------------------------------------------
section("4 · the camera itself — and what must not change")
# ----------------------------------------------------------------------

pictures = frames()
check("the demo clip loaded, so the checks below mean something",
      len(pictures) >= 3, f"{len(pictures)} frames")

service = RestrictedZoneService()
source = service._source()
curfew_store.clear(source)
zone_store.clear(source)

before = service.process(pictures[0])[1]
check("with no curfew and no zones the module answers exactly as it always "
      "has",
      before["curfew"] is None
      and before["curfew_active"] is False
      and before["summary"] == "Area clear",
      f"{before['summary']!r}")

today = DAYS[datetime.now().weekday()]
other = DAYS[(datetime.now().weekday() + 2) % 7]

service.configure({"curfew": {"start": "02:00", "end": "03:00", "days": [other]}})
idle = RestrictedZoneService().process(pictures[0])[1]
check("a curfew set for another day leaves the camera behaving as before",
      idle["curfew_active"] is False and idle["summary"] == "Area clear",
      f"{idle['summary']!r}")

service.configure({"curfew": {"start": "00:00", "end": "23:59", "days": [today]}})
running = RestrictedZoneService()
state = None
for picture in pictures:
    state = running.process(picture)[1]
    if state["alert"]:
        break

check("a curfew that is running makes the whole view the restricted area",
      bool(state and state["curfew_active"]), f"{state and state['curfew_active']}")

if state and state["alert"]:
    check("and the sentence names the hours, not a zone nobody drew",
          "curfew" in state["summary"].lower()
          and "restricted zone" not in state["summary"].lower(),
          f"{state['summary']!r}")

    check("the payload says which clock judged it and what that clock read",
          state["curfew_clock"] in ("cctv", "system") and state["curfew_now"],
          f"{state['curfew_clock']} {state['curfew_now']}")

    events = running.events(state)
    check("a breach is its own event key, apart from the marked zones",
          bool(events) and events[0]["key"] == "curfew-breach",
          f"{[e['key'] for e in events]}")

    check("recorded high, the same as any other intrusion",
          bool(events) and events[0]["severity"] == "high")

    check("and the record carries the clock that judged it, so a breach "
          "found in old footage can still be argued",
          bool(events)
          and events[0]["details"].get("judged_by") in ("cctv", "system")
          and events[0]["details"].get("judged_at"),
          f"{events[0]['details'] if events else None}")
else:
    check("a curfew that is running raises an alert", False,
          "nobody was detected in the demo frames")

# ----------------------------------------------------------------------
section("5 · clearing it hands the camera back to the zones")
# ----------------------------------------------------------------------

out = service.configure({"curfew": None})
check("clearing reports success", out.get("success") is True)

after = RestrictedZoneService().process(pictures[0])[1]
check("and the camera answers exactly as it did before any of this",
      after["curfew"] is None
      and after["curfew_active"] is False
      and after["summary"] == before["summary"],
      f"{after['summary']!r} vs {before['summary']!r}")

# ----------------------------------------------------------------------
section("6 · whose hours the window keeps")
# ----------------------------------------------------------------------

# The report this section exists for: a control room in India set a curfew
# for 15:53-16:00 on a Friday, walked into the bay at 15:55, and was told
# the hours were not running. The window was right, the day was right, and
# the server keeping UTC read 10:25.

kolkata = Curfew(_minutes("15:53", "s"), _minutes("16:00", "e"), ("fri",),
                 timezone="Asia/Kolkata", utc_offset_minutes=330)

reported = datetime(2026, 8, 21, 10, 25, tzinfo=timezone.utc)  # the exact moment

check("the reported moment is judged inside the window once it is read in "
      "the zone the window was typed in",
      kolkata.covers(reported.astimezone(kolkata.tzinfo())),
      reported.astimezone(kolkata.tzinfo()).strftime("%a %H:%M"))

check("...and outside it when read raw, which is what happened",
      not kolkata.covers(reported.replace(tzinfo=None)))

check("the same clock face an hour later is outside the window, so this is "
      "a shift and not a curfew that now covers everything",
      not kolkata.covers(
          (reported + timedelta(hours=1)).astimezone(kolkata.tzinfo())))

# The conversion the service actually performs, measured against whatever
# clock this machine keeps rather than assuming it keeps UTC.
service = RestrictedZoneService()
service.observed_clock = None

local_offset = datetime.now().astimezone().utcoffset().total_seconds() / 60
at, clock = service._curfew_now(kolkata)
gap = (at.replace(tzinfo=None) - datetime.now()).total_seconds() / 60

check("the service shifts the wall clock by exactly the window's offset",
      abs(gap - (330 - local_offset)) < 1,
      f"{gap:.0f} min, expected {330 - local_offset:.0f}")

check("and names the zone it read it in, for the page to show",
      service._curfew_zone(kolkata, clock) == "Asia/Kolkata",
      f"{service._curfew_zone(kolkata, clock)!r}")

# Midnight and the timezone together, which is where the two features can
# quietly cancel each other out: convert first and the weekday tested is the
# converted one, so a Friday-night window still reads as Friday's.

night = Curfew(_minutes("22:00", "s"), _minutes("06:00", "e"), ("fri",),
               timezone="Asia/Kolkata", utc_offset_minutes=330)

# 20:00 UTC on a Friday is 01:30 on Saturday morning in Kolkata — a
# different weekday and a different date from the one the server keeps.
crossed = datetime(2026, 8, 21, 20, 0, tzinfo=timezone.utc)
local = crossed.astimezone(night.tzinfo())

check("converting first moves the date as well as the hour",
      local.strftime("%a %d %H:%M") == "Sat 22 01:30",
      local.strftime("%a %d %H:%M"))

check("and a Friday-night window still covers it, because the day tested is "
      "the converted Saturday's yesterday",
      night.covers(local))

check("...which the raw reading gets wrong in the other direction — it is "
      "not yet 22:00 anywhere the server is looking",
      not night.covers(crossed.replace(tzinfo=None)))

check("the window still ends where it ends once converted: 06:30 in Kolkata "
      "is outside it",
      not night.covers(
          datetime(2026, 8, 22, 1, 0, tzinfo=timezone.utc)
          .astimezone(night.tzinfo())))

# A zone this machine has no table for. The offset the browser sent with it
# is the fallback, because dropping to the server's clock is the bug.
martian = Curfew(_minutes("15:53", "s"), _minutes("16:00", "e"), ("fri",),
                 timezone="Mars/Olympus", utc_offset_minutes=330)

check("an unknown zone name falls back to the offset saved beside it, not "
      "to the server's clock",
      martian.covers(reported.astimezone(martian.tzinfo())))

check("and is still named on screen, as a plain offset",
      martian.zone_label() == "UTC+05:30", f"{martian.zone_label()!r}")

# The legacy reading. This is the one that must never drift: everything
# stored before any of this existed keeps being judged exactly as it was.
legacy = Curfew(_minutes("15:53", "s"), _minutes("16:00", "e"), ("fri",))

check("a window stored without a zone has none to resolve",
      legacy.tzinfo() is None and legacy.zone_label() is None)

at, clock = service._curfew_now(legacy)
check("so it is judged on the server's own clock, unshifted, exactly as "
      "before this existed",
      at.tzinfo is None
      and abs((at - datetime.now()).total_seconds()) < 2
      and clock == "system",
      f"{at} {clock}")

check("and nothing is offered as its zone, rather than a guess",
      service._curfew_zone(legacy, clock) is None)

# The burned-in clock is not converted, and that is the point of it.
service.observed_clock = SimpleNamespace(naive="2026-04-02 23:30:00")
at, clock = service._curfew_now(kolkata)

check("a recording's own burned-in clock is read as it stands, never put "
      "through a zone — 23:30 in the footage is 23:30",
      clock == "cctv" and at.hour == 23 and at.minute == 30,
      f"{clock} {at}")

check("and no zone is named beside it, which would imply a conversion that "
      "deliberately did not happen",
      service._curfew_zone(kolkata, clock) is None)

service.observed_clock = None

# The strict/forgiving split: times and days make a window valid, a zone
# name never does.
store = CurfewStore(path=Path("/tmp/_curfew_suite.json"))

saved = store.set("zoned", start="22:00", end="06:00", days=["fri"],
                  timezone="Asia/Kolkata", utc_offset_minutes=330)
check("a zone is stored with the window", saved.timezone == "Asia/Kolkata")

kept = store.set("junk", start="22:00", end="06:00", days=["fri"],
                 timezone="Mars/Olympus", utc_offset_minutes=330)
check("an unusable zone name costs the label, never the curfew — the "
      "window and the days are what make it a curfew",
      kept.timezone is None and kept.utc_offset_minutes == 330)

try:
    store.set("still", start="9pm", end="06:00", days=["fri"],
              timezone="Asia/Kolkata")
    check("an unusable time is still refused, zone or no zone", False,
          "it was stored")
except ValueError:
    check("an unusable time is still refused, zone or no zone", True)

reloaded = CurfewStore(path=Path("/tmp/_curfew_suite.json"))
back = reloaded.for_source("zoned")
check("and the zone survives a restart, or the first night after a reboot "
      "runs on the wrong clock",
      back is not None and back.timezone == "Asia/Kolkata"
      and back.utc_offset_minutes == 330,
      f"{back and back.as_dict()}")

# ----------------------------------------------------------------------
section("7 · a curfew is setup, even with nothing drawn")
# ----------------------------------------------------------------------

bare = RestrictedZoneService()
curfew_store.clear(source)
zone_store.clear(source)

check("a camera with neither zones nor a curfew is not set up",
      bare.is_configured() is False and bare.is_ready() is False)

bare.configure({"curfew": {"start": "22:00", "end": "06:00", "days": ["fri"]}})
check("a camera whose whole setup is a curfew is set up, and ready — it "
      "used to call itself unconfigured while the view was restricted",
      bare.is_configured() is True and bare.is_ready() is True)

bare.configure({"curfew": None})
check("and clearing it puts that back exactly as it was",
      bare.is_configured() is False and bare.is_ready() is False)

curfew_store.clear(source)
zone_store.clear(source)
Path("/tmp/_curfew_suite.json").unlink(missing_ok=True)

print(f"\n{'All curfew checks passed.' if failures == 0 else str(failures) + ' FAILED'}")
sys.exit(1 if failures else 0)
