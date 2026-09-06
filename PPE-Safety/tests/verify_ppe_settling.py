"""
Safety Gear, settled — the headcount, the gear bar, and the judgement gate.

The page's verdict used to change 1.7-3.2 times a second on footage with
people in it: the median run of a stable sentence was ONE FRAME, and the alert
boolean flipped 22-72 times a minute. Of 305 measured summary changes, 65.6%
were the person count moving — and 87% of those were the detector emitting no
box at all for somebody it had found a frame earlier. The gear verdict had
been steadied per person since Phase 3; the headcount never was.

Three changes answered it: presence became a rolling vote over a window, a
piece of gear already believed worn stopped being dropped the moment its score
dipped, and the gates that decide whether a person can be judged at all became
the window's answer rather than this frame's. This suite measures all three —
and, more importantly, everything they were not allowed to cost:

    the churn fell            on real footage, at the rate the page runs at,
                              against the unsteadied answer on the same frames
    nobody vanished           a person the detector drops for a frame or two
                              stays counted and keeps their box
    nobody was invented       a person who has left stops being counted, and
                              one who has just arrived is not counted until
                              the evidence says so
    the photograph is         single_frame has no sequence to settle over;
    untouched                 every recorded photo verdict still holds
    the alert still lands     a violation is on the screen inside eight
                              frames, which is what the one streaming probe
                              in this tree depends on
    uncertainty is not hidden an unreadable picture is never an all-clear, and
                              a person the module cannot count yet is reported
                              as unverified rather than as absent

Every section says, in a comment, how it could have been vacuous and what
stops it. Three of them would pass on a build with the steadying ripped out if
that were not written down: "the count did not change" is also what a module
that sees nobody says, "the photograph is unchanged" is also what a module
that judges nothing says, and "no alert on a dark frame" is also what a broken
module says. Each is therefore paired with the measurement that proves the
frames it was given had something in them to get wrong.

Section 1 runs the real weights over 48 seconds of real footage and judges
every frame twice; the rest stage the detector's answers, because no clip in
this tree contains a worker who obligingly disappears for exactly two frames.
Fifty seconds end to end on an idle CPU box and three minutes on a busy one,
nearly all of it inference.

Run from backend/:

    PYTHONPATH=$PWD .venv/bin/python ../tests/verify_ppe_settling.py
"""
import importlib
import json
import math
import sys
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
UPLOADS = REPO / "backend" / "storage" / "uploads"

# The probe this suite is partly about is imported rather than described, so
# its frame budget and its light level cannot drift away from the numbers
# asserted against them here.
sys.path.insert(0, str(HERE))

# `app.modules.ppe` exports a service *instance* under the name `service`, so
# `import app.modules.ppe.service as ppe` binds the instance and not the
# module — silently, and every constant read off it then fails with an
# AttributeError that reads like a missing constant. Fetched the one way that
# always gives back the module.
ppe = importlib.import_module("app.modules.ppe.service")

import _probe_standing_alert as standing  # noqa: E402

failures = 0


def check(name: str, ok: bool, detail: str = "") -> bool:
    global failures
    print(("PASS  " if ok else "FAIL  ") + name + (f"  [{detail}]" if not ok and detail else ""))
    if not ok:
        failures += 1
    return ok


def note(text: str) -> None:
    print(f"      {text}")


#: Frames a second every measurement here is made at.
#:
#: Not a round number picked for arithmetic: `RATE_FLOOR` in
#: hooks/captureSizing.js is 5, the browser aims at 10 and calls 5 its floor,
#: and every figure in the contract this suite verifies was measured at 5.
#: A window measured in *seconds* means nothing without a stated rate — at
#: 30fps the same 3.5s window holds 105 frames and asks for 53 sightings, and
#: a probe that drove frames as fast as the CPU allowed would be measuring the
#: machine rather than the module.
FPS = 5.0


class Clock:
    """
    A stand-in for the module's `time`, so frames arrive at a stated rate.

    The presence window, the vote window and the measured cadence are all in
    seconds, and staged frames arrive microseconds apart — a run of twelve
    would land inside a tenth of a second and every window would hold all of
    it. Driving the clock rather than sleeping keeps the suite deterministic
    and quick; sleeping 0.2s a frame would add four minutes and still be at
    the mercy of a loaded box.

    Answers to both shapes the module could be reading the clock through:
    `time.time()` if it imported the module, `time()` if it imported the
    function.
    """

    def __init__(self, start: float = 1_000_000.0) -> None:
        self.t = float(start)

    def tick(self, seconds: float = 1.0 / FPS) -> None:
        self.t += seconds

    def time(self) -> float:
        return self.t

    def monotonic(self) -> float:
        return self.t

    def perf_counter(self) -> float:
        return self.t

    def __call__(self) -> float:
        return self.t


class _Box:
    """One detection, shaped the way ultralytics hands them over."""

    def __init__(self, box, conf, cls):
        self.xyxy = [np.array(box, dtype=float)]
        self.conf = [float(conf)]
        self.cls = [int(cls)]


class _Result:
    def __init__(self, boxes):
        self.boxes = boxes


