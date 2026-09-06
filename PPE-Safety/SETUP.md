# Setup — Factory Safety prototype

How to run the imported `backend` + `frontend` prototype, what was changed to make it
run outside its original Windows machine, and what it actually does today.

Scope context lives in [`PROJECT_GOAL.md`](./PROJECT_GOAL.md); the build plan is
[`ACTION_LIST.md`](./ACTION_LIST.md).

---

## 1. What this code is

A single-camera prototype, imported from `ppe-codecompress.zip`:

- **`backend/`** — FastAPI service. Captures from a webcam, RTSP URL, or uploaded video
  file; runs YOLOv8 person segmentation on each frame; raises an alarm when a person
  overlaps an operator-drawn restricted-area polygon; streams annotated MJPEG to the browser.
- **`frontend/`** — React 19 + Vite + MUI dashboard. Pages for Dashboard, Camera, Zones,
  Events, Settings, with a Konva canvas for drawing the restricted-area polygon.

Read §4 before assuming feature coverage — the gap between this and `PROJECT_GOAL.md` is large.

---

## 2. Running it

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt    # pulls torch via ultralytics — expect a large download
pip install --no-deps rapidocr-onnxruntime==1.4.4   # burned-in timestamp OCR; --no-deps
                                   # keeps it off the shared cv2/onnxruntime builds
uvicorn app.main:app --reload --port 8000
```

Skipping the rapidocr line is safe: the app runs without it and safety events
carry the system clock instead of the timestamp burned into CCTV footage.

Serves on `http://127.0.0.1:8000`. Check `GET /health`.

On first run Ultralytics downloads `yolov8n-seg.pt` (~7 MB) into the working directory.
Weights are **not** committed — see `.gitignore`. Run uvicorn from `backend/` so the
download and the `storage/` paths land where the code expects them.

`app.core.config.create_storage_dirs()` creates `backend/storage/` on startup; it is
gitignored, as is anything written into it.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Serves on `http://localhost:5173`. The API base URL is hardcoded to
`http://127.0.0.1:8000` in `src/services/api.js` — change it there, or lift it to an
env var, if the backend moves.

---

## 3. Changes made during import

The code ran on one Windows machine. Four things stopped it running anywhere else; all four
are fixed. Nothing else was refactored.

| # | File | Problem | Fix |
| --- | --- | --- | --- |
| 1 | `backend/app/vision/alarm.py` | `import winsound` at module scope. Windows-only stdlib; on Linux/macOS this raises `ModuleNotFoundError` before the app can start — and `main.py → camera_routes → detector → alarm` means **the entire backend failed to boot**. | Wrapped in `try/except ImportError`; the beep is skipped off-Windows and the alarm state still logs. |
| 2 | `backend/app/vision/polygon.py` | `from turtle import width` — a stray autocomplete import. `turtle` pulls in `tkinter`, absent on most headless Linux images. The name is dead: `width` is assigned locally at line 81. | Removed. |
| 3 | `backend/requirements.txt` | UTF-16LE `pip freeze` of a whole global Windows environment: streamlit, Flask, pywhatkit, pyjokes, PyAutoGUI, pywin32. Contained **none** of fastapi, uvicorn, ultralytics, torch, or pydantic. `pip install -r` could not install this app on any platform, and would fail outright on Linux at the win32 packages. | Replaced with the actual dependency set, derived from the imports in `app/`. |
| 4 | `backend/app/main.py` | `system_router` and `camera_router` were each registered twice — once before the startup hooks and again at the bottom of the file, duplicating every one of their routes. | Removed the first pair; all three routers are now included once. |

### Excluded from the commit

The zip was 42 MB; the source is 572 KB. Left out:

