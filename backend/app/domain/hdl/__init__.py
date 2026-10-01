"""HDL generation domain (Step 18): deterministic, primitive-only Verilog
generation FROM the Canonical IR - the input to real Yosys synthesis.
Never a second source of truth; every generated Verilog construct traces
back to exactly one IR component/port via app.domain.hdl.generator's
identity-preserving naming convention.
"""

from app.domain.hdl.errors import HdlError
from app.domain.hdl.generator import HdlGenerationResult, HdlModule, generate_verilog

__all__ = ["HdlError", "HdlGenerationResult", "HdlModule", "generate_verilog"]