class Detections:
    """
    A detector that returns exactly what a case is about.

    Every question about presence is a question about *what the detector did
    on frame N and not on frame N+1*, and no photograph in this tree contains
    a worker who obligingly disappears for two frames and comes back. Staged,
    the sequence is the fixture. The pictures underneath are real, because the
    legibility gate and the head and torso bands read actual pixels.
    """

    #: The class numbering the staged scripts below are written in. Checked
    #: against the real weights in section 0 — if the model is ever retrained
    #: with a different order, every staged probe here would go on passing
    #: while testing nothing.
    names = {0: "person", 1: "helmet", 2: "vest"}

    def __init__(self, script):
        self.script = script
        self.index = 0

    def __call__(self, picture, **kwargs):
        boxes = self.script[min(self.index, len(self.script) - 1)]
        self.index += 1
        return [_Result([_Box(*b) for b in boxes])]


class Recording:
    """
    The real detector, keeping what it said so a frame can be judged twice.

    Section 1 needs two answers about every frame — the streamed one and the
    per-frame one it is measured against — and the second inference pass cost
    more than the rest of the suite put together. The model is deterministic
    on a given picture, so replaying what it returned the first time is the
    same experiment, half the wall clock.
    """

    def __init__(self, model):
        self._model = model
        self.names = model.names
        self.script: list[list] = []

    def __call__(self, picture, **kwargs):
        found = self._model(picture, **kwargs)
        self.script.append(
            [
                (
                    tuple(float(v) for v in box.xyxy[0]),
                    float(box.conf[0]),
                    int(box.cls[0]),
                )
                for result in found
                for box in result.boxes
            ]
        )
        return found


def session(service, single: bool = False, model=None):
    """A detached copy, optionally judging stills, optionally with staged eyes."""
    checker = service.for_session()
    checker._origin = None
    checker.single_frame = single

    if model is not None:
        # Both, because `_get_model()` is what `process()` calls and `_model`
        # is what it caches — setting one and not the other leaves whichever
        # was missed to load the real weights half way through a run.
        checker._model = model
        checker._get_model = lambda: model

    return checker


def drive(checker, pictures) -> list[dict]:
    """One session, one run of frames, arriving at exactly FPS."""
    results = []
    clock = Clock()
    real_time = ppe.time
    ppe.time = clock

    try:
        for picture in pictures:
            clock.tick()
            _, result = checker.process(picture)
            results.append(result)
    finally:
        ppe.time = real_time

    return results


def per_frame(service, pictures, script) -> list[dict]:
    """
    The same pictures, each judged on its own with nothing remembered.

    A fresh single_frame session per picture is the module with all of its
    steadying removed — which is what it did on every frame before this work,
    and what the contract says a photograph must go on getting. It is the
    before figure, measured on the same frames in the same run rather than
    remembered from a debug report.
    """
    out = []
    for index, picture in enumerate(pictures):
        checker = session(service, single=True, model=Detections([script[index]]))
        _, result = checker.process(picture)
        out.append(result)
    return out


def changes_per_minute(values, frames: int) -> float:
    """How often the answer changed, per minute of footage at FPS."""
    changed = sum(1 for a, b in zip(values, values[1:]) if a != b)
    return changed * 60.0 * FPS / frames


def frames_of(path: Path, wanted: int) -> list[np.ndarray]:
    """`wanted` frames of a clip, sampled down to FPS."""
    capture = cv2.VideoCapture(str(path))
    source = capture.get(cv2.CAP_PROP_FPS) or 25.0
    step = max(1, int(round(source / FPS)))

    pictures, index = [], 0
    while len(pictures) < wanted:
        ok, picture = capture.read()
        if not ok:
            break
        if index % step == 0:
            pictures.append(picture)
        index += 1

    capture.release()
    return pictures


def first_frame(results, predicate) -> int:
    """1-based frame the run first satisfied `predicate`, or 0 for never."""
    for index, result in enumerate(results, 1):
        if predicate(result):
            return index
    return 0


#: Sentences that mean "we looked, and everything is fine".
#:
#: Listed rather than pattern-matched because the failure this guards against
#: is a *new* calm sentence appearing on a picture nobody could read, and a
#: substring test for "gear" would let "Nobody in view" through — which is the
#: same all-clear said about an empty yard.
ALL_CLEAR = {
    "Wearing the right gear",
    "Everyone is wearing the right gear",
    "Nobody in view",
}


PHOTO = cv2.imread(str(standing.PHOTO))

if PHOTO is None:
    print(f"FAIL  the reference photograph is missing  [{standing.PHOTO}]")
    sys.exit(1)

HEIGHT, WIDTH = PHOTO.shape[:2]

service = ppe.PPEService()

# Loaded once on the origin: `for_session()` copies shallowly, so a clone made
# after this shares the weights instead of spending two seconds loading its
# own. This suite makes several dozen sessions.
MODEL = service._get_model()

# ------------------------------------------------- 0 · the contract's constants

print("--- 0 · the numbers the contract names exist and are ordered\n")

if not check("the weights load — nothing below means anything without them",
             MODEL is not None, f"no model at {ppe.MODEL_PATH}"):
    sys.exit(1)

if not check("the staged detections speak the model's own class numbering",
             dict(MODEL.names) == Detections.names,
             f"{dict(MODEL.names)} — the staged scripts below would be "
             f"labelling boxes with the wrong classes and passing regardless"):
    sys.exit(1)

missing = [
    name
    for name in ("PRESENCE_WINDOW_SECONDS", "PRESENCE_FRACTION",
                 "ITEM_KEEP_CONFIDENCE")
    if not hasattr(ppe, name)
]

if not check("the three constants the contract adds are there, and named",
             not missing, f"absent: {', '.join(missing)}"):
    print("\nNothing else can be measured. 1 FAILED")
    sys.exit(1)

