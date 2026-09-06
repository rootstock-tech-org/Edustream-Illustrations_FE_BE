from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.routing import APIWebSocketRoute
from fastapi.staticfiles import StaticFiles

from app.api.routes import router as system_router
from app.api.camera_routes import router as camera_router
from app.camera import camera_manager
from app.camera.browser_streams import feeding_module
from app.core.config import create_storage_dirs
from app.api.restricted_area_routes import router as restricted_area_router
from app.api.event_routes import router as event_router
from app.api.camera_registry_routes import router as camera_registry_router
from app.api.timestamp_routes import router as timestamp_router
from app.api.worker_routes import router as worker_router, portal_router
from app.api.tutor_routes import router as tutor_router

# Importing app.modules registers every monitoring module.
from app.modules import registry
from app.modules.router_factory import build_catalog_router, build_module_router

app = FastAPI(
    title="Factory Safety API",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    create_storage_dirs()

@app.on_event("shutdown")
async def shutdown_event():
    camera_manager.stop()


# --------------------------------------------------------------------
# System and camera, mounted twice.
#
# /api/system/* and /api/camera/* are canonical: every other router on this
# app lives under /api, and the notes and the documentation have always
# described these as if they did too. They did not — the real paths had no
# prefix at all, so a documented URL fell through to the dashboard's
# catch-all and answered 200 with a page of HTML, which reads as a working
# endpoint returning nonsense rather than as the wrong address.
#
# The unprefixed paths are what the frontend calls today and keep working;
# they are simply no longer the ones on offer. Only the /api pair is listed
# in /docs, so the reference describes one set of URLs rather than two.
# --------------------------------------------------------------------

app.include_router(system_router, include_in_schema=False)
app.include_router(camera_router, include_in_schema=False)

app.include_router(system_router, prefix="/api")
app.include_router(camera_router, prefix="/api")

app.include_router(restricted_area_router)
app.include_router(event_router)
app.include_router(camera_registry_router, prefix="/api")
app.include_router(timestamp_router)
app.include_router(worker_router, prefix="/api")
app.include_router(portal_router, prefix="/api")

# The AI Safety Lab's tutor chat. No monitoring module of its own — mounted
# here beside the other top-level routers rather than in the loop below.
app.include_router(tutor_router)

# --------------------------------------------------------------------
# Monitoring modules. One router per registered module, mounted at
# /api/<module-id>, plus the catalog at /api/modules.
# --------------------------------------------------------------------

app.include_router(build_catalog_router(registry.list_services()))

for monitoring_service in registry.list_services():
    mounted_from = len(app.routes)

    app.include_router(build_module_router(monitoring_service))

    # A browser pushing frames over this module's socket is a camera, and the
    # handler counts itself as one — but anonymously, so when the socket
    # ended nothing knew whose events had just lost their camera and they
    # stayed open for ever. Naming the module here, at the route it was
    # mounted from, rather than by matching the path later: the route belongs
    # to this module by construction, whereas a path pattern would have to be
    # kept in step with whatever the factory decides to mount.
    for route in app.routes[mounted_from:]:
        if isinstance(route, APIWebSocketRoute):
            route.app = feeding_module(route.app, monitoring_service.module_id)


# --------------------------------------------------------------------
# The AI Safety Lab.
#
# A second, separate single-page app, built independently in lab/ with its
# own base path (base: "/lab/" in lab/vite.config.js — every asset URL in
# its built index.html already carries that prefix) so it can be mounted
# beside the dashboard without either shadowing the other. Same reasoning
# as the dashboard below: one port, one origin, nothing to reconfigure
# behind a tunnel — and the lab's own Real AI mode needs exactly that, since
# it calls the same /api routes this file already serves.
#
# Registered before the dashboard's catch-all so a request under /lab/ is
# claimed here first; Starlette matches routes in the order they were
# added, not by specificity, so this block has to come first to matter at
# all. The dashboard's own catch-all still wins everywhere else.
# --------------------------------------------------------------------

LAB_DIST_DIR = Path(__file__).resolve().parents[2] / "lab" / "dist"

if (LAB_DIST_DIR / "index.html").exists():

    app.mount(
        "/lab/assets",
        StaticFiles(directory=LAB_DIST_DIR / "assets"),
        name="lab-assets",
    )

    @app.get("/lab/{full_path:path}", include_in_schema=False)
    def lab(full_path: str):
        """
        Serve the lab, falling back to index.html.

        The lab routes client-side too (basename="/lab" in its own router),
        so a deep link like /lab/experiments/gear-bar has no file behind it
        and must return the lab's shell rather than a 404.
        """
        candidate = (LAB_DIST_DIR / full_path).resolve()

        if (
            full_path
            and candidate.is_file()
            and candidate.is_relative_to(LAB_DIST_DIR)
        ):
            return FileResponse(candidate)

        return FileResponse(LAB_DIST_DIR / "index.html")


# --------------------------------------------------------------------
# Built dashboard.
#
# When frontend/dist exists it is served from here, so the whole product
# runs on one port and one origin: no CORS, no second server, and nothing
# to reconfigure when the address changes — which is what makes it work
# behind a tunnel, where the hostname differs every session.
#
# Registered last so every API route above takes precedence; only paths
# that match nothing else fall through to the dashboard.
# --------------------------------------------------------------------

DIST_DIR = Path(__file__).resolve().parents[2] / "frontend" / "dist"

if (DIST_DIR / "index.html").exists():

    app.mount(
        "/assets",
        StaticFiles(directory=DIST_DIR / "assets"),
        name="dashboard-assets",
    )

    # Registered before the dashboard's catch-all and after every real
    # router, so genuine endpoints still win and only unclaimed API paths
    # arrive here. It answers every method, because the GET-only catch-all
    # below turned a POST to a non-existent endpoint into 405 Method Not
    # Allowed — Starlette's answer when a path exists for another verb —
    # which points an integrator at the verb when the path is what is wrong.
    @app.api_route(
        "/{prefix:path}",
        methods=["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
        include_in_schema=False,
    )
    def unknown_endpoint(prefix: str):
        raise HTTPException(status_code=404, detail="No such endpoint.")

    @app.get("/{full_path:path}", include_in_schema=False)
    def dashboard(full_path: str):
        """
        Serve the dashboard, falling back to index.html.

        The dashboard routes client-side, so a deep link like
        /monitoring/ppe has no file behind it and must return the app
        shell rather than a 404.
        """
        # An unrecognised API path is a wrong path, not a deep link into the
        # dashboard. Handing it the app shell made a mistyped endpoint answer
        # 200 with a page of HTML, and made a POST to one answer 405 — because
        # only GET reaches here — which reads as "wrong method" when the truth
        # is "no such endpoint". Both sent an integrator looking in the wrong
        # place.
        if full_path.startswith(("api/", "system/", "camera/")):
            raise HTTPException(status_code=404, detail="No such endpoint.")

        candidate = (DIST_DIR / full_path).resolve()

        # Only serve real files that are genuinely inside dist — a path
        # like ../../etc/passwd must not escape it.
        if (
            full_path
            and candidate.is_file()
            and candidate.is_relative_to(DIST_DIR)
        ):
            return FileResponse(candidate)

        return FileResponse(DIST_DIR / "index.html")

else:

    @app.get("/", include_in_schema=False)
    def dashboard_missing():
        """API-only mode: the dashboard has not been built."""
        raise HTTPException(
            status_code=503,
            detail=(
                "The dashboard has not been built. Run "
                "`npm install && npm run build` in frontend/, then restart. "
                "The API itself is available — see /docs."
            ),
        )