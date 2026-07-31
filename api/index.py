"""Vercel demo backend for dashboard.html.

The production path (server.py) loads a YOLOv8l checkpoint through ultralytics.
That stack is ~800 MB installed and cannot fit in a Vercel serverless function
(250 MB unzipped), so this build runs in DEMO_MODE: /api/detect returns
deterministic synthetic boxes drawn over the image the visitor actually
uploaded. The Groq analysis step in /api/analyze is real.

Set DEMO_MODE=0 to make /api/detect return 503 instead of synthetic output.
"""
from __future__ import annotations

import base64
import hashlib
import io
import os
import random
import time
from collections import Counter
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
from PIL import Image, ImageDraw, ImageFont, ImageOps

try:
    import markdown as md
except ImportError:
    md = None
try:
    import requests
except ImportError:
    requests = None
try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None

ROOT = Path(__file__).resolve().parent.parent

# Vercel injects env vars directly; .env is only for `vercel dev` / local runs.
if load_dotenv is not None:
    load_dotenv(ROOT / ".env")

DEMO_MODE = os.environ.get("DEMO_MODE", "1") not in ("0", "false", "False", "")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_MODEL = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")

# Mirrors model.names from models/msw_yolov8l_detect_best.pt so the frontend's
# coverage banner reports the same 5/16 as the real checkpoint.
MODEL_NAME = "msw_yolov8l_detect_best.pt"
MODEL_CLASSES = ["Cloth", "Coconut", "Slipper", "Stone", "shoe"]

# Ultralytics default annotator palette, so annotated frames look native.
PALETTE = [(4, 42, 255), (11, 219, 235), (0, 223, 183), (255, 111, 221), (255, 68, 79)]

MAX_EDGE = 1280  # downscale uploads; keeps the base64 response small

GROQ_SYSTEM_PROMPT = (
    "You are an MSW (municipal solid waste) characterisation engine. "
    "Given detector output, emit a TECHNICAL analysis only — no recommendations, "
    "no narrative, no encouragement. Use this exact markdown structure:\n\n"
    "### Material profile\n"
    "Markdown table with columns: `Class | Polymer/Material | Density (kg/m³) | "
    "Recyclability code | Decomposition (yr)`. One row per detected class.\n\n"
    "### Stream classification\n"
    "Markdown table: `Class | MSW stream | CPCB code | Hazard class`. "
    "Streams limited to: Wet, Dry-Recyclable, Dry-Residual, Inert, Hazardous, E-waste.\n\n"
    "### Energy & emissions\n"
    "Markdown table: `Class | NCV (MJ/kg) | CO₂e landfill (kg/kg) | "
    "CO₂e incineration (kg/kg) | CO₂e recycling (kg/kg)`.\n\n"
    "Numbers only. No prose, no bullet lists, no closing summary. "
    "If a value is unknown, write `n/a`."
)

app = Flask(__name__, static_folder=None)


# ── annotation helpers ───────────────────────────────────────────────────────

def _load_font(size: int):
    for path in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ):
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            continue
    try:
        return ImageFont.load_default(size=size)  # Pillow >= 10.1
    except TypeError:
        return ImageFont.load_default()


def _iou(a, b) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    iw, ih = max(0.0, ix2 - ix1), max(0.0, iy2 - iy1)
    inter = iw * ih
    if inter <= 0:
        return 0.0
    union = (ax2 - ax1) * (ay2 - ay1) + (bx2 - bx1) * (by2 - by1) - inter
    return inter / union if union > 0 else 0.0


def _synthesise(seed: int, w: int, h: int, conf_thres: float, iou_thres: float):
    """Deterministic pseudo-detections: the same upload always yields the same
    boxes, and both dashboard sliders still filter the result set for real."""
    rng = random.Random(seed)
    raw = []
    for _ in range(rng.choice([3, 4, 4, 5, 5, 6, 7])):
        bw = rng.uniform(0.13, 0.33) * w
        bh = rng.uniform(0.13, 0.33) * h
        x1 = rng.uniform(0.02, max(0.03, 0.97 - bw / w)) * w
        y1 = rng.uniform(0.02, max(0.03, 0.97 - bh / h)) * h
        raw.append({
            "cls_id": rng.randrange(len(MODEL_CLASSES)),
            "conf": round(min(0.97, max(0.30, rng.betavariate(5.0, 2.0))), 4),
            "xyxy": (x1, y1, x1 + bw, y1 + bh),
        })

    # Same order as a real detector: confidence gate, then NMS.
    raw = [d for d in raw if d["conf"] >= conf_thres]
    raw.sort(key=lambda d: d["conf"], reverse=True)
    kept = []
    for d in raw:
        if all(_iou(d["xyxy"], k["xyxy"]) <= iou_thres for k in kept):
            kept.append(d)
    return kept