PRESENCE_WINDOW_SECONDS = ppe.PRESENCE_WINDOW_SECONDS
PRESENCE_FRACTION = ppe.PRESENCE_FRACTION
ITEM_KEEP_CONFIDENCE = ppe.ITEM_KEEP_CONFIDENCE

note(f"presence: {PRESENCE_FRACTION:.2f} of the frames in "
     f"{PRESENCE_WINDOW_SECONDS}s — at {FPS:.0f}fps, "
     f"{math.ceil(PRESENCE_FRACTION * PRESENCE_WINDOW_SECONDS * FPS)} sightings "
     f"of {round(PRESENCE_WINDOW_SECONDS * FPS)} frames")
note(f"gear: established at {ppe.ITEM_CONFIDENCE}, kept down to "
     f"{ITEM_KEEP_CONFIDENCE}, detector floor {ppe.POSSIBLE_PERSON_CONFIDENCE}")

check("the bar a piece of gear is established at has not moved",
      ppe.ITEM_CONFIDENCE == 0.55,
      f"{ppe.ITEM_CONFIDENCE} — the contract's one 'do not change this'")

check("the keep bar is below it, or it is not hysteresis",
      ITEM_KEEP_CONFIDENCE < ppe.ITEM_CONFIDENCE,
      f"keep {ITEM_KEEP_CONFIDENCE}, establish {ppe.ITEM_CONFIDENCE}")

check("and above the floor the detector is even run at, so the dead band "
      "nearest the noise stays dead",
      ITEM_KEEP_CONFIDENCE > ppe.POSSIBLE_PERSON_CONFIDENCE,
      f"keep {ITEM_KEEP_CONFIDENCE}, floor {ppe.POSSIBLE_PERSON_CONFIDENCE}")

check("presence is a fraction of a window, not a count of frames",
      0.0 < PRESENCE_FRACTION <= 1.0, f"{PRESENCE_FRACTION}")

check("the presence window is at least as wide as the gear vote window — a "
      "person cannot be judged over longer than they are known to be there",
      PRESENCE_WINDOW_SECONDS >= ppe.STEADY_WINDOW_SECONDS,
      f"presence {PRESENCE_WINDOW_SECONDS}s, votes {ppe.STEADY_WINDOW_SECONDS}s")

# ------------------------------------------------------- 1 · the churn fell

print("\n--- 1 · the churn actually fell, on real footage at 5fps\n")

# Before: 87.3 summary changes a minute, pooled, is the contract's figure. On
# this tree's own footage, measured on this branch before the change landed:
#
#     face_vid.webm      90.0/min      door_test.mp4     105.0/min
#     cctv_demo.webm    176.2/min      video.mp4         156.2/min
#     test_640x480.mp4  193.8/min
#
# so the pooled figure here is nearer 136/min than 87.3 — this footage is
# busier than whatever produced the contract's number, and quoting theirs
# against these clips would be measuring two different things. What each clip
# is measured against instead is the *per-frame* answer on its own frames,
# taken in the same run: the module with all its steadying removed. That is a
# faithful stand-in for the before figure — measured against the pre-change
# streaming path it was within a few percent on every clip (176.2 vs 168.8 on
# cctv_demo, 105.0 vs 108.5 on door_test, 90.0 vs 90.0 on face_vid) — and,
# unlike a remembered number, it cannot drift away from the code.
#
# Pooled over the three clips below — 240 frames, 48 seconds of footage — that
# comes out at 127.5/min unsteadied and 22.5/min steadied: 82% fewer, against
# the 85% the contract measured on its own footage.
#
# How this probe could have been vacuous: a clip with nobody in it never
# changes its sentence, and would post a beautiful 0.0/min. Two things stop
# that — the per-frame answer on the same frames must itself churn past
# CHURN_FLOOR, and a quarter of the frames must have somebody in them.

#: Each clip, how many frames of it, and the ceiling its steadied verdict must
#: come in under, in summary changes a minute.
#:
#:   face_vid.webm    one worker, stationary, whom the detector drops in 11 of
#:                    40 frames — the contract's dominant cause with nothing
#:                    else in the picture. 90.0/min before the change, 0.0/min
#:                    after; 20.0 is the ceiling, one change every three
#:                    seconds, and a wide berth for a clip that measures zero.
#:   door_test.mp4    a doorway people walk in and out of: a scene that
#:                    genuinely changes, so a filter that simply froze the
#:                    answer would fail section 3 rather than pass this.
#:                    105.0/min before (measured over 200 frames), 112.5/min
#:                    per-frame on these 120, 12.5/min after; 30.0 is the
#:                    ceiling — more than twice what was measured, so a small
#:                    regression does not fail the suite and a return to
#:                    per-frame churn does.
#:   cctv_demo.webm   three or four people crossing a yard at once, which is
#:                    the hardest case here and the one the contract's three
#:                    changes address least: much of its churn is people
#:                    genuinely entering and leaving, plus the unclaimed-gear
#:                    bookkeeping the contract measured at 3.6% and left
#:                    alone. 176.2/min before, 48.8/min after against a
#:                    168.8/min per-frame answer. Held to a share of that
#:                    per-frame answer rather than to an absolute figure —
#:                    a number here would be a number about this yard's
#:                    traffic. It is not a free pass: before the change this
#:                    clip scored 1.04 of its own per-frame answer.
CLIPS = (
    ("face_vid.webm", 40, 20.0),
    ("door_test.mp4", 120, 30.0),
    ("cctv_demo.webm", 80, None),
)

