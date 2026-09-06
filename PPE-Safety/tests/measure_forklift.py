"""
What the forklift weights score on real forklifts, and on everything else.

The confidence floor in `vehicle_zone/service.py` has been set twice from one
side of the evidence and been wrong twice: 0.85 sat above the model's own
observed ceiling and missed a forklift standing in the marked area, and 0.40
alarms on pallet racking at 0.53. Neither number came from a clip where the
answer was known, because until now there was no such clip.

This is what to run when there is one. It does not decide anything on its own
— it produces the two distributions and the annotated frames to check them
against, so the floor is chosen from what forklifts actually score against what
the scenery actually scores, and the cost of the choice is written down in both
directions.

    cd backend
    PYTHONPATH=$PWD .venv/bin/python ../tests/measure_forklift.py \\
        --with-forklift ../clips/forklift-test.mp4 \\
        --without ../clips/empty-aisle.mp4

`--without` is optional but worth having: a clip of the same site with no
forklift in it makes every detection a false positive by construction, which is
the only cheap way to measure precision without labelling boxes by hand.

Where a single clip contains both — a forklift in one part of the frame and
racking in another, which is what the reported failure looks like — pass it as
`--with-forklift` and read the montage: every detection is drawn with its score
so a person can say which boxes are the vehicle and which are the shelving.
"""
import argparse
import sys
from collections import Counter
from pathlib import Path

import cv2
import numpy as np

from app.core.config import MODELS_DIR

MODEL_PATH = MODELS_DIR / "forklift.pt"

#: The floors worth reporting a rate at.
STEPS = [0.25, 0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.70, 0.80, 0.90]


def scan(model, clip: Path, every: int):
    """Every detection in the clip, with its score and its frame."""
    capture = cv2.VideoCapture(str(clip))
    total = int(capture.get(cv2.CAP_PROP_FRAME_COUNT)) or 1

    scores: list[float] = []
    per_frame: list[tuple[int, list]] = []
    frames_seen = 0

    for index in range(0, total, every):
        capture.set(cv2.CAP_PROP_POS_FRAMES, index)
        ok, frame = capture.read()
        if not ok:
            break

        frames_seen += 1
        found = model(frame, verbose=False, conf=min(STEPS))[0]
        boxes = [
            ([float(v) for v in b.xyxy[0]], float(b.conf[0])) for b in found.boxes
        ]
        per_frame.append((index, boxes))
        scores.extend(conf for _box, conf in boxes)

    capture.release()
    return scores, per_frame, frames_seen


def montage(model, clip: Path, per_frame, out: Path, want: int = 9):
    """The most confident detections, drawn with their scores, to eyeball."""
    ranked = sorted(
        ((max((c for _b, c in boxes), default=0.0), index, boxes)
         for index, boxes in per_frame if boxes),
        reverse=True,
    )[:want]

    if not ranked:
        return None

    capture = cv2.VideoCapture(str(clip))
    tiles = []

    for _best, index, boxes in ranked:
        capture.set(cv2.CAP_PROP_POS_FRAMES, index)
        ok, frame = capture.read()
        if not ok:
            continue
        for box, conf in boxes:
            x1, y1, x2, y2 = (int(v) for v in box)
            cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 220), 2)
            cv2.putText(frame, f"{conf:.2f}", (x1, max(16, y1 - 6)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 220), 2)
        cv2.putText(frame, f"frame {index}", (8, 22),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 0), 2)
        tiles.append(cv2.resize(frame, (440, 300)))

    capture.release()

    if not tiles:
        return None

    while len(tiles) % 3:
        tiles.append(np.zeros((300, 440, 3), dtype=np.uint8))

    rows = [np.hstack(tiles[i:i + 3]) for i in range(0, len(tiles), 3)]
    cv2.imwrite(str(out), np.vstack(rows))
    return out


def spread(scores: list[float]) -> str:
    if not scores:
        return "no detections"
    ordered = sorted(scores)
    at = lambda p: ordered[min(len(ordered) - 1, int(p * len(ordered)))]  # noqa: E731
    return (f"n={len(ordered)}  min {ordered[0]:.2f}  "
            f"p25 {at(.25):.2f}  median {at(.5):.2f}  p75 {at(.75):.2f}  "
            f"max {ordered[-1]:.2f}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--with-forklift", required=True, type=Path)
    parser.add_argument("--without", type=Path)
    parser.add_argument("--every", type=int, default=5,
                        help="sample every Nth frame (default 5)")
    args = parser.parse_args()

    if not MODEL_PATH.exists():
        print(f"no weights at {MODEL_PATH}")
        return 1

    from ultralytics import YOLO
    model = YOLO(str(MODEL_PATH))

    out_dir = Path(__file__).resolve().parent
    print(f"weights {MODEL_PATH.name} · classes {model.names}\n")

    positive, pos_frames, pos_n = scan(model, args.with_forklift, args.every)
    print(f"--- {args.with_forklift.name}: {pos_n} frames sampled")
    print(f"    scores  {spread(positive)}")
    shot = montage(model, args.with_forklift, pos_frames,
                   out_dir / "_forklift_positive.png")
    if shot:
        print(f"    strongest detections drawn to {shot}")

    negative: list[float] = []
    if args.without:
        negative, neg_frames, neg_n = scan(model, args.without, args.every)
        print(f"\n--- {args.without.name}: {neg_n} frames sampled, "
              f"every detection a false positive by construction")
        print(f"    scores  {spread(negative)}")
        shot = montage(model, args.without, neg_frames,
                       out_dir / "_forklift_negative.png")
        if shot:
            print(f"    strongest false positives drawn to {shot}")

    print(f"\n--- what each floor would cost")
    print(f"{'floor':>6}  {'kept in the forklift clip':>26}"
          + ("  false alarms per 100 frames" if args.without else ""))

    per_frame_pos = Counter()
    for _index, boxes in pos_frames:
        for _b, conf in boxes:
            per_frame_pos[conf] += 1

    for floor in STEPS:
        kept = sum(1 for c in positive if c >= floor)
        line = f"{floor:>6.2f}  {kept:>26}"
        if args.without:
            fp_frames = sum(
                1 for _i, boxes in neg_frames if any(c >= floor for _b, c in boxes)
            )
            line += f"  {100 * fp_frames / max(neg_n, 1):>27.1f}"
        print(line)

    print("""
Read the montages before choosing. A floor is only honest if somebody has
looked at what it keeps and what it drops — the whole reason this file exists
is that the last two numbers were chosen without that.""")
    return 0


if __name__ == "__main__":
    sys.exit(main())
