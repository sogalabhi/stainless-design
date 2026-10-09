"""Use cases shared by every front end (desktop app and web API): build the inputs, run the
engine. No UI framework is imported here."""

import math
from collections.abc import Mapping
from dataclasses import dataclass, field, replace
from enum import Enum

from stainless_csm.core.enums import SectionType, StainlessFamily
from stainless_csm.core.errors import InvalidSectionError
from stainless_csm.core.trace import CalcTrace
from stainless_csm.csm.compression import CompressionInput, CompressionResult, CSMCompression
from stainless_csm.csm.deformation_capacity import (
    LIMITS,
    CSMDeformationCapacity,
    DeformationResult,
    SectionFamily,
    raw_ratio,
)
from stainless_csm.csm.slenderness import (
    PlateElement,
    SigmaCrSource,
    SlendernessResult,
    chs_slenderness,
    direct_slenderness,
    plates_slenderness,
)
from stainless_csm.csm.tension import CSMTension, TensionInput, TensionResult
from stainless_csm.data.repository import GradeRepository, csm_coefficients_for
from stainless_csm.material_models.csm_bilinear import CSMBilinearModel
from stainless_csm.materials.material import Material
from stainless_csm.sections.properties import SectionProperties, section_properties
from stainless_csm.sections.templates import (
    CHS,
    RHS,
    Angle,
    Channel,
    Fabrication,
    ISection,
    PlateRole,
    Template,
    TemplatePlate,
    TSection,
)

DEFAULT_DESIGNATION = "1.4307"


@dataclass(frozen=True)
class MaterialForm:
    designation: str | None  # None means a custom material
    elastic_modulus: float  # E is an input, never assumed
    family: StainlessFamily = StainlessFamily.AUSTENITIC  # custom material only
    fy: float = 210.0  # custom material only
    fu: float = 500.0  # custom material only
    enhanced: bool = False  # custom values enhanced by cold-forming (5.1.2.3)


def designations() -> list[str]:
    return GradeRepository.load_default().designations()


def grade_label(designation: str) -> str:
    grade = GradeRepository.load_default().get(designation)
    return f"{designation} · {grade.family.value} · {grade.fy:g}/{grade.fu:g}"


def grade_note(designation: str) -> str | None:
    return GradeRepository.load_default().get(designation).note


def build_material(form: MaterialForm) -> Material:
    """Raises a CSMError for inputs that make no physical sense."""
    if form.designation is None:
        source = "user-enhanced (cold-formed)" if form.enhanced else "user-defined"
        return Material.custom(form.family, form.fy, form.fu, form.elastic_modulus, source)
    grade = GradeRepository.load_default().get(form.designation)
    return Material.from_grade(grade, form.elastic_modulus)


def material_hint(model: CSMBilinearModel) -> str:
    ratio = model.strain_limit_ratio_c1
    governs = "15" if ratio >= 15 else "C₁ε_u/ε_y"
    return (
        f"E_sh/E = {model.hardening_ratio:.4f} · C₁ε_u/ε_y = {ratio:.1f} → "
        f"in tension (B.14) {governs} will govern."
    )


@dataclass(frozen=True)
class CoefficientRow:
    family: str
    c1: str
    c2: str
    c3: str
    selected: bool


def coefficient_rows(selected: StainlessFamily) -> list[CoefficientRow]:
    """Table B.1, with the row of the chosen family marked."""
    rows = []
    for family in StainlessFamily:
        c = csm_coefficients_for(family)
        rows.append(
            CoefficientRow(
                family.value.capitalize(),
                f"{c.c1:.2f}",
                f"{c.c2:.2f}",
                f"{c.c3:.2f}",
                family is selected,
            )
        )
    return rows


@dataclass(frozen=True)
class TensionForm:
    area: float  # mm²
    section_type: SectionType | None
    gamma_m0: float  # an input, never assumed
    has_holes: bool = False


def run_tension(model: CSMBilinearModel, form: TensionForm) -> TensionResult:
    """Raises a CSMError for invalid inputs or when CSM tension does not apply."""
    data = TensionInput(
        model=model,
        area=form.area,
        section_type=form.section_type,
        has_holes=form.has_holes,
        gamma_m0=form.gamma_m0,
    )
    return CSMTension(data).calculate()