#: The most of the unsteadied answer's churn a steadied one may keep.
#: cctv_demo measured 0.29 of it; 1.04 before the change.
RELATIVE_CEILING = 0.6

#: Below this the frames were not churning and there was nothing to steady.
CHURN_FLOOR = 60.0

pooled_changed, pooled_frames, pooled_reference = 0, 0, 0

for clip, wanted, ceiling in CLIPS:
    path = UPLOADS / clip

    if not check(f"{clip} is where the suite expects it", path.exists(), str(path)):
        continue

    pictures = frames_of(path, wanted)

    if not check(f"{clip} yielded the frames this measurement needs",
                 len(pictures) >= wanted, f"{len(pictures)} of {wanted}"):
        continue

    recorder = Recording(MODEL)
    streamed = drive(session(service, model=recorder), pictures)
    stills = per_frame(service, pictures, recorder.script)

    frames = len(pictures)
    summaries = [r["summary"] for r in streamed]
    reference = [r["summary"] for r in stills]

    churn = changes_per_minute(summaries, frames)
    raw_churn = changes_per_minute(reference, frames)
    alert_churn = changes_per_minute([r["alert"] for r in streamed], frames)
    raw_alerts = changes_per_minute([r["alert"] for r in stills], frames)
    with_people = sum(1 for r in stills if r["people_total"])

    pooled_changed += sum(1 for a, b in zip(summaries, summaries[1:]) if a != b)
    pooled_reference += sum(1 for a, b in zip(reference, reference[1:]) if a != b)
    pooled_frames += frames

    note(f"{clip} · {frames} frames ({frames / FPS:.0f}s) · "
         f"summary {raw_churn:.1f}/min per-frame -> {churn:.1f}/min steadied · "
         f"alert {raw_alerts:.1f}/min -> {alert_churn:.1f}/min · "
         f"people in {with_people} of {frames} frames")

    check(f"{clip}: the per-frame answer on these frames genuinely churns, so "
          f"there is something here to steady",
          raw_churn >= CHURN_FLOOR,
          f"{raw_churn:.1f}/min is under {CHURN_FLOOR}/min — this clip cannot "
          f"see the defect and the figures below prove nothing")

    check(f"{clip}: the footage has people in it",
          with_people >= frames * 0.25,
          f"{with_people} of {frames} frames — a clip of an empty yard holds "
          f"any verdict perfectly steady")

    if ceiling is None:
        share = f"{churn / raw_churn:.2f} of it" if raw_churn else "of nothing"
        check(f"{clip}: the steadied verdict keeps under "
              f"{RELATIVE_CEILING:.0%} of the per-frame answer's churn",
              churn <= raw_churn * RELATIVE_CEILING,
              f"{churn:.1f}/min against {raw_churn:.1f}/min per-frame ({share})")
    else:
        check(f"{clip}: {churn:.1f} summary changes a minute, under the "
              f"{ceiling:.0f}/min this clip is held to",
              churn <= ceiling,
              f"{churn:.1f}/min against a {ceiling:.0f}/min ceiling and a "
              f"{raw_churn:.1f}/min per-frame answer")

    # The contract's other headline: the alert boolean flipped 22-72 times a
    # minute. Half the per-frame rate rather than a figure of its own, because
    # what an operator can act on is a banner that stays up long enough to
    # look at, whatever this particular yard's traffic is. Before the change
    # door_test.mp4 scored 24.0/min against a 35.7/min per-frame answer, so
    # this is not a bar the old code cleared.
    check(f"{clip}: the alert boolean flips at most half as often as the "
          f"per-frame answer — a blinking red banner is the thing an operator "
          f"stops believing",
          alert_churn <= raw_alerts * 0.5,
          f"{alert_churn:.1f}/min against {raw_alerts:.1f}/min per-frame")

    del pictures

if pooled_frames:
    pooled = pooled_changed * 60.0 * FPS / pooled_frames
    pooled_raw = pooled_reference * 60.0 * FPS / pooled_frames
    cut = f"{1 - pooled / pooled_raw:.0%} fewer" if pooled_raw else "nothing to cut"
    note(f"pooled over {pooled_frames} frames ({pooled_frames / FPS:.0f}s): "
         f"{pooled_raw:.1f}/min per-frame -> {pooled:.1f}/min steadied ({cut})")

    check("pooled across the three clips the verdict changes less than half "
          "as often as the unsteadied answer on the same frames",
          pooled <= pooled_raw * 0.5,
          f"{pooled:.1f}/min against {pooled_raw:.1f}/min")

# ------------------------------------------- 2 · a dropped person stays counted

print("\n--- 2 · the detector losing somebody is not the same as them leaving\n")

# 87% of the person-count changes measured were this: a box on frame N, no box
# on frame N+1, the same worker standing in the same place. Staged, because
# the question is exactly "what happens when the detector returns nothing",
# and the pictures are real so the bands and the legibility gate are real.

#: A violator: no helmet, no vest, headroom above them, tall enough to judge.
VIOLATOR = (
    (int(WIDTH * 0.10), int(HEIGHT * 0.15), int(WIDTH * 0.35), int(HEIGHT * 0.95)),
    0.90,
    0,
)

SEEN = [VIOLATOR]
GONE: list = []

