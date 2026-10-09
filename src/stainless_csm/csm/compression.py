"""B.6.2: CSM compression resistance of sections of flat plates and circular hollow sections.

Units: N, mm, N/mm². Convert to kN only at the UI edge.

The strain limit ε_csm / ε_y comes from B.5.1 (a :class:`DeformationResult`). Below 1.0 the
section buckles before it yields and Formula B.15 is linear in the ratio; from 1.0 Formula B.16
uses the stress f_csm of Formula B.17 on the hardening line. B.6.2 has no clause about holes, so
the area is whatever the user gives.
"""

import math
from dataclasses import dataclass
from enum import Enum

from stainless_csm.core import units
from stainless_csm.core.errors import InvalidMaterialError
from stainless_csm.core.latex import tex
from stainless_csm.core.trace import CalcStep, CalcTrace
from stainless_csm.csm.deformation_capacity import DeformationResult
from stainless_csm.material_models.csm_bilinear import CSMBilinearModel

_CLAUSE = "B.6.2"

# The strain ratio at which B.15 ends and B.16 starts.
BRANCH_STRAIN_RATIO = 1.0

MEMBER_NOTE = (
    "This is the cross-section resistance of B.6.2. Member buckling (8.3) is outside Annex B "
    "and is not checked."
)


class CompressionFormula(Enum):
    """Which formula of B.6.2 gave the resistance."""

    B15 = "B.15"
    B16 = "B.16"


@dataclass(frozen=True, slots=True)
class CompressionInput:
    model: CSMBilinearModel
    deformation: DeformationResult  # B.5.1, for the same section
    area: float  # mm²
    gamma_m0: float

    def __post_init__(self) -> None:
        if not math.isfinite(self.area) or self.area <= 0:
            raise InvalidMaterialError(f"Area must be a positive number, got {self.area!r}.")
        if not math.isfinite(self.gamma_m0) or self.gamma_m0 <= 0:
            raise InvalidMaterialError(f"γM0 must be a positive number, got {self.gamma_m0!r}.")


@dataclass(frozen=True, slots=True)
class CompressionResult:
    strain_ratio: float  # ε_csm / ε_y, from B.5.1
    formula: CompressionFormula
    design_stress: float | None  # f_csm (B.17), N/mm²; None when B.15 applies (B.17 is not used)
    resistance: float  # N_csm,Rd, N
    notes: tuple[str, ...]
    trace: CalcTrace


def formula_for(strain_ratio: float) -> CompressionFormula:
    """B.15 for ε_csm/ε_y < 1.0, B.16 for ε_csm/ε_y >= 1.0."""
    return CompressionFormula.B15 if strain_ratio < BRANCH_STRAIN_RATIO else CompressionFormula.B16


def hardened_stress(model: CSMBilinearModel, strain_ratio: float) -> float:
    """Formula (B.17): f_csm = f_y + E_sh ε_y (ε_csm/ε_y − 1), in N/mm²."""
    return model.material.fy + model.strain_hardening_modulus * model.yield_strain * (
        strain_ratio - 1
    )


def capacity_ratio(model: CSMBilinearModel, strain_ratio: float) -> float:
    """N_csm,Rd / (A f_y / γ_M0) for a strain ratio, from B.15 or B.16 with B.17.

    A and γ_M0 cancel, so this depends on the material and the ratio only. It equals ε_csm/ε_y
    on the B.15 branch and f_csm/f_y on the B.16 branch. It is the normalised axis of the
    capacity chart, not a result.
    """
    if formula_for(strain_ratio) is CompressionFormula.B15:
        return strain_ratio
    return hardened_stress(model, strain_ratio) / model.material.fy


