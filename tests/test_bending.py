"""B.6.3.1(1) and B.6.3.2: bending about an axis of symmetry, Formulas B.19 and B.20, Table B.2."""

import dataclasses
import math
from typing import Any

import pytest

from helpers import GAMMA_M0, NU, OMEGA, E, grade_material
from stainless_csm import services
from stainless_csm.core.enums import SectionType, StainlessFamily
from stainless_csm.core.errors import (
    InvalidMaterialError,
    InvalidSectionError,
    NotApplicableError,
    NotBuiltYetError,
)
from stainless_csm.core.trace import CalcTrace
from stainless_csm.csm.bending import (
    BendingAxis,
    BendingFormula,
    BendingInput,
    BendingResult,
    CSMBending,
    about_axis_of_symmetry,
    check_scope,
    formula_for,
    moment_at,
    moment_b19,
    moment_b20,
    table_b2_row,
    table_b2_rows,
)
from stainless_csm.csm.deformation_capacity import (
    CapSource,
    CSMDeformationCapacity,
    DeformationResult,
    SectionFamily,
    Zone,
)
from stainless_csm.material_models.csm_bilinear import CSMBilinearModel
from stainless_csm.materials.material import Material
from stainless_csm.sections.templates import Fabrication, PlateRole

B19, B20 = BendingFormula.B19, BendingFormula.B20
MAJOR, MINOR = BendingAxis.MAJOR, BendingAxis.MINOR
I_SECTION, CHANNEL, T_SECTION = SectionType.I_SECTION, SectionType.CHANNEL, SectionType.T_SECTION
ANGLE, RHS, CHS = SectionType.ANGLE, SectionType.RHS, SectionType.CHS

# The worked example (plan.md 4f): austenitic, f_y = 230, f_u = 540, E = 200000 N/mm²,
# W_el = 194318 mm³, W_pl = 220640 mm³, γM0 = 1.1, α = 2.0 (I-section, major axis).
#   ε_y  = 230 / 200000                          = 0.00115
#   ε_u  = C3 (1 - f_y/f_u) = 1.00 (1 - 230/540) = 0.574074
#   E_sh = (540 - 230) / (C2 ε_u - ε_y)          = 310 / (0.16 × 0.574074 - 0.00115)
#        = 310 / 0.0907019                       = 3417.79 N/mm²
#   E_sh / E = 3417.79 / 200000                  = 0.01708896
#   W_el / W_pl = 194318 / 220640                = 0.88070160
#   W_el f_y / γM0 = 194318 × 230 / 1.1 = 44 693 140 / 1.1 = 40 630 127.3 N mm   (M_el)
#   W_pl f_y / γM0 = 220640 × 230 / 1.1 = 50 747 200 / 1.1 = 46 133 818.2 N mm   (M_pl)
FY, FU = 230.0, 540.0
W_EL, W_PL, GAMMA = 194_318.0, 220_640.0, 1.1
E_SH = 310.0 / (0.16 * (1 - 230.0 / 540.0) - 230.0 / 200000.0)
M_EL = 40_630_127.27
M_PL = 46_133_818.18


def worked_model() -> CSMBilinearModel:
    return CSMBilinearModel(Material(StainlessFamily.AUSTENITIC, FY, FU, E))


def deformation_at(ratio: float, model: CSMBilinearModel | None = None) -> DeformationResult:
    """A B.5.1 result with a chosen ε_csm/ε_y, so B.6.3.2 can be tested at exact ratios."""
    model = model or worked_model()
    return DeformationResult(
        SectionFamily.FLAT_PLATES,
        0.5,
        Zone.STOCKY,
        15.0,
        CapSource.OMEGA,
        ratio,
        False,
        ratio,
        ratio * model.yield_strain,
        None,
        CalcTrace(),
    )


def bend(
    ratio: float,
    section_type: SectionType = I_SECTION,
    axis: BendingAxis | None = MAJOR,
    w_el: float = W_EL,
    w_pl: float = W_PL,
    gamma_m0: float = GAMMA,
    lambda_lt: float = 0.15,
    h_over_b: float | None = None,
    legs_equal: bool | None = None,
) -> BendingResult:
    model = worked_model()
    data = BendingInput(
        model,
        deformation_at(ratio, model),
        section_type,
        axis,
        w_el,
        w_pl,
        gamma_m0,
        lambda_lt,
        h_over_b,
        legs_equal,
    )
    return CSMBending(data).calculate()


def test_worked_example_material_values() -> None:
    m = worked_model()
    assert m.yield_strain == pytest.approx(0.00115)
    assert m.strain_hardening_modulus == pytest.approx(3417.79, abs=0.01)
    assert m.strain_hardening_modulus == pytest.approx(E_SH)
    assert m.strain_hardening_modulus / E == pytest.approx(0.01708896, abs=1e-8)
    assert pytest.approx(0.8807016, abs=1e-7) == W_EL / W_PL


