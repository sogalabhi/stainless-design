import math

import pytest

from helpers import E
from stainless_csm.core.enums import StainlessFamily
from stainless_csm.core.errors import InvalidMaterialError, OutOfRangeError
from stainless_csm.data.repository import GradeRepository
from stainless_csm.material_models.base import MaterialModel
from stainless_csm.material_models.csm_bilinear import CSMBilinearModel
from stainless_csm.materials.material import Material

# designation, eps_y, eps_u, E_sh, C1*eps_u/eps_y  (hand-checked)
CASES = [
    ("1.4307", 0.00105, 0.58, 3160.8, 55.2),
    ("1.4003", 0.00125, 0.2667, 1684.0, 85.3),
    ("1.4462", 0.00225, 0.3077, 4257.0, 13.7),
]


def model_for(designation: str) -> CSMBilinearModel:
    grade = GradeRepository.load_default().get(designation)
    return CSMBilinearModel(Material.from_grade(grade, E))


@pytest.mark.parametrize(("designation", "eps_y", "eps_u", "e_sh", "ratio"), CASES)
def test_hand_checked_values(
    designation: str, eps_y: float, eps_u: float, e_sh: float, ratio: float
) -> None:
    m = model_for(designation)
    assert m.yield_strain == pytest.approx(eps_y, rel=1e-3)
    assert m.ultimate_strain == pytest.approx(eps_u, rel=1e-3)
    assert m.strain_hardening_modulus == pytest.approx(e_sh, rel=1e-3)
    assert m.strain_limit_c1 / m.yield_strain == pytest.approx(ratio, rel=1e-2)


@pytest.mark.parametrize("designation", [c[0] for c in CASES])
def test_curve_hits_fy_and_fu(designation: str) -> None:
    m = model_for(designation)
    assert m.stress_at(m.yield_strain) == pytest.approx(m.material.fy)
    assert m.stress_at(m.strain_end) == pytest.approx(m.material.fu)


@pytest.mark.parametrize("designation", [c[0] for c in CASES])
def test_curve_is_continuous_at_yield(designation: str) -> None:
    m = model_for(designation)
    eps = m.yield_strain
    below, above = m.stress_at(eps * (1 - 1e-9)), m.stress_at(eps * (1 + 1e-9))
    assert above == pytest.approx(below, rel=1e-6)


def test_is_a_material_model() -> None:
    assert isinstance(model_for("1.4307"), MaterialModel)


def test_elastic_branch_slope_is_E() -> None:
    m = model_for("1.4307")
    assert m.stress_at(0.0005) == pytest.approx(0.0005 * 200_000)


def test_compression_mirrors_tension() -> None:
    m = model_for("1.4462")
    for strain in (0.001, 0.01, 0.04):
        assert m.stress_at(-strain) == -m.stress_at(strain)


@pytest.mark.parametrize("bad", [1.0, -1.0, math.nan, math.inf])
def test_no_extrapolation(bad: float) -> None:
    m = model_for("1.4307")
    with pytest.raises(OutOfRangeError):
        m.stress_at(bad)


def test_end_of_curve_is_inclusive() -> None:
    m = model_for("1.4307")
    m.stress_at(m.strain_end)
    m.stress_at(-m.strain_end)


def test_fy_barely_below_fu_is_rejected() -> None:
    # eps_u ~ 5e-7, so C2*eps_u < eps_y and E_sh would be negative/infinite.
    with pytest.raises(InvalidMaterialError, match="too close to 1"):
        CSMBilinearModel(Material(StainlessFamily.AUSTENITIC, 210, 210.0001, E))


def test_key_points() -> None:
    m = model_for("1.4307")
    (o, y, c1, end) = m.key_points()
    assert o == (0.0, 0.0)
    assert y == (m.yield_strain, 210.0)
    assert c1[0] == m.strain_limit_c1
    assert end[1] == pytest.approx(500.0)
    assert 210.0 < c1[1] < 500.0


def test_curve_points_are_increasing_and_include_kinks() -> None:
    m = model_for("1.4307")
    points = m.curve_points(50)
    strains = [s for s, _ in points]
    stresses = [f for _, f in points]
    assert strains == sorted(set(strains))
    assert stresses == sorted(stresses)
    assert m.yield_strain in strains
    assert m.strain_limit_c1 in strains
    assert strains[-1] == m.strain_end


def test_trace_records_every_derived_value() -> None:
    m = model_for("1.4307")
    trace = m.trace
    assert [s.symbol for s in trace] == [
        "E",
        "C₁",
        "C₂",
        "C₃",
        "ε_y",
        "ε_u",
        "E_sh",
        "C₁ε_u",
        "C₂ε_u",
        "σ(C₁ε_u)",
        "E_sh/E",
        "C₁ε_u/ε_y",
    ]
    assert trace.get("ε_y").value == m.yield_strain
    assert trace.get("ε_y").substituted == "210 / 200000"
    assert trace.get("E_sh").value == m.strain_hardening_modulus
    assert trace.get("E").clause == "input"
    assert all(s.clause == "B.4" for s in trace if s.symbol != "E")


def test_stress_at_strain_limit_c1_and_ratios() -> None:
    m = model_for("1.4307")
    assert m.stress_at_strain_limit_c1 == pytest.approx(m.stress_at(m.strain_limit_c1))
    assert m.stress_at_strain_limit_c1 == pytest.approx(210 + 3160.8 * (0.058 - 0.00105), rel=1e-4)
    assert m.hardening_ratio == pytest.approx(3160.8 / 200_000, rel=1e-4)
    assert m.strain_limit_ratio_c1 == pytest.approx(55.2, rel=1e-3)
    assert m.trace.get("σ(C₁ε_u)").value == m.stress_at_strain_limit_c1


@pytest.mark.parametrize("designation", [c[0] for c in CASES])
def test_hardening_line_has_slope_E_sh(designation: str) -> None:
    m = model_for(designation)
    e1, e2 = m.yield_strain * 3, m.strain_end * 0.9
    slope = (m.stress_at(e2) - m.stress_at(e1)) / (e2 - e1)
    assert slope == pytest.approx(m.strain_hardening_modulus)


@pytest.mark.parametrize("designation", GradeRepository.load_default().designations())
def test_every_table_5_1_grade_builds_a_valid_model(designation: str) -> None:
    m = model_for(designation)
    assert 0 < m.yield_strain < m.strain_limit_c1 < m.strain_end
    assert m.strain_hardening_modulus > 0
    assert m.stress_at(m.strain_end) == pytest.approx(m.material.fu)
