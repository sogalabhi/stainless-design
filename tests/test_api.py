import json

import pytest
from fastapi.testclient import TestClient

from stainless_csm import services
from stainless_csm.api.main import create_app
from stainless_csm.core.enums import SectionType
from stainless_csm.data.repository import GradeRepository
from stainless_csm.material_models.csm_bilinear import CSMBilinearModel

client = TestClient(create_app())
V1 = "/api/v1"


E = 200_000
GAMMA_M0 = 1.10
NU = 0.3
OMEGA = 15


def material(designation: str = "1.4307") -> dict[str, object]:
    return {"designation": designation, "elastic_modulus": E}


def tension_body(designation: str = "1.4307", **tension: object) -> dict[str, object]:
    return {
        "material": material(designation),
        "tension": {"area": 1000, "section_type": "I-section", "gamma_m0": GAMMA_M0, **tension},
    }


def test_health() -> None:
    assert client.get(f"{V1}/health").json() == {"status": "ok"}


def test_grades_lists_table_5_1() -> None:
    grades = client.get(f"{V1}/grades").json()
    assert len(grades) == 15
    g = next(x for x in grades if x["designation"] == "1.4307")
    assert (g["family"], g["fy"], g["fu"], g["corrosion_class"]) == ("austenitic", 210, 500, "II")
    assert g["label"] == "1.4307 · austenitic · 210/500"


def test_coefficients_are_table_b1() -> None:
    rows = {r["family"]: r for r in client.get(f"{V1}/csm-coefficients").json()}
    assert (rows["ferritic"]["c1"], rows["ferritic"]["c2"], rows["ferritic"]["c3"]) == (
        0.4,
        0.45,
        0.6,
    )


def test_material_model_hand_checked_values() -> None:
    r = client.post(f"{V1}/material-model", json={"material": material()})
    assert r.status_code == 200
    body = r.json()
    values = body["values"]
    assert values["yield_strain"] == pytest.approx(0.00105)
    assert values["ultimate_strain"] == pytest.approx(0.58)
    assert values["strain_hardening_modulus"] == pytest.approx(3160.8, rel=1e-3)
    assert body["material"]["source"] == "Table 5.1 – 1.4307"
    assert [row["selected"] for row in body["coefficients"]] == [True, False, False]
    assert body["trace"][0]["symbol"] == "E"
    assert body["trace"][0]["clause"] == "input"
    assert body["trace"][0]["latex"].startswith("E = 200000")
    assert all(step["latex"] for step in body["trace"])
    assert "15 will govern" in body["hint"]


def test_material_model_returns_a_plotly_figure_in_both_views() -> None:
    for view, word in (("schematic", "not to scale"), ("true_scale", "true scale")):
        body = client.post(
            f"{V1}/material-model", json={"material": material(), "graph_view": view}
        ).json()
        fig = body["figure"]
        assert word in fig["layout"]["xaxis"]["title"]["text"]
        assert any(t.get("name") == "CSM bilinear (B.4)" for t in fig["data"])


@pytest.mark.parametrize(
    ("designation", "f_csm_t", "n_rd", "governing"),
    [
        ("1.4307", 256.5, 233_150, "fixed_limit_15"),
        ("1.4003", 279.5, 254_060, "fixed_limit_15"),
        ("1.4462", 571.4, 519_470, "material_ductility"),
    ],
)
def test_tension_hand_checked_values(
    designation: str, f_csm_t: float, n_rd: float, governing: str
) -> None:
    r = client.post(f"{V1}/tension", json=tension_body(designation))
    assert r.status_code == 200
    body = r.json()
    assert body["design_stress"] == pytest.approx(f_csm_t, rel=1e-3)
    assert body["resistance"] == pytest.approx(n_rd, rel=1e-3)
    assert body["governing"] == governing
    assert "utilisation" not in body
    assert "verdict" not in body


def test_tension_returns_resistances_and_figures_only() -> None:
    body = client.post(f"{V1}/tension", json=tension_body()).json()
    assert set(body) >= {"resistance", "design_stress", "trace", "figure"}
    assert not {"utilisation", "passes", "verdict", "classic_resistance", "gain"} & set(body)
    names = [t.get("name") for t in body["figure"]["data"]]
    assert "Extra strength used in tension" in names
    assert not any("design_force" in str(step) for step in body["trace"])


def test_holes_are_a_clear_422() -> None:
    r = client.post(f"{V1}/tension", json=tension_body(has_holes=True))
    assert r.status_code == 422
    assert r.json()["error_type"] == "NotApplicableError"
    assert "B.6.1" in r.json()["detail"]


def test_domain_errors_become_422_with_a_message() -> None:
    body = {"material": {"family": "austenitic", "fy": 500, "fu": 400, "elastic_modulus": E}}
    r = client.post(f"{V1}/material-model", json=body)
    assert r.status_code == 422
    assert r.json()["error_type"] == "InvalidMaterialError"
    assert "Ultimate strength" in r.json()["detail"]

    r = client.post(f"{V1}/tension", json=tension_body(area=0))
    assert r.status_code == 422
    assert "Area" in r.json()["detail"]


