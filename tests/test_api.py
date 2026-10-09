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
        f"{V1}/compression",
        f"{V1}/bending",
        f"{V1}/deformation-capacity",
        f"{V1}/section-comparison",
        f"{V1}/section-properties",
        f"{V1}/symbols",
        f"{V1}/input-help",
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


# --- B.6.2 -------------------------------------------------------------------------------


def compression_body(designation: str = "1.4307", **changes: object) -> dict[str, object]:
    body: dict[str, object] = {
        **deformation_body(designation, kind="plates", plates=[plate_input()]),
        "area": 1000,
        "gamma_m0": GAMMA_M0,
    }
    return {**body, **changes}


def test_compression_stocky_plate_uses_b16() -> None:
    r = client.post(f"{V1}/compression", json=compression_body())
    assert r.status_code == 200
    out = r.json()
    assert out["formula"] == "b16"
    assert out["formula_label"] == "B.16"
    assert out["family"] == "flat_plates"
    assert out["slenderness"]["value"] == pytest.approx(0.3408, rel=1e-3)
    assert out["strain_ratio"] == pytest.approx(12.03, rel=1e-2)
    assert out["strain_limit"]["strain_ratio"] == out["strain_ratio"]
    assert out["design_stress"] == pytest.approx(246.6, rel=2e-3)
    assert out["resistance"] == pytest.approx(1000 * out["design_stress"] / GAMMA_M0)
    assert not {"utilisation", "passes", "verdict", "classic_resistance", "gain"} & set(out)


def test_compression_slender_plate_uses_b15_and_has_no_f_csm() -> None:
    body = compression_body(geometry={"kind": "plates", "plates": [plate_input("web", 250, 3)]})
    out = client.post(f"{V1}/compression", json=body).json()
    assert out["formula"] == "b15"
    assert out["design_stress"] is None
    assert out["resistance"] == pytest.approx(out["strain_ratio"] * 1000 * 210 / GAMMA_M0)
    assert any("B.17" in note and "not used" in note for note in out["notes"])


def test_compression_chs() -> None:
    body = compression_body(geometry={"kind": "chs", "d": 100, "t": 3})
    out = client.post(f"{V1}/compression", json=body).json()
    assert out["family"] == "circular_hollow"
    assert out["formula"] == "b16"


def test_compression_returns_both_charts_in_both_views() -> None:
    for view, word in (("schematic", "not to scale"), ("true_scale", "true scale")):
        out = client.post(f"{V1}/compression", json=compression_body(graph_view=view)).json()
        assert word in out["point_figure"]["layout"]["xaxis"]["title"]["text"]
        names = [t.get("name") for t in out["capacity_figure"]["data"]]
        assert "Your section" in names
        assert any("B.15" in str(n) for n in names) and any("B.16" in str(n) for n in names)
        assert any(t.get("name") == "CSM bilinear (B.4)" for t in out["point_figure"]["data"])


def test_compression_beyond_the_limit_is_a_clear_422() -> None:
    body = compression_body(geometry={"kind": "plates", "plates": [plate_input("thin", 400, 2)]})
    r = client.post(f"{V1}/compression", json=body)
    assert r.status_code == 422
    assert r.json()["error_type"] == "NotApplicableError"
    assert "too slender" in r.json()["detail"]
    assert "1.6" in r.json()["detail"]


def test_compression_bad_inputs_are_422s() -> None:
    r = client.post(f"{V1}/compression", json=compression_body(area=0))
    assert r.status_code == 422
    assert "Area" in r.json()["detail"]
    r = client.post(f"{V1}/compression", json=compression_body(gamma_m0=0))
    assert r.status_code == 422
    assert "γM0" in r.json()["detail"]
    r = client.post(
        f"{V1}/compression",
        json=compression_body(geometry={"kind": "chs", "d": 100}),
    )
    assert r.status_code == 422
    assert r.json()["error_type"] == "InvalidSectionError"


def test_compression_inputs_from_outside_annex_b_are_required() -> None:
    for name in ("area", "gamma_m0", "omega"):
        body = compression_body()
        del body[name]
        response = client.post(f"{V1}/compression", json=body)
        assert response.status_code == 422, name
        assert name in response.text


