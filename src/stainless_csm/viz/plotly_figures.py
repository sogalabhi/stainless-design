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


def stress_strain_figure(
    model: CSMBilinearModel,
    schematic: bool,
    tension: TensionResult | None = None,
    compression: CompressionResult | None = None,
) -> dict[str, Any]:
    """The B.4 curve against the classic elastic-plastic one; adds the B.6.1 point if given, or
    the B.6.2 compression point (ε_csm, f_csm) if that is given."""
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

    fig = go.Figure()
    shapes: list[dict[str, Any]] = []
    annotations: list[dict[str, Any]] = []

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
    if compression is not None and compression_strain is not None:
        _add_compression_mark(fig, shapes, x, model, compression, compression_strain)

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


def compression_point_figure(
    model: CSMBilinearModel, schematic: bool, result: CompressionResult
) -> dict[str, Any]:
    """The B.4 curve with the B.6.2 point (ε_csm, f_csm); f_y up to f_csm is shaded."""
    return stress_strain_figure(model, schematic, compression=result)


def _add_compression_mark(
    fig: go.Figure,
    shapes: list[dict[str, Any]],
    x: Any,
    model: CSMBilinearModel,
    compression: CompressionResult,
    strain: float,
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
            hovertemplate=f"strain = {strain:.5f}<br>stress = {stress:.1f} N/mm2<extra></extra>",
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
    hover = (
        "λ = %{x:.3f}<br>N<sub>csm,Rd</sub> / (A f<sub>y</sub> / γ<sub>M0</sub>) = %{y:.3f}"
        "<br>ε<sub>csm</sub> / ε<sub>y</sub> = %{customdata:.3f}<extra></extra>"
    )
    for name, branch, dash, width in (
        ("Formula B.16 (ε<sub>csm</sub>/ε<sub>y</sub> ≥ 1, with B.17)", b16, "solid", 3),
        ("Formula B.15 (ε<sub>csm</sub>/ε<sub>y</sub> &lt; 1)", b15, "dash", 2.5),
    ):
        if not branch:
            continue
        fig.add_trace(
            go.Scatter(
                x=[row[0] for row in branch],
                y=[row[1] for row in branch],
                customdata=[row[2] for row in branch],
                mode="lines",
                line={"color": BLUE, "width": width, "dash": dash},
                name=name,
                hovertemplate=hover,
            )
        )

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
        fig.add_trace(
            go.Scatter(
                x=[junction],
                y=[capacity_ratio(model, 1.0)],
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
                hovertemplate=f"λ = {junction:.4f}<br>ε<sub>csm</sub>/ε<sub>y</sub> = 1"
                "<extra></extra>",
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
            hoverinfo="skip",
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
        xaxis={
            "title": {"text": f"relative cross-section slenderness λ<sub>{sub}</sub>"},
            "range": [0, x_max],
            "gridcolor": GRID,
            "zeroline": False,
        },
        yaxis={
            "title": {"text": "N<sub>csm,Rd</sub> / (A f<sub>y</sub> / γ<sub>M0</sub>)"},
            "range": [0, y_max],
            "gridcolor": GRID,
            "zeroline": False,
        },
    )
    return _to_dict(fig)


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

    def at(ratio: float) -> tuple[float, float]:
        return ratio, moment_at(model, ratio, w_el, w_pl, result.alpha, gamma_m0) * _KNM

    below = [at(r) for r in grid if r < 1] + [at(1.0)]
    above = [at(1.0)] + [at(r) for r in grid if r > 1]

    fig = go.Figure()
    shapes: list[dict[str, Any]] = []
    annotations: list[dict[str, Any]] = []
    hover = (
        "ε<sub>csm</sub> / ε<sub>y</sub> = %{x:.3f}"
        "<br>M<sub>csm,c,Rd</sub> = %{y:.2f} kN m<extra></extra>"
    )
    for name, branch, dash, width in (
        ("Formula B.20 (ε<sub>csm</sub>/ε<sub>y</sub> ≥ 1)", above, "solid", 3),
        ("Formula B.19 (ε<sub>csm</sub>/ε<sub>y</sub> &lt; 1)", below, "dash", 2.5),
    ):
        if len(branch) < 2:
            continue
        fig.add_trace(
            go.Scatter(
                x=[row[0] for row in branch],
                y=[row[1] for row in branch],
                mode="lines",
                line={"color": BLUE, "width": width, "dash": dash},
                name=name,
                hovertemplate=hover,
            )
        )

    f_gamma = "f<sub>y</sub> / γ<sub>M0</sub>"
    for level, text, anchor in (
        (result.elastic_moment * _KNM, f"M<sub>el</sub> = W<sub>el</sub> {f_gamma}", "top"),
        (result.plastic_moment * _KNM, f"M<sub>pl</sub> = W<sub>pl</sub> {f_gamma}", "bottom"),
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
        )
    )

    top = max(result.plastic_moment * _KNM, max(row[1] for row in above))
    fig.update_layout(
        shapes=shapes,
        annotations=annotations,
        height=450,
        margin={"l": 10, "r": 10, "t": 20, "b": 10},
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        legend={"orientation": "h", "y": -0.25},
        xaxis={
            "title": {"text": "strain limit ε<sub>csm</sub> / ε<sub>y</sub>"},
            "range": [0, x_max],
            "gridcolor": GRID,
            "zeroline": False,
        },
        yaxis={
            "title": {"text": "M<sub>csm,c,Rd</sub> [kN m]"},
            "range": [0, top * 1.15],
            "gridcolor": GRID,
            "zeroline": False,
        },
    )
    return _to_dict(fig)


def bending_blocks_figure(model: CSMBilinearModel, result: BendingResult) -> dict[str, Any]:
    """Strain and stress across the depth when the compression edge reaches ε_csm.

    Illustrative: a section symmetric about its neutral axis, depth scaled to -1 (tension edge) to
    +1 (compression edge). The strain is a straight line; the stress at each depth is read from
    the B.4 curve (elastic to f_y, then the hardening line). The moment itself comes from B.19 or
    B.20, not from integrating this block.
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

    fig = make_subplots(
        rows=1,
        cols=2,
        shared_yaxes=True,
        horizontal_spacing=0.05,
        subplot_titles=("strain ε / ε<sub>y</sub>", "stress σ [N/mm²]"),
    )
    for col, xs, color, name, unit in (
        (1, strains, ORANGE, "Strain", ""),
        (2, stresses, BLUE, "Stress", " N/mm²"),
    ):
        fig.add_trace(
            go.Scatter(
                x=[0, *xs, 0],
                y=[-1, *depths, 1],
                mode="lines",
                fill="toself",
                line={"color": color, "width": 2.5},
                fillcolor="rgba(235, 104, 52, 0.18)" if col == 1 else BLUE_FILL,
                name=name,
                hovertemplate=f"depth = %{{y:.2f}}<br>{name.lower()} = %{{x:.4g}}{unit}"
                "<extra></extra>",
            ),
            row=1,
            col=col,
        )
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
    )
    fig.update_xaxes(gridcolor=GRID, zeroline=False)
    fig.update_xaxes(range=[-reach, reach], row=1, col=1)
    fig.update_xaxes(range=[-stress_reach, stress_reach], row=1, col=2)
    fig.update_yaxes(
        range=[-1.15, 1.15],
        tickvals=[-1, 0, 1],
        ticktext=["tension edge", "neutral axis", "compression edge"],
        gridcolor=GRID,
        zeroline=False,
    )
    return _to_dict(fig)