def test_reference_moments() -> None:
    r = bend(1.0)
    assert r.elastic_moment == pytest.approx(M_EL, abs=0.01)
    assert r.plastic_moment == pytest.approx(M_PL, abs=0.01)
    assert r.elastic_moment == pytest.approx(44_693_140 / 1.1)
    assert r.plastic_moment == pytest.approx(50_747_200 / 1.1)


def test_b19_below_one() -> None:
    # ε_csm/ε_y = 0.8: M = 0.8 × 194318 × 230 / 1.1 = 35 754 512 / 1.1 = 32 504 101.8 N mm
    r = bend(0.8)
    assert r.formula is B19
    assert r.resistance == pytest.approx(32_504_101.8, abs=0.1)
    assert r.resistance == pytest.approx(0.8 * M_EL, abs=0.1)


def test_b20_at_exactly_one_gives_w_el_fy_over_gamma() -> None:
    # ε_csm/ε_y = 1: bracket = 1 + 0 − (1 − 0.8807016)/1 = 0.8807016 = W_el/W_pl,
    # so M = (W_pl f_y / γM0) W_el / W_pl = W_el f_y / γM0 = 40 630 127.3 N mm
    r = bend(1.0)
    assert r.formula is B20
    assert r.resistance == pytest.approx(40_630_127.3, abs=0.1)
    assert r.resistance == pytest.approx(M_PL * (1 - (1 - W_EL / W_PL)), abs=0.1)


def test_b20_at_three() -> None:
    # bracket = 1 + 0.01708896 × 0.8807016 × (3 − 1) − (1 − 0.8807016) / 3²
    #         = 1 + 0.03010054 − 0.01325538 = 1.01684516
    # M = 46 133 818.2 × 1.01684516 = 46 910 950 N mm
    r = bend(3.0)
    assert r.formula is B20
    bracket = 1 + 0.01708896 * 0.8807016 * 2 - (1 - 0.8807016) / 9
    assert bracket == pytest.approx(1.01684516, abs=1e-7)
    assert r.resistance == pytest.approx(M_PL * bracket, rel=1e-7)
    assert r.resistance == pytest.approx(46_910_950, abs=1.0)


def test_b20_at_six() -> None:
    # bracket = 1 + 0.01708896 × 0.8807016 × 5 − (1 − 0.8807016) / 6² = 1 + 0.07525136 − 0.00331384
    #         = 1.07193752;  M = 46 133 818.2 × 1.07193752 = 49 452 570 N mm
    r = bend(6.0)
    bracket = 1 + 0.01708896 * 0.8807016 * 5 - (1 - 0.8807016) / 36
    assert bracket == pytest.approx(1.07193752, abs=1e-7)
    assert r.resistance == pytest.approx(M_PL * bracket, rel=1e-7)
    assert r.resistance == pytest.approx(49_452_570, abs=1.0)


def test_b20_with_another_alpha() -> None:
    # α = 1.2 at ε_csm/ε_y = 3: the last term is 0.1192984 / 3^1.2 = 0.1192984 / 3.737193
    #   = 0.0319219;  bracket = 1 + 0.03010054 − 0.0319219 = 0.99817864;  M = M_pl × bracket
    r = bend(3.0, I_SECTION, MINOR)
    assert r.alpha == 1.2
    last = (1 - W_EL / W_PL) / 3**1.2
    assert last == pytest.approx(0.0319219, abs=1e-7)
    assert r.resistance == pytest.approx(M_PL * (1 + 0.03010054 - last), rel=1e-7)


def test_b19_and_b20_meet_at_one() -> None:
    model = worked_model()
    at_one = moment_at(model, 1.0, W_EL, W_PL, 2.0, GAMMA)
    assert moment_b19(1.0, W_EL, FY, GAMMA) == pytest.approx(at_one, rel=1e-12)
    assert moment_b20(1.0, W_EL, W_PL, FY, E_SH / E, 2.0, GAMMA) == pytest.approx(at_one, rel=1e-12)
    assert at_one == pytest.approx(W_EL * FY / GAMMA)


def test_resistance_has_no_jump_across_one() -> None:
    below, at_one, above = bend(1 - 1e-9), bend(1.0), bend(1 + 1e-9)
    assert below.formula is B19
    assert at_one.formula is B20
    assert above.formula is B20
    assert below.resistance == pytest.approx(at_one.resistance, rel=1e-8)
    assert above.resistance == pytest.approx(at_one.resistance, rel=1e-8)


def test_formula_switches_at_one() -> None:
    assert formula_for(0.999999) is B19
    assert formula_for(1.0) is B20


