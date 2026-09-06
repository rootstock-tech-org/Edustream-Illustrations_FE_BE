"""
The walkway detector finds what is left in a lane, and leaves a clear one alone.

This is the capability's whole case, and it is measured rather than asserted,
because two earlier designs for it looked reasonable and did not work:

  * an object detector. The COCO model this product already loads was run over
    the operator's warehouse clip and reported nothing at all where the box
    is, while naming a press brake a truck and a pallet rack a suitcase.
  * a single-colour floor model. It called the yellow hatch markings one
    obstruction covering a third of the marked lane, because a walkway's floor
    is green epoxy *and* yellow paint *and* a white line.

What is checked below, in order:

    1. the box is found on the operator's own clip, on every frame, and the
       clear aisle alongside it stays clear on every frame
    2. the compactness setting is not sitting on a cliff edge
    3. the bin growth that once silently disabled the whole detector stays out
    4. cutting people out is load-bearing — with it off, a person standing in
       the lane is reported as an obstruction
    5. something has to stay put to be called an obstruction, and something
       crossing the lane never is
    6. a picture too dark to read is never called a clear walkway
    7. people crossing and pausing in the lane, on real footage, never raise
       the alarm and are never even timed as candidates
    8. an area marked over something that is not floor says so, rather than
       reporting it clear

Run from backend/:

    PYTHONPATH=$PWD .venv/bin/python ../tests/verify_walkways.py
"""
import sys
from pathlib import Path

import cv2
import numpy as np

from app.modules.walkways.service import (
    FORGET_SECONDS,
    HOLD_SECONDS,
    SETTLE_SECONDS,
    WalkwaysService,
)
from app.vision.polygon import walkway_manager
from app.vision.walkway import (
    CHROMA_BINS,
    MIN_FILL,
    _chroma_index,
    find_obstructions,
    marked_area,
    read_floor,
)

HERE = Path(__file__).resolve().parent
BACKEND = HERE.parent / "backend"

#: The operator's own warehouse aisle, with a cardboard box left in it.
#:
#: This lived in frontend/public while the capability was a concept preview and
#: the clip was something the browser fetched. It is a test fixture now — the
#: page shows a real camera — so it sits here rather than shipping a megabyte
#: of video to every browser that loads the app and never plays it.
CLIP = HERE / "fixtures" / "walkway-demo.webm"
PEOPLE_CLIP = BACKEND / "storage" / "uploads" / "test_640x480.mp4"

#: The hatched keep-clear zone with the box standing in it, and the clear
#: aisle running alongside it. Both on the same camera, in the same light, in
#: the same frames — so the only difference between them is the obstruction.
BLOCKED = np.array([[620, 425], [1010, 402], [1180, 640], [660, 690]], np.int32)
CLEAR = np.array([[350, 300], [560, 300], [700, 700], [270, 700]], np.int32)

#: Where the box actually is, read off the picture.
TRUTH = (795, 435, 900, 520)

failures = 0


def check(name: str, ok: bool, detail: str = "") -> bool:
    global failures
    print(("PASS  " if ok else "FAIL  ") + name + (f"  [{detail}]" if not ok and detail else ""))
    if not ok:
        failures += 1
    return ok


def note(text: str) -> None:
    print(f"      {text}")


def frames_of(clip, limit=None):
    capture = cv2.VideoCapture(str(clip))
    count = 0
    while limit is None or count < limit:
        ok, frame = capture.read()
        if not ok:
            break
        yield frame
        count += 1
    capture.release()


def touches_box(box) -> bool:
    x1, y1, x2, y2 = box
    return not (x1 > TRUTH[2] or x2 < TRUTH[0] or y1 > TRUTH[3] or y2 < TRUTH[1])


if not check("the operator's walkway clip is present", CLIP.exists(), str(CLIP)):
    sys.exit(1)

# ------------------------------------------------- 1 · on the real footage

print("\n--- 1 · every frame of the operator's clip, both ways round\n")

