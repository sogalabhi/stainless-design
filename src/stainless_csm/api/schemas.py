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


class InputHelpOut(BaseModel):
    key: str = Field(description="The dock field key (plate fields: one entry each)")
    name: str
    what: str = Field(description="What the input is")
    why: str = Field(description="The clauses and formulas that use it")
    where: str = Field(description="Where to get it; never a number of its own")
    source: str = Field(description="'In EN 1993-1-4 (clause)' or 'Outside EN 1993-1-4: ...'")
    in_standard: bool = Field(description="True when the value comes from EN 1993-1-4")


class ErrorResponse(BaseModel):
    detail: str
    error_type: str


# --- B.5: cross-section deformation capacity ---------------------------------------------


class GeometryKindKey(StrEnum):
    CHS = "chs"
    PLATES = "plates"
    SIGMA_CR = "sigma_cr"
    TEMPLATE = "template"


class FabricationKey(StrEnum):
    ROLLED = "rolled"
    WELDED = "welded"


class PlateRoleKey(StrEnum):
    WEB = "web"
    FLANGE = "flange"
    STEM = "stem"
    LEG = "leg"


class PlateTypeKey(StrEnum):
    INTERNAL = "internal"
    OUTSTAND = "outstand"


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


class KSigmaInput(BaseModel):
    """k_sigma of each kind of plate (EN 1993-1-5, outside Annex B): an input, one per role."""

    web: float | None = None
    flange: float | None = None
    stem: float | None = None
    leg: float | None = None


class GeometryInput(BaseModel):
    """The section. Which fields are needed depends on `kind` (the API says what is missing).

    With kind "template" give `shape` and its dimensions in mm; the engine derives the flat width c
    of each plate as 8.2.2(5) and Tables 7.2 to 7.4 draw it. k_sigma of each plate is an input.
    """

    kind: GeometryKindKey
    d: float | None = Field(default=None, description="Outer diameter [mm] (CHS)")
    t: float | None = Field(default=None, description="Wall thickness [mm] (CHS)")
    plates: list[PlateInput] = Field(default_factory=list, max_length=20)
    sigma_cr_cs: float | None = Field(default=None, description="sigma_cr,cs [N/mm2]")
    family: FamilyKey | None = Field(default=None, description="With sigma_cr only")
    shape: SectionType | None = Field(default=None, description="Section template: the shape")
    fabrication: FabricationKey | None = Field(
        default=None, description="Template I-section, channel, T-section: rolled (r) or welded (s)"
    )
    h: float | None = Field(default=None, description="Template: overall height h [mm]")
    b: float | None = Field(default=None, description="Template: overall width b [mm]")
    t_w: float | None = Field(default=None, description="Template: web or stem thickness [mm]")
    t_f: float | None = Field(default=None, description="Template: flange thickness [mm]")
    r: float | None = Field(
        default=None,
        description="Template: root radius r of a rolled section, or of an angle "
        "(properties and drawing only; 0 is sharp)",
    )
    s: float | None = Field(default=None, description="Template: weld leg s of a welded section")
    c_stem: float | None = Field(
        default=None, description="Template T-section: flat width of the stem, typed [mm]"
    )
    r_o: float | None = Field(
        default=None,
        description="Template RHS: outer corner radius r_o [mm]; properties and drawing only, "
        "not c (0 is sharp)",
    )
    k_sigma: KSigmaInput | None = Field(
        default=None, description="Template: k_sigma of each plate role"
    )


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
    role: PlateRoleKey | None = Field(
        default=None, description="Section template only: which part of the section this is"
    )
    plate_type: PlateTypeKey | None = Field(
        default=None, description="Section template only: internal or outstand"
    )
    c_source: str | None = Field(
        default=None, description="Section template only: where the flat width c comes from"
    )


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


# --- Comparison: the same section made thicker or thinner ---------------------------------


class ComparisonRequest(BaseModel):
    """Same inputs as B.5. The section must be plates or a circular hollow section."""

    material: MaterialInput
    geometry: GeometryInput
    omega: float = Field(description="Parameter Omega, an input")
    poisson_ratio: float | None = Field(default=None, description="Poisson ratio nu, an input")


class ComparisonPointOut(BaseModel):
    factor: float = Field(description="Every thickness is multiplied by this")
    slenderness: float
    zone: ZoneKey
    strain_ratio: float | None
    strain: float | None
    stress: float | None = Field(description="Stress read from the B.4 curve at the strain [N/mm2]")
    governing_label: str = Field(description="The plate that sets the slenderness at this point")


