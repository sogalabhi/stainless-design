"""Section templates (8.2.2(5), Tables 7.2 to 7.4): c of each plate from typed dimensions.

Every expected number is worked by hand in the comment above it. The material is grade 1.4307
(f_y 210, f_u 500), E = 200 000 N/mm², ν = 0.3, Ω = 15, as in the other tests.
"""

from itertools import pairwise
from typing import Any

import pytest

from helpers import GAMMA_M0, K_INTERNAL, K_OUTSTAND, NU, OMEGA, grade_material
from stainless_csm import services
from stainless_csm.core.enums import SectionType
from stainless_csm.core.errors import InvalidSectionError
from stainless_csm.csm.deformation_capacity import SectionFamily, Zone
from stainless_csm.material_models.csm_bilinear import CSMBilinearModel
from stainless_csm.sections.templates import (
    CHS,
    RHS,
    Angle,
    Channel,
    Fabrication,
    ISection,
    PlateRole,
    PlateType,
    TSection,
)

ROLLED, WELDED = Fabrication.ROLLED, Fabrication.WELDED
MODEL = CSMBilinearModel(grade_material("1.4307"))


def c_values(template: Any) -> dict[str, float]:
    return {plate.label: plate.c for plate in template.plates()}


# --- the six hand-calculated shapes (plan.md 4c) -----------------------------------------------


def test_rolled_i_section() -> None:
    # h 200, b 100, t_w 5.6, t_f 8.5, r 12
    # c_w = h - 2 t_f - 2 r = 200 - 17 - 24 = 159.0
    # c_f = (b - t_w - 2 r) / 2 = (100 - 5.6 - 24) / 2 = 70.4 / 2 = 35.2
    plates = ISection(200, 100, 5.6, 8.5, ROLLED, r=12).plates()
    assert [p.label for p in plates] == ["web", "flange"]
    assert plates[0].c == pytest.approx(159.0)
    assert plates[1].c == pytest.approx(35.2)
    assert (plates[0].kind, plates[1].kind) == (PlateType.INTERNAL, PlateType.OUTSTAND)
    assert (plates[0].thickness, plates[1].thickness) == (5.6, 8.5)


def test_welded_i_section() -> None:
    # h 300, b 150, t_w 6, t_f 10, s 5
    # c_w = 300 - 2 * 10 - 2 * 5 = 270.0
    # c_f = (150 - 6 - 2 * 5) / 2 = 134 / 2 = 67.0
    c = c_values(ISection(300, 150, 6, 10, WELDED, s=5))
    assert c == {"web": pytest.approx(270.0), "flange": pytest.approx(67.0)}


def test_rolled_channel() -> None:
    # h 200, b 75, t_w 8.5, t_f 11.5, r 11.5
    # c_w = 200 - 2 * 11.5 - 2 * 11.5 = 200 - 23 - 23 = 154.0
    # c_f = b - t_w - r = 75 - 8.5 - 11.5 = 55.0
    c = c_values(Channel(200, 75, 8.5, 11.5, ROLLED, r=11.5))
    assert c == {"web": pytest.approx(154.0), "flange": pytest.approx(55.0)}


def test_rolled_t_section_with_a_typed_stem() -> None:
    # h 100, b 100, t_w 6, t_f 8, r 10, c_stem typed 80
    # c_f = (b - t_w - 2 r) / 2 = (100 - 6 - 20) / 2 = 37.0 ; c_stem is the typed 80
    plates = TSection(100, 100, 6, 8, ROLLED, 80, r=10).plates()
    assert [p.label for p in plates] == ["flange", "stem"]
    assert plates[0].c == pytest.approx(37.0)
    assert plates[1].c == 80
    assert plates[1].thickness == 6  # the stem is t_w thick
    assert plates[1].step.clause == "input"  # nothing in the PDF defines it


def test_rhs() -> None:
    # 100 x 50 x 4: c_web = h - 3t = 100 - 12 = 88.0 ; c_flange = b - 3t = 50 - 12 = 38.0
    plates = RHS(100, 50, 4).plates()
    assert [p.c for p in plates] == [pytest.approx(88.0), pytest.approx(38.0)]
    assert all(p.kind is PlateType.INTERNAL for p in plates)


def test_angle_uses_the_longer_leg() -> None:
    # 100 x 75 x 8: b-bar = h = 100.0, one outstand plate of thickness 8
    (leg,) = Angle(100, 75, 8).plates()
    assert (leg.label, leg.c, leg.thickness, leg.kind) == ("leg", 100.0, 8, PlateType.OUTSTAND)


def test_chs_has_no_plates() -> None:
    assert CHS(100, 3).plates() == ()


