"""Resultant forces of the drawn stress block, by integrating the stress over the section outline.

Not a rule of EN 1993-1-4 and never used for a resistance: M_csm,c,Rd stays the value of B.19 and
B.20. This is the textbook picture of the stress block, with the stress of each frame of the Stage
(csm/stage.py) read from the B.4 curve.

Source (Derived), Gere & Timoshenko, Mechanics of Materials, 2nd ed.:
  eq. (10-3), p. 516   F = ∫ σ dA            the force over a part of the section
  eq. (10-4), p. 517   M = ∫ σ y dA          the moment about the neutral axis
  Fig. 10-4, eq. (10-8), pp. 518-519         T and C at the centroids of the two areas
  Fig. 10-7, eq. (b), p. 521                 elastic core and plastic zone
Gere's C and T are written F_c and F_t here, because C₁, C₂ and C₃ are the Table B.1 coefficients.

Method. The frame's stress is a straight line between its corner depths. Cut the outline by lines
parallel to the bending axis at those depths and at the neutral axis. In one band σ = a + b z, with
z measured from the neutral axis, so with the band's area A, first moment S and second moment I
about it (Green's theorem, `band_moments`):
    force of the band    F = a A + b S
    moment of the band   M = a S + b I
This is exact for the polygon: no quadrature and no step size.

Units: N, mm, N/mm². Compression positive, as in the frames. The tension edge is at the lowest z.

Scope: the neutral axis is at mid-depth, which holds for bending about an axis of symmetry
(B.6.3.2). The unsymmetric case needs the neutral axis from ∫σ dA = 0 and is a later phase.
"""

import itertools
from dataclasses import dataclass
from typing import Literal

from stainless_csm.sections.properties import Loop, Point, band_moments

SOURCE = (
    "Gere & Timoshenko, Mechanics of Materials, 2nd ed., eq. (10-3) p. 516, eq. (10-4) p. 517, "
    "Fig. 10-4 and eq. (10-8) pp. 518-519, Fig. 10-7 and eq. (b) p. 521"
)

Side = Literal["compression", "tension"]

_SYMMETRY_TOLERANCE = 1e-6
_BALANCE_TOLERANCE = 1e-6


@dataclass(frozen=True, slots=True)
class ForcePart:
    """One part of the stress block: its force, and the distance of that force from the axis."""

    name: str  # "elastic core", "yielded zone" or "hardening"
    side: Side
    force: float  # N, a magnitude
    distance: float  # mm from the neutral axis, to the centroid of the part
    moment: float  # N mm about the neutral axis


@dataclass(frozen=True, slots=True)
class Resultants:
    force_compression: float  # F_c, N
    force_tension: float  # F_t, N, a magnitude
    distance_compression: float  # z_c, mm from the neutral axis
    distance_tension: float  # z_t, mm from the neutral axis
    lever_arm: float  # z_c + z_t, mm
    moment: float  # moment of the drawn block, ∫ σ z dA, N mm
    balance: float  # |F_c - F_t| / max(F_c, F_t); zero when the axis is the neutral axis
    parts: tuple[ForcePart, ...]


@dataclass(frozen=True, slots=True)
class _Band:
    name: str
    side: Side
    low: float  # z
    high: float  # z
    a: float  # σ = a + b z
    b: float


def _extent(loops: list[Loop], normal: Point) -> tuple[float, float]:
    values = [normal[0] * y + normal[1] * z for loop in loops for y, z in loop]
    return min(values), max(values)


