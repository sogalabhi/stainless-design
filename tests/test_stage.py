"""The Section Stage frames: the section loaded from zero strain to its limit (csm/stage.py).

The worked example is the one of test_bending.py: austenitic, f_y = 230, f_u = 540,
E = 200000 N/mm²,
W_el = 194318 mm³, W_pl = 220640 mm³, γM0 = 1.1, α = 2.0, so
    ε_y   = 0.00115,  E_sh = 3417.79 N/mm²,  E_sh ε_y = 3.930459 N/mm² per unit of ε/ε_y,
    M_el  = 40 630 127.27 N mm,  M_pl = 46 133 818.18 N mm.
"""

import math

import pytest

from stainless_csm.core.trace import SourceKind
from stainless_csm.csm.stage import (
    FRAME_STEPS,
    FrameMark,
    LoadCase,
    StageFrames,
    bending_frames,
    compression_frames,
    passes_plastic_moment,
    tension_frames,
)
from stainless_csm.csm.tension import CSMTension, TensionInput
from test_bending import (
    E_SH,
    FY,
    GAMMA,
    M_EL,
    M_PL,
    W_EL,
    W_PL,
    bend,
    deformation_at,
    worked_model,
)
from test_compression import AREA, compress

E_SH_EPS_Y = E_SH * 0.00115  # N/mm² per unit of ε/ε_y on the hardening line (3.930459)


def tension(area: float = AREA):
    model = worked_model()
    return CSMTension(TensionInput(model, area, None, GAMMA)).calculate()


def at(frames: StageFrames, ratio: float):
    """The frame at exactly this ratio."""
    found = [f for f in frames.frames if f.ratio == ratio]
    assert len(found) == 1, f"expected one frame at {ratio}, found {len(found)}"
    return found[0]


def marked(frames: StageFrames, mark: FrameMark):
    found = [f for f in frames.frames if mark in f.marks]
    assert len(found) == 1
    return found[0]


# --- the list of frames --------------------------------------------------------------------


@pytest.mark.parametrize("limit", [0.527, 1.0, 3.41109, 15.0])
def test_frames_run_from_zero_to_the_limit_in_ascending_order(limit: float) -> None:
    frames = compression_frames(worked_model(), limit)
    ratios = [f.ratio for f in frames.frames]
    assert ratios[0] == 0.0
    assert ratios[-1] == limit
    assert ratios == sorted(ratios)
    assert len(set(ratios)) == len(ratios)
    assert len(ratios) >= FRAME_STEPS
    assert FrameMark.UNLOADED in frames.frames[0].marks
    assert FrameMark.LIMIT in frames.frames[-1].marks


def test_first_yield_has_an_exact_frame_only_when_the_limit_passes_it() -> None:
    model = worked_model()
    assert at(compression_frames(model, 3.41109), 1.0).marks == (FrameMark.FIRST_YIELD,)
    below = compression_frames(model, 0.527)
    assert all(FrameMark.FIRST_YIELD not in f.marks for f in below.frames)
    # a limit of exactly 1 is the first yield and the limit in one frame
    assert set(at(compression_frames(model, 1.0), 1.0).marks) == {
        FrameMark.FIRST_YIELD,
        FrameMark.LIMIT,
    }


def test_an_exact_frame_replaces_the_equal_step_it_coincides_with() -> None:
    # 15 / 120 = 0.125, so ratio 1 is step 8 of the equal steps: one frame, not two
    frames = tension_frames(worked_model(), 15.0)
    assert len(frames.frames) == FRAME_STEPS + 1
    # a limit of 3.41109 has no step at ratio 1, so the exact frame is one more
    assert len(compression_frames(worked_model(), 3.41109).frames) == FRAME_STEPS + 2


# --- stress is read from the B.4 curve -----------------------------------------------------