class CSMCompression:
    """B.15, B.16 and B.17, built on a :class:`CSMBilinearModel` and a B.5.1 result."""

    def __init__(self, data: CompressionInput) -> None:
        self._data = data

    def resistance_b15(self, strain_ratio: float) -> float:
        """Formula (B.15): N_csm,Rd = (ε_csm/ε_y) A f_y / γM0, in N."""
        data = self._data
        return strain_ratio * data.area * data.model.material.fy / data.gamma_m0

    def resistance_b16(self, design_stress: float) -> float:
        """Formula (B.16): N_csm,Rd = A f_csm / γM0, in N."""
        return self._data.area * design_stress / self._data.gamma_m0

    def calculate(self) -> CompressionResult:
        data, model = self._data, self._data.model
        data.deformation.require_allowed()  # NotApplicableError beyond the B.5 slenderness limit
        ratio = data.deformation.strain_ratio
        assert ratio is not None  # guaranteed by require_allowed

        fy = model.material.fy
        eps_y, e_sh = model.yield_strain, model.strain_hardening_modulus
        formula = formula_for(ratio)
        dimless = units.DIMENSIONLESS
        stress_unit = r"\,\mathrm{N/mm^2}"
        force_unit = r"\,\mathrm{N}"

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
        ) -> None:
            trace.add(
                CalcStep(
                    symbol, description, _CLAUSE, formula_text, substituted, value, unit, latex
                )
            )

        b15 = formula is CompressionFormula.B15
        step(
            "ε_csm/ε_y vs 1",
            "which formula applies: B.15 below 1.0, B.16 from 1.0 "
            + ("(B.17 is not used)" if b15 else "(with f_csm from B.17)"),
            "ε_csm/ε_y < 1.0: B.15;  ε_csm/ε_y ≥ 1.0: B.16",
            f"{ratio:.6g} {'<' if b15 else '≥'} 1.0, so {formula.value}",
            ratio,
            dimless,
            tex(
                r"\frac{\varepsilon_{csm}}{\varepsilon_y} = <r> "
                + (r"\lt" if b15 else r"\ge")
                + r" 1.0 \;\Rightarrow\; \text{Formula <f>}",
                r=ratio,
                f=formula.value,
            ),
        )

        design_stress: float | None = None
        if b15:
            n_rd = self.resistance_b15(ratio)
            step(
                "N_csm,Rd",
                "CSM design compression resistance (Formula B.15)",
                "(ε_csm / ε_y) A f_y / γ_M0",
                f"{ratio:.6g} × {data.area:g} × {fy:g} / {data.gamma_m0:g}",
                n_rd,
                units.FORCE,
                tex(
                    r"N_{csm,Rd} = \frac{\varepsilon_{csm}}{\varepsilon_y}"
                    r"\frac{A\,f_y}{\gamma_{M0}} = <r> \times \frac{<a> \times <fy>}{<g>}"
                    r" = <v>" + force_unit,
                    r=ratio,
                    a=data.area,
                    fy=fy,
                    g=data.gamma_m0,
                    v=n_rd,
                ),
            )
        else:
            design_stress = hardened_stress(model, ratio)
            step(
                "f_csm",
                "design stress on the hardening line at ε_csm (Formula B.17)",
                "f_y + E_sh ε_y (ε_csm/ε_y − 1)",
                f"{fy:g} + {e_sh:.6g} × {eps_y:.6g} × ({ratio:.6g} − 1)",
                design_stress,
                units.STRESS,
                tex(
                    r"f_{csm} = f_y + E_{sh}\,\varepsilon_y"
                    r"\left(\frac{\varepsilon_{csm}}{\varepsilon_y} - 1\right) = "
                    r"<fy> + <esh> \times <ey> \times (<r> - 1) = <v>" + stress_unit,
                    fy=fy,
                    esh=e_sh,
                    ey=eps_y,
                    r=ratio,
                    v=design_stress,
                ),
            )
            n_rd = self.resistance_b16(design_stress)
            step(
                "N_csm,Rd",
                "CSM design compression resistance (Formula B.16)",
                "A f_csm / γ_M0",
                f"{data.area:g} × {design_stress:.6g} / {data.gamma_m0:g}",
                n_rd,
                units.FORCE,
                tex(
                    r"N_{csm,Rd} = \frac{A\,f_{csm}}{\gamma_{M0}} = "
                    r"\frac{<a> \times <f>}{<g>} = <v>" + force_unit,
                    a=data.area,
                    f=design_stress,
                    g=data.gamma_m0,
                    v=n_rd,
                ),
            )

        notes = [MEMBER_NOTE]
        if b15:
            notes.insert(
                0,
                "ε_csm/ε_y is below 1.0, so Formula B.15 applies and f_csm (Formula B.17) is "
                "not used: it is defined only from ε_csm/ε_y = 1.0.",
            )
        return CompressionResult(
            strain_ratio=ratio,
            formula=formula,
            design_stress=design_stress,
            resistance=n_rd,
            notes=tuple(notes),
            trace=trace,
        )
