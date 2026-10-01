"""compile_intent(VLSIIntent) -> CompileOutcome - the deterministic, AI-free
heart of Step 16.

Every requested Component.kind is either a known PRIMITIVE (a fixed port
template: input/output/AND/OR/NOT/DFF) or must supply explicit `ports` in
the intent itself (a compound/opaque functional block, e.g. adder/mux/
counter) - anything else is an honest, structured failure, never
a fabricated/guessed circuit. Connections are resolved by component id +
port NAME (inferring the sole input/output port when a name is omitted
and unambiguous) into real Canonical IR port ids.

This module never imports anything AI/Groq-related - it is pure,
deterministic, and fully unit-testable without any network access. This
is deliberate: the LLM only ever produces a VLSIIntent (untrusted data);
this compiler is the ONLY thing that ever produces a real IRDocument.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import uuid4

from app.domain.ir.models import (
    Component,
    Connection,
    ConnectionEndpoint,
    CURRENT_SCHEMA_VERSION,
    IRDocument,
    Port,
    PortDirection,
    Provenance,
)
from app.domain.prompt.intent import IntentComponent, IntentConnection, VLSIIntent
from app.domain.prompt.models import PromptFailureReason

# Fixed port templates for kinds the compiler can build without any
# explicit `ports` being supplied in the intent. Any OTHER kind must
# supply explicit ports - this compiler never invents a novel component's
# interface.
_PRIMITIVE_TEMPLATES: dict[str, list[tuple[str, PortDirection]]] = {
    "input": [("out", PortDirection.OUTPUT)],
    "output": [("in", PortDirection.INPUT)],
    "AND": [("a", PortDirection.INPUT), ("b", PortDirection.INPUT), ("y", PortDirection.OUTPUT)],
    "OR": [("a", PortDirection.INPUT), ("b", PortDirection.INPUT), ("y", PortDirection.OUTPUT)],
    "NOT": [("a", PortDirection.INPUT), ("y", PortDirection.OUTPUT)],
    # A real D flip-flop/register (Step 21 follow-up). Different valid
    # natural-language descriptions ("D flip-flop", "1-bit register", "a
    # register with D, Q and clock") all resolve into this SAME template
    # via the LLM's own kind extraction (see groq_client.py's prompt) -
    # this compiler never special-cases individual phrasings itself.
    "DFF": [("d", PortDirection.INPUT), ("clk", PortDirection.INPUT), ("q", PortDirection.OUTPUT)],
}

# A clock is always a 1-bit scalar signal, regardless of a component's
# requested data width (e.g. an "8-bit register" has an 8-bit d/q but its
# clk is still exactly 1 bit) - never widened alongside the data ports.
_FIXED_WIDTH_ONE_PORTS: dict[str, frozenset[str]] = {
    "DFF": frozenset({"clk"}),
}


@dataclass(frozen=True)
class CompileOutcome:
    """The deterministic outcome of compile_intent(). No partial/fake
    IRDocument is ever returned when success is False."""

    success: bool
    document: IRDocument | None = None
    message: str = ""
    failure_reason: PromptFailureReason | None = None


def compile_intent(intent: VLSIIntent) -> CompileOutcome:
    if not intent.components:
        return CompileOutcome(
            success=False,
            message="The AI did not describe any components for this circuit.",
            failure_reason=PromptFailureReason.MALFORMED_INTENT,
        )

    components: list[Component] = []
    port_ids_by_component: dict[str, dict[str, str]] = {}
    port_directions_by_component: dict[str, dict[str, PortDirection]] = {}

    for intent_component in intent.components:
        ports, error = _build_ports(intent_component)
        if error is not None:
            return CompileOutcome(success=False, message=error, failure_reason=PromptFailureReason.UNSUPPORTED_COMPONENT_KIND)

        components.append(Component(id=intent_component.id, kind=intent_component.kind, name=intent_component.name, ports=ports))
        port_ids_by_component[intent_component.id] = {port.name: port.id for port in ports}
        port_directions_by_component[intent_component.id] = {port.name: port.direction for port in ports}

    connections: list[Connection] = []
    for index, intent_connection in enumerate(intent.connections, start=1):
        connection, error = _resolve_connection(intent_connection, index, port_ids_by_component, port_directions_by_component)
        if error is not None:
            return CompileOutcome(success=False, message=error, failure_reason=PromptFailureReason.INVALID_CONNECTION)
        connections.append(connection)

    document = IRDocument(
        id=f"doc_ai_{uuid4().hex[:12]}",
        schema_version=CURRENT_SCHEMA_VERSION,
        design_version="1",
        name=intent.circuit_name,
        components=components,
        connections=connections,
        root_component_ids=[component.id for component in components],
        provenance=Provenance(source="ai_generated", created_at=datetime.now(timezone.utc)),
    )
    return CompileOutcome(success=True, document=document)


def _build_ports(intent_component: IntentComponent) -> tuple[list[Port], str | None]:
    if intent_component.ports is not None:
        return [
            Port(
                id=f"{intent_component.id}.{port.name}",
                name=port.name,
                direction=PortDirection(port.direction),
                width=port.width,
            )
            for port in intent_component.ports
        ], None

    template = _PRIMITIVE_TEMPLATES.get(intent_component.kind)
    if template is None:
        return [], (
            f"Component '{intent_component.id}' has kind '{intent_component.kind}', which this "
            "platform doesn't support building yet (no explicit ports were given, and it isn't "
            "one of the built-in primitives: input/output/AND/OR/NOT/DFF). This VLSI concept isn't "
            "available yet rather than being fabricated."
        )

    fixed_width_one_ports = _FIXED_WIDTH_ONE_PORTS.get(intent_component.kind, frozenset())
    return [
        Port(
            id=f"{intent_component.id}.{name}",
            name=name,
            direction=direction,
            width=1 if name in fixed_width_one_ports else intent_component.width,
        )
        for name, direction in template
    ], None


def _resolve_connection(
    intent_connection: IntentConnection,
    index: int,
    port_ids_by_component: dict[str, dict[str, str]],
    port_directions_by_component: dict[str, dict[str, PortDirection]],
) -> tuple[Connection | None, str | None]:
    if intent_connection.source_id not in port_ids_by_component:
        return None, f"Connection {index} references unknown component '{intent_connection.source_id}'."
    if intent_connection.target_id not in port_ids_by_component:
        return None, f"Connection {index} references unknown component '{intent_connection.target_id}'."

    source_port_name = intent_connection.source_port or _infer_port_name(
        intent_connection.source_id, PortDirection.OUTPUT, port_directions_by_component
    )
    target_port_name = intent_connection.target_port or _infer_port_name(
        intent_connection.target_id, PortDirection.INPUT, port_directions_by_component
    )

    if source_port_name is None:
        return None, f"Connection {index}: could not determine which output port of '{intent_connection.source_id}' to use - source_port must be specified."
    if target_port_name is None:
        return None, f"Connection {index}: could not determine which input port of '{intent_connection.target_id}' to use - target_port must be specified."

    if source_port_name not in port_ids_by_component[intent_connection.source_id]:
        return None, f"Connection {index}: component '{intent_connection.source_id}' has no port named '{source_port_name}'."
    if target_port_name not in port_ids_by_component[intent_connection.target_id]:
        return None, f"Connection {index}: component '{intent_connection.target_id}' has no port named '{target_port_name}'."

    return Connection(
        id=f"conn_{index}",
        source=ConnectionEndpoint(
            component_id=intent_connection.source_id,
            port_id=port_ids_by_component[intent_connection.source_id][source_port_name],
        ),
        target=ConnectionEndpoint(
            component_id=intent_connection.target_id,
            port_id=port_ids_by_component[intent_connection.target_id][target_port_name],
        ),
    ), None


def _infer_port_name(
    component_id: str,
    direction: PortDirection,
    port_directions_by_component: dict[str, dict[str, PortDirection]],
) -> str | None:
    matches = [name for name, port_direction in port_directions_by_component[component_id].items() if port_direction == direction]
    return matches[0] if len(matches) == 1 else None
