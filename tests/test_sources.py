"""Every step names its source (plan.md, section 4h): a kind and a citation a reader can open."""

import re
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient

from helpers import GAMMA_M0, K_INTERNAL, K_OUTSTAND, NU, OMEGA, E, grade_material
from stainless_csm import services
from stainless_csm.api.main import create_app
from stainless_csm.core.enums import SectionType
from stainless_csm.core.trace import (
    EN_1993_1_4,
    CalcStep,
    CalcTrace,
    Source,
    SourceKind,
    code,
    source_for_clause,
    source_of,
    user_input,
)
from stainless_csm.csm.bending import BendingAxis, BendingFormula
from stainless_csm.csm.compression import CompressionFormula
from stainless_csm.csm.deformation_capacity import SectionFamily
from stainless_csm.material_models.csm_bilinear import CSMBilinearModel
from stainless_csm.material_models.elastic_plastic import ElasticPerfectlyPlasticModel
from stainless_csm.sections.templates import Fabrication, PlateRole

V1 = "/api/v1"
G = services.GeometryKind
ROLLED, WELDED = Fabrication.ROLLED, Fabrication.WELDED
K_ALL = {
    PlateRole.WEB: K_INTERNAL,
    PlateRole.FLANGE: K_OUTSTAND,
    PlateRole.STEM: K_OUTSTAND,
    PlateRole.LEG: K_OUTSTAND,
}


def model(designation: str = "1.4307") -> CSMBilinearModel:
    return CSMBilinearModel(grade_material(designation))


def plates(*specs: tuple[str, float, float, float]) -> services.GeometryForm:
    return services.GeometryForm(G.PLATES, plates=tuple(services.PlateForm(*s) for s in specs))


def template(shape: SectionType, **values: Any) -> services.GeometryForm:
    return services.GeometryForm(G.TEMPLATE, shape=shape, k_sigma=K_ALL, **values)


STOCKY_PLATE = plates(("web", 100, 5, 4.0))
SLENDER_PLATE = plates(("web", 250, 3, 8.0))
GEOMETRIES = {
    "chs": services.GeometryForm(G.CHS, d=100, t=3),
    "plates": plates(("web", 180, 6, K_INTERNAL), ("flange", 60, 8, K_OUTSTAND)),
    "sigma_cr": services.GeometryForm(
        G.SIGMA_CR, sigma_cr_cs=900.0, family=SectionFamily.FLAT_PLATES
    ),
    "beyond the limit": plates(("web", 600, 2, K_INTERNAL)),
    "rolled I": template(
        SectionType.I_SECTION, fabrication=ROLLED, h=200, b=100, tw=5.6, tf=8.5, r=12
    ),
    "welded I": template(SectionType.I_SECTION, fabrication=WELDED, h=200, b=100, tw=6, tf=9, s=4),
    "channel": template(
        SectionType.CHANNEL, fabrication=ROLLED, h=200, b=75, tw=8.5, tf=11.5, r=12
    ),
    "T-section": template(
        SectionType.T_SECTION, fabrication=ROLLED, h=100, b=100, tw=8, tf=8, r=10, c_stem=80
    ),
    "angle": template(SectionType.ANGLE, h=100, b=75, t=8, r=10),
    "RHS": template(SectionType.RHS, h=100, b=50, t=4),
    "CHS template": template(SectionType.CHS, d=100, t=3),
}


def deformation_form(geometry: services.GeometryForm) -> services.DeformationForm:
    return services.DeformationForm(geometry, OMEGA, NU)


def bending_form(geometry: services.GeometryForm) -> services.BendingForm:
    return services.BendingForm(
        deformation_form(geometry),
        SectionType.I_SECTION,
        BendingAxis.MAJOR,
        194_318,
        220_640,
        GAMMA_M0,
        0.15,
    )


def all_traces() -> Iterator[tuple[str, CalcTrace]]:
    """A trace from every service and branch: material, tension, deformation, the templates,
    compression (B.15, B.16), bending (B.19, B.20), the comparison sweep, the classic model."""
    for designation in ("1.4307", "1.4462", "1.4003"):
        m = model(designation)
        yield f"material {designation}", m.trace
        tension = services.run_tension(m, services.TensionForm(1000, None, GAMMA_M0))
        yield f"tension {designation}", tension.trace
    m = model()
    yield "elastic-plastic", ElasticPerfectlyPlasticModel(m.material, 0.05).trace
    for name, geometry in GEOMETRIES.items():
        outcome = services.run_deformation_capacity(m, deformation_form(geometry))
        yield f"deformation {name}", outcome.trace
    for name, geometry in (("B.16", STOCKY_PLATE), ("B.15", SLENDER_PLATE)):
        form = services.CompressionForm(deformation_form(geometry), 1000, GAMMA_M0)
        compression = services.run_compression(m, form)
        assert compression.result.formula is CompressionFormula(name)
        yield f"compression {name}", compression.trace
    for name, geometry in (("B.20", plates(("web", 100, 5, 8.0))), ("B.19", SLENDER_PLATE)):
        bending = services.run_bending(m, bending_form(geometry))
        assert bending.result.formula is BendingFormula(name)
        yield f"bending {name}", bending.trace
    for name in ("chs", "plates", "rolled I"):
        comparison = services.run_comparison(m, deformation_form(GEOMETRIES[name]), n=5)
        for i, point in enumerate(comparison.points):
            yield f"comparison {name} #{i}", point.capacity.trace
    for name, geometry in GEOMETRIES.items():
        if geometry.kind is G.TEMPLATE:
            built = services.build_template(geometry).plates()
            yield f"template {name}", CalcTrace(p.step for p in built)