# --- the working ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "template",
    [
        ISection(200, 100, 5.6, 8.5, ROLLED, r=12),
        ISection(300, 150, 6, 10, WELDED, s=5),
        Channel(200, 75, 8.5, 11.5, ROLLED, r=11.5),
        TSection(100, 100, 6, 8, ROLLED, 80, r=10),
        Angle(100, 75, 8),
        RHS(100, 50, 4),
    ],
)
def test_every_derived_c_is_a_step_naming_its_source(template: Any) -> None:
    for plate in template.plates():
        step = plate.step
        assert step.value == plate.c and step.unit == "mm"
        assert step.latex and step.formula and step.substituted
        assert plate.source in step.description
        if plate.label != "stem":
            assert step.clause == "8.2.2(5)"


def test_sources_are_named() -> None:
    i = ISection(200, 100, 5.6, 8.5, ROLLED, r=12).plates()
    assert "Table 7.2" in i[0].source and "Table 7.3" in i[1].source
    assert "fillet" in i[0].source
    assert "weld" in ISection(300, 150, 6, 10, WELDED, s=5).plates()[0].source
    assert "analogy" in Channel(200, 75, 8.5, 11.5, ROLLED, r=11.5).plates()[0].source
    assert "analogy" in TSection(100, 100, 6, 8, ROLLED, 80, r=10).plates()[0].source
    assert "typed" in TSection(100, 100, 6, 8, ROLLED, 80, r=10).plates()[1].source
    assert "h − 3t" in RHS(100, 50, 4).plates()[0].source
    assert "b̄ = h" in Angle(100, 75, 8).plates()[0].source


# --- geometry that cannot exist ------------------------------------------------------------


IMPOSSIBLE: list[tuple[Any, str]] = [
    (ISection(200, 100, 5.6, 100, ROLLED, r=12), r"2 t_f"),  # flanges fill the height
    (ISection(200, 100, 100, 8.5, ROLLED, r=12), r"t_w"),  # web as wide as the flange
    (ISection(200, 100, 5.6, 8.5, ROLLED, r=95), r"c_w"),  # c_w = 200 - 17 - 190 = -7
    (ISection(200, 100, 5.6, 8.5, WELDED, s=48), r"c_f"),  # c_w = 87 but c_f = (94.4 - 96) / 2 < 0
    (ISection(200, 100, 5.6, 8.5, ROLLED, r=-1), r"zero or more"),
    (ISection(-200, 100, 5.6, 8.5, ROLLED, r=12), r"positive"),
    (Channel(200, 75, 8.5, 11.5, ROLLED, r=70), r"c_f"),  # c_f = 75 - 8.5 - 70 < 0
    (Channel(20, 75, 8.5, 11.5, ROLLED, r=1), r"2 t_f"),
    (TSection(100, 100, 6, 8, ROLLED, 100, r=10), r"c_stem"),  # c_stem not less than h
    (TSection(100, 100, 6, 8, ROLLED, 80, r=50), r"c_f"),  # c_f = (100 - 6 - 100) / 2 < 0
    (TSection(100, 100, 6, 100, ROLLED, 80, r=10), r"t_f"),
    (Angle(75, 100, 8), r"longer leg"),
    (Angle(100, 75, 80), r"thickness"),
    (RHS(100, 50, 25), r"too thick"),  # 2t = 50 is not less than b = 50
    (RHS(100, 80, 34), r"c_w"),  # 2t = 68 < 80 but c_w = 100 - 102 < 0
    (RHS(100, 50, 20), r"c_f"),  # c_f = 50 - 60 < 0 (2t = 40 < 50)
    (CHS(100, 50), r"half the diameter"),
]


@pytest.mark.parametrize(("template", "message"), IMPOSSIBLE)
def test_impossible_geometry_is_refused(template: Any, message: str) -> None:
    with pytest.raises(InvalidSectionError, match=message):
        template.plates()


def test_a_large_weld_still_leaves_a_positive_flange() -> None:
    # c_f = (100 - 5.6 - 2 * 40) / 2 = 7.2 > 0: the shape exists
    assert c_values(ISection(200, 100, 5.6, 8.5, WELDED, s=40))["flange"] == pytest.approx(7.2)


def test_a_rolled_section_needs_r_and_a_welded_one_needs_s() -> None:
    with pytest.raises(InvalidSectionError, match="root radius"):
        ISection(200, 100, 5.6, 8.5, ROLLED).plates()
    with pytest.raises(InvalidSectionError, match="weld leg"):
        ISection(200, 100, 5.6, 8.5, WELDED, r=12).plates()


# --- through services: B.5 and B.6.2 ---------------------------------------------------------


def i_geometry(**changes: Any) -> services.GeometryForm:
    values: dict[str, Any] = {
        "kind": services.GeometryKind.TEMPLATE,
        "shape": SectionType.I_SECTION,
        "fabrication": ROLLED,
        "h": 200,
        "b": 100,
        "tw": 5.6,
        "tf": 8.5,
        "r": 12,
        "k_sigma": {PlateRole.WEB: K_INTERNAL, PlateRole.FLANGE: K_OUTSTAND},
    }
    values.update(changes)
    return services.GeometryForm(**values)


