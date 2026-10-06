"""Classic elastic–perfectly-plastic idealisation, for comparison with the CSM curve."""

from stainless_csm.core import units
from stainless_csm.core.errors import InvalidMaterialError
from stainless_csm.core.latex import tex
from stainless_csm.core.trace import CalcStep, CalcTrace
from stainless_csm.material_models.base import MaterialModel
from stainless_csm.materials.material import Material


class ElasticPerfectlyPlasticModel(MaterialModel):
    """σ = E·ε up to f_y, then flat at f_y up to ``max_strain``."""

    def __init__(self, material: Material, max_strain: float) -> None:
        self._material = material
        self._yield_strain = material.fy / material.elastic_modulus
        if not max_strain > self._yield_strain:
            raise InvalidMaterialError(
                f"max_strain ({max_strain!r}) must exceed the yield strain "
                f"({self._yield_strain:g})."
            )
        self._max_strain = max_strain
        self._trace = CalcTrace(
            [
                CalcStep(
                    symbol="ε_y",
                    description="elastic strain at yield",
                    clause="B.4",
                    formula="f_y / E",
                    substituted=f"{material.fy:g} / {material.elastic_modulus:g}",
                    value=self._yield_strain,
                    unit=units.DIMENSIONLESS,
                    latex=tex(
                        r"\varepsilon_y = \frac{f_y}{E} = \frac{<fy>}{<e>} = <v>",
                        fy=material.fy,
                        e=material.elastic_modulus,
                        v=self._yield_strain,
                    ),
                )
            ]
        )

    @property
    def name(self) -> str:
        return "Elastic–perfectly plastic"

    @property
    def material(self) -> Material:
        return self._material

    @property
    def yield_strain(self) -> float:
        return self._yield_strain

    @property
    def max_strain(self) -> float:
        return self._max_strain

    @property
    def breakpoints(self) -> tuple[float, ...]:
        return (self._yield_strain,)

    @property
    def trace(self) -> CalcTrace:
        return self._trace

    def _tension_stress(self, strain: float) -> float:
        if strain <= self._yield_strain:
            return self._material.elastic_modulus * strain
        return self._material.fy
