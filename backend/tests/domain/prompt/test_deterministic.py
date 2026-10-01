from app.domain.guardrails.validator import run_guardrails
from app.domain.ir.examples import mux_2to1_document
from app.domain.prompt.deterministic import resolve_prompt_deterministically as resolve_prompt
from app.domain.simulation.engine import simulate


def test_and_gate_aliases_resolve() -> None:
    for prompt in ["and", "and gate", "AND gate", "Show me an AND gate"]:
        result = resolve_prompt(prompt)
        assert result.is_recognized is True
        assert result.circuit_key == "and_gate"
        assert result.document is not None
        assert result.document.name == "AND Gate"


def test_mux_aliases_resolve() -> None:
    for prompt in ["mux", "multiplexer", "2:1 mux", "2 to 1 multiplexer", "Visualize a 2:1 mux"]:
        result = resolve_prompt(prompt)
        assert result.is_recognized is True
        assert result.circuit_key == "mux_2to1"
        assert result.document is not None
        assert result.document.name == "2:1 Multiplexer"


def test_unrecognized_prompt_returns_honest_result_never_fabricated() -> None:
    result = resolve_prompt("show me a purple elephant adder")
    assert result.is_recognized is False
    assert result.circuit_key is None
    assert result.document is None
    assert result.message  # non-empty, honest explanation


def test_word_boundary_matching_does_not_false_positive() -> None:
    # "and" must not match inside an unrelated word like "handle"
    result = resolve_prompt("please handle this request")
    assert result.is_recognized is False


def test_mux_document_passes_guardrails_and_is_fully_simulatable() -> None:
    document = mux_2to1_document()

    guardrail_result = run_guardrails(document)
    assert guardrail_result.is_valid is True
    assert guardrail_result.errors == []

    # SEL=0 -> Y=A ; SEL=1 -> Y=B (full truth table)
    cases = [
        (0, 0, 0, "0"), (1, 0, 0, "1"), (0, 1, 0, "0"), (1, 1, 0, "1"),
        (0, 0, 1, "0"), (1, 0, 1, "0"), (0, 1, 1, "1"), (1, 1, 1, "1"),
    ]
    for a, b, sel, expected_y in cases:
        result = simulate(document, {"in_a.out": a, "in_b.out": b, "in_sel.out": sel})
        assert result.is_valid is True
        y_signal = next(s for s in result.final_signals if s.source_port_id == "out_y.in")
        assert y_signal.value.value == expected_y, f"A={a} B={b} SEL={sel}"
