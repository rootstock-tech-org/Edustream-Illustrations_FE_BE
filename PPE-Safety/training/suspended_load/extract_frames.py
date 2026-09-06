"""
Pull candidate frames out of bay footage for annotation.

Two jobs, and the second is the one that matters. Sampling frames from a
video is trivial; sampling *usefully different* frames is not. A 60fps clip
of a jib arm swinging gives you six hundred near-identical pictures a
minute, and a person paid to draw boxes on them will draw the same box six
hundred times. The dataset gets bigger and learns nothing.

So frames are kept only when they differ enough from the last one kept —
measured on a downscaled grayscale difference, which is crude and is the
right amount of machinery for the question. The threshold is exposed
because "different enough" depends on how fast the machine in your bay
moves.

    python extract_frames.py FOOTAGE... --out frames/ [--every 0.5]
                             [--difference 0.06] [--limit 4000]

Every frame is written with its source and position in the name —
`weldbay1__t0142.80s.jpg` — so an annotator who finds an ambiguous picture
can go back to the video and watch what happened either side of it. That
traceability is worth more than a tidy sequence number the first time
somebody asks "is that plate resting or hanging?".
"""

import argparse
import sys
from pathlib import Path

import cv2
import numpy as np


def signature(frame: np.ndarray) -> np.ndarray:
    """A small grayscale thumbnail, which is all the comparison needs."""
    small = cv2.resize(frame, (64, 36), interpolation=cv2.INTER_AREA)
    return cv2.cvtColor(small, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0


def difference(a: np.ndarray, b: np.ndarray) -> float:
    """Mean absolute difference between two signatures, 0.0 to 1.0."""
    return float(np.abs(a - b).mean())


def extract(
    clip: Path,
    out_dir: Path,
    every: float,
    threshold: float,
    remaining: int,
) -> tuple[int, int]:
    """
    Returns (kept, skipped_as_duplicate) for one clip.
    """
    cap = cv2.VideoCapture(str(clip))
    if not cap.isOpened():
        print(f"  !! could not open {clip}")
        return 0, 0

    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    total = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0
    step = max(1, int(round(fps * every)))

    kept = skipped = 0
    last: np.ndarray | None = None
    index = 0
    stem = clip.stem.replace(" ", "_")

    while index < total and kept < remaining:
        cap.set(cv2.CAP_PROP_POS_FRAMES, index)
        ok, frame = cap.read()
        if not ok:
            break

        current = signature(frame)

        if last is None or difference(last, current) >= threshold:
            seconds = index / fps
            name = f"{stem}__t{seconds:07.2f}s.jpg"
            cv2.imwrite(str(out_dir / name), frame, [cv2.IMWRITE_JPEG_QUALITY, 92])
            last = current
            kept += 1
        else:
            skipped += 1

        index += step

    cap.release()
    return kept, skipped


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("footage", nargs="+", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument(
        "--every", type=float, default=0.5,
        help="seconds between candidate frames before the difference test",
    )
    parser.add_argument(
        "--difference", type=float, default=0.06,
        help="how different a frame must be from the last kept one, 0-1",
    )
    parser.add_argument(
        "--limit", type=int, default=4000,
        help="stop after this many frames across all clips",
    )
    args = parser.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)

    clips = [c for c in args.footage if c.exists()]
    missing = [c for c in args.footage if not c.exists()]
    for c in missing:
        print(f"  !! not found: {c}")

    if not clips:
        print("No footage to read.")
        return 1

    kept_total = skipped_total = 0
    for clip in clips:
        remaining = args.limit - kept_total
        if remaining <= 0:
            print(f"  -- limit reached, {clip.name} not read")
            continue
        kept, skipped = extract(
            clip, args.out, args.every, args.difference, remaining
        )
        kept_total += kept
        skipped_total += skipped
        print(f"  {clip.name}: kept {kept}, skipped {skipped} as near-identical")

    print(
        f"\n{kept_total} frames in {args.out}"
        f" ({skipped_total} skipped as near-identical)."
    )

    if kept_total < 500:
        print(
            "\nThat is not enough to train on. The plan calls for 2,000-4,000\n"
            "frames across many lift cycles, shifts and lighting — and at least\n"
            "a fifth of them showing no load at all. See ANNOTATING.md."
        )

    return 0


if __name__ == "__main__":
    sys.exit(main())