def test_compression_has_no_holes_input() -> None:
    schema = client.get("/openapi.json").json()["components"]["schemas"]["CompressionRequest"]
    assert "has_holes" not in schema["properties"]


def test_compression_contract_equals_service() -> None:
    plates = (services.PlateForm("web", 138, 4, 4.0), services.PlateForm("flange", 88, 4, 4.0))
    form = services.CompressionForm(
        services.DeformationForm(
            services.GeometryForm(kind=services.GeometryKind.PLATES, plates=plates), OMEGA, NU
        ),
        1234.5,
        GAMMA_M0,
    )
    model = CSMBilinearModel(services.build_material(services.MaterialForm("1.4404", E)))
    outcome = services.run_compression(model, form)
    body = compression_body(
        "1.4404",
        geometry={
            "kind": "plates",
            "plates": [plate_input("web", 138, 4), plate_input("flange", 88, 4)],
        },
        area=1234.5,
    )
    api = client.post(f"{V1}/compression", json=body).json()
    assert api["resistance"] == outcome.result.resistance
    assert api["design_stress"] == outcome.result.design_stress
    assert api["strain_ratio"] == outcome.result.strain_ratio
    assert api["formula_label"] == outcome.result.formula.value
    assert api["slenderness"]["value"] == outcome.deformation.slenderness.slenderness
    assert [step["symbol"] for step in api["trace"]] == [s.symbol for s in outcome.trace]
    assert all(step["latex"] for step in api["trace"])


@pytest.mark.parametrize("designation", GradeRepository.load_default().designations())
def test_compression_contract_for_every_grade(designation: str) -> None:
    body = compression_body(designation, geometry={"kind": "chs", "d": 100, "t": 3})
    api = client.post(f"{V1}/compression", json=body).json()
    model = CSMBilinearModel(services.build_material(services.MaterialForm(designation, E)))
    form = services.CompressionForm(
        services.DeformationForm(
            services.GeometryForm(services.GeometryKind.CHS, d=100, t=3), OMEGA, NU
        ),
        1000.0,
        GAMMA_M0,
    )
    outcome = services.run_compression(model, form)
    assert api["resistance"] == outcome.result.resistance
    assert api["strain_ratio"] == outcome.result.strain_ratio
    assert api["design_stress"] == outcome.result.design_stress


def test_no_emoji_in_the_compression_response() -> None:
    from test_no_emoji import EMOJI

    assert not EMOJI.search(client.post(f"{V1}/compression", json=compression_body()).text)


# --- B.6.3.1(1), B.6.3.2: bending about an axis of symmetry -------------------------------


def bending_body(designation: str = "1.4307", **changes: object) -> dict[str, object]:
    """One plate 100 x 5, bending k_σ 8 (stocky: B.20), an I-section about its major axis."""
    body: dict[str, object] = {
        **deformation_body(designation, kind="plates", plates=[plate_input(k=8.0)]),
        "section_type": "I-section",
        "axis": "major",
        "w_el": 194_318,
        "w_pl": 220_640,
        "gamma_m0": GAMMA_M0,
        "lambda_lt": 0.15,
    }
    return {**body, **changes}


def test_bending_stocky_plate_uses_b20() -> None:
    r = client.post(f"{V1}/bending", json=bending_body())
    assert r.status_code == 200
    out = r.json()
    assert out["formula"] == "b20"
    assert out["formula_label"] == "B.20"
    assert out["alpha"] == 2.0
    assert out["strain_ratio"] >= 1
    assert out["resistance"] > out["elastic_moment"]
    assert out["elastic_moment"] == pytest.approx(194_318 * 210 / GAMMA_M0)
    assert out["plastic_moment"] == pytest.approx(220_640 * 210 / GAMMA_M0)
    assert [step["clause"] for step in out["trace"]][-1] == "B.6.3.2"


def test_bending_slender_plate_uses_b19() -> None:
    body = bending_body(geometry={"kind": "plates", "plates": [plate_input("web", 250, 3, 8.0)]})
    out = client.post(f"{V1}/bending", json=body).json()
    assert out["formula"] == "b19"
    assert out["strain_ratio"] < 1
    assert out["resistance"] == pytest.approx(out["strain_ratio"] * out["elastic_moment"])


