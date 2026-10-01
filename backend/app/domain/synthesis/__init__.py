"""Synthesis domain (Step 18): the real HDL -> Yosys pipeline. Takes a
Canonical IR document, generates real Verilog (app.domain.hdl), invokes
the actual Yosys executable, and reconstructs an honest mapping back to
canonical IR component ids from the resulting real netlist. Never a
second, competing identity system - the original Canonical IR remains
authoritative regardless of what Yosys's optimizer does to the netlist.
"""

from app.domain.synthesis.models import (
    ComponentIdMapping,
    SynthesisArtifacts,
    SynthesisError,
    SynthesisIdMapping,
    SynthesisResult,
)
from app.domain.synthesis.pipeline import run_synthesis

__all__ = [
    "ComponentIdMapping",
    "SynthesisArtifacts",
    "SynthesisError",
    "SynthesisIdMapping",
    "SynthesisResult",
    "run_synthesis",
]