#: Six frames of being there, two of the detector saying nothing, four more.
#: Two, because the measured holes were 1 frame eleven times over and 3 frames
#: three times, and because one frame would pass on a build that simply drew
#: the previous frame's answer.
dropped = drive(session(service, model=Detections([SEEN] * 6 + [GONE] * 2 + [SEEN] * 4)),
                [PHOTO] * 12)

held = dropped[6:8]

# How this could have been vacuous: if the staged script still contained a box
# on frames 7 and 8, "still counted" would be trivially true. The
# counterfactual is run rather than asserted — the same two frames, judged
# with nothing remembered, and the module has to say nobody is there.
blind = session(service, single=True, model=Detections([GONE]))
_, blind_result = blind.process(PHOTO)

check("the detector really does return nothing on the dropped frames",
      blind_result["people_total"] == 0 and blind_result["summary"] == "Nobody in view",
      f"{blind_result['people_total']} people, {blind_result['summary']!r} — "
      f"if a box survives here the probe below is measuring nothing")

check("a person the detector drops for two frames stays counted",
      all(r["people_total"] == 1 for r in held),
      f"{[r['people_total'] for r in held]}")

check("and keeps their last known box, so the operator watches it sit still "
      "rather than blink out",
      all(r["regions"] and r["regions"][0]["box"] == dropped[5]["regions"][0]["box"]
          for r in held),
      f"{[r['regions'] for r in held]}")

check("and the alert about them does not blink out either",
      all(r["alert"] for r in dropped[2:]),
      f"{[r['alert'] for r in dropped]}")

check("the sentence never changes across the drop",
      len({r["summary"] for r in dropped[2:]}) == 1,
      f"{sorted({r['summary'] for r in dropped[2:]})}")

# ---------------------------------------- 3 · a person who has left is dropped

print("\n--- 3 · but somebody who has actually gone stops being counted\n")

# The other half of the same rule, and the one that keeps it a filter rather
# than a ratchet. Without this section, section 2 could be passed by never
# forgetting anybody at all — which reads on screen as a worker standing in an
# empty yard for as long as anyone watches.

LEAVES = 20
after = drive(
    session(service, model=Detections([SEEN] * LEAVES + [GONE] * 30)),
    [PHOTO] * (LEAVES + 30),
)

check("they were counted while they were there, or nothing below is about "
      "them leaving",
      all(r["people_total"] == 1 for r in after[:LEAVES]),
      f"{[r['people_total'] for r in after[:LEAVES]]}")

emptied = first_frame(after[LEAVES:], lambda r: r["people_total"] == 0)
window_frames = math.ceil(PRESENCE_WINDOW_SECONDS * FPS)

note(f"last seen on frame {LEAVES}; uncounted {emptied} frames later "
     f"({emptied / FPS:.1f}s), against a {PRESENCE_WINDOW_SECONDS}s window "
     f"({window_frames} frames)")

check("a person who has genuinely left stops being counted inside the window",
      0 < emptied <= window_frames,
      f"{emptied or 'never'} frames after their last sighting")

check("and the module goes back to saying the yard is empty",
      after[-1]["summary"] == "Nobody in view" and after[-1]["people_total"] == 0,
      f"{after[-1]['summary']!r}")

check("and it stops alerting about somebody who is no longer in the picture",
      not any(r["alert"] for r in after[LEAVES + emptied:]),
      "an alert nobody can act on")

check("they were not dropped the instant the detector lost them, which is the "
      "whole point of the window",
      emptied >= 2, f"gone after {emptied} frame(s)")

# --------------------------------- 4 · somebody arriving is not counted early

print("\n--- 4 · a box that comes and goes is not a person yet\n")

# The same bar in the other direction: one frame's box must not become a
# person. Staged as a detection the model finds in one frame of every three —
# under the fraction however long it goes on — rather than as a box that
# appears once, because the thing worth proving is that the *rate* is what
# decides it. A box in every frame carries the fraction and is counted; how
# long that takes is what section 10 puts a number on.
#
# How this could have been vacuous: a box the module rejects for some other
# reason — too small, no headroom, an unreadable band — would also never be
# counted, and the probe would pass while proving nothing about presence. The
# same box, on the same picture, seen in every frame, is run underneath; it
# has to be counted. Only the sighting rate differs.

FLICKER = 24
flicker_script = [[]] * 20 + [SEEN if i % 3 == 0 else GONE for i in range(FLICKER)]
flickering = drive(session(service, model=Detections(flicker_script)),
                   [PHOTO] * len(flicker_script))[20:]

solid_script = [[]] * 20 + [SEEN] * FLICKER
solid = drive(session(service, model=Detections(solid_script)),
              [PHOTO] * len(solid_script))[20:]

seen_frames = [i for i, boxes in enumerate(flicker_script[20:]) if boxes]

note(f"seen in {len(seen_frames)} of {FLICKER} frames "
     f"({len(seen_frames) / FLICKER:.0%}, under the {PRESENCE_FRACTION:.0%} bar); "
     f"the same box seen in every frame is counted from frame "
     f"{first_frame(solid, lambda r: r['people_total'] >= 1)}")

check("a box the detector finds in a third of the frames is never counted as "
      "a person",
      all(r["people_total"] == 0 for r in flickering),
      f"{[r['people_total'] for r in flickering]}")

check("the same box, seen in every frame, is counted — so the rejection above "
      "is about the sighting rate and not about the box",
      any(r["people_total"] >= 1 for r in solid),
      "never counted even when solidly in view; the probe above proves nothing")