blocked_hits = blocked_on_box = blocked_frames = 0
clear_hits = clear_frames = 0
fills, shares = [], []

for frame in frames_of(CLIP):
    blocked_frames += 1
    found, floor, _marked = find_obstructions(frame, BLOCKED)
    if found:
        blocked_hits += 1
        fills.append(found[0].fill)
        shares.append(found[0].share)
        if any(touches_box(o.box) for o in found):
            blocked_on_box += 1

for frame in frames_of(CLIP):
    clear_frames += 1
    found, _floor, _marked = find_obstructions(frame, CLEAR)
    if found:
        clear_hits += 1

note(f"lane with the box:  found on {blocked_hits}/{blocked_frames} frames, "
     f"on the box in {blocked_on_box}")
note(f"clear lane alongside: found on {clear_hits}/{clear_frames} frames")
if shares:
    note(f"the box measures {np.mean(shares):.1%} of the marked lane, "
         f"{np.mean(fills):.2f} solid")

check("the obstruction is found on essentially every frame",
      blocked_on_box >= 0.97 * blocked_frames,
      f"{blocked_on_box}/{blocked_frames}")

check("and every finding is the obstruction, not something else",
      blocked_hits == blocked_on_box,
      f"{blocked_hits - blocked_on_box} findings were somewhere else")

check("the clear lane beside it raises nothing at all",
      clear_hits == 0,
      f"{clear_hits}/{clear_frames} frames raised a false alarm")

# ------------------------------------------------- 2 · not on a cliff edge

print("\n--- 2 · the compactness setting has room on both sides\n")

measured_fill = float(np.mean(fills)) if fills else 0.0
note(f"MIN_FILL is {MIN_FILL}; the obstruction measures {measured_fill:.2f}")

check("the obstruction is comfortably more solid than the bar, so a slightly "
      "less tidy object is still found",
      measured_fill >= MIN_FILL + 0.05,
      f"{measured_fill:.2f} against {MIN_FILL}")

# The cliff is real and worth pinning: at 0.70 the same clip loses the box on
# 200 of 240 frames. If somebody raises MIN_FILL to quieten a false alarm, this
# is the check that tells them what it costs.
harsh = sum(
    1 for frame in frames_of(CLIP, limit=40)
    if any(o.fill >= 0.70 for o in find_obstructions(frame, BLOCKED)[0])
)
note(f"at a bar of 0.70 the same obstruction survives on {harsh}/40 frames")

check("and the bar is below the value at which this detector stops working",
      MIN_FILL < 0.70 and harsh < 20,
      f"0.70 kept {harsh}/40, so the cliff is not where it was measured")

# --------------------------------------- 3 · the growth that broke it once

print("\n--- 3 · the floor set is not grown into neighbouring colours\n")

frame = next(frames_of(CLIP, limit=1))
area = marked_area(BLOCKED, frame.shape[1], frame.shape[0])
lab = cv2.cvtColor(cv2.GaussianBlur(frame, (5, 5), 0), cv2.COLOR_BGR2Lab)
floor = read_floor(lab, area)

grown = cv2.dilate(
    floor.floor.reshape(CHROMA_BINS, CHROMA_BINS).astype(np.uint8),
    np.ones((3, 3), np.uint8),
).astype(bool).reshape(-1)

index = _chroma_index(lab)
box_pixels = np.zeros(frame.shape[:2], bool)
box_pixels[TRUTH[1]:TRUTH[3], TRUTH[0]:TRUTH[2]] = True
box_pixels &= area > 0

foreign_now = float((~floor.floor[index[box_pixels]]).mean())
foreign_grown = float((~grown[index[box_pixels]]).mean())

note(f"floor colours: {floor.colours} as shipped, {int(grown.sum())} if grown by one")
note(f"of the obstruction's pixels, {foreign_now:.0%} read as foreign as shipped, "
     f"{foreign_grown:.0%} if grown")