def test_b20_tends_to_w_pl_fy_over_gamma_when_hardening_is_zero() -> None:
    """On the pure formula with E_sh = 0, the bracket tends to 1 as the strain ratio grows."""
    limit = W_PL * FY / GAMMA
    assert limit == pytest.approx(46_133_818.18, abs=0.01)
    values = [moment_b20(r, W_EL, W_PL, FY, 0.0, 2.0, GAMMA) for r in (2, 10, 100, 1e4, 1e8)]
    assert values == sorted(values)  # rises towards the limit
    assert all(v <= limit for v in values)  # float rounding reaches it at the end
    assert values[-1] == pytest.approx(limit, rel=1e-12)
    # at 10: bracket = 1 − 0.1192984 / 100 = 0.99880702, so M = 46 078 7xx
    assert values[1] == pytest.approx(limit * (1 - 0.1192984 / 100), rel=1e-7)


def test_b20_rises_with_the_strain_ratio_and_with_alpha() -> None:
    model = worked_model()
    curve = [moment_at(model, r, W_EL, W_PL, 2.0, GAMMA) for r in (0.2, 0.6, 1.0, 2.0, 5.0, 10.0)]
    assert curve == sorted(curve)
    steeper = moment_at(model, 3.0, W_EL, W_PL, 2.0, GAMMA)
    assert steeper > moment_at(model, 3.0, W_EL, W_PL, 1.0, GAMMA)


def test_when_w_pl_equals_w_el_b20_has_no_alpha_term() -> None:
    # W_el = W_pl: the last term (1 − W_el/W_pl)(...) vanishes, bracket = 1 + (E_sh/E)(ε/ε_y − 1)
    r = bend(4.0, w_el=200_000.0, w_pl=200_000.0)
    assert r.resistance == pytest.approx(200_000 * FY / GAMMA * (1 + E_SH / E * 3))


def test_gamma_and_moduli_are_applied() -> None:
    assert bend(3.0, gamma_m0=1.0).resistance == pytest.approx(bend(3.0).resistance * 1.1)
    assert bend(0.8, w_el=2 * W_EL, w_pl=2 * W_PL).resistance == pytest.approx(
        2 * bend(0.8).resistance
    )


# --- Table B.2 -------------------------------------------------------------------------------


def test_table_b2_is_the_whole_printed_table() -> None:
    rows = table_b2_rows()
    assert len(rows) == 13
    printed = [
        ("Rectangular hollow section", "any", "Any", 2.0),
        ("Circular hollow section", "any", "-", 2.0),
        ("I-section", "major", "Any", 2.0),
        ("I-section", "minor", "Any", 1.2),
        ("Channel section", "major", "Any", 2.0),
        ("Channel section", "minor", "h/b < 2", 1.5),
        ("Channel section", "minor", "h/b ≥ 2", 1.0),
        ("T-section", "major", "h/b < 1", 1.0),
        ("T-section", "major", "h/b ≥ 1", 1.5),
        ("T-section", "minor", "Any", 1.2),
        ("Equal angle", "any", "-", 1.0),
        ("Unequal angle", "major", "Any", 1.5),
        ("Unequal angle", "minor", "Any", 1.0),
    ]
    assert [(r.section, r.axis, r.aspect_ratio, r.alpha) for r in rows] == printed


@pytest.mark.parametrize(
    ("section_type", "axis", "h_over_b", "legs_equal", "alpha"),
    [
        (RHS, MAJOR, None, None, 2.0),
        (RHS, MINOR, None, None, 2.0),
        (RHS, None, None, None, 2.0),
        (CHS, None, None, None, 2.0),
        (CHS, MAJOR, None, None, 2.0),
        (I_SECTION, MAJOR, None, None, 2.0),
        (I_SECTION, MINOR, None, None, 1.2),
        (CHANNEL, MAJOR, None, None, 2.0),
        (CHANNEL, MAJOR, 3.0, None, 2.0),  # an h/b given where the table does not ask is ignored
        (CHANNEL, MINOR, 1.999, None, 1.5),
        (CHANNEL, MINOR, 2.0, None, 1.0),
        (CHANNEL, MINOR, 5.0, None, 1.0),
        (T_SECTION, MAJOR, 0.999, None, 1.0),
        (T_SECTION, MAJOR, 1.0, None, 1.5),
        (T_SECTION, MAJOR, 2.5, None, 1.5),
        (T_SECTION, MINOR, None, None, 1.2),
        (ANGLE, MAJOR, None, True, 1.0),
        (ANGLE, None, None, True, 1.0),
        (ANGLE, MAJOR, None, False, 1.5),
        (ANGLE, MINOR, None, False, 1.0),
    ],
)
def test_table_b2_lookup(
    section_type: SectionType,
    axis: BendingAxis | None,
    h_over_b: float | None,
    legs_equal: bool | None,
    alpha: float,
) -> None:
    if axis is None and section_type not in (CHS, ANGLE, RHS):
        pytest.skip("the axis is required for this shape")
    assert table_b2_row(section_type, axis, h_over_b, legs_equal).alpha == alpha


