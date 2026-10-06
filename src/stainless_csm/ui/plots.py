"""Matplotlib figures. They draw onto a Figure they are given, so they work in the Qt canvas
and in plain tests alike.

Two views of the same curve:
- schematic: the key strains are spaced evenly (like Figure B.1) and labelled "not to scale";
- true scale: real strains, where the elastic part is a thin sliver at the left.

Both curves are straight lines between the labelled strains, so a few vertices draw them exactly.
"""

import re

from matplotlib.axes import Axes
from matplotlib.figure import Figure

from stainless_csm.config.national_annex import TENSION_STRAIN_RATIO_CAP
from stainless_csm.csm.tension import GoverningStrainLimit, TensionResult
from stainless_csm.material_models.csm_bilinear import CSMBilinearModel
from stainless_csm.ui.theme import BLUE, MUTED, ORANGE, Theme
from stainless_csm.viz.axis import StrainAxis

_SYMBOL_RUN = re.compile(r"[A-Za-zεσ₁₂₃0-9,_]+")
_SUBSCRIPT_DIGITS = {"₁": "_{1}", "₂": "_{2}", "₃": "_{3}"}


def mt(text: str) -> str:
    """Typeset symbols such as ε_csm,t or C₁ε_u with matplotlib mathtext subscripts."""

    def convert(match: re.Match[str]) -> str:
        run = match.group(0)
        trailing = ""
        while run.endswith(","):
            run, trailing = run[:-1], trailing + ","
        if not any(c in run for c in "_εσ₁₂₃"):
            return match.group(0)
        run = re.sub(r"_([A-Za-z0-9,]+)", r"_{\1}", run)
        for char, replacement in _SUBSCRIPT_DIGITS.items():
            run = run.replace(char, replacement)
        run = run.replace("ε", r"\varepsilon ").replace("σ", r"\sigma ")
        return f"${run.strip()}${trailing}"

    return _SYMBOL_RUN.sub(convert, text)


def _style(fig: Figure, ax: Axes, theme: Theme) -> None:
    fig.set_facecolor(theme.surface)
    ax.set_facecolor(theme.surface)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    for side in ("left", "bottom"):
        ax.spines[side].set_color(MUTED)
    ax.tick_params(colors=theme.text, labelsize=9)
    ax.xaxis.label.set_color(theme.text)
    ax.yaxis.label.set_color(theme.text)
    ax.title.set_color(theme.text)
    ax.grid(True, color=theme.grid, linewidth=0.8)
    ax.set_axisbelow(True)