TRACES = dict(all_traces())
STEPS = [(name, step) for name, trace in TRACES.items() for step in trace]


def test_the_traces_cover_every_service() -> None:
    assert {name.split()[0] for name in TRACES} == {
        "material",
        "tension",
        "elastic-plastic",
        "deformation",
        "compression",
        "bending",
        "comparison",
        "template",
    }
    assert len(STEPS) > 200


def test_every_step_has_a_valid_kind_and_a_citation() -> None:
    for where, step in STEPS:
        source = source_of(step)
        assert isinstance(source.kind, SourceKind), (where, step.symbol)
        assert source.citation.strip(), (where, step.symbol)


def test_input_steps_are_kind_input() -> None:
    inputs = [(where, step) for where, step in STEPS if step.clause == "input"]
    assert {step.symbol for _, step in inputs} == {"E", "c_stem"}
    for where, step in inputs:
        assert source_of(step).kind is SourceKind.INPUT, (where, step.symbol)


def test_the_entered_critical_stress_is_an_input() -> None:
    source = source_of(TRACES["deformation sigma_cr"].get("σ_cr,cs"))
    assert source.kind is SourceKind.INPUT
    assert "B.5.2(2)" in source.citation


def test_every_code_citation_names_en_1993_1_4_and_a_clause() -> None:
    for where, step in STEPS:
        source = source_of(step)
        if source.kind is SourceKind.CODE:
            assert source.citation.startswith(f"{EN_1993_1_4}, "), (where, step.symbol)
            assert re.search(r"\d", source.citation[len(EN_1993_1_4) :]), (where, step.symbol)


def test_no_step_claims_a_textbook_paper_or_derived_source_yet() -> None:
    assert {source_of(step).kind for _, step in STEPS} == {SourceKind.CODE, SourceKind.INPUT}


ANGLE_CITATION = "EN 1993-1-4:2025, 8.2.2(5) (b̄ = h for equal-leg and unequal-leg angles)"


@pytest.mark.parametrize(
    ("trace", "symbol", "citation"),
    [
        ("material 1.4307", "E_sh", "EN 1993-1-4:2025, B.4(1), Formula (B.4)"),
        ("material 1.4307", "ε_u", "EN 1993-1-4:2025, B.4(1), Formula (B.5)"),
        ("material 1.4307", "C₁", "EN 1993-1-4:2025, B.4(1), Table B.1"),
        ("tension 1.4307", "N_csm,t,Rd", "EN 1993-1-4:2025, B.6.1(1), Formula (B.12)"),
        ("tension 1.4307", "f_csm,t", "EN 1993-1-4:2025, B.6.1(1), Formula (B.13)"),
        ("compression B.16", "f_csm", "EN 1993-1-4:2025, B.6.2(1), Formula (B.17)"),
        ("compression B.15", "N_csm,Rd", "EN 1993-1-4:2025, B.6.2(1), Formula (B.15)"),
        ("bending B.20", "M_csm,c,Rd", "EN 1993-1-4:2025, B.6.3.2(1), Formula (B.20)"),
        ("bending B.19", "M_csm,c,Rd", "EN 1993-1-4:2025, B.6.3.2(1), Formula (B.19)"),
        ("bending B.20", "α", "EN 1993-1-4:2025, B.6.3.2(1), Table B.2"),
        ("deformation chs", "σ_cr,c", "EN 1993-1-4:2025, B.5.2(5), Formula (B.11)"),
        ("deformation chs", "(ε_csm/ε_y) base curve", "EN 1993-1-4:2025, B.5.1(1), Formula (B.7)"),
        ("deformation plates", "λ_p,cs", "EN 1993-1-4:2025, B.5.2(1), Formula (B.8)"),
        ("deformation plates", "λ_p [web]", "EN 1993-1-4:2025, 8.2.2(5), Formula (8.5)"),
        ("template angle", "b̄ [leg]", ANGLE_CITATION),
    ],
)
def test_sample_citations(trace: str, symbol: str, citation: str) -> None:
    assert source_of(TRACES[trace].get(symbol)).citation == citation