# --- B.5: cross-section deformation capacity ---------------------------------------------


@dataclass(frozen=True)
class PlateForm:
    label: str
    width: float  # flat width b̄ [mm]
    thickness: float  # t [mm]
    k_sigma: float  # buckling factor, an input


class GeometryKind(Enum):
    """How the cross-section is described for B.5."""

    CHS = "circular hollow section"
    PLATES = "flat plates (enter each plate)"
    SIGMA_CR = "critical stress (numerical value)"
    TEMPLATE = "section template (8.2.2(5))"


@dataclass(frozen=True)
class GeometryForm:
    """The section as the user describes it. Which fields are used depends on `kind`."""

    kind: GeometryKind
    d: float | None = None
    t: float | None = None
    plates: tuple[PlateForm, ...] = ()
    sigma_cr_cs: float | None = None
    family: SectionFamily | None = None  # needed only when entering sigma_cr,cs
    # the section template (kind TEMPLATE): the shape, how it is made, and its typed dimensions [mm]
    shape: SectionType | None = None
    fabrication: Fabrication | None = None  # I-section, channel and T-section only
    h: float | None = None
    b: float | None = None
    tw: float | None = None
    tf: float | None = None
    r: float | None = None  # root radius of a rolled section
    s: float | None = None  # weld leg of a welded section
    c_stem: float | None = None  # T-section stem flat width: typed, no table draws it
    r_o: float | None = None  # RHS outer corner radius: section properties and drawing only
    k_sigma: Mapping[PlateRole, float] = field(default_factory=dict)  # one input per plate role


@dataclass(frozen=True)
class DeformationForm:
    geometry: GeometryForm
    omega: float  # Ω, an input, never assumed
    poisson_ratio: float | None  # ν, an input; needed unless sigma_cr,cs is entered


@dataclass(frozen=True)
class DeformationOutcome:
    family: SectionFamily
    slenderness: SlendernessResult
    capacity: DeformationResult
    notes: tuple[str, ...]
    trace: CalcTrace
    template_plates: tuple[TemplatePlate, ...] = ()  # the plates a section template produced


def _require(kind: GeometryKind, **values: float | None) -> dict[str, float]:
    missing = [name for name, value in values.items() if value is None]
    if missing:
        raise InvalidSectionError(f"{kind.value}: please give {', '.join(missing)}.")
    return {name: float(value) for name, value in values.items() if value is not None}


def build_template(geometry: GeometryForm, for_plates: bool = True) -> Template:
    """The typed dimensions as one of the six shapes. Raises InvalidSectionError for a gap.

    The T-section stem's flat width c_stem is needed for the plates only (`for_plates`); the
    section properties do not use it.
    """
    kind = GeometryKind.TEMPLATE
    shape = geometry.shape
    if shape is None:
        raise InvalidSectionError(f"{kind.value}: please give the section type.")
    if shape is SectionType.CHS:
        v = _require(kind, d=geometry.d, t=geometry.t)
        return CHS(v["d"], v["t"])
    if shape is SectionType.ANGLE:
        v = _require(kind, h=geometry.h, b=geometry.b, t=geometry.t)
        return Angle(v["h"], v["b"], v["t"], geometry.r)
    if shape is SectionType.RHS:
        v = _require(kind, h=geometry.h, b=geometry.b, t=geometry.t)
        return RHS(v["h"], v["b"], v["t"], geometry.r_o)
    fabrication = geometry.fabrication
    if fabrication is None:
        raise InvalidSectionError(f"{kind.value}: please give the fabrication (rolled or welded).")
    corner = {"r": geometry.r} if fabrication is Fabrication.ROLLED else {"s": geometry.s}
    v = _require(kind, h=geometry.h, b=geometry.b, tw=geometry.tw, tf=geometry.tf, **corner)
    r, s = v.get("r"), v.get("s")
    if shape is SectionType.I_SECTION:
        return ISection(v["h"], v["b"], v["tw"], v["tf"], fabrication, r, s)
    if shape is SectionType.CHANNEL:
        return Channel(v["h"], v["b"], v["tw"], v["tf"], fabrication, r, s)
    c_stem = _require(kind, c_stem=geometry.c_stem)["c_stem"] if for_plates else geometry.c_stem
    return TSection(v["h"], v["b"], v["tw"], v["tf"], fabrication, c_stem, r, s)


