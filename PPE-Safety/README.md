# vikasgroup_visual_analytics_fullstack_beta

AI camera intelligence platform for Vikas Group manufacturing plants — turning existing plant
CCTV feeds into real-time, auditable safety and compliance events.

**Current stage:** Phase 1 — Proof of Concept.

## Documentation

| Document | Purpose |
| --- | --- |
| [`PROJECT_GOAL.md`](./PROJECT_GOAL.md) | Scope authority: demand register, Phase 1 commitments, success criteria, roadmap |
| [`ACTION_LIST.md`](./ACTION_LIST.md) | Developer build plan: tasks, dependencies, estimates, sprint schedule, risks |
| [`SETUP.md`](./SETUP.md) | How to run the prototype, what was changed on import, and what it actually does |

Start with `PROJECT_GOAL.md` for *what* and *why*, `ACTION_LIST.md` for *how* and *in what
order*, `SETUP.md` to get it running.

## Layout

```
backend/    FastAPI service — camera capture, YOLOv8 inference, restricted-area alerting
frontend/   React 19 + Vite + MUI dashboard — live view, zone drawing, events, settings
```

## Quick start

```bash
# Backend — http://127.0.0.1:8000
cd backend && python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt && uvicorn app.main:app --reload --port 8000

# Frontend — http://localhost:5173
cd frontend && npm install && npm run dev
```

Details, caveats, and platform notes in [`SETUP.md`](./SETUP.md).

## Status

The repository holds an imported single-camera prototype plus the Phase 1 planning documents.

The prototype implements **one** of the six detectors committed in `PROJECT_GOAL.md` §4 —
restricted-area intrusion. Helmet, vest, and gloves detection are **not present in the code**
despite being marked ✅ Completed in the demand register; door and window detection are empty
stub files. `SETUP.md` §4 gives the file-by-file comparison.

That finding resolves blocker **B1** in `ACTION_LIST.md` §1, and it moves the Phase 1 estimate:
the plan assumed four detectors were done and two remained. On the evidence in this repository,
five remain.
