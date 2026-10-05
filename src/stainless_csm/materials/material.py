"""The material a calculation is run on. Immutable, so a trace can never go stale."""

import math
from dataclasses import dataclass

from stainless_csm.config.national_annex import ELASTIC_MODULUS
from stainless_csm.core.enums import StainlessFamily
from stainless_csm.core.errors import InvalidMaterialError
from stainless_csm.materials.grade import Grade


@dataclass(frozen=True, slots=True)
class Material:
    """family, f_y, f_u and E, plus where those numbers came from (for the report)."""

    family: StainlessFamily
    fy: float
    fu: float
    elastic_modulus: float = ELASTIC_MODULUS
    source: str = "user-defined"

    def __post_init__(self) -> None:
        if not isinstance(self.family, StainlessFamily):
            raise InvalidMaterialError(
                f"family must be a StainlessFamily, got {self.family!r}. "
                f"Choose one of: {', '.join(f.value for f in StainlessFamily)}."
            )
        for name, value in (
            ("yield strength fy", self.fy),
            ("ultimate strength fu", self.fu),
            ("elastic modulus E", self.elastic_modulus),
        ):
            if not math.isfinite(value) or value <= 0:
                raise InvalidMaterialError(f"{name} must be a positive number, got {value!r}.")
        if self.fu <= self.fy:
            raise InvalidMaterialError(
                f"Ultimate strength fu ({self.fu:g}) must be greater than "
                f"yield strength fy ({self.fy:g})."
            )

    @classmethod
    def from_grade(cls, grade: Grade, elastic_modulus: float = ELASTIC_MODULUS) -> "Material":
        return cls(
            family=grade.family,
            fy=grade.fy,
            fu=grade.fu,
            elastic_modulus=elastic_modulus,
            source=f"Table 5.1 – {grade.designation}",
        )

    @classmethod
    def custom(
        cls,
        family: StainlessFamily,
        fy: float,
        fu: float,
        elastic_modulus: float = ELASTIC_MODULUS,
        source: str = "user-defined",
    ) -> "Material":
        """Typed-in values, e.g. source="user-enhanced (cold-formed)" for f_ya / f_ua."""
        return cls(family, fy, fu, elastic_modulus, source)
