# MSW Dashboard — Vercel demo

Public demo build of the MSW Segmentor dashboard. Ships the UI and a Flask
backend as a single Python serverless function. **No model weights.**

## What is and isn't real

| Piece | Status |
|---|---|
| Dashboard UI, SCADA panels, gauges, robot arm, alarms | **Real** — all client-side JS in `dashboard.html` |
| `/api/analyze` — Groq `llama-3.3-70b-versatile` characterisation | **Real** LLM call |
| `/api/detect` — bounding boxes | **Simulated** (`DEMO_MODE`) |

Detection is simulated because `ultralytics` + `torch` are ~800 MB installed and
a Vercel function is capped at 250 MB unzipped. Shipping the 23 MB `.pt` would
not help — the runtime is the blocker, not the weights.

The simulation is not a static picture. It reads the visitor's actual upload,
draws ultralytics-style boxes on it, and seeds its RNG from a SHA-256 of the
image bytes, so a given image always produces the same detections. The `conf`
and `iou` sliders apply a genuine confidence gate and NMS pass to the results.
`/api/status` advertises the same 5 classes as the real checkpoint
(`Cloth, Coconut, Slipper, Stone, shoe`), so the "5/16 target classes ready"
coverage banner reads exactly as it does in production.

Set `DEMO_MODE=0` to disable it — `/api/detect` then returns 503 and the
dashboard greys out the upload button, same as a real backend with no weights.

## Deploy

```bash
# 1. Rotate the Groq key first — the old one was committed in plaintext.
#    https://console.groq.com/keys

# 2. From this directory:
npm i -g vercel
vercel login
vercel                      # preview deploy, links/creates the project

# 3. Add the key (repeat for preview + development if you want them working):
vercel env add GROQ_API_KEY production

# 4. Ship it:
vercel --prod
```

Deploying from GitHub instead? Push the repo, import it in Vercel, set
**Root Directory** to `vercel-demo`, and add `GROQ_API_KEY` under
Settings → Environment Variables.

## Run locally

```bash
cp .env.example .env        # paste your rotated key
python3 -m venv venv && ./venv/bin/pip install -r requirements.txt
./venv/bin/python api/index.py     # http://localhost:5050
```

## Files

```
api/index.py      Flask app — /, /api/status, /api/detect, /api/analyze
dashboard.html    UI, verbatim copy from the parent project
vercel.json       routes everything to the function, bundles dashboard.html
requirements.txt  flask, requests, markdown, pillow, python-dotenv
```

`app.py` from the parent project is a PySide6 **desktop** app and is
deliberately excluded — it cannot run on serverless.

## Secrets

`.env` is gitignored. Never hardcode the key; `api/index.py` reads
`GROQ_API_KEY` from the environment and returns a 500 with a clear message if
it is missing.
