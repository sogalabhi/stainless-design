import math

import pytest

from helpers import OMEGA, grade_material
from stainless_csm.core.errors import InvalidSectionError, NotApplicableError
from stainless_csm.csm.deformation_capacity import (
    LIMITS,
    CapSource,
    CSMDeformationCapacity,
    DeformationResult,
    SectionFamily,
    Zone,
    curve_points,
    raw_ratio,
    strain_cap,
)
from stainless_csm.material_models.csm_bilinear import CSMBilinearModel

PLATES = SectionFamily.FLAT_PLATES
CHS = SectionFamily.CIRCULAR_HOLLOW


def model_for(designation: str = "1.4307") -> CSMBilinearModel:
    return CSMBilinearModel(grade_material(designation))


def run(
    lam: float,
    family: SectionFamily = PLATES,
    designation: str = "1.4307",
    omega: float = 15.0,
) -> DeformationResult:
    return CSMDeformationCapacity(model_for(designation), family, lam, omega).calculate()


# --- the base curves (sanity checks built into the code) ------------------------------------


def test_plate_curve_is_continuous_at_0_68() -> None:
    low = 0.25 / 0.68**3.6
    high = raw_ratio(PLATES, 0.680001)
    assert low == pytest.approx(1.0, abs=0.01)
    assert high == pytest.approx(1.0, abs=0.01)
    assert low == pytest.approx(high, abs=0.01)


def test_chs_curve_is_continuous_at_0_30() -> None:
    low = 4.44e-3 / 0.30**4.5
    high = raw_ratio(CHS, 0.300001)
    assert low == pytest.approx(1.0, abs=0.01)
    assert high == pytest.approx(1.0, abs=0.01)


def test_the_cap_of_15_starts_near_lambda_0_32() -> None:
    start = (0.25 / 15) ** (1 / 3.6)
    assert start == pytest.approx(0.32, abs=0.005)
    assert raw_ratio(PLATES, start) == pytest.approx(15.0)
    # below it every section gets the same strain limit
    assert run(0.20).strain_ratio == run(0.30).strain_ratio == 15.0


def test_curve_decreases_with_slenderness() -> None:
    for family in (PLATES, CHS):
        points = curve_points(family, 15.0, 50)
        ratios = [r for _, r in points]
        assert ratios == sorted(ratios, reverse=True)
        assert points[-1][0] == pytest.approx(LIMITS[family].upper)
        assert ratios[-1] < 1.0  # at the upper limit the strain capacity is below yield strain


def test_at_the_upper_limits_the_ratio_is_below_one() -> None:
    # hand-calculated: 1.6^1.05 = 1.6379 -> (1 - 0.222/1.6379)/1.6379 = 0.528
    assert raw_ratio(PLATES, 1.60) == pytest.approx(0.528, abs=0.002)
    # 0.6^0.342 = 0.8397 -> (1 - 0.224/0.8397)/0.8397 = 0.873
    assert raw_ratio(CHS, 0.60) == pytest.approx(0.873, abs=0.002)


# --- caps -----------------------------------------------------------------------------------


def test_cap_is_omega_for_austenitic_and_ductility_for_duplex() -> None:
    cap, source = strain_cap(model_for("1.4307"), OMEGA)
    assert (cap, source) == (15.0, CapSource.OMEGA)
    cap, source = strain_cap(model_for("1.4462"), OMEGA)
    assert cap == pytest.approx(13.68, abs=0.01)
    assert source is CapSource.MATERIAL_DUCTILITY


def test_omega_is_a_separate_national_annex_setting() -> None:
    assert run(0.2, omega=10.0).strain_ratio == 10.0
    assert run(0.2, omega=25.0).strain_ratio == 25.0


# --- results --------------------------------------------------------------------------------


def test_hand_checked_stocky_plate() -> None:
    # lambda = 0.3408 (b = 100, t = 5, k = 4, fy = 210): 0.25 / 0.3408^3.6 = 12.03
    r = run(0.34085)
    assert r.zone is Zone.STOCKY
    assert r.raw_ratio == pytest.approx(12.03, rel=1e-2)
    assert r.strain_ratio == pytest.approx(12.03, rel=1e-2)
    assert not r.capped
    assert r.strain == pytest.approx(r.strain_ratio * 0.00105)


def test_stocky_value_above_the_cap_is_held_to_the_cap() -> None:
    r = run(0.25)
    assert r.raw_ratio is not None
    assert r.raw_ratio > 15
    assert r.strain_ratio == 15.0
    assert r.capped


def test_slender_plate_uses_the_second_branch_without_a_cap() -> None:
    r = run(1.0)
    assert r.zone is Zone.SLENDER
    assert r.strain_ratio == pytest.approx((1 - 0.222) / 1.0)
    assert not r.capped


def test_chs_branches() -> None:
    stocky = run(0.17, CHS)
    assert stocky.zone is Zone.STOCKY
    assert stocky.strain_ratio == pytest.approx(4.44e-3 / 0.17**4.5, rel=1e-6)
    slender = run(0.45, CHS)
    assert slender.zone is Zone.SLENDER
    power = 0.45**0.342
    assert slender.strain_ratio == pytest.approx((1 - 0.224 / power) / power)


@pytest.mark.parametrize(("family", "lam"), [(PLATES, 1.61), (PLATES, 2.5), (CHS, 0.61)])
def test_beyond_the_limit_it_says_so_and_gives_no_number(family: SectionFamily, lam: float) -> None:
    r = run(lam, family)
    assert not r.allowed
    assert r.zone is Zone.NOT_ALLOWED
    assert r.strain_ratio is None
    assert r.strain is None
    assert r.message is not None
    assert "too slender" in r.message
    assert f"{lam:.3f}" in r.message
    with pytest.raises(NotApplicableError, match="too slender"):
        r.require_allowed()


def test_exactly_at_the_limit_is_allowed() -> None:
    assert run(1.60).allowed
    assert run(0.60, CHS).allowed
    run(1.60).require_allowed()


@pytest.mark.parametrize("lam", [0.0, -1.0, math.nan, math.inf])
def test_bad_slenderness_rejected(lam: float) -> None:
    with pytest.raises(InvalidSectionError):
        run(lam)


def test_bad_omega_rejected() -> None:
    with pytest.raises(InvalidSectionError):
        run(0.5, omega=0.0)


def test_trace_and_latex() -> None:
    r = run(0.34085)
    symbols = [s.symbol for s in r.trace]
    assert symbols == [
        "λ_cs",
        "min(Ω, C₁ε_u/ε_y)",
        "(ε_csm/ε_y) base curve",
        "ε_csm/ε_y",
        "ε_csm",
    ]
    assert all(s.clause in ("B.5.1", "B.5.2") and s.latex for s in r.trace)
    assert all("<" not in s.latex for s in r.trace)
    assert r"\frac{0.25}{" in r.trace.get("(ε_csm/ε_y) base curve").latex
