# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pip install -r requirements.txt          # runtime deps
pip install -r requirements-hardware.txt # optional: RealSense driver, HYBRID/REAL modes only
python app.py                            # run — dashboard on http://localhost:5000
python scripts/smoke_test.py             # boot the app and assert all 11 routes return 200
python scripts/smoke_test.py --server gunicorn   # same, via the deployed entrypoint
ruff check --select E9,F63,F7,F82 .      # the lint CI enforces
```

There is no unit test suite — `scripts/smoke_test.py` is the only test, and it is an
end-to-end boot check rather than something with individually runnable cases. It boots
either entrypoint: `app.py` (Werkzeug, local) or `wsgi.py` under gunicorn (what
deployments run). CI (`.github/workflows/ci.yml`) runs install → `compileall` → lint →
both smoke tests on Python 3.11 and 3.12.

The lint gate is deliberately narrow (syntax errors, broken comparisons, undefined
names). Ruff's default rule set reports ~21 cosmetic findings in the original imported
code; those are knowingly not gated, so do not "fix the lint" repo-wide as a side errand.

### Environment variables

| Variable | Default | Notes |
| --- | --- | --- |
| `SMARTSEG_SENSOR_MODE` | `MOCK` | `MOCK`, `HYBRID` (adds live RealSense RGB on `/camera`), `REAL` |
| `SMARTSEG_SECRET_KEY` | `dev-only-insecure-key` | Flask/Socket.IO signing key |
| `SMARTSEG_CORS_ORIGINS` | `*` | Origins allowed to open a Socket.IO connection; comma-separated |
| `SMARTSEG_PORT` / `PORT` | `5000` | `PORT` is honoured too, for platforms that inject it |
| `SMARTSEG_HOST` | `0.0.0.0` | |
| `SMARTSEG_TICK_RATE_HZ` | `30` | Simulation ticks/sec — the CPU knob |
| `SMARTSEG_EMIT_RATE_HZ` | `30` | |
| `SMARTSEG_DEBUG` | `True` | |

Keep MOCK working with no hardware and no optional drivers — it is the default path,
the only one CI exercises, and `HybridSensorProvider` is written to degrade into it when
`pyrealsense2` or the camera is missing.

### Deployment

`DEPLOYMENT.md` is the full guide; the shape of it matters when changing anything here.
The app is a **single always-on process** — `app.py`'s Werkzeug server is local-only, and
deployments import `wsgi.py` under gunicorn, which has to call `sim.initialize()` and
`sim.start()` itself because `app.py`'s `__main__` block never runs. `-w 1` is a
correctness requirement, not a tuning choice: all state is in memory in one process, so a
second worker is a second, independent conveyor. `--preload` is likewise forbidden, since
the simulation thread does not survive gunicorn's fork.

The loop is CPU-bound and saturates roughly one core at 30 Hz whether or not a browser is
connected, which rules out serverless targets (Vercel, Lambda) entirely — see the
reasoning in `DEPLOYMENT.md`. `Dockerfile`, `.dockerignore` and `deploy/` (systemd unit
plus an env template) support the EC2 and container paths.

## Architecture

A single Flask process simulates an industrial waste conveyor: items spawn, ride a belt
past a sensor array, get classified SAFE/HAZARD, and are diverted. There is no database
and no build step — all state lives in memory, and the browser gets it over Socket.IO.

**The tick is the spine of the system.** `SimulationLoop._loop()`
(`server/simulation_loop.py`) runs at `TICK_RATE_HZ` (30) in a background thread and is
the only place the stages are wired together. Understanding it is most of understanding
the codebase:

1. `ItemSpawner.tick()` emits new `WasteItem`s by the probabilities in `config.ITEM_TYPE_PROBABILITIES`
2. `ConveyorMap.tick()` advances every item's `position_y` by `speed * dt`
3. `sensor_provider.get_sensor_streams()` renders this frame's raw signals — a depth
   frame, an NIR line, a scalar weight, an inductive strength
4. `InstanceSegmenter.process_frame()` runs OpenCV over the *depth frame* and returns
   `TrackedObject`s with stable track IDs
5. Each track accumulates readings while it sits over a sensor's y-position, then
   classifies once when it crosses `scan_zone_end`
6. `socketio.emit("state_update", state)` broadcasts belt state, throttled sensor
   imagery, and AI stats

**The AI pipeline sees only tracks, never items.** This separation is the point of the
design and the easiest thing to break. The physical `WasteItem` carries ground truth
(true mass, material, `is_hazard`); the `TrackedObject` carries only what the sensors
observed. `extract_features()` reads the track, so nothing downstream of segmentation
can cheat by looking at ground truth. The loop does match track to item afterwards — by
xy-proximity within 0.2 m — but only to actuate the diverter and to score accuracy.
Passing item properties into the feature path would silently make the classifier look
perfect while testing nothing.

**Features are latched maxima, not instantaneous reads.** A track collects `weights`,
`inductive_signals` and `nir_spectra` across several ticks and `extract_features()` takes
the max of each, because an object at a sensor's edge reads low. Dimensions are latched
the same way. Code that samples a sensor once per object will regress accuracy in ways
the smoke test will not catch.

**Two decision layers.** `DecisionEngine.decide()` runs the Random Forest, then applies
hard-coded failsafes that can override it: density above `DENSITY_HAZARD_THRESHOLD` with
low NIR C-H absorption, or metal detected above `MASS_HEAVY_THRESHOLD`. Below
`CONFIDENCE_THRESHOLD` a decision is flagged for review but not overridden. The failsafes
exist so a hedging model cannot pass a dense/metallic object; keep them ahead of the
model's output, not merged into it.

**The classifier trains at startup, from the same tables that generate the data.**
`SmartSegClassifier` (`ai_core/classifier.py`) generates 5,000 synthetic feature vectors
from `MATERIAL_TABLE` on `initialize()` — there is no dataset and no checkpoint on disk.
So `sensors/item_models.py` is the single source of truth for both the mock sensors and
the training data: edit a material's density or NIR absorption and you have changed the
classifier's world, not just the simulation's. Startup costs ~20s, which is why
`smoke_test.py` allows a 180s boot timeout.

`SimulationLoop._select_sensor_provider()` refuses to return a provider that cannot
drive the loop. `RealSensorProvider` is a hardware template with no `get_sensor_streams()`,
so `SENSOR_MODE=REAL` used to raise `AttributeError` thirty times a second forever — the
app served pages while nothing moved. It now falls back to MOCK with one explicit message,
and `active_sensor_mode` reports what is really in effect (including `HYBRID (no camera)`)
so the UI badge cannot claim hardware that is not there. Tick errors are throttled by
`_log_tick_error` for the same reason: a 30 Hz traceback fills a production disk.

**The real camera is independent of the simulation.** `_collect_camera_frames()` runs
outside the paused guard and outside `_generate_sensor_views()`, because the hardware keeps
streaming when the line is stopped. `state["camera"]` carries mode/ready/error every tick so
`/camera` can say whether it is showing live or synthetic frames — they look alike, and
falling back silently made a dead camera indistinguishable from a working one.

**Sensor providers are swappable behind one contract.** `SensorProvider`
(`sensors/sensor_interface.py`) defines it; `MockSensorProvider` implements it fully,
`HybridSensorProvider` subclasses the mock and overrides only camera capture, and
`RealSensorProvider` is an unimplemented template for hardware. `SimulationLoop.__init__`
picks one from `config.SENSOR_MODE`. Note that HYBRID still feeds the AI from mock data —
the real camera only drives the `/camera` view — so the pipeline behaves identically
regardless of hardware.

Noise is not decoration: `sensors/noise.py` models depth dead pixels, NIR photon shot
noise at 25 dB SNR, load-cell settling drift, and inductive false positives/negatives,
calibrated to the datasheets documented in `NTPC_Simul_Documentation.md`. The classifier
is trained against these distributions, so weakening them inflates accuracy.

### Frontend

Server-rendered Jinja templates plus plain ES5/ES6 scripts — no bundler, no framework,
no `npm install`. Libraries (Socket.IO, Chart.js, Three.js r128, Tailwind) come from CDN
`<script>` tags, so the pages need network access to render fully.

Seven pages: `/` (Overview), `/camera` (Vision Feed), `/sensors` (Sensor Suite), `/ntpc`
(Process Control), `/logs` (Audit Log), `/config` (read-only configuration viewer) and
`/knowledge` (reference: sensor-array diagrams, pipeline, material table).

The Overview was carrying eleven panels and is now deliberately just the belt: twin,
KPIs, Decision Feed, and the controls beside them. ToF depth and the 3D point cloud live
on `/camera`; the fusion vector and NIR panels on `/sensors`; Model Analytics on `/logs`.
`static/js/sensor_panels.js` (`window.SmartSegPanels`) owns the state_update → panel
dispatch so those panels behave identically wherever they are rendered — do not
reintroduce per-page copies of it. Every panel is optional; `SensorViews` no-ops on a
missing element. `/ntpc` is a parallel, standalone UI with its
own JS, not a variant of `/` — a change to the main dashboard usually needs mirroring
there, or deliberately not. Page scripts: `dashboard.js` (Overview), `camera.js` (`/camera`), `page_sensors.js`
(`/sensors`), `ntpc.js` (`/ntpc` and `/logs`). `static/js/ui_system.js` is the shared frontend runtime
(animated counters, sparklines, toasts, connection state) loaded by every page via
`templates/_shell.html`; page scripts call it through `window.SmartSegUI` with
feature-detection guards, so it degrades if absent.

The Socket.IO contract is small and worth preserving: server emits `initial_state`,
`state_update` and `item_spawned`; the client emits `spawn_item` and `update_config`.
`app.py` also handles `request_sensor_detail`, which no current client sends. Sensor
imagery inside `state_update` is base64 PNG throttled to 10 Hz while the loop itself runs
at 30 Hz.

`/api/analytics_plot` is the one route that renders server-side with pandas, seaborn and
matplotlib (Agg backend) and returns base64 PNG. It has already broken once from a
missing dependency, which is why the smoke test asserts on the PNG signature rather than
just the status code.

## Gotchas

- Most source files use CRLF line endings (the upstream author worked on Windows).
  `.github/workflows/ci.yml` and `scripts/smoke_test.py` are LF — keep them that way, as
  CRLF inside YAML `run:` blocks breaks bash on the runner.
- `requirements.txt` pins `opencv-python-headless`, not `opencv-python`. Same `cv2` API,
  but no libGL/GTK linkage — which is why CI needs no `libgl1` apt step. Switching back
  would break both CI and the Docker image.
- `extract.py` is not part of the application. It is a leftover developer utility with a
  hardcoded Windows path to another tool's transcript log. `fetched.html`,
  `templates/ntpc.html.bak` (empty) and `extract.log` are likewise inert artifacts.
- `app.py` serves via Werkzeug with `allow_unsafe_werkzeug=True` and
  `cors_allowed_origins="*"` — fine for a simulation, not a production posture.
