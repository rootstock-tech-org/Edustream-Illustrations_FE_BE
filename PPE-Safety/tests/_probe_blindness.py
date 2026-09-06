"""
Where does the detector go blind, and does the gate speak first?

`legibility.py` makes a claim about itself in its own docstring: its four
thresholds were set "just above the loss, not at it — the point is to speak
before the detector goes quiet, not at the same moment." That is a testable
claim about two different things moving along the same axis, and nothing in
the product tests it. This probe measures both.

For every degradation axis and every step along it, it records

    * how many *people* each module's own detector finds, at the confidence
      that module actually runs it at — read from the module, not hardcoded,
      so lowering the person confidence (PPE-01's fix) is measured rather
      than assumed
    * what `legibility.read()` says about the same picture

and then reports, per detector per axis, the first step at which people are
lost and the first step at which the gate fires. The suite asserts the second
comes at or before the first.

Four detectors, because "the person detector" is four different models here:

    ppe.pt          person + helmet + vest      Safety Gear
    mask.pt         person + mask               Face Masks
    gloves.pt       person + gloved/bare hand   Gloves
    yolov8n-seg.pt  COCO person, segmented      Restricted Zone, Workstation

Prints one JSON object on its last line. Nothing here decides anything; the
suite reads the numbers and judges.
"""

import json
import sys
from pathlib import Path

import cv2
import numpy as np
from ultralytics import YOLO

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
sys.path.insert(0, str(REPO / "backend"))

from app.vision.legibility import read  # noqa: E402

FIXTURE = HERE / "fixtures" / "check_photo.jpg"


def _confidence_of(module_path: str, *names: str, default: float) -> float:
    """
    The confidence a module runs its *person* pass at, asked of the module.

    Phase 2 asks Safety Gear to detect people at a materially lower confidence
    than gear items, which moves the point where people start being lost. A
    number copied into this file would keep reporting the old cliff, so the
    module is asked instead, and the constant it answers with is recorded
    alongside the measurement.
    """
    import importlib

    try:
        service = importlib.import_module(module_path)
    except Exception:  # noqa: BLE001
        return default

    for name in names:
        value = getattr(service, name, None)
        if isinstance(value, (int, float)):
            return float(value)

    return default


DETECTORS = {
    "ppe": {
        "weights": REPO / "backend" / "models" / "ppe.pt",
        "person_class": 0,
        "conf": _confidence_of(
            "app.modules.ppe.service",
            "PERSON_CONFIDENCE", "PERSON_CONF", "CONF_THRESHOLD",
            default=0.35,
        ),
        "modules": ["ppe"],
    },
    "mask": {
        "weights": REPO / "backend" / "models" / "mask.pt",
        "person_class": 1,
        "conf": _confidence_of(
            "app.modules.mask.service",
            "PERSON_CONFIDENCE", "PERSON_CONF", "CONF_THRESHOLD",
            default=0.35,
        ),
        "modules": ["mask"],
    },
    "gloves": {
        "weights": REPO / "backend" / "models" / "gloves.pt",
        "person_class": 0,
        "conf": _confidence_of(
            "app.modules.gloves.service",
            "PERSON_CONFIDENCE", "PERSON_CONF", "DEFAULT_CONFIDENCE",
            default=0.35,
        ),
        "modules": ["gloves"],
    },
    "seg": {
        "weights": REPO / "backend" / "yolov8n-seg.pt",
        "person_class": 0,
        "conf": _confidence_of(
            "app.modules.workstation.service",
            "PERSON_CONFIDENCE", "PERSON_CONF", "CONF_THRESHOLD",
            default=0.45,
        ),
        "modules": ["workstation", "restricted-zone"],
    },
    # The configuration `legibility.py`'s own calibration table was measured
    # with, reproduced here so the gate can be judged against the loss it was
    # built to get in front of rather than against a different one.
    #
    # Its docstring records the site frame as 3/3 people at full light, 2/3 at
    # x0.35, 2/3 at blur k=11 and 2/3 at JPEG q=21. Those numbers reproduce
    # exactly on `check_photo.jpg` with the shared segmentation model at 0.35
    # confidence, and at no other confidence — which is the provenance of every
    # threshold in that file, and worth being able to state.
    #
    # No module runs this configuration: Workstation and Restricted Zone use
    # the same weights at 0.45, where the third worker is never found at all.
    # So it serves no module, and section 3 reports it rather than gating on it
    # — but a person it loses is a person the picture cost, which is what makes
    # a module's "unverified" honest rather than a regression.
    "gate-calibration": {
        "weights": REPO / "backend" / "yolov8n-seg.pt",
        "person_class": 0,
        "conf": 0.35,
        "modules": [],
    },
}

