"""B.6.3.1(1) and B.6.3.2: CSM bending resistance about an axis of symmetry, Table B.2.

Units: N, mm, N/mm². The moment is in N mm; convert to kN m only at the UI edge.

The strain limit ε_csm / ε_y comes from B.5.1 (a :class:`DeformationResult`) run for the section
*in bending*: the plates carry a bending stress pattern, so their k_σ (or σ_cr,cs) are not the ones
of compression. Below 1.0 the section buckles before it yields and Formula B.19 is linear in the
ratio; from 1.0 Formula B.20 credits strain hardening and the plastic reserve, with the bending
parameter α of Table B.2.

W_el, W_pl and λ_LT are not defined by Annex B and are inputs. Only the bending cases that B.6.3.2
covers (an axis of symmetry) and λ_LT <= 0.2 are calculated. The others raise
:class:`NotBuiltYetError` (B.6.3.3 and B.18, phase 3) or :class:`NotApplicableError` (λ_LT above
0.4, where B.6.3.1 does not apply).
"""

import math
from dataclasses import dataclass
from enum import Enum

from stainless_csm.core import units
from stainless_csm.core.enums import SectionType
from stainless_csm.core.errors import (
    InvalidMaterialError,
    InvalidSectionError,
    NotApplicableError,
    NotBuiltYetError,
)
from stainless_csm.core.latex import tex
from stainless_csm.core.trace import CalcStep, CalcTrace
from stainless_csm.csm.deformation_capacity import DeformationResult
from stainless_csm.data.repository import BendingParameterRow, bending_parameter_rows
from stainless_csm.material_models.csm_bilinear import CSMBilinearModel

_CLAUSE = "B.6.3.2"
_GATE_CLAUSE = "B.6.3.1"
CLAUSES = (_GATE_CLAUSE, _CLAUSE)

# The strain ratio at which B.19 ends and B.20 starts.
BRANCH_STRAIN_RATIO = 1.0
# B.6.3.1(1): B.19 or B.20 apply for λ_LT <= 0.2; (2): B.18 interpolates up to 0.4.
LAMBDA_LT_DIRECT = 0.2
LAMBDA_LT_LIMIT = 0.4

NOT_APPLICABLE_LAMBDA_LT = "B.6.3.1 does not apply; use 8.2.4"

MEMBER_NOTE = (
    "This is the cross-section resistance of B.6.3.2. Lateral-torsional buckling (8.3) is outside "
    "Annex B and is not checked: λ_LT is the value you give."
)


class BendingAxis(Enum):
    """The axis the section bends about (Table B.2): y-y is the major axis, z-z the minor axis."""

    MAJOR = "major"
    MINOR = "minor"


class BendingFormula(Enum):
    """Which formula of B.6.3.2 gave the resistance."""

    B19 = "B.19"
    B20 = "B.20"


# The cases B.6.3.2 covers: bending about an axis of symmetry. The T-section is symmetric about its
# stem (the minor axis); a channel about the axis through its two flanges (the major axis).
_SYMMETRY_AXES: dict[SectionType, frozenset[BendingAxis]] = {
    SectionType.I_SECTION: frozenset(BendingAxis),
    SectionType.RHS: frozenset(BendingAxis),
    SectionType.CHS: frozenset(BendingAxis),
    SectionType.CHANNEL: frozenset({BendingAxis.MAJOR}),
    SectionType.T_SECTION: frozenset({BendingAxis.MINOR}),
    SectionType.ANGLE: frozenset(),
}


def about_axis_of_symmetry(section_type: SectionType, axis: BendingAxis | None) -> bool:
    """True where B.6.3.2 applies: bending about an axis of symmetry of the section."""
    if section_type is SectionType.CHS:
        return True
    return axis in _SYMMETRY_AXES[section_type]


