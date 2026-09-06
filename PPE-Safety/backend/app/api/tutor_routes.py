"""
The AI Safety Lab's tutor chat.

    GET  /api/tutor/status   is a model actually connected right now
    POST /api/tutor/ask      one message in, one reply out

Built and wired up before any key exists: this backend has no
ANTHROPIC_API_KEY configured, by design — the lab's own interface says so
honestly rather than faking an answer. The moment a key is added to the
environment and the process restarts, this same endpoint starts answering
for real. Nothing about the frontend, the route, or the request shape
changes when that happens.
"""

import os
from typing import Any, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/tutor", tags=["AI Tutor"])

#: Real, public Anthropic model id — not this product's own internal alias
#: for itself, which is not the string the public Messages API expects.
#: Overridable so whoever adds the key can also choose the model without a
#: code change.
DEFAULT_MODEL = "claude-sonnet-4-5-20250929"

NOT_CONNECTED_REPLY = (
    "I'm not connected to a model yet — this lab is waiting on an API key "
    "(ANTHROPIC_API_KEY). Once one is added to the backend's environment, "
    "I'll be able to answer for real."
)

SYSTEM_PROMPT = (
    "You are the AI Tutor inside the AI Safety Lab, a teaching simulation for "
    "learning computer vision, YOLO-style object detection and AI safety "
    "concepts from zero prior knowledge. The learner may be on the Learning "
    "Hub, the Virtual Factory simulation, the Experiment Lab, the Real AI "
    "Lab (which runs real photos through the actual YOLOv8/InsightFace "
    "backend), or Safety Events (the real recorded violation history). "
    "Answer clearly and concisely, in plain language suited to a beginner. "
    "When relevant, be explicit about the difference between the "
    "simulation and the real AI backend — the two must never be conflated."
)


def _connected() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY"))


class ChatTurn(BaseModel):
    """One earlier turn of the conversation, as the frontend already has it."""

    role: str = Field(description="'user' or 'assistant'")
    text: str = Field(max_length=4000)


class AskRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    #: Capped well below what a real context window needs to worry about —
    #: this is a lab chat widget, not a transcript archive.
    history: list[ChatTurn] = Field(default_factory=list, max_length=40)
    #: The lab route the learner was on when they asked, e.g. "/factory".
    #: Optional, and only ever used to mention it back to the model — never
    #: trusted as anything more than a hint about where the question came
    #: from.
    page: Optional[str] = Field(default=None, max_length=200)


@router.get("/status")
def status() -> dict[str, Any]:
    """Whether a real model is actually reachable right now."""
    return {"success": True, "data": {"connected": _connected()}}


@router.post("/ask")
async def ask(body: AskRequest) -> dict[str, Any]:
    """
    One message in, one reply out.

    Always answers 200 — "not connected" is an expected, ordinary state for
    this widget today, not a server error, and the frontend renders it as
    part of the normal conversation rather than as a failure.
    """
    if not _connected():
        return {
            "success": True,
            "data": {"connected": False, "reply": NOT_CONNECTED_REPLY},
        }

    try:
        from anthropic import AsyncAnthropic

        client = AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

        messages = [
            {"role": turn.role, "content": turn.text}
            for turn in body.history
            if turn.role in ("user", "assistant")
        ]

        user_content = body.message
        if body.page:
            user_content = f"[The learner is currently on {body.page}]\n{body.message}"
        messages.append({"role": "user", "content": user_content})

        response = await client.messages.create(
            model=os.environ.get("TUTOR_MODEL", DEFAULT_MODEL),
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            messages=messages,
        )

        reply = "".join(
            block.text for block in response.content if block.type == "text"
        ).strip()

        return {
            "success": True,
            "data": {"connected": True, "reply": reply or "(no reply)"},
        }
    except Exception as exc:  # noqa: BLE001
        # A configured key that fails — wrong, revoked, rate-limited, the
        # provider is down — is still not this page's fault to crash over.
        # The learner sees why in plain words instead of a broken widget.
        return {
            "success": True,
            "data": {
                "connected": False,
                "reply": f"The tutor hit a problem reaching the model: {exc}",
            },
        }


__all__ = ["router"]
