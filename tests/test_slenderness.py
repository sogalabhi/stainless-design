import math

import pytest

from helpers import K_INTERNAL, K_OUTSTAND, NU, E, grade_material
from stainless_csm.core.errors import InvalidSectionError
from stainless_csm.csm.slenderness import (
    PlateElement,
    SigmaCrSource,
    chs_critical_stress,
    chs_slenderness,
    direct_slenderness,
    plate_critical_stress,
    plates_slenderness,
)


def b9(k: float, t: float, b: float) -> float:
    """Formula B.9 written out independently of the code under test."""
    return k * math.pi**2 * E * t**2 / (12 * (1 - NU**2) * b**2)


def plate(label: str = "p", width: float = 100, thickness: float = 5, k: float = K_INTERNAL):  # type: ignore[no-untyped-def]
    return PlateElement(label, width, thickness, k)


def test_k_sigma_is_always_an_input() -> None:
    """There is no default: it comes from EN 1993-1-5, outside Annex B."""
    with pytest.raises(TypeError):
        PlateElement("a", 100, 5)  # type: ignore[call-arg]
    assert PlateElement("a", 100, 5, 5.0).k_sigma == 5.0


def test_b9_hand_checked() -> None:
    # b = 100, t = 5, k = 4: 197 392 088 / 109 200 = 1807.6 N/mm2
    assert plate_critical_stress(plate(), E, NU) == pytest.approx(1807.6, rel=1e-3)


def test_b9_uses_the_poisson_ratio_it_is_given() -> None:
    low = plate_critical_stress(plate(), E, 0.2)
    high = plate_critical_stress(plate(), E, 0.4)
    assert low == pytest.approx(b9(4.0, 5, 100) * (1 - NU**2) / (1 - 0.2**2))
    assert high > low  # sigma_cr is proportional to 1 / (1 - nu^2)


def test_single_plate_slenderness_b8() -> None:
    result = plates_slenderness([plate()], grade_material(), NU)
    assert result.sigma_cr_cs == pytest.approx(1807.6, rel=1e-3)
    assert result.slenderness == pytest.approx(math.sqrt(210 / 1807.6), rel=1e-3)
    assert result.slenderness == pytest.approx(0.3408, rel=1e-3)
    assert result.source is SigmaCrSource.PLATE_B9


def test_most_slender_plate_governs() -> None:
    plates = [plate("web", 200, 4, K_INTERNAL), plate("flange", 40, 6, K_OUTSTAND)]
    result = plates_slenderness(plates, grade_material(), NU)
    stresses = {p.plate.label: p.sigma_cr for p in result.plates}
    assert stresses["web"] == pytest.approx(b9(4.0, 4, 200))
    assert stresses["flange"] == pytest.approx(b9(0.43, 6, 40))
    expected = min(stresses.values())
    assert result.sigma_cr_cs == pytest.approx(expected)
    assert result.governing_label == min(stresses, key=lambda k: stresses[k])


def test_the_users_k_sigma_is_used_not_a_built_in_one() -> None:
    a = plates_slenderness([plate(k=4.0)], grade_material(), NU)
    b = plates_slenderness([plate(k=8.0)], grade_material(), NU)
    assert b.sigma_cr_cs == pytest.approx(2 * a.sigma_cr_cs)


def test_stronger_steel_is_more_slender_for_the_same_plate() -> None:
    soft = plates_slenderness([plate()], grade_material("1.4307"), NU).slenderness
    strong = plates_slenderness([plate()], grade_material("1.4462"), NU).slenderness
    assert strong == pytest.approx(soft * math.sqrt(450 / 210))


def test_the_elastic_modulus_is_the_one_given() -> None:
    soft = plates_slenderness([plate()], grade_material(elastic_modulus=E), NU)
    stiff = plates_slenderness([plate()], grade_material(elastic_modulus=2 * E), NU)
    assert stiff.sigma_cr_cs == pytest.approx(2 * soft.sigma_cr_cs)


def test_chs_b11_hand_checked() -> None:
    # E / sqrt(3 (1 - 0.09)) * 2t/d for d = 100, t = 3
    expected = E / math.sqrt(3 * 0.91) * 0.06
    assert chs_critical_stress(100, 3, E, NU) == pytest.approx(expected)
    result = chs_slenderness(100, 3, grade_material(), NU)
    assert result.slenderness == pytest.approx(math.sqrt(210 / expected))
    assert result.slenderness == pytest.approx(0.170, abs=0.002)
    assert result.source is SigmaCrSource.CHS_B11


def test_direct_sigma_cr() -> None:
    result = direct_slenderness(840.0, grade_material())
    assert result.slenderness == pytest.approx(0.5)
    assert result.source is SigmaCrSource.USER


@pytest.mark.parametrize("bad", [0.0, -3.0, math.nan, math.inf])
def test_bad_numbers_rejected(bad: float) -> None:
    with pytest.raises(InvalidSectionError):
        plate(width=bad)
    with pytest.raises(InvalidSectionError):
        plate(thickness=bad)
    with pytest.raises(InvalidSectionError):
        plate(k=bad)
    with pytest.raises(InvalidSectionError):
        direct_slenderness(bad, grade_material())


@pytest.mark.parametrize("bad", [-0.1, 0.5, 0.9, math.nan])
def test_poisson_ratio_must_be_physical(bad: float) -> None:
    with pytest.raises(InvalidSectionError, match="Poisson"):
        plates_slenderness([plate()], grade_material(), bad)
    with pytest.raises(InvalidSectionError, match="Poisson"):
        chs_slenderness(100, 3, grade_material(), bad)


def test_empty_and_duplicate_plates_rejected() -> None:
    with pytest.raises(InvalidSectionError, match="at least one"):
        plates_slenderness([], grade_material(), NU)
    twin = plate("same")
    with pytest.raises(InvalidSectionError, match="different"):
        plates_slenderness([twin, twin], grade_material(), NU)


def test_chs_thickness_must_be_less_than_half_the_diameter() -> None:
    with pytest.raises(InvalidSectionError):
        chs_critical_stress(10, 5, E, NU)


def test_trace_has_each_plate_and_the_b8_step_with_latex() -> None:
    plates = [plate("web", 138, 4), plate("flange", 88, 4)]
    result = plates_slenderness(plates, grade_material(), NU)
    symbols = [s.symbol for s in result.trace]
    assert "σ_cr,p [web]" in symbols
    assert "λ_p [flange]" in symbols
    assert symbols[-2:] == ["σ_cr,cs", "λ_p,cs"]
    for step in result.trace:
        assert step.latex
        assert "<" not in step.latex
        assert step.latex.count("{") == step.latex.count("}")


def test_user_labels_cannot_break_the_latex() -> None:
    result = plates_slenderness([plate(r"web \end{x} $")], grade_material(), NU)
    for step in result.trace:
        assert "$" not in step.latex
        assert step.latex.count("{") == step.latex.count("}")
