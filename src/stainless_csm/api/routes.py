"""The /api/v1 endpoints. Each one: build inputs, call services, map to the response."""

from typing import Any

from fastapi import APIRouter

from stainless_csm import services
from stainless_csm.api import mappers
from stainless_csm.api import schemas as s
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
    """The symbol glossary: one line per symbol. `topic` is material, deformation or tension."""
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
        slenderness=mappers.slenderness_out(outcome.slenderness),
        strain_limit=mappers.strain_limit_out(outcome.capacity),
        notes=list(outcome.notes),
        trace=mappers.trace_steps(outcome.trace),
        figure=plotly_figures.base_curve_figure(outcome.capacity),
    )
