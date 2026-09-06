# Running the platform

The backend serves the built dashboard itself, so the whole product runs on
**one port and one origin**. That is what makes it work behind a tunnel, on a
plant server, or on a laptop without changing a line of configuration — there
is no CORS to negotiate and no second address to keep in step.

---

## On Colab

Two notebooks, two different jobs — pick the one you actually want.

- [`colab_run.ipynb`](./colab_run.ipynb) — the real **operator dashboard**,
  backed by the real YOLOv8/InsightFace models, with the AI Safety Lab in it
  under *Training → Lab*. The whole product in one place. Needs a GPU.
- [`colab_run_lab.ipynb`](./colab_run_lab.ipynb) — the **AI Safety Lab** on
  its own (`lab/`), the same simulation the dashboard carries, run without it:
  a single Virtual Factory page that teaches the real
  detection pipeline — camera, detection, rules, confirmation, decision — on
  a floor you can interact with, with no backend behind it at all. No GPU, no
  models, no API key — it builds a static site and serves it, done in a
  minute or two.

Open either in Google Colab and run the cells in order.

The repository is private, so the clone needs a **fine-grained GitHub token**
with *Contents: Read-only* on this repository alone. The notebook reads it with
`getpass` and passes it to git through a credential helper, so it is never
written into the notebook and never stored in `.git/config`.

Note the two different kinds of access. Whoever *runs* the Colab needs that
token. Anyone you then send the URL to needs nothing at all — they just open
the link.

### The dashboard notebook

Roughly 3–5 minutes the first time. It clones the repo, installs what Colab
is missing, builds the dashboard, starts the server, and gives you a URL to
open.

**Set the runtime to a GPU first** — Runtime → Change runtime type → T4.
Everything works on CPU, just slowly.

### Two ways to reach it

| | |
|---|---|
| **Colab's port proxy** | Built in, no account, no external service. Works in the browser session you are signed into. Try this first. |
| **cloudflared** | A temporary public URL, so you can open it on a phone or send it to someone. No account needed. Dies with the session. |

### Using your own webcam

Colab has no camera, but your browser does. On any monitoring page choose
**This device** and press Start watching: the browser captures from your
webcam, pushes frames to Colab, the GPU analyses them, and the annotated
picture comes back. The camera never leaves your machine.

This needs an `https` address — browsers refuse camera access over plain http.
Both routes above are https, so either works.

Expect 5–15 pictures a second, limited by your upload speed and the round trip
rather than by the GPU.

### What Colab still cannot do

- **Reach a camera on your plant LAN.** An IP camera has to be reachable from
  the public internet, or the backend has to run inside the plant network.
- **Keep anything.** Colab wipes the machine when it disconnects, including any
  zone you drew and any snapshot taken.

### The lab notebook

No GPU section for this one — `colab_run_lab.ipynb` clones the repo, builds
`lab/` with `npm`, and serves the static output with Python's own
`http.server`. The webcam section and the limits above are about the real
models behind the dashboard; the lab makes no network call at all, so none of
that applies to it. Its own last cell lists what to try and what it
deliberately doesn't do.

---

## Locally, one port

Same as production: build the dashboard, let the backend serve it.

```bash
cd frontend && npm install && npm run build
cd ../backend && python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Open <http://localhost:8000>.

If `frontend/dist` is missing the backend still runs as an API — `/` returns a
503 telling you to build, and `/docs` works as normal.

## Developing against a remote GPU

The most useful setup while working on the UI: dashboard on your machine with
hot reload, model on the GPU box.

```bash
cd frontend && npm install
VITE_BACKEND_ORIGIN=https://<tunnel-or-server> npm run dev
```

Open <http://localhost:5173>. Vite proxies both the API and the camera
WebSocket to the backend, so the GPU does the work while the UI reloads the
moment you save. `localhost` counts as a secure context, so the browser camera
works there too.

On the backend side, run uvicorn with `--reload --reload-dir app` and it
restarts itself whenever the code changes.

## Locally, for development

Two processes, with hot reload:

```bash
# terminal 1
cd backend && uvicorn app.main:app --reload --port 8000

# terminal 2
cd frontend && npm run dev
```

Open <http://localhost:5173>. Vite proxies the API paths to port 8000, so
requests are same-origin in development exactly as they are in production —
there is no CORS difference between the two environments to trip over later.

Point the proxy elsewhere with `VITE_BACKEND_ORIGIN=http://other-host:8000`.

---

## Models

The trained weights live in `backend/models/` and are committed:

| File | Classes |
| --- | --- |
| `ppe.pt` | person, helmet, vest |
| `gloves.pt` | person, hand_glove, hand_noglove |
| `door.pt` | closed, open |

A module whose weights are missing reports itself as unavailable rather than
failing — the rest of the platform keeps working. Restricted-zone detection
uses stock YOLOv8n-seg, downloaded on first run.

---

## Known limits

- **Photo input is disabled.** `cv2.VideoCapture` opens a still image but cannot
  seek back to frame 0, so the capture loop would spin without producing
  another frame. Still-image support needs a separate source path.
- **Nothing is recorded.** Every page shows live state. The history and report
  panels say so rather than showing an empty table that implies nothing has
  happened. The event store is the next piece of work.
- **One server-side camera at a time.** That capture pipeline is a single global
  camera, so modules share whatever it is pointed at, and reporting cannot break
  down by area yet. The browser-camera path is different: each connection gets
  its own copy of the module, so several people can push their own cameras at
  the same module without mixing results. They still share the module's
  *configuration* — a zone, or a door's allowed open time — since that is a
  deliberate site-wide setting rather than per-viewer state.
- **Doors are not designatable.** Every door-like object in view is watched and
  timed, including glass partitions and doorways meant to stay open.
