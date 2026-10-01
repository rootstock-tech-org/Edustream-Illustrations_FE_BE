"""Canonical VLSI Intermediate Representation (IR) domain package."""

from app.domain.ir.models import (
    Annotation,
    BitRange,
    Component,
    Connection,
    ConnectionEndpoint,
    CURRENT_SCHEMA_VERSION,
    IRDocument,
    Parameter,
    Port,
    PortDirection,
    Provenance,
    SUPPORTED_SCHEMA_VERSIONS,
    VisualMetadata,
)
from app.domain.ir.serialization import from_dict, from_json, json_schema, to_dict, to_json
from app.domain.ir.validation import ValidationIssue, ValidationResult, validate_document

__all__ = [
    "Annotation",
    "BitRange",
    "Component",
    "Connection",
    "ConnectionEndpoint",
    "CURRENT_SCHEMA_VERSION",
    "IRDocument",
    "Parameter",
    "Port",
    "PortDirection",
    "Provenance",
    "SUPPORTED_SCHEMA_VERSIONS",
    "VisualMetadata",
    "ValidationIssue",
    "ValidationResult",
    "validate_document",
    "from_dict",
    "from_json",
    "json_schema",
    "to_dict",
    "to_json",
]
