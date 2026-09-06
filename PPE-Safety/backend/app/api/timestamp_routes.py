"""
The burned-in timestamp clock: where it reads, and how it is doing.

    GET    /api/timestamp-clock/config?source=   the marked box, if any
    POST   /api/timestamp-clock/config           mark or clear the box
    GET    /api/timestamp-clock/status           every live clock's state

New paths rather than fields on an existing config: the verification
suites fingerprint the module configs exactly, and a debugging surface
should not move what they pin. `timestamp_source` on each event says which
clock stamped it; this is where an operator or the suite asks *why*.
"""

from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.camera import camera_manager
from app.vision.timestamp_regions import timestamp_regions

router = APIRouter(prefix="/api/timestamp-clock", tags=["Timestamp clock"])


class TimestampArea(BaseModel):
    """The operator's marked box, or null to clear it."""

    source: Optional[str] = None
    box: Optional[list[float]] = None


def _resolve(source: Optional[str]) -> Optional[str]:
    """
    "__current__" means whatever camera the server is running right now.

    The page marking a box on a server-side stream knows it is watching
    *the* server camera, not which URL or file that camera is — the server
    does. Everything else passes through untouched.
    """
    if source == "__current__":
        current = camera_manager.current_source
        return str(current) if current is not None else None
    return source


@router.get("/config")
def get_timestamp_config(source: Optional[str] = None) -> dict[str, Any]:
    """The marked timestamp area for this source, when one is marked."""
    return {
        "success": True,
        "data": {"box": timestamp_regions.get(_resolve(source))},
    }


@router.post("/config")
def set_timestamp_config(payload: TimestampArea) -> dict[str, Any]:
    """
    Mark where a camera's burned-in timestamp is, or clear the mark.

    A cleared mark hands the region back to auto-detection. Either way
    every live clock on this source — the server capture and any browser
    session alike — is re-armed on the spot, so the mark answers the
    session the operator is looking at, not the next one.
    """
    source = _resolve(payload.source)

    if payload.box is None:
        cleared = timestamp_regions.clear(source)
        timestamp_regions.rearm(source, None)
        return {
            "success": True,
            "message": (
                "Timestamp area cleared — auto-detection takes over."
                if cleared
                else "No timestamp area was marked."
            ),
            "data": {"box": None},
        }

    try:
        cleaned = timestamp_regions.set(source, payload.box)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    timestamp_regions.rearm(source, cleaned)

    return {
        "success": True,
        "message": "Timestamp area saved.",
        "data": {"box": cleaned},
    }


@router.get("/status")
def timestamp_clock_status() -> dict[str, Any]:
    """
    Every live clock, as it stands — browser sessions included.

    The debugging half of `timestamp_source`: which state each source's
    clock is in, where it is reading, and the last text it accepted. The
    list comes from the store's own register of attached clocks, so a
    recording playing in a browser shows up here too instead of leaving
    an operator to debug an empty list.
    """
    return {
        "success": True,
        "data": {"clocks": timestamp_regions.live_statuses()},
    }