def require_axis(section_type: SectionType, axis: BendingAxis | None) -> None:
    """A circular hollow section bends alike about every axis; any other shape needs the choice."""
    if axis is None and section_type is not SectionType.CHS:
        raise InvalidSectionError(
            "Please give the axis of bending (major y-y or minor z-z): Table B.2 and the "
            "section moduli depend on it."
        )


def check_scope(section_type: SectionType, axis: BendingAxis | None, lambda_lt: float) -> None:
    """The gate of B.6.3.1 and the scope of B.6.3.2, before any calculation.

    - λ_LT above 0.4: refused, B.6.3.1 does not apply (use 8.2.4).
    - not about an axis of symmetry (B.6.3.3), or 0.2 < λ_LT <= 0.4 (B.18): not built yet.
    """
    if not math.isfinite(lambda_lt) or lambda_lt < 0:
        raise InvalidSectionError(f"λ_LT must be zero or more, got {lambda_lt!r}.")
    if lambda_lt > LAMBDA_LT_LIMIT:
        raise NotApplicableError(
            f"{NOT_APPLICABLE_LAMBDA_LT}: λ_LT = {lambda_lt:g} is above {LAMBDA_LT_LIMIT:g}, "
            "so the CSM bending resistance of B.6.3 is not used."
        )
    require_axis(section_type, axis)
    if not about_axis_of_symmetry(section_type, axis):
        where = (
            f"{section_type.value}, {axis.value} axis" if axis is not None else section_type.value
        )
        raise NotBuiltYetError(
            f"B.6.3.3: arrives in phase 3. The {where} is not an axis of symmetry, so the maximum "
            "design strain ε_csm,max and the fibre that yields first are needed."
        )
    if lambda_lt > LAMBDA_LT_DIRECT:
        raise NotBuiltYetError(
            f"B.18 interpolation: arrives in phase 3. λ_LT = {lambda_lt:g} lies between "
            f"{LAMBDA_LT_DIRECT:g} and {LAMBDA_LT_LIMIT:g}, so B.6.3.1(2) interpolates with the "
            "8.2.4 resistance M_c,Rd."
        )


def table_b2_rows() -> tuple[BendingParameterRow, ...]:
    """Table B.2 as printed."""
    return bending_parameter_rows()


def _row_matches(
    row: BendingParameterRow,
    section_type: SectionType,
    axis: BendingAxis | None,
    h_over_b: float | None,
    legs_equal: bool | None,
) -> bool:
    if row.section_type != section_type.value:
        return False
    if row.axis != "any" and (axis is None or row.axis != axis.value):
        return False
    if row.legs is not None:
        if legs_equal is None:
            raise InvalidSectionError(
                "Table B.2 distinguishes equal and unequal angles: give both leg lengths."
            )
        if (row.legs == "equal") is not legs_equal:
            return False
    if row.ratio_min is not None or row.ratio_max is not None:
        if h_over_b is None:
            raise InvalidSectionError(
                "Table B.2 depends on the aspect ratio h/b for this section and axis: "
                "give the dimensions h and b."
            )
        if row.ratio_min is not None and h_over_b < row.ratio_min:
            return False
        if row.ratio_max is not None and h_over_b >= row.ratio_max:
            return False
    return True


def table_b2_row(
    section_type: SectionType,
    axis: BendingAxis | None,
    h_over_b: float | None = None,
    legs_equal: bool | None = None,
) -> BendingParameterRow:
    """The row of Table B.2 for a section type, axis and (where the table asks) h/b."""
    found = [
        row
        for row in table_b2_rows()
        if _row_matches(row, section_type, axis, h_over_b, legs_equal)
    ]
    if not found and axis is None:
        require_axis(section_type, axis)  # the rows of this shape depend on the axis
    if len(found) != 1:  # a table with overlapping or missing rows is a data error
        raise InvalidSectionError(
            f"Table B.2 has {len(found)} rows for {section_type.value}, {axis}, h/b {h_over_b}."
        )
    return found[0]


