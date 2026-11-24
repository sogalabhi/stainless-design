"""The neutral axis from equilibrium for a section in pure bending (csm/equilibrium.py).

Textbook, not a clause: Gere & Timoshenko, Mechanics of Materials, 2nd ed., eq. (10-1) (plane
sections), eq. (10-3) p. 516 with N = 0 (∫σ dA = 0), and Section 10.3: for a large
strain the neutral axis is the plastic neutral axis, which cuts the area in two equal halves.
"""

import itertools

import pytest

from stainless_csm.core.enums import StainlessFamily
from stainless_csm.core.errors import OutOfRangeError
from stainless_csm.csm.equilibrium import equilibrium_state
from stainless_csm.csm.stage import bending_frames, with_resultants
from stainless_csm.csm.stress_resultants import mid_depth, stress_resultants
from stainless_csm.material_models.csm_bilinear import CSMBilinearModel
from stainless_csm.materials.material import Material
from stainless_csm.sections.properties import (
    CustomLink,
    CustomNode,
    WidthProfile,
    band_moments,
    custom_loops,
    custom_section_properties,
    outline,
)
from stainless_csm.sections.templates import Fabrication, ISection

UP = (0.0, 1.0)
DOWN = (0.0, -1.0)
FY = 230.0
MODEL = CSMBilinearModel(Material(StainlessFamily.AUSTENITIC, FY, 540.0, 200_000.0))

# the website's example: web 280 x 6, top flange outstands 47 x 10, bottom outstands 97 x 10
NODES = [
    CustomNode(1, 0.0, 0.0),
    CustomNode(2, 0.0, 280.0),
    CustomNode(3, -47.0, 280.0),
    CustomNode(4, 47.0, 280.0),
    CustomNode(5, -97.0, 0.0),
    CustomNode(6, 97.0, 0.0),
]
LINKS = [
    CustomLink(1, 2, 6.0),
    CustomLink(3, 2, 10.0),
    CustomLink(2, 4, 10.0),
    CustomLink(5, 1, 10.0),
    CustomLink(1, 6, 10.0),
]
LOOPS = custom_loops(NODES, LINKS)
PROPS = custom_section_properties(NODES, LINKS)
ROLLED = outline(ISection(200.0, 100.0, 5.6, 8.5, Fabrication.ROLLED, r=12.0))


def absolute_axis(state, loops, normal=UP) -> float:
    axis = mid_depth(loops, normal)
    return axis.centre + state.neutral_depth * axis.half


def test_width_profile_gives_the_moments_of_a_strip_exactly() -> None:
    """The width read from the polygon equals the polygon cut by two half-planes, for any strip."""
    profile = WidthProfile(ROLLED, UP)
    for low, high, about in [(0, 200, 100), (10, 60, 100), (95, 120, 100), (3.3, 7.7, 12)]:
        a = profile.band(low, high, about)
        b = band_moments(ROLLED, UP, about, low - about, high - about)
        assert a.area == pytest.approx(b.area, rel=1e-9, abs=1e-9)
        assert a.first == pytest.approx(b.first, rel=1e-9, abs=1e-6)
        assert a.second == pytest.approx(b.second, rel=1e-9, abs=1e-6)


def test_width_profile_sums_the_loops_of_a_custom_section() -> None:
    """The links overlap at the joints and each counts in full: A = Σ b̄ t, as the properties."""
    profile = WidthProfile(LOOPS, UP)
    whole = profile.band(profile.low, profile.high)
    assert whole.area == pytest.approx(PROPS.area, rel=1e-12)


@pytest.mark.parametrize("ratio", [0.2, 1.0, 3.0, 15.0])
def test_a_symmetric_section_has_its_axis_at_mid_depth_as_the_frames_assume(ratio: float) -> None:
    state = equilibrium_state(MODEL, WidthProfile(ROLLED, UP), ratio)
    assert state.neutral_depth == 0.0
    expected = (-1.0, 1.0) if ratio <= 1 else (-1.0, -1 / ratio, 1 / ratio, 1.0)
    assert state.depth == pytest.approx(expected, abs=1e-9)
    assert state.strain_profile[-1] == pytest.approx(ratio)
    assert state.strain_profile[0] == pytest.approx(-ratio)
    assert state.tension_ratio == pytest.approx(ratio)


def test_elastic_axis_of_an_unsymmetric_section_is_its_centroid() -> None:
    """Gere eq. (10-3) with σ = E κ y: the axis is the centroid of the section."""
    state = equilibrium_state(MODEL, WidthProfile(LOOPS, UP), 0.5)
    assert absolute_axis(state, LOOPS) == pytest.approx(PROPS.z_c, rel=1e-9)
    assert state.neutral_depth != 0.0


def test_large_strain_axis_is_the_plastic_axis() -> None:
    """Gere Section 10.3: the plastic neutral axis cuts the area in two equal halves."""
    state = equilibrium_state(MODEL, WidthProfile(LOOPS, UP), 1e4, hardening=0.0)
    assert absolute_axis(state, LOOPS) == pytest.approx(PROPS.plastic_axis_y, abs=0.01)


@pytest.mark.parametrize("ratio", [0.5, 1.0, 2.0, 5.0, 12.0])
def test_the_forces_balance_on_the_axis_found(ratio: float) -> None:
    """∫σ dA = 0: the compression force equals the tension force to 1e-9."""
    state = equilibrium_state(MODEL, WidthProfile(LOOPS, UP), ratio)
    r = stress_resultants(
        LOOPS, UP, state.depth, state.stress_profile, FY, mid_depth(LOOPS, UP), state.neutral_depth
    )
    assert r.force_compression > 0
    assert r.balance < 1e-9