def _bands(
    depth: tuple[float, ...],
    stress: tuple[float, ...],
    half: float,
    yield_stress: float,
    neutral_depth: float = 0.0,
) -> list[_Band]:
    """The frame's polyline cut at the neutral axis, with the yielded and hardening parts apart.

    z is measured from the neutral axis, which lies at `neutral_depth` on the normalised scale.
    """
    n = len(depth) - 1
    out: list[_Band] = []
    for i in range(n):
        u1, u2 = depth[i], depth[i + 1]
        s1, s2 = stress[i], stress[i + 1]
        z1, z2 = (u1 - neutral_depth) * half, (u2 - neutral_depth) * half
        b = (s2 - s1) / (z2 - z1)
        a = s1 - b * z1
        # a segment whose two ends are both at or above f_y, on one side of zero, is an edge band
        # (held at f_y, with the strain hardening above it); every other segment is the elastic core
        held = yield_stress * (1 - 1e-9)
        edge = abs(s1) >= held and abs(s2) >= held and s1 * s2 > 0
        for low, high in ((z1, min(z2, 0.0)), (max(z1, 0.0), z2)):
            if high <= low:
                continue
            side: Side = "compression" if low >= 0 else "tension"
            if not edge:
                out.append(_Band("elastic core", side, low, high, a, b))
                continue
            sign = 1.0 if side == "compression" else -1.0
            constant = sign * yield_stress
            out.append(_Band("yielded zone", side, low, high, constant, 0.0))
            out.append(_Band("hardening", side, low, high, a - constant, b))
    return out


@dataclass(frozen=True, slots=True)
class NeutralAxis:
    """Where the neutral axis lies along `normal`, and the half depth of the section."""

    normal: Point
    centre: float  # normal · p on the neutral axis
    half: float  # mm, from the neutral axis to each edge


def mid_depth(loops: list[Loop], normal: Point) -> NeutralAxis:
    """Mid-depth along `normal` and the half depth: the scale the frames' depth is measured on."""
    low, high = _extent(loops, normal)
    return NeutralAxis(normal, (low + high) / 2, (high - low) / 2)


def neutral_axis(loops: list[Loop], normal: Point) -> NeutralAxis:
    """Mid-depth along `normal`, after checking the two halves have the same area.

    Raises ValueError for a section that is not symmetric about the bending axis: the neutral axis
    of such a section is not at mid-depth, and `equilibrium_state` finds it instead.
    """
    axis = mid_depth(loops, normal)
    centre, half = axis.centre, axis.half
    whole = band_moments(loops, normal, centre, -half, half)
    above = band_moments(loops, normal, centre, 0.0, half).area
    below = band_moments(loops, normal, centre, -half, 0.0).area
    if abs(above - below) > _SYMMETRY_TOLERANCE * whole.area:
        raise ValueError(
            "the section is not symmetric about the bending axis; the neutral axis of an "
            "unsymmetric section is not built yet"
        )
    return NeutralAxis(normal, centre, half)


def stress_resultants(
    loops: list[Loop],
    normal: Point,
    depth: tuple[float, ...],
    stress_profile: tuple[float, ...],
    yield_stress: float,
    axis: NeutralAxis | None = None,
    neutral_depth: float = 0.0,
) -> Resultants:
    """The forces of a frame's stress block over the outline `loops`.

    `normal` is the unit vector from the tension edge to the compression edge (for sagging bending
    about the major axis of a section drawn z up, (0, 1)). `depth` and `stress_profile` are the
    frame's own: normalised depth from -1 to +1 and σ in N/mm², compression positive. Give `axis`
    (from `neutral_axis`, or `mid_depth` with a `neutral_depth` from equilibrium) to avoid finding
    it again for every frame of one section. `neutral_depth` is where the frame's neutral axis lies
    on the normalised depth scale; 0 is mid-depth.
    """
    axis = axis or neutral_axis(loops, normal)
    half = axis.half
    centre = axis.centre + neutral_depth * half
    parts: list[ForcePart] = []
    for band in _bands(depth, stress_profile, half, yield_stress, neutral_depth):
        m = band_moments(loops, normal, centre, band.low, band.high)
        force = band.a * m.area + band.b * m.first
        moment = band.a * m.first + band.b * m.second
        # σ and z share a sign in every band, so the moment is positive on both sides and the
        # force is positive in compression and negative in tension; the force is kept as a
        # magnitude
        magnitude = force if band.side == "compression" else -force
        if magnitude == 0.0:
            continue
        parts.append(ForcePart(band.name, band.side, magnitude, moment / magnitude, moment))
    f_c = sum(p.force for p in parts if p.side == "compression")
    f_t = sum(p.force for p in parts if p.side == "tension")
    m_c = sum(p.moment for p in parts if p.side == "compression")
    m_t = sum(p.moment for p in parts if p.side == "tension")
    z_c = m_c / f_c if f_c else 0.0
    z_t = m_t / f_t if f_t else 0.0
    biggest = max(f_c, f_t)
    return Resultants(
        force_compression=f_c,
        force_tension=f_t,
        distance_compression=z_c,
        distance_tension=z_t,
        lever_arm=z_c + z_t,
        moment=m_c + m_t,
        balance=abs(f_c - f_t) / biggest if biggest else 0.0,
        parts=tuple(parts),
    )


