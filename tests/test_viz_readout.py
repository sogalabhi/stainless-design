"""The `readout` of every figure and the `meta` of every trace (plan.md 4h: every number names
its source).

`readout.tables` hold the numbers the browser lists under "Show values" and writes to CSV: the
very arrays the traces were drawn from, never recomputed. `trace.meta` gives the pin card its
labels, units and source. `readout.axes` names the quantity of each axis, for linked charts.
"""

from typing import Any

import pytest

from test_api import material
from test_viz_hover import FIGURES, _post

UNIFIED = {
    "material true_scale",
    "compression capacity schematic",
    "compression capacity true_scale",
    "compression point true_scale",
    "deformation",
    "deformation not allowed",
    "bending moment",
    "comparison base curve",
    "comparison stress",
}
CLOSEST = {
    "material schematic",
    "compression point schematic",
    "tension",  # the tension body asks for the schematic view
    "bending blocks",
}


def _traces_with_meta(figure: dict[str, Any]) -> list[dict[str, Any]]:
    return [t for t in figure["data"] if "meta" in t]


def _table(figure: dict[str, Any], title: str) -> dict[str, Any]:
    found: list[dict[str, Any]] = [t for t in figure["readout"]["tables"] if t["title"] == title]
    (table,) = found
    return table


def test_every_figure_is_classified() -> None:
    assert set(FIGURES) == UNIFIED | CLOSEST
    assert not UNIFIED & CLOSEST


@pytest.mark.parametrize("name", sorted(UNIFIED))
def test_curve_charts_hover_unified_with_a_titled_header(name: str) -> None:
    layout = FIGURES[name]["layout"]
    assert layout["hovermode"] == "x unified"
    assert "%{x" in layout["xaxis"]["unifiedhovertitle"]["text"]


@pytest.mark.parametrize("name", sorted(CLOSEST))
def test_schematic_and_block_charts_hover_point_by_point(name: str) -> None:
    assert FIGURES[name]["layout"]["hovermode"] == "closest"


@pytest.mark.parametrize("name", sorted(FIGURES))
def test_a_thin_dotted_x_spike_and_no_plotly_y_spike(name: str) -> None:
    layout = FIGURES[name]["layout"]
    for key, axis in layout.items():
        if key.startswith("xaxis"):
            assert axis["showspikes"] is True and axis["spikedash"] == "dot", (name, key)
            assert axis["spikethickness"] == 1
        if key.startswith("yaxis"):
            # the browser draws the y guide next to its y value tag
            assert axis["showspikes"] is False, (name, key)


@pytest.mark.parametrize("name", sorted(FIGURES))
def test_readout_tables_are_well_formed_and_sourced(name: str) -> None:
    readout = FIGURES[name]["readout"]
    assert readout["title"]
    assert {"x", "y"} <= set(readout["axes"])
    assert readout["tables"]
    for table in readout["tables"]:
        assert table["title"] and table["source"], table["title"]
        assert table["source_kind"] in {"Code", "Textbook", "Paper", "Input", "Derived"}
        assert table["rows"], table["title"]
        for column in table["columns"]:
            assert set(column) == {"label", "unit"}
            assert "N/mm2" not in column["unit"]
        for row in table["rows"]:
            assert len(row) == len(table["columns"])
            assert all(isinstance(value, float) for value in row), table["title"]


@pytest.mark.parametrize("name", sorted(FIGURES))
def test_every_hovering_trace_has_meta_for_the_pin_card(name: str) -> None:
    for trace in FIGURES[name]["data"]:
        if trace.get("hoverinfo") == "skip":
            continue
        meta = trace["meta"]
        assert meta["series"] and meta["source"], trace.get("name")
        assert meta["role"] in {"curve", "unused", "reference", "point"}
        assert meta["value"] in {"xy", "x", "y"}
        for axis in ("x", "y"):
            assert set(meta[axis]) == {"label", "unit"}
        # plain text: the card never parses hover HTML
        assert "<sub>" not in meta["series"] + meta["x"]["label"] + meta["y"]["label"]


@pytest.mark.parametrize("name", sorted(FIGURES))
def test_curve_tables_are_the_arrays_the_traces_were_drawn_from(name: str) -> None:
    figure = FIGURES[name]
    checked = 0
    for trace in _traces_with_meta(figure):
        meta = trace["meta"]
        if meta["role"] not in {"curve", "unused"}:
            continue
        table = _table(figure, meta["series"])
        xs = meta.get("x_values", trace["x"])
        if name == "bending blocks":
            # the block polygon closes through (0, -1) and (0, 1); the table lists its corners
            expected = [[y, x] for x, y in zip(xs[1:-1], trace["y"][1:-1], strict=True)]
        else:
            expected = [[x, y] for x, y in zip(xs, trace["y"], strict=True)]
        assert [row[:2] for row in table["rows"]] == expected, (name, meta["series"])
        checked += 1
    assert checked


def test_schematic_tables_give_the_true_strain_not_the_mapped_x() -> None:
    figure = FIGURES["material schematic"]
    (curve,) = [t for t in _traces_with_meta(figure) if t["meta"]["series"] == "CSM bilinear (B.4)"]
    table = _table(figure, "CSM bilinear (B.4)")
    strains = [row[0] for row in table["rows"]]
    assert strains == curve["meta"]["x_values"]
    assert strains == [pair[0] for pair in curve["customdata"]]
    assert strains != curve["x"]  # the plotted x is the evenly spaced map
    assert max(curve["x"]) == pytest.approx(3.0)  # 0, ε_y, C₁ε_u, C₂ε_u at 0, 1, 2, 3
    true_scale = _table(FIGURES["material true_scale"], "CSM bilinear (B.4)")
    assert strains == [row[0] for row in true_scale["rows"]]


