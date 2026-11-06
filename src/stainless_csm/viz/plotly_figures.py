"""Plotly figures as plain JSON-ready dicts. The web front end draws them with Plotly.js.

Two views of the same curve: schematic (key strains spaced evenly, like Figure B.1) and true
scale. Labels use HTML subscripts, which Plotly renders natively.
"""

import json
import re
from typing import Any

import plotly.graph_objects as go
from plotly.subplots import make_subplots

from stainless_csm.config.national_annex import TENSION_STRAIN_RATIO_CAP
from stainless_csm.csm.bending import BendingResult, moment_at
from stainless_csm.csm.compression import CompressionFormula, CompressionResult, capacity_ratio
from stainless_csm.csm.deformation_capacity import (
    LIMITS,
    DeformationResult,
    SectionFamily,
    curve_points,
    raw_ratio,
)
from stainless_csm.csm.tension import GoverningStrainLimit, TensionResult
from stainless_csm.material_models.csm_bilinear import CSMBilinearModel
from stainless_csm.material_models.elastic_plastic import ElasticPerfectlyPlasticModel
from stainless_csm.services import Comparison
from stainless_csm.viz.axis import StrainAxis
from stainless_csm.viz.palette import BLUE, CRITICAL, MUTED, ORANGE

BLUE_FILL = "rgba(42, 120, 214, 0.20)"
GRID = "rgba(137, 135, 129, 0.25)"
_SYMBOL_RUN = re.compile(r"[A-Za-zεσ₁₂₃0-9,_]+")


def typeset_html(text: str) -> str:
    """Symbols such as ε_csm,t become ε<sub>csm,t</sub> so Plotly shows real subscripts."""

    def convert(match: re.Match[str]) -> str:
        run, trailing = match.group(0), ""
        while run.endswith(","):
            run, trailing = run[:-1], trailing + ","
        if "_" not in run:
            return match.group(0)
        head, _, sub = run.partition("_")
        return f"{head}<sub>{sub}</sub>{trailing}"

    return _SYMBOL_RUN.sub(convert, text)


def _to_dict(fig: go.Figure) -> dict[str, Any]:
    result: dict[str, Any] = json.loads(fig.to_json())
    return result


# Hover text names the unit and the clause (or other source) of every value, per plan.md 4h.
STRESS = "N/mm²"
CODE = "EN 1993-1-4:2025"

# A thin dotted crosshair along x. The browser draws the matching y guide itself, next to the y
# value tag, because in "x unified" mode Plotly snaps its y spike to any one of the series.
X_SPIKE: dict[str, Any] = {
    "showspikes": True,
    "spikemode": "across",
    "spikesnap": "hovered data",
    "spikedash": "dot",
    "spikethickness": 1,
}
NO_Y_SPIKE: dict[str, Any] = {"showspikes": False}

# What one table, one trace meta and one axis declaration look like (see `readout` below).
Column = dict[str, str]


def _col(label: str, unit: str = "") -> Column:
    """A column (or axis) heading in plain text with underscores for subscripts, and its unit."""
    return {"label": label, "unit": unit}


def _meta(
    series: str,
    source: str,
    x: Column,
    y: Column,
    role: str = "curve",
    value: str = "xy",
    x_values: list[float] | None = None,
    kind: str = "Code",
) -> dict[str, Any]:
    """`trace.meta`: what the browser's pin card needs, so it never parses hover HTML.

    role: "curve" (a computed line the links read), "unused" (drawn for comparison only),
    "reference" (a level or limit line) or "point" (one marked value).
    value: which coordinates mean something: "xy", or "x" for a vertical line, "y" for a
    horizontal one.
    x_values: the true x of every point when the plotted x is a mapped (schematic) coordinate.
    kind: the source kind of plan.md 4h (Code, Textbook, Paper, Input, Derived).
    """
    meta: dict[str, Any] = {
        "series": series,
        "source": source,
        "source_kind": kind,
        "role": role,
        "value": value,
        "x": x,
        "y": y,
    }
    if x_values is not None:
        meta["x_values"] = x_values
    return meta


def _table(
    title: str, source: str, columns: list[Column], rows: list[list[float]], kind: str = "Code"
) -> dict[str, Any]:
    """One series of `readout.tables`. The rows are the very numbers the trace was drawn from."""
    return {
        "title": title,
        "source": source,
        "source_kind": kind,
        "columns": columns,
        "rows": rows,
    }


