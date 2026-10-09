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
from stainless_csm.sections import properties as props
from stainless_csm.sections.templates import Fabrication, PlateRole, TemplatePlate


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
    k_sigma = {
        PlateRole(role): value
        for role, value in (g.k_sigma.model_dump() if g.k_sigma else {}).items()
        if value is not None
    }
    geometry = services.GeometryForm(
        kind=services.GeometryKind[g.kind.name],
        d=g.d,
        t=g.t,
        plates=tuple(
            services.PlateForm(p.label, p.width, p.thickness, p.k_sigma) for p in g.plates
        ),
        sigma_cr_cs=g.sigma_cr_cs,
        family=family,
        shape=g.shape,
        fabrication=None if g.fabrication is None else Fabrication(g.fabrication.value),
        h=g.h,
        b=g.b,
        tw=g.t_w,
        tf=g.t_f,
        r=g.r,
        s=g.s,
        c_stem=g.c_stem,
        r_o=g.r_o,
        k_sigma=k_sigma,
    )
    return services.DeformationForm(
        geometry=geometry, omega=request.omega, poisson_ratio=request.poisson_ratio
    )


def slenderness_out(
    result: SlendernessResult, template_plates: tuple[TemplatePlate, ...] = ()
) -> s.SlendernessOut:
    by_label = {plate.label: plate for plate in template_plates}
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
            role=_template_role(by_label, check.plate.label),
            plate_type=_template_type(by_label, check.plate.label),
            c_source=by_label[check.plate.label].source if check.plate.label in by_label else None,
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


def _template_role(by_label: dict[str, TemplatePlate], label: str) -> s.PlateRoleKey | None:
    plate = by_label.get(label)
    return None if plate is None else s.PlateRoleKey(plate.role.value)


def _template_type(by_label: dict[str, TemplatePlate], label: str) -> s.PlateTypeKey | None:
    plate = by_label.get(label)
    return None if plate is None else s.PlateTypeKey(plate.kind.value)


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


# --- compression -----------------------------------------------------------------------


def compression_form(request: s.CompressionRequest) -> services.CompressionForm:
    return services.CompressionForm(
        deformation=deformation_form(
            s.DeformationRequest(
                material=request.material,
                geometry=request.geometry,
                omega=request.omega,
                poisson_ratio=request.poisson_ratio,
            )
        ),
        area=request.area,
        gamma_m0=request.gamma_m0,
    )


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
        governing_label=point.governing_label,
    )


def reference_out(reference: services.ReferenceSection) -> s.ReferenceSectionOut:
    return s.ReferenceSectionOut(
        key=reference.key, label=reference.label, point=comparison_point_out(reference.point)
    )


# --- section properties ----------------------------------------------------------------


def section_geometry_form(request: s.SectionPropertiesRequest) -> services.GeometryForm:
    """The dimensions of a properties request as the template geometry the engine reads."""
    return services.GeometryForm(
        kind=services.GeometryKind.TEMPLATE,
        shape=request.shape,
        fabrication=None if request.fabrication is None else Fabrication(request.fabrication.value),
        d=request.d,
        t=request.t,
        h=request.h,
        b=request.b,
        tw=request.t_w,
        tf=request.t_f,
        r=request.r,
        s=request.s,
        r_o=request.r_o,
    )


def _six(value: float) -> float:
    """Six significant figures: what the table shows and what Use copies. Rounding noise is 0."""
    return 0.0 if abs(value) < 1e-9 else float(f"{value:.6g}")


def _differ(a: float, b: float) -> bool:
    return abs(a - b) > 1e-9 * max(abs(a), abs(b), 1.0)


