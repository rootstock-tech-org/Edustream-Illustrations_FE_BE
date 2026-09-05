# Deploying SMART-SEG

## Why this can't go on Vercel

Not "harder" — architecturally impossible. Four independent blockers, any one of
which is fatal:

1. **The 30 Hz background thread is the app.** `SimulationLoop._loop()` runs
   continuously, spawning items, moving the belt, segmenting and classifying.
   Vercel Serverless Functions live only for the duration of a request; nothing
   keeps the belt moving between them.
2. **All state is in memory.** There is no database, by design. Every invocation
   would get a fresh, empty conveyor.
3. **WebSockets.** The dashboard is Socket.IO end to end. Vercel's serverless
   functions do not host long-lived WebSocket server connections.
4. **Bundle size.** The dependency tree measures ~387 MB on disk (scipy 112,
   opencv 75, pandas 72, sklearn 48, numpy 43, matplotlib 35). Vercel's Python
   functions run on Lambda, whose unzipped bundle limit is 250 MB.

The same reasoning rules out AWS Lambda and API Gateway. This app needs a
process that stays up.

## Measured resource profile

Taken from a running instance, not estimated:

| | |
| --- | --- |
| Cold boot to first HTTP 200 | ~8 s (classifier trains 5,000 vectors at startup) |
| Steady resident memory | ~290 MB |
| CPU at `TICK_RATE_HZ=30` | ~103% of one core, sustained |
| CPU at `TICK_RATE_HZ=15` | ~82% of one core |
| Threads | ~17 |
| Dependencies on disk | ~387 MB (the repo itself is under 1 MB) |

**The CPU figure drives instance choice.** The loop saturates a core whether or
not a browser is connected.

That makes burstable instances a trap: `t3`/`t4g` baseline is a fraction of a
core, so sustained 100% drains CPU credits within hours and then throttles hard —
the simulation visibly slows. Either use a non-burstable instance, enable
`unlimited` mode and accept the surcharge, or lower `SMARTSEG_TICK_RATE_HZ`.

Note that lowering the tick rate buys less than it looks: sensor imagery renders
on its own 10 Hz timer and does not scale with it.

## Choosing a target

| Option | Verdict |
| --- | --- |
| **EC2** | **Best fit.** One always-on process, matching the architecture exactly. `c6i.large` / `m6i.large` (2 vCPU, 4–8 GB), non-burstable. |
| **App Runner** | Good if you want managed HTTPS and no instance to patch. Needs the Dockerfile, and **min = max = 1**. |
| **ECS Fargate + ALB** | Same shape as App Runner with more control. Desired count 1, sticky sessions on the ALB. |
| **Elastic Beanstalk** | Works, but it is EC2 with extra indirection. |
| **Lambda / Vercel** | Will not run. See above. |

### The single-instance constraint

All state is in memory in one process, so **every deployment is pinned to one
worker and one instance**. Two workers means two independent conveyors, and
clients get load-balanced between two different realities.

This also means every viewer shares *one* simulation — fine for a control-room
display or a demo, wrong if you expected per-visitor sessions. Scale by giving
the single worker a faster core, not by adding workers.

## Configuration

| Variable | Default | Notes |
| --- | --- | --- |
| `SMARTSEG_SECRET_KEY` | `dev-only-insecure-key` | **Set this.** Signs Flask sessions and Socket.IO payloads. `openssl rand -hex 32` |
| `SMARTSEG_CORS_ORIGINS` | `*` | **Set this.** Origins allowed to open a Socket.IO connection; comma-separated for several. Left as `*`, any site can drive your controls. |
| `SMARTSEG_SENSOR_MODE` | `MOCK` | Keep `MOCK` — `HYBRID`/`REAL` need a RealSense camera on the machine. |
| `SMARTSEG_PORT` / `PORT` | `5000` | `PORT` is read too, for platforms that inject it. |
| `SMARTSEG_HOST` | `0.0.0.0` | |
| `SMARTSEG_TICK_RATE_HZ` | `30` | Lower on a small instance. |
| `SMARTSEG_EMIT_RATE_HZ` | `30` | |

