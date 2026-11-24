"""The strain and stress through the depth of a section in pure bending, from equilibrium.

Textbook, not a clause: Gere & Timoshenko, Mechanics of Materials, 2nd ed., Section 10.1 and eq.
(10-3). Plane sections stay plane (eq. 10-1), so the strain is a straight line through the
depth, and in pure bending the stress over the section has no resultant force: ∫σ dA = 0 (eq.
10-3 with N = 0). That fixes the neutral axis. For a section symmetric about the axis of bending
it is at mid-depth; for any other section it is not, and moves as the material yields (Gere
Section 10.3, on the plastic neutral axis, which is where it ends for a large strain).

Which strain is given: that at the extreme compression fibre, the ratio ε/ε_y of the Stage's
slider. The strain at the extreme tension fibre then follows from the straight line, and can be
larger or smaller. The stress is read from the B.4 curve, which is two straight lines, so the
stress through the depth is piecewise linear and every force is exact (`WidthProfile`).

Units: N, mm, N/mm². z is the coordinate along the bending depth, from the tension edge (low) to
the compression edge (high).
"""

import itertools
from dataclasses import dataclass

from stainless_csm.core.errors import OutOfRangeError
from stainless_csm.material_models.csm_bilinear import CSMBilinearModel
from stainless_csm.sections.properties import WidthProfile

SOURCE = (
    "Gere & Timoshenko, Mechanics of Materials, 2nd ed., eq. (10-1) (plane sections) and "
    "eq. (10-3), p. 516 with N = 0 (the neutral axis from ∫σ dA = 0)"
)

_BISECTION_STEPS = 100


@dataclass(frozen=True, slots=True)
class DepthState:
    """One state of the section: the profiles over the normalised depth -1 (tension edge) to +1."""

    neutral_depth: float  # the neutral axis on that scale; 0 is mid-depth
    depth: tuple[float, ...]
    strain_profile: tuple[float, ...]  # ε / ε_y, compression positive
    stress_profile: tuple[float, ...]  # σ, N/mm², compression positive
    tension_ratio: float  # ε / ε_y at the extreme tension fibre, a magnitude


class _Curve:
    """The B.4 curve in units of the strain ratio ρ = ε / ε_y: two lines, odd about zero."""

    def __init__(self, model: CSMBilinearModel, hardening: float | None = None) -> None:
        self.fy = model.material.fy
        if hardening is None:
            # N/mm² per unit of ρ above ρ = 1 (E_sh ε_y), and the end of the curve
            self.slope = model.strain_hardening_modulus * model.yield_strain
            self.limit = model.max_strain / model.yield_strain
        else:
            # a material of the textbook (no end to its curve), for checking against Gere
            self.slope = hardening
            self.limit = float("inf")

    def stress(self, rho: float) -> float:
        magnitude = abs(rho)
        value = self.fy * magnitude if magnitude <= 1 else self.fy + self.slope * (magnitude - 1)
        return value if rho >= 0 else -value


def _force(curve: _Curve, profile: WidthProfile, z_na: float, ratio: float) -> float:
    """∫σ dA for the compression edge at `ratio` and the neutral axis at `z_na`."""
    s = ratio / (profile.high - z_na)  # ρ per mm
    breaks = [profile.low, z_na - 1 / s, z_na, z_na + 1 / s, profile.high]
    cuts = sorted({min(max(z, profile.low), profile.high) for z in breaks})
    total = 0.0
    for p, q in itertools.pairwise(cuts):
        sp, sq = curve.stress(s * (p - z_na)), curve.stress(s * (q - z_na))
        b = (sq - sp) / (q - p)
        a = sp - b * p
        band = profile.band(p, q)
        total += a * band.area + b * band.first
    return total


def _centroid(profile: WidthProfile) -> float:
    whole = profile.band(profile.low, profile.high)
    return whole.first / whole.area


def equilibrium_state(
    model: CSMBilinearModel,
    profile: WidthProfile,
    ratio: float,
    hardening: float | None = None,
) -> DepthState:
    """The strain and stress through the depth, the extreme compression fibre at ε/ε_y = `ratio`.

    Raises OutOfRangeError if the extreme tension fibre then lies beyond the end of the B.4 curve.
    `hardening` replaces E_sh ε_y (N/mm² per unit of ε/ε_y above 1) to check the method against a
    textbook material: 0 is Gere's elastic, perfectly plastic material, and the curve has no end.
    """
    curve = _Curve(model, hardening)
    low, high = profile.low, profile.high
    mid, half = (low + high) / 2, (high - low) / 2
    if ratio <= 1:
        # elastic: the stress is proportional to the distance from the axis, so it is the centroid
        z_na = _centroid(profile)
    else:
        a, b = low, high
        for _ in range(_BISECTION_STEPS):
            m = (a + b) / 2
            # more compression area above a lower axis: the force falls as the axis rises
            if _force(curve, profile, m, ratio) > 0:
                a = m
            else:
                b = m
        z_na = (a + b) / 2
    s = ratio / (high - z_na)
    tension_ratio = s * (z_na - low)
    if tension_ratio > curve.limit:
        raise OutOfRangeError(
            f"With the extreme compression fibre at ε/ε_y = {ratio:.3g} the extreme tension fibre "
            f"would be at {tension_ratio:.3g}, beyond the end of the B.4 curve ({curve.limit:.3g})."
        )
    zs = [low]
    if ratio > 1:
        zs += [z for z in (z_na - 1 / s, z_na + 1 / s) if low < z < high]
    zs.append(high)
    depth = tuple((z - mid) / half for z in zs)
    neutral = (z_na - mid) / half
    return DepthState(
        neutral_depth=0.0 if abs(neutral) < 1e-9 else neutral,
        depth=depth,
        strain_profile=tuple(s * (z - z_na) for z in zs),
        stress_profile=tuple(curve.stress(s * (z - z_na)) for z in zs),
        tension_ratio=tension_ratio,
    )