def test_bending_reports_table_b2_with_the_used_row_marked() -> None:
    out = client.post(f"{V1}/bending", json=bending_body(axis="minor")).json()
    assert len(out["table_b2"]) == 13
    selected = [row for row in out["table_b2"] if row["selected"]]
    assert len(selected) == 1
    assert (selected[0]["section"], selected[0]["axis"], selected[0]["alpha"]) == (
        "I-section",
        "minor",
        1.2,
    )
    assert out["alpha"] == 1.2


def test_bending_returns_both_charts_in_kn_m() -> None:
    out = client.post(f"{V1}/bending", json=bending_body()).json()
    assert out["moment_figure"]["data"] and out["blocks_figure"]["data"]
    assert "kN m" in out["moment_figure"]["layout"]["yaxis"]["title"]["text"]


def test_bending_chs_needs_no_axis() -> None:
    body = bending_body(
        section_type="circular hollow section", geometry={"kind": "chs", "d": 100, "t": 3}
    )
    del body["axis"]
    out = client.post(f"{V1}/bending", json=body).json()
    assert out["alpha"] == 2.0
    assert out["family"] == "circular_hollow"


def test_bending_template_uses_the_bending_k_sigma() -> None:
    body = bending_body(
        "1.4301",
        geometry={**i_template(), "k_sigma": {"web": 23.9, "flange": 0.43}},
        w_el=194_300,
        w_pl=220_600,
    )
    compression = compression_body(
        "1.4301", geometry={**i_template(), "k_sigma": {"web": 4.0, "flange": 0.43}}
    )
    bending = client.post(f"{V1}/bending", json=body).json()
    comp = client.post(f"{V1}/compression", json=compression).json()
    assert bending["slenderness"]["plates"][0]["k_sigma"] == 23.9
    assert comp["slenderness"]["plates"][0]["k_sigma"] == 4.0
    assert bending["slenderness"]["plates"][0]["width"] == pytest.approx(159.0)


def test_bending_lambda_lt_above_0_4_is_refused_with_the_8_2_4_message() -> None:
    r = client.post(f"{V1}/bending", json=bending_body(lambda_lt=0.5))
    assert r.status_code == 422
    assert r.json()["error_type"] == "NotApplicableError"
    assert "B.6.3.1 does not apply; use 8.2.4" in r.json()["detail"]


@pytest.mark.parametrize(
    ("changes", "fragment"),
    [
        ({"lambda_lt": 0.3}, "B.18 interpolation: arrives in phase 3"),
        ({"section_type": "channel", "axis": "minor"}, "B.6.3.3: arrives in phase 3"),
        ({"section_type": "angle", "axis": "major"}, "B.6.3.3: arrives in phase 3"),
        ({"section_type": "T-section", "axis": "major"}, "B.6.3.3: arrives in phase 3"),
    ],
)
def test_bending_not_built_yet_is_a_422_with_its_own_error_type(
    changes: dict[str, str | float], fragment: str
) -> None:
    body = {**bending_body(), **changes}
    r = client.post(f"{V1}/bending", json=body)
    assert r.status_code == 422
    assert r.json()["error_type"] == "NotBuiltYetError"
    assert fragment in r.json()["detail"]


def test_bending_beyond_the_b5_limit_is_a_clear_422() -> None:
    body = bending_body(geometry={"kind": "plates", "plates": [plate_input("thin", 400, 2, 8.0)]})
    r = client.post(f"{V1}/bending", json=body)
    assert r.status_code == 422
    assert r.json()["error_type"] == "NotApplicableError"
    assert "too slender" in r.json()["detail"]