def test_both_material_curves_share_one_strain_grid() -> None:
    figure = FIGURES["material true_scale"]
    classic = _table(figure, "Elastic-perfectly plastic (classic)")
    csm = _table(figure, "CSM bilinear (B.4)")
    assert [row[0] for row in classic["rows"]] == [row[0] for row in csm["rows"]]


@pytest.mark.parametrize(
    "name", ["bending moment", "compression capacity true_scale", "deformation"]
)
def test_level_lines_hover_on_the_curve_grid(name: str) -> None:
    """In the unified box a level line shows at the very x of the curve, all along it."""
    figure = FIGURES[name]
    curve_xs = {
        x for t in _traces_with_meta(figure) if t["meta"]["role"] == "curve" for x in t["x"]
    }
    levels = [t for t in _traces_with_meta(figure) if t["meta"]["value"] == "y"]
    assert levels
    for trace in levels:
        assert curve_xs <= set(trace["x"]), trace["name"]
        assert min(trace["x"]) == 0
        assert max(trace["x"]) == pytest.approx(figure["layout"]["xaxis"]["range"][1])


def test_reference_values_are_one_row_tables() -> None:
    moment = FIGURES["bending moment"]
    elastic = _table(moment, "Elastic moment M_el = W_el f_y / γ_M0")
    (trace,) = [t for t in moment["data"] if t.get("name") == "Elastic moment"]
    assert elastic["rows"] == [[trace["y"][0]]]
    assert elastic["columns"] == [{"label": "M_el", "unit": "kN m"}]
    assert "8.2.4(1)" in elastic["source"]
    cap = _table(moment, "Strain cap")
    (cap_line,) = [t for t in moment["data"] if t.get("name") == "Strain cap"]
    assert cap["rows"] == [[cap_line["x"][0]]] and cap_line["meta"]["value"] == "x"
    yours = _table(moment, "Your section")
    (point,) = [t for t in moment["data"] if t.get("name") == "Your section"]
    assert yours["rows"] == [[point["x"][0], point["y"][0]]]


def test_moment_meta_names_the_formula_alpha_and_units() -> None:
    moment = FIGURES["bending moment"]
    (b20,) = [t for t in moment["data"] if t["meta"]["series"].startswith("Formula B.20")]
    assert b20["meta"]["y"] == {"label": "M_csm,c,Rd", "unit": "kN m"}
    assert b20["meta"]["x"] == {"label": "ε_csm / ε_y", "unit": ""}
    assert "B.20" in b20["meta"]["source"] and "Table B.2" in b20["meta"]["source"]
    assert b20["meta"]["source"].startswith("EN 1993-1-4:2025")


def test_blocks_name_the_textbook_and_each_subplot_axis() -> None:
    blocks = FIGURES["bending blocks"]
    axes = blocks["readout"]["axes"]
    assert axes["x"]["label"] == "ε / ε_y" and axes["x2"]["unit"] == "N/mm²"
    assert all(axes[key]["quantity"] is None for key in axes)  # illustrative: not linked
    strain = _table(blocks, "Strain")
    assert strain["source_kind"] == "Textbook" and "Gere" in strain["source"]


def test_link_declarations() -> None:
    def axes(name: str) -> dict[str, Any]:
        result: dict[str, Any] = FIGURES[name]["readout"]["axes"]
        return result

    assert axes("deformation")["x"]["quantity"] == "lambda_p"
    assert axes("deformation")["y"]["quantity"] == "strain_ratio"
    assert axes("comparison base curve")["x"]["quantity"] == "lambda_c"  # a CHS
    assert axes("compression capacity true_scale")["x"]["quantity"] == "lambda_p"
    assert axes("compression capacity true_scale")["y"]["quantity"] is None
    assert axes("bending moment")["x"]["quantity"] == "strain_ratio"
    for name in ("material true_scale", "compression point true_scale", "comparison stress"):
        assert axes(name)["x"]["quantity"] == "strain"
        assert axes(name)["x"]["schematic"] is False
    # a schematic axis is a non-linear map: no x tag, no link marker, no strain_ratio scale
    for name in ("material schematic", "compression point schematic", "tension"):
        assert axes(name)["x"]["schematic"] is True and axes(name)["x"]["also"] == []
    assert "<sub>" in axes("deformation")["x"]["html"]


def test_the_strain_axis_places_strain_ratios_with_the_server_eps_y() -> None:
    eps_y = _post("material-model", {"material": material(), "graph_view": "true_scale"})["values"][
        "yield_strain"
    ]
    (also,) = FIGURES["material true_scale"]["readout"]["axes"]["x"]["also"]
    assert also["quantity"] == "strain_ratio"
    assert also["factor"] == pytest.approx(eps_y, rel=1e-12)


def test_only_the_curves_carry_role_curve() -> None:
    roles = {
        t["meta"]["series"]: t["meta"]["role"] for t in _traces_with_meta(FIGURES["deformation"])
    }
    assert roles["Base curve (B.6) held to the cap"] == "curve"
    assert roles["Strain cap"] == "reference"
    assert roles["Your section"] == "point"
    assert roles.get("Formula before the cap", "unused") == "unused"
