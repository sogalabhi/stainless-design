from typing import Any

import pytest

from helpers import GAMMA_M0, E, grade_material
from stainless_csm.core.enums import SectionType, StainlessFamily
from stainless_csm.core.errors import InvalidMaterialError, NotApplicableError
from stainless_csm.csm.tension import (
    SLENDERNESS_NOT_CHECKED_NOTE,
    CSMTension,
    GoverningStrainLimit,
    TensionInput,
    TensionResult,
)
from stainless_csm.data.repository import GradeRepository
from stainless_csm.material_models.csm_bilinear import CSMBilinearModel
from stainless_csm.materials.material import Material

FIXED = GoverningStrainLimit.FIXED_LIMIT_15
DUCTILITY = GoverningStrainLimit.MATERIAL_DUCTILITY


def model_for(designation: str) -> CSMBilinearModel:
    return CSMBilinearModel(grade_material(designation))


def run(designation: str = "1.4307", area: float = 1000.0, **kwargs: Any) -> TensionResult:
    kwargs.setdefault("gamma_m0", GAMMA_M0)
    data = TensionInput(model_for(designation), area, SectionType.I_SECTION, **kwargs)
    return CSMTension(data).calculate()


# grade, ratio, governs, f_csm_t, N_csm_t_Rd (N)   for A = 1000 mm², γM0 = 1.10
CASES = [
    ("1.4307", 15.0, FIXED, 256.5, 233_150),
    ("1.4003", 15.0, FIXED, 279.5, 254_060),
    ("1.4462", 13.68, DUCTILITY, 571.4, 519_470),
]


@pytest.mark.parametrize(("designation", "ratio", "governs", "f", "n_rd"), CASES)
def test_hand_checked_values(
    designation: str,
    ratio: float,
    governs: GoverningStrainLimit,
    f: float,
    n_rd: float,
) -> None:
    r = run(designation)
    assert r.strain_ratio == pytest.approx(ratio, rel=1e-3)
    assert r.governing is governs
    assert r.design_stress == pytest.approx(f, rel=1e-3)
    assert r.resistance == pytest.approx(n_rd, rel=1e-3)


@pytest.mark.parametrize("designation", GradeRepository.load_default().designations())
def test_f_csm_t_is_between_fy_and_fu(designation: str) -> None:
    m = model_for(designation)
    r = run(designation)
    assert m.material.fy <= r.design_stress <= m.material.fu


@pytest.mark.parametrize("designation", GradeRepository.load_default().designations())
def test_code_form_equals_hardening_line_form(designation: str) -> None:
    """B.13 must be the same point as σ = f_y + E_sh (ε − ε_y) on the B.4 curve."""
    m = model_for(designation)
    r = run(designation)
    assert r.design_stress == pytest.approx(m.stress_at(r.strain))


def test_governing_term_is_the_smaller_one() -> None:
    m = model_for("1.4462")
    r = run("1.4462")
    assert r.strain_ratio == pytest.approx(m.strain_limit_ratio_c1)
    assert r.strain == pytest.approx(m.strain_limit_c1)


def test_holes_are_not_covered() -> None:
    with pytest.raises(NotApplicableError, match=r"B\.6\.1"):
        run(has_holes=True)


@pytest.mark.parametrize("area", [0.0, -5.0, float("nan"), float("inf")])
def test_bad_area_rejected(area: float) -> None:
    with pytest.raises(InvalidMaterialError):
        run(area=area)


def test_bad_gamma_rejected() -> None:
    with pytest.raises(InvalidMaterialError):
        run(gamma_m0=0.0)


def test_gamma_m0_is_applied() -> None:
    assert run(gamma_m0=1.0).resistance == pytest.approx(run(gamma_m0=1.1).resistance * 1.1)


def test_there_is_no_pass_fail_verdict_or_utilisation() -> None:
    """The engine reports the CSM resistance only: no force check and no classic comparison."""
    result = run()
    assert not hasattr(result, "utilisation")
    assert not hasattr(result, "passes")
    assert not hasattr(TensionInput, "design_force")
    assert not hasattr(result, "classic_resistance")
    assert not hasattr(result, "gain")


def test_trace_covers_the_whole_chain() -> None:
    r = run("1.4307")
    symbols = [s.symbol for s in r.trace]
    assert symbols[:3] == ["E", "C₁", "C₂"]  # B.4 steps come first
    for expected in ("ε_csm,t/ε_y", "ε_csm,t", "f_csm,t", "N_csm,t,Rd"):
        assert expected in symbols
    assert r.trace.get("N_csm,t,Rd").value == r.resistance
    assert r.trace.get("f_csm,t").clause == "B.6.1"


def test_scope_note_is_always_reported() -> None:
    assert SLENDERNESS_NOT_CHECKED_NOTE in run().notes


def test_ductility_below_one_adds_a_warning_note() -> None:
    # fu barely above fy: C₁ε_u/ε_y ≈ 0.76 < 1, yet C₂ε_u > ε_y so the B.4 model is still valid.
    m = CSMBilinearModel(Material(StainlessFamily.AUSTENITIC, 210, 211.69, E))
    r = CSMTension(TensionInput(m, 1000, SectionType.RHS, GAMMA_M0)).calculate()
    assert r.strain_ratio < 1
    assert r.design_stress < 210
    assert any("below 1" in n for n in r.notes)