def test_bending_bad_inputs_are_422s() -> None:
    assert client.post(f"{V1}/bending", json=bending_body(w_el=0)).status_code == 422
    assert client.post(f"{V1}/bending", json=bending_body(gamma_m0=0)).status_code == 422
    swapped = client.post(f"{V1}/bending", json=bending_body(w_el=220_640, w_pl=194_318))
    assert swapped.status_code == 422 and "less than W_el" in swapped.json()["detail"]
    no_axis = bending_body()
    del no_axis["axis"]
    r = client.post(f"{V1}/bending", json=no_axis)
    assert r.status_code == 422 and "axis of bending" in r.json()["detail"]
    mismatch = bending_body(section_type="circular hollow section")
    r = client.post(f"{V1}/bending", json=mismatch)
    assert r.status_code == 422 and "do not match" in r.json()["detail"]


def test_bending_inputs_from_outside_annex_b_are_required() -> None:
    for name in ("w_el", "w_pl", "lambda_lt", "gamma_m0", "omega", "section_type"):
        body = bending_body()
        del body[name]
        response = client.post(f"{V1}/bending", json=body)
        assert response.status_code == 422, name
        assert name in response.text, name


def test_bending_has_no_default_for_a_bending_k_sigma() -> None:
    plate = {"label": "a", "width": 100, "thickness": 5}
    body = bending_body(geometry={"kind": "plates", "plates": [plate]})
    response = client.post(f"{V1}/bending", json=body)
    assert response.status_code == 422
    assert "k_sigma" in response.text


def test_bending_contract_equals_service() -> None:
    from stainless_csm.csm.bending import BendingAxis

    plates = (services.PlateForm("web", 138, 4, 8.0), services.PlateForm("flange", 88, 4, 0.43))
    form = services.BendingForm(
        services.DeformationForm(
            services.GeometryForm(kind=services.GeometryKind.PLATES, plates=plates), OMEGA, NU
        ),
        SectionType.I_SECTION,
        BendingAxis.MINOR,
        12_345.0,
        20_000.0,
        GAMMA_M0,
        0.1,
    )
    model = CSMBilinearModel(services.build_material(services.MaterialForm("1.4404", E)))
    outcome = services.run_bending(model, form)
    body = bending_body(
        "1.4404",
        geometry={
            "kind": "plates",
            "plates": [plate_input("web", 138, 4, 8.0), plate_input("flange", 88, 4, 0.43)],
        },
        axis="minor",
        w_el=12_345,
        w_pl=20_000,
        lambda_lt=0.1,
    )
    api = client.post(f"{V1}/bending", json=body).json()
    assert api["resistance"] == outcome.result.resistance
    assert api["strain_ratio"] == outcome.result.strain_ratio
    assert api["formula_label"] == outcome.result.formula.value
    assert api["alpha"] == outcome.result.alpha
    assert api["elastic_moment"] == outcome.result.elastic_moment
    assert api["plastic_moment"] == outcome.result.plastic_moment
    assert api["slenderness"]["value"] == outcome.deformation.slenderness.slenderness
    assert [step["symbol"] for step in api["trace"]] == [s.symbol for s in outcome.trace]
    assert [step["value"] for step in api["trace"]] == [s.value for s in outcome.trace]
    assert all(step["latex"] for step in api["trace"])


@pytest.mark.parametrize("designation", GradeRepository.load_default().designations())
def test_bending_contract_for_every_grade(designation: str) -> None:
    body = bending_body(
        designation,
        section_type="circular hollow section",
        geometry={"kind": "chs", "d": 100, "t": 3},
    )
    del body["axis"]
    api = client.post(f"{V1}/bending", json=body).json()
    model = CSMBilinearModel(services.build_material(services.MaterialForm(designation, E)))
    form = services.BendingForm(
        services.DeformationForm(
            services.GeometryForm(services.GeometryKind.CHS, d=100, t=3), OMEGA, NU
        ),
        SectionType.CHS,
        None,
        194_318.0,
        220_640.0,
        GAMMA_M0,
        0.15,
    )
    outcome = services.run_bending(model, form)
    assert api["resistance"] == outcome.result.resistance
    assert api["strain_ratio"] == outcome.result.strain_ratio


def test_no_emoji_in_the_bending_response() -> None:
    from test_no_emoji import EMOJI

    assert not EMOJI.search(client.post(f"{V1}/bending", json=bending_body()).text)


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
    assert kinds == ["chs", "plates", "sigma_cr", "template"]


# --- section templates (8.2.2(5), Tables 7.2 to 7.4) ---------------------------------------