def test_stress_at_first_yield_is_f_y_and_elastic_below() -> None:
    frames = compression_frames(worked_model(), 3.41109)
    assert at(frames, 1.0).stress == pytest.approx(FY, abs=1e-9)
    assert at(frames, 1.0).stress_over_yield is None
    half = min(frames.frames, key=lambda f: abs(f.ratio - 0.5))
    assert half.stress == pytest.approx(half.ratio * FY, rel=1e-12)  # E ε = (ε/ε_y) f_y
    assert half.stress_over_yield is None


def test_stress_past_yield_follows_the_hardening_line() -> None:
    # hand: σ(3) = 230 + 3.930459 × (3 − 1) = 237.860918
    frames = compression_frames(worked_model(), 3.41109)
    frame = min(frames.frames, key=lambda f: abs(f.ratio - 3.0))
    assert frame.stress == pytest.approx(FY + E_SH_EPS_Y * (frame.ratio - 1), rel=1e-9)
    assert frame.stress_over_yield == pytest.approx(frame.stress / FY - 1, rel=1e-12)
    assert frame.strain == pytest.approx(frame.ratio * 0.00115, rel=1e-12)


def test_source_and_units() -> None:
    model = worked_model()
    for frames in (tension_frames(model, 15.0), compression_frames(model, 2.0)):
        assert frames.source.kind is SourceKind.CODE
        assert "B.4" in frames.source.citation
        assert frames.yield_strain == pytest.approx(0.00115)
        assert frames.yield_stress == FY
    bending = bend(3.0).frames
    assert bending.source.kind is SourceKind.DERIVED
    for cited in ("Gere & Timoshenko", "B.4", "B.19", "B.20"):
        assert cited in bending.source.citation


# --- tension and compression: one strain over the whole section ---------------------------


def test_tension_blocks_are_uniform_and_negative() -> None:
    result = tension()
    frames = result.frames
    assert frames.load_case is LoadCase.TENSION
    for frame in frames.frames:
        assert frame.depth == (-1.0, 1.0)
        assert frame.strain_profile == (-frame.ratio, -frame.ratio)
        assert frame.stress_profile == (-frame.stress, -frame.stress)
        assert frame.resistance is None


def test_compression_blocks_are_uniform_and_positive() -> None:
    result = compress(3.0)
    frames = result.frames
    assert frames.load_case is LoadCase.COMPRESSION
    for frame in frames.frames:
        assert frame.depth == (-1.0, 1.0)
        assert frame.strain_profile == (frame.ratio, frame.ratio)
        assert frame.stress_profile == (frame.stress, frame.stress)


def test_the_last_tension_frame_is_the_reported_result() -> None:
    # B.14: ε_csm,t/ε_y = min{15; C1 ε_u/ε_y} = min{15; 49.92} = 15
    # B.13: f_csm,t = 230 + 3.930459 × 14 = 285.0264 N/mm²; B.12 with A = 1000, γM0 = 1.1
    result = tension()
    last = result.frames.frames[-1]
    assert last.ratio == result.strain_ratio == 15.0
    assert last.strain == result.strain
    assert last.stress == pytest.approx(285.0264, abs=1e-3)
    assert last.stress == pytest.approx(result.design_stress, rel=1e-12)
    assert AREA * last.stress / GAMMA == pytest.approx(result.resistance, rel=1e-12)


def test_the_last_compression_frame_is_the_reported_result() -> None:
    result = compress(3.0)  # B.17: f_csm = 230 + 3.930459 × 2 = 237.8609; B.16 with A = 1000
    last = result.frames.frames[-1]
    assert last.ratio == 3.0
    assert last.stress == pytest.approx(237.860918, abs=1e-5)
    assert last.stress == pytest.approx(result.design_stress, rel=1e-12)
    assert AREA * last.stress / GAMMA == pytest.approx(result.resistance, rel=1e-12)


