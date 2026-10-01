"""Safe, deterministic normalization of a Canonical IR document.

Only list ORDER is ever changed here - never a value. Circuit semantics in
this IR are entirely id-based (components/ports/connections are always
looked up by id, never by list position), so reordering these lists is
provably meaning-preserving. This module must NEVER invent components/
ports, change directions/widths, reconnect signals, or otherwise guess at
missing/ambiguous intent - see app.domain.guardrails.rules for the checks
that instead REJECT anything unsafe to normalize.
"""

from __future__ import annotations

from app.domain.ir.models import IRDocument


def normalize_document(document: IRDocument) -> IRDocument:
    """Return a new IRDocument with components/ports/parameters/
    connections/annotations/root_component_ids deterministically ordered
    by id (or name, for parameters). Idempotent: normalizing an already
    normalized document returns an equal result."""

    normalized_components = [
        component.model_copy(
            update={
                "ports": sorted(component.ports, key=lambda port: port.id),
                "parameters": sorted(component.parameters, key=lambda parameter: parameter.name),
            }
        )
        for component in sorted(document.components, key=lambda component: component.id)
    ]

    return document.model_copy(
        update={
            "components": normalized_components,
            "connections": sorted(document.connections, key=lambda connection: connection.id),
            "annotations": sorted(document.annotations, key=lambda annotation: annotation.id),
            "root_component_ids": sorted(document.root_component_ids),
        }
    )
