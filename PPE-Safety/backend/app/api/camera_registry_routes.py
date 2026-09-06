"""
The camera register over HTTP.

The verbs the spec asks for, in this API's own conventions: everything under
/api, {"success", "data"} envelopes via the same plain returns every other
router uses, refusals as 400s with a sentence an operator can act on.

`lookup` and `context` are POSTs taking the identifier in the body rather
than path parameters, because two of the three identifier kinds — network
addresses and browser device ids — are strings with slashes and padding that
have no business being URL path segments.
"""

from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.camera.registry import camera_registry

router = APIRouter(prefix="/cameras", tags=["Camera register"])


class LookupRequest(BaseModel):
    camera_id: str


class RegisterRequest(BaseModel):
    camera_id: str
    camera_name: str
    location: str
    source: Optional[dict[str, Any]] = None
    #: The camera's own clock at registration, when the source has one.
    camera_epoch_ms: Optional[float] = None


class UpdateRequest(BaseModel):
    camera_name: Optional[str] = None
    location: Optional[str] = None
    enabled: Optional[bool] = None


class ContextRequest(BaseModel):
    camera_id: str
    camera_epoch_ms: Optional[float] = None


@router.get("")
def list_cameras():
    """Every registered camera, with the register's recent log."""
    return {
        "success": True,
        "data": {
            "cameras": camera_registry.list(),
            "log": camera_registry.log_entries(50),
        },
    }


@router.post("/lookup")
def lookup_camera(request: LookupRequest):
    """Is this identifier registered? The question the popup hangs on."""
    return {"success": True, "data": camera_registry.lookup(request.camera_id)}


@router.post("")
def register_camera(request: RegisterRequest):
    """Register a camera. Refused if the identifier is already registered."""
    try:
        record = camera_registry.register(
            request.camera_id,
            request.camera_name,
            request.location,
            source=request.source,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # Registering is almost always followed by starting, so the freshly
    # registered camera becomes the live context in the same breath — and
    # its clock, if it reported one, is checked now rather than later.
    camera_registry.set_context(request.camera_id, request.camera_epoch_ms)

    return {"success": True, "data": record}


@router.post("/context")
def set_camera_context(request: ContextRequest):
    """This camera is the one feeding analysis now."""
    return {
        "success": True,
        "data": camera_registry.set_context(
            request.camera_id, request.camera_epoch_ms
        ),
    }


@router.delete("/context")
def clear_camera_context():
    """No camera is feeding analysis any more."""
    camera_registry.clear_context()
    return {"success": True}


@router.get("/{camera_id}")
def get_camera(camera_id: str):
    record = camera_registry.get(camera_id)
    if record is None:
        raise HTTPException(status_code=404, detail="That camera is not registered.")
    return {"success": True, "data": record}


@router.put("/{camera_id}")
def update_camera(camera_id: str, request: UpdateRequest):
    """
    Edit what an operator may edit: name, location, enabled.

    The identifier is not editable through this or any route — it is the
    one fact the register exists to hold still.
    """
    try:
        record = camera_registry.update(
            camera_id,
            camera_name=request.camera_name,
            location=request.location,
            enabled=request.enabled,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc.args[0])) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {"success": True, "data": record}


@router.delete("/{camera_id}")
def delete_camera(camera_id: str):
    if not camera_registry.remove(camera_id):
        raise HTTPException(status_code=404, detail="That camera is not registered.")
    return {"success": True, "message": "Camera removed from the register."}
