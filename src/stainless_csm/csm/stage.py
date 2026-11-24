"""The frames of the Section Stage: the section loaded step by step, from zero strain to its limit.

Units: N, mm, N/mm². Every frame is a state the section passes through on its way to the strain
limit that B.5.1 (compression, bending) or B.14 (tension) gave. The browser shows a frame; it never
reads between two of them. Nothing here is a new formula: the stress is read from the B.4 curve of
the :class:`CSMBilinearModel` and the bending resistance comes from the callable the caller gives
(``moment_at`` of B.19 and B.20).

Signs: the profiles are drawn like the chart of ``bending_blocks_figure``, compression positive and
tension negative, with the normalised depth running from -1 (tension edge) to +1 (compression edge).
The scalars of a frame (`ratio`, `strain`, `stress`) are magnitudes at the extreme fibre. In pure
tension or compression every fibre carries the same strain, so both profiles are uniform.
"""

from collections.abc import Callable
from dataclasses import dataclass, replace
from enum import Enum

from stainless_csm.core import units
from stainless_csm.core.trace import EN_1993_1_4, CalcStep, Source, SourceKind
from stainless_csm.csm.stress_resultants import (
    SOURCE as RESULTANTS_SOURCE,
)
from stainless_csm.csm.stress_resultants import (
    Resultants,
    fibre_forces,
    fibre_table,
    neutral_axis,
    stress_resultants,
)
from stainless_csm.material_models.csm_bilinear import CSMBilinearModel
from stainless_csm.sections.properties import Loop, Point

# Equal steps from zero to the limit; the exact frames below are added to them.
FRAME_STEPS = 120
_BISECTION_STEPS = 100
# Two ratios closer than this (relative to the limit) are one frame.
_SAME_FRAME = 1e-9

STRAIN_SOURCE = (
    "Gere & Timoshenko, Mechanics of Materials, 2nd ed., eq. (10-1): plane sections stay plane"
)


class LoadCase(Enum):
    TENSION = "tension"
    COMPRESSION = "compression"
    BENDING = "bending"


class FrameMark(Enum):
    """What a frame is, where it is more than one step of the slider."""

    UNLOADED = "unloaded"  # zero strain
    FIRST_YIELD = "first_yield"  # ε/ε_y = 1, the extreme fibre reaches f_y
    PASSES_MPL = "passes_mpl"  # bending: the resistance reaches M_pl = W_pl f_y / γ_M0
    LIMIT = "limit"  # the strain limit of the section


@dataclass(frozen=True, slots=True)
class StageFrame:
    ratio: float  # ε / ε_y at the extreme fibre
    strain: float  # ε at the extreme fibre
    stress: float  # σ at the extreme fibre, read from the B.4 curve, N/mm²
    stress_over_yield: float | None  # σ / f_y − 1; None at or below the first yield
    depth: tuple[float, ...]  # normalised, -1 tension edge … +1 compression edge
    strain_profile: tuple[float, ...]  # ε / ε_y at each depth, compression positive
    stress_profile: tuple[float, ...]  # σ at each depth, N/mm², compression positive
    resistance: float | None  # bending only: what B.19 / B.20 give if the limit were here, N mm
    marks: tuple[FrameMark, ...]
    # Textbook, never a resistance (plan.md 4i). Bending: the forces of the stress block over the
    # section outline; None when there is no outline. Tension and compression: axial_force, the
    # one resultant σ A in N, compression positive; None when no area is given.
    resultants: Resultants | None = None
    axial_force: float | None = None
    # bending: ∫σ dA from the nearer edge to each of the fibres of `StageFrames.fibre_depth`, N
    fibre_force: tuple[float, ...] | None = None


@dataclass(frozen=True, slots=True)
class StageFrames:
    load_case: LoadCase
    yield_strain: float  # ε_y
    yield_stress: float  # f_y
    frames: tuple[StageFrame, ...]  # ascending ratio; the first is unloaded, the last is the limit
    source: Source
    # the working of the forces at the limit frame (textbook, plan.md 4i); empty without them
    resultants_working: tuple[CalcStep, ...] = ()
    # the fibres the hover reads (normalised depth) and the section's width at each, mm
    fibre_depth: tuple[float, ...] = ()
    fibre_width: tuple[float, ...] = ()