class ReferenceSectionOut(BaseModel):
    key: str
    label: str
    point: ComparisonPointOut


class ComparisonResponse(BaseModel):
    material: MaterialOut
    family: FamilyKey
    values: ModelValuesOut
    switch: float
    upper: float
    cap: float
    points: list[ComparisonPointOut]
    references: list[ReferenceSectionOut]
    base_curve_figure: dict[str, Any]
    stress_figure: dict[str, Any]
    notes: list[str]


# --- B.6.2: compression ------------------------------------------------------------------


class CompressionFormulaKey(StrEnum):
    """Which formula of B.6.2 gave the resistance (stable machine key)."""

    B15 = "b15"
    B16 = "b16"


class CompressionRequest(BaseModel):
    """The B.5 inputs of the section, plus the area and gamma_M0 (inputs, never assumed)."""

    material: MaterialInput
    geometry: GeometryInput
    omega: float = Field(description="Parameter Omega, an input")
    poisson_ratio: float | None = Field(
        default=None, description="Poisson ratio nu, an input; not needed with sigma_cr"
    )
    area: float = Field(description="Cross-section area A [mm2]")
    gamma_m0: float = Field(description="Partial factor gamma_M0, an input")
    graph_view: GraphView = GraphView.SCHEMATIC


class CompressionResponse(BaseModel):
    material: MaterialOut
    family: FamilyKey
    slenderness: SlendernessOut
    strain_limit: StrainLimitOut
    strain_ratio: float = Field(description="eps_csm / eps_y, from B.5.1")
    formula: CompressionFormulaKey
    formula_label: str = Field(description="B.15 or B.16")
    design_stress: float | None = Field(
        description="f_csm [N/mm2] (Formula B.17); null when B.15 applies, where B.17 is not used"
    )
    resistance: float = Field(description="N_csm,Rd [N]")
    notes: list[str]
    trace: list[TraceStepOut]
    capacity_figure: dict[str, Any] = Field(
        description="Plotly figure: N_csm,Rd / (A f_y / gamma_M0) against slenderness"
    )
    point_figure: dict[str, Any] = Field(
        description="Plotly figure: the compression point on the B.4 curve"
    )


# --- B.6.3: bending about an axis of symmetry -------------------------------------------


class BendingAxisKey(StrEnum):
    """The axis of bending (Table B.2): y-y is the major axis, z-z the minor axis."""

    MAJOR = "major"
    MINOR = "minor"


class BendingFormulaKey(StrEnum):
    """Which formula of B.6.3.2 gave the resistance (stable machine key)."""

    B19 = "b19"
    B20 = "b20"


class BendingRequest(BaseModel):
    """The section in bending (B.6.3.1(1), B.6.3.2): every value outside Annex B is an input.

    In `geometry`, `k_sigma`, `plates[].k_sigma` and `sigma_cr_cs` are the values for the
    *bending* stress pattern about the chosen axis, not those of compression (EN 1993-1-5, 6.4.1).
    """

    material: MaterialInput
    section_type: SectionType
    axis: BendingAxisKey | None = Field(
        default=None,
        description="Axis of bending; may be left out for a circular hollow section only",
    )
    geometry: GeometryInput
    omega: float = Field(description="Parameter Omega, an input")
    poisson_ratio: float | None = Field(
        default=None, description="Poisson ratio nu, an input; not needed with sigma_cr"
    )
    w_el: float = Field(description="Elastic section modulus W_el about the axis [mm3], an input")
    w_pl: float = Field(description="Plastic section modulus W_pl about the axis [mm3], an input")
    gamma_m0: float = Field(description="Partial factor gamma_M0, an input")
    lambda_lt: float = Field(description="Relative slenderness for lateral-torsional buckling")


class BendingParameterRowOut(BaseModel):
    """One printed row of Table B.2."""

    section: str
    section_type: SectionType
    axis: str = Field(description="major, minor or any")
    aspect_ratio: str = Field(description="As printed: Any, h/b < 2, -")
    alpha: float
    selected: bool = Field(description="The row that gave alpha for this section and axis")