def _axis(
    column: Column,
    html: str,
    quantity: str | None = None,
    schematic: bool = False,
    also: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """What an axis shows. `quantity` names it for linked charts (lambda_p, lambda_c,
    strain_ratio, strain). A schematic axis is a non-linear map: no x value tag, no link marker.
    `also` lists other quantities the axis can place, as x = factor * value with a factor the
    server gives (for example strain_ratio on a strain axis, with factor ε_y)."""
    return {
        **column,
        "html": html,
        "quantity": quantity,
        "schematic": schematic,
        "also": also or [],
    }


def _readout(title: str, axes: dict[str, Any], tables: list[dict[str, Any]]) -> dict[str, Any]:
    """The top-level `readout` key of a figure: its short title, what each axis shows (keyed by
    the Plotly axis id: x, y, x2, ...), and the numbers of every series."""
    return {"title": title, "axes": axes, "tables": tables}


def _rows(*columns: list[float]) -> list[list[float]]:
    return [list(row) for row in zip(*columns, strict=True)]


def _hover_line(
    x: list[float], y: list[float], text: str, name: str, colour: str, meta: dict[str, Any]
) -> go.Scatter:
    """Invisible points along a reference line, so hovering the line says what it is.

    The line itself stays a layout shape; these points only carry the hover text.
    """
    return go.Scatter(
        x=x,
        y=y,
        mode="markers",
        marker={"color": "rgba(0,0,0,0)", "size": 10},
        name=name,
        showlegend=False,
        hoverlabel={"bgcolor": colour},
        hovertemplate=text + "<extra></extra>",
        meta=meta,
    )


def _horizontal(
    xs: list[float], y: float, text: str, name: str, colour: str, meta: dict[str, Any]
) -> go.Scatter:
    """`xs` is the curve's own x grid (see `_grid`), so in "x unified" hover the line shows at
    the same x as the curve, everywhere along it."""
    return _hover_line(xs, [y] * len(xs), text, name, colour, meta)


VERTICAL_POINTS = 40


def _vertical(
    x: float, y0: float, y1: float, text: str, name: str, colour: str, meta: dict[str, Any]
) -> go.Scatter:
    ys = _frange(y0, y1, VERTICAL_POINTS)
    return _hover_line([x] * len(ys), ys, text, name, colour, meta)


def _grid(curve_xs: list[float], x0: float, x1: float) -> list[float]:
    """The curve's x values, carried on with the same step down to x0 and up to x1, so a
    reference line drawn from x0 to x1 hovers at every x where the curve does, and beyond it."""
    xs = sorted(set(curve_xs))
    step = (xs[-1] - xs[0]) / max(len(xs) - 1, 1) or (x1 - x0) / 100
    before: list[float] = []
    value = xs[0] - step
    while value > x0:
        before.append(value)
        value -= step
    after: list[float] = []
    value = xs[-1] + step
    while value < x1:
        after.append(value)
        value += step
    grid = [x0, *reversed(before), *xs, *after, x1]
    return sorted(set(grid))


def _spiked(axis: dict[str, Any]) -> dict[str, Any]:
    return {**axis, **X_SPIKE}


def stress_strain_figure(
    model: CSMBilinearModel,
    schematic: bool,
    tension: TensionResult | None = None,
    compression: CompressionResult | None = None,
) -> dict[str, Any]:
    """The B.4 curve against the classic elastic-plastic one; adds the B.6.1 point if given, or
    the B.6.2 compression point (ε_csm, f_csm) if that is given.

    Hover: "x unified" in true scale (one box lists every series at the strain under the
    cursor). The schematic axis is a non-linear map of strain, so a unified header would show a
    meaningless x: it hovers point by point ("closest"), and the true strain is in the hover
    text, in `meta.x_values` and in the tables.
    """
    fy, fu = model.material.fy, model.material.fu
    eps_y, eps_c1, eps_end = model.yield_strain, model.strain_limit_c1, model.strain_end

    labelled = [(0.0, "0"), (eps_y, "ε_y"), (eps_c1, "C₁ε_u"), (eps_end, "C₂ε_u")]
    cap_15 = TENSION_STRAIN_RATIO_CAP * eps_y
    if tension is not None:
        labelled.append((tension.strain, "ε_csm,t"))
        if cap_15 <= eps_end:
            labelled.append((cap_15, "15ε_y"))
    compression_strain = None
    if compression is not None:
        compression_strain = compression.strain_ratio * eps_y
        labelled.append((compression_strain, "ε_csm"))
    axis = StrainAxis.build(labelled, schematic)
    x = axis.x

    strain_col, stress_col = _col("ε"), _col("σ", STRESS)

    def meta(
        series: str,
        source: str,
        strains: list[float],
        role: str = "curve",
        value: str = "xy",
        y: Column = stress_col,
        kind: str = "Code",
    ) -> dict[str, Any]:
        return _meta(
            series,
            source,
            strain_col,
            y,
            role,
            value,
            x_values=strains if schematic else None,
            kind=kind,
        )

    fig = go.Figure()
    shapes: list[dict[str, Any]] = []
    annotations: list[dict[str, Any]] = []
    tables: list[dict[str, Any]] = []

    if tension is not None:
        end_strain, end_stress = tension.strain, tension.design_stress
        band: str | None = "Extra strength used in tension"
    elif compression is not None and compression_strain is not None:
        # Below ε_y there is no hardening to use (B.17 is not used), so no band is drawn.
        end_strain = compression_strain
        end_stress = compression.design_stress if compression.design_stress is not None else fy
        band = (
            "Extra strength used in compression"
            if compression.formula is CompressionFormula.B16
            else None
        )
    else:
        end_strain, end_stress, band = eps_end, fu, "Extra strength from strain hardening"
    if band is not None:
        fig.add_trace(
            go.Scatter(
                x=[x(eps_y), x(end_strain), x(end_strain)],
                y=[fy, end_stress, fy],
                mode="lines",
                fill="toself",
                line={"width": 0},
                fillcolor=BLUE_FILL,
                name=band,
                hoverinfo="skip",
            )
        )

    curve = model.curve_points(120)
    strains = [e for e, _ in curve]
    # the classic curve on the same strains as the B.4 curve, so both show at one strain
    classic_model = ElasticPerfectlyPlasticModel(model.material, eps_end)
    classic_stresses = [classic_model.stress_at(e) for e in strains]
    classic_source = "EN 1993-1-1:2022, Figure 7.9 (elastic-perfectly plastic)"
    fig.add_trace(
        go.Scatter(
            x=[x(e) for e in strains],
            y=classic_stresses,
            mode="lines",
            line={"color": MUTED, "width": 2, "dash": "dash"},
            name="Elastic-perfectly plastic (classic)",
            customdata=_rows(strains, classic_stresses),
            hovertemplate="strain ε = %{customdata[0]:.5f}<br>"
            f"stress σ = %{{customdata[1]:.1f}} {STRESS}<br>"
            "elastic-perfectly plastic (EN 1993-1-1:2022, Figure 7.9)<extra></extra>",
            meta=meta("Elastic-perfectly plastic (classic)", classic_source, strains),
        )
    )
    tables.append(
        _table(
            "Elastic-perfectly plastic (classic)",
            classic_source,
            [strain_col, stress_col],
            _rows(strains, classic_stresses),
        )
    )
    stresses = [s for _, s in curve]
    csm_source = f"{CODE}, B.4 (CSM bilinear model, Formulae B.4 and B.5, Table B.1)"
    fig.add_trace(
        go.Scatter(
            x=[x(e) for e in strains],
            y=stresses,
            mode="lines",
            line={"color": BLUE, "width": 2.5},
            name="CSM bilinear (B.4)",
            customdata=_rows(strains, stresses),
            hovertemplate="strain ε = %{customdata[0]:.5f}<br>"
            f"stress σ = %{{customdata[1]:.1f}} {STRESS}<br>"
            "CSM bilinear model (B.4)<extra></extra>",
            meta=meta("CSM bilinear (B.4)", csm_source, strains),
        )
    )
    tables.append(
        _table("CSM bilinear (B.4)", csm_source, [strain_col, stress_col], _rows(strains, stresses))
    )

    stress_c1 = model.stress_at_strain_limit_c1
    marks = [
        (
            eps_y,
            fy,
            f"ε_y, f_y = {fy:g}",
            "bottom right",
            f"ε<sub>y</sub> = f<sub>y</sub> / E = {eps_y:.5f}<br>"
            f"f<sub>y</sub> = {fy:g} {STRESS} (input)<br>(B.4)",
            "ε_y = f_y / E, at f_y (input)",
            f"{CODE}, B.4 (ε_y = f_y / E); f_y input",
        ),
        (
            eps_c1,
            stress_c1,
            "C₁ε_u",
            "bottom right",
            f"C<sub>1</sub>ε<sub>u</sub> = {eps_c1:.5f}<br>σ = {stress_c1:.1f} {STRESS}<br>"
            "(B.4, B.5, Table B.1)",
            "C₁ε_u",
            f"{CODE}, B.4, B.5, Table B.1",
        ),
        (
            eps_end,
            fu,
            f"C₂ε_u, f_u = {fu:g}",
            "top left",
            f"C<sub>2</sub>ε<sub>u</sub> = {eps_end:.5f}<br>f<sub>u</sub> = {fu:g} {STRESS} "
            "(input)<br>(B.4, B.5, Table B.1)",
            "C₂ε_u, at f_u (input)",
            f"{CODE}, B.4, B.5, Table B.1; f_u input",
        ),
    ]
    for strain, stress, text, position, hover, series, source in marks:
        dotted = {"color": MUTED, "width": 1, "dash": "dot"}
        shapes.append(
            {
                "type": "line",
                "x0": x(strain),
                "x1": x(strain),
                "y0": 0,
                "y1": stress,
                "line": dotted,
            }
        )
        shapes.append(
            {"type": "line", "x0": 0, "x1": x(strain), "y0": stress, "y1": stress, "line": dotted}
        )
        fig.add_trace(
            go.Scatter(
                x=[x(strain)],
                y=[stress],
                mode="markers+text",
                marker={"color": BLUE, "size": 9, "line": {"color": "white", "width": 2}},
                text=[typeset_html(text)],
                textposition=position,
                showlegend=False,
                hovertemplate=hover + "<extra></extra>",
                meta=meta(series, source, [strain], role="point"),
            )
        )
        tables.append(_table(series, source, [strain_col, stress_col], [[strain, stress]]))

    annotations.append(
        {
            "x": x(eps_y / 2),
            "y": fy / 2,
            "text": "E",
            "showarrow": False,
            "xanchor": "left",
            "xshift": 8,
        }
    )
    mid = (eps_y + eps_end) / 2
    annotations.append(
        {
            "x": x(mid),
            "y": model.stress_at(mid),
            "text": "E<sub>sh</sub>",
            "showarrow": False,
            "yshift": -16,
        }
    )

    if tension is not None:
        _add_tension_marks(
            fig, shapes, annotations, tables, x, model, tension, cap_15, eps_end, schematic
        )
    if compression is not None and compression_strain is not None:
        _add_compression_mark(fig, shapes, tables, x, model, compression, compression_strain, meta)

    ticks, ticktext = axis.ticks(typeset_html)
    xaxis: dict[str, Any] = {
        "title": {"text": "strain ε (not to scale)" if schematic else "strain ε (true scale)"},
        "tickvals": ticks,
        "ticktext": [t.replace("\n", "<br>") for t in ticktext],
        "range": [0, max(ticks) * 1.04],
        "gridcolor": GRID,
        "zeroline": False,
    }
    if not schematic:
        xaxis["unifiedhovertitle"] = {"text": "strain ε = %{x:.5f}"}
    fig.update_layout(
        shapes=shapes,
        annotations=annotations,
        height=470,
        margin={"l": 10, "r": 10, "t": 20, "b": 10},
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        legend={"orientation": "h", "y": -0.3},
        hovermode="closest" if schematic else "x unified",
        xaxis=_spiked(xaxis),
        yaxis={
            "title": {"text": "stress σ [N/mm²]"},
            "range": [0, fu * 1.15],
            "gridcolor": GRID,
            "zeroline": False,
            **NO_Y_SPIKE,
        },
    )
    figure = _to_dict(fig)
    # on true scale a pinned ε_csm / ε_y from another chart sits at ε = (ε_csm / ε_y) ε_y,
    # with the ε_y of B.4 given here; a schematic axis takes no link marker
    also = [] if schematic else [{"quantity": "strain_ratio", "factor": eps_y, "label": "ε / ε_y"}]
    figure["readout"] = _readout(
        "Stress-strain curve (B.4)",
        {
            "x": _axis(strain_col, "ε", "strain", schematic, also),
            "y": _axis(stress_col, "σ"),
        },
        tables,
    )
    return figure


def _add_tension_marks(
    fig: go.Figure,
    shapes: list[dict[str, Any]],
    annotations: list[dict[str, Any]],
    tables: list[dict[str, Any]],
    x: Any,
    model: CSMBilinearModel,
    tension: TensionResult,
    cap_15: float,
    eps_end: float,
    schematic: bool,
) -> None:
    fixed_governs = tension.governing is GoverningStrainLimit.FIXED_LIMIT_15
    strain_col, stress_col = _col("ε"), _col("σ", STRESS)
    source = f"{CODE}, B.14: ε_csm,t / ε_y = min(15 ; C₁ε_u / ε_y)"
    for strain, governs in ((cap_15, fixed_governs), (model.strain_limit_c1, not fixed_governs)):
        if strain > eps_end:
            continue
        shapes.append(
            {
                "type": "line",
                "x0": x(strain),
                "x1": x(strain),
                "y0": 0,
                "y1": 1,
                "yref": "paper",
                "line": {
                    "color": ORANGE if governs else MUTED,
                    "width": 2.5 if governs else 1.5,
                    "dash": "solid" if governs else "dash",
                },
            }
        )
        annotations.append(
            {
                "x": x(strain),
                "y": 0.03,
                "yref": "paper",
                "text": "governs" if governs else "not governing",
                "textangle": -90,
                "showarrow": False,
                "yanchor": "bottom",
                "xshift": -10,
            }
        )
        limit = "15 ε<sub>y</sub>" if strain == cap_15 else "C<sub>1</sub>ε<sub>u</sub>"
        series = (
            f"{'15 ε_y' if strain == cap_15 else 'C₁ε_u'} "
            f"({'governs' if governs else 'does not govern'})"
        )
        fig.add_trace(
            _vertical(
                x(strain),
                0,
                model.material.fu * 1.15,
                f"{limit} = {strain:.5f}: {'governs' if governs else 'does not govern'}<br>"
                "(B.14: ε<sub>csm,t</sub> / ε<sub>y</sub> = min{15 ; C<sub>1</sub>ε<sub>u</sub> / "
                "ε<sub>y</sub>})",
                "Tension strain limit candidate",
                ORANGE if governs else MUTED,
                _meta(
                    series,
                    source,
                    strain_col,
                    stress_col,
                    "reference",
                    "x",
                    x_values=[strain] * VERTICAL_POINTS if schematic else None,
                ),
            )
        )
        tables.append(_table(series, source, [strain_col], [[strain]]))
    shapes.append(
        {
            "type": "line",
            "x0": 0,
            "x1": x(tension.strain),
            "y0": tension.design_stress,
            "y1": tension.design_stress,
            "line": {"color": ORANGE, "width": 1.5, "dash": "dot"},
        }
    )
    point_source = f"{CODE}, B.14 (ε_csm,t) and B.13 (f_csm,t)"
    fig.add_trace(
        go.Scatter(
            x=[x(tension.strain)],
            y=[tension.design_stress],
            mode="markers+text",
            marker={
                "color": ORANGE,
                "size": 13,
                "symbol": "diamond",
                "line": {"color": "white", "width": 2},
            },
            text=[typeset_html(f"f_csm,t = {tension.design_stress:.1f}")],
            textposition="top left",
            name="Tension limit ε_csm,t".replace("ε_csm,t", "ε<sub>csm,t</sub>"),
            hovertemplate=f"ε<sub>csm,t</sub> = {tension.strain:.5f} (B.14)<br>"
            f"f<sub>csm,t</sub> = {tension.design_stress:.1f} {STRESS} (B.13)<extra></extra>",
            meta=_meta(
                "Tension limit ε_csm,t",
                point_source,
                _col("ε_csm,t"),
                _col("f_csm,t", STRESS),
                "point",
                x_values=[tension.strain] if schematic else None,
            ),
        )
    )
    tables.append(
        _table(
            "Tension limit ε_csm,t",
            point_source,
            [_col("ε_csm,t"), _col("f_csm,t", STRESS)],
            [[tension.strain, tension.design_stress]],
        )
    )


def compression_point_figure(
    model: CSMBilinearModel, schematic: bool, result: CompressionResult
) -> dict[str, Any]:
    """The B.4 curve with the B.6.2 point (ε_csm, f_csm); f_y up to f_csm is shaded."""
    return stress_strain_figure(model, schematic, compression=result)


def _add_compression_mark(
    fig: go.Figure,
    shapes: list[dict[str, Any]],
    tables: list[dict[str, Any]],
    x: Any,
    model: CSMBilinearModel,
    compression: CompressionResult,
    strain: float,
    meta: Any,
) -> None:
    """The B.6.2 point on the B.4 curve: (ε_csm, f_csm), or (ε_csm, E ε_csm) below yield."""
    hardened = compression.design_stress is not None
    stress = (
        compression.design_stress
        if compression.design_stress is not None
        else (model.stress_at(strain))
    )
    shapes.append(
        {
            "type": "line",
            "x0": 0,
            "x1": x(strain),
            "y0": stress,
            "y1": stress,
            "line": {"color": ORANGE, "width": 1.5, "dash": "dot"},
        }
    )
    shapes.append(
        {
            "type": "line",
            "x0": x(strain),
            "x1": x(strain),
            "y0": 0,
            "y1": stress,
            "line": {"color": ORANGE, "width": 1.5, "dash": "dot"},
        }
    )
    label = (
        f"f_csm = {stress:.1f}" if hardened else f"E ε_csm = {stress:.1f} (B.15; f_csm not used)"
    )
    series = "Compression limit ε_csm (B.6.2)"
    source = (
        f"{CODE}, B.5.1 (ε_csm) and B.17 (f_csm)"
        if hardened
        else f"{CODE}, B.5.1 (ε_csm); E ε_csm on the B.4 curve (B.15 range: B.17 not used)"
    )
    y_col = _col("f_csm" if hardened else "E ε_csm", STRESS)
    fig.add_trace(
        go.Scatter(
            x=[x(strain)],
            y=[stress],
            mode="markers+text",
            marker={
                "color": ORANGE,
                "size": 13,
                "symbol": "diamond",
                "line": {"color": "white", "width": 2},
            },
            text=[typeset_html(label)],
            textposition="top left" if hardened else "bottom right",
            name="Compression limit ε<sub>csm</sub> (B.6.2)",
            hovertemplate=f"ε<sub>csm</sub> = {strain:.5f} (B.5.1)<br>"
            + (
                f"f<sub>csm</sub> = {stress:.1f} {STRESS} (B.17)"
                if hardened
                else f"E ε<sub>csm</sub> = {stress:.1f} {STRESS} (B.15 range: B.17 not used)"
            )
            + "<extra></extra>",
            meta=meta(series, source, [strain], role="point", y=y_col),
        )
    )
    tables.append(_table(series, source, [_col("ε_csm"), y_col], [[strain, stress]]))


def _slenderness_col(plates: bool) -> Column:
    return _col("λ_p,cs" if plates else "λ_c,cs")


RATIO = _col("ε_csm / ε_y")
RATIO_HTML = "ε<sub>csm</sub> / ε<sub>y</sub>"


def base_curve_figure(result: DeformationResult) -> dict[str, Any]:
    """The B.6 / B.7 base curve with its zones, the cap, and the user's section as a marker."""
    family, lam = result.family, result.slenderness
    limits = LIMITS[family]
    plates = family is SectionFamily.FLAT_PLATES
    sub = "p,cs" if plates else "c,cs"
    curve_clause = "B.6" if plates else "B.7"
    lam_clause = "B.8" if plates else "B.10"
    ratio_html = RATIO_HTML
    lam_col = _slenderness_col(plates)
    cap = result.cap
    x_max = max(limits.upper * 1.3, lam * 1.08)
    y_max = cap * 1.18

    fig = go.Figure()
    shapes: list[dict[str, Any]] = []
    annotations: list[dict[str, Any]] = []
    tables: list[dict[str, Any]] = []

    zones = [
        (0.0, limits.switch, "rgba(42, 120, 214, 0.09)", "stocky"),
        (limits.switch, limits.upper, "rgba(137, 135, 129, 0.13)", "slender"),
        (limits.upper, x_max, "rgba(208, 59, 59, 0.13)", "not allowed"),
    ]
    for start, end, colour, name in zones:
        shapes.append(
            {
                "type": "rect",
                "x0": start,
                "x1": end,
                "y0": 0,
                "y1": 1,
                "yref": "paper",
                "fillcolor": colour,
                "line": {"width": 0},
                "layer": "below",
            }
        )
        annotations.append(
            {
                "x": (start + end) / 2,
                "y": 1,
                "yref": "paper",
                "text": name,
                "showarrow": False,
                "yanchor": "top",
            }
        )

    points = curve_points(family, cap, 240)
    lams = [p for p, _ in points]
    # the formula before the cap, where the cap changes it, on the same λ as the curve
    raw_points = [(p, raw_ratio(family, p)) for p in lams if p <= limits.switch]
    above = [(p, v) for p, v in raw_points if v > cap and v <= y_max * 1.0]
    if above:
        raw_x, raw_y = [p for p, _ in above], [v for _, v in above]
        raw_source = f"{CODE}, {curve_clause} before the cap (not used)"
        fig.add_trace(
            go.Scatter(
                x=raw_x,
                y=raw_y,
                mode="lines",
                line={"color": MUTED, "width": 1.5, "dash": "dot"},
                name="Formula before the cap",
                hovertemplate=f"λ<sub>{sub}</sub> = %{{x:.3f}}<br>{ratio_html} = %{{y:.3f}}<br>"
                f"({curve_clause} before the cap; not used)<extra></extra>",
                meta=_meta("Formula before the cap", raw_source, lam_col, RATIO, "unused"),
            )
        )
        tables.append(
            _table("Formula before the cap", raw_source, [lam_col, RATIO], _rows(raw_x, raw_y))
        )
    ratios = [v for _, v in points]
    curve_name = f"Base curve ({curve_clause}) held to the cap"
    curve_source = f"{CODE}, {curve_clause}, held to the cap min(Ω, C₁ε_u / ε_y)"
    fig.add_trace(
        go.Scatter(
            x=lams,
            y=ratios,
            mode="lines",
            line={"color": BLUE, "width": 2.5},
            name=curve_name,
            hovertemplate=f"λ<sub>{sub}</sub> = %{{x:.3f}}<br>{ratio_html} = %{{y:.3f}}<br>"
            f"({curve_clause}, held to the cap)<extra></extra>",
            meta=_meta(curve_name, curve_source, lam_col, RATIO),
        )
    )
    tables.append(_table(curve_name, curve_source, [lam_col, RATIO], _rows(lams, ratios)))

    shapes.append(
        {
            "type": "line",
            "x0": 0,
            "x1": x_max,
            "y0": cap,
            "y1": cap,
            "line": {"color": ORANGE, "width": 1.5, "dash": "dash"},
        }
    )
    annotations.append(
        {
            "x": x_max,
            "y": cap,
            "text": (
                f"cap = {typeset_html('min(Ω, C₁ε_u/ε_y)')} = {cap:.4g} "
                f"({typeset_html(result.cap_source.value)})"
            ),
            "showarrow": False,
            "xanchor": "right",
            "yanchor": "bottom",
        }
    )
    shapes.append(
        {
            "type": "line",
            "x0": 0,
            "x1": x_max,
            "y0": 1,
            "y1": 1,
            "line": {"color": MUTED, "width": 1, "dash": "dot"},
        }
    )
    annotations.append(
        {
            "x": x_max,
            "y": 1,
            "text": "ε<sub>csm</sub> = ε<sub>y</sub>",
            "showarrow": False,
            "xanchor": "right",
            "yanchor": "top",
        }
    )

    if result.strain_ratio is not None:
        ratio = result.strain_ratio
        shapes.append(
            {
                "type": "line",
                "x0": lam,
                "x1": lam,
                "y0": 0,
                "y1": ratio,
                "line": {"color": ORANGE, "width": 1, "dash": "dot"},
            }
        )
        yours_source = f"{CODE}, {lam_clause} (λ) and {curve_clause} (ε_csm / ε_y)"
        fig.add_trace(
            go.Scatter(
                x=[lam],
                y=[ratio],
                mode="markers+text",
                marker={
                    "color": ORANGE,
                    "size": 13,
                    "symbol": "diamond",
                    "line": {"color": "white", "width": 2},
                },
                text=[f"your section: λ = {lam:.3f}, ratio = {ratio:.2f}"],
                textposition="top right" if lam < x_max * 0.6 else "top left",
                name="Your section",
                hovertemplate=f"your section<br>λ<sub>{sub}</sub> = {lam:.3f} ({lam_clause})<br>"
                f"{ratio_html} = {ratio:.3f} ({curve_clause})<extra></extra>",
                meta=_meta("Your section", yours_source, lam_col, RATIO, "point"),
            )
        )
        tables.append(_table("Your section", yours_source, [lam_col, RATIO], [[lam, ratio]]))
    else:
        not_allowed = f"{CODE}, {lam_clause}; above the limit {limits.upper:g} of {curve_clause}"
        fig.add_trace(
            _vertical(
                lam,
                0,
                y_max,
                f"your section: λ<sub>{sub}</sub> = {lam:.3f} ({lam_clause})<br>"
                f"above the limit {limits.upper:g} of {curve_clause}: not allowed",
                "Your section",
                CRITICAL,
                _meta("Your section (not allowed)", not_allowed, lam_col, RATIO, "point", "x"),
            )
        )
        tables.append(_table("Your section (not allowed)", not_allowed, [lam_col], [[lam]]))
        shapes.append(
            {
                "type": "line",
                "x0": lam,
                "x1": lam,
                "y0": 0,
                "y1": 1,
                "yref": "paper",
                "line": {"color": CRITICAL, "width": 2.5},
            }
        )
        annotations.append(
            {
                "x": lam,
                "y": 0.5,
                "yref": "paper",
                "text": f"your section: λ = {lam:.3f} (not allowed)",
                "textangle": -90,
                "showarrow": False,
                "xshift": -12,
            }
        )

    grid = _grid(lams, 0, x_max)
    cap_source = f"{CODE}, {curve_clause}: min(Ω, C₁ε_u / ε_y), set by {result.cap_source.value}"
    yield_source = f"{CODE}, B.4: ε_y = f_y / E"
    fig.add_trace(
        _horizontal(
            grid,
            cap,
            f"cap: {ratio_html} = {cap:.4g}<br>"
            f"min(Ω, C<sub>1</sub>ε<sub>u</sub> / ε<sub>y</sub>), set by "
            f"{typeset_html(result.cap_source.value)} ({curve_clause})",
            "Strain cap",
            ORANGE,
            _meta("Strain cap", cap_source, lam_col, _col("cap ε_csm / ε_y"), "reference", "y"),
        )
    )
    tables.append(_table("Strain cap", cap_source, [_col("cap ε_csm / ε_y")], [[cap]]))
    fig.add_trace(
        _horizontal(
            grid,
            1.0,
            f"{ratio_html} = 1: the strain limit equals the yield strain<br>"
            "ε<sub>y</sub> = f<sub>y</sub> / E (B.4)",
            "Yield strain",
            MUTED,
            _meta("Yield strain", yield_source, lam_col, RATIO, "reference", "y"),
        )
    )

    fig.update_layout(
        shapes=shapes,
        annotations=annotations,
        height=430,
        margin={"l": 10, "r": 10, "t": 20, "b": 10},
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        legend={"orientation": "h", "y": -0.25},
        hovermode="x unified",
        xaxis=_spiked(
            {
                "title": {"text": f"relative cross-section slenderness λ<sub>{sub}</sub>"},
                "range": [0, x_max],
                "gridcolor": GRID,
                "zeroline": False,
                "unifiedhovertitle": {"text": f"λ<sub>{sub}</sub> = %{{x:.3f}}"},
            }
        ),
        yaxis={
            "title": {"text": "strain limit ratio ε<sub>csm</sub> / ε<sub>y</sub>"},
            "range": [0, y_max],
            "gridcolor": GRID,
            "zeroline": False,
            **NO_Y_SPIKE,
        },
    )
    figure = _to_dict(fig)
    figure["readout"] = _readout(
        f"Base curve ({curve_clause})",
        {
            "x": _axis(lam_col, f"λ<sub>{sub}</sub>", "lambda_p" if plates else "lambda_c"),
            "y": _axis(RATIO, ratio_html, "strain_ratio"),
        },
        tables,
    )
    return figure


def _frange(start: float, stop: float, n: int = 120) -> list[float]:
    return [start + (stop - start) * i / (n - 1) for i in range(n)]


_REFERENCE_TEXT = {
    "capped": "cap reached",
    "yield": "down to yield",
    "limit": "thinnest allowed",
}
# where each label goes on the base curve, so none runs off the plot or sits on another
_REFERENCE_POSITION = {
    "capped": "top right",
    "yield": "bottom right",
    "limit": "top left",
}


def _reference_marker(
    x: list[float],
    y: list[float],
    text: list[str],
    position: list[str] | None,
    name: str,
    values: str,
    meta: dict[str, Any],
) -> dict[str, Any]:
    """Grey markers for the reference sections. Without `position` the names show on hover only.

    `values` is the hover line under the name: the point's numbers with their units and clauses.
    """
    trace: dict[str, Any] = {
        "type": "scatter",
        "x": x,
        "y": y,
        "mode": "markers" if position is None else "markers+text",
        "marker": {"color": MUTED, "size": 10, "line": {"color": "white", "width": 2}},
        "name": name,
        "customdata": text,
        "hovertemplate": "%{customdata}<br>" + values + "<extra></extra>",
        "meta": meta,
    }
    if position is None:
        trace["text"] = text
    else:
        trace["text"] = [typeset_html(t) for t in text]
        trace["textposition"] = position
    return trace


def comparison_base_curve_figure(comparison: Comparison) -> dict[str, Any]:
    """The base curve with your section and the reference sections marked on it."""
    figure = base_curve_figure(comparison.your_capacity)
    marks = [
        ref for ref in comparison.references if ref.key != "yours" and ref.point.capacity.allowed
    ]
    if marks:
        plates = comparison.your_capacity.family is SectionFamily.FLAT_PLATES
        lam_col = _slenderness_col(plates)
        source = (
            f"{CODE}, {'B.8' if plates else 'B.10'} (λ) and {'B.6' if plates else 'B.7'} "
            "(ε_csm / ε_y), your section with every thickness scaled"
        )
        xs = [ref.point.slenderness for ref in marks]
        ys = [float(ref.point.capacity.strain_ratio or 0.0) for ref in marks]
        names = [_REFERENCE_TEXT[ref.key] for ref in marks]
        figure["data"].append(
            _reference_marker(
                xs,
                ys,
                names,
                [_REFERENCE_POSITION[ref.key] for ref in marks],
                "Reference sections",
                f"λ = %{{x:.3f}} ({'B.8' if plates else 'B.10'})<br>"
                f"ε<sub>csm</sub> / ε<sub>y</sub> = %{{y:.3f}} ({'B.6' if plates else 'B.7'})",
                _meta("Reference sections", source, lam_col, RATIO, "point"),
            )
        )
        for name, x, y in zip(names, xs, ys, strict=True):
            figure["readout"]["tables"].append(
                _table(f"Reference section: {name}", source, [lam_col, RATIO], [[x, y]])
            )
    return figure


def comparison_stress_figure(model: CSMBilinearModel, comparison: Comparison) -> dict[str, Any]:
    """The B.4 curve against the classic one, with the stress each section is read at."""
    figure = stress_strain_figure(model, schematic=False)
    marks = [ref for ref in comparison.references if ref.point.stress is not None]
    yours = [ref for ref in marks if ref.key == "yours"]
    others = [ref for ref in marks if ref.key != "yours"]
    strain_col, stress_col = _col("ε_csm"), _col("σ", STRESS)
    source = f"{CODE}, B.5.1 (ε_csm) read on the B.4 curve"
    if others:
        xs = [float(ref.point.capacity.strain or 0.0) for ref in others]
        ys = [float(ref.point.stress or 0.0) for ref in others]
        names = [_REFERENCE_TEXT[ref.key] for ref in others]
        figure["data"].append(
            _reference_marker(
                xs,
                ys,
                names,
                None,
                "Reference sections",
                f"strain ε = %{{x:.5f}}<br>stress σ = %{{y:.1f}} {STRESS} (B.4)",
                _meta("Reference sections", source, strain_col, stress_col, "point"),
            )
        )
        for name, x, y in zip(names, xs, ys, strict=True):
            figure["readout"]["tables"].append(
                _table(f"Reference section: {name}", source, [strain_col, stress_col], [[x, y]])
            )
    if yours:
        ref = yours[0]
        x_yours = float(ref.point.capacity.strain or 0.0)
        y_yours = float(ref.point.stress or 0.0)
        figure["data"].append(
            {
                "type": "scatter",
                "x": [x_yours],
                "y": [y_yours],
                "marker": {
                    "color": ORANGE,
                    "size": 13,
                    "symbol": "diamond",
                    "line": {"color": "white", "width": 2},
                },
                "text": ["your section"],
                "hovertemplate": "your section<br>strain ε = %{x:.5f}<br>"
                f"stress σ = %{{y:.1f}} {STRESS} (B.4)<extra></extra>",
                "mode": "markers",
                "name": "Your section",
                "meta": _meta("Your section", source, strain_col, stress_col, "point"),
            }
        )
        figure["readout"]["tables"].append(
            _table("Your section", source, [strain_col, stress_col], [[x_yours, y_yours]])
        )
    return figure


def _capped_ratio(family: SectionFamily, cap: float, slenderness: float) -> float:
    """ε_csm/ε_y of the base curve at a slenderness: B.6 or B.7, held to the cap when stocky."""
    value = raw_ratio(family, slenderness)
    return min(value, cap) if slenderness <= LIMITS[family].switch else value


def _slenderness_where_ratio_is_one(
    family: SectionFamily, cap: float, start: float, stop: float
) -> float | None:
    """The slenderness where the base curve crosses ε_csm/ε_y = 1, or None if it does not."""
    if not _capped_ratio(family, cap, start) >= 1 > _capped_ratio(family, cap, stop):
        return None
    low, high = start, stop
    for _ in range(80):
        mid = (low + high) / 2
        if _capped_ratio(family, cap, mid) >= 1:
            low = mid
        else:
            high = mid
    return (low + high) / 2


def compression_capacity_figure(
    model: CSMBilinearModel, deformation: DeformationResult, result: CompressionResult
) -> dict[str, Any]:
    """N_csm,Rd / (A f_y / γ_M0) against λ: the B.15 branch, the B.16 branch, the cap, the junction
    at ε_csm/ε_y = 1 and the user's section.

    Every point is the engine's own base curve (B.6 or B.7, held to the cap) passed through B.15
    or B.16 with B.17. A and γ_M0 cancel in the ratio, so the chart does not depend on them.
    """
    family = deformation.family
    limits = LIMITS[family]
    plates = family is SectionFamily.FLAT_PLATES
    sub = "p,cs" if plates else "c,cs"
    cap = deformation.cap
    start = 0.1 if plates else 0.05
    junction = _slenderness_where_ratio_is_one(family, cap, start, limits.upper)
    lam_col = _slenderness_col(plates)
    n_col = _col("N_csm,Rd / (A f_y / γ_M0)")

    def at(lam: float) -> tuple[float, float, float]:
        ratio = _capped_ratio(family, cap, lam)
        return lam, capacity_ratio(model, ratio), ratio

    grid = [start + (limits.upper - start) * i / 239 for i in range(240)]
    rows = [at(lam) for lam in grid]
    b16 = [row for row in rows if row[2] >= 1]
    b15 = [row for row in rows if row[2] < 1]
    if junction is not None:
        # the two branches meet exactly where ε_csm/ε_y = 1
        meeting = (junction, capacity_ratio(model, 1.0), 1.0)
        b16.append(meeting)
        b15.insert(0, meeting)

    fig = go.Figure()
    shapes: list[dict[str, Any]] = []
    annotations: list[dict[str, Any]] = []
    tables: list[dict[str, Any]] = []
    curve_xs: list[float] = []
    curve_clause = "B.6" if plates else "B.7"
    lam_clause = "B.8" if plates else "B.10"
    n_ratio = "N<sub>csm,Rd</sub> / (A f<sub>y</sub> / γ<sub>M0</sub>)"

    def hover(formula: str) -> str:
        return (
            f"λ<sub>{sub}</sub> = %{{x:.3f}}<br>{n_ratio} = %{{y:.3f}} ({formula})"
            f"<br>ε<sub>csm</sub> / ε<sub>y</sub> = %{{customdata:.3f}} ({curve_clause})"
            "<extra></extra>"
        )

    for name, series, branch, dash, width, formula in (
        (
            "Formula B.16 (ε<sub>csm</sub>/ε<sub>y</sub> ≥ 1, with B.17)",
            "Formula B.16 (ε_csm/ε_y ≥ 1, with B.17)",
            b16,
            "solid",
            3,
            "B.16, B.17",
        ),
        (
            "Formula B.15 (ε<sub>csm</sub>/ε<sub>y</sub> &lt; 1)",
            "Formula B.15 (ε_csm/ε_y < 1)",
            b15,
            "dash",
            2.5,
            "B.15",
        ),
    ):
        if not branch:
            continue
        xs, ys, ratios = [r[0] for r in branch], [r[1] for r in branch], [r[2] for r in branch]
        curve_xs += xs
        source = f"{CODE}, {formula}, with ε_csm / ε_y from {curve_clause} held to the cap"
        fig.add_trace(
            go.Scatter(
                x=xs,
                y=ys,
                customdata=ratios,
                mode="lines",
                line={"color": BLUE, "width": width, "dash": dash},
                name=name,
                hovertemplate=hover(formula),
                meta=_meta(series, source, lam_col, n_col),
            )
        )
        tables.append(_table(series, source, [lam_col, n_col, RATIO], _rows(xs, ys, ratios)))

    x_max = limits.upper * 1.04
    y_top = max(row[1] for row in rows)
    y_max = max(y_top, capacity_ratio(model, cap)) * 1.15

    cap_level = capacity_ratio(model, cap)
    shapes.append(
        {
            "type": "line",
            "x0": 0,
            "x1": x_max,
            "y0": cap_level,
            "y1": cap_level,
            "line": {"color": ORANGE, "width": 1.5, "dash": "dash"},
        }
    )
    annotations.append(
        {
            "x": x_max,
            "y": cap_level,
            "text": (
                f"cap: ε<sub>csm</sub>/ε<sub>y</sub> = {cap:.4g} "
                f"({typeset_html(deformation.cap_source.value)})"
            ),
            "showarrow": False,
            "xanchor": "right",
            "yanchor": "bottom",
        }
    )

    if junction is not None:
        cap_governs = cap <= 1
        switch_clause = "B.6" if plates else "B.7"
        text = "ε<sub>csm</sub>/ε<sub>y</sub> = 1: B.15 meets B.16" + (
            "<br>the cap holds the curve here, so it is not a kink"
            if cap_governs
            else f"<br>a kink; also the {switch_clause} switch, λ = {limits.switch:g}"
        )
        meeting_level = capacity_ratio(model, 1.0)
        meeting_source = f"{CODE}, {curve_clause} (ε_csm / ε_y = 1), B.15 = B.16"
        fig.add_trace(
            go.Scatter(
                x=[junction],
                y=[meeting_level],
                mode="markers+text",
                marker={
                    "color": "rgba(0,0,0,0)",
                    "size": 11,
                    "symbol": "circle",
                    "line": {"color": MUTED, "width": 2.5},
                },
                text=[text],
                textposition="top right",
                name="ε<sub>csm</sub>/ε<sub>y</sub> = 1",
                hovertemplate=f"λ<sub>{sub}</sub> = {junction:.4f}<br>"
                f"ε<sub>csm</sub> / ε<sub>y</sub> = 1 ({curve_clause})<br>"
                f"{n_ratio} = {meeting_level:.3f}: B.15 and B.16 give the same value"
                "<extra></extra>",
                meta=_meta("ε_csm/ε_y = 1", meeting_source, lam_col, n_col, "point"),
            )
        )
        tables.append(
            _table(
                "ε_csm/ε_y = 1: B.15 meets B.16",
                meeting_source,
                [lam_col, n_col, RATIO],
                [[junction, meeting_level, 1.0]],
            )
        )

    lam = deformation.slenderness
    yours = capacity_ratio(model, result.strain_ratio)
    shapes.append(
        {
            "type": "line",
            "x0": lam,
            "x1": lam,
            "y0": 0,
            "y1": yours,
            "line": {"color": ORANGE, "width": 1, "dash": "dot"},
        }
    )
    yours_source = f"{CODE}, {lam_clause} (λ), {curve_clause} (ε_csm / ε_y), {result.formula.value}"
    fig.add_trace(
        go.Scatter(
            x=[lam],
            y=[yours],
            mode="markers+text",
            marker={
                "color": ORANGE,
                "size": 13,
                "symbol": "diamond",
                "line": {"color": "white", "width": 2},
            },
            text=[f"your section: λ = {lam:.3f}, {yours:.3f}"],
            textposition="top right" if lam < x_max * 0.6 else "top left",
            name="Your section",
            hovertemplate=f"your section<br>λ<sub>{sub}</sub> = {lam:.3f} "
            f"({lam_clause})<br>"
            f"ε<sub>csm</sub> / ε<sub>y</sub> = {result.strain_ratio:.3f} ({curve_clause})<br>"
            f"{n_ratio} = {yours:.3f} ({result.formula.value})<extra></extra>",
            meta=_meta("Your section", yours_source, lam_col, n_col, "point"),
        )
    )
    tables.append(
        _table(
            "Your section",
            yours_source,
            [lam_col, n_col, RATIO],
            [[lam, yours, result.strain_ratio]],
        )
    )
    cap_source = (
        f"{CODE}, {curve_clause}: cap min(Ω, C₁ε_u / ε_y), set by "
        f"{deformation.cap_source.value}, through B.16 and B.17"
    )
    fig.add_trace(
        _horizontal(
            _grid(curve_xs, 0, x_max),
            cap_level,
            f"cap: ε<sub>csm</sub> / ε<sub>y</sub> = {cap:.4g}, set by "
            f"{typeset_html(deformation.cap_source.value)} ({curve_clause})<br>"
            f"{n_ratio} = {cap_level:.3f} at the cap",
            "Strain cap",
            ORANGE,
            _meta(
                "Strain cap",
                cap_source,
                lam_col,
                _col("N at the cap / (A f_y / γ_M0)"),
                "reference",
                "y",
            ),
        )
    )
    tables.append(
        _table(
            "Strain cap",
            cap_source,
            [_col("cap ε_csm / ε_y"), n_col],
            [[cap, cap_level]],
        )
    )

    fig.update_layout(
        shapes=shapes,
        annotations=annotations,
        height=450,
        margin={"l": 10, "r": 10, "t": 20, "b": 10},
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        legend={"orientation": "h", "y": -0.25},
        hovermode="x unified",
        xaxis=_spiked(
            {
                "title": {"text": f"relative cross-section slenderness λ<sub>{sub}</sub>"},
                "range": [0, x_max],
                "gridcolor": GRID,
                "zeroline": False,
                "unifiedhovertitle": {"text": f"λ<sub>{sub}</sub> = %{{x:.3f}}"},
            }
        ),
        yaxis={
            "title": {"text": "N<sub>csm,Rd</sub> / (A f<sub>y</sub> / γ<sub>M0</sub>)"},
            "range": [0, y_max],
            "gridcolor": GRID,
            "zeroline": False,
            **NO_Y_SPIKE,
        },
    )
    figure = _to_dict(fig)
    figure["readout"] = _readout(
        "Compression resistance (B.15, B.16)",
        {
            "x": _axis(lam_col, f"λ<sub>{sub}</sub>", "lambda_p" if plates else "lambda_c"),
            "y": _axis(n_col, n_ratio),
        },
        tables,
    )
    return figure


# Moments are N mm in the engine; the chart is the screen edge, so it shows kN m.
_KNM = 1e-6


def bending_moment_figure(
    model: CSMBilinearModel,
    deformation: DeformationResult,
    result: BendingResult,
    w_el: float,
    w_pl: float,
    gamma_m0: float,
) -> dict[str, Any]:
    """M_csm,c,Rd against ε_csm/ε_y: the B.19 branch, the B.20 branch, W_el f_y/γM0 and
    W_pl f_y/γM0 as reference lines, the cap, and the user's section.

    Every point is the engine's own `moment_at` (B.19 below 1.0, B.20 from 1.0) with the α of
    Table B.2 that the result used.
    """
    cap = deformation.cap
    x_max = max(cap, result.strain_ratio) * 1.04
    start = 0.02
    grid = [start + (cap - start) * i / 239 for i in range(240)]
    m_col = _col("M_csm,c,Rd", "kN m")
    alpha = f"α = {result.alpha:g} from Table B.2"

    def at(ratio: float) -> tuple[float, float]:
        return ratio, moment_at(model, ratio, w_el, w_pl, result.alpha, gamma_m0) * _KNM

    below = [at(r) for r in grid if r < 1] + [at(1.0)]
    above = [at(1.0)] + [at(r) for r in grid if r > 1]

    fig = go.Figure()
    shapes: list[dict[str, Any]] = []
    annotations: list[dict[str, Any]] = []
    tables: list[dict[str, Any]] = []
    curve_xs: list[float] = []
    for name, series, branch, dash, width, formula in (
        (
            "Formula B.20 (ε<sub>csm</sub>/ε<sub>y</sub> ≥ 1)",
            "Formula B.20 (ε_csm/ε_y ≥ 1)",
            above,
            "solid",
            3,
            "B.20",
        ),
        (
            "Formula B.19 (ε<sub>csm</sub>/ε<sub>y</sub> &lt; 1)",
            "Formula B.19 (ε_csm/ε_y < 1)",
            below,
            "dash",
            2.5,
            "B.19",
        ),
    ):
        if len(branch) < 2:
            continue
        xs, ys = [row[0] for row in branch], [row[1] for row in branch]
        curve_xs += xs
        source = f"{CODE}, {formula}, {alpha}" if formula == "B.20" else f"{CODE}, B.19"
        fig.add_trace(
            go.Scatter(
                x=xs,
                y=ys,
                mode="lines",
                line={"color": BLUE, "width": width, "dash": dash},
                name=name,
                hovertemplate="ε<sub>csm</sub> / ε<sub>y</sub> = %{x:.3f}<br>"
                f"M<sub>csm,c,Rd</sub> = %{{y:.2f}} kN m ({formula}, α = {result.alpha:g} "
                "from Table B.2)<extra></extra>",
                meta=_meta(series, source, RATIO, m_col),
            )
        )
        tables.append(_table(series, source, [RATIO, m_col], _rows(xs, ys)))

    f_gamma = "f<sub>y</sub> / γ<sub>M0</sub>"
    elastic, plastic = result.elastic_moment * _KNM, result.plastic_moment * _KNM
    for level, text, anchor in (
        (elastic, f"M<sub>el</sub> = W<sub>el</sub> {f_gamma}", "top"),
        (plastic, f"M<sub>pl</sub> = W<sub>pl</sub> {f_gamma}", "bottom"),
    ):
        shapes.append(
            {
                "type": "line",
                "x0": 0,
                "x1": x_max,
                "y0": level,
                "y1": level,
                "line": {"color": MUTED, "width": 1.5, "dash": "dot"},
            }
        )
        annotations.append(
            {
                "x": x_max,
                "y": level,
                "text": f"{text} = {level:.2f} kN m",
                "showarrow": False,
                "xanchor": "right",
                "yanchor": anchor,
            }
        )

    # the strain limit cannot go beyond the cap of B.5.1
    shapes.append(
        {
            "type": "line",
            "x0": cap,
            "x1": cap,
            "y0": 0,
            "y1": 1,
            "yref": "paper",
            "line": {"color": ORANGE, "width": 1.5, "dash": "dash"},
        }
    )
    annotations.append(
        {
            "x": cap,
            "y": 0.02,
            "yref": "paper",
            "text": f"cap {cap:.4g}: {typeset_html(deformation.cap_source.value)}",
            "showarrow": False,
            "xanchor": "right",
            "textangle": -90,
        }
    )

    ratio, moment = at(result.strain_ratio)
    shapes.append(
        {
            "type": "line",
            "x0": ratio,
            "x1": ratio,
            "y0": 0,
            "y1": moment,
            "line": {"color": ORANGE, "width": 1, "dash": "dot"},
        }
    )
    yours_source = f"{CODE}, B.5.1 (ε_csm / ε_y), {result.formula.value}" + (
        f", {alpha}" if result.formula.value == "B.20" else ""
    )
    fig.add_trace(
        go.Scatter(
            x=[ratio],
            y=[moment],
            mode="markers+text",
            marker={
                "color": ORANGE,
                "size": 13,
                "symbol": "diamond",
                "line": {"color": "white", "width": 2},
            },
            text=[f"your section: {moment:.2f} kN m"],
            textposition="bottom right" if ratio < x_max * 0.6 else "bottom left",
            name="Your section",
            hovertemplate=f"ε<sub>csm</sub> / ε<sub>y</sub> = {ratio:.3f}"
            f"<br>M<sub>csm,c,Rd</sub> = {moment:.2f} kN m ({result.formula.value})<extra></extra>",
            meta=_meta("Your section", yours_source, RATIO, m_col, "point"),
        )
    )
    tables.append(_table("Your section", yours_source, [RATIO, m_col], [[ratio, moment]]))

    top = max(plastic, max(row[1] for row in above))
    w_f = "f<sub>y</sub> / γ<sub>M0</sub>"
    reference_xs = _grid(curve_xs, 0, x_max)
    for level, text, name, series, column, source in (
        (
            elastic,
            f"M<sub>el</sub> = W<sub>el</sub> {w_f} = {elastic:.2f} kN m<br>"
            "(B.19 at ε<sub>csm</sub> / ε<sub>y</sub> = 1; 8.2.4(1) for Class 3)",
            "Elastic moment",
            "Elastic moment M_el = W_el f_y / γ_M0",
            _col("M_el", "kN m"),
            f"{CODE}, B.19 at ε_csm / ε_y = 1 and 8.2.4(1) for Class 3; W_el input",
        ),
        (
            plastic,
            f"M<sub>pl</sub> = W<sub>pl</sub> {w_f} = {plastic:.2f} kN m<br>"
            "(the factor in front of B.20; 8.2.4(1) for Class 1 or 2)",
            "Plastic moment",
            "Plastic moment M_pl = W_pl f_y / γ_M0",
            _col("M_pl", "kN m"),
            f"{CODE}, the factor in front of B.20 and 8.2.4(1) for Class 1 or 2; W_pl input",
        ),
    ):
        fig.add_trace(
            _horizontal(
                reference_xs,
                level,
                text,
                name,
                MUTED,
                _meta(series, source, RATIO, column, "reference", "y"),
            )
        )
        tables.append(_table(series, source, [column], [[level]]))
    cap_clause = "B.6" if deformation.family is SectionFamily.FLAT_PLATES else "B.7"
    cap_source = (
        f"{CODE}, {cap_clause}: cap min(Ω, C₁ε_u / ε_y), set by {deformation.cap_source.value}"
    )
    cap_col = _col("cap ε_csm / ε_y")
    fig.add_trace(
        _vertical(
            cap,
            0,
            top * 1.15,
            f"cap: ε<sub>csm</sub> / ε<sub>y</sub> = {cap:.4g}, set by "
            f"{typeset_html(deformation.cap_source.value)} ({cap_clause})",
            "Strain cap",
            ORANGE,
            _meta("Strain cap", cap_source, cap_col, m_col, "reference", "x"),
        )
    )
    tables.append(_table("Strain cap", cap_source, [cap_col], [[cap]]))
    fig.update_layout(
        shapes=shapes,
        annotations=annotations,
        height=450,
        margin={"l": 10, "r": 10, "t": 20, "b": 10},
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        legend={"orientation": "h", "y": -0.25},
        hovermode="x unified",
        xaxis=_spiked(
            {
                "title": {"text": "strain limit ε<sub>csm</sub> / ε<sub>y</sub>"},
                "range": [0, x_max],
                "gridcolor": GRID,
                "zeroline": False,
                "unifiedhovertitle": {"text": f"{RATIO_HTML} = %{{x:.3f}}"},
            }
        ),
        yaxis={
            "title": {"text": "M<sub>csm,c,Rd</sub> [kN m]"},
            "range": [0, top * 1.15],
            "gridcolor": GRID,
            "zeroline": False,
            **NO_Y_SPIKE,
        },
    )
    figure = _to_dict(fig)
    figure["readout"] = _readout(
        "Bending resistance (B.19, B.20)",
        {
            "x": _axis(RATIO, RATIO_HTML, "strain_ratio"),
            "y": _axis(m_col, "M<sub>csm,c,Rd</sub>"),
        },
        tables,
    )
    return figure


def bending_blocks_figure(model: CSMBilinearModel, result: BendingResult) -> dict[str, Any]:
    """Strain and stress across the depth when the compression edge reaches ε_csm.

    Illustrative: a section symmetric about its neutral axis, depth scaled to -1 (tension edge) to
    +1 (compression edge). The strain is a straight line; the stress at each depth is read from
    the B.4 curve (elastic to f_y, then the hardening line). The moment itself comes from B.19 or
    B.20, not from integrating this block.

    Hover: "closest". The two panels share the depth axis but not x (strain against stress),
    and each block has only a few corners, so an x- or y-unified box would mix unrelated
    values or pick the closing corners of the fill.
    """
    ratio = result.strain_ratio
    fy, eps_y = model.material.fy, model.yield_strain
    depths = [-1.0, 1.0] if ratio <= 1 else [-1.0, -1 / ratio, 1 / ratio, 1.0]
    strains = [ratio * u for u in depths]  # ε / ε_y
    stresses = [
        (1 if u >= 0 else -1) * model.stress_at(abs(e) * eps_y)
        for u, e in zip(depths, strains, strict=True)
    ]
    edge = stresses[-1]
    depth_col = _col("depth (−1 tension edge, +1 compression edge)")
    strain_col, stress_col = _col("ε / ε_y"), _col("σ", STRESS)
    strain_source = (
        "Gere & Timoshenko, Mechanics of Materials, 2nd ed., eq. (10-1): plane sections stay "
        "plane; illustrative symmetric section"
    )
    stress_source = f"{CODE}, B.4 curve read at each depth; illustrative symmetric section"

    fig = make_subplots(
        rows=1,
        cols=2,
        shared_yaxes=True,
        horizontal_spacing=0.05,
        subplot_titles=("strain ε / ε<sub>y</sub>", "stress σ [N/mm²]"),
    )
    tables: list[dict[str, Any]] = []
    for col, xs, color, name, hover, column, source, kind in (
        (
            1,
            strains,
            ORANGE,
            "Strain",
            "ε / ε<sub>y</sub> = %{x:.4g}<br>(linear strain: plane sections stay plane,<br>"
            "Gere & Timoshenko, Mechanics of Materials, 2nd ed., eq. (10-1))",
            strain_col,
            strain_source,
            "Textbook",
        ),
        (
            2,
            stresses,
            BLUE,
            "Stress",
            f"σ = %{{x:.4g}} {STRESS}<br>(read from the B.4 curve)",
            stress_col,
            stress_source,
            "Derived",
        ),
    ):
        fig.add_trace(
            go.Scatter(
                x=[0, *xs, 0],
                y=[-1, *depths, 1],
                mode="lines",
                fill="toself",
                hoveron="points",
                line={"color": color, "width": 2.5},
                fillcolor="rgba(235, 104, 52, 0.18)" if col == 1 else BLUE_FILL,
                name=name,
                hovertemplate="depth = %{y:.2f} (−1 tension edge, +1 compression edge)<br>"
                + hover
                + "<br>illustrative: symmetric section, no moment is computed from it"
                "<extra></extra>",
                meta=_meta(name, source, column, depth_col, kind=kind),
            ),
            row=1,
            col=col,
        )
        tables.append(_table(name, source, [depth_col, column], _rows(depths, xs), kind))
    fig.add_vline(x=0, line={"color": MUTED, "width": 1}, row=1, col="all")
    fig.add_hline(y=0, line={"color": MUTED, "width": 1, "dash": "dash"})
    if ratio > 1:
        for sign in (-1, 1):
            fig.add_vline(
                x=sign * 1.0, line={"color": MUTED, "width": 1, "dash": "dot"}, row=1, col=1
            )
            fig.add_vline(
                x=sign * fy, line={"color": MUTED, "width": 1, "dash": "dot"}, row=1, col=2
            )
    fig.add_annotation(
        x=ratio, y=1, xref="x", yref="y", text="ε<sub>csm</sub>", showarrow=False,
        xanchor="left", yanchor="bottom",
    )  # fmt: skip
    fig.add_annotation(
        x=edge, y=1, xref="x2", yref="y2", text=f"σ = {edge:.1f}", showarrow=False,
        xanchor="left", yanchor="bottom",
    )  # fmt: skip
    if ratio > 1:
        fig.add_annotation(
            x=1.0, y=0, xref="x", yref="y", text="ε<sub>y</sub>", showarrow=False,
            xanchor="left", yanchor="top",
        )  # fmt: skip
        fig.add_annotation(
            x=fy, y=0, xref="x2", yref="y2", text="f<sub>y</sub>", showarrow=False,
            xanchor="left", yanchor="top",
        )  # fmt: skip
    reach = max(abs(ratio), 1.0) * 1.35
    stress_reach = max(abs(edge), fy) * 1.35
    fig.update_layout(
        height=380,
        margin={"l": 10, "r": 10, "t": 40, "b": 10},
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        showlegend=False,
        hovermode="closest",
    )
    fig.update_xaxes(gridcolor=GRID, zeroline=False, **X_SPIKE)
    fig.update_xaxes(range=[-reach, reach], row=1, col=1)
    fig.update_xaxes(range=[-stress_reach, stress_reach], row=1, col=2)
    fig.update_yaxes(
        range=[-1.15, 1.15],
        tickvals=[-1, 0, 1],
        ticktext=["tension edge", "neutral axis", "compression edge"],
        gridcolor=GRID,
        zeroline=False,
        **NO_Y_SPIKE,
    )
    figure = _to_dict(fig)
    depth_axis = _axis(_col("depth"), "depth")
    figure["readout"] = _readout(
        "Strain and stress across the depth (illustrative)",
        {
            "x": _axis(strain_col, "ε / ε<sub>y</sub>"),
            "x2": _axis(stress_col, "σ"),
            "y": depth_axis,
            "y2": depth_axis,
        },
        tables,
    )
    return figure