def _ratios(limit: float, specials: list[float]) -> list[float]:
    """Equal steps from 0 to `limit`, with every special ratio present exactly."""
    exact = sorted({0.0, limit, *(r for r in specials if 0 < r < limit)})
    steps = [limit * i / FRAME_STEPS for i in range(FRAME_STEPS + 1)]
    tolerance = max(limit, 1.0) * _SAME_FRAME
    extra = [r for r in steps if all(abs(r - e) > tolerance for e in exact)]
    return sorted(exact + extra)


def _marks(ratio: float, limit: float, passes_mpl: float | None) -> tuple[FrameMark, ...]:
    marks = []
    if ratio == 0:
        marks.append(FrameMark.UNLOADED)
    if ratio == 1.0:
        marks.append(FrameMark.FIRST_YIELD)
    if passes_mpl is not None and ratio == passes_mpl:
        marks.append(FrameMark.PASSES_MPL)
    if ratio == limit:
        marks.append(FrameMark.LIMIT)
    return tuple(marks)


def _stress_at_ratio(model: CSMBilinearModel, ratio: float) -> float:
    """σ on the B.4 curve at ε = ratio × ε_y, a magnitude."""
    return model.stress_at(ratio * model.yield_strain)


def _over_yield(model: CSMBilinearModel, stress: float) -> float | None:
    fy = model.material.fy
    return stress / fy - 1 if stress > fy else None


def _frames(
    model: CSMBilinearModel,
    case: LoadCase,
    limit: float,
    uniform_sign: int | None,
    source: Source,
    moment: Callable[[float], float] | None = None,
    passes_mpl: float | None = None,
) -> StageFrames:
    """`uniform_sign` +1 compression, -1 tension (every fibre alike); None for bending."""
    eps_y = model.yield_strain
    specials = [1.0] + ([passes_mpl] if passes_mpl is not None else [])
    out = []
    for ratio in _ratios(limit, specials):
        stress = _stress_at_ratio(model, ratio)
        depth: tuple[float, ...]
        strain_profile: tuple[float, ...]
        stress_profile: tuple[float, ...]
        if uniform_sign is not None:
            depth = (-1.0, 1.0)
            strain_profile = (uniform_sign * ratio,) * 2
            stress_profile = (uniform_sign * stress,) * 2
        else:
            # the strain is a straight line through the neutral axis; past yield the stress block
            # has a corner where the fibres reach f_y, at depth 1 / ratio
            depth = (-1.0, 1.0) if ratio <= 1 else (-1.0, -1 / ratio, 1 / ratio, 1.0)
            strain_profile = tuple(ratio * u for u in depth)
            stress_profile = tuple(
                (1 if u >= 0 else -1) * _stress_at_ratio(model, abs(e))
                for u, e in zip(depth, strain_profile, strict=True)
            )
        out.append(
            StageFrame(
                ratio=ratio,
                strain=ratio * eps_y,
                stress=stress,
                stress_over_yield=_over_yield(model, stress),
                depth=depth,
                strain_profile=strain_profile,
                stress_profile=stress_profile,
                resistance=None if moment is None else moment(ratio),
                marks=_marks(ratio, limit, passes_mpl),
            )
        )
    return StageFrames(case, eps_y, model.material.fy, tuple(out), source)


_CURVE = f"{EN_1993_1_4}, B.4 (stress read from the CSM curve at each strain)"


def tension_frames(model: CSMBilinearModel, limit: float) -> StageFrames:
    """Tension, up to ε_csm,t / ε_y = `limit` (B.14): every fibre carries the same strain."""
    source = Source(
        SourceKind.CODE,
        f"{_CURVE}; uniform strain up to the limit of B.6.1(1), Formula (B.14)",
    )
    return _frames(model, LoadCase.TENSION, limit, -1, source)


def compression_frames(model: CSMBilinearModel, limit: float) -> StageFrames:
    """Compression, up to ε_csm / ε_y = `limit` (B.5.1): every fibre carries the same strain."""
    source = Source(
        SourceKind.CODE,
        f"{_CURVE}; uniform strain up to the limit of B.5.1 and B.6.2(1)",
    )
    return _frames(model, LoadCase.COMPRESSION, limit, 1, source)


def passes_plastic_moment(
    moment: Callable[[float], float], limit: float, plastic_moment: float
) -> float | None:
    """The strain ratio in (1, limit] where `moment` (B.19 / B.20) reaches M_pl, or None.

    Found by bisection on the engine's own ``moment_at``, which rises with the strain ratio.
    """
    if moment(1.0) >= plastic_moment or moment(limit) < plastic_moment:
        return None
    low, high = 1.0, limit
    for _ in range(_BISECTION_STEPS):
        middle = 0.5 * (low + high)
        if moment(middle) < plastic_moment:
            low = middle
        else:
            high = middle
    return high


