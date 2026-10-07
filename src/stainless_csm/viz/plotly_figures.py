"""Plotly figures as plain JSON-ready dicts. The web front end draws them with Plotly.js.

Two views of the same curve: schematic (key strains spaced evenly, like Figure B.1) and true
scale. Labels use HTML subscripts, which Plotly renders natively.
"""

import json
import re
from typing import Any

import plotly.graph_objects as go

from stainless_csm.config.national_annex import TENSION_STRAIN_RATIO_CAP
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


def stress_strain_figure(
    model: CSMBilinearModel,
    schematic: bool,
    tension: TensionResult | None = None,
) -> dict[str, Any]:
    """The B.4 curve against the classic elastic-plastic one; adds the B.6.1 point if given."""
    fy, fu = model.material.fy, model.material.fu
    eps_y, eps_c1, eps_end = model.yield_strain, model.strain_limit_c1, model.strain_end

    labelled = [(0.0, "0"), (eps_y, "ε_y"), (eps_c1, "C₁ε_u"), (eps_end, "C₂ε_u")]
    cap_15 = TENSION_STRAIN_RATIO_CAP * eps_y
    if tension is not None:
        labelled.append((tension.strain, "ε_csm,t"))
        if cap_15 <= eps_end:
            labelled.append((cap_15, "15ε_y"))
    axis = StrainAxis.build(labelled, schematic)
    x = axis.x

    fig = go.Figure()
    shapes: list[dict[str, Any]] = []
    annotations: list[dict[str, Any]] = []

    if tension is None:
        end_strain, end_stress, band = eps_end, fu, "Extra strength from strain hardening"
    else:
        end_strain, end_stress = tension.strain, tension.design_stress
        band = "Extra strength used in tension"
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

    classic = ElasticPerfectlyPlasticModel(model.material, eps_end).curve_points(60)
    fig.add_trace(
        go.Scatter(
            x=[x(e) for e, _ in classic],
            y=[s for _, s in classic],
            mode="lines",
            line={"color": MUTED, "width": 2, "dash": "dash"},
            name="Elastic-perfectly plastic (classic)",
            customdata=[[e, s] for e, s in classic],
            hovertemplate="strain = %{customdata[0]:.5f}<br>stress = %{customdata[1]:.1f} N/mm2"
            "<extra>classic</extra>",
        )
    )
    curve = model.curve_points(120)
    fig.add_trace(
        go.Scatter(
            x=[x(e) for e, _ in curve],
            y=[s for _, s in curve],
            mode="lines",
            line={"color": BLUE, "width": 2.5},
            name="CSM bilinear (B.4)",
            customdata=[[e, s] for e, s in curve],
            hovertemplate="strain = %{customdata[0]:.5f}<br>stress = %{customdata[1]:.1f} N/mm2"
            "<extra>CSM</extra>",
        )
    )

    marks = [
        (eps_y, fy, f"ε_y, f_y = {fy:g}", "bottom right"),
        (eps_c1, model.stress_at_strain_limit_c1, "C₁ε_u", "bottom right"),
        (eps_end, fu, f"C₂ε_u, f_u = {fu:g}", "top left"),
    ]
    for strain, stress, text, position in marks:
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
                hoverinfo="skip",
            )
        )

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
        _add_tension_marks(fig, shapes, annotations, x, model, tension, cap_15, eps_end)

    ticks, ticktext = axis.ticks(typeset_html)
    fig.update_layout(
        shapes=shapes,
        annotations=annotations,
        height=470,
        margin={"l": 10, "r": 10, "t": 20, "b": 10},
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        legend={"orientation": "h", "y": -0.3},
        hovermode="closest",
        xaxis={
            "title": {"text": "strain ε (not to scale)" if schematic else "strain ε (true scale)"},
            "tickvals": ticks,
            "ticktext": [t.replace("\n", "<br>") for t in ticktext],
            "range": [0, max(ticks) * 1.04],
            "gridcolor": GRID,
            "zeroline": False,
        },
        yaxis={
            "title": {"text": "stress σ [N/mm²]"},
            "range": [0, fu * 1.15],
            "gridcolor": GRID,
            "zeroline": False,
        },
    )
    return _to_dict(fig)


def _add_tension_marks(
    fig: go.Figure,
    shapes: list[dict[str, Any]],
    annotations: list[dict[str, Any]],
    x: Any,
    model: CSMBilinearModel,
    tension: TensionResult,
    cap_15: float,
    eps_end: float,
) -> None:
    fixed_governs = tension.governing is GoverningStrainLimit.FIXED_LIMIT_15
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
            hovertemplate=f"strain = {tension.strain:.5f}<br>"
            f"stress = {tension.design_stress:.1f} N/mm2<extra></extra>",
        )
    )


