"""Structural validation for a generated PhysicalDocument.

validate_physical_document() never raises - it always returns a
PhysicalValidationResult describing exactly what (if anything) is wrong.
Mirrors app.domain.ir.validation.validate_document in spirit and
app.domain.guardrails' code/message/path issue shape.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from app.domain.physical.errors import PhysicalError
from app.domain.physical.models import PhysicalBlock, PhysicalDocument


class PhysicalValidationResult(BaseModel):
    """The result of validating a PhysicalDocument."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    is_valid: bool
    errors: list[PhysicalError] = Field(default_factory=list)


def validate_physical_document(document: PhysicalDocument) -> PhysicalValidationResult:
    """Validate that every block sits within the die, no two blocks
    overlap, and every net resolves to real pins on real blocks."""

    errors: list[PhysicalError] = []

    _check_block_bounds(document, errors)
    _check_block_overlaps(document, errors)
    _check_net_references(document, errors)

    return PhysicalValidationResult(is_valid=len(errors) == 0, errors=errors)


def _check_block_bounds(document: PhysicalDocument, errors: list[PhysicalError]) -> None:
    for block in sorted(document.blocks, key=lambda block: block.id):
        path = f"blocks.{block.id}"
        if block.x < 0 or block.y < 0:
            errors.append(
                PhysicalError(code="BLOCK_OUT_OF_DIE_BOUNDS", message=f"Block '{block.id}' has a negative position.", path=path)
            )
        if block.x + block.width > document.die_width or block.y + block.height > document.die_height:
            errors.append(
                PhysicalError(
                    code="BLOCK_OUT_OF_DIE_BOUNDS",
                    message=f"Block '{block.id}' extends beyond the die bounds ({document.die_width} x {document.die_height}).",
                    path=path,
                )
            )


def _overlaps(a: PhysicalBlock, b: PhysicalBlock) -> bool:
    return a.x < b.x + b.width and b.x < a.x + a.width and a.y < b.y + b.height and b.y < a.y + a.height


def _check_block_overlaps(document: PhysicalDocument, errors: list[PhysicalError]) -> None:
    blocks = sorted(document.blocks, key=lambda block: block.id)
    reported: set[frozenset[str]] = set()
    for i in range(len(blocks)):
        for j in range(i + 1, len(blocks)):
            if _overlaps(blocks[i], blocks[j]):
                pair = frozenset({blocks[i].id, blocks[j].id})
                if pair in reported:
                    continue
                reported.add(pair)
                errors.append(
                    PhysicalError(
                        code="BLOCK_OVERLAP",
                        message=f"Blocks '{blocks[i].id}' and '{blocks[j].id}' overlap.",
                        path=f"blocks.{blocks[i].id}",
                    )
                )


def _check_net_references(document: PhysicalDocument, errors: list[PhysicalError]) -> None:
    pins_by_block: dict[str, set[str]] = {block.id: {pin.id for pin in block.pins} for block in document.blocks}

    for net in sorted(document.nets, key=lambda net: net.id):
        for role, endpoint in (("source", net.source), ("target", net.target)):
            path = f"nets.{net.id}.{role}"
            if endpoint.block_id not in pins_by_block:
                errors.append(
                    PhysicalError(
                        code="DANGLING_NET_PIN_REFERENCE",
                        message=f"Net '{net.id}' references unknown block '{endpoint.block_id}'.",
                        path=path,
                    )
                )
                continue
            if endpoint.pin_id not in pins_by_block[endpoint.block_id]:
                errors.append(
                    PhysicalError(
                        code="DANGLING_NET_PIN_REFERENCE",
                        message=f"Net '{net.id}' references unknown pin '{endpoint.pin_id}' on block '{endpoint.block_id}'.",
                        path=path,
                    )
                )