def _annotate(img: Image.Image, dets) -> Image.Image:
    out = img.copy()
    draw = ImageDraw.Draw(out)
    w, h = out.size
    lw = max(2, round(0.0025 * max(w, h)))
    font = _load_font(max(13, round(0.022 * max(w, h))))

    for d in dets:
        x1, y1, x2, y2 = d["xyxy"]
        color = PALETTE[d["cls_id"] % len(PALETTE)]
        draw.rectangle([x1, y1, x2, y2], outline=color, width=lw)

        label = "%s %.2f" % (MODEL_CLASSES[d["cls_id"]], d["conf"])
        tx1, ty1, tx2, ty2 = draw.textbbox((0, 0), label, font=font)
        tw, th = tx2 - tx1, ty2 - ty1
        pad = max(2, lw)

        ly2 = y1
        ly1 = y1 - th - 2 * pad
        if ly1 < 0:
            ly1, ly2 = y1, y1 + th + 2 * pad
        draw.rectangle([x1 - lw / 2, ly1, x1 + tw + 2 * pad, ly2], fill=color)

        luma = 0.299 * color[0] + 0.587 * color[1] + 0.114 * color[2]
        draw.text((x1 + pad - tx1, ly1 + pad - ty1), label,
                  fill=(0, 0, 0) if luma > 140 else (255, 255, 255), font=font)
    return out


# ── routes ───────────────────────────────────────────────────────────────────

@app.get("/")
def index():
    return send_from_directory(ROOT, "dashboard.html")


@app.get("/api/status")
def status():
    if not DEMO_MODE:
        return jsonify(ok=False, model=None, classes=[],
                       message="Model not loaded - frontend preview mode")
    return jsonify(ok=True, model=MODEL_NAME, classes=MODEL_CLASSES, demo=True)


@app.post("/api/detect")
def detect():
    if not DEMO_MODE:
        return jsonify(error="model not loaded on server (frontend preview mode)"), 503

    file = request.files.get("image")
    if file is None:
        return jsonify(error="no image uploaded"), 400

    try:
        conf = min(max(float(request.form.get("conf", 0.25)), 0.0), 1.0)
        iou = min(max(float(request.form.get("iou", 0.45)), 0.0), 1.0)
    except ValueError:
        return jsonify(error="conf and iou must be numbers"), 400

    raw = file.stream.read()
    if not raw:
        return jsonify(error="empty upload"), 400

    try:
        img = Image.open(io.BytesIO(raw))
        img = ImageOps.exif_transpose(img).convert("RGB")
    except Exception as exc:
        return jsonify(error="could not read image: %s" % exc), 400

    if max(img.size) > MAX_EDGE:
        img.thumbnail((MAX_EDGE, MAX_EDGE), Image.LANCZOS)

    t0 = time.perf_counter()
    w, h = img.size
    seed = int.from_bytes(hashlib.sha256(raw).digest()[:8], "big")
    kept = _synthesise(seed, w, h, conf, iou)
    annotated = _annotate(img, kept)
    latency_ms = (time.perf_counter() - t0) * 1000

    frame_area = w * h
    detections = []
    for d in kept:
        x1, y1, x2, y2 = d["xyxy"]
        bbox_area = (x2 - x1) * (y2 - y1)
        detections.append({
            "class": MODEL_CLASSES[d["cls_id"]],
            "confidence": d["conf"],
            "bbox_px": bbox_area,
            "coverage": bbox_area / frame_area,
        })

    buf = io.BytesIO()
    annotated.save(buf, format="PNG", optimize=True)
    annotated_b64 = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()

    return jsonify(
        detections=detections,
        frame_area=frame_area,
        annotated_image=annotated_b64,
        latency_ms=round(latency_ms, 1),
        demo=True,
    )


@app.post("/api/analyze")
def analyze():
    body = request.get_json(force=True, silent=True) or {}
    detections = body.get("detections", [])
    if not detections:
        return jsonify(error="no detections to analyze"), 400

    counts = Counter(d["class"] for d in detections)
    lines = []
    for cls, n in counts.most_common():
        ds = [d for d in detections if d["class"] == cls]
        cov = sum(d["coverage"] for d in ds) * 100
        mc = sum(d["confidence"] for d in ds) / n
        lines.append(f"{cls}: n={n} cov={cov:.2f}% conf={mc:.2f}")
    payload = "\n".join(lines)

    if requests is None or md is None:
        return jsonify(error="analysis libraries not installed on server"), 503
    if not GROQ_API_KEY:
        return jsonify(error="GROQ_API_KEY not configured"), 500

    try:
        resp = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
            json={
                "model": GROQ_MODEL,
                "messages": [
                    {"role": "system", "content": GROQ_SYSTEM_PROMPT},
                    {"role": "user", "content": payload},
                ],
                "temperature": 0.2,
                "max_tokens": 900,
            },
            timeout=25,  # must stay under the function's maxDuration
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"].strip()
    except Exception as exc:
        return jsonify(error=str(exc)), 502

    html = md.markdown(content, extensions=["tables"])
    return jsonify(html=html, payload=payload)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5050, debug=False)
