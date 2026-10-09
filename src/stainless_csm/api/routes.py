"""The /api/v1 endpoints. Each one: build inputs, call services, map to the response."""

from typing import Any

from fastapi import APIRouter

from stainless_csm import services
from stainless_csm.api import mappers
from stainless_csm.api import schemas as s
from stainless_csm.input_help import load_input_help
from stainless_csm.material_models.csm_bilinear import CSMBilinearModel
from stainless_csm.symbols import symbols_for
from stainless_csm.viz import plotly_figures

router = APIRouter(prefix="/api/v1")

ERRORS: dict[int | str, dict[str, Any]] = {422: {"model": s.ErrorResponse}}


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/grades", response_model=list[s.GradeOut])
def grades() -> list[s.GradeOut]:
    """Table 5.1."""
    return mappers.grades()


@router.get("/symbols", response_model=list[s.SymbolOut])
def symbols(topic: str | None = None) -> list[s.SymbolOut]:
    """The symbol glossary, one line per symbol. `topic` filters it (material, tension, ...)."""
    return [
        s.SymbolOut(
            symbol=e.symbol,
            latex=e.latex,
            name=e.name,
            meaning=e.meaning,
            unit=e.unit,
            clause=e.clause,
            group=e.group,
            topics=list(e.topics),
            detail=e.detail,
            diagram=e.diagram,
        )
        for e in symbols_for(topic)
    ]


@router.get("/input-help", response_model=list[s.InputHelpOut])
def input_help() -> list[s.InputHelpOut]:
    """The "?" help for every input: what, why, where to get it, and its source tag."""
    return [
        s.InputHelpOut(
            key=e.key,
            name=e.name,
            what=e.what,
            why=e.why,
            where=e.where,
            source=e.source,
            in_standard=e.in_standard,
        )
        for e in load_input_help()
    ]


@router.get("/csm-coefficients", response_model=list[s.CoefficientsOut])
def csm_coefficients() -> list[s.CoefficientsOut]:
    """Table B.1."""
    return mappers.coefficients()


@router.post("/material-model", response_model=s.MaterialModelResponse, responses=ERRORS)
def material_model(request: s.MaterialModelRequest) -> s.MaterialModelResponse:
    """B.4: the CSM bilinear model for a material."""
    material = services.build_material(mappers.material_form(request.material))
    model = CSMBilinearModel(material)
    schematic = request.graph_view is s.GraphView.SCHEMATIC
    return s.MaterialModelResponse(
        material=mappers.material_out(material, request.material.designation),
        values=mappers.model_values(model),
        hint=services.material_hint(model),
        coefficients=mappers.coefficients(material.family),
        trace=mappers.trace_steps(model.trace),
        figure=plotly_figures.stress_strain_figure(model, schematic),
    )


@router.post("/tension", response_model=s.TensionResponse, responses=ERRORS)
def tension(request: s.TensionRequest) -> s.TensionResponse:
    """B.6.1: CSM tension resistance."""
    material = services.build_material(mappers.material_form(request.material))
    model = CSMBilinearModel(material)
    form = mappers.tension_form(request.tension)
    result = services.run_tension(model, form)
    schematic = request.graph_view is s.GraphView.SCHEMATIC
    return s.TensionResponse(
        material=mappers.material_out(material, request.material.designation),
        strain_ratio=result.strain_ratio,
        governing=s.GoverningKey[result.governing.name],
        governing_label=result.governing.value,
        strain=result.strain,
        design_stress=result.design_stress,
        resistance=result.resistance,
        notes=list(result.notes),
        trace=mappers.trace_steps(result.trace),
        figure=plotly_figures.stress_strain_figure(model, schematic, result),
    )


@router.post("/deformation-capacity", response_model=s.DeformationResponse, responses=ERRORS)
def deformation_capacity(request: s.DeformationRequest) -> s.DeformationResponse:
    """B.5: cross-section slenderness and the strain limit eps_csm / eps_y (B.6, B.7)."""
    material = services.build_material(mappers.material_form(request.material))
    model = CSMBilinearModel(material)
    outcome = services.run_deformation_capacity(model, mappers.deformation_form(request))
    return s.DeformationResponse(
        material=mappers.material_out(material, request.material.designation),
        family=mappers.family_key(outcome.family),
        slenderness=mappers.slenderness_out(outcome.slenderness, outcome.template_plates),
        strain_limit=mappers.strain_limit_out(outcome.capacity),
        notes=list(outcome.notes),
        trace=mappers.trace_steps(outcome.trace),
        figure=plotly_figures.base_curve_figure(outcome.capacity),
    )


@router.post("/compression", response_model=s.CompressionResponse, responses=ERRORS)
def compression(request: s.CompressionRequest) -> s.CompressionResponse:
    """B.6.2: CSM compression resistance (B.5 for the section, then B.15 to B.17)."""
    material = services.build_material(mappers.material_form(request.material))
    model = CSMBilinearModel(material)
    outcome = services.run_compression(model, mappers.compression_form(request))
    result = outcome.result
    schematic = request.graph_view is s.GraphView.SCHEMATIC
    deformation = outcome.deformation
    return s.CompressionResponse(
        material=mappers.material_out(material, request.material.designation),
        family=mappers.family_key(deformation.family),
        slenderness=mappers.slenderness_out(deformation.slenderness, deformation.template_plates),
        strain_limit=mappers.strain_limit_out(deformation.capacity),
        strain_ratio=result.strain_ratio,
        formula=s.CompressionFormulaKey[result.formula.name],
        formula_label=result.formula.value,
        design_stress=result.design_stress,
        resistance=result.resistance,
        notes=list(deformation.notes) + list(result.notes),
        trace=mappers.trace_steps(outcome.trace),
        capacity_figure=plotly_figures.compression_capacity_figure(
            model, deformation.capacity, result
        ),
        point_figure=plotly_figures.compression_point_figure(model, schematic, result),
    )


@router.post(
    "/section-properties", response_model=s.SectionPropertiesResponse, responses=ERRORS
)
def section_properties(request: s.SectionPropertiesRequest) -> s.SectionPropertiesResponse:
    """A, centroid, I, W_el, W_pl, plastic axes and shear centre from the template dimensions.

    Reference values (geometry, not a rule of EN 1993-1-4): they enter no calculation unless the
    user copies one into an input field.
    """
    result = services.run_section_properties(mappers.section_geometry_form(request))
    return mappers.section_properties_out(result)


@router.post("/section-comparison", response_model=s.ComparisonResponse, responses=ERRORS)
def section_comparison(request: s.ComparisonRequest) -> s.ComparisonResponse:
    """B.5 for the same section made thicker and thinner, to compare stocky with slender."""
    material = services.build_material(mappers.material_form(request.material))
    model = CSMBilinearModel(material)
    comparison = services.run_comparison(model, mappers.comparison_form(request))
    return s.ComparisonResponse(
        material=mappers.material_out(material, request.material.designation),
        family=mappers.family_key(comparison.family),
        values=mappers.model_values(model),
        switch=comparison.switch,
        upper=comparison.upper,
        cap=comparison.your_capacity.cap,
        points=[mappers.comparison_point_out(point) for point in comparison.points],
        references=[mappers.reference_out(ref) for ref in comparison.references],
        base_curve_figure=plotly_figures.comparison_base_curve_figure(comparison),
        stress_figure=plotly_figures.comparison_stress_figure(model, comparison),
        notes=[
            "Every thickness is multiplied by one factor; widths, diameter and k_σ stay as "
            "entered. Each point is a full B.5 calculation on the same B.4 material."
        ],
    )