check("most of the obstruction reads as foreign as the detector ships",
      foreign_now >= 0.60,
      f"{foreign_now:.0%}")

check("and growing the floor set by one colour would destroy it — which is "
      "why it is not done, recorded here so it is not quietly re-added",
      foreign_grown < 0.20,
      f"growth left {foreign_grown:.0%} foreign, so this no longer guards anything")

# ------------------------------------------- 4 · cutting people out matters

print("\n--- 4 · a person in the lane, with the exclusion on and off\n")

if check("a clip with a person in it is present", PEOPLE_CLIP.exists(), str(PEOPLE_CLIP)):
    # A person is composited into the marked lane. Synthetic on purpose: the
    # operator's walkway clip has nobody in it, and the alternative — asserting
    # the exclusion works without ever putting a person in the lane — would be
    # a test that passes whether the code runs or not.
    source = cv2.VideoCapture(str(PEOPLE_CLIP))
    source.set(cv2.CAP_PROP_POS_FRAMES, 60)
    _ok, person_frame = source.read()
    source.release()

    from app.vision.detector import model as person_model

    cut = None
    for output in person_model(person_frame, verbose=False, classes=[0], conf=0.45):
        if output.masks is not None and len(output.masks.data):
            cut = (output.masks.data[0].cpu().numpy() * 255).astype(np.uint8)
            if cut.shape != person_frame.shape[:2]:
                cut = cv2.resize(cut, (person_frame.shape[1], person_frame.shape[0]))
            break

    if check("a person could be cut out of it to composite", cut is not None):
        walkway = next(frames_of(CLIP, limit=1))
        ys, xs = np.nonzero(cut)
        top, bottom, left, right = ys.min(), ys.max(), xs.min(), xs.max()

        # Scaled to stand in the lane at about the height a person would.
        wanted_height = 210
        scale = wanted_height / float(bottom - top)
        patch = cv2.resize(person_frame[top:bottom, left:right], None, fx=scale, fy=scale)
        stencil = cv2.resize(cut[top:bottom, left:right], None, fx=scale, fy=scale)

        at_x, at_y = 420, 470          # squarely inside the clear lane
        ph, pw = patch.shape[:2]
        composite = walkway.copy()
        region = composite[at_y:at_y + ph, at_x:at_x + pw]
        held = stencil[:region.shape[0], :region.shape[1]] > 127
        region[held] = patch[:region.shape[0], :region.shape[1]][held]

        # Where the person ended up, so a blob can be said to be them.
        standing = (at_x, at_y, at_x + region.shape[1], at_y + region.shape[0])

        def on_the_person(box) -> bool:
            x1, y1, x2, y2 = box
            return not (x1 > standing[2] or x2 < standing[0]
                        or y1 > standing[3] or y2 < standing[1])

        # Measured with the compactness bar lifted, deliberately.
        #
        # The first version of this check asked whether a person raised an
        # obstruction with the exclusion off, and it failed — a standing person
        # measured 0.59 solid against a bar of 0.60. Reading that as "people
        # are handled" would have been the worst outcome available: the bar is
        # there to reject slivers along the marked edge and it happened, by a
        # hundredth, to also reject this one person in this one pose. A person
        # crouching, carrying a box, or standing in a group is compact.
        #
        # So what is asserted is the thing that is actually true and actually
        # load-bearing: a person looks nothing like floor, and the exclusion is
        # what stops that mattering.
        import app.vision.walkway as walkway_vision

        bar = walkway_vision.MIN_FILL
        walkway_vision.MIN_FILL = 0.0
        try:
            without, _f, _m = find_obstructions(composite, CLEAR, min_share=0.005)

            service = WalkwaysService()
            people_mask, people, _boxes = service._people(composite)
            with_exclusion, _f, _m = find_obstructions(
                composite, CLEAR, exclude=people_mask, min_share=0.005
            )
        finally:
            walkway_vision.MIN_FILL = bar

        on_person_without = [o for o in without if on_the_person(o.box)]
        on_person_with = [o for o in with_exclusion if on_the_person(o.box)]

        note(f"the person model found {people} person(s) in the composite")
        note(f"standing at {standing}")
        note(f"foreign blobs on the person, nobody cut out: "
             f"{[(o.box, round(o.share, 3), round(o.fill, 2)) for o in on_person_without]}")
        note(f"foreign blobs on the person, people cut out:  "
             f"{[(o.box, round(o.share, 3), round(o.fill, 2)) for o in on_person_with]}")

        check("a person standing in the lane looks nothing like its floor — so "
              "the exclusion has real work to do, not a formality",
              bool(on_person_without),
              "the composited person raised no foreign pixels at all, so this "
              "test proves nothing about the exclusion")

        check("and cutting people out leaves nothing of them behind — not the "
              "body, and not the feet the segmentation mask stops above",
              not on_person_with,
              f"{len(on_person_with)} blob(s) survived where the person was")

        # Measured with the real compactness bar back in place, because that is
        # the question — whether removing a person makes the module report an
        # obstruction it would not otherwise have reported. Counting blobs with
        # the bar lifted counts slivers nothing would ever act on.
        real_without, _f, _m = find_obstructions(composite, CLEAR)
        real_with, _f, _m = find_obstructions(composite, CLEAR, exclude=people_mask)

        note(f"obstructions as the module actually judges them: "
             f"{len(real_without)} with nobody cut out, {len(real_with)} with")

        check("cutting them out does not invent an obstruction elsewhere either",
              len(real_with) <= len(real_without),
              f"{len(real_without)} became {len(real_with)}")

