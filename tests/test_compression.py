"""B.6.2: compression resistance, Formulas B.15, B.16 and B.17."""

import math
from typing import Any

import pytest

from helpers import GAMMA_M0, NU, OMEGA, E, grade_material
from stainless_csm import services
from stainless_csm.core.enums import StainlessFamily
from stainless_csm.core.errors import InvalidMaterialError, NotApplicableError
from stainless_csm.core.trace import CalcTrace
from stainless_csm.csm.compression import (
    CompressionFormula,
    CompressionInput,
    CompressionResult,
    CSMCompression,
    capacity_ratio,
    formula_for,
    hardened_stress,
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

B15, B16 = CompressionFormula.B15, CompressionFormula.B16

# The worked example: austenitic, f_y = 230, f_u = 540, E = 200000 N/mm², A = 1000 mm², γM0 = 1.1.
#   ε_y  = 230 / 200000                       = 0.00115
#   ε_u  = C3 (1 - f_y/f_u) = 1.00 (1 - 230/540) = 0.574074
#   E_sh = (540 - 230) / (C2 ε_u - ε_y)       = 310 / (0.16 × 0.574074 - 0.00115)
#        = 310 / 0.0907019                    = 3417.79 N/mm²
FY, FU, AREA = 230.0, 540.0, 1000.0
GAMMA = 1.1
E_SH = 310.0 / (0.16 * (1 - 230.0 / 540.0) - 230.0 / 200000.0)


def worked_model() -> CSMBilinearModel:
    return CSMBilinearModel(Material(StainlessFamily.AUSTENITIC, FY, FU, E))


def deformation_at(ratio: float, model: CSMBilinearModel | None = None) -> DeformationResult:
    """A B.5.1 result with a chosen ε_csm/ε_y, so B.6.2 can be tested at exact ratios."""
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


def compress(ratio: float, area: float = AREA, gamma_m0: float = GAMMA) -> CompressionResult:
    model = worked_model()
    return CSMCompression(
        CompressionInput(model, deformation_at(ratio, model), area, gamma_m0)
    ).calculate()


def test_worked_example_material_values() -> None:
    m = worked_model()
    assert m.yield_strain == pytest.approx(0.00115)
    assert m.ultimate_strain == pytest.approx(0.574074, abs=1e-6)
    assert m.strain_hardening_modulus == pytest.approx(3417.79, abs=0.01)
    assert m.strain_hardening_modulus == pytest.approx(E_SH)


def test_b15_below_one() -> None:
    # ε_csm/ε_y = 0.8: N = 0.8 × 1000 × 230 / 1.1 = 184000 / 1.1 = 167272.7 N
    r = compress(0.8)
    assert r.formula is B15
    assert r.design_stress is None  # B.17 is not used
    assert r.resistance == pytest.approx(167_272.7, abs=0.1)
    assert r.resistance == pytest.approx(0.8 * 1000 * 230 / 1.1)


def test_b16_at_exactly_one() -> None:
    # ε_csm/ε_y = 1.0: f_csm = 230 + E_sh ε_y × 0 = 230; N = 1000 × 230 / 1.1 = 209090.9 N
    r = compress(1.0)
    assert r.formula is B16
    assert r.design_stress == pytest.approx(230.0)
    assert r.resistance == pytest.approx(209_090.9, abs=0.1)


def test_b16_above_one() -> None:
    # ε_csm/ε_y = 3.0: f_csm = 230 + 3417.79 × 0.00115 × (3 - 1) = 230 + 7.8609 = 237.861
    #                  N = 1000 × 237.861 / 1.1 = 216237.2 N
    r = compress(3.0)
    assert r.formula is B16
    assert r.design_stress == pytest.approx(237.861, abs=0.001)
    assert r.design_stress == pytest.approx(230 + 3417.79 * 0.00115 * 2, abs=0.001)
    assert r.resistance == pytest.approx(216_237.2, abs=0.1)


def test_b15_and_b16_give_the_same_value_at_one() -> None:
    model = worked_model()
    engine = CSMCompression(CompressionInput(model, deformation_at(1.0, model), AREA, GAMMA))
    b15_at_one = engine.resistance_b15(1.0)
    b16_at_one = engine.resistance_b16(hardened_stress(model, 1.0))
    assert b15_at_one == pytest.approx(b16_at_one, rel=1e-12)
    assert b15_at_one == pytest.approx(AREA * FY / GAMMA)


def test_resistance_has_no_jump_across_one() -> None:
    just_below, at_one, just_above = compress(1 - 1e-9), compress(1.0), compress(1 + 1e-9)
    assert just_below.formula is B15
    assert at_one.formula is B16
    assert just_above.formula is B16
    assert just_below.resistance == pytest.approx(at_one.resistance, rel=1e-8)
    assert just_above.resistance == pytest.approx(at_one.resistance, rel=1e-8)


def test_formula_switches_at_one() -> None:
    assert formula_for(0.999999) is B15
    assert formula_for(1.0) is B16


@pytest.mark.parametrize("ratio", [0.3, 0.8, 1.0, 1.7, 3.0, 12.0])
def test_capacity_ratio_is_the_resistance_over_a_fy_over_gamma(ratio: float) -> None:
    """The chart's axis: equals ε_csm/ε_y on B.15 and f_csm/f_y on B.16."""
    model = worked_model()
    r = compress(ratio)
    assert capacity_ratio(model, ratio) == pytest.approx(r.resistance / (AREA * FY / GAMMA))
    if ratio < 1:
        assert capacity_ratio(model, ratio) == pytest.approx(ratio)
    else:
        assert capacity_ratio(model, ratio) == pytest.approx(hardened_stress(model, ratio) / FY)


def test_code_form_equals_hardening_line_form() -> None:
    """B.17 must be the same point as σ = f_y + E_sh (ε − ε_y) on the B.4 curve."""
    model = worked_model()
    r = compress(3.0)
    assert r.design_stress == pytest.approx(model.stress_at(3.0 * model.yield_strain))


def test_gamma_m0_and_area_are_applied() -> None:
    assert compress(3.0, gamma_m0=1.0).resistance == pytest.approx(compress(3.0).resistance * 1.1)
    assert compress(0.8, area=2000.0).resistance == pytest.approx(2 * compress(0.8).resistance)


@pytest.mark.parametrize("area", [0.0, -5.0, float("nan"), float("inf")])
def test_bad_area_rejected(area: float) -> None:
    with pytest.raises(InvalidMaterialError, match="Area"):
        compress(1.0, area=area)


@pytest.mark.parametrize("gamma_m0", [0.0, -1.1, float("nan"), float("inf")])
def test_bad_gamma_rejected(gamma_m0: float) -> None:
    with pytest.raises(InvalidMaterialError, match="γM0"):
        compress(1.0, gamma_m0=gamma_m0)


def test_refuses_beyond_the_slenderness_limit_with_the_b5_message() -> None:
    model = worked_model()
    beyond = CSMDeformationCapacity(model, SectionFamily.FLAT_PLATES, 1.7, OMEGA).calculate()
    assert not beyond.allowed
    with pytest.raises(NotApplicableError) as error:
        CSMCompression(CompressionInput(model, beyond, AREA, GAMMA)).calculate()
    assert str(error.value) == beyond.message
    assert "1.7" in str(error.value)
    assert "1.6" in str(error.value)


def test_there_is_no_pass_fail_verdict_or_classic_comparison() -> None:
    result = compress(3.0)
    for name in ("utilisation", "passes", "classic_resistance", "gain", "design_force"):
        assert not hasattr(result, name)
    assert not hasattr(CompressionInput, "design_force")


def test_holes_do_not_matter() -> None:
    """B.6.2 has no clause about holes: the input carries no such flag."""
    assert not hasattr(CompressionInput, "has_holes")


def test_trace_has_the_b5_steps_then_the_b62_steps() -> None:
    model = worked_model()
    family = SectionFamily.CIRCULAR_HOLLOW
    deformation = CSMDeformationCapacity(model, family, 0.2, OMEGA).calculate()
    r = CSMCompression(CompressionInput(model, deformation, AREA, GAMMA)).calculate()
    symbols = [s.symbol for s in r.trace]
    assert symbols[:3] == ["E", "C₁", "C₂"]  # B.4 first, like tension
    assert symbols.index("λ_cs") < symbols.index("ε_csm") < symbols.index("N_csm,Rd")
    assert [s.clause for s in r.trace if s.symbol in ("f_csm", "N_csm,Rd")] == ["B.6.2"] * 2
    assert r.trace.get("N_csm,Rd").value == r.resistance
    assert r.trace.get("f_csm").value == r.design_stress
    assert all(step.latex for step in r.trace)


def test_trace_of_b15_has_no_f_csm_step() -> None:
    r = compress(0.8)
    symbols = [s.symbol for s in r.trace]
    assert "f_csm" not in symbols
    assert "N_csm,Rd" in symbols
    assert r.trace.get("ε_csm/ε_y vs 1").value == 0.8
    assert "B.15" in r.trace.get("N_csm,Rd").description
    assert any("B.17" in note and "not used" in note for note in r.notes)


def test_trace_of_b16_names_b17_and_b16() -> None:
    r = compress(3.0)
    assert "B.17" in r.trace.get("f_csm").description
    assert "B.16" in r.trace.get("N_csm,Rd").description
    assert not any("not used" in note for note in r.notes)


# --- a full run through the service, with a real B.5 geometry -------------------------------


def service_run(
    geometry: services.GeometryForm, designation: str = "1.4307", area: float = 1000.0
) -> services.CompressionOutcome:
    model = CSMBilinearModel(grade_material(designation))
    form = services.CompressionForm(services.DeformationForm(geometry, OMEGA, NU), area, GAMMA_M0)
    return services.run_compression(model, form)


def test_service_plate_in_the_stocky_zone_uses_b16() -> None:
    # One plate b = 100, t = 5, k_σ = 4, grade 1.4307 (f_y 210, f_u 500), E = 200000, ν = 0.3.
    #   σ_cr = 4 π² 200000 5² / (12 (1 − 0.3²) 100²) = 1807.6 N/mm²
    #   λ    = sqrt(210 / 1807.6) = 0.34083 (≤ 0.68, stocky)
    #   ε_csm/ε_y = 0.25 / λ^3.6 = 12.04, held to min(Ω = 15, C1 ε_u/ε_y) = 12.04 (not capped)
    #   E_sh = (500 − 210) / (0.16 × 0.58 − 0.00105) = 3160.8; ε_y = 0.00105
    #   f_csm = 210 + 3160.8 × 0.00105 × (12.04 − 1) ≈ 246.6;  N = 1000 × f_csm / 1.1
    sigma_cr = 4 * math.pi**2 * E * 5**2 / (12 * (1 - NU**2) * 100**2)
    lam = math.sqrt(210 / sigma_cr)
    ratio = 0.25 / lam**3.6
    e_sh = (500 - 210) / (0.16 * 0.58 - 210 / E)
    f_csm = 210 + e_sh * (210 / E) * (ratio - 1)

    geometry = services.GeometryForm(
        services.GeometryKind.PLATES, plates=(services.PlateForm("web", 100, 5, 4.0),)
    )
    out = service_run(geometry)
    assert out.deformation.slenderness.slenderness == pytest.approx(lam)
    assert out.result.strain_ratio == pytest.approx(ratio)
    assert ratio > 1
    assert out.result.formula is B16
    assert out.result.design_stress == pytest.approx(f_csm)
    assert out.result.resistance == pytest.approx(1000 * f_csm / GAMMA_M0)
    assert out.result.resistance == pytest.approx(1000 * 246.6 / 1.1, rel=2e-3)


def test_service_plate_in_the_slender_zone_uses_b15() -> None:
    # One plate b = 250, t = 3, k_σ = 4, grade 1.4307.
    #   σ_cr = 1807.6 × (3/250)² / (5/100)² = 104.1 N/mm²; λ = sqrt(210 / σ_cr) = 1.42 (slender)
    #   ε_csm/ε_y = (1 − 0.222 / λ^1.05) / λ^1.05 = 0.586 (< 1)
    #   N = 0.586 × 1000 × 210 / 1.1 = 111 900 N
    sigma_cr = 4 * math.pi**2 * E * 3**2 / (12 * (1 - NU**2) * 250**2)
    lam = math.sqrt(210 / sigma_cr)
    power = lam**1.05
    ratio = (1 - 0.222 / power) / power
    geometry = services.GeometryForm(
        services.GeometryKind.PLATES, plates=(services.PlateForm("web", 250, 3, 4.0),)
    )
    out = service_run(geometry)
    assert 0.68 < lam <= 1.6
    assert out.result.strain_ratio == pytest.approx(ratio)
    assert out.result.formula is B15
    assert out.result.design_stress is None
    assert out.result.resistance == pytest.approx(ratio * 1000 * 210 / GAMMA_M0)
    assert out.result.resistance == pytest.approx(111_900, rel=5e-3)


def test_service_circular_hollow_section() -> None:
    # d = 100, t = 3, grade 1.4307: σ_cr,c = E / sqrt(3 (1 − ν²)) × 2t/d = 7262.8 N/mm²
    #   λ = sqrt(210 / 7262.8) = 0.17 (≤ 0.30, stocky); ε_csm/ε_y = 4.44e-3 / λ^4.5
    sigma_cr = E / math.sqrt(3 * (1 - NU**2)) * 2 * 3 / 100
    lam = math.sqrt(210 / sigma_cr)
    ratio = min(4.44e-3 / lam**4.5, OMEGA)
    e_sh = (500 - 210) / (0.16 * 0.58 - 210 / E)
    f_csm = 210 + e_sh * (210 / E) * (ratio - 1)
    out = service_run(services.GeometryForm(services.GeometryKind.CHS, d=100, t=3))
    assert out.deformation.family is SectionFamily.CIRCULAR_HOLLOW
    assert out.result.strain_ratio == pytest.approx(ratio)
    assert out.result.formula is B16
    assert out.result.resistance == pytest.approx(1000 * f_csm / GAMMA_M0)


def test_service_refuses_a_plate_beyond_the_limit() -> None:
    geometry = services.GeometryForm(
        services.GeometryKind.PLATES, plates=(services.PlateForm("thin", 400, 2, 4.0),)
    )
    with pytest.raises(NotApplicableError, match="too slender"):
        service_run(geometry)


def test_service_refuses_a_tube_beyond_the_limit() -> None:
    with pytest.raises(NotApplicableError, match=r"0\.6"):
        service_run(services.GeometryForm(services.GeometryKind.CHS, d=1000, t=1))


@pytest.mark.parametrize(("area", "gamma"), [(0.0, 1.1), (1000.0, 0.0)])
def test_service_validates_area_and_gamma(area: float, gamma: float) -> None:
    model = CSMBilinearModel(grade_material())
    geometry = services.GeometryForm(services.GeometryKind.CHS, d=100, t=3)
    form = services.CompressionForm(services.DeformationForm(geometry, OMEGA, NU), area, gamma)
    with pytest.raises(InvalidMaterialError):
        services.run_compression(model, form)


def test_service_trace_runs_b4_then_b5_then_b62() -> None:
    out = service_run(services.GeometryForm(services.GeometryKind.CHS, d=100, t=3))
    clauses = [s.clause for s in out.trace]
    assert clauses[0] == "input"  # E
    assert clauses.index("B.4") < clauses.index("B.5.2") < clauses.index("B.5.1")
    assert clauses.index("B.5.1") < clauses.index("B.6.2")
    assert clauses[-1] == "B.6.2"
    assert len({s.symbol for s in out.trace}) == len(out.trace)


# --- the charts ---------------------------------------------------------------------------


def figures(
    geometry: services.GeometryForm, omega: float = OMEGA, schematic: bool = True
) -> tuple[dict[str, Any], dict[str, Any], services.CompressionOutcome]:
    from stainless_csm.viz import plotly_figures

    model = CSMBilinearModel(grade_material())
    form = services.CompressionForm(services.DeformationForm(geometry, omega, NU), 1000.0, GAMMA_M0)
    out = services.run_compression(model, form)
    capacity = plotly_figures.compression_capacity_figure(
        model, out.deformation.capacity, out.result
    )
    point = plotly_figures.compression_point_figure(model, schematic, out.result)
    return capacity, point, out


PLATE = services.GeometryForm(
    services.GeometryKind.PLATES, plates=(services.PlateForm("web", 100, 5, 4.0),)
)
TUBE = services.GeometryForm(services.GeometryKind.CHS, d=100, t=3)


def trace_named(figure: dict[str, Any], fragment: str) -> dict[str, Any]:
    return next(t for t in figure["data"] if fragment in str(t.get("name")))


@pytest.mark.parametrize(("geometry", "switch"), [(PLATE, 0.68), (TUBE, 0.30)])
def test_capacity_chart_has_one_junction_marker_at_the_base_curve_switch(
    geometry: services.GeometryForm, switch: float
) -> None:
    capacity, _, _ = figures(geometry)
    markers = [t for t in capacity["data"] if "= 1" in str(t.get("name"))]
    assert len(markers) == 1
    (lam,) = markers[0]["x"]
    assert lam == pytest.approx(switch, rel=5e-3)  # the rounded coefficients put it near, not at
    assert markers[0]["y"] == [1.0]  # N / (A f_y / γM0) = 1 where ε_csm/ε_y = 1
    assert "a kink" in markers[0]["text"][0]
    assert "not a kink" not in markers[0]["text"][0]


def test_capacity_chart_branches_and_user_dot() -> None:
    capacity, _, out = figures(PLATE)
    b16 = trace_named(capacity, "B.16")
    b15 = trace_named(capacity, "B.15")
    assert min(b16["customdata"]) >= 1 and max(b15["customdata"]) <= 1
    assert b16["x"][-1] == b15["x"][0]  # the branches meet
    assert b16["y"][-1] == pytest.approx(b15["y"][0]) == pytest.approx(1.0)
    assert b15["y"] == sorted(b15["y"], reverse=True)  # falls with slenderness
    yours = trace_named(capacity, "Your section")
    assert yours["x"] == [pytest.approx(out.deformation.slenderness.slenderness)]
    model = CSMBilinearModel(grade_material())
    assert yours["y"] == [pytest.approx(capacity_ratio(model, out.result.strain_ratio))]
    cap_line = capacity["layout"]["shapes"][0]
    assert cap_line["y0"] == pytest.approx(capacity_ratio(model, out.deformation.capacity.cap))


def test_capacity_chart_points_are_the_engines_numbers() -> None:
    """Each plotted point is B.15 or B.16 applied to the engine's own base curve."""
    capacity, _, _ = figures(TUBE)
    model = CSMBilinearModel(grade_material())
    for name in ("B.15", "B.16"):
        branch = trace_named(capacity, name)
        for y, ratio in zip(branch["y"], branch["customdata"], strict=True):
            assert y == pytest.approx(capacity_ratio(model, ratio))


def test_capacity_chart_says_not_a_kink_when_the_cap_governs() -> None:
    # Ω = 1 holds the stocky branch at ε_csm/ε_y = 1, so the cap sits at the junction.
    capacity, _, _ = figures(PLATE, omega=1.0)
    (marker,) = [t for t in capacity["data"] if "= 1" in str(t.get("name"))]
    assert "not a kink" in marker["text"][0]


def test_compression_point_on_the_material_curve_with_band() -> None:
    _, point, out = figures(PLATE)
    mark = trace_named(point, "Compression limit")
    model = CSMBilinearModel(grade_material())
    strain = out.result.strain_ratio * model.yield_strain
    assert out.result.formula is B16
    assert mark["y"][0] == pytest.approx(out.result.design_stress)
    assert mark["y"][0] == pytest.approx(model.stress_at(strain))
    band = trace_named(point, "Extra strength used in compression")
    assert band["y"][0] == pytest.approx(model.material.fy)
    assert band["y"][1] == pytest.approx(out.result.design_stress)
    assert "f<sub>csm</sub>" in mark["text"][0]


def test_compression_point_below_yield_has_no_band_and_no_f_csm() -> None:
    plate = services.GeometryForm(
        services.GeometryKind.PLATES, plates=(services.PlateForm("web", 250, 3, 4.0),)
    )
    _, point, out = figures(plate)
    assert out.result.formula is B15
    mark = trace_named(point, "Compression limit")
    assert mark["y"][0] < 210  # on the elastic line, below f_y
    assert "B.15" in mark["text"][0]
    assert not any("Extra strength" in str(t.get("name")) for t in point["data"])


def test_compression_point_respects_the_graph_view() -> None:
    _, schematic, _ = figures(PLATE, schematic=True)
    _, true_scale, _ = figures(PLATE, schematic=False)
    assert "not to scale" in schematic["layout"]["xaxis"]["title"]["text"]
    assert "true scale" in true_scale["layout"]["xaxis"]["title"]["text"]
    assert (
        trace_named(schematic, "Compression limit")["x"]
        != trace_named(true_scale, "Compression limit")["x"]
    )


def test_plain_material_chart_is_unchanged_by_the_compression_option() -> None:
    from stainless_csm.viz import plotly_figures

    model = CSMBilinearModel(grade_material())
    plain = plotly_figures.stress_strain_figure(model, True)
    assert plain["data"][0]["name"] == "Extra strength from strain hardening"
    assert not any("Compression" in str(t.get("name")) for t in plain["data"])