def test_the_comparison_curve_cites_its_clause_and_the_en_1993_1_1_figure() -> None:
    source = source_of(TRACES["elastic-plastic"].get("ε_y"))
    assert source.kind is SourceKind.CODE
    assert "7.4.3.3(1)" in source.citation
    assert "EN 1993-1-1:2022, Figure 7.9" in source.citation


# --- the data model ---------------------------------------------------------------------------


def test_a_bare_clause_gives_a_source_only_when_unambiguous() -> None:
    assert source_for_clause("input") == Source(SourceKind.INPUT, "Entered by the user")
    assert source_for_clause("B.17") == code("B.17")
    assert source_for_clause("8.2.2(5)").citation == "EN 1993-1-4:2025, 8.2.2(5)"
    assert source_for_clause("B.6.3.1(1)").kind is SourceKind.CODE
    for unclear in ("Table B.1", "EN 1993-1-5", "", "given"):
        with pytest.raises(ValueError):
            source_for_clause(unclear)


def test_positional_steps_still_work_and_take_their_source_from_the_clause() -> None:
    step = CalcStep("ε_y", "d", "B.4", "f_y / E", "210 / 200000", 0.00105, "–")
    assert step.source == code("B.4")
    typed = CalcStep("E", "d", "input", "input", "200000", E, "N/mm²", "E = 200000")
    assert typed.source == user_input()
    with pytest.raises(ValueError):
        CalcStep("x", "d", "somewhere", "f", "1", 1.0, "–")


def test_an_explicit_source_wins_over_the_clause() -> None:
    gere = Source(SourceKind.TEXTBOOK, "Gere & Timoshenko, Mechanics of Materials, 2nd ed., p. 538")
    step = CalcStep("y_pna", "d", "B.6.3.3(3)", "f", "1", 1.0, "mm", "", gere)
    assert step.source is gere


def test_a_source_needs_a_kind_and_a_citation() -> None:
    with pytest.raises(ValueError):
        Source(SourceKind.PAPER, "  ")
    with pytest.raises(TypeError):
        Source("code", "EN 1993-1-4:2025, B.4")  # type: ignore[arg-type]


# --- the API contract ---------------------------------------------------------------------------

client = TestClient(create_app())
MATERIAL = {"designation": "1.4307", "elastic_modulus": E}
DEFORMATION = {
    "material": MATERIAL,
    "geometry": {
        "kind": "plates",
        "plates": [{"label": "web", "width": 100, "thickness": 5, "k_sigma": 8.0}],
    },
    "omega": OMEGA,
    "poisson_ratio": NU,
}
BENDING = {
    **DEFORMATION,
    "section_type": "I-section",
    "axis": "major",
    "w_el": 194_318,
    "w_pl": 220_640,
    "gamma_m0": GAMMA_M0,
    "lambda_lt": 0.15,
}


@pytest.mark.parametrize(
    ("path", "body"),
    [
        ("material-model", {"material": MATERIAL}),
        ("tension", {"material": MATERIAL, "tension": {"area": 1000, "gamma_m0": GAMMA_M0}}),
        ("deformation-capacity", DEFORMATION),
        ("compression", {**DEFORMATION, "area": 1000, "gamma_m0": GAMMA_M0}),
        ("bending", BENDING),
    ],
)
def test_the_api_returns_the_source_of_every_step(path: str, body: dict[str, object]) -> None:
    r = client.post(f"{V1}/{path}", json=body)
    assert r.status_code == 200, r.text
    trace = r.json()["trace"]
    assert trace
    for step in trace:
        assert set(step["source"]) == {"kind", "citation"}
        assert step["source"]["kind"] in {kind.value for kind in SourceKind}
        assert step["source"]["citation"]
        if step["clause"] == "input":
            assert step["source"]["kind"] == "input"


def test_the_api_step_carries_the_engine_source() -> None:
    body = client.post(f"{V1}/material-model", json={"material": MATERIAL}).json()
    assert body["trace"][0]["symbol"] == "E"
    assert body["trace"][0]["source"] == {"kind": "input", "citation": "Entered by the user"}
    e_sh = next(step for step in body["trace"] if step["symbol"] == "E_sh")
    assert e_sh["source"] == {
        "kind": "code",
        "citation": "EN 1993-1-4:2025, B.4(1), Formula (B.4)",
    }


def test_lambda_lt_is_an_input_with_the_gate_named() -> None:
    """λ_LT is typed by the user (member design); only the 0.2 gate is B.6.3.1(1)."""
    steps = [step for _, step in STEPS if step.symbol == "λ_LT"]
    assert steps
    for step in steps:
        assert step.source is not None
        assert step.source.kind is SourceKind.INPUT
        assert "B.6.3.1(1)" in step.source.citation