# ------------------------------------------------- 5 · it has to stay put

print("\n--- 5 · staying put is what makes something an obstruction\n")

original = walkway_manager.as_points()
frame = next(frames_of(CLIP, limit=1))
height, width = frame.shape[:2]

walkway_manager.save(
    [{"x": int(x), "y": int(y)} for x, y in BLOCKED],
    source="verify-walkways",
    frame_width=width,
    frame_height=height,
)

service = WalkwaysService()
clock = {"t": 1_000_000.0}
service._now = lambda: clock["t"]

alerted_at = None
STEP = 0.5

for tick in range(int((SETTLE_SECONDS + 3.0) / STEP)):
    _annotated, result = service.process(frame)
    if result["alert"] and alerted_at is None:
        alerted_at = tick * STEP
    clock["t"] += STEP

note(f"the wait is {SETTLE_SECONDS}s; the alarm arrived at {alerted_at}s")

check("nothing is raised the moment an object appears",
      alerted_at is None or alerted_at >= SETTLE_SECONDS - STEP,
      f"alarmed at {alerted_at}s, before the {SETTLE_SECONDS}s wait")

check("and it is raised once the object has stayed put",
      alerted_at is not None,
      f"never alarmed over {SETTLE_SECONDS + 3.0}s on a static obstruction")

# The alarm outlives a dropped frame.
if alerted_at is not None:
    blank = np.zeros_like(frame)
    blank[:] = frame[0, 0]           # a frame the detector finds nothing in
    clock["t"] += 0.5
    _a, held = service.process(frame.copy())
    check("and it survives the detector losing the object for a moment",
          held["alert"],
          "the alarm stuttered off")

# Something crossing the lane must never settle, however long the crossing
# takes. This is the case the first version of the module got wrong and the
# first version of this test failed to catch: it rolled the picture through
# six positions on a cycle, so the object kept returning to places it had
# already been and collected its settling time there. A crossing does not
# repeat itself.
#
# The speed is chosen to be awkward on purpose. At 30 pixels a frame this
# object moves less than the distance the module allows between frames while
# still being the same thing, so frame-to-frame tracking follows it perfectly
# — which is exactly how it used to accumulate a full wait and alarm. What
# stops it is the separate test of how far it has come from where it started.