def rhs_geometry(**changes: Any) -> services.GeometryForm:
    values: dict[str, Any] = {
        "kind": services.GeometryKind.TEMPLATE,
        "shape": SectionType.RHS,
        "h": 100,
        "b": 50,
        "tw": None,
        "t": 4,
        "k_sigma": {PlateRole.WEB: K_INTERNAL, PlateRole.FLANGE: K_INTERNAL},
    }
    values.update(changes)
    return services.GeometryForm(**values)


def deformation(geometry: services.GeometryForm) -> services.DeformationOutcome:
    return services.run_deformation_capacity(MODEL, services.DeformationForm(geometry, OMEGA, NU))


def test_full_b5_run_for_the_rolled_i_section() -> None:
    # c_w = 159, t_w = 5.6, k = 4:  σ_cr,p = 4 π² 200000 5.6² / (12 (1 - 0.09) 159²) = 896.91
    # c_f = 35.2, t_f = 8.5, k = 0.43: σ_cr,p = 4532.4, so the web governs
    # λ_p,cs = sqrt(210 / 896.91) = 0.48388 ; ε_csm/ε_y = 0.25 / λ^3.6 = 3.411 (below the cap 15)
    out = deformation(i_geometry())
    assert out.family is SectionFamily.FLAT_PLATES
    assert out.slenderness.governing_label == "web"
    assert out.slenderness.sigma_cr_cs == pytest.approx(896.91, rel=1e-4)
    assert out.slenderness.slenderness == pytest.approx(0.48388, rel=1e-4)
    assert out.capacity.strain_ratio == pytest.approx(3.4111, rel=1e-3)
    assert out.capacity.zone is Zone.STOCKY
    symbols = [s.symbol for s in out.trace]
    assert symbols[:2] == ["c_w", "c_f"]  # the derived c comes first in the working
    assert "σ_cr,p [web]" in symbols
    assert [p.role for p in out.template_plates] == [PlateRole.WEB, PlateRole.FLANGE]
    assert any("8.2.2(5)" in note for note in out.notes)


def test_rhs_b5_values() -> None:
    # c_web = 88, c_flange = 38, t = 4, k = 4:
    # σ_web = 4 π² 200000 16 / (12 0.91 88²) = 1493.9 ; σ_flange = 8011.6 (web governs)
    # λ = sqrt(210 / 1493.9) = 0.37493 ; ε_csm/ε_y = 0.25 / 0.37493^3.6 = 8.545
    out = deformation(rhs_geometry())
    assert out.slenderness.governing_label == "web"
    assert out.slenderness.slenderness == pytest.approx(0.37493, rel=1e-4)
    assert out.capacity.strain_ratio == pytest.approx(8.545, rel=1e-3)


def test_each_role_has_its_own_k_sigma() -> None:
    base = deformation(i_geometry())
    stiffer_flange = deformation(i_geometry(k_sigma={PlateRole.WEB: 4.0, PlateRole.FLANGE: 9.0}))
    assert stiffer_flange.slenderness.slenderness == base.slenderness.slenderness  # web governs
    weak_web = deformation(i_geometry(k_sigma={PlateRole.WEB: 1.0, PlateRole.FLANGE: 0.43}))
    assert weak_web.slenderness.slenderness == pytest.approx(2 * base.slenderness.slenderness)


def test_b62_with_a_template_equals_the_same_plates_entered_by_hand() -> None:
    template = services.CompressionForm(
        services.DeformationForm(i_geometry(), OMEGA, NU), 2848.0, GAMMA_M0
    )
    by_hand = services.CompressionForm(
        services.DeformationForm(
            services.GeometryForm(
                services.GeometryKind.PLATES,
                plates=(
                    services.PlateForm("web", 159.0, 5.6, K_INTERNAL),
                    services.PlateForm("flange", 35.2, 8.5, K_OUTSTAND),
                ),
            ),
            OMEGA,
            NU,
        ),
        2848.0,
        GAMMA_M0,
    )
    a = services.run_compression(MODEL, template)
    b = services.run_compression(MODEL, by_hand)
    assert a.result.resistance == pytest.approx(b.result.resistance, rel=1e-12)
    # ε_csm/ε_y = 3.4111 is not below 1.0, so B.16 applies (f_csm from B.17)
    assert a.result.formula.value == "B.16"
    assert a.result.strain_ratio == pytest.approx(3.4111, rel=1e-3)
    assert {"c_w", "c_f"} <= {s.symbol for s in a.trace}