check("and while it is undecided the module says somebody may be there, "
      "rather than that nobody is",
      all(flickering[i]["people_unverified"] >= 1 for i in seen_frames),
      f"{[flickering[i]['people_unverified'] for i in seen_frames]} — a "
      f"confident empty yard is exactly what this module is not allowed to say")

check("and it never reads as a settled all-clear while that is going on",
      all(r["status"] != "clear" for r in flickering),
      f"{sorted({r['status'] for r in flickering})}")

# --------------------------------------------- 5 · gear hysteresis, both ways

print("\n--- 5 · a belief already standing is kept, never granted\n")

# 15.1% of the measured summary changes were a gear score crossing 0.55 and
# nothing else happening. The score used here is the middle of the band the
# contract opened, read off the constants rather than written down, so tuning
# either bar moves the probe with it instead of quietly retiring it.

KEEP_SCORE = round((ITEM_KEEP_CONFIDENCE + ppe.ITEM_CONFIDENCE) / 2, 3)

HELMET = (int(WIDTH * 0.12), int(HEIGHT * 0.16), int(WIDTH * 0.24), int(HEIGHT * 0.28))
VEST = (int(WIDTH * 0.11), int(HEIGHT * 0.35), int(WIDTH * 0.34), int(HEIGHT * 0.70))

STRONG = [VIOLATOR, (HELMET, 0.62, 1), (VEST, 0.62, 2)]
WEAK = [VIOLATOR, (HELMET, KEEP_SCORE, 1), (VEST, KEEP_SCORE, 2)]

note(f"gear wobbles to {KEEP_SCORE}, between the {ITEM_KEEP_CONFIDENCE} it is "
     f"kept at and the {ppe.ITEM_CONFIDENCE} it was established at")

check("the probe's score really is inside the band the contract opened",
      ITEM_KEEP_CONFIDENCE <= KEEP_SCORE < ppe.ITEM_CONFIDENCE,
      f"{KEEP_SCORE} against {ITEM_KEEP_CONFIDENCE}-{ppe.ITEM_CONFIDENCE}")

wobble = drive(session(service, model=Detections([STRONG] * 6 + [WEAK] * 8)),
               [PHOTO] * 14)

# The counterfactual, and the other half of the rule in one run: the same
# score, on the same person, with no belief behind it. If this came back
# compliant the keep bar would have become the bar, and a grey sweatshirt at
# 0.41 would be a vest.
never = drive(session(service, model=Detections([WEAK] * 8)), [PHOTO] * 8)

check(f"gear at {KEEP_SCORE} with nothing behind it makes nobody compliant — "
      f"which is what the module used to do with a wobble, every time",
      never[-1]["alert"] and never[-1]["missing_helmet"] == 1,
      f"{never[-1]['summary']!r}")

check("a worker who was plainly wearing a helmet keeps it when the score dips "
      "into that band",
      all(r["summary"] == "Wearing the right gear" for r in wobble[6:]),
      f"{[r['summary'] for r in wobble[6:]]}")

check("and is never accused of taking it off",
      not any(r["alert"] for r in wobble),
      f"{[r['alert'] for r in wobble]}")

check("the sentence does not change when the score crosses the establishing "
      "bar and nothing else moves",
      len({r["summary"] for r in wobble[2:]}) == 1,
      f"{sorted({r['summary'] for r in wobble[2:]})}")

# ------------------------------------------- 6 · the judgement gate is steadied

print("\n--- 6 · 'too far to check' is the window's answer, not this frame's\n")

# 12.1% of the measured changes were a gate flipping with no detection moving
# at all. Staged as a person whose box straddles the distance bar — 110px tall
# on four frames in five and 86px on the fifth, against a bar of 96px on this
# 480-row picture — because that is the one gate whose input is a number this
# suite can put either side of it on purpose. The others (dark bands, cropped
# heads, low confidence) are the same code path with a different input, and
# section 9 exercises the darkness one on real pixels.

BAR = service.get_config()["min_person_height"] * HEIGHT
TOP = int(HEIGHT * 0.40)
NEAR = ((int(WIDTH * 0.10), TOP, int(WIDTH * 0.25), TOP + int(BAR * 1.15)), 0.90, 0)
FAR = ((int(WIDTH * 0.10), TOP, int(WIDTH * 0.25), TOP + int(BAR * 0.90)), 0.90, 0)

note(f"distance bar {BAR:.0f}px of {HEIGHT}; probe boxes "
     f"{NEAR[0][3] - NEAR[0][1]}px and {FAR[0][3] - FAR[0][1]}px tall")

check("the two staged boxes really do straddle the bar",
      (FAR[0][3] - FAR[0][1]) < BAR <= (NEAR[0][3] - NEAR[0][1]),
      f"{FAR[0][3] - FAR[0][1]}px and {NEAR[0][3] - NEAR[0][1]}px against "
      f"{BAR:.0f}px")

# And that straddling really does change the answer, frame by frame: the same
# two boxes judged as stills, which is what the gate did on every frame before
# this change. Without this the section could pass on a build where both boxes
# happened to read the same way.
_, near_still = session(service, single=True, model=Detections([[NEAR]])).process(PHOTO)
_, far_still = session(service, single=True, model=Detections([[FAR]])).process(PHOTO)

check("and the gate genuinely answers differently about them, frame by frame",
      near_still["summary"] != far_still["summary"]
      and near_still["alert"] and not far_still["alert"],
      f"near {near_still['summary']!r} / far {far_still['summary']!r}")

