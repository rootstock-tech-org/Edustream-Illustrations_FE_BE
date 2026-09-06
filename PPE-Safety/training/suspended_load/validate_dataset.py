"""
Refuse a dataset that would train the forklift model's failure again.

This repository already contains one detector trained on images that all
contained the thing being detected, and `vehicle_zone/service.py` records
what that cost: on four clips holding no forklift at all it returned a
sighting on 19% to 85% of frames, and its six most confident outputs
anywhere were five views of a worker's forearm and one of a person at a
desk. The module's own note is the important half — multi-frame
confirmation does not rescue it, because a forearm stays in the picture
for hundreds of frames.

That was a dataset gap, and a dataset gap is checkable before a GPU is
booked rather than discovered on site afterwards. So this runs first:

    python validate_dataset.py DATASET_DIR

It is deliberately a gate and not a report. Every rule below has a reason
in this codebase's own history, and a set that fails one is not a set to
train on and then apologise for.

Expected layout (ultralytics standard):

    DATASET_DIR/
        data.yaml
        train/images/*.jpg   train/labels/*.txt
        valid/images/*.jpg   valid/labels/*.txt

A YOLO label file holds one `cls cx cy w h` per line, normalised 0-1. An
image with an empty or absent label file is a *negative* — a picture with
none of the classes in it — and negatives are the point of this file.
"""

import argparse
import sys
from collections import Counter
from pathlib import Path

#: The share of the set that must contain none of the classes.
#:
#: A fifth, floored, and the reasoning is the forklift model rather than a
#: convention borrowed from elsewhere: a detector never shown the empty bay,
#: the idle machine, or plates stacked with nothing lifting them has no way
#: to learn what those look like, and will answer "load" to them.
MIN_NEGATIVE_SHARE = 0.20

#: Below this a class has not been seen enough times to be learnable, and a
#: model trained on it will report it at random rather than not at all —
#: which is worse, because random is indistinguishable from working on a
#: demo and fails on site.
MIN_INSTANCES_PER_CLASS = 150

#: A box smaller than this fraction of the picture on either side is either
#: a mis-drag or a thing the model cannot resolve anyway. Both are noise.
MIN_BOX_SIDE = 0.004

failures: list[str] = []
warnings: list[str] = []


def fail(message: str) -> None:
    failures.append(message)
    print(f"FAIL  {message}")


def warn(message: str) -> None:
    warnings.append(message)
    print(f"WARN  {message}")


def ok(message: str) -> None:
    print(f"PASS  {message}")


def read_classes(dataset: Path) -> list[str]:
    """Class names from data.yaml, without taking a YAML dependency."""
    config = dataset / "data.yaml"
    if not config.exists():
        fail(f"no data.yaml in {dataset}")
        return []

    names: list[str] = []
    in_names = False
    for line in config.read_text().splitlines():
        stripped = line.strip()
        if stripped.startswith("names:"):
            in_names = True
            continue
        if in_names:
            if stripped.startswith("- "):
                names.append(stripped[2:].strip())
            elif ":" in stripped and stripped[0].isdigit():
                names.append(stripped.split(":", 1)[1].strip())
            elif stripped and not stripped.startswith("#"):
                break
    return names