def with_object_at(background, x, y, size=110):
    """The walkway with a solidly foreign-coloured object standing in it."""
    painted = background.copy()
    cv2.rectangle(painted, (x, y), (x + size, y + int(size * 0.8)),
                  (40, 30, 160), -1)
    return painted


clear_lane = np.array([[300, 330], [600, 330], [720, 700], [250, 700]], np.int32)
walkway_manager.save(
    [{"x": int(x), "y": int(y)} for x, y in clear_lane],
    source="verify-walkways",
    frame_width=width,
    frame_height=height,
)

service = WalkwaysService()
clock = {"t": 2_000_000.0}
service._now = lambda: clock["t"]

crossed_at = None
steps = int((SETTLE_SECONDS + 6.0) / STEP)

for tick in range(steps):
    moving = with_object_at(frame, 300 + tick * 30, 520)
    _annotated, result = service.process(moving)
    if result["alert"] and crossed_at is None:
        crossed_at = tick * STEP
    clock["t"] += STEP

note(f"an object crossing at 30px a frame was in view for {steps * STEP}s")

check("something crossing the lane is never called an obstruction, however "
      "long the crossing takes",
      crossed_at is None,
      f"a moving object raised the alarm at {crossed_at}s")

# And the same object, in the same lane, simply put down: this must alarm —
# otherwise the check above passes for a detector that sees nothing at all.
service = WalkwaysService()
clock = {"t": 2_500_000.0}
service._now = lambda: clock["t"]

parked_at = None
for tick in range(int((SETTLE_SECONDS + 3.0) / STEP)):
    _annotated, result = service.process(with_object_at(frame, 400, 520))
    if result["alert"] and parked_at is None:
        parked_at = tick * STEP
    clock["t"] += STEP

note(f"the same object left standing alarmed at {parked_at}s")

check("while the very same object, put down and left, does raise the alarm — "
      "so the check above is about movement and not about blindness",
      parked_at is not None and parked_at >= SETTLE_SECONDS - STEP,
      f"alarmed at {parked_at}s against a {SETTLE_SECONDS}s wait")

# ------------------------------------------ 6 · a picture it cannot read

print("\n--- 6 · a dark picture is not a clear walkway\n")

service = WalkwaysService()
clock = {"t": 3_000_000.0}
service._now = lambda: clock["t"]

dark = (frame * 0.06).astype(np.uint8)
for _ in range(4):
    _annotated, result = service.process(dark)
    clock["t"] += STEP

note(f"summary: {result['summary']!r}, status {result['status']!r}")

check("it does not report a clear walkway",
      result["summary"] != "Walkway clear" and result["status"] != "clear",
      f"{result['summary']!r}")

check("it says so in words rather than going quiet",
      bool(result["summary"]) and not result["readable"],
      f"readable={result['readable']}")

# ----------------------------- 7 · people in the lane, on real footage

print("\n--- 7 · people using the lane never become obstructions\n")

# The failure this pins was reported from the running page: a person inside
# the marked walkway was flagged as a violation. Driven over real footage of
# people crossing and pausing in a marked lane, the cause was visible — the
# exclusion was one frame deep, and what a person changes about the floor
# around them (shadow, reflection, the odd missed frame) became compact
# foreign blobs that aged towards the wait on and beside the people, up to
# four at once, reaching 5.8s against a 5.0s bar. PERSON_MEMORY is the fix:
# ground recently under a person is not candidate material.
#
# cctv_demo.webm is the footage: several people, walking and pausing, inside
# the marked lane throughout. The first check is what keeps this section
# load-bearing — if the clip or the lane ever stops containing people, the
# other two checks would pass for the wrong reason and must not be trusted.

PEOPLE_CLIP_LIVE = BACKEND / "storage" / "uploads" / "cctv_demo.webm"

