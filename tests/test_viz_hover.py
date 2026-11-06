"""Hover text on every chart gives each value its unit and its source (plan.md 4h).

Reference lines (the cap, M_el, M_pl, the tension strain limits) stay layout shapes, and an
invisible row of points along each one carries the hover text.
"""

import json
import re
from typing import Any

import pytest
from fastapi.testclient import TestClient

from helpers import NU, OMEGA
from stainless_csm.api.main import create_app
from test_api import (
    V1,
    bending_body,
    compression_body,
    deformation_body,
    material,
    plate_input,
    tension_body,
)

client = TestClient(create_app())

# A clause of EN 1993-1-4 (B.x, Table B.x, 8.2.4), another EN part, a typed input, or the textbook.
SOURCE = re.compile(r"B\.\d|Table B\.|8\.2\.4|EN 1993|\(input\)|Gere")


def _post(path: str, body: dict[str, object]) -> dict[str, Any]:
    response = client.post(f"{V1}/{path}", json=body)
    assert response.status_code == 200, response.text
    out: dict[str, Any] = response.json()
    return out


def _all_figures() -> dict[str, dict[str, Any]]:
    figures: dict[str, dict[str, Any]] = {}
    for view in ("schematic", "true_scale"):
        figures[f"material {view}"] = _post(
            "material-model", {"material": material(), "graph_view": view}
        )["figure"]
        out = _post("compression", compression_body(graph_view=view))
        figures[f"compression capacity {view}"] = out["capacity_figure"]
        figures[f"compression point {view}"] = out["point_figure"]
    figures["tension"] = _post("tension", tension_body())["figure"]
    figures["deformation"] = _post(
        "deformation-capacity", deformation_body(kind="plates", plates=[plate_input()])
    )["figure"]
    figures["deformation not allowed"] = _post(
        "deformation-capacity",
        deformation_body(kind="plates", plates=[plate_input("thin", 400, 2)]),
    )["figure"]
    out = _post("bending", bending_body())
    figures["bending moment"] = out["moment_figure"]
    figures["bending blocks"] = out["blocks_figure"]
    out = _post(
        "section-comparison",
        {
            "material": {"designation": "1.4307", "elastic_modulus": 200_000},
            "geometry": {"kind": "chs", "d": 100, "t": 3},
            "omega": OMEGA,
            "poisson_ratio": NU,
        },
    )
    figures["comparison base curve"] = out["base_curve_figure"]
    figures["comparison stress"] = out["stress_figure"]
    return figures


FIGURES = _all_figures()


@pytest.mark.parametrize("name", sorted(FIGURES))
def test_every_trace_hovers_except_shaded_bands(name: str) -> None:
    for trace in FIGURES[name]["data"]:
        if trace.get("hoverinfo") == "skip":
            assert trace.get("fill") == "toself", (name, trace.get("name"))
            continue
        assert "hovertemplate" in trace, (name, trace.get("name"))


@pytest.mark.parametrize("name", sorted(FIGURES))
def test_every_hover_names_its_source(name: str) -> None:
    for trace in FIGURES[name]["data"]:
        template = trace.get("hovertemplate")
        if template is not None:
            assert SOURCE.search(template), (name, trace.get("name"), template)


@pytest.mark.parametrize("name", sorted(FIGURES))
def test_units_use_the_display_symbols(name: str) -> None:
    text = json.dumps(FIGURES[name], ensure_ascii=False)
    assert "N/mm2" not in text
    for trace in FIGURES[name]["data"]:
        template = trace.get("hovertemplate", "")
        if "stress σ" in template or "f<sub>csm" in template:
            assert "N/mm²" in template, (name, trace.get("name"))
        if "M<sub>" in template:
            assert "kN m" in template, (name, trace.get("name"))


def _named(figure: dict[str, Any], name: str) -> dict[str, Any]:
    found: list[dict[str, Any]] = [t for t in figure["data"] if t.get("name") == name]
    (trace,) = found
    return trace


def test_moment_reference_lines_hover_with_their_values_and_clauses() -> None:
    moment = FIGURES["bending moment"]
    levels = sorted(
        s["y0"] for s in moment["layout"]["shapes"] if s["x0"] == 0 and s["y0"] == s["y1"]
    )
    elastic, plastic = _named(moment, "Elastic moment"), _named(moment, "Plastic moment")
    for trace, level, clause in ((elastic, levels[-2], "B.19"), (plastic, levels[-1], "B.20")):
        assert all(y == pytest.approx(level) for y in trace["y"])
        assert f"{level:.2f} kN m" in trace["hovertemplate"]
        assert clause in trace["hovertemplate"] and "8.2.4(1)" in trace["hovertemplate"]
        # invisible and out of the legend: the shape draws the line, these points only hover
        assert trace["marker"]["color"] == "rgba(0,0,0,0)"
        assert trace["showlegend"] is False
    cap = _named(moment, "Strain cap")
    assert len(set(cap["x"])) == 1 and "cap" in cap["hovertemplate"]


def test_curves_name_the_formula_that_draws_them() -> None:
    moment = FIGURES["bending moment"]
    for fragment in ("B.19", "B.20"):
        (branch,) = [t for t in moment["data"] if f"Formula {fragment}" in str(t.get("name"))]
        assert f"({fragment}, α = " in branch["hovertemplate"]
    capacity = FIGURES["compression capacity true_scale"]
    (b16,) = [t for t in capacity["data"] if "Formula B.16" in str(t.get("name"))]
    assert "(B.16, B.17)" in b16["hovertemplate"]
    yours = _named(capacity, "Your section")
    assert "hoverinfo" not in yours and "B.8" in yours["hovertemplate"]


def test_cap_lines_hover_on_the_base_and_capacity_charts() -> None:
    for name in ("deformation", "compression capacity true_scale"):
        cap = _named(FIGURES[name], "Strain cap")
        assert len(set(cap["y"])) == 1
        assert "set by" in cap["hovertemplate"]
