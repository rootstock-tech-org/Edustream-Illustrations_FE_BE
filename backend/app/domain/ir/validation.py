"""Structural validation for the canonical VLSI IR.

validate_document() is the single entry point every future layer (guardrail
pipeline, schematic compiler, simulation, physical flow) should call before
trusting an IRDocument. It never raises - it always returns a
ValidationResult describing exactly what (if anything) is wrong.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from app.domain.ir.models import (
    BitRange,
    Component,
    Connection,
    IRDocument,
    PortDirection,
    SUPPORTED_SCHEMA_VERSIONS,
)


class ValidationIssue(BaseModel):
    """A single structural problem found in an IRDocument."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    code: str
    message: str
    path: str


class ValidationResult(BaseModel):
    """The result of validating an IRDocument."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    is_valid: bool
    issues: list[ValidationIssue] = Field(default_factory=list)


def validate_document(document: IRDocument) -> ValidationResult:
    """Validate schema version, id uniqueness, hierarchy, and connection
    integrity. Never raises."""

    issues: list[ValidationIssue] = []

    _check_schema_version(document, issues)
    _check_unique_ids(document, issues)

    components_by_id = {component.id: component for component in document.components}

    _check_hierarchy(document, components_by_id, issues)
    _check_hierarchy_cycles(document, components_by_id, issues)
    _check_root_components(document, components_by_id, issues)

    for connection in document.connections:
        _check_connection_references(connection, components_by_id, issues)
        _check_connection_direction(connection, components_by_id, issues)

    _check_multiple_drivers(document, issues)

    return ValidationResult(is_valid=len(issues) == 0, issues=issues)


def _check_schema_version(document: IRDocument, issues: list[ValidationIssue]) -> None:
    if document.schema_version not in SUPPORTED_SCHEMA_VERSIONS:
        issues.append(
            ValidationIssue(
                code="UNSUPPORTED_SCHEMA_VERSION",
                message=f"schema_version '{document.schema_version}' is not a supported IR schema version.",
                path="schema_version",
            )
        )


def _collect_ids(document: IRDocument) -> list[tuple[str, str]]:
    ids: list[tuple[str, str]] = []
    for component in document.components:
        ids.append(("component", component.id))
        for port in component.ports:
            ids.append(("port", port.id))
    for connection in document.connections:
        ids.append(("connection", connection.id))
    for annotation in document.annotations:
        ids.append(("annotation", annotation.id))
    return ids


def _check_unique_ids(document: IRDocument, issues: list[ValidationIssue]) -> None:
    seen: dict[str, str] = {}
    for kind, element_id in _collect_ids(document):
        if element_id in seen:
            issues.append(
                ValidationIssue(
                    code="DUPLICATE_ID",
                    message=f"Duplicate id '{element_id}' used by both a {seen[element_id]} and a {kind}.",
                    path=element_id,
                )
            )
        else:
            seen[element_id] = kind


def _check_hierarchy(
    document: IRDocument,
    components_by_id: dict[str, Component],
    issues: list[ValidationIssue],
) -> None:
    for component in document.components:
        if component.parent_id is None:
            continue
        if component.parent_id == component.id:
            issues.append(
                ValidationIssue(
                    code="INVALID_PARENT_REFERENCE",
                    message=f"Component '{component.id}' cannot be its own parent.",
                    path=f"components.{component.id}.parent_id",
                )
            )
        elif component.parent_id not in components_by_id:
            issues.append(
                ValidationIssue(
                    code="INVALID_PARENT_REFERENCE",
                    message=f"Component '{component.id}' references unknown parent '{component.parent_id}'.",
                    path=f"components.{component.id}.parent_id",
                )
            )


def _check_hierarchy_cycles(
    document: IRDocument,
    components_by_id: dict[str, Component],
    issues: list[ValidationIssue],
) -> None:
    reported: set[frozenset[str]] = set()

    for component in document.components:
        chain: list[str] = []
        current_id: str | None = component.id

        while current_id is not None:
            if current_id in chain:
                cycle_members = frozenset(chain[chain.index(current_id):])
                if cycle_members not in reported:
                    reported.add(cycle_members)
                    ordered = chain[chain.index(current_id):] + [current_id]
                    issues.append(
                        ValidationIssue(
                            code="HIERARCHY_CYCLE",
                            message=f"Hierarchy cycle detected: {' -> '.join(ordered)}.",
                            path=f"components.{current_id}.parent_id",
                        )
                    )
                break
            chain.append(current_id)
            next_component = components_by_id.get(current_id)
            if next_component is None:
                break
            current_id = next_component.parent_id


def _check_root_components(
    document: IRDocument,
    components_by_id: dict[str, Component],
    issues: list[ValidationIssue],
) -> None:
    declared_roots = set(document.root_component_ids)

    for root_id in document.root_component_ids:
        component = components_by_id.get(root_id)
        if component is None:
            issues.append(
                ValidationIssue(
                    code="ROOT_COMPONENT_MISMATCH",
                    message=f"root_component_ids references unknown component '{root_id}'.",
                    path="root_component_ids",
                )
            )
        elif component.parent_id is not None:
            issues.append(
                ValidationIssue(
                    code="ROOT_COMPONENT_MISMATCH",
                    message=f"'{root_id}' is listed as a root component but has parent_id='{component.parent_id}'.",
                    path="root_component_ids",
                )
            )

    actual_roots = {component.id for component in document.components if component.parent_id is None}
    for component_id in actual_roots - declared_roots:
        issues.append(
            ValidationIssue(
                code="ROOT_COMPONENT_MISMATCH",
                message=f"Component '{component_id}' has no parent but is missing from root_component_ids.",
                path="root_component_ids",
            )
        )


def _check_connection_references(
    connection: Connection,
    components_by_id: dict[str, Component],
    issues: list[ValidationIssue],
) -> None:
    for role, endpoint in (("source", connection.source), ("target", connection.target)):
        path = f"connections.{connection.id}.{role}"
        component = components_by_id.get(endpoint.component_id)
        if component is None:
            issues.append(
                ValidationIssue(
                    code=f"MISSING_{role.upper()}_COMPONENT",
                    message=f"Connection '{connection.id}' references unknown component '{endpoint.component_id}'.",
                    path=path,
                )
            )
            continue

        port = next((p for p in component.ports if p.id == endpoint.port_id), None)
        if port is None:
            issues.append(
                ValidationIssue(
                    code=f"MISSING_{role.upper()}_PORT",
                    message=f"Connection '{connection.id}' references unknown port '{endpoint.port_id}' on component '{endpoint.component_id}'.",
                    path=path,
                )
            )
            continue

        if endpoint.bit_range is not None and endpoint.bit_range.width > port.width:
            issues.append(
                ValidationIssue(
                    code="INVALID_BIT_RANGE",
                    message=f"Connection '{connection.id}' {role} bit_range width {endpoint.bit_range.width} exceeds port '{port.id}' width {port.width}.",
                    path=path,
                )
            )


def _check_connection_direction(
    connection: Connection,
    components_by_id: dict[str, Component],
    issues: list[ValidationIssue],
) -> None:
    source_component = components_by_id.get(connection.source.component_id)
    target_component = components_by_id.get(connection.target.component_id)
    if source_component is None or target_component is None:
        return  # already reported by _check_connection_references

    source_port = next((p for p in source_component.ports if p.id == connection.source.port_id), None)
    target_port = next((p for p in target_component.ports if p.id == connection.target.port_id), None)
    if source_port is None or target_port is None:
        return  # already reported by _check_connection_references

    # A parent's own boundary port legitimately flips role relative to a
    # normal leaf-to-leaf connection: an INPUT boundary port can source a
    # signal DOWN into a child, and an OUTPUT boundary port can be driven
    # (as a target) by a child's output flowing UP and out of the module.
    is_downward_boundary = source_component.id == target_component.parent_id
    is_upward_boundary = target_component.id == source_component.parent_id

    source_ok = source_port.direction in (PortDirection.OUTPUT, PortDirection.INOUT) or (
        is_downward_boundary and source_port.direction in (PortDirection.INPUT, PortDirection.INOUT)
    )
    target_ok = target_port.direction in (PortDirection.INPUT, PortDirection.INOUT) or (
        is_upward_boundary and target_port.direction in (PortDirection.OUTPUT, PortDirection.INOUT)
    )

    if not source_ok:
        issues.append(
            ValidationIssue(
                code="INVALID_PORT_DIRECTION",
                message=f"Connection '{connection.id}' source port '{source_port.id}' has direction '{source_port.direction.value}', which cannot drive this connection.",
                path=f"connections.{connection.id}.source",
            )
        )
    if not target_ok:
        issues.append(
            ValidationIssue(
                code="INVALID_PORT_DIRECTION",
                message=f"Connection '{connection.id}' target port '{target_port.id}' has direction '{target_port.direction.value}', which cannot be driven by this connection.",
                path=f"connections.{connection.id}.target",
            )
        )


def _bit_ranges_overlap(a: BitRange | None, b: BitRange | None) -> bool:
    # An endpoint with no explicit bit_range is treated as covering the
    # port's full width, so it always overlaps any other driver.
    if a is None or b is None:
        return True
    return a.lsb <= b.msb and b.lsb <= a.msb


def _check_multiple_drivers(document: IRDocument, issues: list[ValidationIssue]) -> None:
    """Flag a target port driven by more than one connection with
    overlapping bit ranges. Non-overlapping bit-range bus assembly (e.g.
    two connections each driving a disjoint slice of the same bus) is
    legitimate and NOT flagged."""

    drivers_by_target: dict[tuple[str, str], list[Connection]] = {}
    for connection in document.connections:
        key = (connection.target.component_id, connection.target.port_id)
        drivers_by_target.setdefault(key, []).append(connection)

    for (component_id, port_id), connections in drivers_by_target.items():
        if len(connections) < 2:
            continue
        reported_pairs: set[frozenset[str]] = set()
        for i in range(len(connections)):
            for j in range(i + 1, len(connections)):
                first, second = connections[i], connections[j]
                if not _bit_ranges_overlap(first.target.bit_range, second.target.bit_range):
                    continue
                pair_key = frozenset({first.id, second.id})
                if pair_key in reported_pairs:
                    continue
                reported_pairs.add(pair_key)
                issues.append(
                    ValidationIssue(
                        code="MULTIPLE_DRIVERS_CONFLICT",
                        message=(
                            f"Port '{port_id}' on component '{component_id}' is driven by "
                            f"more than one overlapping connection ('{first.id}' and '{second.id}')."
                        ),
                        path=f"components.{component_id}.ports.{port_id}",
                    )
                )