gate_script = [[FAR] if i % 5 == 4 else [NEAR] for i in range(15)]
gated = drive(session(service, model=Detections(gate_script)), [PHOTO] * 15)

check("one frame in five under the distance bar does not take the verdict "
      "away from the four that are over it",
      all(r["alert"] for r in gated[2:]),
      f"{[r['alert'] for r in gated]}")

check("and the sentence holds across those frames",
      len({r["summary"] for r in gated[2:]}) == 1,
      f"{sorted({r['summary'] for r in gated[2:]})}")

# ------------------------------------------------- 7 · the photograph is untouched

print("\n--- 7 · single_frame settles nothing, and says what it always said\n")

# Nearly every PPE check in tests/ goes through the photo path, and the record
# of what it says is in the tree: tests/verdicts_phase4.json, captured by
# capture_verdicts.py across twenty-one degradations of the reference
# photograph — brightness down to 8%, blur to k=31, JPEG quality down to 5.
# Twenty-one verdicts, thirteen fields each, compared as recorded.
#
# How this could have been vacuous: a baseline file that had been regenerated
# after the change would agree with anything. It is dated to Phase 4 and its
# ppe section was verified to reproduce byte for byte on this branch before
# the settling work began.

RECORDED = REPO / "tests" / "verdicts_phase4.json"

if check("the recorded photo verdicts are in the tree", RECORDED.exists(),
         str(RECORDED)):
    capture = importlib.import_module("capture_verdicts")
    baseline = json.loads(RECORDED.read_text())["ppe"]
    degraded = capture.conditions(PHOTO)

    differed = []
    for label, picture in degraded.items():
        checker = session(service, single=True)
        _, result = checker.process(picture)
        got = {k: result[k] for k in capture.INTERESTING if k in result}
        if got != baseline.get(label):
            differed.append(
                (label, {k: (baseline.get(label, {}).get(k), got.get(k))
                         for k in set(got) | set(baseline.get(label, {}))
                         if baseline.get(label, {}).get(k) != got.get(k)})
            )

    note(f"{len(degraded)} recorded photo verdicts replayed from "
         f"{RECORDED.name}, {len(baseline.get('baseline', {}))} fields each")

    check("every recorded photograph verdict is exactly what it was",
          not differed, f"{differed[:3]}")

# The other half: a photograph must reach its answer on the frame it is given,
# not on the third one. The streaming session underneath is the proof that
# this picture has something to settle — if it did not, "the first frame
# equals the last" would be true of any build at all.
still_run = drive(session(service, single=True), [PHOTO] * 6)
stream_run = drive(session(service), [PHOTO] * 6)

check("a photograph judged six times says the same thing six times, and says "
      "it on the first frame",
      all(r["summary"] == still_run[0]["summary"] for r in still_run)
      and all(r["alert"] == still_run[0]["alert"] for r in still_run),
      f"{[r['summary'] for r in still_run]}")

check("the same picture as a stream does not answer on its first frame — so "
      "the check above is about single_frame and not about the picture",
      stream_run[0]["summary"] != stream_run[-1]["summary"],
      f"{stream_run[0]['summary']!r} throughout; this picture settles nothing "
      f"either way and cannot tell the two paths apart")

check("and the stream arrives at the photograph's answer once it has settled",
      stream_run[-1]["summary"] == still_run[0]["summary"],
      f"stream {stream_run[-1]['summary']!r} vs photo "
      f"{still_run[0]['summary']!r}")

# ---------------------------------------- 8 · the verdict inside eight frames

print("\n--- 8 · the standing-alert run reaches its verdict in eight frames\n")

# tests/_probe_standing_alert.py gives each module eight bright frames of a
# real violation and then four at 8% of that light, and asks two things: that
# it was genuinely alerting before the light went, and that what it says after
# is unverified with words. Its frame counts and its light level are imported
# above rather than repeated, so this cannot pass against a probe that has
# since been changed.
#
# How this could have been vacuous: "an alert arrived inside eight frames" is
# also true of a module that alerts on everything, and of one whose settling
# rule has been removed entirely. So the alert has to be about the violation
# the picture contains — a bare head, counted — and frame one has to still
# refuse to accuse anybody, which is the rule the eight-frame budget exists to
# leave room for.

bright = PHOTO[:, : int(WIDTH * 0.60)]
dark = np.clip(bright.astype(np.float32) * standing.DARK_FACTOR, 0, 255).astype(np.uint8)

run = drive(session(service),
            [bright] * standing.BRIGHT_FRAMES + [dark] * standing.DARK_FRAMES)

lit = run[: standing.BRIGHT_FRAMES]
unlit = run[standing.BRIGHT_FRAMES:]
alerted = first_frame(lit, lambda r: r["alert"])

note(f"alert raised on frame {alerted or '-'} of {standing.BRIGHT_FRAMES}; "
     f"{lit[-1]['missing_helmet']} without a helmet when the light went")

check(f"the violation is on the screen inside {standing.BRIGHT_FRAMES} frames",
      0 < alerted <= standing.BRIGHT_FRAMES,
      f"first alert on frame {alerted or 'never'} — _probe_standing_alert.py "
      f"reads this run as 'it was never alerting' and every module in it fails")

check("and it is the violation the picture actually contains, not any alert",
      lit[-1]["missing_helmet"] >= 1,
      f"missing_helmet={lit[-1]['missing_helmet']}")

check("the first frame does not accuse anybody, so the settling rule is still "
      "in force and the frame count above means something",
      not lit[0]["alert"], "accused on sighting one")

