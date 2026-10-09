import re
from pathlib import Path

import pytest

from helpers import GAMMA_M0, NU, OMEGA, grade_material
from stainless_csm import services
from stainless_csm.core.enums import SectionType
from stainless_csm.csm.bending import BendingAxis
from stainless_csm.csm.deformation_capacity import SectionFamily
from stainless_csm.csm.tension import CSMTension, TensionInput
from stainless_csm.material_models.csm_bilinear import CSMBilinearModel
from stainless_csm.sections.templates import Fabrication, PlateRole
from stainless_csm.symbols import (
    README_END,
    README_START,
    load_symbols,
    symbols_for,
    symbols_markdown,
)

ROOT = Path(__file__).resolve().parent.parent
KNOWN = {entry.symbol for entry in load_symbols()}


def test_symbols_are_unique_and_complete() -> None:
    symbols = [e.symbol for e in load_symbols()]
    assert len(symbols) == len(set(symbols))
    for entry in load_symbols():
        assert entry.name and entry.meaning and entry.unit and entry.clause and entry.group
        assert entry.topics


def test_every_meaning_is_one_short_line() -> None:
    for entry in load_symbols():
        assert "\n" not in entry.meaning
        assert len(entry.meaning) <= 140, entry.symbol
        assert entry.meaning.endswith("."), entry.symbol


def test_latex_is_balanced() -> None:
    for entry in load_symbols():
        assert entry.latex.count("{") == entry.latex.count("}"), entry.symbol


def test_topics_are_the_pages() -> None:
    assert {t for e in load_symbols() for t in e.topics} == {
        "material",
        "tension",
        "deformation",
        "compression",
        "bending",
    }
    assert 0 < len(symbols_for("tension")) < len(load_symbols())
    assert 0 < len(symbols_for("compression")) < len(load_symbols())
    assert 0 < len(symbols_for("bending")) < len(load_symbols())
    assert len(symbols_for(None)) == len(load_symbols())


def normalised(symbol: str) -> str:
    """'σ_cr,p [web]' is the glossary entry 'σ_cr,p'."""
    return re.sub(r"\s*\[.*\]$", "", symbol)


def trace_symbols() -> set[str]:
    model = CSMBilinearModel(grade_material("1.4307"))
    tension = CSMTension(TensionInput(model, 1000.0, SectionType.I_SECTION, GAMMA_M0)).calculate()
    found = {s.symbol for s in tension.trace}
    geometries = (
        services.GeometryForm(
            services.GeometryKind.PLATES,
            plates=(
                services.PlateForm("web", 300, 6, 4.0),
                services.PlateForm("flange", 72, 10, 0.43),
            ),
        ),
        services.GeometryForm(services.GeometryKind.CHS, d=100, t=3),
        services.GeometryForm(
            services.GeometryKind.SIGMA_CR,
            sigma_cr_cs=840.0,
            family=SectionFamily.FLAT_PLATES,
        ),
    )
    k = {role: 0.43 for role in PlateRole}

    def template(shape: SectionType, **dims: float) -> services.GeometryForm:
        return services.GeometryForm(
            services.GeometryKind.TEMPLATE,
            shape=shape,
            fabrication=Fabrication.ROLLED,
            k_sigma=k,
            **dims,  # type: ignore[arg-type]
        )

    templates = (
        template(SectionType.I_SECTION, h=200, b=100, tw=5.6, tf=8.5, r=12),
        template(SectionType.T_SECTION, h=100, b=100, tw=6, tf=8, r=10, c_stem=80),
        template(SectionType.ANGLE, h=100, b=75, t=8),
        template(SectionType.RHS, h=100, b=50, t=4),
    )
    for geometry in (*geometries, *templates):
        form = services.DeformationForm(geometry, OMEGA, NU)
        found |= {s.symbol for s in services.run_deformation_capacity(model, form).trace}
    # B.6.2 with both formulas: a stocky and a slender section
    plates = (services.PlateForm("web", 100, 5, 4.0), services.PlateForm("web", 250, 3, 4.0))
    for plate in plates:
        geometry = services.GeometryForm(services.GeometryKind.PLATES, plates=(plate,))
        deformation = services.DeformationForm(geometry, OMEGA, NU)
        form = services.CompressionForm(deformation, 1000.0, GAMMA_M0)
        found |= {s.symbol for s in services.run_compression(model, form).trace}
    # B.6.3.2 with both formulas: a slender and a stocky section in bending
    for plate in (services.PlateForm("web", 250, 3, 8.0), services.PlateForm("web", 100, 5, 4.0)):
        geometry = services.GeometryForm(services.GeometryKind.PLATES, plates=(plate,))
        deformation = services.DeformationForm(geometry, OMEGA, NU)
        w_el, w_pl = 194_318.0, 220_640.0
        axis = BendingAxis.MAJOR
        bending = services.BendingForm(
            deformation, SectionType.I_SECTION, axis, w_el, w_pl, GAMMA_M0, 0.1
        )
        found |= {s.symbol for s in services.run_bending(model, bending).trace}
    return {normalised(s) for s in found}


@pytest.mark.parametrize("symbol", sorted(trace_symbols()))
def test_every_symbol_in_a_calculation_trace_is_explained(symbol: str) -> None:
    assert symbol in KNOWN, f"{symbol} appears in a trace but has no glossary entry"


def test_readme_table_matches_the_glossary() -> None:
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    block = readme.split(README_START)[1].split(README_END)[0].strip()
    assert block == symbols_markdown(), "run: python -m stainless_csm.symbols and paste into README"


DIAGRAMS = {"csm_curve", "plate", "section", "base_curve", "tension", "compression", "bending"}


def test_every_symbol_has_a_detail_and_a_known_diagram() -> None:
    for entry in load_symbols():
        assert len(entry.detail) >= 80, entry.symbol
        assert "\n" not in entry.detail, entry.symbol
        assert entry.diagram in DIAGRAMS, entry.symbol