def _template_slenderness(
    material: Material, geometry: GeometryForm, poisson: float | None
) -> tuple[SectionFamily, SlendernessResult, tuple[TemplatePlate, ...]]:
    """B.5.2 for a section template: c of each plate from the dimensions, k_sigma from the user."""
    kind = GeometryKind.TEMPLATE
    template = build_template(geometry)
    plates = template.plates()
    nu = _require(kind, **{"ν": poisson})["ν"]
    if isinstance(template, CHS):
        return (
            SectionFamily.CIRCULAR_HOLLOW,
            chs_slenderness(template.d, template.t, material, nu),
            (),
        )
    ks = _require(kind, **{f"k_σ of the {p.label}": geometry.k_sigma.get(p.role) for p in plates})
    elements = [
        PlateElement(p.label, p.c, p.thickness, ks[f"k_σ of the {p.label}"]) for p in plates
    ]
    return SectionFamily.FLAT_PLATES, plates_slenderness(elements, material, nu), plates


def _build(
    material: Material, geometry: GeometryForm, poisson: float | None
) -> tuple[SectionFamily, SlendernessResult, tuple[TemplatePlate, ...]]:
    if geometry.kind is GeometryKind.TEMPLATE:
        return _template_slenderness(material, geometry, poisson)
    family, result = build_slenderness(material, geometry, poisson)
    return family, result, ()


def build_slenderness(
    material: Material, geometry: GeometryForm, poisson: float | None
) -> tuple[SectionFamily, SlendernessResult]:
    """B.5.2: from the section description to sigma_cr,cs and the relative slenderness."""
    kind = geometry.kind
    if kind is GeometryKind.TEMPLATE:
        family, result, _ = _template_slenderness(material, geometry, poisson)
        return family, result
    if kind is GeometryKind.CHS:
        v = _require(kind, d=geometry.d, t=geometry.t, **{"ν": poisson})
        diameter, thickness, nu = v["d"], v["t"], v["ν"]
        return SectionFamily.CIRCULAR_HOLLOW, chs_slenderness(diameter, thickness, material, nu)
    if kind is GeometryKind.PLATES:
        nu = _require(kind, **{"ν": poisson})["ν"]
        elements = [PlateElement(p.label, p.width, p.thickness, p.k_sigma) for p in geometry.plates]
        return SectionFamily.FLAT_PLATES, plates_slenderness(elements, material, nu)
    v = _require(kind, sigma_cr_cs=geometry.sigma_cr_cs)
    if geometry.family is None:
        raise InvalidSectionError(f"{kind.value}: please give the section family.")
    return geometry.family, direct_slenderness(v["sigma_cr_cs"], material)


def run_deformation_capacity(model: CSMBilinearModel, form: DeformationForm) -> DeformationOutcome:
    """B.5: slenderness, then the base curve. Out-of-range slenderness is reported, not raised."""
    family, slenderness, template_plates = _build(model.material, form.geometry, form.poisson_ratio)
    capacity = CSMDeformationCapacity(
        model, family, slenderness.slenderness, form.omega
    ).calculate()
    notes = []
    if slenderness.source is SigmaCrSource.PLATE_B9:
        notes.append(
            "σ_cr,cs is taken as the critical stress of the most slender plate, which is "
            "conservative (B.5.2(3)); a numerical value is usually higher. The buckling "
            "factor k_σ of each plate is your input."
        )
    elif slenderness.source is SigmaCrSource.CHS_B11:
        notes.append("σ_cr,c from Formula B.11, valid for compression and bending.")
    if template_plates:
        notes.insert(
            0,
            "The flat width c of each plate is derived from the section dimensions as 8.2.2(5) "
            "and Tables 7.2 to 7.4 draw it; the working names the source of each. The buckling "
            "factor k_σ of each plate is your input.",
        )
    trace = CalcTrace(plate.step for plate in template_plates)
    for step in slenderness.trace:
        trace.add(step)
    for step in capacity.trace:
        trace.add(step)
    return DeformationOutcome(family, slenderness, capacity, tuple(notes), trace, template_plates)


# --- Section properties: reference values from the template dimensions --------------------------