def moment_b19(strain_ratio: float, w_el: float, fy: float, gamma_m0: float) -> float:
    """Formula (B.19): M_csm,c,Rd = (ε_csm/ε_y) W_el f_y / γM0, in N mm."""
    return strain_ratio * w_el * fy / gamma_m0


def moment_b20(
    strain_ratio: float,
    w_el: float,
    w_pl: float,
    fy: float,
    e_sh_over_e: float,
    alpha: float,
    gamma_m0: float,
) -> float:
    """Formula (B.20), in N mm:

    M = (W_pl f_y / γM0) [1 + (E_sh/E)(W_el/W_pl)(r − 1) − (1 − W_el/W_pl) r^−α],  r = ε_csm/ε_y

    `e_sh_over_e` is E_sh / E; passing 0 gives the pure shape of the formula, whose limit for a
    large strain ratio is W_pl f_y / γM0.
    """
    shape = w_el / w_pl
    bracket = (
        1 + e_sh_over_e * shape * (strain_ratio - 1) - (1 - shape) / math.pow(strain_ratio, alpha)
    )
    return w_pl * fy / gamma_m0 * bracket


def formula_for(strain_ratio: float) -> BendingFormula:
    """B.19 for ε_csm/ε_y < 1.0, B.20 for ε_csm/ε_y >= 1.0."""
    return BendingFormula.B19 if strain_ratio < BRANCH_STRAIN_RATIO else BendingFormula.B20


def moment_at(
    model: CSMBilinearModel,
    strain_ratio: float,
    w_el: float,
    w_pl: float,
    alpha: float,
    gamma_m0: float,
) -> float:
    """M_csm,c,Rd at a strain ratio from B.19 or B.20 (the chart's curve and the result), N mm."""
    fy = model.material.fy
    if formula_for(strain_ratio) is BendingFormula.B19:
        return moment_b19(strain_ratio, w_el, fy, gamma_m0)
    return moment_b20(
        strain_ratio,
        w_el,
        w_pl,
        fy,
        model.strain_hardening_modulus / model.material.elastic_modulus,
        alpha,
        gamma_m0,
    )


@dataclass(frozen=True, slots=True)
class BendingInput:
    model: CSMBilinearModel
    deformation: DeformationResult  # B.5.1, for the same section in bending
    section_type: SectionType
    axis: BendingAxis | None  # None only for a circular hollow section
    w_el: float  # mm³, about the axis of bending: an input
    w_pl: float  # mm³
    gamma_m0: float
    lambda_lt: float  # λ_LT, an input (member design, outside Annex B)
    h_over_b: float | None = None  # the aspect ratio, where Table B.2 asks for it
    legs_equal: bool | None = None  # angles only

    def __post_init__(self) -> None:
        for name, value in (("W_el", self.w_el), ("W_pl", self.w_pl), ("γM0", self.gamma_m0)):
            if not math.isfinite(value) or value <= 0:
                raise InvalidMaterialError(f"{name} must be a positive number, got {value!r}.")
        if self.w_pl < self.w_el:
            raise InvalidSectionError(
                f"W_pl ({self.w_pl:g} mm³) is less than W_el ({self.w_el:g} mm³): the plastic "
                "modulus is never smaller than the elastic one. Check the two values."
            )


@dataclass(frozen=True, slots=True)
class BendingResult:
    strain_ratio: float  # ε_csm / ε_y, from B.5.1
    formula: BendingFormula
    alpha: float
    alpha_row: BendingParameterRow  # the row of Table B.2 that gave α
    elastic_moment: float  # W_el f_y / γM0, N mm (what B.19 gives at ε_csm/ε_y = 1)
    plastic_moment: float  # W_pl f_y / γM0, N mm (the factor in front of B.20)
    resistance: float  # M_csm,c,Rd, N mm
    notes: tuple[str, ...]
    trace: CalcTrace


def _aspect_text(row: BendingParameterRow) -> str:
    return "" if row.aspect_ratio in ("Any", "-") else f", {row.aspect_ratio}"


