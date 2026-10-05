"""B.6.1: CSM tension resistance of sections without holes.

Units: N, mm, N/mm². Convert to kN only at the UI edge.
"""

import math
from dataclasses import dataclass
from enum import Enum

from stainless_csm.config.national_annex import GAMMA_M0, TENSION_STRAIN_RATIO_CAP
from stainless_csm.core import units
from stainless_csm.core.enums import SectionType
from stainless_csm.core.errors import InvalidMaterialError, NotApplicableError
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
    section_type: SectionType
    has_holes: bool = False
    design_force: float | None = None  # N_Ed in N, optional
    gamma_m0: float = GAMMA_M0

    def __post_init__(self) -> None:
        if not math.isfinite(self.area) or self.area <= 0:
            raise InvalidMaterialError(f"Area must be a positive number, got {self.area!r}.")
        if not math.isfinite(self.gamma_m0) or self.gamma_m0 <= 0:
            raise InvalidMaterialError(f"γM0 must be a positive number, got {self.gamma_m0!r}.")
        if self.design_force is not None and (
            not math.isfinite(self.design_force) or self.design_force < 0
        ):
            raise InvalidMaterialError(
                f"Design tension force must be zero or positive, got {self.design_force!r}."
            )


@dataclass(frozen=True, slots=True)
class TensionResult:
    strain_ratio: float  # ε_csm,t / ε_y
    governing: GoverningStrainLimit
    strain: float  # ε_csm,t
    design_stress: float  # f_csm,t, N/mm²
    resistance: float  # N_csm,t,Rd, N
    classic_resistance: float  # N_pl,Rd = A f_y / γM0, N
    gain: float  # N_csm,t,Rd / N_pl,Rd − 1
    utilisation: float | None  # N_Ed / N_csm,t,Rd
    passes: bool | None
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
        n_pl_rd = data.area * fy / data.gamma_m0
        gain = n_rd / n_pl_rd - 1
        utilisation = None if data.design_force is None else data.design_force / n_rd
        passes = None if utilisation is None else utilisation <= 1.0

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
        ) -> None:
            trace.add(CalcStep(symbol, description, _CLAUSE, formula, substituted, value, unit))

        step(
            "ε_csm,t/ε_y",
            f"tensile strain limit ratio, governed by {governing.value} (Formula B.14)",
            "min{15 ; C₁ε_u / ε_y}",
            f"min{{{TENSION_STRAIN_RATIO_CAP:g} ; {model.strain_limit_ratio_c1:.6g}}}",
            ratio,
            dimless,
        )
        step(
            "ε_csm,t",
            "tensile strain limit",
            "(ε_csm,t / ε_y) × ε_y",
            f"{ratio:.6g} × {eps_y:.6g}",
            strain,
            dimless,
        )
        step(
            "f_csm,t",
            "design stress at ε_csm,t (Formula B.13)",
            "f_y + E_sh ε_y (ε_csm,t/ε_y − 1)",
            f"{fy:g} + {e_sh:.6g} × {eps_y:.6g} × ({ratio:.6g} − 1)",
            f_csm_t,
            units.STRESS,
        )
        step(
            "N_csm,t,Rd",
            "CSM design tension resistance (Formula B.12)",
            "A f_csm,t / γ_M0",
            f"{data.area:g} × {f_csm_t:.6g} / {data.gamma_m0:g}",
            n_rd,
            units.FORCE,
        )
        step(
            "N_pl,Rd",
            "classic tension resistance for comparison",
            "A f_y / γ_M0",
            f"{data.area:g} × {fy:g} / {data.gamma_m0:g}",
            n_pl_rd,
            units.FORCE,
        )
        step(
            "gain",
            "resistance gain of CSM over the classic check",
            "N_csm,t,Rd / N_pl,Rd − 1",
            f"{n_rd:.6g} / {n_pl_rd:.6g} − 1",
            gain,
            dimless,
        )
        if data.design_force is not None and utilisation is not None:
            step(
                "η",
                "utilisation",
                "N_Ed / N_csm,t,Rd",
                f"{data.design_force:g} / {n_rd:.6g}",
                utilisation,
                dimless,
            )

        return TensionResult(
            strain_ratio=ratio,
            governing=governing,
            strain=strain,
            design_stress=f_csm_t,
            resistance=n_rd,
            classic_resistance=n_pl_rd,
            gain=gain,
            utilisation=utilisation,
            passes=passes,
            notes=tuple(notes),
            trace=trace,
        )
