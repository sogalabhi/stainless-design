"""B.6.1: CSM tension resistance of sections without holes.

Units: N, mm, N/mm². Convert to kN only at the UI edge.
"""

import math
from dataclasses import dataclass
from enum import Enum

from stainless_csm.config.national_annex import TENSION_STRAIN_RATIO_CAP
from stainless_csm.core import units
from stainless_csm.core.enums import SectionType
from stainless_csm.core.errors import InvalidMaterialError, NotApplicableError
from stainless_csm.core.latex import tex
from stainless_csm.core.trace import CalcStep, CalcTrace
from stainless_csm.material_models.csm_bilinear import CSMBilinearModel

_CLAUSE = "B.6.1"

SLENDERNESS_NOT_CHECKED_NOTE = (
    "B.2 requires the B.5 cross-section slenderness limits; they were not checked "
    "because only the area was given."
)


class GoverningStrainLimit(Enum):
    """Which term of Formula (B.14) governs."""

    FIXED_LIMIT_15 = "15"
    MATERIAL_DUCTILITY = "C₁ε_u / ε_y"


@dataclass(frozen=True, slots=True)
class TensionInput:
    model: CSMBilinearModel
    area: float  # mm²
    section_type: SectionType | None  # only a label (B.2); no formula uses it
    gamma_m0: float
    has_holes: bool = False

    def __post_init__(self) -> None:
        if not math.isfinite(self.area) or self.area <= 0:
            raise InvalidMaterialError(f"Area must be a positive number, got {self.area!r}.")
        if not math.isfinite(self.gamma_m0) or self.gamma_m0 <= 0:
            raise InvalidMaterialError(f"γM0 must be a positive number, got {self.gamma_m0!r}.")


@dataclass(frozen=True, slots=True)
class TensionResult:
    strain_ratio: float  # ε_csm,t / ε_y
    governing: GoverningStrainLimit
    strain: float  # ε_csm,t
    design_stress: float  # f_csm,t, N/mm²
    resistance: float  # N_csm,t,Rd, N
    notes: tuple[str, ...]
    trace: CalcTrace


class CSMTension:
    """B.14 → B.13 → B.12, built on a :class:`CSMBilinearModel` (the B.4 maths lives there)."""

    def __init__(self, data: TensionInput) -> None:
        self._data = data

    def strain_ratio(self) -> tuple[float, GoverningStrainLimit]:
        """Formula (B.14): ε_csm,t / ε_y = min{15 ; C₁ε_u / ε_y}."""
        ductility = self._data.model.strain_limit_ratio_c1
        if ductility < TENSION_STRAIN_RATIO_CAP:
            return ductility, GoverningStrainLimit.MATERIAL_DUCTILITY
        return TENSION_STRAIN_RATIO_CAP, GoverningStrainLimit.FIXED_LIMIT_15

    def design_stress(self, strain_ratio: float) -> float:
        """Formula (B.13): f_csm,t = f_y + E_sh ε_y (ε_csm,t/ε_y − 1), in N/mm²."""
        model = self._data.model
        return model.material.fy + model.strain_hardening_modulus * model.yield_strain * (
            strain_ratio - 1
        )

    def resistance(self, design_stress: float) -> float:
        """Formula (B.12): N_csm,t,Rd = A f_csm,t / γM0, in N."""
        return self._data.area * design_stress / self._data.gamma_m0

    def calculate(self) -> TensionResult:
        data, model = self._data, self._data.model
        if data.has_holes:
            raise NotApplicableError(
                "CSM tension (B.6.1(1)) covers sections without holes. For net sections use "
                "EN 1993-1-3:2024, 8.1.2 or EN 1993-1-1:2022, 8.2.3 (B.6.1(2))."
            )

        fy = model.material.fy
        ratio, governing = self.strain_ratio()
        strain = ratio * model.yield_strain
        f_csm_t = self.design_stress(ratio)
        n_rd = self.resistance(f_csm_t)

        notes = [SLENDERNESS_NOT_CHECKED_NOTE]
        if ratio < 1:
            notes.append(
                f"C₁ε_u/ε_y = {ratio:.3g} is below 1, so f_csm,t is below f_y; "
                "check the material inputs."
            )

        trace = CalcTrace(model.trace.steps)
        eps_y, e_sh = model.yield_strain, model.strain_hardening_modulus
        dimless = units.DIMENSIONLESS

        def step(
            symbol: str,
            description: str,
            formula: str,
            substituted: str,
            value: float,
            unit: str,
            latex: str,
        ) -> None:
            trace.add(
                CalcStep(symbol, description, _CLAUSE, formula, substituted, value, unit, latex)
            )

        stress = r"\,\mathrm{N/mm^2}"
        force = r"\,\mathrm{N}"
        step(
            "ε_csm,t/ε_y",
            f"tensile strain limit ratio, governed by {governing.value} (Formula B.14)",
            "min{15 ; C₁ε_u / ε_y}",
            f"min{{{TENSION_STRAIN_RATIO_CAP:g} ; {model.strain_limit_ratio_c1:.6g}}}",
            ratio,
            dimless,
            tex(
                r"\frac{\varepsilon_{csm,t}}{\varepsilon_y} = "
                r"\min\left\{15;\ \frac{C_1\varepsilon_u}{\varepsilon_y}\right\} = "
                r"\min\{<cap>;\ <c1>\} = <v>",
                cap=TENSION_STRAIN_RATIO_CAP,
                c1=model.strain_limit_ratio_c1,
                v=ratio,
            ),
        )
        step(
            "ε_csm,t",
            "tensile strain limit",
            "(ε_csm,t / ε_y) × ε_y",
            f"{ratio:.6g} × {eps_y:.6g}",
            strain,
            dimless,
            tex(
                r"\varepsilon_{csm,t} = \frac{\varepsilon_{csm,t}}{\varepsilon_y}\,"
                r"\varepsilon_y = <r> \times <ey> = <v>",
                r=ratio,
                ey=eps_y,
                v=strain,
            ),
        )
        step(
            "f_csm,t",
            "design stress at ε_csm,t (Formula B.13)",
            "f_y + E_sh ε_y (ε_csm,t/ε_y − 1)",
            f"{fy:g} + {e_sh:.6g} × {eps_y:.6g} × ({ratio:.6g} − 1)",
            f_csm_t,
            units.STRESS,
            tex(
                r"f_{csm,t} = f_y + E_{sh}\,\varepsilon_y"
                r"\left(\frac{\varepsilon_{csm,t}}{\varepsilon_y} - 1\right) = "
                r"<fy> + <esh> \times <ey> \times (<r> - 1) = <v>" + stress,
                fy=fy,
                esh=e_sh,
                ey=eps_y,
                r=ratio,
                v=f_csm_t,
            ),
        )
        step(
            "N_csm,t,Rd",
            "CSM design tension resistance (Formula B.12)",
            "A f_csm,t / γ_M0",
            f"{data.area:g} × {f_csm_t:.6g} / {data.gamma_m0:g}",
            n_rd,
            units.FORCE,
            tex(
                r"N_{csm,t,Rd} = \frac{A\,f_{csm,t}}{\gamma_{M0}} = "
                r"\frac{<a> \times <f>}{<g>} = <v>" + force,
                a=data.area,
                f=f_csm_t,
                g=data.gamma_m0,
                v=n_rd,
            ),
        )
        return TensionResult(
            strain_ratio=ratio,
            governing=governing,
            strain=strain,
            design_stress=f_csm_t,
            resistance=n_rd,
            notes=tuple(notes),
            trace=trace,
        )
