"""B.5.1: the CSM base curve, the normalised deformation capacity eps_csm / eps_y.

Formula (B.6) for sections of flat plates, Formula (B.7) for circular hollow sections. Beyond
the upper slenderness limit (1.60 for plates, 0.60 for circular hollow sections) the method does
not apply; the result then says so instead of giving a number.
"""

import math
from dataclasses import dataclass
from enum import Enum

from stainless_csm.core import units
from stainless_csm.core.errors import InvalidSectionError, NotApplicableError
from stainless_csm.core.latex import tex
from stainless_csm.core.trace import CalcStep, CalcTrace
from stainless_csm.material_models.csm_bilinear import CSMBilinearModel

_CLAUSE = "B.5.1"


class SectionFamily(Enum):
    FLAT_PLATES = "flat plates"
    CIRCULAR_HOLLOW = "circular hollow section"


class Zone(Enum):
    STOCKY = "stocky"
    SLENDER = "slender"
    NOT_ALLOWED = "not allowed"


class CapSource(Enum):
    OMEGA = "Ω"
    MATERIAL_DUCTILITY = "C₁ε_u / ε_y"


@dataclass(frozen=True)
class CurveLimits:
    switch: float  # the slenderness where the formula changes
    upper: float  # beyond this the method does not apply


LIMITS = {
    SectionFamily.FLAT_PLATES: CurveLimits(0.68, 1.60),
    SectionFamily.CIRCULAR_HOLLOW: CurveLimits(0.30, 0.60),
}


def raw_ratio(family: SectionFamily, slenderness: float) -> float:
    """The base-curve formula before the cap: B.6 or B.7. Valid up to the upper limit only."""
    lam = slenderness
    if family is SectionFamily.FLAT_PLATES:
        if lam <= LIMITS[family].switch:
            return float(0.25 / lam**3.6)
        power = lam**1.050
        return float((1 - 0.222 / power) / power)
    if lam <= LIMITS[family].switch:
        return float(4.44e-3 / lam**4.5)
    power = lam**0.342
    return float((1 - 0.224 / power) / power)


def strain_cap(model: CSMBilinearModel, omega: float) -> tuple[float, CapSource]:
    """min(Ω, C₁ε_u / ε_y): the cap applied to the stocky branch of B.6 and B.7."""
    ductility = model.strain_limit_ratio_c1
    if ductility < omega:
        return ductility, CapSource.MATERIAL_DUCTILITY
    return omega, CapSource.OMEGA


def curve_points(family: SectionFamily, cap: float, n: int = 200) -> list[tuple[float, float]]:
    """(slenderness, eps_csm/eps_y) over the allowed range, for plotting the base curve."""
    limits = LIMITS[family]
    start = 0.1 if family is SectionFamily.FLAT_PLATES else 0.05
    points = []
    for i in range(n):
        lam = start + (limits.upper - start) * i / (n - 1)
        value = raw_ratio(family, lam)
        points.append((lam, min(value, cap) if lam <= limits.switch else value))
    return points


@dataclass(frozen=True, slots=True)
class DeformationResult:
    family: SectionFamily
    slenderness: float
    zone: Zone
    cap: float
    cap_source: CapSource
    raw_ratio: float | None  # the formula before the cap; None when not allowed
    capped: bool  # the cap, not the formula, set the value
    strain_ratio: float | None  # eps_csm / eps_y; None when not allowed
    strain: float | None  # eps_csm; None when not allowed
    message: str | None
    trace: CalcTrace

    @property
    def allowed(self) -> bool:
        return self.zone is not Zone.NOT_ALLOWED

    def require_allowed(self) -> None:
        """For resistances that need eps_csm: stop with the reason when CSM does not apply."""
        if self.message is not None:
            raise NotApplicableError(self.message)