def i_template(**changes: object) -> dict[str, object]:
    """The rolled I-section of plan.md 4c: c_w = 159.0, c_f = 35.2."""
    geometry: dict[str, object] = {
        "kind": "template",
        "shape": "I-section",
        "fabrication": "rolled",
        "h": 200,
        "b": 100,
        "t_w": 5.6,
        "t_f": 8.5,
        "r": 12,
        "k_sigma": {"web": 4.0, "flange": 0.43},
    }
    geometry.update(changes)
    return geometry


def rhs_template(**changes: object) -> dict[str, object]:
    geometry: dict[str, object] = {
        "kind": "template",
        "shape": "rectangular hollow section",
        "h": 100,
        "b": 50,
        "t": 4,
        "k_sigma": {"web": 4.0, "flange": 4.0},
    }
    geometry.update(changes)
    return geometry


def test_template_b5_reports_c_k_sigma_type_and_source_per_plate() -> None:
    r = client.post(f"{V1}/deformation-capacity", json=deformation_body(**i_template()))
    assert r.status_code == 200
    out = r.json()
    web, flange = out["slenderness"]["plates"]
    assert (web["role"], web["plate_type"], web["width"], web["k_sigma"]) == (
        "web",
        "internal",
        pytest.approx(159.0),
        4.0,
    )
    assert (flange["role"], flange["plate_type"], flange["width"]) == (
        "flange",
        "outstand",
        pytest.approx(35.2),
    )
    assert "Table 7.2" in web["c_source"] and "Table 7.3" in flange["c_source"]
    assert web["governing"] is True and out["slenderness"]["governing_label"] == "web"
    assert out["slenderness"]["value"] == pytest.approx(0.48388, rel=1e-4)
    assert [s["symbol"] for s in out["trace"]][:2] == ["c_w", "c_f"]
    assert out["trace"][0]["clause"] == "8.2.2(5)" and out["trace"][0]["latex"]


def test_manual_plates_carry_no_template_fields() -> None:
    out = client.post(
        f"{V1}/deformation-capacity", json=deformation_body(kind="plates", plates=[plate_input()])
    ).json()
    plate = out["slenderness"]["plates"][0]
    assert plate["role"] is None and plate["plate_type"] is None and plate["c_source"] is None


def test_template_rhs_and_chs() -> None:
    rhs = client.post(f"{V1}/deformation-capacity", json=deformation_body(**rhs_template())).json()
    assert [p["width"] for p in rhs["slenderness"]["plates"]] == [
        pytest.approx(88.0),
        pytest.approx(38.0),
    ]
    assert rhs["strain_limit"]["strain_ratio"] == pytest.approx(8.545, rel=1e-3)
    chs = client.post(
        f"{V1}/deformation-capacity",
        json=deformation_body(kind="template", shape="circular hollow section", d=100, t=3),
    ).json()
    assert chs["family"] == "circular_hollow" and chs["slenderness"]["plates"] == []


@pytest.mark.parametrize(
    ("changes", "words"),
    [
        ({"t_f": 100}, "2 t_f"),
        ({"r": 95}, "c_w"),
        ({"fabrication": None}, "fabrication"),
        ({"r": None}, "r"),
        ({"k_sigma": {"web": 4.0}}, "k_σ of the flange"),
        ({"shape": None}, "section type"),
    ],
)
def test_template_impossible_or_incomplete_geometry_is_a_422(
    changes: dict[str, object], words: str
) -> None:
    r = client.post(f"{V1}/deformation-capacity", json=deformation_body(**i_template(**changes)))
    assert r.status_code == 422
    assert r.json()["error_type"] == "InvalidSectionError"
    assert words in r.json()["detail"]


def test_template_rhs_too_thick_is_a_422() -> None:
    r = client.post(
        f"{V1}/deformation-capacity", json=deformation_body(**rhs_template(t=25))
    )
    assert r.status_code == 422 and "too thick" in r.json()["detail"]