def test_table_b2_asks_for_what_it_needs() -> None:
    with pytest.raises(InvalidSectionError, match=r"h/b"):
        table_b2_row(CHANNEL, MINOR)
    with pytest.raises(InvalidSectionError, match=r"h/b"):
        table_b2_row(T_SECTION, MAJOR)
    with pytest.raises(InvalidSectionError, match="equal and unequal"):
        table_b2_row(ANGLE, MAJOR)
    with pytest.raises(InvalidSectionError, match="axis of bending"):
        table_b2_row(I_SECTION, None)


def test_every_section_type_and_axis_has_exactly_one_row() -> None:
    for section_type in SectionType:
        for axis in (MAJOR, MINOR):
            for h_over_b in (0.5, 1.0, 1.5, 2.0, 3.0):
                for legs_equal in (True, False):
                    row = table_b2_row(section_type, axis, h_over_b, legs_equal)
                    assert row.alpha in (1.0, 1.2, 1.5, 2.0)


def test_the_result_names_the_row_it_used() -> None:
    r = bend(3.0, I_SECTION, MINOR)
    assert (r.alpha_row.section, r.alpha_row.axis, r.alpha_row.alpha) == ("I-section", "minor", 1.2)
    alpha_step = r.trace.get("α")
    assert alpha_step.clause == "B.6.3.2"
    assert "Table B.2" in alpha_step.description
    assert "minor axis" in alpha_step.description
    assert alpha_step.value == 1.2


# --- the gate of B.6.3.1 and the scope of B.6.3.2 -------------------------------------------


@pytest.mark.parametrize(
    ("section_type", "axis", "inside"),
    [
        (I_SECTION, MAJOR, True),
        (I_SECTION, MINOR, True),
        (RHS, MAJOR, True),
        (RHS, MINOR, True),
        (CHS, None, True),
        (CHS, MAJOR, True),
        (CHANNEL, MAJOR, True),
        (CHANNEL, MINOR, False),
        (T_SECTION, MINOR, True),
        (T_SECTION, MAJOR, False),
        (ANGLE, MAJOR, False),
        (ANGLE, MINOR, False),
    ],
)
def test_which_axes_are_axes_of_symmetry(
    section_type: SectionType, axis: BendingAxis | None, inside: bool
) -> None:
    assert about_axis_of_symmetry(section_type, axis) is inside


@pytest.mark.parametrize(
    ("section_type", "axis"),
    [(CHANNEL, MINOR), (T_SECTION, MAJOR), (ANGLE, MAJOR), (ANGLE, MINOR)],
)
def test_phase_3_shapes_are_not_built_yet_not_refused(
    section_type: SectionType, axis: BendingAxis
) -> None:
    with pytest.raises(NotBuiltYetError, match=r"B\.6\.3\.3: arrives in phase 3") as error:
        check_scope(section_type, axis, 0.15)
    assert not isinstance(error.value, NotApplicableError)
    with pytest.raises(NotBuiltYetError):
        bend(3.0, section_type, axis, h_over_b=1.5, legs_equal=False)


def test_the_b18_range_is_not_built_yet() -> None:
    for lam in (0.2001, 0.3, 0.4):
        with pytest.raises(NotBuiltYetError, match=r"B\.18 interpolation: arrives in phase 3"):
            check_scope(I_SECTION, MAJOR, lam)
        with pytest.raises(NotBuiltYetError, match=r"B\.18"):
            bend(3.0, lambda_lt=lam)


def test_lambda_lt_up_to_0_2_is_calculated() -> None:
    for lam in (0.0, 0.1, 0.2):
        check_scope(I_SECTION, MAJOR, lam)
        assert bend(3.0, lambda_lt=lam).formula is B20


def test_lambda_lt_above_0_4_is_refused() -> None:
    for lam in (0.4001, 0.5, 2.0):
        with pytest.raises(NotApplicableError, match=r"B\.6\.3\.1 does not apply; use 8\.2\.4"):
            check_scope(I_SECTION, MAJOR, lam)
        with pytest.raises(NotApplicableError, match=r"use 8\.2\.4"):
            bend(3.0, lambda_lt=lam)


def test_the_refusal_comes_before_the_not_built_yet_messages() -> None:
    with pytest.raises(NotApplicableError, match=r"use 8\.2\.4"):
        check_scope(ANGLE, MAJOR, 0.5)


