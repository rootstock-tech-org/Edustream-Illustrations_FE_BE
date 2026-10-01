"""Foundational physical/silicon representation: a deterministic,
traceable VIEW generated FROM the validated/normalized Canonical IR -
never a second source of truth. Deliberately synthetic sizing/placement;
no real EDA toolchain, no real routing, no 3D rendering."""

from app.domain.physical.errors import PhysicalError
from app.domain.physical.generator import generate_physical_layout
from app.domain.physical.models import (
    PhysicalBlock,
    PhysicalDocument,
    PhysicalEndpoint,
    PhysicalNet,
    PhysicalPin,
    PhysicalResult,
)
from app.domain.physical.serialization import from_dict, from_json, json_schema, to_dict, to_json
from app.domain.physical.validation import PhysicalValidationResult, validate_physical_document

__all__ = [
    "PhysicalError",
    "generate_physical_layout",
    "PhysicalBlock",
    "PhysicalDocument",
    "PhysicalEndpoint",
    "PhysicalNet",
    "PhysicalPin",
    "PhysicalResult",
    "from_dict",
    "from_json",
    "json_schema",
    "to_dict",
    "to_json",
    "PhysicalValidationResult",
    "validate_physical_document",
]
