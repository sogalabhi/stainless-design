"""Engine objects to response schemas."""

from stainless_csm import formatting as fmt
from stainless_csm import services
from stainless_csm.api import schemas as s
from stainless_csm.core.enums import StainlessFamily
from stainless_csm.core.trace import CalcTrace
from stainless_csm.csm.deformation_capacity import LIMITS, DeformationResult, SectionFamily
from stainless_csm.csm.slenderness import SlendernessResult
from stainless_csm.data.repository import GradeRepository, csm_coefficients_for
from stainless_csm.material_models.csm_bilinear import CSMBilinearModel
from stainless_csm.materials.material import Material


def material_form(data: s.MaterialInput) -> services.MaterialForm:
    return services.MaterialForm(
        designation=data.designation,
        family=data.family or StainlessFamily.AUSTENITIC,
        fy=data.fy if data.fy is not None else 210.0,
        fu=data.fu if data.fu is not None else 500.0,
        elastic_modulus=data.elastic_modulus,
        enhanced=data.enhanced,
    )


def grades() -> list[s.GradeOut]:
    repo = GradeRepository.load_default()
    out = []
    for designation in repo.designations():
        g = repo.get(designation)
        out.append(
            s.GradeOut(
                designation=designation,
                label=services.grade_label(designation),
                family=g.family,
                strength_class=g.strength_class.value if g.strength_class else None,
                corrosion_class=g.corrosion_class.value if g.corrosion_class else None,
                fy=g.fy,
                fu=g.fu,
                note=g.note,
            )
        )
    return out


def material_out(material: Material, designation: str | None) -> s.MaterialOut:
    note = services.grade_note(designation) if designation else None
    return s.MaterialOut(
        family=material.family,
        fy=material.fy,
        fu=material.fu,
        elastic_modulus=material.elastic_modulus,
        source=material.source,
        note=note,
    )


def model_values(model: CSMBilinearModel) -> s.ModelValuesOut:
    return s.ModelValuesOut(
        yield_strain=model.yield_strain,
        ultimate_strain=model.ultimate_strain,
        strain_hardening_modulus=model.strain_hardening_modulus,
        strain_limit_c1=model.strain_limit_c1,
        strain_end=model.strain_end,
        stress_at_strain_limit_c1=model.stress_at_strain_limit_c1,
        hardening_ratio=model.hardening_ratio,
        strain_limit_ratio_c1=model.strain_limit_ratio_c1,
    )


def coefficients(selected: StainlessFamily | None = None) -> list[s.CoefficientsOut]:
    """Table B.1, optionally marking the row of the chosen family."""
    rows = []
    for family in StainlessFamily:
        c = csm_coefficients_for(family)
        rows.append(
            s.CoefficientsOut(family=family, c1=c.c1, c2=c.c2, c3=c.c3, selected=family is selected)
        )
    return rows


def trace_steps(trace: CalcTrace) -> list[s.TraceStepOut]:
    return [
        s.TraceStepOut(
            symbol=step.symbol,
            description=step.description,
            clause=step.clause,
            formula=step.formula,
            substituted=step.substituted,
            value=step.value,
            unit=step.unit,
            line=fmt.step_line(step),
            latex=step.latex,
        )
        for step in trace
    ]


def tension_form(data: s.TensionInput) -> services.TensionForm:
    return services.TensionForm(
        area=data.area,
        section_type=data.section_type,
        has_holes=data.has_holes,
        gamma_m0=data.gamma_m0,
    )


# --- B.5 -------------------------------------------------------------------------------

_FAMILY_KEYS = {
    SectionFamily.FLAT_PLATES: s.FamilyKey.FLAT_PLATES,
    SectionFamily.CIRCULAR_HOLLOW: s.FamilyKey.CIRCULAR_HOLLOW,
}


def deformation_form(request: s.DeformationRequest) -> services.DeformationForm:
    g = request.geometry
    family = (
        None
        if g.family is None
        else SectionFamily.CIRCULAR_HOLLOW
        if g.family is s.FamilyKey.CIRCULAR_HOLLOW
        else SectionFamily.FLAT_PLATES
    )
    geometry = services.GeometryForm(
        kind=services.GeometryKind[g.kind.name],
        d=g.d,
        t=g.t,
        plates=tuple(
            services.PlateForm(p.label, p.width, p.thickness, p.k_sigma) for p in g.plates
        ),
        sigma_cr_cs=g.sigma_cr_cs,
        family=family,
    )
    return services.DeformationForm(
        geometry=geometry, omega=request.omega, poisson_ratio=request.poisson_ratio
    )


def slenderness_out(result: SlendernessResult) -> s.SlendernessOut:
    plates = [
        s.PlateOut(
            label=check.plate.label,
            width=check.plate.width,
            thickness=check.plate.thickness,
            width_to_thickness=check.width_to_thickness,
            k_sigma=check.plate.k_sigma,
            sigma_cr=check.sigma_cr,
            slenderness=check.slenderness,
            governing=check.plate.label == result.governing_label,
        )
        for check in result.plates
    ]
    return s.SlendernessOut(
        source=s.SigmaCrSourceKey[result.source.name],
        source_label=result.source.value,
        sigma_cr_cs=result.sigma_cr_cs,
        value=result.slenderness,
        governing_label=result.governing_label,
        plates=plates,
    )


def strain_limit_out(result: DeformationResult) -> s.StrainLimitOut:
    limits = LIMITS[result.family]
    return s.StrainLimitOut(
        zone=s.ZoneKey[result.zone.name],
        allowed=result.allowed,
        message=result.message,
        cap=result.cap,
        cap_source=s.CapSourceKey[result.cap_source.name],
        cap_label=result.cap_source.value,
        raw_ratio=result.raw_ratio,
        capped=result.capped,
        strain_ratio=result.strain_ratio,
        strain=result.strain,
        switch=limits.switch,
        upper=limits.upper,
    )


def family_key(family: SectionFamily) -> s.FamilyKey:
    return _FAMILY_KEYS[family]


# --- comparison ------------------------------------------------------------------------


def comparison_form(request: s.ComparisonRequest) -> services.DeformationForm:
    return deformation_form(
        s.DeformationRequest(
            material=request.material,
            geometry=request.geometry,
            omega=request.omega,
            poisson_ratio=request.poisson_ratio,
        )
    )


def comparison_point_out(point: services.ComparisonPoint) -> s.ComparisonPointOut:
    capacity = point.capacity
    return s.ComparisonPointOut(
        factor=point.factor,
        slenderness=point.slenderness,
        zone=s.ZoneKey[capacity.zone.name],
        strain_ratio=capacity.strain_ratio,
        strain=capacity.strain,
        stress=point.stress,
    )


def reference_out(reference: services.ReferenceSection) -> s.ReferenceSectionOut:
    return s.ReferenceSectionOut(
        key=reference.key, label=reference.label, point=comparison_point_out(reference.point)
    )
