import pytest

from stainless_csm.core.enums import StainlessFamily, StrengthClass
from stainless_csm.core.errors import InvalidMaterialError
from stainless_csm.data.repository import GradeRepository, csm_coefficients_for


def test_1_4307_loads_as_austenitic_210_500() -> None:
    grade = GradeRepository.load_default().get("1.4307")
    assert grade.family is StainlessFamily.AUSTENITIC
    assert (grade.fy, grade.fu) == (210, 500)
    assert grade.strength_class is StrengthClass.SC210


def test_1_4003_ferritic_carries_footnote_note() -> None:
    grade = GradeRepository.load_default().get("1.4003")
    assert grade.family is StainlessFamily.FERRITIC
    assert grade.note is not None
    assert "250–280" in grade.note


def test_unknown_grade_lists_alternatives() -> None:
    with pytest.raises(InvalidMaterialError, match=r"1\.4307"):
        GradeRepository.load_default().get("1.9999")


def test_contains_and_designations() -> None:
    repo = GradeRepository.load_default()
    assert "1.4462" in repo
    assert "1.4462" in repo.designations()


@pytest.mark.parametrize(
    ("family", "expected"),
    [
        (StainlessFamily.AUSTENITIC, (0.10, 0.16, 1.0)),
        (StainlessFamily.DUPLEX, (0.10, 0.16, 1.0)),
        (StainlessFamily.FERRITIC, (0.40, 0.45, 0.6)),
    ],
)
def test_table_b1_lookup(family: StainlessFamily, expected: tuple[float, float, float]) -> None:
    c = csm_coefficients_for(family)
    assert (c.c1, c.c2, c.c3) == expected
