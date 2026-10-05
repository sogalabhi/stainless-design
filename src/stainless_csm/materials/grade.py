"""A stainless steel grade as listed in Table 5.1."""

from dataclasses import dataclass

from stainless_csm.core.enums import CorrosionClass, StainlessFamily, StrengthClass


@dataclass(frozen=True, slots=True)
class Grade:
    """One row of Table 5.1 (sheet/plate values).

    Table 5.1 footnote a gives a lower f_y for bars, hot-rolled sections and seamless tubes
    in SC210; until a product-form enum exists this is carried in ``note``.
    """

    designation: str
    family: StainlessFamily
    fy: float
    fu: float
    strength_class: StrengthClass | None = None
    corrosion_class: CorrosionClass | None = None
    note: str | None = None