# --- the force carried out to each fibre, for the Stage's hover ------------------------------

FIBRE_STEPS = 80  # slabs across the depth; 81 fibres


@dataclass(frozen=True, slots=True)
class FibreTable:
    """The section cut into `FIBRE_STEPS` equal slabs across its depth, once for all frames.

    `area[i]` and `first[i]` are the area and the first moment about the neutral axis of slab i,
    which runs from depth `depth[i]` to `depth[i + 1]` (normalised, -1 tension edge to +1
    compression edge). `width[j]` is the section's width at fibre j, the mean of its two slabs (mm).
    """

    axis: NeutralAxis
    depth: tuple[float, ...]
    area: tuple[float, ...]
    first: tuple[float, ...]
    width: tuple[float, ...]


def fibre_table(loops: list[Loop], normal: Point, axis: NeutralAxis) -> FibreTable:
    depth = tuple(-1.0 + 2.0 * i / FIBRE_STEPS for i in range(FIBRE_STEPS + 1))
    area: list[float] = []
    first: list[float] = []
    for i in range(FIBRE_STEPS):
        m = band_moments(loops, normal, axis.centre, depth[i] * axis.half, depth[i + 1] * axis.half)
        area.append(m.area)
        first.append(m.first)
    step = 2 * axis.half / FIBRE_STEPS
    slab_width = [a / step for a in area]
    width = tuple(
        slab_width[0]
        if j == 0
        else slab_width[-1]
        if j == FIBRE_STEPS
        else (slab_width[j - 1] + slab_width[j]) / 2
        for j in range(FIBRE_STEPS + 1)
    )
    return FibreTable(axis, depth, tuple(area), tuple(first), width)


def fibre_forces(
    table: FibreTable,
    loops: list[Loop],
    normal: Point,
    depth: tuple[float, ...],
    stress_profile: tuple[float, ...],
    neutral_depth: float = 0.0,
) -> tuple[float, ...]:
    """The force carried from the nearer edge to each fibre, N, a magnitude: ∫σ dA over the part of
    the section between that edge and the fibre (Gere eq. 10-3 on a part of the section).

    A slab with a corner of the stress diagram inside it is cut there, so σ = a + b z holds on every
    piece and the force of a piece is a A + b S, exactly.
    """
    axis = table.axis
    half = axis.half
    zs = [u * half for u in depth]
    pieces = []
    for i in range(len(depth) - 1):
        b = (stress_profile[i + 1] - stress_profile[i]) / (zs[i + 1] - zs[i])
        pieces.append((zs[i], zs[i + 1], stress_profile[i] - b * zs[i], b))
    tolerance = 1e-9 * half

    def piece_at(z: float) -> tuple[float, float]:
        for low, high, a, b in pieces:
            if low - tolerance <= z <= high + tolerance:
                return a, b
        return pieces[-1][2], pieces[-1][3]

    slab: list[float] = []
    for i in range(FIBRE_STEPS):
        low, high = table.depth[i] * half, table.depth[i + 1] * half
        inside = [z for z in zs[1:-1] if low + tolerance < z < high - tolerance]
        if not inside:
            a, b = piece_at((low + high) / 2)
            slab.append(a * table.area[i] + b * table.first[i])
            continue
        edges = [low, *inside, high]
        total = 0.0
        for lo, hi in itertools.pairwise(edges):
            m = band_moments(loops, normal, axis.centre, lo, hi)
            a, b = piece_at((lo + hi) / 2)
            total += a * m.area + b * m.first
        slab.append(total)
    out: list[float] = []
    for j in range(FIBRE_STEPS + 1):
        if table.depth[j] >= neutral_depth:
            out.append(sum(slab[j:]))  # from the compression edge down to the fibre
        else:
            out.append(-sum(slab[:j]))  # from the tension edge up to the fibre, as a magnitude
    return tuple(out)
