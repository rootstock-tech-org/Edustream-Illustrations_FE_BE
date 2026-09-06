from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.vision.zone_store import zone_store

router = APIRouter(
    prefix="/restricted-area",
    tags=["Restricted Area"],
)


def _source():
    """The camera whose zones apply, read at call time not import time."""
    from app.camera import camera_manager

    return camera_manager.current_source


class Point(BaseModel):
    x: float
    y: float


class PolygonRequest(BaseModel):
    polygon: list[Point]


@router.post("")
def save_restricted_area(request: PolygonRequest):
    """
    Save the restricted area polygon — the single-area verb, kept.

    Writes through the same zone store as the module's config endpoint, so
    the two paths cannot disagree. What this has always meant is "this camera
    has exactly this one area now", and that is what replace_all does: any
    zones marked by the newer verbs are superseded, exactly as one polygon
    always superseded the previous one here.
    """
    try:
        zone_store.replace_all(
            _source(), [point.model_dump() for point in request.polygon]
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "success": True,
        "message": "Restricted area saved."
    }


@router.get("")
def get_restricted_area():
    """
    Load the restricted area polygon.

    The first marked zone, in the single-polygon shape this route has always
    answered with. Callers that know about several zones use the module's
    /config endpoint, which lists them all.
    """
    zones = zone_store.for_source(_source())

    return {
        "polygon": list(zones[0]["points"]) if zones else []
    }


@router.delete("")
def clear_restricted_area():
    """
    Remove every zone on this camera — clearing has always meant all of it.
    """
    zone_store.clear(_source())

    return {
        "success": True,
        "message": "Restricted area cleared."
    }
