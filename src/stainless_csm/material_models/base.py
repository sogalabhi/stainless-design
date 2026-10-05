"""Abstract stress–strain model: plotting and reports depend on this, never on a concrete model."""

import math
from abc import ABC, abstractmethod

from stainless_csm.core.errors import OutOfRangeError
from stainless_csm.core.trace import CalcTrace

Point = tuple[float, float]  # (strain, stress in N/mm²)


class MaterialModel(ABC):
    """A stress–strain idealisation defined on |strain| <= ``max_strain``.

    Sign convention: compression (negative strain) mirrors the tension curve, because the
    CSM uses the same curve in both directions. ``stress_at(-e) == -stress_at(e)``.
    Outside the defined range nothing is extrapolated: ``OutOfRangeError`` is raised.
    """

    @property
    @abstractmethod
    def name(self) -> str: ...

    @property
    @abstractmethod
    def max_strain(self) -> float:
        """Largest strain magnitude the model is defined for."""

    @property
    @abstractmethod
    def breakpoints(self) -> tuple[float, ...]:
        """Strains where the curve changes slope; always included in ``curve_points``."""

    @property
    @abstractmethod
    def trace(self) -> CalcTrace: ...

    @abstractmethod
    def _tension_stress(self, strain: float) -> float:
        """Stress for 0 <= strain <= max_strain."""

    def stress_at(self, strain: float) -> float:
        if not math.isfinite(strain) or abs(strain) > self.max_strain:
            raise OutOfRangeError(
                f"Strain {strain!r} is outside the range of the {self.name} model "
                f"(|strain| <= {self.max_strain:g})."
            )
        stress = self._tension_stress(abs(strain))
        return -stress if strain < 0 else stress

    def curve_points(self, n: int = 200) -> list[Point]:
        """About ``n`` points from 0 to ``max_strain`` for plotting, kinks included."""
        if n < 2:
            raise ValueError("n must be at least 2")
        strains = {self.max_strain * i / (n - 1) for i in range(n - 1)}
        strains.add(self.max_strain)
        strains.update(self.breakpoints)
        return [(strain, self.stress_at(strain)) for strain in sorted(strains)]
