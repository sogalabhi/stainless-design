import pytest

from helpers import GAMMA_M0, grade_material
from stainless_csm.core.enums import SectionType
from stainless_csm.core.latex import number_tex, tex
from stainless_csm.csm.tension import CSMTension, TensionInput
from stainless_csm.data.repository import GradeRepository
from stainless_csm.material_models.csm_bilinear import CSMBilinearModel


def test_tex_fills_placeholders_without_brace_doubling() -> None:
    out = tex(r"\varepsilon_y = \frac{f_y}{E} = \frac{<fy>}{<e>}", fy=210, e=200000)
    assert out == r"\varepsilon_y = \frac{f_y}{E} = \frac{210}{200000}"


def test_numbers_are_compact_and_tiny_ones_use_powers_of_ten() -> None:
    assert number_tex(0.00105) == "0.00105"
    assert number_tex(3160.7629427792913) == "3160.76"
    assert number_tex(1.5e-7) == r"1.5 \times 10^{-7}"


def test_text_values_are_inserted_as_given() -> None:
    assert tex(r"\text{<f>}", f="austenitic") == r"\text{austenitic}"


def balanced(latex: str) -> bool:
    depth = 0
    for char in latex:
        depth += char == "{"
        depth -= char == "}"
        if depth < 0:
            return False
    return depth == 0


@pytest.mark.parametrize("designation", GradeRepository.load_default().designations())
def test_every_step_has_balanced_latex_with_no_leftover_placeholders(designation: str) -> None:
    model = CSMBilinearModel(grade_material(designation))
    result = CSMTension(TensionInput(model, 1000.0, SectionType.I_SECTION, GAMMA_M0)).calculate()
    assert len(list(result.trace)) == 16
    for step in result.trace:
        assert step.latex, step.symbol
        assert balanced(step.latex), step.latex
        assert "<" not in step.latex and ">" not in step.latex, step.latex


def test_latex_carries_the_actual_numbers() -> None:
    model = CSMBilinearModel(grade_material("1.4307"))
    assert r"\frac{210}{200000}" in model.trace.get("ε_y").latex
    assert "0.00105" in model.trace.get("ε_y").latex
    assert r"\frac{500 - 210}{" in model.trace.get("E_sh").latex
    assert r"\mathrm{N/mm^2}" in model.trace.get("E_sh").latex