#: Every module a measured detector serves. Each one now has floors of its own
#: in `legibility.py`, so "where does the gate speak" has a different answer per
#: module, and every one of them has to be measured separately.
MEASURED_MODULES = sorted(
    {module for spec in DETECTORS.values() for module in spec["modules"]}
)

#: Steps along each axis, ordered best picture first. The report's own cliff
#: values are all in here, with the levels either side, plus enough resolution
#: between them that "the first level that loses somebody" is a real answer
#: and not the nearest of three.
#:
#: Every level `capture_verdicts.py` sweeps appears here, so section 4 can ask
#: "was the detector losing people at this exact condition" about any verdict in
#: the baseline and get an answer rather than a shrug — 0.0825 is MASK-03's own
#: number and 0.08 is the baseline's neighbouring step, and both are needed.
AXES = {
    "brightness": [1.00, 0.90, 0.80, 0.70, 0.60, 0.50, 0.45, 0.40, 0.35,
                   0.30, 0.25, 0.20, 0.17, 0.16, 0.12, 0.10, 0.0825, 0.08,
                   0.06],
    "blur": [1, 3, 5, 7, 9, 11, 13, 15, 17, 21, 25, 31, 35],
    "jpeg": [95, 60, 40, 30, 25, 21, 19, 17, 15, 12, 10, 7, 5],
}


def degrade(frame: np.ndarray, axis: str, level) -> np.ndarray:
    if axis == "brightness":
        return np.clip(frame.astype(np.float32) * level, 0, 255).astype(np.uint8)

    if axis == "blur":
        if level <= 1:
            return frame.copy()
        return cv2.GaussianBlur(frame, (int(level), int(level)), 0)

    if axis == "jpeg":
        ok, buffer = cv2.imencode(
            ".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), int(level)]
        )
        if not ok:
            raise RuntimeError(f"could not encode at quality {level}")
        return cv2.imdecode(buffer, cv2.IMREAD_COLOR)

    raise ValueError(axis)


def people_found(model: YOLO, picture: np.ndarray, person_class: int, conf: float) -> int:
    """How many *people* this model finds. Gear and hands are not people."""
    results = model(picture, verbose=False, conf=conf)
    total = 0

    for result in results:
        if result.boxes is None:
            continue
        for box in result.boxes:
            if int(box.cls[0]) == person_class:
                total += 1

    return total


def main() -> int:
    frame = cv2.imread(str(FIXTURE))

    if frame is None:
        print(json.dumps({"__failed__": True, "why": f"missing {FIXTURE}"}))
        return 1

    models = {
        name: YOLO(str(spec["weights"]))
        for name, spec in DETECTORS.items()
        if spec["weights"].exists()
    }

    # How many people each detector finds on the picture *before* anything is
    # done to it. Every axis is measured against this rather than against its
    # own first step: the JPEG axis starts at quality 95, which is already a
    # re-encode, and the shared model finds a phantom third person there. A
    # loss measured against a phantom is not a loss.
    reference = {
        name: people_found(
            model, frame, DETECTORS[name]["person_class"], DETECTORS[name]["conf"]
        )
        for name, model in models.items()
    }

    out = {
        "fixture": FIXTURE.name,
        "confidence": {name: spec["conf"] for name, spec in DETECTORS.items()},
        "modules": {name: spec["modules"] for name, spec in DETECTORS.items()},
        "measured_modules": MEASURED_MODULES,
        "reference": reference,
        "axes": {},
    }

    for axis, levels in AXES.items():
        rows = []

        for level in levels:
            picture = degrade(frame, axis, level)
            reading = read(picture)

            row = {
                "level": level,
                "readable": reading.readable,
                "reason": reading.reason,
                "brightness": round(reading.brightness, 1),
                "contrast": round(reading.contrast, 1),
                "sharpness": round(reading.sharpness, 1),
                "blockiness": round(reading.blockiness, 2),
                # The same picture judged by each module's *own* floors.
                #
                # `readable` above is the shared set, which is now the fallback
                # for modules that judge no people rather than the gate anybody
                # runs. Asking the shared question and reporting the answer as
                # though it were the module's would measure a gate that is no
                # longer in the product — and this is the section that decides
                # whether the per-module floors are safe, so it has to be the
                # floors the module actually uses.
                "readable_by": {
                    module_id: read(picture, module_id).readable
                    for module_id in MEASURED_MODULES
                },
                "people": {},
            }

            for name, model in models.items():
                row["people"][name] = people_found(
                    model, picture, DETECTORS[name]["person_class"],
                    DETECTORS[name]["conf"],
                )

            rows.append(row)

        out["axes"][axis] = rows

    print(json.dumps(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
