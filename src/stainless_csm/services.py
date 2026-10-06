"""Use cases shared by every front end (desktop app and web API): build the inputs, run the
engine. No UI framework is imported here."""

from dataclasses import dataclass
from enum import Enum

from stainless_csm.core.enums import SectionType, StainlessFamily
from stainless_csm.core.errors import InvalidSectionError
from stainless_csm.core.trace import CalcTrace
from stainless_csm.csm.deformation_capacity import (
    CSMDeformationCapacity,
    DeformationResult,
    SectionFamily,
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


@dataclass(frozen=True)
class GeometryForm:
    """The section as the user describes it. Which fields are used depends on `kind`."""

    kind: GeometryKind
    d: float | None = None
    t: float | None = None
    plates: tuple[PlateForm, ...] = ()
    sigma_cr_cs: float | None = None
    family: SectionFamily | None = None  # needed only when entering sigma_cr,cs


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


def _require(kind: GeometryKind, **values: float | None) -> dict[str, float]:
    missing = [name for name, value in values.items() if value is None]
    if missing:
        raise InvalidSectionError(f"{kind.value}: please give {', '.join(missing)}.")
    return {name: float(value) for name, value in values.items() if value is not None}


def build_slenderness(
    material: Material, geometry: GeometryForm, poisson: float | None
) -> tuple[SectionFamily, SlendernessResult]:
    """B.5.2: from the section description to sigma_cr,cs and the relative slenderness."""
    kind = geometry.kind
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
    family, slenderness = build_slenderness(model.material, form.geometry, form.poisson_ratio)
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
    trace = CalcTrace(slenderness.trace.steps)
    for step in capacity.trace:
        trace.add(step)
    return DeformationOutcome(family, slenderness, capacity, tuple(notes), trace)
