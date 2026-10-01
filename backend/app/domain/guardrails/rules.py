"""Guardrail-specific rules that sit ON TOP of (and never duplicate)
Step 2's own app.domain.ir.validation.validate_document(). Only genuinely
NEW checks live here - anything Step 2 already owns is reused via
validator.py instead of being reimplemented."""

from __future__ import annotations

from app.domain.guardrails.models import GuardrailIssue, GuardrailSeverity
from app.domain.ir.models import IRDocument, PortDirection


def check_empty_identifiers(document: IRDocument) -> list[GuardrailIssue]:
    """Reject empty/whitespace-only identifiers. Step 2's Canonical IR
    models accept any non-None string for an id/name - this guardrail-level
    policy is intentionally stricter than the schema itself."""

    issues: list[GuardrailIssue] = []

    def _check(value: str, path: str) -> None:
        if not value.strip():
            issues.append(
                GuardrailIssue(
                    code="EMPTY_IDENTIFIER",
                    severity=GuardrailSeverity.ERROR,
                    message=f"'{path}' must not be empty or whitespace-only.",
                    path=path,
                )
            )

    _check(document.id, "id")
    _check(document.name, "name")

    for component in document.components:
        _check(component.id, f"components.{component.id or '<empty>'}.id")
        _check(component.name, f"components.{component.id or '<empty>'}.name")
        for port in component.ports:
            _check(port.id, f"components.{component.id}.ports.{port.id or '<empty>'}.id")
            _check(port.name, f"components.{component.id}.ports.{port.id or '<empty>'}.name")

    for connection in document.connections:
        _check(connection.id, f"connections.{connection.id or '<empty>'}.id")

    for annotation in document.annotations:
        _check(annotation.id, f"annotations.{annotation.id or '<empty>'}.id")

    return issues


def check_annotation_references(document: IRDocument) -> list[GuardrailIssue]:
    """Warn (never error - annotations are non-authoritative notes that
    never affect circuit semantics) about an annotation whose target_id
    does not match any known component/port/connection id."""

    known_ids: set[str] = set()
    for component in document.components:
        known_ids.add(component.id)
        for port in component.ports:
            known_ids.add(port.id)
    for connection in document.connections:
        known_ids.add(connection.id)

    issues: list[GuardrailIssue] = []
    for annotation in document.annotations:
        if annotation.target_id is not None and annotation.target_id not in known_ids:
            issues.append(
                GuardrailIssue(
                    code="DANGLING_ANNOTATION_REFERENCE",
                    severity=GuardrailSeverity.WARNING,
                    message=(
                        f"Annotation '{annotation.id}' references unknown target "
                        f"'{annotation.target_id}' - harmless, but points at nothing "
                        f"in the current document."
                    ),
                    path=f"annotations.{annotation.id}.target_id",
                )
            )
    return issues


def check_floating_input_ports(document: IRDocument) -> list[GuardrailIssue]:
    """Warn (never error - a floating input is a real design smell but not
    a structural violation Step 2's own validation already rejects) about
    any INPUT/INOUT-direction port that is never the `target` of any
    connection in the document. Deliberately excludes a component's own
    ports when it legitimately never needs an internal driver: a downward
    hierarchy boundary port (this component IS some other component's
    parent) may drive children without ever appearing as a target itself,
    so such a port is not flagged as floating."""

    driven_targets: set[tuple[str, str]] = {
        (connection.target.component_id, connection.target.port_id)
        for connection in document.connections
    }
    parent_ids = {
        component.parent_id for component in document.components if component.parent_id is not None
    }

    issues: list[GuardrailIssue] = []
    for component in document.components:
        is_parent = component.id in parent_ids
        for port in component.ports:
            if port.direction not in (PortDirection.INPUT, PortDirection.INOUT):
                continue
            if (component.id, port.id) in driven_targets:
                continue
            if is_parent:
                # A parent's own boundary input port may legitimately be
                # driven only from inside (an upward flow from a child),
                # which validation.py already permits - not this
                # guardrail's concern to re-derive that logic.
                continue
            issues.append(
                GuardrailIssue(
                    code="FLOATING_INPUT_PORT",
                    severity=GuardrailSeverity.WARNING,
                    message=(
                        f"Port '{port.id}' on component '{component.id}' has "
                        f"direction '{port.direction.value}' but is never driven "
                        f"by any connection - likely an unconnected input."
                    ),
                    path=f"components.{component.id}.ports.{port.id}",
                )
            )
    return issues


_DFF_KIND = "DFF"


