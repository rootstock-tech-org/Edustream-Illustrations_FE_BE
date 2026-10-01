"""VLSIIntent - the untrusted, LLM-facing structured schema (Step 16).

This is deliberately NOT the Canonical IR. The LLM is only ever asked to
produce this simpler, flatter shape (raw JSON, untrusted input); the only
way raw AI output ever becomes real IR is by first parsing it into this
exact Pydantic model (extra="forbid" - any unexpected/malformed shape is
rejected right here) and then running it through the fully deterministic
app.domain.prompt.compiler.compile_intent(). No AI output is ever used
to build an IRDocument directly.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class IntentPort(BaseModel):
    """One explicit port on a component - required whenever a component's
    kind is not one of the compiler's built-in primitives (see
    compiler.py's _PRIMITIVE_TEMPLATES), since the compiler has no other
    way to know what signals a novel functional block (adder, mux,
    register, ...) actually needs."""

    model_config = ConfigDict(extra="forbid")

    name: str
    direction: Literal["input", "output"]
    width: int = Field(default=1, gt=0)


class IntentComponent(BaseModel):
    """One requested circuit component. `ports=None` means "use the
    kind's built-in primitive template" - only valid for kinds the
    compiler actually recognizes as primitives."""

    model_config = ConfigDict(extra="forbid")

    id: str
    kind: str
    name: str
    width: int = Field(default=1, gt=0)
    ports: list[IntentPort] | None = None


class IntentConnection(BaseModel):
    """One requested wire, referenced by component id + port NAME (not a
    real IR port id, which doesn't exist yet at this stage) -
    source_port/target_port may be omitted when the referenced
    component has exactly one output/input port respectively."""

    model_config = ConfigDict(extra="forbid")

    source_id: str
    source_port: str | None = None
    target_id: str
    target_port: str | None = None


class VLSIIntent(BaseModel):
    """The LLM's structured understanding of the requested circuit -
    always treated as untrusted input until it both passes this
    validation AND successfully compiles into a real IRDocument."""

    model_config = ConfigDict(extra="forbid")

    circuit_name: str
    components: list[IntentComponent] = Field(default_factory=list)
    connections: list[IntentConnection] = Field(default_factory=list)