def draw_stress_strain(
    fig: Figure,
    model: CSMBilinearModel,
    schematic: bool,
    theme: Theme,
    tension: TensionResult | None = None,
) -> None:
    """The B.4 curve against the classic elastic–plastic one; adds the B.6.1 point if given."""
    fig.clear()
    fig.set_layout_engine("constrained")
    ax = fig.add_subplot()
    _style(fig, ax, theme)

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

    # extra strength: triangle between the classic line and the hardening line
    if tension is None:
        end_strain, end_stress = eps_end, fu
        band_name = "Extra strength from strain hardening"
    else:
        end_strain, end_stress = tension.strain, tension.design_stress
        band_name = "Extra strength used in tension"
    ax.fill(
        [x(eps_y), x(end_strain), x(end_strain)],
        [fy, end_stress, fy],
        color=BLUE,
        alpha=0.20,
        linewidth=0,
        label=band_name,
    )

    ax.plot(
        [0, x(eps_y), x(eps_end)],
        [0, fy, fy],
        color=MUTED,
        linestyle="--",
        linewidth=1.8,
        label="Elastic–perfectly plastic (classic)",
    )
    points = model.key_points()
    ax.plot(
        [x(e) for e, _ in points],
        [s for _, s in points],
        color=BLUE,
        linewidth=2.5,
        label="CSM bilinear (B.4)",
    )

    # key points with labels and dotted guides down to the axes
    marks = [
        (eps_y, fy, f"ε_y, f_y = {fy:g}", (8, -16), "left"),
        (eps_c1, model.stress_at_strain_limit_c1, "C₁ε_u", (8, -16), "left"),
        (eps_end, fu, f"C₂ε_u, f_u = {fu:g}", (-6, 8), "right"),
    ]
    for strain, stress, text, offset, align in marks:
        ax.plot([x(strain)] * 2, [0, stress], ":", color=MUTED, linewidth=1)
        ax.plot([0, x(strain)], [stress] * 2, ":", color=MUTED, linewidth=1)
        ax.plot(
            [x(strain)],
            [stress],
            "o",
            color=BLUE,
            markersize=7,
            markeredgecolor=theme.surface,
            markeredgewidth=1.5,
            zorder=5,
        )
        ax.annotate(
            mt(text),
            (x(strain), stress),
            xytext=offset,
            textcoords="offset points",
            ha=align,
            fontsize=9,
            color=theme.text,
        )

    # slope labels
    ax.annotate(
        "E",
        (x(eps_y / 2), fy / 2),
        xytext=(8, -8),
        textcoords="offset points",
        ha="left",
        fontsize=10,
        color=theme.text,
    )
    mid = (eps_y + eps_end) / 2
    ax.annotate(
        mt("E_sh"),
        (x(mid), model.stress_at(mid)),
        xytext=(0, -18),
        textcoords="offset points",
        ha="center",
        fontsize=10,
        color=theme.text,
    )

    if tension is not None:
        _add_tension_marks(ax, axis, model, tension, cap_15, eps_end, theme)

    ticks, ticktext = axis.ticks(mt)
    ax.set_xticks(ticks, ticktext)
    ax.set_xlim(0, max(ticks) * 1.04)
    ax.set_ylim(0, fu * 1.15)
    ax.set_xlabel(mt("strain ε (not to scale)" if schematic else "strain ε (true scale)"))
    ax.set_ylabel(mt("stress σ [N/mm²]"))

    handles, labels = ax.get_legend_handles_labels()
    fig.legend(
        handles,
        [mt(label) for label in labels],
        loc="outside lower center",
        ncol=2,
        frameon=False,
        labelcolor=theme.text,
        fontsize=9,
    )


def _add_tension_marks(
    ax: Axes,
    axis: StrainAxis,
    model: CSMBilinearModel,
    tension: TensionResult,
    cap_15: float,
    eps_end: float,
    theme: Theme,
) -> None:
    x = axis.x
    fixed_governs = tension.governing is GoverningStrainLimit.FIXED_LIMIT_15
    caps = [
        (cap_15, fixed_governs),
        (model.strain_limit_c1, not fixed_governs),
    ]
    for strain, governs in caps:
        if strain > eps_end:
            continue
        ax.axvline(
            x(strain),
            color=ORANGE if governs else MUTED,
            linewidth=2.5 if governs else 1.5,
            linestyle="-" if governs else "--",
            zorder=2,
        )
        ax.annotate(
            "governs" if governs else "not governing",
            (x(strain), 0.03),
            xycoords=("data", "axes fraction"),
            xytext=(-5, 0),
            textcoords="offset points",
            ha="right",
            va="bottom",
            rotation=90,
            fontsize=8,
            color=theme.text,
        )

    ax.plot([0, x(tension.strain)], [tension.design_stress] * 2, ":", color=ORANGE, linewidth=1.5)
    ax.plot(
        [x(tension.strain)],
        [tension.design_stress],
        "D",
        color=ORANGE,
        markersize=9,
        markeredgecolor=theme.surface,
        markeredgewidth=1.5,
        zorder=6,
        label="Tension limit ε_csm,t",
    )
    ax.annotate(
        mt(f"f_csm,t = {tension.design_stress:.1f}"),
        (x(tension.strain), tension.design_stress),
        xytext=(12, -4),
        textcoords="offset points",
        ha="left",
        va="center",
        fontsize=9,
        color=theme.text,
    )