def test_incomplete_custom_material_is_rejected() -> None:
    r = client.post(f"{V1}/material-model", json={"material": {"fy": 210}})
    assert r.status_code == 422


def test_unknown_grade_is_a_422_listing_alternatives() -> None:
    r = client.post(f"{V1}/material-model", json={"material": material("9.9999")})
    assert r.status_code == 422
    assert "1.4307" in r.json()["detail"]


def test_custom_material_works() -> None:
    body = {
        "material": {
            "family": "duplex",
            "fy": 450,
            "fu": 650,
            "elastic_modulus": E,
            "enhanced": True,
        }
    }
    r = client.post(f"{V1}/material-model", json=body)
    assert r.json()["material"]["source"] == "user-enhanced (cold-formed)"


def test_no_emoji_in_responses() -> None:
    from test_no_emoji import EMOJI

    body = client.post(f"{V1}/tension", json=tension_body()).text
    assert not EMOJI.search(body)


@pytest.mark.parametrize("designation", GradeRepository.load_default().designations())
def test_contract_api_equals_service_for_every_grade(designation: str) -> None:
    """The web numbers must be exactly the engine numbers."""
    api = client.post(f"{V1}/tension", json=tension_body(designation)).json()

    model = CSMBilinearModel(services.build_material(services.MaterialForm(designation, E)))
    result = services.run_tension(
        model, services.TensionForm(1000.0, SectionType.I_SECTION, GAMMA_M0)
    )
    assert api["design_stress"] == result.design_stress
    assert api["resistance"] == result.resistance
    assert [step["symbol"] for step in api["trace"]] == [s.symbol for s in result.trace]


def test_openapi_spec_documents_every_endpoint() -> None:
    paths = client.get("/openapi.json").json()["paths"]
    assert set(paths) == {
        f"{V1}/health",
        f"{V1}/grades",
        f"{V1}/csm-coefficients",
        f"{V1}/material-model",
        f"{V1}/tension",
        f"{V1}/deformation-capacity",
        f"{V1}/symbols",
    }
    json.dumps(client.get("/openapi.json").json())


# --- B.5 ---------------------------------------------------------------------------------


def deformation_body(designation: str = "1.4307", **geometry: object) -> dict[str, object]:
    return {
        "material": material(designation),
        "geometry": geometry,
        "omega": OMEGA,
        "poisson_ratio": NU,
    }


def plate_input(label: str = "web", width: float = 100, thickness: float = 5, k: float = 4.0):  # type: ignore[no-untyped-def]
    return {"label": label, "width": width, "thickness": thickness, "k_sigma": k}


def test_deformation_capacity_for_a_single_plate() -> None:
    body = deformation_body(kind="plates", plates=[plate_input()])
    r = client.post(f"{V1}/deformation-capacity", json=body)
    assert r.status_code == 200
    out = r.json()
    assert out["family"] == "flat_plates"
    assert out["slenderness"]["sigma_cr_cs"] == pytest.approx(1807.6, rel=1e-3)
    assert out["slenderness"]["value"] == pytest.approx(0.3408, rel=1e-3)
    limit = out["strain_limit"]
    assert limit["zone"] == "stocky"
    assert limit["strain_ratio"] == pytest.approx(12.03, rel=1e-2)
    assert limit["cap"] == 15.0
    assert limit["cap_source"] == "omega"
    assert (limit["switch"], limit["upper"]) == (0.68, 1.6)
    assert out["slenderness"]["plates"][0]["governing"] is True
    assert out["slenderness"]["plates"][0]["k_sigma"] == 4.0
    assert out["figure"]["layout"]["xaxis"]["title"]["text"].startswith("relative cross-section")
    assert any("your input" in note for note in out["notes"])


def test_the_users_k_sigma_and_nu_reach_the_calculation() -> None:
    base = client.post(
        f"{V1}/deformation-capacity", json=deformation_body(kind="plates", plates=[plate_input()])
    ).json()
    double_k = client.post(
        f"{V1}/deformation-capacity",
        json=deformation_body(kind="plates", plates=[plate_input(k=8.0)]),
    ).json()
    assert double_k["slenderness"]["sigma_cr_cs"] == pytest.approx(
        2 * base["slenderness"]["sigma_cr_cs"]
    )
    other_nu = deformation_body(kind="plates", plates=[plate_input()])
    other_nu["poisson_ratio"] = 0.2
    changed = client.post(f"{V1}/deformation-capacity", json=other_nu).json()
    assert changed["slenderness"]["sigma_cr_cs"] != base["slenderness"]["sigma_cr_cs"]