class CSMBending:
    """B.19, B.20 and Table B.2, built on a :class:`CSMBilinearModel` and a B.5.1 result."""

    def __init__(self, data: BendingInput) -> None:
        self._data = data

    def calculate(self) -> BendingResult:
        data, model = self._data, self._data.model
        check_scope(data.section_type, data.axis, data.lambda_lt)
        data.deformation.require_allowed()  # NotApplicableError beyond the B.5 slenderness limit
        ratio = data.deformation.strain_ratio
        assert ratio is not None  # guaranteed by require_allowed

        fy, e = model.material.fy, model.material.elastic_modulus
        e_sh = model.strain_hardening_modulus
        dimless = units.DIMENSIONLESS
        moment_unit = r"\,\mathrm{N\,mm}"

        trace = CalcTrace(model.trace.steps)
        for earlier in data.deformation.trace:
            trace.add(earlier)

        def step(
            symbol: str,
            description: str,
            formula_text: str,
            substituted: str,
            value: float,
            unit: str,
            latex: str,
            clause: str = _CLAUSE,
        ) -> None:
            trace.add(
                CalcStep(
                    symbol, description, clause, formula_text, substituted, value, unit, latex
                )
            )

        step(
            "λ_LT",
            "relative slenderness for lateral-torsional buckling (your input): B.19 and B.20 "
            "apply for λ_LT ≤ 0.2",
            "λ_LT ≤ 0.2: B.19 or B.20",
            f"{data.lambda_lt:g} ≤ {LAMBDA_LT_DIRECT:g}",
            data.lambda_lt,
            dimless,
            tex(
                r"\bar{\lambda}_{LT} = <l> \le 0.2 \;\Rightarrow\; "
                r"\text{Formulas B.19 or B.20}",
                l=data.lambda_lt,
            ),
            clause=_GATE_CLAUSE,
        )

        row = table_b2_row(data.section_type, data.axis, data.h_over_b, data.legs_equal)
        axis_text = "any axis" if row.axis == "any" else f"{row.axis} axis"
        step(
            "α",
            f"CSM bending parameter, Table B.2: {row.section.lower()}, {axis_text}"
            + _aspect_text(row)
            + (" (used by Formula B.20 only)" if formula_for(ratio) is BendingFormula.B19 else ""),
            "Table B.2",
            f"{row.section}, {axis_text}{_aspect_text(row)}: α = {row.alpha:g}",
            row.alpha,
            dimless,
            tex(r"\alpha = <a> \quad \text{(Table B.2)}", a=row.alpha),
        )

        elastic_moment = data.w_el * fy / data.gamma_m0
        plastic_moment = data.w_pl * fy / data.gamma_m0
        step(
            "M_el",
            "elastic moment W_el f_y / γM0: what Formula B.19 gives at ε_csm/ε_y = 1.0 "
            "(reference line on the chart)",
            "W_el f_y / γ_M0",
            f"{data.w_el:g} × {fy:g} / {data.gamma_m0:g}",
            elastic_moment,
            units.MOMENT,
            tex(
                r"M_{el} = \frac{W_{el}\,f_y}{\gamma_{M0}} = \frac{<w> \times <fy>}{<g>} = <v>"
                + moment_unit,
                w=data.w_el,
                fy=fy,
                g=data.gamma_m0,
                v=elastic_moment,
            ),
        )
        step(
            "M_pl",
            "plastic moment W_pl f_y / γM0: the factor in front of the bracket of Formula B.20 "
            "(reference line on the chart)",
            "W_pl f_y / γ_M0",
            f"{data.w_pl:g} × {fy:g} / {data.gamma_m0:g}",
            plastic_moment,
            units.MOMENT,
            tex(
                r"M_{pl} = \frac{W_{pl}\,f_y}{\gamma_{M0}} = \frac{<w> \times <fy>}{<g>} = <v>"
                + moment_unit,
                w=data.w_pl,
                fy=fy,
                g=data.gamma_m0,
                v=plastic_moment,
            ),
        )

        formula = formula_for(ratio)
        b19 = formula is BendingFormula.B19
        step(
            "ε_csm/ε_y vs 1",
            "which formula applies: B.19 below 1.0, B.20 from 1.0",
            "ε_csm/ε_y < 1.0: B.19;  ε_csm/ε_y ≥ 1.0: B.20",
            f"{ratio:.6g} {'<' if b19 else '≥'} 1.0, so {formula.value}",
            ratio,
            dimless,
            tex(
                r"\frac{\varepsilon_{csm}}{\varepsilon_y} = <r> "
                + (r"\lt" if b19 else r"\ge")
                + r" 1.0 \;\Rightarrow\; \text{Formula <f>}",
                r=ratio,
                f=formula.value,
            ),
        )

        resistance = moment_at(model, ratio, data.w_el, data.w_pl, row.alpha, data.gamma_m0)
        if b19:
            step(
                "M_csm,c,Rd",
                "CSM design bending moment resistance (Formula B.19)",
                "(ε_csm / ε_y) W_el f_y / γ_M0",
                f"{ratio:.6g} × {data.w_el:g} × {fy:g} / {data.gamma_m0:g}",
                resistance,
                units.MOMENT,
                tex(
                    r"M_{csm,c,Rd} = \frac{\varepsilon_{csm}}{\varepsilon_y}"
                    r"\frac{W_{el}\,f_y}{\gamma_{M0}} = <r> \times "
                    r"\frac{<w> \times <fy>}{<g>} = <v>" + moment_unit,
                    r=ratio,
                    w=data.w_el,
                    fy=fy,
                    g=data.gamma_m0,
                    v=resistance,
                ),
            )
        else:
            e_sh_over_e = e_sh / e
            shape = data.w_el / data.w_pl
            step(
                "M_csm,c,Rd",
                "CSM design bending moment resistance (Formula B.20)",
                "(W_pl f_y / γ_M0) [1 + (E_sh/E)(W_el/W_pl)(ε_csm/ε_y − 1) "
                "− (1 − W_el/W_pl)(ε_csm/ε_y)^−α]",
                f"({data.w_pl:g} × {fy:g} / {data.gamma_m0:g}) "
                f"[1 + {e_sh_over_e:.6g} × {shape:.6g} × ({ratio:.6g} − 1) "
                f"− (1 − {shape:.6g}) / {ratio:.6g}^{row.alpha:g}]",
                resistance,
                units.MOMENT,
                tex(
                    r"M_{csm,c,Rd} = \frac{W_{pl}\,f_y}{\gamma_{M0}}\left[1 + "
                    r"\frac{E_{sh}}{E}\frac{W_{el}}{W_{pl}}"
                    r"\left(\frac{\varepsilon_{csm}}{\varepsilon_y} - 1\right) - "
                    r"\left(1 - \frac{W_{el}}{W_{pl}}\right)"
                    r"\left(\frac{\varepsilon_{csm}}{\varepsilon_y}\right)^{-\alpha}\right]"
                    r" = <pl> \left[1 + <sh> \times <wr> \times (<r> - 1) - "
                    r"(1 - <wr>) \times <r>^{-<a>}\right] = <v>" + moment_unit,
                    pl=plastic_moment,
                    sh=e_sh_over_e,
                    wr=shape,
                    r=ratio,
                    a=row.alpha,
                    v=resistance,
                ),
            )

        notes = [MEMBER_NOTE]
        if b19:
            notes.insert(
                0,
                "ε_csm/ε_y is below 1.0, so Formula B.19 applies: the section buckles before it "
                "yields, W_pl and α are not used, and the resistance stays below W_el f_y / γM0.",
            )
        return BendingResult(
            strain_ratio=ratio,
            formula=formula,
            alpha=row.alpha,
            alpha_row=row,
            elastic_moment=elastic_moment,
            plastic_moment=plastic_moment,
            resistance=resistance,
            notes=tuple(notes),
            trace=trace,
        )