def run_section_properties(geometry: GeometryForm) -> SectionProperties:
    """A, centroid, I, W_el, W_pl, plastic axes and the shear centre from the typed dimensions.

    Geometry only, not a rule of EN 1993-1-4: the result enters no calculation unless the user
    copies a value into an input. Raises InvalidSectionError for a gap or an impossible shape.
    """
    return section_properties(build_template(geometry, for_plates=False))


# --- B.6.2: compression ----------------------------------------------------------------------


@dataclass(frozen=True)
class CompressionForm:
    """The B.5 inputs of the section, plus the area and γM0 (inputs, never assumed)."""

    deformation: DeformationForm
    area: float  # mm²
    gamma_m0: float


@dataclass(frozen=True)
class CompressionOutcome:
    deformation: DeformationOutcome
    result: CompressionResult
    trace: CalcTrace  # B.4, then the B.5 steps the result depends on, then B.6.2


def run_compression(model: CSMBilinearModel, form: CompressionForm) -> CompressionOutcome:
    """B.5 for the section, then B.6.2. Raises a CSMError for invalid inputs, or NotApplicableError
    when the section is beyond the B.5 slenderness limit."""
    outcome = run_deformation_capacity(model, form.deformation)
    data = CompressionInput(
        model=model, deformation=outcome.capacity, area=form.area, gamma_m0=form.gamma_m0
    )
    result = CSMCompression(data).calculate()
    trace = CalcTrace(model.trace.steps)
    for step in outcome.trace:
        trace.add(step)
    for step in result.trace:
        if step.clause == "B.6.2":
            trace.add(step)
    return CompressionOutcome(outcome, result, trace)


# --- Comparison: the same section made thicker or thinner -------------------------------------


@dataclass(frozen=True)
class ComparisonPoint:
    """The section with every thickness multiplied by `factor`, run through B.5 and B.4."""

    factor: float
    slenderness: float
    capacity: DeformationResult
    stress: float | None  # stress read from the B.4 curve at eps_csm; None when not allowed
    governing_label: str  # the plate (or section) that sets the slenderness


@dataclass(frozen=True)
class ReferenceSection:
    key: str  # a stable machine key
    label: str
    point: ComparisonPoint


@dataclass(frozen=True)
class Comparison:
    family: SectionFamily
    switch: float
    upper: float
    points: tuple[ComparisonPoint, ...]  # ascending thickness factor
    references: tuple[ReferenceSection, ...]  # ascending slenderness
    your_capacity: DeformationResult  # factor 1


SWEEP_POINTS = 81
_BISECTION_STEPS = 80


def scale_thickness(geometry: GeometryForm, factor: float) -> GeometryForm:
    """The same section with every thickness multiplied by `factor` (widths and k_sigma kept).

    For a template that is t_w, t_f and t; h, b, r, s, d and the typed c_stem stay, and c is
    derived again from the scaled dimensions.
    """
    if geometry.kind is GeometryKind.CHS:
        _require(geometry.kind, d=geometry.d, t=geometry.t)
        assert geometry.t is not None
        return GeometryForm(GeometryKind.CHS, d=geometry.d, t=geometry.t * factor)
    if geometry.kind is GeometryKind.PLATES:
        plates = tuple(
            PlateForm(p.label, p.width, p.thickness * factor, p.k_sigma) for p in geometry.plates
        )
        return GeometryForm(GeometryKind.PLATES, plates=plates)
    if geometry.kind is GeometryKind.TEMPLATE:
        build_template(geometry)  # a gap is reported before anything is scaled

        def scaled(value: float | None) -> float | None:
            return None if value is None else value * factor

        return replace(
            geometry, tw=scaled(geometry.tw), tf=scaled(geometry.tf), t=scaled(geometry.t)
        )
    raise InvalidSectionError(
        "Comparing sections needs a circular hollow section or flat plates: a typed "
        "σ_cr,cs has no thickness to change."
    )


def _largest_factor(geometry: GeometryForm) -> float:
    """The factor beyond which the section is geometrically impossible (a tube's wall)."""
    if geometry.kind is GeometryKind.CHS and geometry.d and geometry.t:
        return geometry.d / (2 * geometry.t) * 0.999
    if geometry.kind is GeometryKind.TEMPLATE:
        return _largest_template_factor(geometry)
    return 1e3