def bending_frames(
    model: CSMBilinearModel,
    limit: float,
    moment: Callable[[float], float],
    plastic_moment: float,
) -> StageFrames:
    """Bending of a section symmetric about its neutral axis, up to ε_csm / ε_y = `limit`.

    `moment(ratio)` is the engine's ``moment_at`` (Formula B.19 below 1.0, B.20 from 1.0) with the
    inputs of this section; each frame carries what it gives if the limit were at that frame. An
    extra frame sits where the resistance reaches M_pl.
    """
    source = Source(
        SourceKind.DERIVED,
        f"strain: {STRAIN_SOURCE}; stress: {_CURVE}; resistance: {EN_1993_1_4}, B.6.3.2(1), "
        "Formulae (B.19) and (B.20); illustrative symmetric section",
    )
    passes = passes_plastic_moment(moment, limit, plastic_moment)
    return _frames(model, LoadCase.BENDING, limit, None, source, moment, passes)


def with_resultants(frames: StageFrames, loops: list[Loop], normal: Point) -> StageFrames:
    """The frames with the forces of each stress block over the outline (Gere eqs. 10-3, 10-4).

    `normal` points from the tension edge to the compression edge. Raises ValueError for a section
    that is not symmetric about the bending axis.
    """
    axis = neutral_axis(loops, normal)
    table = fibre_table(loops, normal, axis)
    out = tuple(
        replace(
            f,
            resultants=stress_resultants(
                loops, normal, f.depth, f.stress_profile, frames.yield_stress, axis
            ),
            fibre_force=fibre_forces(table, loops, normal, f.depth, f.stress_profile),
        )
        for f in frames.frames
    )
    source = Source(
        SourceKind.DERIVED,
        f"{frames.source.citation}; forces of the drawn stress block: {RESULTANTS_SOURCE}",
    )
    return replace(
        frames,
        frames=out,
        source=source,
        resultants_working=_working(out[-1].resultants),
        fibre_depth=table.depth,
        fibre_width=table.width,
    )


def _working(r: Resultants | None) -> tuple[CalcStep, ...]:
    """The lines of working for the forces at the limit frame, each citing Gere."""
    if r is None:
        return ()
    gere = "Gere & Timoshenko, Mechanics of Materials, 2nd ed."

    def step(
        symbol: str,
        text: str,
        clause: str,
        formula: str,
        substituted: str,
        value: float,
        unit: str,
        page: str,
    ) -> CalcStep:
        return CalcStep(
            symbol,
            text,
            clause,
            formula,
            substituted,
            value,
            unit,
            source=Source(SourceKind.TEXTBOOK, f"{gere}, {clause}, {page}"),
        )

    # In a band σ = a + b z; A, S and I are its area and its first and second moments about the
    # neutral axis, so a band gives F = a A + b S and M = a S + b I.
    bands = "Σ (a A + b S) over the bands"
    return (
        step(
            "F_c",
            "Compression force of the stress block",
            "eq. (10-3)",
            "∫σ dA, compression side",
            bands,
            r.force_compression,
            units.FORCE,
            "p. 516",
        ),
        step(
            "F_t",
            "Tension force of the stress block",
            "eq. (10-3)",
            "∫σ dA, tension side",
            bands,
            r.force_tension,
            units.FORCE,
            "p. 516",
        ),
        step(
            "d_c + d_t",
            "Lever arm between the two forces",
            "Fig. 10-4, eq. (10-8)",
            "∫σ y dA / ∫σ dA on each side, added",
            f"{r.distance_compression:.6g} + {r.distance_tension:.6g}",
            r.lever_arm,
            units.LENGTH,
            "pp. 518-519",
        ),
        step(
            "M_block",
            "Moment of the drawn stress block",
            "eq. (10-4)",
            "∫σ y dA",
            "Σ (a S + b I) over the bands",
            r.moment,
            units.MOMENT,
            "p. 517",
        ),
    )


def with_axial_force(frames: StageFrames, area: float) -> StageFrames:
    """The frames with the one resultant of a uniform stress, σ A (the term of B.12, B.15, B.16)."""
    out = tuple(replace(f, axial_force=f.stress_profile[0] * area) for f in frames.frames)
    return replace(frames, frames=out)
