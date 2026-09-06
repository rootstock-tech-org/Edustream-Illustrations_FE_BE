"""
Builds one API router per monitoring module.

Every module gets the same endpoint surface under its own prefix, so the
frontend can drive any module — present or future — through one client. A new
capability needs no routing code of its own.

    GET    /api/<module-id>/status     module identity and readiness
    GET    /api/<module-id>/results    latest analysis state
    GET    /api/<module-id>/stream     annotated MJPEG live view
    GET    /api/<module-id>/config     current configuration (if configurable)
    POST   /api/<module-id>/config     apply configuration (if configurable)

Config endpoints are only mounted for modules that report `is_configurable()`,
so an unconfigurable module returns 404 rather than a confusing 501.
"""

import asyncio
import math
import struct
import time
from typing import Any, Optional

import cv2
import numpy as np
from fastapi import (
    APIRouter,
    File,
    HTTPException,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.responses import StreamingResponse

from app.camera import camera_manager
from app.camera.browser_streams import browser_streams
from app.events import event_store
from app.camera.camera_manager import generate_frames
from app.modules.base import BaseMonitoringService
from app.vision.frame_clock import FrameClock

#: MJPEG content type used by every module's live view.
MJPEG_MEDIA_TYPE = "multipart/x-mixed-replace; boundary=frame"

#: Largest frame accepted, in bytes. A 640x480 JPEG is tens of kilobytes;
#: this is generous for 4K while refusing anything that could exhaust
#: memory on an endpoint that takes arbitrary bytes. Module scope, not a
#: local of the router builder: worker registration takes photos too, and
#: the third copy of these numbers is the one that drifts.
MAX_FRAME_BYTES = 8 * 1024 * 1024

#: Largest decoded frame, in pixels. Guards against a small, highly
#: compressed JPEG that expands to gigabytes once decoded.
MAX_FRAME_PIXELS = 16_000_000

#: Quality of the annotated frame sent back over the WebSocket.
#:
#: The return trip is the larger half of the exchange — an annotated 640px
#: frame is bigger than the compressed one that came up — so on a slow link
#: this number sets the frame rate more than the model does.
JPEG_QUALITY = 70

#: The optional header a browser prepends to each frame: magic, one version
#: byte, then the video element's own position as a big-endian float64 in
#: seconds. Binary rather than an interleaved JSON message because the
#: receive loop reads bytes and only bytes — a text frame would take the
#: socket down on every old server — and a JPEG always begins FF D8, so a
#: bare frame from an old client is unambiguous and takes the unchanged
#: path.
FRAME_ENVELOPE_MAGIC = b"VTS1"
FRAME_ENVELOPE_SIZE = 13


def split_frame_envelope(data: bytes) -> tuple[bytes, Optional[float]]:
    """The JPEG and, when the client sent one, the frame's own position."""
    if (
        len(data) >= FRAME_ENVELOPE_SIZE
        and data[:4] == FRAME_ENVELOPE_MAGIC
        and data[4] == 1
    ):
        (position,) = struct.unpack(">d", data[5:FRAME_ENVELOPE_SIZE])
        if not math.isfinite(position) or position < 0:
            return data[FRAME_ENVELOPE_SIZE:], None
        return data[FRAME_ENVELOPE_SIZE:], position
    return data, None


def _process_with_clock(session, clock, frame, frame_pos):
    """
    Feed the source's clock, then run the module — one thread hop.

    The clock reads the raw frame before analysis paints boxes that could
    land on the burned-in overlay, and the resolve happens against this
    exact frame's position, all off the event loop because OCR is as
    blocking as inference.
    """
    clock.observe_frame(frame, frame_pos)
    resolved = clock.resolve(frame_pos)

    # Handed to the module before it judges, not after: a verdict that
    # depends on the hour has to be reached against the hour the footage
    # says it is. None when this source has no readable clock, and the
    # module falls back to the system one.
    session.observed_clock = resolved

    annotated, result = session.process(frame)
    return annotated, result, resolved


def build_module_router(service: BaseMonitoringService) -> APIRouter:
    """
    Create the API router for one monitoring module.

    Args:
        service: the module to expose.

    Returns:
        A router prefixed with ``/api/<module_id>``, ready to include in the app.
    """
    router = APIRouter(
        prefix=f"/api/{service.module_id}",
        tags=[service.name or service.module_id],
    )

    @router.get("/status")
    def module_status() -> dict[str, Any]:
        """Module identity, readiness, and the camera feeding it."""
        return {
            "success": True,
            "data": {
                **service.get_status(),
                "camera": camera_manager.get_status(),
            },
        }

    @router.get("/results")
    def module_results() -> dict[str, Any]:
        """Latest analysis state. Safe to poll."""
        return {
            "success": True,
            "data": service.get_results(),
        }

    @router.get("/stream")
    def module_stream() -> StreamingResponse:
        """
        Annotated live view for this module.

        Frames come from the shared camera pipeline and are analysed by this
        module's service, so two modules can present different overlays of the
        same source.
        """
        return StreamingResponse(
            generate_frames(camera_manager, service=service),
            media_type=MJPEG_MEDIA_TYPE,
        )



    @router.websocket("/ws")
    async def module_socket(websocket: WebSocket, overlay: str = "image") -> None:
        """
        Analyse frames pushed from a browser.

        The MJPEG endpoints above serve frames the *server* captured, which
        cannot reach a camera attached to the operator's own machine. This
        inverts that: the browser captures with getUserMedia and pushes JPEG
        frames here, so the model can run on a GPU somewhere else entirely
        while the camera stays on the desk.

        Protocol, one exchange per frame:

            client -> JPEG bytes
            server -> annotated JPEG bytes
            server -> result JSON

        With ?overlay=json the annotated picture is not sent at all — only the
        findings, as fractions of the picture, for the browser to draw over its
        own camera. That is the difference between about a kilobyte and eighty
        on the return trip, and it lets the operator watch their camera at its
        own smooth frame rate instead of a slideshow of pictures that have been
        to the server and back. The `image` default is kept for any client that
        cannot draw its own.
        """
        await websocket.accept()

        # This socket is a camera: something on the other end is capturing
        # pictures and sending them here to be watched. Counted so the
        # dashboard's "cameras connected" includes it — the camera manager
        # only knows about the one camera the server captures itself.
        browser_streams.connected()

        # Its own copy of the module, so two browsers pushing different
        # cameras cannot see each other's tracked doors, counters or results.
        session = service.for_session()

        # And its own burned-in clock, for the same reason: two browsers
        # replaying different recordings must not share an anchor. The
        # operator's marked timestamp area is read at socket start, and the
        # clock is attached to the store so a mark saved while this socket
        # runs re-arms it on the spot — the operator watching the warning
        # is answered by this session, not the next one.
        from app.vision.timestamp_regions import timestamp_regions

        clock = FrameClock(
            source_key="browser", roi=timestamp_regions.get("browser")
        )
        timestamp_regions.attach("browser", clock)

        json_only = overlay == "json"

        # Whether this socket's clock has ever answered. The first answer
        # re-stamps the events the hunt seconds opened — a violation on
        # screen in frame one is on the recording's clock too, the reader
        # just had not confirmed it yet.
        clock_answered = False

        # The last camera-clock verdict pushed to the register, so the
        # register hears changes, never a verdict per frame.
        clock_reported = None

        try:
            while True:
                data = await websocket.receive_bytes()

                # A new client prepends the frame's own media position;
                # anything else — every old client — is a bare JPEG and
                # takes the path below byte for byte.
                data, frame_pos = split_frame_envelope(data)

                # Nothing at all. `cv2.imdecode` asserts on an empty buffer
                # rather than returning None, so this cannot be left to the
                # `frame is None` guard below — the assertion escapes to the
                # handler at the bottom and takes the socket down over a
                # single dropped frame.
                if not data:
                    await websocket.send_json(
                        {"error": "That frame was empty."}
                    )
                    continue

                if len(data) > MAX_FRAME_BYTES:
                    # Answer and keep the socket: a client sending one
                    # oversized frame should be told, not disconnected.
                    await websocket.send_json(
                        {"error": "That picture is too large to analyse."}
                    )
                    continue

                frame = cv2.imdecode(
                    np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR
                )

                if frame is None:
                    await websocket.send_json(
                        {"error": "Could not read that picture."}
                    )
                    continue

                if frame.shape[0] * frame.shape[1] > MAX_FRAME_PIXELS:
                    await websocket.send_json(
                        {"error": "That picture is too large to analyse."}
                    )
                    continue

                # Inference is blocking and CPU/GPU-bound. Off the event loop,
                # or it stalls every other request on the server for the
                # duration of each frame.
                started = time.perf_counter()

                annotated, result, resolved = await asyncio.to_thread(
                    _process_with_clock, session, clock, frame, frame_pos
                )

                if resolved is not None and not clock_answered:
                    clock_answered = True
                    event_store.restamp_open(service.module_id, resolved)

                # The camera-clock verdict, for the event record, the reply
                # this browser paints its badge from, and — on change only —
                # the register of whichever camera is feeding analysis.
                clock_verdict = clock.clock_status()
                if clock_verdict != clock_reported:
                    clock_reported = clock_verdict
                    from app.camera.registry import camera_registry

                    camera_registry.report_clock(
                        camera_registry.active_camera_id(),
                        clock_verdict,
                        last_read=clock.status().get("last_read"),
                    )

                # Recorded from here as well as from the server-captured
                # stream, so a walkthrough done with a phone leaves the same
                # history as one watched from a plant camera.
                #
                # Deduplication is keyed on the module and the problem, not on
                # the session, so two browsers watching the same scene write
                # one history rather than two. The flip side is that two
                # browsers watching *different* scenes through one module
                # share that key space — fine for a single control room, and
                # the thing to revisit when cameras become first-class.
                event_store.observe(
                    service.module_id, session.events(result), annotated,
                    resolved=resolved, clock_status=clock_verdict,
                )

                sent_bytes = 0

                if not json_only:
                    ok, buffer = cv2.imencode(
                        ".jpg",
                        annotated,
                        [int(cv2.IMWRITE_JPEG_QUALITY), JPEG_QUALITY],
                    )

                    if not ok:
                        await websocket.send_json(
                            {"error": "Could not prepare the annotated picture."}
                        )
                        continue

                    sent_bytes = len(buffer)

                # Reported so the client can separate its own round trip from
                # the time actually spent analysing. Without it a slow link and
                # a slow model look identical, and the wrong one gets blamed.
                server_ms = round((time.perf_counter() - started) * 1000, 1)

                if not json_only:
                    await websocket.send_bytes(buffer.tobytes())

                await websocket.send_json(
                    {
                        **result,
                        "server_ms": server_ms,
                        "bytes": sent_bytes,
                        # The source's clock verdict, so the page can badge
                        # the camera card without another request.
                        "camera_clock": clock_verdict,
                    }
                )

        except WebSocketDisconnect:
            pass
        except Exception as exc:  # noqa: BLE001
            # One bad frame must not take the socket down silently; tell the
            # client why before closing so the UI can say something useful.
            try:
                await websocket.send_json({"error": str(exc)})
                await websocket.close()
            except Exception:  # noqa: BLE001
                pass
        finally:
            # However the socket ends — clean disconnect, error, or the
            # server shutting down — the camera it represented is gone,
            # and so is its clock.
            timestamp_regions.detach("browser", clock)
            browser_streams.disconnected()

    @router.post("/photo")
    async def analyse_photo(file: UploadFile = File(...)) -> dict[str, Any]:
        """
        Check a single photo.

        The same analysis as a live frame, run once. For the times the
        question is about a picture rather than a feed: a photo from the
        floor, a frame saved from another system, an incident email.

        The finding is recorded in the event history like anything seen
        live, evidence attached — a violation is a violation regardless of
        how its picture arrived.
        """
        data = await file.read()

        # An empty upload — a zero-byte file, or a form field with no file
        # behind it. `cv2.imdecode` asserts on an empty buffer instead of
        # returning None, so the `frame is None` guard below is never
        # reached and the operator gets a plain-text 500 where every other
        # bad picture gets a sentence explaining itself.
        if not data:
            raise HTTPException(
                status_code=400,
                detail="That file is empty. Use a JPEG or PNG image.",
            )

        if len(data) > MAX_FRAME_BYTES:
            raise HTTPException(
                status_code=413, detail="That picture is too large to analyse."
            )

        frame = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)

        if frame is None:
            raise HTTPException(
                status_code=400,
                detail="Could not read that picture. Use a JPEG or PNG image.",
            )

        if frame.shape[0] * frame.shape[1] > MAX_FRAME_PIXELS:
            raise HTTPException(
                status_code=413, detail="That picture is too large to analyse."
            )

        # A detached copy: per-frame state must not leak into whatever is
        # being watched live, and — unlike a session — a single still must
        # not mark the module as "watching" or put its headcount on the
        # dashboard. One photo is a question, not a feed.
        checker = service.for_session()
        checker._origin = None

        # One still, judged on what it shows: nothing can be confirmed
        # across frames that do not exist.
        checker.single_frame = True

        # A still has no video clock to extrapolate through, so its burned
        # timestamp — when it has one — is read in a single pass, before
        # analysis can paint over the overlay. No engine, no burned text:
        # the photo is stamped by the system clock, as photos always were.
        resolved = await asyncio.to_thread(FrameClock.read_still, frame)

        # A photograph carries its own moment too, when the clock is burned
        # into it — so a still lifted from last night's recording is judged
        # against last night.
        checker.observed_clock = resolved

        annotated, result = await asyncio.to_thread(checker.process, frame)

        # One photograph can prove a clock is there; it cannot prove one is
        # absent — that verdict needs the live check window. A read still
        # says valid; no read says unknown, never unavailable.
        event_store.observe(
            service.module_id, checker.events(result), annotated,
            resolved=resolved,
            clock_status="valid" if resolved is not None else "unknown",
        )

        return {"success": True, "data": result}

    if service.is_configurable():

        @router.get("/config")
        def get_module_config() -> dict[str, Any]:
            """Current configuration for this module."""
            return {
                "success": True,
                "data": service.get_config(),
            }

        @router.post("/config")
        def set_module_config(payload: dict[str, Any]) -> dict[str, Any]:
            """
            Apply configuration.

            The body shape is defined by the module; the restricted zone takes
            ``{"polygon": [{"x": ..., "y": ...}, ...]}``.
            """
            try:
                result = service.configure(payload)
            except NotImplementedError as exc:
                raise HTTPException(status_code=404, detail=str(exc)) from exc
            except (KeyError, TypeError, ValueError) as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
            except Exception as exc:  # noqa: BLE001
                # Anything else is a genuine server fault — but "Internal
                # Server Error" alone turns a fixable problem into a dead
                # button. Name the fault so the screen can.
                raise HTTPException(
                    status_code=500,
                    detail=f"Saving failed on the server: {exc}",
                ) from exc

            return {"success": True, "data": result}

    # A module that needs endpoints beyond this shared surface — the face
    # module's registration uploads, for instance — mounts them itself.
    install = getattr(service, "install_routes", None)

    if callable(install):
        install(router)

    return router


def build_catalog_router(services: list[BaseMonitoringService]) -> APIRouter:
    """
    Router listing every registered module.

    The frontend uses this to discover which capabilities the backend actually
    has, so a module can be disabled server-side without a frontend change.
    """
    router = APIRouter(prefix="/api/modules", tags=["Modules"])

    @router.get("")
    def list_modules() -> dict[str, Any]:
        """All monitoring modules available on this deployment."""
        return {
            "success": True,
            "data": [service.get_status() for service in services],
        }

    return router
