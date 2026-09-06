from fastapi import APIRouter

from app.services.system_service import system_service

router = APIRouter()


@router.get("/health")
def health():
    # The same {success, data} envelope every documented endpoint answers
    # with — a liveness probe that shapes its answer differently is the one
    # response an integrator's client cannot parse with the same code.
    # `message` stays for anything already reading it.
    return {
        "success": True,
        "data": {"status": "healthy"},
        "message": "Backend is healthy"
    }


@router.get("/system/status")
def system_status():
    return {
        "success": True,
        "data": system_service.get_status()
    }