@pytest.mark.parametrize("lam", [-0.1, float("nan"), float("inf")])
def test_lambda_lt_must_be_a_number_of_zero_or_more(lam: float) -> None:
    with pytest.raises(InvalidSectionError, match="λ_LT"):
        check_scope(I_SECTION, MAJOR, lam)


def test_the_axis_is_needed_except_for_a_tube() -> None:
    with pytest.raises(InvalidSectionError, match="axis of bending"):
        check_scope(I_SECTION, None, 0.1)
    with pytest.raises(InvalidSectionError, match="axis of bending"):
        check_scope(RHS, None, 0.1)
    check_scope(CHS, None, 0.1)


# --- inputs ----------------------------------------------------------------------------------


@pytest.mark.parametrize("w_el", [0.0, -5.0, float("nan"), float("inf")])
def test_bad_w_el_rejected(w_el: float) -> None:
    with pytest.raises(InvalidMaterialError, match="W_el"):
        bend(1.0, w_el=w_el)


@pytest.mark.parametrize("w_pl", [0.0, -5.0, float("nan"), float("inf")])
def test_bad_w_pl_rejected(w_pl: float) -> None:
    with pytest.raises(InvalidMaterialError, match="W_pl"):
        bend(1.0, w_pl=w_pl)


@pytest.mark.parametrize("gamma_m0", [0.0, -1.1, float("nan"), float("inf")])
def test_bad_gamma_rejected(gamma_m0: float) -> None:
    with pytest.raises(InvalidMaterialError, match="γM0"):
        bend(1.0, gamma_m0=gamma_m0)


def test_w_pl_below_w_el_is_rejected_with_a_hint_that_they_may_be_swapped() -> None:
    with pytest.raises(InvalidSectionError, match=r"W_pl .* less than W_el"):
        bend(1.0, w_el=W_PL, w_pl=W_EL)


def test_w_pl_equal_to_w_el_is_allowed() -> None:
    assert bend(1.0, w_el=1000.0, w_pl=1000.0).resistance == pytest.approx(1000 * FY / GAMMA)


def test_refuses_beyond_the_slenderness_limit_with_the_b5_message() -> None:
    model = worked_model()
    beyond = CSMDeformationCapacity(model, SectionFamily.FLAT_PLATES, 1.7, OMEGA).calculate()
    assert not beyond.allowed
    data = BendingInput(model, beyond, I_SECTION, MAJOR, W_EL, W_PL, GAMMA, 0.1)
    with pytest.raises(NotApplicableError) as error:
        CSMBending(data).calculate()
    assert str(error.value) == beyond.message
    assert "1.7" in str(error.value) and "1.6" in str(error.value)


def test_there_is_no_pass_fail_verdict_or_classic_comparison() -> None:
    result = bend(3.0)
    for name in ("utilisation", "passes", "classic_resistance", "gain", "design_moment"):
        assert not hasattr(result, name)
    assert not hasattr(BendingInput, "design_moment")


def test_nothing_outside_annex_b_has_a_default() -> None:
    fields = {f.name: f for f in dataclasses.fields(BendingInput)}
    for name in ("w_el", "w_pl", "gamma_m0", "lambda_lt", "axis", "section_type"):
        assert fields[name].default is dataclasses.MISSING, name
        assert fields[name].default_factory is dataclasses.MISSING, name


# --- the working -----------------------------------------------------------------------------


def test_trace_has_the_b5_steps_then_the_bending_steps() -> None:
    model = worked_model()
    family = SectionFamily.CIRCULAR_HOLLOW
    deformation = CSMDeformationCapacity(model, family, 0.2, OMEGA).calculate()
    data = BendingInput(model, deformation, CHS, None, W_EL, W_PL, GAMMA, 0.1)
    r = CSMBending(data).calculate()
    symbols = [s.symbol for s in r.trace]
    assert symbols[:3] == ["E", "C₁", "C₂"]
    assert symbols.index("ε_csm") < symbols.index("λ_LT") < symbols.index("α")
    assert symbols[-4:] == ["M_el", "M_pl", "ε_csm/ε_y vs 1", "M_csm,c,Rd"][-4:]
    assert [s.clause for s in r.trace if s.symbol == "λ_LT"] == ["B.6.3.1"]
    assert [s.clause for s in r.trace if s.symbol in ("α", "M_csm,c,Rd")] == ["B.6.3.2"] * 2
    assert r.trace.get("M_csm,c,Rd").value == r.resistance
    assert all(step.latex for step in r.trace)
    assert len({s.symbol for s in r.trace}) == len(symbols)


