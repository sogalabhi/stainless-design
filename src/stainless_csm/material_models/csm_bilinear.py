"""B.4: the CSM bilinear elastic–linear-hardening material model.

    σ = E·ε                          0 <= ε <= ε_y
    σ = f_y + E_sh·(ε − ε_y)         ε_y < ε <= C₂ε_u

with ε_y = f_y/E, ε_u = C₃(1 − f_y/f_u) and E_sh = (f_u − f_y)/(C₂ε_u − ε_y).
The model *has a* Material (composition); it is not one.
"""

from stainless_csm.core import units
from stainless_csm.core.errors import InvalidMaterialError
from stainless_csm.core.trace import CalcStep, CalcTrace
from stainless_csm.data.repository import csm_coefficients_for
from stainless_csm.material_models.base import MaterialModel, Point
from stainless_csm.material_models.csm_coefficients import CSMCoefficients
from stainless_csm.materials.material import Material

_CLAUSE = "B.4"


class CSMBilinearModel(MaterialModel):
    def __init__(self, material: Material, coefficients: CSMCoefficients | None = None) -> None:
        self._material = material
        self._coefficients = coefficients or csm_coefficients_for(material.family)
        fy, fu, e = material.fy, material.fu, material.elastic_modulus
        c = self._coefficients

        self._yield_strain = fy / e
        self._ultimate_strain = c.c3 * (1 - fy / fu)
        self._strain_limit_c1 = c.c1 * self._ultimate_strain
        self._strain_end = c.c2 * self._ultimate_strain

        hardening_span = self._strain_end - self._yield_strain
        if hardening_span <= 0:
            raise InvalidMaterialError(
                f"C₂·ε_u ({self._strain_end:g}) is not greater than ε_y ({self._yield_strain:g}); "
                f"f_y/f_u = {fy / fu:.4f} is too close to 1 for the CSM hardening line."
            )
        self._strain_hardening_modulus = (fu - fy) / hardening_span
        self._trace = self._build_trace()

    # --- inputs ---------------------------------------------------------------------

    @property
    def material(self) -> Material:
        return self._material

    @property
    def coefficients(self) -> CSMCoefficients:
        return self._coefficients

    # --- derived values (computed once, in the constructor) -------------------------

    @property
    def yield_strain(self) -> float:
        """ε_y = f_y / E"""
        return self._yield_strain

    @property
    def ultimate_strain(self) -> float:
        """ε_u = C₃ (1 − f_y/f_u)"""
        return self._ultimate_strain

    @property
    def strain_hardening_modulus(self) -> float:
        """E_sh = (f_u − f_y) / (C₂ε_u − ε_y), in N/mm²"""
        return self._strain_hardening_modulus

    @property
    def strain_limit_c1(self) -> float:
        """C₁ε_u, marker used by B.5 and B.6.1"""
        return self._strain_limit_c1

    @property
    def strain_end(self) -> float:
        """C₂ε_u, last point of the curve"""
        return self._strain_end

    # --- MaterialModel --------------------------------------------------------------

    @property
    def name(self) -> str:
        return "CSM bilinear (B.4)"

    @property
    def max_strain(self) -> float:
        return self._strain_end

    @property
    def breakpoints(self) -> tuple[float, ...]:
        return (self._yield_strain, self._strain_limit_c1)

    @property
    def trace(self) -> CalcTrace:
        return self._trace

    def _tension_stress(self, strain: float) -> float:
        if strain <= self._yield_strain:
            return self._material.elastic_modulus * strain
        return self._material.fy + self._strain_hardening_modulus * (strain - self._yield_strain)

    def key_points(self) -> list[Point]:
        """Plot markers: origin, yield point, C₁ε_u and the end of the curve."""
        return [
            (0.0, 0.0),
            (self._yield_strain, self._material.fy),
            (self._strain_limit_c1, self.stress_at(self._strain_limit_c1)),
            (self._strain_end, self.stress_at(self._strain_end)),
        ]

    # --- working --------------------------------------------------------------------

    def _build_trace(self) -> CalcTrace:
        m, c = self._material, self._coefficients
        dimless = units.DIMENSIONLESS

        def step(
            symbol: str, description: str, formula: str, substituted: str, value: float, unit: str
        ) -> CalcStep:
            return CalcStep(symbol, description, _CLAUSE, formula, substituted, value, unit)

        return CalcTrace(
            [
                step("C₁", "CSM coefficient C₁", "Table B.1", m.family.value, c.c1, dimless),
                step("C₂", "CSM coefficient C₂", "Table B.1", m.family.value, c.c2, dimless),
                step("C₃", "CSM coefficient C₃", "Table B.1", m.family.value, c.c3, dimless),
                step(
                    "ε_y",
                    "elastic strain at yield",
                    "f_y / E",
                    f"{m.fy:g} / {m.elastic_modulus:g}",
                    self._yield_strain,
                    dimless,
                ),
                step(
                    "ε_u",
                    "strain at ultimate strength (Formula B.5)",
                    "C₃ (1 − f_y / f_u)",
                    f"{c.c3:g} × (1 − {m.fy:g} / {m.fu:g})",
                    self._ultimate_strain,
                    dimless,
                ),
                step(
                    "E_sh",
                    "strain hardening modulus (Formula B.4)",
                    "(f_u − f_y) / (C₂ε_u − ε_y)",
                    f"({m.fu:g} − {m.fy:g}) / ({c.c2:g} × {self._ultimate_strain:.6g}"
                    f" − {self._yield_strain:.6g})",
                    self._strain_hardening_modulus,
                    units.STRESS,
                ),
                step(
                    "C₁ε_u",
                    "strain limit marker used by B.5 and B.6.1",
                    "C₁ × ε_u",
                    f"{c.c1:g} × {self._ultimate_strain:.6g}",
                    self._strain_limit_c1,
                    dimless,
                ),
                step(
                    "C₂ε_u",
                    "last strain of the curve",
                    "C₂ × ε_u",
                    f"{c.c2:g} × {self._ultimate_strain:.6g}",
                    self._strain_end,
                    dimless,
                ),
            ]
        )
