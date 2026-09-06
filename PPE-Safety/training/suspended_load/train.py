"""
Train the suspended-load detector, once the dataset has passed the gate.

    python validate_dataset.py DATASET      # first, always
    python train.py DATASET [--model yolov8s.pt] [--epochs 120]

Transfer learning from COCO rather than from scratch: the classes here are
rigid man-made objects at industrial scale, which is the case pretrained
features suit best, and there will never be enough annotated frames of one
bay to justify starting cold.

`yolov8s` by default, not `m` or `n`. The person detector this module
already ships is `yolov8m-seg`, and both run on every frame — on the Colab
GPU that is comfortable, and if production turns out to be CPU the pair has
to fit a frame budget together. `s` is the size that leaves that decision
open. Measured CPU costs for the models already in this product are in
PHASE_STATUS.md; do not guess from these weights' size.

The run refuses to start if the dataset has not been validated, because the
one failure this whole pipeline exists to avoid is discovering the dataset
gap after the GPU time is spent.
"""

import argparse
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", type=Path)
    parser.add_argument("--model", default="yolov8s.pt")
    parser.add_argument("--epochs", type=int, default=120)
    parser.add_argument("--imgsz", type=int, default=960)
    parser.add_argument("--batch", type=int, default=16)
    parser.add_argument(
        "--skip-validation", action="store_true",
        help="train on a set the gate rejected. There is no good reason.",
    )
    args = parser.parse_args()

    if not args.skip_validation:
        print("Validating the dataset first.\n")
        result = subprocess.run(
            [sys.executable, str(HERE / "validate_dataset.py"), str(args.dataset)]
        )
        if result.returncode != 0:
            print(
                "\nNot training. Fix the dataset rather than passing\n"
                "--skip-validation: every rule that gate applies is one this\n"
                "product has already been bitten by."
            )
            return 1
        print()

    from ultralytics import YOLO

    model = YOLO(args.model)
    model.train(
        data=str((args.dataset / "data.yaml").resolve()),
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        patience=30,
        cos_lr=True,
        # Vertical flips off: a hanging load is the right way up by
        # definition, and teaching the model otherwise spends capacity on
        # a picture this camera will never see.
        flipud=0.0,
        fliplr=0.5,
        degrees=5.0,
        project=str(HERE / "runs"),
        name="suspended_load",
        exist_ok=True,
    )

    print(
        "\nDone. Before shipping the weights:\n"
        "  1. copy them to backend/models/suspended_load.pt\n"
        "  2. write backend/models/suspended_load.data.yaml beside them,\n"
        "     recording what they can and cannot report — including what\n"
        "     they scored on footage containing none of the classes. The\n"
        "     forklift model's entry is the template.\n"
        "  3. sweep them against negatives and write the table down. A model\n"
        "     measured only on positives cannot see what it costs."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