def test_template_is_accepted_by_compression() -> None:
    body = {**deformation_body(**i_template()), "area": 2848, "gamma_m0": GAMMA_M0}
    r = client.post(f"{V1}/compression", json=body)
    assert r.status_code == 200
    out = r.json()
    assert out["formula_label"] == "B.16"
    assert out["slenderness"]["plates"][0]["c_source"].startswith("c as drawn in Table 7.2")
    assert [s["symbol"] for s in out["trace"] if s["symbol"].startswith("c_")] == ["c_w", "c_f"]
    body["geometry"] = i_template(r=95)
    assert client.post(f"{V1}/compression", json=body).status_code == 422


def test_template_contract_b5_equals_service() -> None:
    from stainless_csm.sections.templates import Fabrication, PlateRole

    geometry = services.GeometryForm(
        services.GeometryKind.TEMPLATE,
        shape=SectionType.I_SECTION,
        fabrication=Fabrication.ROLLED,
        h=200, b=100, tw=5.6, tf=8.5, r=12,
        k_sigma={PlateRole.WEB: 4.0, PlateRole.FLANGE: 0.43},
    )  # fmt: skip
    model = CSMBilinearModel(services.build_material(services.MaterialForm("1.4404", E)))
    form = services.DeformationForm(geometry, OMEGA, NU)
    outcome = services.run_deformation_capacity(model, form)
    api = client.post(
        f"{V1}/deformation-capacity", json=deformation_body("1.4404", **i_template())
    ).json()
    assert api["slenderness"]["value"] == outcome.slenderness.slenderness
    assert api["strain_limit"]["strain_ratio"] == outcome.capacity.strain_ratio
    assert [p["width"] for p in api["slenderness"]["plates"]] == [
        p.c for p in outcome.template_plates
    ]
    assert [s["symbol"] for s in api["trace"]] == [s.symbol for s in outcome.trace]
    comp = services.run_compression(model, services.CompressionForm(form, 2848.0, GAMMA_M0))
    body = {**deformation_body("1.4404", **i_template()), "area": 2848, "gamma_m0": GAMMA_M0}
    c_api = client.post(f"{V1}/compression", json=body).json()
    assert c_api["resistance"] == comp.result.resistance
    assert c_api["strain_ratio"] == comp.result.strain_ratio
    assert [s["symbol"] for s in c_api["trace"]] == [s.symbol for s in comp.trace]


def test_template_comparison_contract_and_governing_plate() -> None:
    body = deformation_body(**rhs_template())
    api = client.post(f"{V1}/section-comparison", json=body)
    assert api.status_code == 200
    out = api.json()
    assert len(out["points"]) > 50
    assert all(p["governing_label"] in {"web", "flange"} for p in out["points"])
    from stainless_csm.sections.templates import PlateRole

    geometry = services.GeometryForm(
        services.GeometryKind.TEMPLATE,
        shape=SectionType.RHS,
        h=100, b=50, t=4,
        k_sigma={PlateRole.WEB: 4.0, PlateRole.FLANGE: 4.0},
    )  # fmt: skip
    model = CSMBilinearModel(services.build_material(services.MaterialForm("1.4307", E)))
    comparison = services.run_comparison(model, services.DeformationForm(geometry, OMEGA, NU))
    assert [p["factor"] for p in out["points"]] == [p.factor for p in comparison.points]
    assert [p["slenderness"] for p in out["points"]] == [p.slenderness for p in comparison.points]


def test_template_comparison_impossible_geometry_is_a_422() -> None:
    body = deformation_body(**rhs_template(t=25))
    assert client.post(f"{V1}/section-comparison", json=body).status_code == 422


def test_there_are_no_template_presets_or_hidden_k_sigma() -> None:
    schemas = client.get("/openapi.json").json()["components"]["schemas"]
    geometry = schemas["GeometryInput"]["properties"]
    for key in ("h", "b", "t_w", "t_f", "r", "s", "c_stem", "fabrication", "shape", "k_sigma"):
        assert "default" not in geometry[key] or geometry[key]["default"] is None
    # no k_sigma default for any role
    assert all(
        prop.get("default") is None for prop in schemas["KSigmaInput"]["properties"].values()
    )


# --- section properties (plan.md 4d): reference values from the template dimensions -------------