def test_the_working_of_b19_and_b20_names_the_formula_and_the_numbers() -> None:
    low, high = bend(0.8), bend(3.0)
    assert "B.19" in low.trace.get("M_csm,c,Rd").description
    assert "B.20" in high.trace.get("M_csm,c,Rd").description
    assert "used by Formula B.20 only" in low.trace.get("α").description
    assert "used by Formula B.20 only" not in high.trace.get("α").description
    latex = high.trace.get("M_csm,c,Rd").latex
    assert r"\alpha" in latex and "194318" not in latex  # the bracket uses W_el/W_pl, not W_el
    assert "0.880702" in latex
    assert any("B.19 applies" in note for note in low.notes)
    assert not any("B.19 applies" in note for note in high.notes)
    assert any("Lateral-torsional buckling" in note for note in high.notes)


# --- a full run through the service, with a real B.5 geometry --------------------------------

K_BENDING_PLATE = 8.0


def service_form(
    geometry: services.GeometryForm,
    section_type: SectionType = I_SECTION,
    axis: BendingAxis | None = MAJOR,
    lambda_lt: float = 0.15,
    w_el: float = W_EL,
    w_pl: float = W_PL,
) -> services.BendingForm:
    return services.BendingForm(
        services.DeformationForm(geometry, OMEGA, NU),
        section_type,
        axis,
        w_el,
        w_pl,
        GAMMA_M0,
        lambda_lt,
    )


def service_run(
    geometry: services.GeometryForm,
    designation: str = "1.4307",
    **changes: Any,
) -> services.BendingOutcome:
    model = CSMBilinearModel(grade_material(designation))
    return services.run_bending(model, service_form(geometry, **changes))


def plate(width: float, thickness: float, k: float) -> services.GeometryForm:
    return services.GeometryForm(
        services.GeometryKind.PLATES, plates=(services.PlateForm("web", width, thickness, k),)
    )


def test_service_slender_plate_uses_b19_with_the_bending_k_sigma() -> None:
    # One plate b = 250, t = 3, grade 1.4307 (f_y 210, f_u 500), k_σ of the bending case = 8.
    #   σ_cr = 8 π² 200000 3² / (12 (1 − 0.3²) 250²) = 208.2 N/mm²; λ = sqrt(210 / 208.2) = 1.0043
    #   ε_csm/ε_y = (1 − 0.222 / λ^1.05) / λ^1.05 = 0.77..., below 1: Formula B.19
    #   M = ratio × W_el × 210 / 1.1
    sigma_cr = K_BENDING_PLATE * math.pi**2 * E * 3**2 / (12 * (1 - NU**2) * 250**2)
    lam = math.sqrt(210 / sigma_cr)
    power = lam**1.05
    ratio = (1 - 0.222 / power) / power
    out = service_run(plate(250, 3, K_BENDING_PLATE))
    assert out.deformation.slenderness.slenderness == pytest.approx(lam)
    assert 0.68 < lam <= 1.6
    assert ratio < 1
    assert out.result.formula is B19
    assert out.result.strain_ratio == pytest.approx(ratio)
    assert out.result.resistance == pytest.approx(ratio * W_EL * 210 / GAMMA_M0)


def test_service_stocky_plate_uses_b20() -> None:
    # One plate b = 100, t = 5, grade 1.4307, k_σ = 4: σ_cr = 1807.6, λ = 0.34083, ratio 12.04.
    #   E_sh = (500 − 210) / (0.16 × 0.58 − 0.00105) = 3160.8; E_sh/E = 0.015804
    #   M = (W_pl 210 / 1.1)[1 + 0.015804 (W_el/W_pl)(12.04 − 1) − (1 − W_el/W_pl) / 12.04²]
    sigma_cr = 4 * math.pi**2 * E * 5**2 / (12 * (1 - NU**2) * 100**2)
    lam = math.sqrt(210 / sigma_cr)
    ratio = 0.25 / lam**3.6
    e_sh = (500 - 210) / (0.16 * 0.58 - 210 / E)
    shape = W_EL / W_PL
    bracket = 1 + e_sh / E * shape * (ratio - 1) - (1 - shape) / ratio**2
    out = service_run(plate(100, 5, 4.0))
    assert out.result.formula is B20
    assert out.result.strain_ratio == pytest.approx(ratio)
    assert out.result.resistance == pytest.approx(W_PL * 210 / GAMMA_M0 * bracket)


def test_the_bending_k_sigma_changes_the_strain_limit() -> None:
    """Same plate, two stress patterns: the k_σ of bending, not of compression, is what is used."""
    compression_like = service_run(plate(250, 3, 4.0))
    bending_like = service_run(plate(250, 3, K_BENDING_PLATE))
    assert bending_like.result.strain_ratio > compression_like.result.strain_ratio
    assert bending_like.deformation.slenderness.slenderness < (
        compression_like.deformation.slenderness.slenderness
    )


