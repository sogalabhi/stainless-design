"""Request and response shapes of the HTTP API (the contract the web front end is typed from).

Forces are in N and stresses in N/mm², the engine's units; the front end converts to kN for
display only.
"""

from enum import StrEnum
from typing import Any, Self

from pydantic import BaseModel, Field, model_validator

from stainless_csm.core.enums import SectionType, StainlessFamily


class GoverningKey(StrEnum):
    """Which term of Formula B.14 governs the tensile strain limit (stable machine key)."""

    FIXED_LIMIT_15 = "fixed_limit_15"
    MATERIAL_DUCTILITY = "material_ductility"


class GraphView(StrEnum):
    SCHEMATIC = "schematic"
    TRUE_SCALE = "true_scale"


# --- requests --------------------------------------------------------------------------


class MaterialInput(BaseModel):
    """A Table 5.1 grade (give `designation`) or a custom material (leave it out)."""

    designation: str | None = Field(default=None, examples=["1.4307"])
    family: StainlessFamily | None = None
    fy: float | None = Field(default=None, description="Yield strength [N/mm2], custom only")
    fu: float | None = Field(default=None, description="Ultimate strength [N/mm2], custom only")
    elastic_modulus: float = Field(description="E [N/mm2], an input")
    enhanced: bool = Field(default=False, description="Custom values enhanced by cold-forming")

    @model_validator(mode="after")
    def custom_material_needs_all_values(self) -> Self:
        if self.designation is None and (self.family is None or self.fy is None or self.fu is None):
            raise ValueError("A custom material needs family, fy and fu (or give a designation).")
        return self


class MaterialModelRequest(BaseModel):
    material: MaterialInput
    graph_view: GraphView = GraphView.SCHEMATIC


class TensionInput(BaseModel):
    area: float = Field(description="Cross-section area A [mm2]")
    section_type: SectionType | None = Field(
        default=None, description="Only a label (B.2); no formula uses it"
    )
    has_holes: bool = False
    gamma_m0: float = Field(description="Partial factor gamma_M0, an input")


class TensionRequest(BaseModel):
    material: MaterialInput
    tension: TensionInput
    graph_view: GraphView = GraphView.SCHEMATIC


# --- responses -------------------------------------------------------------------------


class GradeOut(BaseModel):
    designation: str
    label: str
    family: StainlessFamily
    strength_class: str | None
    corrosion_class: str | None
    fy: float
    fu: float
    note: str | None


class CoefficientsOut(BaseModel):
    family: StainlessFamily
    c1: float
    c2: float
    c3: float
    selected: bool = False


class MaterialOut(BaseModel):
    family: StainlessFamily
    fy: float
    fu: float
    elastic_modulus: float
    source: str
    note: str | None


class ModelValuesOut(BaseModel):
    yield_strain: float
    ultimate_strain: float
    strain_hardening_modulus: float
    strain_limit_c1: float
    strain_end: float
    stress_at_strain_limit_c1: float
    hardening_ratio: float
    strain_limit_ratio_c1: float


class TraceStepOut(BaseModel):
    symbol: str
    description: str
    clause: str
    formula: str
    substituted: str
    value: float
    unit: str
    line: str = Field(description="The step as one readable line of working")
    latex: str = Field(description="The step as one LaTeX equation (render with KaTeX)")


class MaterialModelResponse(BaseModel):
    material: MaterialOut
    values: ModelValuesOut
    hint: str
    coefficients: list[CoefficientsOut]
    trace: list[TraceStepOut]
    figure: dict[str, Any] = Field(description="Plotly figure (data and layout)")


class TensionResponse(BaseModel):
    material: MaterialOut
    strain_ratio: float
    governing: GoverningKey
    governing_label: str
    strain: float
    design_stress: float
    resistance: float = Field(description="N_csm,t,Rd [N]")
    notes: list[str]
    trace: list[TraceStepOut]
    figure: dict[str, Any] = Field(description="Plotly figure (data and layout)")


class SymbolOut(BaseModel):
    symbol: str
    latex: str
    name: str
    meaning: str = Field(description="One line explaining the symbol")
    unit: str
    clause: str
    group: str
    topics: list[str]
    detail: str = Field(description="The long explanation, for the Help page")
    diagram: str | None = Field(default=None, description="Name of the sketch drawn beside it")


class ErrorResponse(BaseModel):
    detail: str
    error_type: str


# --- B.5: cross-section deformation capacity ---------------------------------------------


class GeometryKindKey(StrEnum):
    CHS = "chs"
    PLATES = "plates"
    SIGMA_CR = "sigma_cr"


class FamilyKey(StrEnum):
    FLAT_PLATES = "flat_plates"
    CIRCULAR_HOLLOW = "circular_hollow"


class ZoneKey(StrEnum):
    STOCKY = "stocky"
    SLENDER = "slender"
    NOT_ALLOWED = "not_allowed"


class CapSourceKey(StrEnum):
    OMEGA = "omega"
    MATERIAL_DUCTILITY = "material_ductility"


class SigmaCrSourceKey(StrEnum):
    PLATE_B9 = "plate_b9"
    CHS_B11 = "chs_b11"
    USER = "user"


class PlateInput(BaseModel):
    label: str = Field(min_length=1, max_length=40)
    width: float = Field(description="Flat width b [mm]")
    thickness: float = Field(description="Thickness t [mm]")
    k_sigma: float = Field(description="Buckling factor of the plate, an input")


class GeometryInput(BaseModel):
    """The section. Which fields are needed depends on `kind` (the API says what is missing)."""

    kind: GeometryKindKey
    d: float | None = Field(default=None, description="Outer diameter [mm] (CHS)")
    t: float | None = Field(default=None, description="Wall thickness [mm] (CHS)")
    plates: list[PlateInput] = Field(default_factory=list, max_length=20)
    sigma_cr_cs: float | None = Field(default=None, description="sigma_cr,cs [N/mm2]")
    family: FamilyKey | None = Field(default=None, description="With sigma_cr only")


class DeformationRequest(BaseModel):
    material: MaterialInput
    geometry: GeometryInput
    omega: float = Field(description="Parameter Omega, an input")
    poisson_ratio: float | None = Field(
        default=None, description="Poisson ratio nu, an input; not needed with sigma_cr"
    )


class PlateOut(BaseModel):
    label: str
    width: float
    thickness: float
    width_to_thickness: float
    k_sigma: float
    sigma_cr: float
    slenderness: float
    governing: bool


class SlendernessOut(BaseModel):
    source: SigmaCrSourceKey
    source_label: str
    sigma_cr_cs: float
    value: float
    governing_label: str
    plates: list[PlateOut]


class StrainLimitOut(BaseModel):
    zone: ZoneKey
    allowed: bool
    message: str | None
    cap: float
    cap_source: CapSourceKey
    cap_label: str
    raw_ratio: float | None
    capped: bool
    strain_ratio: float | None
    strain: float | None
    switch: float
    upper: float


class DeformationResponse(BaseModel):
    material: MaterialOut
    family: FamilyKey
    slenderness: SlendernessOut
    strain_limit: StrainLimitOut
    notes: list[str]
    trace: list[TraceStepOut]
    figure: dict[str, Any]