## Running it

`app.py` starts the Werkzeug development server and is for local use only —
it sets `allow_unsafe_werkzeug=True`. Deployments run `wsgi.py` under gunicorn:

```bash
gunicorn -k gthread -w 1 --threads 12 --timeout 120 -b 0.0.0.0:5000 wsgi:application
```

- **`-w 1` is mandatory**, for the reason above.
- `--threads` sets roughly how many dashboards can be open at once. The
  simulation has its own thread regardless.
- `--timeout 120` leaves margin over the ~8 s startup training on a throttled
  instance; the 30 s default is tight.
- **Never add `--preload`.** It imports in the master and then forks, and the
  simulation thread does not survive the fork — you get a belt that never moves.

This serves a real WebSocket transport, not a long-polling fallback:
`simple-websocket` arrives transitively via `python-engineio`.

## EC2

```bash
sudo useradd --system --create-home --home-dir /opt/smartseg smartseg
sudo git clone <repo-url> /opt/smartseg && cd /opt/smartseg
sudo python3 -m venv .venv && sudo .venv/bin/pip install -r requirements.txt
sudo chown -R smartseg:smartseg /opt/smartseg

sudo cp deploy/smartseg.env /etc/smartseg.env
sudo chown root:root /etc/smartseg.env && sudo chmod 0640 /etc/smartseg.env
sudoedit /etc/smartseg.env          # set SECRET_KEY and CORS_ORIGINS

sudo cp deploy/smartseg.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now smartseg
sudo systemctl status smartseg
```

The unit binds gunicorn to `127.0.0.1:5000`, so put TLS in front of it — an ALB
with an ACM certificate, or nginx/Caddy with Let's Encrypt on the box. Socket.IO
then runs over `wss://`. Only 443 needs to be open in the security group.

## Containers (App Runner / ECS / anywhere)

```bash
docker build -t smartseg .
docker run -p 5000:5000 \
  -e SMARTSEG_SECRET_KEY="$(openssl rand -hex 32)" \
  -e SMARTSEG_CORS_ORIGINS="https://smartseg.example.com" \
  smartseg
```

The image is `python:3.12-slim`, runs as a non-root user, and carries a
healthcheck against `/api/stats` with a 60 s start period for the training step.
No apt packages are needed — `requirements.txt` pins `opencv-python-headless`,
which does not link against libGL.

On **App Runner**: set min and max instances to 1, health check path
`/api/stats`, and allow a generous startup timeout for the ~8 s training.

On **ECS**: desired count 1, and enable ALB stickiness so a client's polling and
WebSocket requests reach the same task.

## Sensor mode

`SMARTSEG_SENSOR_MODE=REAL` selects a hardware template that does not implement the
pipeline contract. Rather than serving a dead simulation, the app detects this at startup,
logs one explicit line and falls back to `MOCK`. `HYBRID` without `pyrealsense2` or without
a camera attached also degrades to mock sensors — only the `/camera` live feed is lost, and
that page says so rather than silently showing synthetic frames.

In short: no sensor-mode value can produce a broken deployment. `MOCK` is still the only
mode that needs nothing installed.

## Frontend assets come from CDNs

Tailwind, the Socket.IO client, Chart.js, Three.js and Google Fonts all load from
CDNs via `<script>`/`<link>` tags in `templates/_shell.html`. The pages need
outbound HTTPS from the **browser**, not from the server — a private VPC does not
break them, but a client on a restricted network will see an unstyled page.

If you need the dashboard to work fully offline, those five libraries have to be
vendored into `static/` and the tags repointed. That is a frontend change, not a
deployment setting, and it is not done here.

## Pre-flight checklist

- [ ] `SMARTSEG_SECRET_KEY` set to a random value
- [ ] `SMARTSEG_CORS_ORIGINS` set to your real origin
- [ ] Non-burstable instance, or tick rate lowered, or `unlimited` mode on
- [ ] Exactly one worker and one instance
- [ ] TLS terminating in front; app not directly exposed
- [ ] `python scripts/smoke_test.py --server gunicorn` passes on the box
