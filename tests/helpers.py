"""Shared test inputs. The engine has no defaults for values outside Annex B."""

from stainless_csm.data.repository import GradeRepository
from stainless_csm.materials.material import Material

E = 200_000.0  # 5.1.5
NU = 0.3  # 5.1.5
GAMMA_M0 = 1.10  # 8.1
OMEGA = 15.0  # 7.4.3.5
K_INTERNAL = 4.0  # EN 1993-1-5, an input in the app
K_OUTSTAND = 0.43


def grade_material(designation: str = "1.4307", elastic_modulus: float = E) -> Material:
    return Material.from_grade(GradeRepository.load_default().get(designation), elastic_modulus)
