"""Table B.1 coefficients C₁, C₂, C₃. Loaded by ``data.repository``."""

import math
from dataclasses import dataclass

from stainless_csm.core.errors import InvalidMaterialError


@dataclass(frozen=True, slots=True)
class CSMCoefficients:
    c1: float
    c2: float
    c3: float

    def __post_init__(self) -> None:
        for name, value in (("C1", self.c1), ("C2", self.c2), ("C3", self.c3)):
            if not math.isfinite(value) or value <= 0:
                raise InvalidMaterialError(f"Coefficient {name} must be positive, got {value!r}.")