def properties_body(**changes: object) -> dict[str, object]:
    """The rolled I-section of plan.md 4d."""
    body: dict[str, object] = {
        "shape": "I-section",
        "fabrication": "rolled",
        "h": 200,
        "b": 100,
        "t_w": 5.6,
        "t_f": 8.5,
        "r": 12,
    }
    body.update(changes)
    return body


def test_section_properties_of_the_rolled_i_section() -> None:
    r = client.post(f"{V1}/section-properties", json=properties_body())
    assert r.status_code == 200
    out = r.json()
    assert out["area"] == pytest.approx(2848.0, rel=0.005)
    assert out["i_y"] == pytest.approx(1943e4, rel=0.005)
    assert out["w_el_y"]["value"] == pytest.approx(194.3e3, rel=0.005)
    assert out["w_pl_y"] == pytest.approx(220.6e3, rel=0.005)
    assert out["centroid"] == {"y": pytest.approx(50.0), "z": pytest.approx(100.0)}
    assert out["principal"] is None
    assert out["label"] == "computed from your dimensions: geometry, not a rule of EN 1993-1-4"
    assert out["shear_centre"]["label"] == "thin-walled approximation"
    rows = {row["key"]: row for row in out["rows"]}
    assert rows["A"]["value"] == pytest.approx(2848.42, rel=1e-6) and rows["A"]["unit"] == "mm²"
    assert rows["W_pl_y"]["unit"] == "mm³" and rows["I_y"]["unit"] == "mm⁴"
    assert "thin-walled approximation" in rows["y_s"]["note"]
    assert "W_el_y_top" not in rows  # the two sides are equal for an I-section


def test_section_properties_of_an_angle_report_the_principal_axes() -> None:
    body = {"shape": "angle", "h": 100, "b": 75, "t": 8, "r": 0}
    out = client.post(f"{V1}/section-properties", json=body).json()
    assert out["area"] == pytest.approx(1336.0)
    assert out["principal"]["i_u"] > out["principal"]["i_v"]
    assert 0 < out["principal"]["angle_deg"] < 45
    keys = [row["key"] for row in out["rows"]]
    assert {"theta_u", "I_u", "I_v", "I_yz"} <= set(keys)
    assert {"W_el_y_top", "W_el_y_bottom", "W_el_z_left", "W_el_z_right"} <= set(keys)
    rows = {row["key"]: row for row in out["rows"]}
    assert "smaller" in rows["W_el_y"]["note"]


def test_section_properties_of_the_other_shapes() -> None:
    rhs = {"shape": "rectangular hollow section", "h": 100, "b": 50, "t": 4, "r_o": 0}
    out = client.post(f"{V1}/section-properties", json=rhs).json()
    assert out["area"] == pytest.approx(1136.0) and out["w_pl_y"] == pytest.approx(36128.0)
    chs = {"shape": "circular hollow section", "d": 100, "t": 5}
    out = client.post(f"{V1}/section-properties", json=chs).json()
    assert out["area"] == pytest.approx(1492.26, rel=1e-4)
    t = properties_body(shape="T-section", h=100, b=100, t_w=6, t_f=8, r=0)  # no c_stem needed
    assert client.post(f"{V1}/section-properties", json=t).status_code == 200
    channel = properties_body(shape="channel", h=200, b=75, t_w=8.5, t_f=11.5, r=11.5)
    out = client.post(f"{V1}/section-properties", json=channel).json()
    assert out["shear_centre"]["point"]["y"] < 0  # outside the web, away from the flanges


@pytest.mark.parametrize(
    ("body", "words"),
    [
        (properties_body(t_f=100), "2 t_f"),
        (properties_body(r=95), "c_w"),
        (properties_body(r=None), "please give r"),
        (properties_body(fabrication=None), "fabrication"),
        (properties_body(h=None), "h"),
        ({"shape": "rectangular hollow section", "h": 100, "b": 50, "t": 4}, "r_o"),
        ({"shape": "rectangular hollow section", "h": 100, "b": 50, "t": 4, "r_o": 30}, "r_o"),
        ({"shape": "rectangular hollow section", "h": 100, "b": 50, "t": 25, "r_o": 0}, "thick"),
        ({"shape": "angle", "h": 100, "b": 75, "t": 8}, "root radius"),
        ({"shape": "angle", "h": 100, "b": 75, "t": 8, "r": 70}, "root radius"),
        ({"shape": "circular hollow section", "d": 100, "t": 50}, "half the diameter"),
    ],
)
def test_section_properties_impossible_or_incomplete_geometry_is_a_422(
    body: dict[str, object], words: str
) -> None:
    r = client.post(f"{V1}/section-properties", json=body)
    assert r.status_code == 422
    assert r.json()["error_type"] == "InvalidSectionError"
    assert words in r.json()["detail"]