def survey(split: Path) -> tuple[int, int, Counter, list[str]]:
    """(images, negatives, class counts, complaints) for one split."""
    images_dir, labels_dir = split / "images", split / "labels"
    complaints: list[str] = []

    if not images_dir.is_dir():
        return 0, 0, Counter(), [f"{split.name}: no images/ directory"]

    images = sorted(
        p for p in images_dir.iterdir()
        if p.suffix.lower() in (".jpg", ".jpeg", ".png")
    )

    negatives = 0
    counts: Counter = Counter()

    for image in images:
        label = labels_dir / (image.stem + ".txt")
        if not label.exists() or not label.read_text().strip():
            negatives += 1
            continue

        for number, line in enumerate(label.read_text().splitlines(), 1):
            line = line.strip()
            if not line:
                continue
            parts = line.split()
            if len(parts) != 5:
                complaints.append(f"{label.name}:{number} has {len(parts)} fields, expected 5")
                continue
            try:
                cls = int(parts[0])
                cx, cy, w, h = (float(v) for v in parts[1:])
            except ValueError:
                complaints.append(f"{label.name}:{number} is not numeric")
                continue

            counts[cls] += 1

            if not all(0.0 <= v <= 1.0 for v in (cx, cy, w, h)):
                complaints.append(f"{label.name}:{number} is not normalised 0-1")
            if w < MIN_BOX_SIDE or h < MIN_BOX_SIDE:
                complaints.append(f"{label.name}:{number} is smaller than {MIN_BOX_SIDE} a side")

    # Labels with no picture: usually a rename that went one way only.
    if labels_dir.is_dir():
        stems = {p.stem for p in images}
        for label in labels_dir.glob("*.txt"):
            if label.stem not in stems:
                complaints.append(f"{label.name} has no matching image")

    return len(images), negatives, counts, complaints


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", type=Path)
    args = parser.parse_args()

    print(f"Validating {args.dataset}\n")

    names = read_classes(args.dataset)
    if names:
        ok(f"data.yaml declares {len(names)} classes: {', '.join(names)}")

    total_images = total_negatives = 0
    totals: Counter = Counter()

    for split_name in ("train", "valid"):
        split = args.dataset / split_name
        if not split.is_dir():
            fail(f"no {split_name}/ directory")
            continue

        images, negatives, counts, complaints = survey(split)
        total_images += images
        total_negatives += negatives
        totals.update(counts)

        share = negatives / images if images else 0.0
        print(
            f"\n  {split_name}: {images} images, {negatives} negatives "
            f"({share:.0%}), {sum(counts.values())} boxes"
        )

        for complaint in complaints[:10]:
            fail(complaint)
        if len(complaints) > 10:
            fail(f"...and {len(complaints) - 10} more label problems in {split_name}")

    print()

    if not total_images:
        fail("no images found at all")
        print("\nNothing to train on.")
        return 1

    # ---- the rule this file exists for ------------------------------
    share = total_negatives / total_images
    if share >= MIN_NEGATIVE_SHARE:
        ok(f"{share:.0%} of the set is negatives, at or above the {MIN_NEGATIVE_SHARE:.0%} floor")
    else:
        fail(
            f"only {share:.0%} of the set is negatives, below the "
            f"{MIN_NEGATIVE_SHARE:.0%} floor — this is the forklift model's "
            f"dataset gap, and it produces a detector that answers 'load' to "
            f"an empty bay"
        )

    # ---- learnability -----------------------------------------------
    for index, name in enumerate(names):
        seen = totals.get(index, 0)
        if seen >= MIN_INSTANCES_PER_CLASS:
            ok(f"class {index} ({name}): {seen} instances")
        elif seen == 0:
            fail(f"class {index} ({name}) never appears — declared but never annotated")
        else:
            fail(
                f"class {index} ({name}): {seen} instances, under the "
                f"{MIN_INSTANCES_PER_CLASS} needed to be learnable"
            )

    unknown = [c for c in totals if c >= len(names)]
    if unknown:
        fail(f"labels reference classes not in data.yaml: {sorted(unknown)}")

    # ---- balance ------------------------------------------------------
    if len(totals) > 1:
        most, least = max(totals.values()), min(totals.values())
        if least and most / least > 20:
            warn(
                f"the commonest class outnumbers the rarest {most // least}:1 — "
                f"not fatal, but the rare one will be the one that fails on site"
            )

    print(
        f"\n{total_images} images, {total_negatives} negatives, "
        f"{sum(totals.values())} boxes"
    )
    if failures:
        print(f"\n{len(failures)} problem(s). This is not a set to train on yet.")
        return 1

    print("\nDataset holds. Safe to train.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