def test_service_i_section_template_major_axis() -> None:
    # Rolled I 200 x 100 x 5.6 x 8.5, r 12: c_w = 159.0, c_f = 35.2; the web k_σ of bending is 23.9
    # and the flange outstand 0.43. The flange governs (λ = 0.2153 on the B.6 stocky branch):
    #   ε_csm/ε_y = 0.25 / λ^3.6, held to the cap Ω = 15.
    k = {PlateRole.WEB: 23.9, PlateRole.FLANGE: 0.43}
    geometry = services.GeometryForm(
        services.GeometryKind.TEMPLATE,
        shape=I_SECTION,
        fabrication=Fabrication.ROLLED,
        h=200,
        b=100,
        tw=5.6,
        tf=8.5,
        r=12,
        k_sigma=k,
    )
    out = service_run(geometry, "1.4301", w_el=194_300.0, w_pl=220_600.0)
    assert out.deformation.slenderness.governing_label == "flange"
    assert out.result.formula is B20
    assert out.result.alpha == 2.0
    assert out.result.strain_ratio == pytest.approx(15.0)  # held to Ω
    assert out.deformation.capacity.capped
    # f_y and f_u of 1.4301 from Table 5.1 (grades.json), E_sh from B.4, ε_csm/ε_y held to Ω = 15:
    #   M = (W_pl f_y / γM0)[1 + (E_sh/E)(W_el/W_pl)(15 − 1) − (1 − W_el/W_pl) / 15²]
    fy, fu = grade_material("1.4301").fy, grade_material("1.4301").fu
    e_sh = (fu - fy) / (0.16 * (1 - fy / fu) - fy / E)
    shape = 194_300.0 / 220_600.0
    expected = 220_600.0 * fy / GAMMA_M0 * (1 + e_sh / E * shape * 14 - (1 - shape) / 15**2)
    assert out.result.resistance == pytest.approx(expected)


def test_service_i_section_minor_axis_uses_alpha_1_2() -> None:
    out = service_run(plate(100, 5, 4.0), axis=MINOR)
    assert out.result.alpha == 1.2


def test_service_circular_hollow_section() -> None:
    # d = 100, t = 3, grade 1.4307: B.11 is valid for compression and bending, no k_σ is needed.
    #   σ_cr,c = E / sqrt(3 (1 − ν²)) × 2t/d = 7262.8; λ = 0.17; ratio = 4.44e-3 / λ^4.5 (cap 15)
    sigma_cr = E / math.sqrt(3 * (1 - NU**2)) * 2 * 3 / 100
    lam = math.sqrt(210 / sigma_cr)
    ratio = min(4.44e-3 / lam**4.5, OMEGA)
    geometry = services.GeometryForm(services.GeometryKind.CHS, d=100, t=3)
    out = service_run(geometry, section_type=CHS, axis=None)
    assert out.deformation.family is SectionFamily.CIRCULAR_HOLLOW
    assert out.result.strain_ratio == pytest.approx(ratio)
    assert out.result.alpha == 2.0
    e_sh = (500 - 210) / (0.16 * 0.58 - 210 / E)
    shape = W_EL / W_PL
    expected = W_PL * 210 / GAMMA_M0 * (1 + e_sh / E * shape * (ratio - 1) - (1 - shape) / ratio**2)
    assert out.result.resistance == pytest.approx(expected)


def test_service_gate_runs_before_anything_else() -> None:
    # no k_σ, no ν needed: the gate answers first
    geometry = services.GeometryForm(services.GeometryKind.PLATES, plates=())
    with pytest.raises(NotApplicableError, match=r"use 8\.2\.4"):
        service_run(geometry, lambda_lt=0.5)
    with pytest.raises(NotBuiltYetError, match="phase 3"):
        service_run(geometry, section_type=ANGLE)


def test_service_refuses_a_plate_beyond_the_limit() -> None:
    with pytest.raises(NotApplicableError, match="too slender"):
        service_run(plate(400, 2, 4.0))


def test_service_rejects_a_mismatch_of_section_type_and_route() -> None:
    with pytest.raises(InvalidSectionError, match="do not match"):
        service_run(services.GeometryForm(services.GeometryKind.CHS, d=100, t=3))  # I-section
    with pytest.raises(InvalidSectionError, match="do not match"):
        service_run(plate(100, 5, 4.0), section_type=CHS, axis=None)


def test_service_rejects_a_template_of_another_shape() -> None:
    geometry = services.GeometryForm(
        services.GeometryKind.TEMPLATE, shape=RHS, h=100, b=50, t=4, k_sigma={}
    )
    with pytest.raises(InvalidSectionError, match="different shapes"):
        service_run(geometry)


def test_service_trace_runs_b4_then_b5_then_b63() -> None:
    out = service_run(plate(100, 5, 4.0))
    clauses = [s.clause for s in out.trace]
    assert clauses[0] == "input"
    assert clauses.index("B.4") < clauses.index("B.5.2") < clauses.index("B.5.1")
    assert clauses.index("B.5.1") < clauses.index("B.6.3.1") < clauses.index("B.6.3.2")
    assert clauses[-1] == "B.6.3.2"
    assert len({s.symbol for s in out.trace}) == len(out.trace)