def test_section_properties_need_a_shape() -> None:
    assert client.post(f"{V1}/section-properties", json={"h": 100}).status_code == 422


def test_section_properties_contract_service_equals_api() -> None:
    from stainless_csm.sections.templates import Fabrication

    geometry = services.GeometryForm(
        services.GeometryKind.TEMPLATE,
        shape=SectionType.I_SECTION,
        fabrication=Fabrication.ROLLED,
        h=200, b=100, tw=5.6, tf=8.5, r=12,
    )  # fmt: skip
    p = services.run_section_properties(geometry)
    api = client.post(f"{V1}/section-properties", json=properties_body()).json()
    assert api["area"] == p.area
    assert (api["centroid"]["y"], api["centroid"]["z"]) == (p.y_c, p.z_c)
    assert (api["i_y"], api["i_z"], api["i_yz"]) == (p.i_y, p.i_z, p.i_yz)
    assert api["w_el_y"]["value"] == p.w_el_y and api["w_el_z"]["value"] == p.w_el_z
    assert (api["w_pl_y"], api["w_pl_z"]) == (p.w_pl_y, p.w_pl_z)
    assert (api["plastic_axis_y"], api["plastic_axis_z"]) == (p.plastic_axis_y, p.plastic_axis_z)
    assert (api["shear_centre"]["point"]["y"], api["shear_centre"]["point"]["z"]) == (
        p.shear_centre_y,
        p.shear_centre_z,
    )
    rows = {row["key"]: row["value"] for row in api["rows"]}
    assert rows["A"] == float(f"{p.area:.6g}") and rows["W_pl_y"] == float(f"{p.w_pl_y:.6g}")
    assert rows["I_y"] == float(f"{p.i_y:.6g}")


def test_section_properties_contract_for_an_angle() -> None:
    geometry = services.GeometryForm(
        services.GeometryKind.TEMPLATE, shape=SectionType.ANGLE, h=100, b=75, t=8, r=10
    )
    p = services.run_section_properties(geometry)
    api = client.post(
        f"{V1}/section-properties", json={"shape": "angle", "h": 100, "b": 75, "t": 8, "r": 10}
    ).json()
    assert p.principal is not None
    assert api["principal"] == {
        "angle_deg": p.principal.angle_deg,
        "i_u": p.principal.i_u,
        "i_v": p.principal.i_v,
    }
    assert api["area"] == p.area


def test_every_property_row_symbol_is_in_the_glossary() -> None:
    from stainless_csm.symbols import load_symbols

    known = {entry.symbol for entry in load_symbols()}
    bodies = [
        properties_body(shape="T-section", h=100, b=100, t_w=6, t_f=8, r=0),
        {"shape": "angle", "h": 100, "b": 75, "t": 8, "r": 0},
        properties_body(shape="channel", h=200, b=75, t_w=8.5, t_f=11.5, r=11.5),
    ]
    for body in bodies:
        rows = client.post(f"{V1}/section-properties", json=body).json()["rows"]
        assert {row["symbol"] for row in rows} <= known


def test_section_properties_do_not_feed_any_calculation_on_their_own() -> None:
    # B.5 and B.6.2 take A, c and k_sigma from their own request fields: the properties endpoint
    # is a separate reference, and r_o has no default
    schemas = client.get("/openapi.json").json()["components"]["schemas"]
    request = schemas["SectionPropertiesRequest"]["properties"]
    for key in ("r", "r_o", "h", "b", "t", "d", "s"):
        assert request[key].get("default") is None
    assert "r_o" in schemas["GeometryInput"]["properties"]
