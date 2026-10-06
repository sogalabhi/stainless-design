"""B.5.2: cross-section slenderness and the elastic critical local buckling stress.

Units: N, mm, N/mm². The conservative route is used for sigma_cr,cs: the most slender plate
(B.9) for sections of flat plates, or Formula B.11 for circular hollow sections. A numerically
determined sigma_cr,cs (B.5.2(2)) can be entered directly.

Nothing from outside Annex B is assumed: Poisson's ratio and each plate's buckling factor
k_sigma are inputs.
"""

import math
from collections.abc import Sequence
from dataclasses import dataclass
from enum import Enum

from stainless_csm.core import units
from stainless_csm.core.errors import InvalidSectionError
from stainless_csm.core.latex import tex, text_tex
from stainless_csm.core.trace import CalcStep, CalcTrace
from stainless_csm.materials.material import Material


class SigmaCrSource(Enum):
    PLATE_B9 = "most slender plate (B.9)"
    CHS_B11 = "circular hollow section (B.11)"
    USER = "numerical value entered (B.5.2(2))"


def _require_poisson(poisson: float) -> None:
    if not math.isfinite(poisson) or not 0 <= poisson < 0.5:
        raise InvalidSectionError(f"Poisson's ratio must be between 0 and 0.5, got {poisson!r}.")


def _require_positive(name: str, value: float) -> None:
    if not math.isfinite(value) or value <= 0:
        raise InvalidSectionError(f"{name} must be a positive number, got {value!r}.")


@dataclass(frozen=True, slots=True)
class PlateElement:
    """One flat plate: flat width b̄, thickness t and its buckling factor k_sigma.

    All of them are inputs. k_sigma is defined outside Annex B (B.5.2(3) refers to it), so it is
    never assumed.
    """

    label: str
    width: float
    thickness: float
    k_sigma: float

    def __post_init__(self) -> None:
        _require_positive(f"Width of plate '{self.label}'", self.width)
        _require_positive(f"Thickness of plate '{self.label}'", self.thickness)
        _require_positive(f"k_sigma of plate '{self.label}'", self.k_sigma)


@dataclass(frozen=True, slots=True)
class PlateCheck:
    plate: PlateElement
    sigma_cr: float
    slenderness: float

    @property
    def width_to_thickness(self) -> float:
        return self.plate.width / self.plate.thickness


@dataclass(frozen=True, slots=True)
class SlendernessResult:
    source: SigmaCrSource
    sigma_cr_cs: float
    slenderness: float
    governing_label: str
    plates: tuple[PlateCheck, ...]
    trace: CalcTrace


def plate_critical_stress(plate: PlateElement, elastic_modulus: float, poisson: float) -> float:
    """Formula (B.9): sigma_cr,p = k_sigma pi^2 E t^2 / (12 (1 - nu^2) b^2), in N/mm²."""
    return (
        plate.k_sigma
        * math.pi**2
        * elastic_modulus
        * plate.thickness**2
        / (12 * (1 - poisson**2) * plate.width**2)
    )


def chs_critical_stress(
    diameter: float, thickness: float, elastic_modulus: float, poisson: float
) -> float:
    """Formula (B.11): sigma_cr,c = E / sqrt(3 (1 - nu^2)) * 2t/d, in N/mm²."""
    _require_poisson(poisson)
    _require_positive("Diameter", diameter)
    _require_positive("Thickness", thickness)
    if thickness * 2 >= diameter:
        raise InvalidSectionError("Wall thickness must be less than half the diameter.")
    return elastic_modulus / math.sqrt(3 * (1 - poisson**2)) * 2 * thickness / diameter


def _step(
    symbol: str, description: str, clause: str, formula: str, value: float, unit: str, latex: str
) -> CalcStep:
    return CalcStep(symbol, description, clause, formula, f"{value:.6g}", value, unit, latex)


_STRESS = r"\,\mathrm{N/mm^2}"


