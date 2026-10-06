import math

import pytest

from helpers import E
from stainless_csm.core.enums import StainlessFamily
from stainless_csm.core.errors import CSMError, InvalidMaterialError
from stainless_csm.data.repository import GradeRepository
from stainless_csm.materials.material import Material

AUST = StainlessFamily.AUSTENITIC


def test_defaults() -> None:
    m = Material(AUST, 210, 500, E)
    assert m.elastic_modulus == 200_000
    assert m.source == "user-defined"


@pytest.mark.parametrize(
    ("fy", "fu", "e"),
    [
        (0, 500, 200_000),
        (-210, 500, 200_000),
        (210, 500, 0),
        (210, 500, -1),
        (210, 210, 200_000),  # fu == fy
        (300, 250, 200_000),  # fu < fy
        (math.nan, 500, 200_000),
        (210, math.inf, 200_000),
    ],
)
def test_invalid_numbers_rejected(fy: float, fu: float, e: float) -> None:
    with pytest.raises(InvalidMaterialError):
        Material(AUST, fy, fu, e)


def test_family_typo_rejected() -> None:
    with pytest.raises(InvalidMaterialError, match="austenitic"):
        Material("austentic", 210, 500, E)  # type: ignore[arg-type]


def test_errors_are_catchable_as_csm_error() -> None:
    with pytest.raises(CSMError):
        Material(AUST, -1, 500, E)


def test_from_grade_records_source() -> None:
    grade = GradeRepository.load_default().get("1.4307")
    m = Material.from_grade(grade, E)
    assert (m.family, m.fy, m.fu) == (AUST, 210, 500)
    assert m.source == "Table 5.1 – 1.4307"


def test_custom_with_enhanced_source() -> None:
    m = Material.custom(AUST, 260, 540, E, source="user-enhanced (cold-formed)")
    assert m.source == "user-enhanced (cold-formed)"


def test_material_is_immutable() -> None:
    with pytest.raises(AttributeError):
        Material(AUST, 210, 500, E).fy = 300  # type: ignore[misc]