def test_chs_template_equals_the_chs_route() -> None:
    template = deformation(
        services.GeometryForm(services.GeometryKind.TEMPLATE, shape=SectionType.CHS, d=100, t=3)
    )
    plain = deformation(services.GeometryForm(services.GeometryKind.CHS, d=100, t=3))
    assert template.family is SectionFamily.CIRCULAR_HOLLOW
    assert template.slenderness.slenderness == plain.slenderness.slenderness
    assert template.template_plates == ()


@pytest.mark.parametrize(
    ("changes", "message"),
    [
        ({"shape": None}, "section type"),
        ({"fabrication": None}, "fabrication"),
        ({"r": None}, "r"),
        ({"h": None}, "h"),
        ({"k_sigma": {PlateRole.WEB: 4.0}}, "k_σ of the flange"),
        ({"k_sigma": {}}, "k_σ"),
    ],
)
def test_a_missing_input_is_named(changes: dict[str, Any], message: str) -> None:
    with pytest.raises(InvalidSectionError, match=message):
        deformation(i_geometry(**changes))


def test_nu_is_required() -> None:
    with pytest.raises(InvalidSectionError, match="ν"):
        form = services.DeformationForm(i_geometry(), OMEGA, None)
        services.run_deformation_capacity(MODEL, form)


def test_t_section_needs_its_stem() -> None:
    geometry = services.GeometryForm(
        services.GeometryKind.TEMPLATE,
        shape=SectionType.T_SECTION,
        fabrication=ROLLED,
        h=100, b=100, tw=6, tf=8, r=10,
        k_sigma={PlateRole.FLANGE: 0.43, PlateRole.STEM: 0.43},
    )  # fmt: skip
    with pytest.raises(InvalidSectionError, match="c_stem"):
        deformation(geometry)
    out = deformation(services.GeometryForm(**{**geometry.__dict__, "c_stem": 80}))
    assert out.slenderness.governing_label in {"flange", "stem"}
    assert {"c_f", "c_stem"} <= {s.symbol for s in out.trace}


# --- the comparison sweep ----------------------------------------------------------------------


def test_scaling_multiplies_tw_tf_and_t_and_keeps_the_rest() -> None:
    scaled = services.scale_thickness(i_geometry(), 2.0)
    assert (scaled.tw, scaled.tf) == (11.2, 17.0)
    assert (scaled.h, scaled.b, scaled.r) == (200, 100, 12)
    rhs = services.scale_thickness(rhs_geometry(), 0.5)
    assert (rhs.t, rhs.h, rhs.b) == (2.0, 100, 50)
    welded = services.scale_thickness(i_geometry(fabrication=WELDED, r=None, s=5), 2.0)
    assert welded.s == 5
    tube = services.scale_thickness(
        services.GeometryForm(services.GeometryKind.TEMPLATE, shape=SectionType.CHS, d=100, t=3),
        2.0,
    )
    assert (tube.d, tube.t) == (100, 6.0)


def test_c_is_derived_again_at_each_point_of_the_sweep() -> None:
    # RHS 100 x 50 x 4 made 1.5 times thicker (t = 6):
    # c_web = 100 - 18 = 82, c_flange = 50 - 18 = 32
    scaled = services.scale_thickness(rhs_geometry(), 1.5)
    assert c_values(RHS(100, 50, scaled.t or 0)) == {
        "web": pytest.approx(82.0),
        "flange": pytest.approx(32.0),
    }
    out = deformation(scaled)
    assert [p.c for p in out.template_plates] == [pytest.approx(82.0), pytest.approx(32.0)]


@pytest.mark.parametrize("geometry", [i_geometry(), rhs_geometry()])
def test_the_comparison_accepts_a_template(geometry: services.GeometryForm) -> None:
    form = services.DeformationForm(geometry, OMEGA, NU)
    comparison = services.run_comparison(MODEL, form)
    plain = services.run_deformation_capacity(MODEL, form)
    yours = next(r for r in comparison.references if r.key == "yours").point
    assert yours.factor == 1.0
    assert yours.slenderness == pytest.approx(plain.slenderness.slenderness)
    assert yours.governing_label == plain.slenderness.governing_label
    lams = [p.slenderness for p in comparison.points]
    assert all(a >= b for a, b in pairwise(lams))
    assert len(comparison.points) > 50
    # the sweep stops before the shape stops existing, so no point raised
    assert comparison.points[-1].factor < 1e3


def test_the_sweep_stops_before_the_flanges_fill_the_height() -> None:
    form = services.DeformationForm(i_geometry(), OMEGA, NU)
    comparison = services.run_comparison(MODEL, form)
    # 2 t_f < h and c_w > 0 bound t_f: c_w = 200 - 2 * 8.5 f - 24 > 0 gives f < 176 / 17 = 10.35
    assert comparison.points[-1].factor < 176 / 17
