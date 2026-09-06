# Annotating the suspended-load dataset

Three classes. Read the two rules under *What not to annotate* before
drawing anything — they are the ones that decide whether this model is
usable, and both are easy to get wrong in a way that only shows up on site.

```
python extract_frames.py FOOTAGE... --out frames/   # sample, deduplicated
#   ... annotate frames/ in your tool of choice, export YOLO format ...
python validate_dataset.py DATASET                  # gate, before any GPU
python train.py DATASET
```

## The classes

**0 · `jib_head`** — the business end of the pillar-mounted manipulator:
the vertical ram and the vacuum/magnet plate at the bottom of the arm. Not
the whole arm, not the pillar. What is wanted is the part that meets the
load, because that is what "attached" is measured against.

**1 · `crane_hook`** — the hook block hanging from the overhead crane's
cable. The block, not the cable: at the resolutions this footage arrives
in, the cable is a few pixels wide and asking for it produces boxes that
are mostly background. If the block is out of shot and only the cable
shows, that frame is a negative.

**2 · `load`** — the material being carried or waiting to be carried.
Steel plates in the bays seen so far; if your footage holds fabricated
assemblies, stillages or bundles being lifted, they are `load` too and the
class list in `data.yaml` should be revisited before a large annotation run
rather than after.

## What not to annotate

**Do not invent a "raised" class.** Raised is geometry — the load's
position against a floor datum the operator marks per camera. A `raised`
class would bake one camera's mounting angle into the weights, so a new
view would need retraining instead of re-marking.

**Do annotate the load when it is resting.** A plate lying on the table or
stacked on a stillage is still `load`. It is tempting to only box the ones
that are hanging, because those are the interesting ones — that is the
mistake. Whether a load is *attached* to a lifter is decided downstream by
geometry and by whether the two move together. If "attached" is smuggled
into the class, the model has to learn a spatial relationship from
appearance alone, and it will learn the background instead.

## Negatives — the rule this dataset fails without

**At least one frame in five must contain none of the three classes.**
`validate_dataset.py` refuses a set below that, and the reason is in this
repository rather than in a textbook.

The forklift detector already shipped here was trained only on images that
contained a forklift. `backend/app/modules/vehicle_zone/service.py` records
what it does: on four clips holding no forklift at all it returned a
sighting on 19–85% of frames at 0.25 confidence, and its six most confident
outputs anywhere were five views of a worker's forearm and one of a person
sitting at a desk. The module's note is blunt that multi-frame confirmation
does not rescue this, because a forearm stays in the picture for hundreds
of frames.

Negatives worth gathering deliberately:

- the bay empty, machine idle
- plates stacked on the table with nothing lifting them
- workers walking through with no lift in progress
- the jib parked, arm swung away
- the same bay at a different time of day

## Judgement calls you will actually hit

**A plate seen edge-on.** Box it. It is a load and the model needs to know
it looks like a line from some angles; leaving those out teaches it that
loads are always rectangles.

**The load is half behind the pillar or the JCB banner.** Box the visible
part. Do not guess the hidden extent — a box drawn round where you think
the plate continues teaches the model to expect background as object.

**Two plates carried together.** One box if they move as one, two if the
lifter is holding one and the other is resting against it. When you cannot
tell from a still, open the video at the timestamp in the filename and
watch. That is why the position is in the name.

**A load so far away it is a smudge.** Leave it. If you cannot say what it
is, the box is a guess, and `validate_dataset.py` will reject boxes below
0.4% of the picture on a side anyway.

## Volume

Order 2,000–4,000 frames across many lift cycles, shifts and lighting, from
every camera that will run this, with the negative share above. At least
150 instances of each class or the gate refuses it — a class seen fifty
times is not learned, it is memorised, and it fails the first time the bay
looks slightly different.

## After training

Copy the weights to `backend/models/suspended_load.pt` and write
`suspended_load.data.yaml` beside them, in the style of
`forklift.data.yaml`: what the weights can report, what they cannot, and
**what they scored on footage containing none of the classes**. A model
measured only on positives cannot see what it costs.