def test_deformation_capacity_chs() -> None:
    chs = client.post(f"{V1}/deformation-capacity", json=deformation_body(kind="chs", d=100, t=3))
    assert chs.json()["family"] == "circular_hollow"
    assert chs.json()["strain_limit"]["zone"] == "stocky"


def test_deformation_capacity_not_allowed_is_a_200_with_a_clear_message() -> None:
    body = deformation_body(kind="plates", plates=[plate_input("thin", 400, 2)])
    out = client.post(f"{V1}/deformation-capacity", json=body).json()
    limit = out["strain_limit"]
    assert limit["zone"] == "not_allowed"
    assert limit["allowed"] is False
    assert limit["strain_ratio"] is None
    assert "too slender" in limit["message"]
    assert out["figure"]["layout"]["shapes"]  # the chart still shows where the section falls


def test_deformation_capacity_direct_sigma_cr_and_omega() -> None:
    body = deformation_body(kind="sigma_cr", sigma_cr_cs=840, family="flat_plates")
    body["omega"] = 10
    out = client.post(f"{V1}/deformation-capacity", json=body).json()
    assert out["slenderness"]["value"] == pytest.approx(0.5)
    assert out["strain_limit"]["zone"] == "stocky"
    assert out["strain_limit"]["cap"] == 10.0


def test_deformation_capacity_duplex_cap_is_material_ductility() -> None:
    body = deformation_body("1.4462", kind="chs", d=100, t=20)
    limit = client.post(f"{V1}/deformation-capacity", json=body).json()["strain_limit"]
    assert limit["cap_source"] == "material_ductility"
    assert limit["cap"] == pytest.approx(13.68, abs=0.01)


def test_deformation_capacity_errors_are_clear_422s() -> None:
    missing = client.post(f"{V1}/deformation-capacity", json=deformation_body(kind="chs", d=100))
    assert missing.status_code == 422
    assert missing.json()["error_type"] == "InvalidSectionError"
    assert "t" in missing.json()["detail"]
    empty = client.post(f"{V1}/deformation-capacity", json=deformation_body(kind="plates"))
    assert empty.status_code == 422
    assert "at least one" in empty.json()["detail"]
    bad_nu = deformation_body(kind="chs", d=100, t=3)
    bad_nu["poisson_ratio"] = 0.7
    assert client.post(f"{V1}/deformation-capacity", json=bad_nu).status_code == 422


def test_deformation_capacity_contract_equals_service() -> None:
    plates = (services.PlateForm("web", 138, 4, 4.0), services.PlateForm("flange", 88, 4, 4.0))
    form = services.DeformationForm(
        services.GeometryForm(kind=services.GeometryKind.PLATES, plates=plates), OMEGA, NU
    )
    model = CSMBilinearModel(services.build_material(services.MaterialForm("1.4404", E)))
    result = services.run_deformation_capacity(model, form)
    api = client.post(
        f"{V1}/deformation-capacity",
        json=deformation_body(
            "1.4404",
            kind="plates",
            plates=[plate_input("web", 138, 4), plate_input("flange", 88, 4)],
        ),
    ).json()
    assert api["slenderness"]["value"] == result.slenderness.slenderness
    assert api["strain_limit"]["strain_ratio"] == result.capacity.strain_ratio
    assert [step["symbol"] for step in api["trace"]] == [s.symbol for s in result.trace]
    assert all(step["latex"] for step in api["trace"])


# --- nothing outside Annex B is assumed ---------------------------------------------------


def test_every_value_from_outside_annex_b_is_a_required_input() -> None:
    """No hidden defaults: leaving any of these out is a 422, not a silent assumption."""
    no_e = client.post(f"{V1}/material-model", json={"material": {"designation": "1.4307"}})
    assert no_e.status_code == 422
    assert "elastic_modulus" in no_e.text

    tension = tension_body()
    del tension["tension"]["gamma_m0"]  # type: ignore[attr-defined]
    no_gamma = client.post(f"{V1}/tension", json=tension)
    assert no_gamma.status_code == 422
    assert "gamma_m0" in no_gamma.text

    no_omega = deformation_body(kind="chs", d=100, t=3)
    del no_omega["omega"]
    response = client.post(f"{V1}/deformation-capacity", json=no_omega)
    assert response.status_code == 422
    assert "omega" in response.text

    no_nu = deformation_body(kind="chs", d=100, t=3)
    del no_nu["poisson_ratio"]
    response = client.post(f"{V1}/deformation-capacity", json=no_nu)
    assert response.status_code == 422
    assert "ν" in response.text

    no_k = deformation_body(kind="plates", plates=[{"label": "a", "width": 100, "thickness": 5}])
    response = client.post(f"{V1}/deformation-capacity", json=no_k)
    assert response.status_code == 422
    assert "k_sigma" in response.text


def test_there_are_no_section_presets() -> None:
    kinds = client.get("/openapi.json").json()["components"]["schemas"]["GeometryKindKey"]["enum"]
    assert kinds == ["chs", "plates", "sigma_cr"]