| Excluded | Size | Why |
| --- | --- | --- |
| `backend/storage/uploads/` | 20 MB | Test videos and a screen recording — runtime input, not source |
| `backend/yolov8n.pt`, `yolov8n-seg.pt` | 13 MB | Stock Ultralytics weights; auto-downloaded on first run |
| `project_structure.txt` | 4.8 MB | Generated directory dump of the original machine, venv included |
| `backend/storage/snapshots/` | 2.4 MB | Generated evidence images from past runs |
| `backend/backend_structure.txt` | 364 KB | Another generated dump |
| `__pycache__/`, `*.pyc`, `logs/` | — | Build and run artifacts |

No `.env`, credentials, keys, or database files were present in the zip.

---

## 4. What actually exists today

This matters for blocker **B1** in `ACTION_LIST.md` §1 — whether the four detectors marked
✅ Completed in `PROJECT_GOAL.md` §3 are real. Measured against the code, not the register:

| `PROJECT_GOAL.md` claim | Reality in this code |
| --- | --- |
| 1a Helmet detection — ✅ Completed | **Not present.** No PPE model, no PPE class, no reference anywhere |
| 1b Safety vest detection — ✅ Completed | **Not present.** Same |
| 1c Gloves detection — ✅ Completed | **Not present.** Same |
| 2c Restricted-area intrusion — ✅ Completed | **Present.** `vision/detector.py`, YOLOv8n-seg filtered to `classes=[0]` (person only), 10% mask-overlap threshold against one polygon |
| 3b Door left open — not started | `vision/door_detector.py` and `vision/door_state.py` exist as **0-byte files** |
| 3c Window breach — not started | No file |

`detector.py` detects **people and nothing else**. Despite the zip being named
`ppe-codecompress`, there is no PPE detection in it.

Eight further modules are 0-byte stubs: `alarm/alarm_manager.py`, `database/db.py`,
`events/event_manager.py`, `websocket/manager.py`, `zones/zone_manager.py`,
`vision/door_detector.py`, `vision/door_state.py`, and `frontend/src/services/websocket.js`.

So of the six Phase 1 committed detectors, **one is implemented** — not four.

---

## 5. Gap against the Phase 1 architecture

Beyond the detector count, the prototype is a single-process demo rather than the platform
described in `PROJECT_GOAL.md` §7. Mapped to the `ACTION_LIST.md` workstreams:

| Layer | Prototype | Phase 1 target |
| --- | --- | --- |
| Ingestion | One global `CameraManager`, one camera at a time, no reconnect/backoff | `I1`–`I7`: supervised per-camera processes, health state machine, bounded queues |
| Inference | Model loaded at import, inference inline in the MJPEG stream loop | `M2`–`M4`: decoupled GPU worker pool |
| Tracking | None — no track IDs, so no per-person cooldown is possible | `M3`: ByteTrack/OC-SORT |
| Event engine | A boolean `person_inside` and a beep | `E1`–`E8`: rules, dwell, escalation, cooldown, dedup, lifecycle |
| Evidence | Manual snapshot endpoint only; nothing attached to an event | `V1`–`V4`: annotated evidence on 100% of events |
| Persistence | Polygon in one JSON file; `database/db.py` empty | `F6`: Postgres schema and migrations |
| API | Unauthenticated, `allow_origins=["*"]` with `allow_credentials=True` | `A2`, `O1`: auth and RBAC |
| Notifications | `winsound` beep on the server | `N1`–`N5`: routed multi-channel delivery |
| Zones | One global polygon for the whole system | `E1`, `A5`: per-camera named zones with rules |

Two notes for whoever picks this up:

- **`allow_origins=["*"]` with `allow_credentials=True`** is rejected by browsers per the CORS
  spec, and is the wrong posture for a plant-network deployment regardless. Fix when auth
  lands in `A2`.
- **Global singletons** — `detector`, `alarm`, `camera_manager`, `polygon_manager` are all
  module-level instances. That is the single biggest structural obstacle to multi-camera
  support, and it is worth addressing before, not after, camera two.

The prototype is a reasonable starting point for `I1`/`M2` and proves the restricted-area
approach works. It is not a Phase 1 baseline, and the plan's estimates should be read on the
assumption that helmet, vest, and gloves detection are **still to be built**.