def plates_slenderness(
    plates: Sequence[PlateElement], material: Material, poisson: float
) -> SlendernessResult:
    """Conservative sigma_cr,cs = the lowest sigma_cr,p of the plates (B.5.2(3), Formula B.9)."""
    _require_poisson(poisson)
    if not plates:
        raise InvalidSectionError("Give at least one plate.")
    labels = [plate.label for plate in plates]
    if len(set(labels)) != len(labels):
        raise InvalidSectionError("Plate names must be different from each other.")

    fy, e = material.fy, material.elastic_modulus
    trace = CalcTrace()
    checks: list[PlateCheck] = []
    for plate in plates:
        sigma = plate_critical_stress(plate, e, poisson)
        lam = math.sqrt(fy / sigma)
        checks.append(PlateCheck(plate, sigma, lam))
        name = text_tex(plate.label)
        trace.add(
            _step(
                f"σ_cr,p [{plate.label}]",
                f"elastic critical plate buckling stress of '{plate.label}' (Formula B.9)",
                "B.5.2",
                "k_σ π² E t² / (12 (1 − ν²) b²)",
                sigma,
                units.STRESS,
                tex(
                    r"\sigma_{cr,p}\ (\text{<n>}) = \frac{k_\sigma \pi^2 E t^2}"
                    r"{12(1-\nu^2)\,\bar b^2} = \frac{<k> \times \pi^2 \times <e> \times <t>^2}"
                    r"{12 \times (1-<nu>^2) \times <b>^2} = <v>" + _STRESS,
                    n=name,
                    k=plate.k_sigma,
                    e=e,
                    t=plate.thickness,
                    nu=poisson,
                    b=plate.width,
                    v=sigma,
                ),
            )
        )
        trace.add(
            _step(
                f"λ_p [{plate.label}]",
                f"relative slenderness of '{plate.label}'",
                "B.5.2",
                "√(f_y / σ_cr,p)",
                lam,
                units.DIMENSIONLESS,
                tex(
                    r"\bar\lambda_p\ (\text{<n>}) = \sqrt{\frac{f_y}{\sigma_{cr,p}}} = "
                    r"\sqrt{\frac{<fy>}{<s>}} = <v>",
                    n=name,
                    fy=fy,
                    s=sigma,
                    v=lam,
                ),
            )
        )

    governing = min(checks, key=lambda c: c.sigma_cr)
    sigma_cs = governing.sigma_cr
    lam_cs = math.sqrt(fy / sigma_cs)
    trace.add(
        _step(
            "σ_cr,cs",
            f"critical stress of the full cross-section, taken as the most slender plate "
            f"('{governing.plate.label}')",
            "B.5.2",
            "min σ_cr,p",
            sigma_cs,
            units.STRESS,
            tex(
                r"\sigma_{cr,cs} = \min\sigma_{cr,p} = <v>" + _STRESS + r"\quad(\text{<n>})",
                v=sigma_cs,
                n=text_tex(governing.plate.label),
            ),
        )
    )
    trace.add(
        _step(
            "λ_p,cs",
            "relative cross-section slenderness (Formula B.8)",
            "B.5.2",
            "√(f_y / σ_cr,cs)",
            lam_cs,
            units.DIMENSIONLESS,
            tex(
                r"\bar\lambda_{p,cs} = \sqrt{\frac{f_y}{\sigma_{cr,cs}}} = "
                r"\sqrt{\frac{<fy>}{<s>}} = <v>",
                fy=fy,
                s=sigma_cs,
                v=lam_cs,
            ),
        )
    )
    return SlendernessResult(
        SigmaCrSource.PLATE_B9, sigma_cs, lam_cs, governing.plate.label, tuple(checks), trace
    )


def chs_slenderness(
    diameter: float, thickness: float, material: Material, poisson: float
) -> SlendernessResult:
    """Circular hollow section: Formulae B.11 and B.10."""
    fy, e = material.fy, material.elastic_modulus
    sigma = chs_critical_stress(diameter, thickness, e, poisson)
    lam = math.sqrt(fy / sigma)
    trace = CalcTrace(
        [
            _step(
                "σ_cr,c",
                "elastic critical local buckling stress of the circular hollow section "
                "(Formula B.11)",
                "B.5.2",
                "E / √(3 (1 − ν²)) × 2t / d",
                sigma,
                units.STRESS,
                tex(
                    r"\sigma_{cr,c} = \frac{E}{\sqrt{3(1-\nu^2)}}\,\frac{2t}{d} = "
                    r"\frac{<e>}{\sqrt{3(1-<nu>^2)}} \times \frac{2 \times <t>}{<d>} = <v>"
                    + _STRESS,
                    e=e,
                    nu=poisson,
                    t=thickness,
                    d=diameter,
                    v=sigma,
                ),
            ),
            _step(
                "λ_c,cs",
                "relative cross-section slenderness (Formula B.10)",
                "B.5.2",
                "√(f_y / σ_cr,c)",
                lam,
                units.DIMENSIONLESS,
                tex(
                    r"\bar\lambda_{c,cs} = \sqrt{\frac{f_y}{\sigma_{cr,c}}} = "
                    r"\sqrt{\frac{<fy>}{<s>}} = <v>",
                    fy=fy,
                    s=sigma,
                    v=lam,
                ),
            ),
        ]
    )
    return SlendernessResult(
        SigmaCrSource.CHS_B11, sigma, lam, "circular hollow section", (), trace
    )


def direct_slenderness(sigma_cr_cs: float, material: Material) -> SlendernessResult:
    """A numerically determined (or published) sigma_cr,cs entered by the user (B.5.2(2))."""
    _require_positive("Critical stress sigma_cr,cs", sigma_cr_cs)
    lam = math.sqrt(material.fy / sigma_cr_cs)
    trace = CalcTrace(
        [
            _step(
                "σ_cr,cs",
                "critical stress of the full cross-section, entered by the user",
                "B.5.2",
                "given",
                sigma_cr_cs,
                units.STRESS,
                tex(r"\sigma_{cr,cs} = <v>" + _STRESS + r"\quad(\text{entered})", v=sigma_cr_cs),
            ),
            _step(
                "λ_p,cs",
                "relative cross-section slenderness (Formula B.8)",
                "B.5.2",
                "√(f_y / σ_cr,cs)",
                lam,
                units.DIMENSIONLESS,
                tex(
                    r"\bar\lambda_{p,cs} = \sqrt{\frac{f_y}{\sigma_{cr,cs}}} = "
                    r"\sqrt{\frac{<fy>}{<s>}} = <v>",
                    fy=material.fy,
                    s=sigma_cr_cs,
                    v=lam,
                ),
            ),
        ]
    )
    return SlendernessResult(SigmaCrSource.USER, sigma_cr_cs, lam, "entered value", (), trace)