def _template_exists(geometry: GeometryForm, factor: float) -> bool:
    try:
        build_template(scale_thickness(geometry, factor)).plates()
    except InvalidSectionError:
        return False
    return True


def _largest_template_factor(geometry: GeometryForm) -> float:
    """The factor beyond which a template cannot exist (a flat width c reaches zero, ...).

    Every limit is linear in the thicknesses, so the shape exists for factors up to one value.
    """
    low, high = 1.0, 1e3
    if _template_exists(geometry, high):
        return high
    for _ in range(_BISECTION_STEPS):
        mid = math.sqrt(low * high)
        if _template_exists(geometry, mid):
            low = mid
        else:
            high = mid
    return low * 0.999


def _point(model: CSMBilinearModel, form: DeformationForm, factor: float) -> ComparisonPoint:
    scaled = DeformationForm(scale_thickness(form.geometry, factor), form.omega, form.poisson_ratio)
    outcome = run_deformation_capacity(model, scaled)
    capacity = outcome.capacity
    stress = None if capacity.strain is None else model.stress_at(capacity.strain)
    return ComparisonPoint(
        factor,
        outcome.slenderness.slenderness,
        capacity,
        stress,
        outcome.slenderness.governing_label,
    )


def _slenderness_at(model: CSMBilinearModel, form: DeformationForm, factor: float) -> float:
    scaled = scale_thickness(form.geometry, factor)
    return build_slenderness(model.material, scaled, form.poisson_ratio)[1].slenderness


def _factor_for_slenderness(
    model: CSMBilinearModel, form: DeformationForm, target: float
) -> float | None:
    """The thickness factor that gives `target` slenderness, or None if it is out of reach.

    Slenderness falls as the section gets thicker, so a bisection on the factor finds it.
    """
    low, high = 1e-3, _largest_factor(form.geometry)
    if not _slenderness_at(model, form, high) <= target <= _slenderness_at(model, form, low):
        return None
    for _ in range(_BISECTION_STEPS):
        mid = math.sqrt(low * high)
        if _slenderness_at(model, form, mid) > target:
            low = mid
        else:
            high = mid
    return math.sqrt(low * high)


def _slenderness_where_cap_starts(family: SectionFamily, cap: float, switch: float) -> float | None:
    """Slenderness on the stocky branch where the base-curve value just reaches the cap."""
    low, high = 1e-3, switch
    if not raw_ratio(family, high) <= cap <= raw_ratio(family, low):
        return None
    for _ in range(_BISECTION_STEPS):
        mid = math.sqrt(low * high)
        if raw_ratio(family, mid) > cap:
            low = mid
        else:
            high = mid
    return math.sqrt(low * high)


def run_comparison(
    model: CSMBilinearModel, form: DeformationForm, n: int = SWEEP_POINTS
) -> Comparison:
    """B.5 for one section made thicker and thinner, plus the sections that mark its zones.

    The reference sections are the ones where the Annex B curve changes: the thickness at which
    the cap just starts to hold, where the strain limit has fallen to the yield strain (the
    branch change of B.6 / B.7), and the thinnest section the method accepts.
    """
    yours = _point(model, form, 1.0)
    family = yours.capacity.family
    limits = LIMITS[family]
    cap = yours.capacity.cap

    wanted: list[tuple[str, str, float | None]] = [
        ("limit", "Thinnest allowed", limits.upper),
        ("yield", "Strain limit down to yield", limits.switch),
        ("capped", "Cap just reached", _slenderness_where_cap_starts(family, cap, limits.switch)),
    ]
    references = [
        ReferenceSection("yours", "Your section", yours),
    ]
    factors = [1.0]
    for key, label, target in wanted:
        factor = None if target is None else _factor_for_slenderness(model, form, target)
        if factor is None:
            continue
        references.append(ReferenceSection(key, label, _point(model, form, factor)))
        factors.append(factor)
    references.sort(key=lambda ref: ref.point.slenderness)

    largest = _largest_factor(form.geometry)
    low = min(factors) * 0.7
    high = min(max(factors) * 1.3, largest)
    grid = [low * (high / low) ** (i / (n - 1)) for i in range(n)]
    grid = sorted({*grid, *factors})
    points = tuple(_point(model, form, factor) for factor in grid)
    return Comparison(
        family, limits.switch, limits.upper, points, tuple(references), yours.capacity
    )