def test_the_last_frame_of_a_slender_section_is_below_yield() -> None:
    # ε_csm/ε_y = 0.6 < 1: B.15 gives 0.6 A f_y / γM0, and the stress at the limit is 0.6 f_y
    result = compress(0.6)
    last = result.frames.frames[-1]
    assert last.ratio == 0.6
    assert last.stress == pytest.approx(0.6 * FY, rel=1e-12)
    assert last.stress_over_yield is None
    assert AREA * last.stress / GAMMA == pytest.approx(result.resistance, rel=1e-12)
    assert all(FrameMark.FIRST_YIELD not in f.marks for f in result.frames.frames)


def test_references_and_percentages_are_engine_values() -> None:
    # A f_y / γM0 = 1000 × 230 / 1.1 = 209 090.9 N; f_csm,t / f_y − 1 = 285.0264 / 230 − 1
    tens = tension()
    assert tens.yield_resistance == pytest.approx(1000 * 230 / 1.1)
    assert tens.above_yield == pytest.approx(285.0264 / 230 - 1, abs=1e-6)
    assert tens.above_yield == pytest.approx(tens.resistance / tens.yield_resistance - 1)
    comp = compress(3.0)
    assert comp.yield_resistance == pytest.approx(1000 * 230 / 1.1)
    assert comp.above_yield == pytest.approx(237.860918 / 230 - 1, abs=1e-6)
    assert compress(0.6).above_yield == pytest.approx(-0.4)  # B.15: 0.6 of the yield resistance


# --- bending ------------------------------------------------------------------------------


def test_bending_frame_at_first_yield_gives_f_y_and_m_el() -> None:
    frame = at(bend(3.0).frames, 1.0)
    assert frame.stress == pytest.approx(FY, abs=1e-9)
    assert frame.resistance == pytest.approx(M_EL, abs=0.1)
    assert frame.resistance == pytest.approx(W_EL * FY / GAMMA, rel=1e-12)


def test_bending_frame_resistance_follows_b19_and_b20() -> None:
    result = bend(3.0)
    for frame in result.frames.frames:
        if frame.ratio < 1:  # B.19: M = (ε/ε_y) W_el f_y / γM0
            assert frame.resistance == pytest.approx(frame.ratio * W_EL * FY / GAMMA, rel=1e-12)
        else:  # B.20
            shape = W_EL / W_PL
            bracket = 1 + 0.01708896 * shape * (frame.ratio - 1) - (1 - shape) / frame.ratio**2
            assert frame.resistance == pytest.approx(M_PL * bracket, rel=1e-6)
    assert result.frames.frames[0].resistance == 0.0


def test_the_last_bending_frame_is_the_reported_result() -> None:
    # hand, ratio 3: bracket = 1.01684516 (test_bending), M = 46 133 818.2 × 1.01684516
    result = bend(3.0)
    last = result.frames.frames[-1]
    assert last.ratio == result.strain_ratio == 3.0
    assert last.resistance == result.resistance
    assert last.resistance == pytest.approx(46_910_950, abs=1.0)
    assert last.stress == pytest.approx(FY + E_SH_EPS_Y * 2, rel=1e-9)


def test_the_resistance_rises_with_every_frame() -> None:
    resistances = [f.resistance for f in bend(15.0).frames.frames]
    assert resistances == sorted(resistances)


def test_bending_has_a_frame_where_the_resistance_passes_m_pl() -> None:
    # M(r) = M_pl where (E_sh/E)(W_el/W_pl)(r − 1) = (1 − W_el/W_pl) / r²
    #   0.01708896 × 0.8807016 (r − 1) r² = 0.1192984  (solved by bisection on moment_at)
    result = bend(15.0)
    frame = marked(result.frames, FrameMark.PASSES_MPL)
    assert frame.resistance == pytest.approx(M_PL, rel=1e-9)
    assert 2.0 < frame.ratio < 2.5
    shape = W_EL / W_PL
    left = 0.01708896 * shape * (frame.ratio - 1) * frame.ratio**2
    assert left == pytest.approx(1 - shape, rel=1e-6)
    above = [f for f in result.frames.frames if f.ratio > frame.ratio]
    assert all(f.resistance > M_PL for f in above)