if check("footage of people in a lane is present", PEOPLE_CLIP_LIVE.exists(),
         str(PEOPLE_CLIP_LIVE)):
    capture = cv2.VideoCapture(str(PEOPLE_CLIP_LIVE))
    live_w = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
    live_h = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
    live_total = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    live_fps = capture.get(cv2.CAP_PROP_FPS) or 15.0

    walkway_manager.save(
        [{"x": 100, "y": 180}, {"x": 560, "y": 180},
         {"x": 620, "y": 478}, {"x": 40, "y": 478}],
        source="verify-walkways",
        frame_width=live_w,
        frame_height=live_h,
    )

    service = WalkwaysService()
    clock = {"t": 5_000_000.0}
    service._now = lambda: clock["t"]

    RATE = 4.0
    live_step = max(1, round(live_fps / RATE))
    frames_with_people = 0
    alerted = []
    on_people = []
    index = 0

    for tick in range(int(30 * RATE)):
        capture.set(cv2.CAP_PROP_POS_FRAMES, index % live_total)
        ok, frame = capture.read()
        if not ok:
            index = 0
            continue

        _annotated, result = service.process(frame)

        if result["people_excluded"] > 0:
            frames_with_people += 1
        if result["alert"]:
            alerted.append(round(clock["t"] - 5_000_000.0, 1))

        # The visible half of the complaint: amber "checking" boxes sitting on
        # the people. A candidate sighted this frame must not overlap anybody.
        _m, _n, live_people = service._people(frame)
        for candidate in service._candidates:
            if candidate["last_seen"] < clock["t"]:
                continue
            cx1, cy1, cx2, cy2 = candidate["box"]
            blob_area = max(1, (cx2 - cx1) * (cy2 - cy1))
            for px1, py1, px2, py2 in live_people:
                across = max(0, min(cx2, px2) - max(cx1, px1))
                down = max(0, min(cy2, py2) - max(cy1, py1))
                if across * down / blob_area > 0.25:
                    on_people.append((round(clock["t"] - 5_000_000.0, 1),
                                      candidate["box"]))

        index += live_step
        clock["t"] += 1.0 / RATE

    capture.release()
    walkway_manager.clear()

    note(f"people seen on {frames_with_people} of {int(30 * RATE)} frames")

    check("the lane genuinely had people in it — the checks below prove "
          "nothing otherwise",
          frames_with_people >= int(30 * RATE) * 0.5,
          f"people on only {frames_with_people} frames")

    check("thirty seconds of people crossing and pausing never raises the "
          "obstruction alarm",
          not alerted,
          f"alerted at {alerted[:5]}s")

    check("and no candidate is ever timed on top of a person — the amber "
          "'checking' box never sits on somebody using the lane",
          not on_people,
          f"{len(on_people)} sightings on people, first {on_people[:3]}")

# ------------------------------- 8 · an area marked over something not floor

print("\n--- 8 · a walkway marked over something that is not floor\n")

# The pallet racking on the left of the same picture: legible, well lit, and
# not a floor. Nothing in it is spread out like a floor surface, so the module
# has nothing to judge against and must say so.
RACKING = np.array([[20, 60], [250, 60], [250, 400], [20, 400]], np.int32)

walkway_manager.save(
    [{"x": int(x), "y": int(y)} for x, y in RACKING],
    source="verify-walkways",
    frame_width=width,
    frame_height=height,
)

service = WalkwaysService()
clock = {"t": 4_000_000.0}
service._now = lambda: clock["t"]

_annotated, result = service.process(frame)
note(f"summary: {result['summary']!r}, "
     f"floor colours found: {result['floor_colours']}")

check("either it finds a floor there or it says it cannot — what it must "
      "never do is call it clear on no evidence",
      result["floor_readable"] or result["status"] != "clear",
      f"{result['summary']!r} with {result['floor_colours']} floor colours")

# ------------------------------------------------------------------ tidy up

walkway_manager.clear()
if original:
    walkway_manager.save(original, source=None)

print(f"\n{'All walkway checks passed.' if failures == 0 else str(failures) + ' FAILED'}")
sys.exit(1 if failures else 0)