# --- the charts ------------------------------------------------------------------------------


def figures(
    geometry: services.GeometryForm, **changes: Any
) -> tuple[dict[str, Any], dict[str, Any], services.BendingOutcome]:
    from stainless_csm.viz import plotly_figures

    model = CSMBilinearModel(grade_material())
    form = service_form(geometry, **changes)
    out = services.run_bending(model, form)
    moment = plotly_figures.bending_moment_figure(
        model, out.deformation.capacity, out.result, form.w_el, form.w_pl, form.gamma_m0
    )
    blocks = plotly_figures.bending_blocks_figure(model, out.result)
    return moment, blocks, out


def trace_named(figure: dict[str, Any], fragment: str) -> dict[str, Any]:
    return next(t for t in figure["data"] if fragment in str(t.get("name")))


def test_moment_chart_branches_meet_at_one_and_follow_the_engine() -> None:
    moment, _, out = figures(plate(100, 5, 4.0))
    b19 = trace_named(moment, "B.19")
    b20 = trace_named(moment, "B.20")
    assert b19["x"][-1] == b20["x"][0] == 1.0
    assert b19["y"][-1] == pytest.approx(b20["y"][0])
    assert b20["y"][0] == pytest.approx(out.result.elastic_moment / 1e6)  # W_el f_y / γM0
    model = CSMBilinearModel(grade_material())
    for x, y in zip(b20["x"], b20["y"], strict=True):
        assert y == pytest.approx(moment_at(model, x, W_EL, W_PL, 2.0, GAMMA_M0) / 1e6)
    assert b19["y"] == sorted(b19["y"])  # rises with the ratio
    assert b20["y"] == sorted(b20["y"])
    assert max(b20["x"]) == pytest.approx(out.deformation.capacity.cap)


def test_moment_chart_has_reference_lines_the_cap_and_the_user_dot_in_kn_m() -> None:
    moment, _, out = figures(plate(100, 5, 4.0))
    levels = sorted(
        s["y0"] for s in moment["layout"]["shapes"] if s["x0"] == 0 and s["y0"] == s["y1"]
    )
    assert levels[-2] == pytest.approx(out.result.elastic_moment / 1e6)
    assert levels[-1] == pytest.approx(out.result.plastic_moment / 1e6)
    yours = trace_named(moment, "Your section")
    assert yours["x"] == [pytest.approx(out.result.strain_ratio)]
    assert yours["y"] == [pytest.approx(out.result.resistance / 1e6)]
    assert "kN m" in moment["layout"]["yaxis"]["title"]["text"]
    assert "kN m" in yours["text"][0]
    assert any("cap" in a["text"] for a in moment["layout"]["annotations"])


def test_moment_chart_below_one_has_only_the_b19_branch_in_use() -> None:
    moment, _, out = figures(plate(250, 3, K_BENDING_PLATE))
    assert out.result.formula is B19
    yours = trace_named(moment, "Your section")
    assert yours["x"][0] < 1
    assert yours["y"] == [pytest.approx(out.result.resistance / 1e6)]


def test_blocks_chart_strain_is_straight_and_stress_is_read_from_the_curve() -> None:
    _, blocks, out = figures(plate(100, 5, 4.0))
    model = CSMBilinearModel(grade_material())
    ratio = out.result.strain_ratio
    strain = next(t for t in blocks["data"] if t["name"] == "Strain")
    stress = next(t for t in blocks["data"] if t["name"] == "Stress")
    # the polygon: (0, -1), the points down the depth, (0, 1); the compression edge is at ε_csm
    assert strain["y"][1:-1] == [-1.0, pytest.approx(-1 / ratio), pytest.approx(1 / ratio), 1.0]
    assert strain["x"][-2] == pytest.approx(ratio)
    assert strain["x"][1] == pytest.approx(-ratio)
    assert stress["x"][-2] == pytest.approx(model.stress_at(ratio * model.yield_strain))
    assert stress["x"][-2] > model.material.fy  # past yield, on the hardening line
    assert stress["x"][2] == pytest.approx(-model.material.fy)  # the elastic part ends at f_y


def test_blocks_chart_below_yield_stays_elastic() -> None:
    _, blocks, out = figures(plate(250, 3, K_BENDING_PLATE))
    stress = next(t for t in blocks["data"] if t["name"] == "Stress")
    assert out.result.strain_ratio < 1
    assert max(abs(x) for x in stress["x"]) < 210  # f_y of 1.4307
    assert len(stress["y"]) == 4  # (0, -1), the two edges, (0, 1)
