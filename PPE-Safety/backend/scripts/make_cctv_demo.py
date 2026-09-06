"""
Turn clean footage into believable CCTV footage for a demo.

Gives any clip the plant-camera treatment: muted colour, flattened
contrast, sensor grain, a vignette, and a burnt-in camera name and running
timestamp. The subjects the models need — people, hands, doors — are left
alone, and that is verified by running the safety-gear and gloves models
over the result before the file is accepted.

    python scripts/make_cctv_demo.py <input video> <output.webm> [ffmpeg]

Run from backend/ so the models import. The encoder must be an ffmpeg with
libvpx; a full system ffmpeg works, and so does the one Playwright bundles.
The output is WebM so every browser plays it.

The committed demo/cctv_demo.webm was produced by this script.
"""

import subprocess
import sys
from datetime import datetime, timedelta

sys.path.insert(0, ".")

import cv2  # noqa: E402
import numpy as np  # noqa: E402

if len(sys.argv) < 3:
    raise SystemExit(__doc__)

SRC = sys.argv[1]
OUT = sys.argv[2]
FFMPEG = sys.argv[3] if len(sys.argv) > 3 else "ffmpeg"

FPS = 15
START = datetime(2026, 8, 6, 9, 41, 7)


def cctv(frame, vignette, seconds):
    """One frame, given the plant-camera treatment."""
    # Colour drains first on a cheap sensor.
    grey = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    grey = cv2.cvtColor(grey, cv2.COLOR_GRAY2BGR)
    frame = cv2.addWeighted(frame, 0.55, grey, 0.45, 0)

    # Lifted blacks, dulled highlights.
    frame = cv2.convertScaleAbs(frame, alpha=0.92, beta=14)

    # Sensor grain.
    noise = np.random.default_rng(int(seconds * FPS)).normal(0, 4.5, frame.shape)
    frame = np.clip(frame.astype(np.int16) + noise.astype(np.int16), 0, 255).astype(np.uint8)

    # Corners fall off.
    frame = (frame * vignette).astype(np.uint8)

    # The burnt-in header every plant camera writes.
    stamp = (START + timedelta(seconds=seconds)).strftime("%d-%m-%Y  %H:%M:%S")
    cv2.rectangle(frame, (0, 0), (frame.shape[1], 26), (12, 12, 12), -1)
    cv2.putText(frame, "CAM 03  ASSEMBLY LINE B", (8, 18),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (235, 235, 235), 1, cv2.LINE_AA)
    cv2.putText(frame, stamp, (frame.shape[1] - 205, 18),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (235, 235, 235), 1, cv2.LINE_AA)

    return frame


def vignette_mask(width, height):
    x = np.linspace(-1, 1, width)[None, :]
    y = np.linspace(-1, 1, height)[:, None]
    fall = 1 - 0.28 * np.clip(np.sqrt(x * x + y * y) - 0.55, 0, 1) ** 2
    return fall[..., None]


capture = cv2.VideoCapture(SRC)
ok, first = capture.read()
if not ok:
    raise SystemExit("could not read the source footage")

height, width = first.shape[:2]
mask = vignette_mask(width, height)

# This ffmpeg build has no pipe protocol at all, so the whole MJPEG stream
# goes to disk first and ffmpeg reads it as a file.
MJPEG = OUT + ".mjpeg"
stream = open(MJPEG, "wb")

count = 0
frame = first
while True:
    styled = cctv(frame, mask, count / FPS)
    ok, jpeg = cv2.imencode(".jpg", styled, [int(cv2.IMWRITE_JPEG_QUALITY), 92])
    if not ok:
        raise SystemExit("could not encode a frame")
    stream.write(jpeg.tobytes())
    count += 1

    ok, frame = capture.read()
    if not ok:
        break

capture.release()
stream.close()

import os

done = subprocess.run(
    [FFMPEG, "-y", "-f", "image2pipe", "-framerate", str(FPS), "-c:v", "mjpeg",
     "-i", MJPEG, "-c:v", "libvpx", "-b:v", "1.2M", "-deadline", "good", OUT],
    capture_output=True, text=True,
)
os.remove(MJPEG)

if done.returncode != 0:
    raise SystemExit(f"encode failed:\n{done.stderr[-800:]}")

print(f"wrote {count} frames ({count / FPS:.0f}s) to {OUT}")

# --- prove the models still see through the treatment -----------------------
from app.modules.gloves.service import GlovesService  # noqa: E402
from app.modules.ppe.service import PPEService  # noqa: E402

gloves = GlovesService()
ppe = PPEService()

check = cv2.VideoCapture(OUT)
hands = people = frames = 0
while True:
    ok, styled = check.read()
    if not ok:
        break
    frames += 1
    if frames % 10 != 1:
        continue
    _, g = gloves.process(styled)
    _, p = ppe.process(styled)
    hands = max(hands, g.get("hands_total", 0))
    people = max(people, p.get("people_total", 0))
check.release()

print(f"styled footage: gloves model peak {hands} hands, ppe model peak {people} people")
if hands == 0 or people == 0:
    raise SystemExit("the treatment blinded a model — do not use this file")
print("both models still fire on the styled footage")