def test_the_axis_moves_from_the_centroid_to_the_plastic_axis_as_the_section_yields() -> None:
    """Without hardening: from the centroid (elastic) to the plastic axis, never past either."""
    heights = [
        absolute_axis(equilibrium_state(MODEL, WidthProfile(LOOPS, UP), r, hardening=0.0), LOOPS)
        for r in (0.5, 1.5, 3.0, 10.0, 1e3)
    ]
    assert heights[0] == pytest.approx(PROPS.z_c, rel=1e-9)
    assert heights[-1] == pytest.approx(PROPS.plastic_axis_y, abs=0.05)
    low, high = sorted((PROPS.z_c, PROPS.plastic_axis_y))
    assert all(low - 1e-6 <= h <= high + 1e-6 for h in heights)
    assert all(a >= b - 1e-9 for a, b in itertools.pairwise(heights)) == (
        PROPS.z_c > PROPS.plastic_axis_y
    )


def test_the_block_moment_tends_to_f_y_times_w_pl() -> None:
    """Gere eq. (10-9): M_p = σ_y Z, with Z the plastic modulus of the section."""
    state = equilibrium_state(MODEL, WidthProfile(LOOPS, UP), 1e5, hardening=0.0)
    r = stress_resultants(
        LOOPS, UP, state.depth, state.stress_profile, FY, mid_depth(LOOPS, UP), state.neutral_depth
    )
    assert r.moment == pytest.approx(FY * PROPS.w_pl_y, rel=1e-6)


def test_hogging_is_the_section_turned_over() -> None:
    """Compression at the bottom is the same state with the section reflected top to bottom."""
    reflected = [
        [(y, -z) for y, z in reversed(loop)] for loop in LOOPS
    ]  # keep them counter-clockwise
    sag = equilibrium_state(MODEL, WidthProfile(reflected, UP), 4.0)
    hog = equilibrium_state(MODEL, WidthProfile(LOOPS, DOWN), 4.0)
    assert hog.neutral_depth == pytest.approx(sag.neutral_depth, abs=1e-9)
    assert hog.stress_profile == pytest.approx(sag.stress_profile, rel=1e-9)


def test_a_tension_fibre_past_the_end_of_the_curve_is_refused_by_the_state() -> None:
    """A very large compression flange puts the axis at the top, far from the tension edge."""
    nodes = [
        CustomNode(1, 0.0, 0.0),
        CustomNode(2, 0.0, 200.0),
        CustomNode(3, -300.0, 200.0),
        CustomNode(4, 300.0, 200.0),
    ]
    links = [CustomLink(1, 2, 4.0), CustomLink(3, 2, 30.0), CustomLink(2, 4, 30.0)]
    loops = custom_loops(nodes, links)
    with pytest.raises(OutOfRangeError, match="beyond the end"):
        equilibrium_state(MODEL, WidthProfile(loops, UP), 70.0)


def test_frames_use_equilibrium_with_a_profile_and_fall_back_without_one_or_past_the_curve() -> (
    None
):
    limit = 15.0

    def moment(ratio: float) -> float:
        return ratio * 1e6

    plain = bending_frames(MODEL, limit, moment, 1e7)
    assert not plain.equilibrium and plain.fallback is None
    frames = bending_frames(MODEL, limit, moment, 1e7, WidthProfile(LOOPS, UP))
    assert frames.equilibrium and frames.fallback is None
    assert len(frames.frames) == len(plain.frames)
    assert frames.frames[0].neutral_depth != 0.0 or frames.frames[0].ratio == 0.0
    assert "equilibrium" in frames.source.citation or "∫σ dA" in frames.source.citation
    # the last frame's compression edge is at the limit
    assert frames.frames[-1].strain_profile[-1] == pytest.approx(limit)
    nodes = [
        CustomNode(1, 0.0, 0.0),
        CustomNode(2, 0.0, 200.0),
        CustomNode(3, -300.0, 200.0),
        CustomNode(4, 300.0, 200.0),
    ]
    links = [CustomLink(1, 2, 4.0), CustomLink(3, 2, 30.0), CustomLink(2, 4, 30.0)]
    beyond = bending_frames(MODEL, 70.0, moment, 1e7, WidthProfile(custom_loops(nodes, links), UP))
    assert not beyond.equilibrium
    assert beyond.fallback is not None and "mid-depth" in beyond.fallback


def test_forces_of_the_frames_balance_for_the_unsymmetric_section() -> None:
    frames = bending_frames(MODEL, 15.0, lambda r: r * 1e6, 1e7, WidthProfile(LOOPS, UP))
    out = with_resultants(frames, LOOPS, UP)
    for frame in out.frames[1:]:
        assert frame.resultants is not None
        assert frame.resultants.balance < 1e-8
        assert frame.fibre_force is not None
    middle = out.frames[-1]
    # the force from the compression edge, up to the axis, is F_c; from the tension edge, F_t
    nearest = min(
        range(len(out.fibre_depth)),
        key=lambda j: abs(out.fibre_depth[j] - middle.neutral_depth),
    )
    assert middle.fibre_force[nearest] == pytest.approx(
        middle.resultants.force_compression, rel=0.05
    )
