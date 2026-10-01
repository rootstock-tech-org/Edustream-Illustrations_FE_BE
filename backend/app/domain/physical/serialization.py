"""Deterministic serialization for the physical domain - mirrors
app.domain.ir.serialization exactly (same 5 functions, same approach).
No custom/duplicate serialization framework."""

from __future__ import annotations

from typing import Any

from app.domain.physical.models import PhysicalDocument


def to_dict(document: PhysicalDocument) -> dict[str, Any]:
    """Serialize to a JSON-compatible dict."""

    return document.model_dump(mode="json")


def to_json(document: PhysicalDocument) -> str:
    """Serialize to a deterministic JSON string."""

    return document.model_dump_json()


def from_dict(data: dict[str, Any]) -> PhysicalDocument:
    """Parse a JSON-compatible dict back into a PhysicalDocument."""

    return PhysicalDocument.model_validate(data)


def from_json(data: str | bytes) -> PhysicalDocument:
    """Parse a JSON string back into a PhysicalDocument."""

    return PhysicalDocument.model_validate_json(data)


def json_schema() -> dict[str, Any]:
    """Return the JSON Schema for PhysicalDocument, generated directly
    from the Pydantic models - never hand-maintained separately."""

    return PhysicalDocument.model_json_schema()