def test_no_frame_passes_m_pl_when_the_limit_is_too_low() -> None:
    result = bend(1.5)
    assert all(FrameMark.PASSES_MPL not in f.marks for f in result.frames.frames)
    assert passes_plastic_moment(lambda r: r * M_EL, 0.9, M_PL) is None


def test_no_frame_passes_m_pl_when_w_pl_equals_w_el() -> None:
    # M_el = M_pl: B.20 starts at M_pl, so there is nothing to pass
    result = bend(3.0, w_el=W_EL, w_pl=W_EL)
    assert all(FrameMark.PASSES_MPL not in f.marks for f in result.frames.frames)


def test_bending_profiles_are_a_straight_strain_line_and_the_b4_stress() -> None:
    result = bend(15.0)
    frames = result.frames
    elastic = at(frames, 1.0)
    assert elastic.depth == (-1.0, 1.0)
    assert elastic.strain_profile == (-1.0, 1.0)
    assert elastic.stress_profile == pytest.approx((-FY, FY))
    last = frames.frames[-1]
    # past yield the stress block has corners at ±1/ratio, where the fibres reach f_y
    assert last.depth == pytest.approx((-1.0, -1 / 15, 1 / 15, 1.0))
    assert last.strain_profile == pytest.approx((-15.0, -1.0, 1.0, 15.0))
    sigma_edge = FY + E_SH_EPS_Y * 14
    assert last.stress_profile == pytest.approx((-sigma_edge, -FY, FY, sigma_edge), rel=1e-9)
    assert last.stress == pytest.approx(last.stress_profile[-1])
    assert last.stress_over_yield == pytest.approx(sigma_edge / FY - 1)
    for frame in frames.frames:  # the block is antisymmetric about the neutral axis
        assert frame.stress_profile == pytest.approx(
            tuple(-v for v in reversed(frame.stress_profile))
        )
        assert frame.strain_profile[-1] == frame.ratio


def test_bending_percentages_are_engine_values() -> None:
    # M(15) = 50 299 3xx: bracket = 1 + 0.01708896 × 0.8807016 × 14 − 0.1192984 / 225
    result = bend(15.0)
    assert result.above_elastic == pytest.approx(result.resistance / M_EL - 1)
    assert result.above_plastic == pytest.approx(result.resistance / M_PL - 1)
    assert result.above_plastic == pytest.approx(
        0.01708896 * (W_EL / W_PL) * 14 - (1 - W_EL / W_PL) / 225, rel=1e-6
    )
    assert bend(0.6).above_plastic < 0  # B.19: below the plastic moment


def test_bending_frames_use_the_callable_it_is_given() -> None:
    model = worked_model()
    frames = bending_frames(model, 2.0, lambda r: 1000.0 * r, 1500.0)
    assert [f.resistance for f in frames.frames] == pytest.approx(
        [1000.0 * f.ratio for f in frames.frames]
    )
    assert marked(frames, FrameMark.PASSES_MPL).ratio == pytest.approx(1.5)


def test_every_frame_is_finite() -> None:
    for frames in (tension().frames, compress(3.0).frames, bend(15.0).frames):
        for f in frames.frames:
            values = [f.ratio, f.strain, f.stress, *f.depth, *f.strain_profile, *f.stress_profile]
            assert all(math.isfinite(v) for v in values)
            assert len(f.depth) == len(f.strain_profile) == len(f.stress_profile)


def test_deformation_at_is_the_limit_of_the_frames() -> None:
    # the helper's DeformationResult strain equals the last frame's strain
    model = worked_model()
    result = deformation_at(3.0, model)
    assert compress(3.0).frames.frames[-1].strain == pytest.approx(result.strain)