def property_rows(p: props.SectionProperties) -> list[s.PropertyRowOut]:
    """The table in reading order. Names and units are the engine's; the browser only shows them."""
    rows: list[s.PropertyRowOut] = []

    def add(
        group: str,
        key: str,
        symbol: str,
        name: str,
        value: float,
        unit: str,
        note: str | None = None,
    ) -> None:
        row = s.PropertyRowOut(
            key=key, symbol=symbol, name=name, value=_six(value), unit=unit, group=group, note=note
        )
        rows.append(row)

    area = "Area and centroid"
    from_origin = f"from {props.ORIGIN}"
    add(area, "A", "A", "Cross-sectional area", p.area, "mm²", "gross, with the fillets and welds")
    add(area, "y_c", "y_c", "Centroid, horizontal", p.y_c, "mm", from_origin)
    add(area, "z_c", "z_c", "Centroid, vertical", p.z_c, "mm", from_origin)
    add(area, "e_top", "e_top", "Centroid to the top fibre", p.e_top, "mm")
    add(area, "e_bottom", "e_bottom", "Centroid to the bottom fibre", p.e_bottom, "mm")
    add(area, "e_left", "e_left", "Centroid to the left fibre", p.e_left, "mm")
    add(area, "e_right", "e_right", "Centroid to the right fibre", p.e_right, "mm")

    second = "Second moment of area (about the centroid)"
    add(second, "I_y", "I_y", "Second moment about y-y", p.i_y, "mm⁴")
    add(second, "I_z", "I_z", "Second moment about z-z", p.i_z, "mm⁴")
    if p.principal is not None:
        add(second, "I_yz", "I_yz", "Product of inertia", p.i_yz, "mm⁴")

    elastic = "Elastic section modulus"
    for axis, sides in (
        ("y", {"top": p.w_el_y_top, "bottom": p.w_el_y_bottom}),
        ("z", {"left": p.w_el_z_left, "right": p.w_el_z_right}),
    ):
        smaller = min(sides, key=lambda side: sides[side])
        differing = _differ(*sides.values())
        note = f"the smaller one, at the {smaller} fibre" if differing else None
        name = f"Elastic modulus about {axis}-{axis}"
        add(elastic, f"W_el_{axis}", f"W_el,{axis}", name, sides[smaller], "mm³", note)
        if differing:
            for side, value in sides.items():
                key = f"W_el_{axis}_{side}"
                add(elastic, key, f"W_el,{axis}", f"{name}, {side} fibre", value, "mm³")

    plastic = "Plastic section modulus"
    add(plastic, "z_pl_y", "z_pl,y", "Plastic neutral axis for y-y", p.plastic_axis_y, "mm",
        "height of the equal-area line above the lowest point")  # fmt: skip
    add(plastic, "W_pl_y", "W_pl,y", "Plastic modulus about y-y", p.w_pl_y, "mm³")
    add(plastic, "y_pl_z", "y_pl,z", "Plastic neutral axis for z-z", p.plastic_axis_z, "mm",
        "distance of the equal-area line from the leftmost point")  # fmt: skip
    add(plastic, "W_pl_z", "W_pl,z", "Plastic modulus about z-z", p.w_pl_z, "mm³")

    shear = f"Shear centre ({props.SHEAR_CENTRE_LABEL})"
    shear_note = f"{props.SHEAR_CENTRE_LABEL}: {p.shear_centre_note}"
    add(shear, "y_s", "y_s", "Shear centre, horizontal", p.shear_centre_y, "mm", shear_note)
    add(shear, "z_s", "z_s", "Shear centre, vertical", p.shear_centre_z, "mm", shear_note)

    if p.principal is not None:
        axes = "Principal axes (angle)"
        angle = p.principal.angle_deg
        add(axes, "theta_u", "θ_u", "Major axis u from the y axis", angle, "°",
            "counter-clockwise, z up")  # fmt: skip
        add(axes, "I_u", "I_u", "Second moment about the major axis u", p.principal.i_u, "mm⁴")
        add(axes, "I_v", "I_v", "Second moment about the minor axis v", p.principal.i_v, "mm⁴")
    return rows


def _modulus(sides: dict[str, float]) -> s.ElasticModulusOut:
    smaller = min(sides, key=lambda side: sides[side])
    equal = not _differ(*sides.values())
    return s.ElasticModulusOut(
        value=sides[smaller], smaller_side="equal" if equal else smaller, sides=sides
    )


def section_properties_out(p: props.SectionProperties) -> s.SectionPropertiesResponse:
    return s.SectionPropertiesResponse(
        shape=p.shape,
        label=props.LABEL,
        method=(
            "The outline is a polygon (fillets and corner radii are arcs of many segments, welds "
            "are triangles of leg s); Green's theorem gives A, the centroid and the second "
            "moments. The plastic neutral axis cuts the area in two equal halves."
        ),
        origin=props.ORIGIN,
        width=p.width,
        height=p.height,
        area=p.area,
        centroid=s.PointOut(y=p.y_c, z=p.z_c),
        fibres=s.FibreDistancesOut(
            top=p.e_top, bottom=p.e_bottom, left=p.e_left, right=p.e_right
        ),
        i_y=p.i_y,
        i_z=p.i_z,
        i_yz=p.i_yz,
        w_el_y=_modulus({"top": p.w_el_y_top, "bottom": p.w_el_y_bottom}),
        w_el_z=_modulus({"left": p.w_el_z_left, "right": p.w_el_z_right}),
        plastic_axis_y=p.plastic_axis_y,
        plastic_axis_z=p.plastic_axis_z,
        w_pl_y=p.w_pl_y,
        w_pl_z=p.w_pl_z,
        shear_centre=s.ShearCentreOut(
            point=s.PointOut(y=p.shear_centre_y, z=p.shear_centre_z),
            label=props.SHEAR_CENTRE_LABEL,
            note=p.shear_centre_note,
        ),
        principal=None
        if p.principal is None
        else s.PrincipalAxesOut(
            angle_deg=p.principal.angle_deg, i_u=p.principal.i_u, i_v=p.principal.i_v
        ),
        rows=property_rows(p),
        notes=[
            "Reference values: nothing enters a calculation unless you click Use, which copies "
            "the value into its input field.",
            "No torsion constant or warping constant: Annex B does not use them.",
        ],
    )
