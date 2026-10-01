"""Deterministic serialization for the canonical IR.

Pydantic v2's own serialization APIs are the single mechanism used here -
no custom/duplicate serialization framework.
"""

from __future__ import annotations

from typing import Any

from app.domain.ir.models import IRDocument


def to_dict(document: IRDocument) -> dict[str, Any]:
    """Serialize to a JSON-compatible dict (datetimes/enums as JSON-safe values)."""

    return document.model_dump(mode="json")


def to_json(document: IRDocument) -> str:
    """Serialize to a deterministic JSON string."""

    return document.model_dump_json()


def from_dict(data: dict[str, Any]) -> IRDocument:
    """Parse a JSON-compatible dict back into an IRDocument."""

    return IRDocument.model_validate(data)


def from_json(data: str | bytes) -> IRDocument:
    """Parse a JSON string back into an IRDocument."""

    return IRDocument.model_validate_json(data)


def json_schema() -> dict[str, Any]:
    """Return the JSON Schema for IRDocument, generated directly from the
    Pydantic models (the models are the single source of truth - this is
    never hand-maintained separately)."""

    return IRDocument.model_json_schema()
