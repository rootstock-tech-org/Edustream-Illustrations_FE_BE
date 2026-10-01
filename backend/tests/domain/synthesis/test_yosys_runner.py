import os
import shutil

import pytest

from app.domain.synthesis.yosys_runner import run_yosys

_REAL_YOSYS_PATH = os.environ.get("YOSYS_PATH", "/home/rahulg/tools/oss-cad-suite/bin/yosys")
_YOSYS_AVAILABLE = shutil.which(_REAL_YOSYS_PATH) is not None or shutil.which("yosys") is not None

_SIMPLE_VERILOG = """\
module top (input a, input b, output y);
  assign y = a & b;
endmodule
"""


def test_missing_yosys_binary_is_an_honest_structured_failure() -> None:
    outcome = run_yosys(_SIMPLE_VERILOG, "top", yosys_path="/nonexistent/yosys-binary", timeout_seconds=5)

    assert outcome.success is False
    assert outcome.failure_reason == "YOSYS_NOT_FOUND"
    assert outcome.netlist_json is None


@pytest.mark.skipif(not _YOSYS_AVAILABLE, reason="yosys is not installed in this environment")
def test_real_yosys_run_produces_real_artifacts() -> None:
    yosys_path = _REAL_YOSYS_PATH if shutil.which(_REAL_YOSYS_PATH) else "yosys"

    outcome = run_yosys(_SIMPLE_VERILOG, "top", yosys_path=yosys_path, timeout_seconds=30)

    assert outcome.success is True
    assert outcome.netlist_json is not None
    assert "modules" in outcome.netlist_json
    assert "top" in outcome.netlist_json["modules"]
    assert outcome.synthesized_verilog is not None
    assert "module top" in outcome.synthesized_verilog
    assert outcome.stat_report is not None
    assert "Printing statistics" in outcome.stat_report


@pytest.mark.skipif(not _YOSYS_AVAILABLE, reason="yosys is not installed in this environment")
def test_real_yosys_reports_a_syntax_error_honestly() -> None:
    yosys_path = _REAL_YOSYS_PATH if shutil.which(_REAL_YOSYS_PATH) else "yosys"

    outcome = run_yosys("module top (input a); this is not valid verilog", "top", yosys_path=yosys_path, timeout_seconds=30)

    assert outcome.success is False
    assert outcome.failure_reason == "YOSYS_SYNTHESIS_FAILED"
