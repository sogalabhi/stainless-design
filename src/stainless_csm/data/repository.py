"""Loads the JSON tables into objects."""

import json
from collections.abc import Iterable
from functools import cache
from importlib.resources import files
from typing import Any

from stainless_csm.core.enums import CorrosionClass, StainlessFamily, StrengthClass
from stainless_csm.core.errors import InvalidMaterialError
from stainless_csm.material_models.csm_coefficients import CSMCoefficients
from stainless_csm.materials.grade import Grade


def _read_json(name: str) -> dict[str, Any]:
    text = files("stainless_csm.data").joinpath(name).read_text(encoding="utf-8")
    data: dict[str, Any] = json.loads(text)
    return data


def _grade_from_record(record: dict[str, Any]) -> Grade:
    strength = record.get("strength_class")
    corrosion = record.get("corrosion_class")
    return Grade(
        designation=record["designation"],
        family=StainlessFamily(record["family"]),
        fy=float(record["fy"]),
        fu=float(record["fu"]),
        strength_class=StrengthClass(strength) if strength else None,
        corrosion_class=CorrosionClass(corrosion) if corrosion else None,
        note=record.get("note"),
    )


class GradeRepository:
    """Table 5.1, looked up by designation such as "1.4307"."""

    def __init__(self, grades: Iterable[Grade]) -> None:
        self._grades = {grade.designation: grade for grade in grades}

    @classmethod
    def load_default(cls) -> "GradeRepository":
        return _default_grade_repository()

    def get(self, designation: str) -> Grade:
        try:
            return self._grades[designation]
        except KeyError:
            raise InvalidMaterialError(
                f"Unknown grade {designation!r}. Available: {', '.join(self.designations())}."
            ) from None

    def designations(self) -> list[str]:
        return sorted(self._grades)

    def __contains__(self, designation: object) -> bool:
        return designation in self._grades

    def __len__(self) -> int:
        return len(self._grades)


@cache
def _default_grade_repository() -> GradeRepository:
    records = _read_json("grades.json")["grades"]
    return GradeRepository(_grade_from_record(record) for record in records)


@cache
def _csm_coefficient_table() -> dict[StainlessFamily, CSMCoefficients]:
    raw = _read_json("csm_coefficients.json")
    return {family: CSMCoefficients(**raw[family.value]) for family in StainlessFamily}


def csm_coefficients_for(family: StainlessFamily) -> CSMCoefficients:
    """Table B.1 lookup."""
    return _csm_coefficient_table()[family]
