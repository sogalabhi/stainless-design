import pytest

from helpers import E
from stainless_csm.core.enums import StainlessFamily
from stainless_csm.core.errors import InvalidMaterialError, OutOfRangeError
from stainless_csm.material_models.base import MaterialModel
from stainless_csm.material_models.elastic_plastic import ElasticPerfectlyPlasticModel
from stainless_csm.materials.material import Material


@pytest.fixture
def model() -> ElasticPerfectlyPlasticModel:
    return ElasticPerfectlyPlasticModel(Material(StainlessFamily.AUSTENITIC, 210, 500, E), 0.05)


def test_is_a_material_model(model: ElasticPerfectlyPlasticModel) -> None:
    assert isinstance(model, MaterialModel)


def test_elastic_branch_and_plateau(model: ElasticPerfectlyPlasticModel) -> None:
    assert model.stress_at(0.0005) == pytest.approx(100.0)
    assert model.stress_at(model.yield_strain) == pytest.approx(210.0)
    assert model.stress_at(0.05) == 210.0


def test_compression_mirrors_tension(model: ElasticPerfectlyPlasticModel) -> None:
    assert model.stress_at(-0.0005) == pytest.approx(-100.0)
    assert model.stress_at(-0.03) == -210.0


def test_no_extrapolation(model: ElasticPerfectlyPlasticModel) -> None:
    with pytest.raises(OutOfRangeError):
        model.stress_at(0.0501)


def test_max_strain_must_exceed_yield() -> None:
    with pytest.raises(InvalidMaterialError):
        ElasticPerfectlyPlasticModel(Material(StainlessFamily.AUSTENITIC, 210, 500, E), 0.0001)


def test_curve_points_include_the_kink(model: ElasticPerfectlyPlasticModel) -> None:
    points = model.curve_points(20)
    assert (model.yield_strain, pytest.approx(210.0)) in [(s, pytest.approx(f)) for s, f in points]
    assert points[0] == (0.0, 0.0)
    assert points[-1][0] == 0.05