class BendingResponse(BaseModel):
    material: MaterialOut
    family: FamilyKey
    slenderness: SlendernessOut
    strain_limit: StrainLimitOut
    strain_ratio: float = Field(description="eps_csm / eps_y, from B.5.1, section in bending")
    formula: BendingFormulaKey
    formula_label: str = Field(description="B.19 or B.20")
    alpha: float = Field(description="CSM bending parameter, Table B.2")
    table_b2: list[BendingParameterRowOut] = Field(description="Table B.2, the used row marked")
    elastic_moment: float = Field(description="W_el f_y / gamma_M0 [N mm], a reference line")
    plastic_moment: float = Field(description="W_pl f_y / gamma_M0 [N mm], a reference line")
    resistance: float = Field(description="M_csm,c,Rd [N mm]")
    notes: list[str]
    trace: list[TraceStepOut]
    moment_figure: dict[str, Any] = Field(
        description="Plotly figure: M_csm,c,Rd against eps_csm / eps_y"
    )
    blocks_figure: dict[str, Any] = Field(
        description="Plotly figure: strain and stress across the depth at eps_csm"
    )


# --- Section properties: reference values from the template dimensions ------------------------


class SectionPropertiesRequest(BaseModel):
    """The typed template dimensions in mm. Which ones are needed depends on `shape`."""

    shape: SectionType
    fabrication: FabricationKey | None = Field(
        default=None, description="I-section, channel and T-section: rolled (r) or welded (s)"
    )
    h: float | None = Field(default=None, description="Overall height h [mm] (longer leg: angle)")
    b: float | None = Field(default=None, description="Overall width b [mm] (shorter leg: angle)")
    t_w: float | None = Field(default=None, description="Web or stem thickness [mm]")
    t_f: float | None = Field(default=None, description="Flange thickness [mm]")
    t: float | None = Field(default=None, description="Wall or leg thickness [mm]")
    d: float | None = Field(default=None, description="Outer diameter [mm] (CHS)")
    r: float | None = Field(
        default=None, description="Root radius r [mm]: rolled I, channel, T-section, or an angle"
    )
    s: float | None = Field(default=None, description="Weld leg s [mm]: welded sections")
    r_o: float | None = Field(
        default=None, description="Outer corner radius r_o [mm] of a rectangular hollow section"
    )


class PointOut(BaseModel):
    y: float = Field(description="mm, from the origin to the right")
    z: float = Field(description="mm, from the origin upwards")


class FibreDistancesOut(BaseModel):
    top: float
    bottom: float
    left: float
    right: float


class ElasticModulusOut(BaseModel):
    value: float = Field(description="The smaller of the two [mm3]")
    smaller_side: str = Field(
        description="Which fibre gives the smaller modulus; 'equal' when the two sides are equal"
    )
    sides: dict[str, float] = Field(description="The modulus at each extreme fibre [mm3]")


class PrincipalAxesOut(BaseModel):
    angle_deg: float = Field(
        description="Angle of the major axis u from the y axis, counter-clockwise, z up [degrees]"
    )
    i_u: float
    i_v: float


class ShearCentreOut(BaseModel):
    point: PointOut
    label: str = Field(description="Always 'thin-walled approximation'")
    note: str


class PropertyRowOut(BaseModel):
    """One line of the properties table. `value` has six significant figures (what Use copies)."""

    key: str = Field(description="A stable machine key, for example A, I_y, W_pl_y")
    symbol: str
    name: str
    value: float
    unit: str
    group: str
    note: str | None = None


class SectionPropertiesResponse(BaseModel):
    shape: SectionType
    label: str = Field(description="Where these numbers come from: geometry, not the standard")
    method: str
    origin: str = Field(description="Where the coordinates start")
    width: float = Field(description="Bounding box along y [mm]")
    height: float = Field(description="Bounding box along z [mm]")
    area: float = Field(description="A [mm2]")
    centroid: PointOut
    fibres: FibreDistancesOut = Field(description="Centroid to the extreme fibres [mm]")
    i_y: float = Field(description="[mm4], about the centroidal axis parallel to y")
    i_z: float
    i_yz: float
    w_el_y: ElasticModulusOut
    w_el_z: ElasticModulusOut
    plastic_axis_y: float = Field(
        description="z of the equal-area line parallel to y, for bending about y-y [mm]"
    )
    plastic_axis_z: float = Field(
        description="y of the equal-area line parallel to z, for bending about z-z [mm]"
    )
    w_pl_y: float = Field(description="[mm3]")
    w_pl_z: float
    shear_centre: ShearCentreOut
    principal: PrincipalAxesOut | None = Field(default=None, description="Angles only")
    rows: list[PropertyRowOut]
    notes: list[str]