# ---------------------------------------- 9 · unreadable is still not clear

print("\n--- 9 · a picture nobody can read is never an all-clear\n")

# Phase 2's third state, which this work was not allowed to touch. The bright
# half of the run above is the proof that the picture was judgeable at full
# light — without it, "no alert on the dark frames" is also what a module that
# cannot see anything at all would report.

check("the same picture at full light did produce a verdict, so the darkness "
      "is what changed the answer",
      any(r["alert"] for r in lit), "nothing was ever judged in this run")

check("every dark frame reports itself unreadable rather than clear",
      all(r["readable"] is False and r["status"] == "unverified" for r in unlit),
      f"{[(r['readable'], r['status']) for r in unlit]}")

check("and says why, in words",
      all(r["unreadable_reason"] for r in unlit),
      f"{[r['unreadable_reason'] for r in unlit]}")

check("and raises no alert on evidence it could not read",
      not any(r["alert"] for r in unlit),
      f"{[r['alert'] for r in unlit]}")

check("and never says one of the sentences that mean everything is fine",
      not any(r["summary"] in ALL_CLEAR for r in unlit),
      f"{[r['summary'] for r in unlit]}")

check("the people standing in it are still counted, and counted as unverified",
      all(r["people_unverified"] >= r["people_total"] >= 1 for r in unlit),
      f"{[(r['people_total'], r['people_unverified']) for r in unlit]} — "
      f"losing them when the light goes is how this module used to turn a "
      f"bare head into a green tick")

# A dark picture with no history behind it, in case the run above is carrying
# its verdict rather than reaching one.
_, night = session(service).process(dark)

check("a dark picture with no history behind it is unverified too",
      night["status"] == "unverified" and night["readable"] is False
      and not night["alert"],
      f"{night['status']!r} {night['summary']!r}")

# ------------------------------------------- 10 · time-to-alert did not worsen

print("\n--- 10 · a violator still gets an alert as fast as they used to\n")

# The rolling filter was chosen over a fixed collect-then-answer window
# because that one added 4.5s on average, and up to 6.25s, to a real violation
# alert. Zero added time-to-alert is what it was chosen for. The figure it has
# to hold to is ACCUSE_MIN_VOTES sightings — three — which is measured here
# rather than asserted, by running the same violator in a fresh session.
#
# The budget for the second case is eight frames: 1.6s at 5fps, a full second
# of slack over the three sightings that have always been the bar, and the
# same eight frames the one streaming probe in this tree already assumes a
# verdict arrives inside.
#
# How this could have been vacuous: a violator who never alerts at all would
# make "no worse than before" meaningless. Both runs are checked for having
# reached the alert, and the scene is checked for having been empty first.

ENTRY_BUDGET = 8

fresh = drive(session(service, model=Detections([SEEN] * 12)), [PHOTO] * 12)
fresh_alert = first_frame(fresh, lambda r: r["alert"])

WATCHED = 20
entry_script = [GONE] * WATCHED + [SEEN] * 20
entering = drive(session(service, model=Detections(entry_script)),
                 [PHOTO] * len(entry_script))
entry_alert = first_frame(entering[WATCHED:], lambda r: r["alert"])

note(f"present from the first frame: alert on frame {fresh_alert or '-'} "
     f"({ppe.ACCUSE_MIN_VOTES} sightings is the standing bar)")
note(f"walking into a scene watched for {WATCHED} frames "
     f"({WATCHED / FPS:.0f}s, a full {PRESENCE_WINDOW_SECONDS}s window): "
     f"alert {entry_alert or '-'} frames after their first sighting")

check("the scene really was empty before they walked in",
      not any(r["alert"] or r["people_total"] for r in entering[:WATCHED]),
      f"{[r['people_total'] for r in entering[:WATCHED]]}")

check("a violator in shot from the first frame is still accused on the third "
      "sighting, exactly as before",
      0 < fresh_alert <= ppe.ACCUSE_MIN_VOTES + 1,
      f"frame {fresh_alert or 'never'}, against {ppe.ACCUSE_MIN_VOTES} votes")

check(f"a violator walking into a scene already being watched is alerted "
      f"inside {ENTRY_BUDGET} frames",
      0 < entry_alert <= ENTRY_BUDGET,
      f"{entry_alert or 'never'} frames ({entry_alert / FPS:.1f}s) against a "
      f"{ENTRY_BUDGET}-frame budget and {fresh_alert} frames for the same "
      f"violator in a fresh session — the presence fraction is being counted "
      f"against every frame the session has processed rather than against the "
      f"frames since this person appeared, which is time-to-alert the rolling "
      f"design was chosen to avoid paying")

# Whatever the wait turns out to be, it has to be spent saying somebody may be
# there. `entry_alert or len(entering)` so that a violator who is never alerted
# about is judged on every frame after they walked in rather than on an empty
# slice, which would pass this quietly.
waiting = entering[WATCHED:WATCHED + (entry_alert or len(entering))]

check("and they are reported as possibly there for every frame of whatever "
      "wait there is, rather than not at all",
      bool(waiting) and all(r["people_unverified"] >= 1 or r["people_total"] >= 1
                            for r in waiting),
      f"{[(r['people_total'], r['people_unverified']) for r in waiting]}")

print(f"\n{'All safety gear settling checks passed.' if failures == 0 else str(failures) + ' FAILED'}")
sys.exit(1 if failures else 0)