def check_dff_port_shape(document: IRDocument) -> list[GuardrailIssue]:
    """A "DFF"-kind component (Step 21 follow-up: real sequential logic)
    must have EXACTLY one 'd' input port, one 'clk' input port (a 1-bit
    scalar - a multi-bit "clock bus" is never a valid clock signal), and
    one output port ('q') whose width matches 'd'. This is an ERROR
    (blocks is_valid), not a warning - a malformed DFF can never be
    turned into real HDL, so the failure must surface here, before
    app.domain.hdl.generator ever runs, rather than as a confusing
    downstream crash/failure."""

    issues: list[GuardrailIssue] = []
    for component in document.components:
        if component.kind != _DFF_KIND:
            continue

        path_prefix = f"components.{component.id}"
        ports_by_name: dict[str, list] = {}
        for port in component.ports:
            ports_by_name.setdefault(port.name, []).append(port)

        for name, ports in ports_by_name.items():
            if len(ports) > 1:
                issues.append(
                    GuardrailIssue(
                        code="DFF_DUPLICATE_PORT_NAME",
                        severity=GuardrailSeverity.ERROR,
                        message=(
                            f"DFF component '{component.id}' has {len(ports)} "
                            f"ports named '{name}' - port names must be unique "
                            "on a DFF."
                        ),
                        path=f"{path_prefix}.ports.{name}",
                    )
                )

        d_port = ports_by_name.get("d", [None])[0]
        clk_port = ports_by_name.get("clk", [None])[0]
        output_ports = [port for port in component.ports if port.direction == PortDirection.OUTPUT]
        q_port = next((port for port in output_ports if port.name == "q"), None)

        if d_port is None or d_port.direction != PortDirection.INPUT:
            issues.append(
                GuardrailIssue(
                    code="DFF_MISSING_D_PORT",
                    severity=GuardrailSeverity.ERROR,
                    message=f"DFF component '{component.id}' must have exactly one INPUT port named 'd'.",
                    path=f"{path_prefix}.ports.d",
                )
            )

        if clk_port is None or clk_port.direction != PortDirection.INPUT:
            issues.append(
                GuardrailIssue(
                    code="DFF_MISSING_CLK_PORT",
                    severity=GuardrailSeverity.ERROR,
                    message=f"DFF component '{component.id}' must have exactly one INPUT port named 'clk'.",
                    path=f"{path_prefix}.ports.clk",
                )
            )
        elif clk_port.width != 1:
            issues.append(
                GuardrailIssue(
                    code="DFF_INVALID_CLK_WIDTH",
                    severity=GuardrailSeverity.ERROR,
                    message=(
                        f"DFF component '{component.id}'s 'clk' port has width "
                        f"{clk_port.width} - a clock must be a 1-bit scalar signal."
                    ),
                    path=f"{path_prefix}.ports.clk",
                )
            )

        if q_port is None:
            issues.append(
                GuardrailIssue(
                    code="DFF_MISSING_Q_PORT",
                    severity=GuardrailSeverity.ERROR,
                    message=f"DFF component '{component.id}' must have exactly one OUTPUT port named 'q'.",
                    path=f"{path_prefix}.ports.q",
                )
            )
        elif d_port is not None and q_port.width != d_port.width:
            issues.append(
                GuardrailIssue(
                    code="DFF_WIDTH_MISMATCH",
                    severity=GuardrailSeverity.ERROR,
                    message=(
                        f"DFF component '{component.id}'s 'q' port width "
                        f"({q_port.width}) does not match its 'd' port width "
                        f"({d_port.width})."
                    ),
                    path=f"{path_prefix}.ports.q",
                )
            )

    return issues


def check_dff_reset_shape(document: IRDocument) -> list[GuardrailIssue]:
    """A "DFF"-kind component's reset semantics are declared ONLY via
    Component.reset (an explicit ResetSpec) - never inferred from the
    presence of a port named 'reset'. This is an ERROR (blocks is_valid),
    matching check_dff_port_shape's severity, because a malformed reset
    declaration can never be turned into real HDL either.

    Two independent shapes are enforced:
      - reset is None: there must be NO port named 'reset' at all. A port
        named 'reset' with no declared semantics is ambiguous (is it a
        real reset wired up incorrectly, or just a stray port with a
        misleading name?) and is rejected rather than silently ignored
        or silently treated as a reset.
      - reset is not None: there must be EXACTLY one port named 'reset',
        direction INPUT, width 1 (a reset, like a clock, is never a valid
        multi-bit bus). Invalid polarity/timing *values* can never reach
        this function at all - ResetPolarity/ResetTiming are closed
        Pydantic enums validated at IR-construction time, before any
        guardrail ever runs.
    """

    issues: list[GuardrailIssue] = []
    for component in document.components:
        if component.kind != _DFF_KIND:
            continue

        path_prefix = f"components.{component.id}"
        reset_port = next((port for port in component.ports if port.name == "reset"), None)

        if component.reset is None:
            if reset_port is not None:
                issues.append(
                    GuardrailIssue(
                        code="DFF_UNDECLARED_RESET_PORT",
                        severity=GuardrailSeverity.ERROR,
                        message=(
                            f"DFF component '{component.id}' has a port named 'reset' "
                            "but no reset semantics declared (component.reset is "
                            "None). Reset behavior is never inferred from a port "
                            "name - either declare reset explicitly (polarity + "
                            "timing) or remove this port."
                        ),
                        path=f"{path_prefix}.ports.reset",
                    )
                )
            continue

        # component.reset is not None: a real, correctly-shaped reset
        # port is required.
        if reset_port is None:
            issues.append(
                GuardrailIssue(
                    code="DFF_MISSING_RESET_PORT",
                    severity=GuardrailSeverity.ERROR,
                    message=(
                        f"DFF component '{component.id}' declares reset semantics "
                        "but has no port named 'reset'."
                    ),
                    path=f"{path_prefix}.ports.reset",
                )
            )
            continue

        if reset_port.direction != PortDirection.INPUT:
            issues.append(
                GuardrailIssue(
                    code="DFF_INVALID_RESET_DIRECTION",
                    severity=GuardrailSeverity.ERROR,
                    message=f"DFF component '{component.id}'s 'reset' port must be an INPUT port.",
                    path=f"{path_prefix}.ports.reset",
                )
            )

        if reset_port.width != 1:
            issues.append(
                GuardrailIssue(
                    code="DFF_INVALID_RESET_WIDTH",
                    severity=GuardrailSeverity.ERROR,
                    message=(
                        f"DFF component '{component.id}'s 'reset' port has width "
                        f"{reset_port.width} - a reset must be a 1-bit scalar signal."
                    ),
                    path=f"{path_prefix}.ports.reset",
                )
            )

    return issues