class CSMDeformationCapacity:
    """B.6 / B.7 for one section slenderness, on top of a B.4 material model."""

    def __init__(
        self,
        model: CSMBilinearModel,
        family: SectionFamily,
        slenderness: float,
        omega: float,
    ) -> None:
        if not math.isfinite(slenderness) or slenderness <= 0:
            raise InvalidSectionError(
                f"Slenderness must be a positive number, got {slenderness!r}."
            )
        if not math.isfinite(omega) or omega <= 0:
            raise InvalidSectionError(f"Ω must be a positive number, got {omega!r}.")
        self._model = model
        self._family = family
        self._lam = slenderness
        self._omega = omega

    def calculate(self) -> DeformationResult:
        model, family, lam = self._model, self._family, self._lam
        limits = LIMITS[family]
        plates = family is SectionFamily.FLAT_PLATES
        sym = r"\bar\lambda_{p,cs}" if plates else r"\bar\lambda_{c,cs}"
        cap, cap_source = strain_cap(model, self._omega)

        trace = CalcTrace()

        def step(
            symbol: str, description: str, formula: str, substituted: str, value: float, latex: str
        ) -> None:
            trace.add(
                CalcStep(
                    symbol,
                    description,
                    _CLAUSE,
                    formula,
                    substituted,
                    value,
                    units.DIMENSIONLESS,
                    latex,
                )
            )

        step(
            "λ_cs",
            "relative cross-section slenderness",
            "B.5.2",
            f"{lam:.6g}",
            lam,
            tex(sym + r" = <v>", v=lam),
        )
        step(
            "min(Ω, C₁ε_u/ε_y)",
            "cap on the strain ratio, the smaller of the project parameter Ω and the "
            "material ductility limit",
            "min{Ω ; C₁ε_u / ε_y}",
            f"min{{{self._omega:g} ; {model.strain_limit_ratio_c1:.6g}}}",
            cap,
            tex(
                r"\min\left\{\Omega;\ \frac{C_1\varepsilon_u}{\varepsilon_y}\right\} = "
                r"\min\{<om>;\ <c1>\} = <v>",
                om=self._omega,
                c1=model.strain_limit_ratio_c1,
                v=cap,
            ),
        )

        if lam > limits.upper:
            what = "sections of flat plates" if plates else "circular hollow sections"
            message = (
                f"The cross-section is too slender for the CSM: relative slenderness "
                f"{lam:.3f} is above the limit {limits.upper:g} for {what} (B.5.1). "
                "Use the classic cross-section resistance (8.2, Class 4 effective widths)."
            )
            return DeformationResult(
                family,
                lam,
                Zone.NOT_ALLOWED,
                cap,
                cap_source,
                None,
                False,
                None,
                None,
                message,
                trace,
            )

        raw = raw_ratio(family, lam)
        stocky = lam <= limits.switch
        capped = stocky and raw > cap
        ratio = min(raw, cap) if stocky else raw

        if plates and stocky:
            raw_tex = r"\frac{0.25}{" + sym + r"^{3.6}} = \frac{0.25}{<l>^{3.6}} = <v>"
            raw_formula, raw_desc = "0.25 / λ^3.6", "B.6, stocky branch (λ ≤ 0.68)"
        elif plates:
            raw_tex = (
                r"\left(1 - \frac{0.222}{" + sym + r"^{1.05}}\right)\frac{1}{" + sym + r"^{1.05}}"
                r" = \left(1 - \frac{0.222}{<l>^{1.05}}\right)\frac{1}{<l>^{1.05}} = <v>"
            )
            raw_formula = "(1 − 0.222 / λ^1.05) / λ^1.05"
            raw_desc = "B.6, slender branch (0.68 < λ ≤ 1.60)"
        elif stocky:
            raw_tex = (
                r"\frac{4.44 \times 10^{-3}}{"
                + sym
                + r"^{4.5}} = "
                + (r"\frac{4.44 \times 10^{-3}}{<l>^{4.5}} = <v>")
            )
            raw_formula, raw_desc = "4.44e-3 / λ^4.5", "B.7, stocky branch (λ ≤ 0.30)"
        else:
            raw_tex = (
                r"\left(1 - \frac{0.224}{" + sym + r"^{0.342}}\right)\frac{1}{" + sym + r"^{0.342}}"
                r" = \left(1 - \frac{0.224}{<l>^{0.342}}\right)\frac{1}{<l>^{0.342}} = <v>"
            )
            raw_formula = "(1 − 0.224 / λ^0.342) / λ^0.342"
            raw_desc = "B.7, slender branch (0.30 < λ ≤ 0.60)"
        step(
            "(ε_csm/ε_y) base curve",
            f"base curve value, {raw_desc}",
            raw_formula,
            f"λ = {lam:.6g}",
            raw,
            r"\frac{\varepsilon_{csm}}{\varepsilon_y} = " + tex(raw_tex, l=lam, v=raw),
        )
        if stocky:
            step(
                "ε_csm/ε_y",
                "strain limit ratio: the base-curve value, held to the cap",
                "min{base curve ; cap}",
                f"min{{{raw:.6g} ; {cap:.6g}}}",
                ratio,
                tex(
                    r"\frac{\varepsilon_{csm}}{\varepsilon_y} = \min\{<r>;\ <c>\} = <v>",
                    r=raw,
                    c=cap,
                    v=ratio,
                ),
            )
        strain = ratio * model.yield_strain
        step(
            "ε_csm",
            "limiting CSM strain",
            "(ε_csm / ε_y) × ε_y",
            f"{ratio:.6g} × {model.yield_strain:.6g}",
            strain,
            tex(
                r"\varepsilon_{csm} = \frac{\varepsilon_{csm}}{\varepsilon_y}\,\varepsilon_y = "
                r"<r> \times <ey> = <v>",
                r=ratio,
                ey=model.yield_strain,
                v=strain,
            ),
        )
        zone = Zone.STOCKY if stocky else Zone.SLENDER
        return DeformationResult(
            family, lam, zone, cap, cap_source, raw, capped, ratio, strain, None, trace
        )