def base_curve_figure(result: DeformationResult) -> dict[str, Any]:
    """The B.6 / B.7 base curve with its zones, the cap, and the user's section as a marker."""
    family, lam = result.family, result.slenderness
    limits = LIMITS[family]
    plates = family is SectionFamily.FLAT_PLATES
    sub = "p,cs" if plates else "c,cs"
    cap = result.cap
    x_max = max(limits.upper * 1.3, lam * 1.08)
    y_max = cap * 1.18

    fig = go.Figure()
    shapes: list[dict[str, Any]] = []
    annotations: list[dict[str, Any]] = []

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

    # the formula before the cap, where the cap changes it
    raw_points = [
        (p, raw_ratio(family, p)) for p in _frange(0.1 if plates else 0.05, limits.switch)
    ]
    above = [(p, v) for p, v in raw_points if v > cap and v <= y_max * 1.0]
    if above:
        fig.add_trace(
            go.Scatter(
                x=[p for p, _ in above],
                y=[v for _, v in above],
                mode="lines",
                line={"color": MUTED, "width": 1.5, "dash": "dot"},
                name="Formula before the cap",
                hoverinfo="skip",
            )
        )
    points = curve_points(family, cap, 240)
    fig.add_trace(
        go.Scatter(
            x=[p for p, _ in points],
            y=[v for _, v in points],
            mode="lines",
            line={"color": BLUE, "width": 2.5},
            name=f"Base curve {'(B.6)' if plates else '(B.7)'} held to the cap",
            hovertemplate="slenderness = %{x:.3f}<br>strain ratio = %{y:.2f}<extra></extra>",
        )
    )

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
                hoverinfo="skip",
            )
        )
    else:
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

    fig.update_layout(
        shapes=shapes,
        annotations=annotations,
        height=430,
        margin={"l": 10, "r": 10, "t": 20, "b": 10},
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        legend={"orientation": "h", "y": -0.25},
        xaxis={
            "title": {"text": f"relative cross-section slenderness λ<sub>{sub}</sub>"},
            "range": [0, x_max],
            "gridcolor": GRID,
            "zeroline": False,
        },
        yaxis={
            "title": {"text": "strain limit ratio ε<sub>csm</sub> / ε<sub>y</sub>"},
            "range": [0, y_max],
            "gridcolor": GRID,
            "zeroline": False,
        },
    )
    return _to_dict(fig)


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
    x: list[float], y: list[float], text: list[str], position: list[str] | None, name: str
) -> dict[str, Any]:
    """Grey markers for the reference sections. Without `position` the names show on hover only."""
    trace: dict[str, Any] = {
        "type": "scatter",
        "x": x,
        "y": y,
        "mode": "markers" if position is None else "markers+text",
        "marker": {"color": MUTED, "size": 10, "line": {"color": "white", "width": 2}},
        "name": name,
    }
    if position is None:
        trace["text"] = text
        trace["hovertemplate"] = "%{text}<extra></extra>"
    else:
        trace["text"] = [typeset_html(t) for t in text]
        trace["textposition"] = position
        trace["hoverinfo"] = "skip"
    return trace


def comparison_base_curve_figure(comparison: Comparison) -> dict[str, Any]:
    """The base curve with your section and the reference sections marked on it."""
    figure = base_curve_figure(comparison.your_capacity)
    marks = [
        ref for ref in comparison.references if ref.key != "yours" and ref.point.capacity.allowed
    ]
    if marks:
        figure["data"].append(
            _reference_marker(
                [ref.point.slenderness for ref in marks],
                [float(ref.point.capacity.strain_ratio or 0.0) for ref in marks],
                [_REFERENCE_TEXT[ref.key] for ref in marks],
                [_REFERENCE_POSITION[ref.key] for ref in marks],
                "Reference sections",
            )
        )
    return figure


def comparison_stress_figure(model: CSMBilinearModel, comparison: Comparison) -> dict[str, Any]:
    """The B.4 curve against the classic one, with the stress each section is read at."""
    figure = stress_strain_figure(model, schematic=False)
    marks = [ref for ref in comparison.references if ref.point.stress is not None]
    yours = [ref for ref in marks if ref.key == "yours"]
    others = [ref for ref in marks if ref.key != "yours"]
    if others:
        figure["data"].append(
            _reference_marker(
                [float(ref.point.capacity.strain or 0.0) for ref in others],
                [float(ref.point.stress or 0.0) for ref in others],
                [_REFERENCE_TEXT[ref.key] for ref in others],
                None,
                "Reference sections",
            )
        )
    if yours:
        ref = yours[0]
        figure["data"].append(
            {
                "type": "scatter",
                "x": [ref.point.capacity.strain],
                "y": [ref.point.stress],
                "marker": {
                    "color": ORANGE,
                    "size": 13,
                    "symbol": "diamond",
                    "line": {"color": "white", "width": 2},
                },
                "text": ["your section"],
                "hovertemplate": "%{text}<extra></extra>",
                "mode": "markers",
                "name": "Your section",
            }
        )
    return figure
