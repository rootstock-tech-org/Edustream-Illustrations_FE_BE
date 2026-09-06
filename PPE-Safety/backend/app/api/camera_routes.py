from pathlib import Path
import shutil

import cv2
from fastapi import APIRouter, HTTPException, Response, UploadFile, File
from fastapi.responses import FileResponse, StreamingResponse

from app.camera import camera_manager
from app.camera.camera_manager import generate_frames
from app.schemas.camera import CameraSource
from app.core.config import UPLOADS_DIR


def _camera_changed():
    """
    Tell every module the picture is now a different one.

    A drawn area, a door's open timer and the latest figures all describe the
    camera they were captured from. Imported here rather than at module scope
    because app.modules imports the camera package.
    """
    try:
        from app.modules import registry

        registry.reset_all()
    except Exception as exc:  # noqa: BLE001
        print(f"[camera] modules failed to reset: {exc}")

    try:
        from app.events import event_store

        # Whatever was going on belonged to the old scene. Left open, the new
        # camera's first frame would be recorded as a continuation of it —
        # one event spanning two different places.
        event_store.forget_open()
    except Exception as exc:  # noqa: BLE001
        print(f"[camera] events failed to reset: {exc}")

router = APIRouter(
    prefix="/camera",
    tags=["Camera"],
)

#: Resolved from the package root rather than the working directory.
#:
#: This was `Path("storage/...")`, which is relative to wherever the process
#: happened to start. Everything documented starts uvicorn from backend/, so it
#: landed in backend/storage and looked correct — but a server started from the
#: repository root read and wrote a second, empty store beside the first, and
#: an operator's marked regions were simply not there. app/core/config.py had
#: already solved this for the model weights, for the same reason.
UPLOAD_DIR = UPLOADS_DIR
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@router.get("/status")
def camera_status():
    """
    Returns the current camera status.
    """
    return {
        "success": True,
        "data": camera_manager.get_status(),
    }


@router.post("/start")
def start_camera():
    """
    Starts the camera.

    Resumes whichever source was last selected. Previously this always started
    device 0, so pressing Start after choosing a video file or an IP camera
    silently switched back to the built-in webcam. With no source ever chosen
    it still falls back to device 0, as before.
    """

    if camera_manager.running:
        return {
            "success": True,
            "message": "Camera already running",
        }

    source = (
        camera_manager.last_source
        if camera_manager.last_source is not None
        else 0
    )

    started = camera_manager.start(source)

    if not started:
        raise HTTPException(
            status_code=500,
            detail="Unable to start camera",
        )

    return {
        "success": True,
        "message": "Camera started",
    }


@router.post("/stop")
def stop_camera():
    """
    Stops the camera.
    """

    camera_manager.stop()

    try:
        from app.camera.registry import camera_registry

        camera_registry.clear_context()
    except Exception:  # noqa: BLE001
        pass

    return {
        "success": True,
        "message": "Camera stopped",
    }


@router.get("/stream")
def camera_stream():
    """
    Live MJPEG stream.
    """

    return StreamingResponse(
        generate_frames(camera_manager),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


@router.post("/snapshot")
def take_snapshot():

    snapshot = camera_manager.save_snapshot()

    if snapshot is None:
        raise HTTPException(
            status_code=400,
            detail="No frame available"
        )

    return {
        "success": True,
        "data": snapshot
    }


# ---------------------------------------------------------
# NEW: Freeze current frame for Restricted Area drawing
# ---------------------------------------------------------

@router.get("/freeze-frame")
def freeze_frame():
    """
    The current frame, for drawing an area over.

    Encoded in memory rather than written to disk. It used to go through
    save_snapshot(), so every click of "Mark area" left a file in the
    snapshots folder — evidence of nothing, mixed in with real snapshots.
    """

    frame = camera_manager.get_frame()

    if frame is None:
        raise HTTPException(
            status_code=400,
            detail="No picture available."
        )

    ok, buffer = cv2.imencode(".jpg", frame)

    if not ok:
        raise HTTPException(
            status_code=500,
            detail="Could not prepare the picture."
        )

    return Response(
        content=buffer.tobytes(),
        media_type="image/jpeg",
        # The picture must reflect the camera right now, not a cached one.
        headers={"Cache-Control": "no-store"},
    )


@router.post("/upload")
async def upload_video(file: UploadFile = File(...)):
    """
    Store a recording for review.

    Deliberately does not start the server-side capture. It used to, because
    the only way to look at a recording was to have the server decode it,
    annotate every frame and stream the result back as JPEG — a round trip
    that made the picture arrive seconds late over any real link.

    The browser now plays the recording itself from /camera/video/{filename}
    and pushes frames for analysis, so all this has to do is put the file
    where it can be served from. Starting the capture as well would have two
    things watching the same recording out of step with each other.
    """

    allowed_extensions = {
        ".mp4",
        ".avi",
        ".mov",
        ".mkv",
        ".wmv",
        # Browsers play this one without needing a proprietary codec, so a
        # recording in it can always be reviewed locally rather than being
        # decoded and streamed back.
        ".webm",
    }

    extension = Path(file.filename).suffix.lower()

    if extension not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail="Unsupported video format.",
        )

    save_path = UPLOAD_DIR / file.filename

    with open(save_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Whatever was being watched, this is a different picture now: drawn
    # areas, door timers and counters all described the old one.
    camera_manager.stop()
    _camera_changed()

    return {
        "success": True,
        "message": "Recording ready to review.",
        "filename": file.filename,
        "url": f"/camera/video/{file.filename}",
    }


@router.get("/video/{filename}")
def serve_video(filename: str) -> FileResponse:
    """
    Hand an uploaded recording to the browser to play itself.

    Reviewing a recording used to mean the server decoding it, analysing every
    frame, drawing on it, re-encoding it as JPEG and pushing the result down
    the wire — so the operator watched a picture that had made a round trip it
    did not need to make. Over a tunnel that is seconds of delay, and no
    amount of lowering the quality fixes it: the delay is however many bytes
    are in flight divided by how fast the link drains them, and smaller frames
    just means more of them queued.

    Served as a file instead, the browser plays it at full rate with its own
    buffering, and only the findings come back over the socket. FileResponse
    answers range requests, so a long recording streams and seeks rather than
    downloading in full first.
    """
    # Resolved and checked rather than joined: the name comes off the wire,
    # and "../../etc/passwd" must not escape the uploads folder.
    path = (UPLOAD_DIR / filename).resolve()

    if not path.is_file() or not path.is_relative_to(UPLOAD_DIR.resolve()):
        raise HTTPException(status_code=404, detail="No such recording.")

    return FileResponse(path, media_type="video/mp4", filename=path.name)


@router.post("/source")
def change_source(request: CameraSource):

    source = request.source

    if source == "webcam":
        source = 0

    camera_manager.stop()

    started = camera_manager.start(source)

    if not started:
        raise HTTPException(
            status_code=400,
            detail="Unable to start selected source."
        )

    _camera_changed()

    # The register's idea of "who is watching" follows the server capture:
    # a network address is its own identifier, a local index is "local:{n}"
    # — the weakest identifier of the three kinds, and documented as such in
    # the register. Registered or not, the identifier becomes the live
    # context so events can at least say which source saw them.
    try:
        from app.camera.registry import camera_registry

        identifier = (
            f"local:{source}" if isinstance(source, int) else str(source)
        )
        camera_registry.lookup(identifier)
        camera_registry.set_context(identifier)
    except Exception as exc:  # noqa: BLE001
        print(f"[Cameras] Register could not follow the source change: {exc}")

    return {
        "success": True,
        "message": "Source changed successfully."
    }