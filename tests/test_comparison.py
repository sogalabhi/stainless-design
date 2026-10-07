from itertools import pairwise

import pytest
from fastapi.testclient import TestClient

from helpers import K_INTERNAL, K_OUTSTAND, NU, OMEGA, grade_material
from stainless_csm import services
from stainless_csm.api.main import create_app
from stainless_csm.core.errors import InvalidSectionError
from stainless_csm.csm.deformation_capacity import LIMITS, SectionFamily, Zone
from stainless_csm.material_models.csm_bilinear import CSMBilinearModel

TUBE = services.GeometryForm(services.GeometryKind.CHS, d=100, t=3)
PLATES = services.GeometryForm(
    services.GeometryKind.PLATES,
    plates=(
        services.PlateForm("web", 180, 6, K_INTERNAL),
        services.PlateForm("flange", 60, 8, K_OUTSTAND),
    ),
)


def compare(geometry: services.GeometryForm) -> tuple[CSMBilinearModel, services.Comparison]:
    model = CSMBilinearModel(grade_material("1.4307"))
    form = services.DeformationForm(geometry, OMEGA, NU)
    return model, services.run_comparison(model, form)


@pytest.mark.parametrize("geometry", [TUBE, PLATES])
def test_your_section_matches_the_plain_deformation_calculation(geometry) -> None:
    model, comparison = compare(geometry)
    plain = services.run_deformation_capacity(model, services.DeformationForm(geometry, OMEGA, NU))
    yours = next(ref for ref in comparison.references if ref.key == "yours").point
    assert yours.factor == 1.0
    assert yours.slenderness == pytest.approx(plain.slenderness.slenderness)
    assert yours.capacity.strain_ratio == pytest.approx(plain.capacity.strain_ratio)


@pytest.mark.parametrize("geometry", [TUBE, PLATES])
def test_a_thicker_section_is_never_more_slender(geometry) -> None:
    _, comparison = compare(geometry)
    factors = [p.factor for p in comparison.points]
    lams = [p.slenderness for p in comparison.points]
    assert factors == sorted(factors)
    assert all(a >= b for a, b in pairwise(lams))


@pytest.mark.parametrize("geometry", [TUBE, PLATES])
def test_reference_sections_sit_on_the_annex_b_boundaries(geometry) -> None:
    _, comparison = compare(geometry)
    limits = LIMITS[comparison.family]
    refs = {ref.key: ref.point for ref in comparison.references}
    assert refs["limit"].slenderness == pytest.approx(limits.upper, rel=1e-6)
    assert refs["limit"].capacity.zone is not Zone.NOT_ALLOWED
    assert refs["yield"].slenderness == pytest.approx(limits.switch, rel=1e-6)
    assert refs["yield"].capacity.strain_ratio == pytest.approx(1.0, abs=2e-3)
    assert refs["capped"].capacity.strain_ratio == pytest.approx(OMEGA, rel=1e-6)
    ordered = [ref.point.slenderness for ref in comparison.references]
    assert ordered == sorted(ordered)


def test_a_section_thinner_than_the_limit_is_reported_not_allowed() -> None:
    _, comparison = compare(TUBE)
    thinnest = comparison.points[0]
    assert thinnest.capacity.zone is Zone.NOT_ALLOWED
    assert thinnest.stress is None and thinnest.capacity.strain is None


def test_stress_is_read_from_the_b4_curve_at_the_strain_limit() -> None:
    model, comparison = compare(TUBE)
    for point in comparison.points:
        if point.capacity.strain is not None:
            assert point.stress == pytest.approx(model.stress_at(point.capacity.strain))
    stocky = next(ref for ref in comparison.references if ref.key == "capped").point
    assert stocky.stress is not None and stocky.stress > model.material.fy


def test_a_tube_cannot_be_made_thicker_than_half_its_diameter() -> None:
    _, comparison = compare(TUBE)
    assert comparison.points[-1].factor < 100 / (2 * 3)


def test_a_typed_critical_stress_has_no_thickness_to_change() -> None:
    model = CSMBilinearModel(grade_material("1.4307"))
    geometry = services.GeometryForm(
        services.GeometryKind.SIGMA_CR, sigma_cr_cs=500, family=SectionFamily.FLAT_PLATES
    )
    with pytest.raises(InvalidSectionError, match="thickness"):
        services.run_comparison(model, services.DeformationForm(geometry, OMEGA, NU))


def test_api_returns_the_sweep_the_references_and_both_figures() -> None:
    client = TestClient(create_app())
    body = {
        "material": {"designation": "1.4307", "elastic_modulus": 200_000},
        "geometry": {"kind": "chs", "d": 100, "t": 3},
        "omega": OMEGA,
        "poisson_ratio": NU,
    }
    response = client.post("/api/v1/section-comparison", json=body)
    assert response.status_code == 200
    data = response.json()
    assert len(data["points"]) >= 80
    assert [ref["key"] for ref in data["references"]] == ["capped", "yours", "yield", "limit"]
    assert data["upper"] == 0.6 and data["switch"] == 0.3
    assert any(t.get("name") == "Reference sections" for t in data["base_curve_figure"]["data"])
    assert any(t.get("name") == "Your section" for t in data["stress_figure"]["data"])

    body["geometry"] = {"kind": "sigma_cr", "sigma_cr_cs": 500, "family": "flat_plates"}
    rejected = client.post("/api/v1/section-comparison", json=body)
    assert rejected.status_code == 422
    assert rejected.json()["error_type"] == "InvalidSectionError"
