from stainless_csm import formatting as fmt
from stainless_csm.core.trace import CalcStep


def test_kn_converts_only_for_display() -> None:
    assert fmt.kn(233_150) == 233.15


def test_number_formats() -> None:
    assert fmt.number(0.00105) == "0.00105"
    assert fmt.number(3160.8) == "3 160.8"
    assert fmt.number(0.58) == "0.58"
    assert fmt.number(0) == "0"


def test_percent() -> None:
    assert fmt.percent(0.2194, signed=True) == "+22 %"
    assert fmt.percent(0.43) == "43 %"


def test_step_line_shows_symbolic_substituted_and_result() -> None:
    step = CalcStep("ε_u", "d", "B.4", "C₃ (1 − f_y / f_u)", "1 × (1 − 210 / 500)", 0.58, "–")
    assert fmt.step_line(step) == "ε_u = C₃ (1 − f_y / f_u) = 1 × (1 − 210 / 500) = 0.58"


def test_step_line_for_table_lookups() -> None:
    step = CalcStep("C₁", "d", "B.4", "Table B.1", "austenitic", 0.1, "–")
    assert fmt.step_line(step) == "C₁ = 0.1   (Table B.1: austenitic)"
    e = CalcStep("E", "d", "5.1.5", "5.1.5", "200000", 200000.0, "N/mm²")
    assert fmt.step_line(e).startswith("E = 200 000.0 N/mm²")
