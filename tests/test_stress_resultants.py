"""Resultant forces of the drawn stress block (csm/stress_resultants.py, plan.md 4i).

Textbook, not a clause: Gere & Timoshenko, Mechanics of Materials, 2nd ed., eqs. (10-3) p. 516 and
(10-4) p. 517, Fig. 10-4 and eq. (10-8) pp. 518-519, Fig. 10-7 and eq. (b) p. 521.

Hand values are in plan.md section 4i and in the comments of the tests below. The very large
ratio is 1e6, not infinity: the elastic core is then 1e-4 mm thick and the block is within 1e-12 of
the fully plastic one.
"""

import itertools

import pytest

from stainless_csm.core.enums import StainlessFamily
from stainless_csm.csm.bending import moment_b20
from stainless_csm.csm.stress_resultants import stress_resultants
from stainless_csm.material_models.csm_bilinear import CSMBilinearModel
from stainless_csm.materials.material import Material
from stainless_csm.sections.properties import outline, section_properties
from stainless_csm.sections.templates import Fabrication, ISection

UP = (0.0, 1.0)
FY_GERE = 250.0
GERE = ISection(320.0, 160.0, 8.0, 15.0, Fabrication.ROLLED, r=0.0)
A_GERE = 7_120.0
Z_GERE = 900_200.0
S_GERE = 799_870.8333333334


def profile(ratio: float, model_stress):
    """The frame's polyline as stage._frames draws it: corners at -1, -1/r, 1/r, 1."""
    if ratio <= 1:
        return (-1.0, 1.0), (-model_stress(ratio), model_stress(ratio))
    depth = (-1.0, -1 / ratio, 1 / ratio, 1.0)
    return depth, tuple((1 if u >= 0 else -1) * model_stress(abs(ratio * u)) for u in depth)


def perfectly_plastic(ratio: float) -> float:
    return FY_GERE * min(ratio, 1.0)


def gere(ratio: float):
    depth, stress = profile(ratio, perfectly_plastic)
    return stress_resultants(outline(GERE), UP, depth, stress, FY_GERE)


@pytest.mark.parametrize(
    ("ratio", "force", "arm", "moment"),
    [
        (1.0, 703_281.25, 284.335, 199_967_708),
        (2.0, 810_000.0, 272.572, 220_783_333),
        (1e6, 890_000.0, 252.865, 225_050_000),
    ],
)
def test_gere_problem_10_3_7_forces_arm_and_moment(
    ratio: float, force: float, arm: float, moment: float
) -> None:
    r = gere(ratio)
    assert r.force_compression == pytest.approx(force, rel=1e-6)
    assert r.force_tension == pytest.approx(force, rel=1e-6)
    assert r.lever_arm == pytest.approx(arm, abs=1e-3)
    assert r.moment == pytest.approx(moment, rel=1e-6)
    assert r.balance < 1e-6
    assert r.moment == pytest.approx(r.force_compression * r.lever_arm, rel=1e-9)


def test_first_yield_moment_is_sigma_y_times_s() -> None:
    """Gere eq. (10-5), p. 517: M_y = σ_y S; at ε/ε_y = 1 the block is the elastic one."""
    assert gere(1.0).moment == pytest.approx(FY_GERE * S_GERE, rel=1e-9)


@pytest.mark.parametrize("ratio", [0.25, 0.5, 0.8])
def test_below_yield_moment_is_ratio_times_elastic_moment(ratio: float) -> None:
    assert gere(ratio).moment == pytest.approx(ratio * FY_GERE * S_GERE, rel=1e-9)


def test_fully_plastic_moment_is_sigma_y_times_z() -> None:
    """Gere eq. (10-9), p. 519: M_p = σ_y Z; the arm is Z/(A/2) (eq. 10-8, Fig. 10-4)."""
    r = gere(1e6)
    assert r.moment == pytest.approx(FY_GERE * Z_GERE, rel=1e-6)
    assert r.lever_arm == pytest.approx(Z_GERE / (A_GERE / 2), rel=1e-6)


def test_parts_of_gere_at_ratio_two() -> None:
    """ε/ε_y = 2: the core |u| <= 1/2 is elastic, the rest is at f_y (Gere Fig. 10-7, eq. b)."""
    r = gere(2.0)
    core = [p for p in r.parts if p.name == "elastic core" and p.side == "compression"]
    zone = [p for p in r.parts if p.name == "yielded zone" and p.side == "compression"]
    assert len(core) == 1 and len(zone) == 1
    assert core[0].force == pytest.approx(80_000.0, rel=1e-9)  # web only: 1/2 x 8 x 80 x 250
    assert zone[0].force == pytest.approx(730_000.0, rel=1e-9)  # flange 600 000 + web 130 000
    assert not [p for p in r.parts if p.name == "hardening"]
    assert sum(p.force for p in r.parts if p.side == "compression") == pytest.approx(
        r.force_compression, rel=1e-12
    )


def test_unsymmetric_outline_is_refused() -> None:
    loops = [
        [(0.0, 0.0), (10.0, 0.0), (10.0, 4.0), (0.0, 4.0)],
        [(0.0, 4.0), (3.0, 4.0), (3.0, 10.0), (0.0, 10.0)],
    ]
    with pytest.raises(ValueError, match="symmetric"):
        stress_resultants(loops, UP, (-1.0, 1.0), (-1.0, 1.0), 1.0)


# --- the worked example: rolled 200 x 100 x 5.6 x 8.5, r 12, f_y 230, f_u 540 ---------------------

EXAMPLE = ISection(200.0, 100.0, 5.6, 8.5, Fabrication.ROLLED, r=12.0)
MODEL = CSMBilinearModel(Material(StainlessFamily.AUSTENITIC, 230.0, 540.0, 200_000.0))
ALPHA = 2.0


@pytest.mark.parametrize(
    ("ratio", "force", "arm", "block", "code"),
    [
        (0.8, 202_988, 176.140, 35_754_455, 35_754_455),
        (1.0, 253_736, 176.140, 44_693_068, 44_693_068),
        (3.0, 313_879, 164.720, 51_702_289, 51_601_960),
        (6.0, 337_437, 161.053, 54_345_226, 54_397_737),
    ],
)
def test_worked_example_block_against_b19_b20(
    ratio: float, force: float, arm: float, block: float, code: float
) -> None:
    props = section_properties(EXAMPLE)
    depth, stress = profile(ratio, lambda x: MODEL.stress_at(x * MODEL.yield_strain))
    r = stress_resultants(outline(EXAMPLE), UP, depth, stress, 230.0)
    assert r.force_compression == pytest.approx(force, rel=1e-5)
    assert r.force_tension == pytest.approx(force, rel=1e-5)
    assert r.lever_arm == pytest.approx(arm, abs=2e-3)
    assert r.moment == pytest.approx(block, rel=1e-6)
    b = (
        ratio * props.w_el_y * 230.0
        if ratio < 1
        else moment_b20(ratio, props.w_el_y, props.w_pl_y, 230.0, MODEL.hardening_ratio, ALPHA, 1.0)
    )
    assert b == pytest.approx(code, rel=1e-5)
    assert r.balance < 1e-9
    if ratio > 1:
        assert any(p.name == "hardening" for p in r.parts)


# --- the force carried out to each fibre (the Stage's hover) --------------------------------------


def fibres(ratio: float):
    from stainless_csm.csm.stress_resultants import fibre_forces, fibre_table, neutral_axis

    loops = outline(GERE)
    table = fibre_table(loops, UP, neutral_axis(loops, UP))
    depth, stress = profile(ratio, perfectly_plastic)
    return table, fibre_forces(table, loops, UP, depth, stress)


@pytest.mark.parametrize("ratio", [0.5, 1.0, 2.0, 1e6])
def test_force_from_the_edge_reaches_f_c_and_f_t_at_the_neutral_axis(ratio: float) -> None:
    """Gere eq. (10-3) on a part of the section: out to the axis it is the whole of C and of T."""
    table, forces = fibres(ratio)
    r = gere(ratio)
    middle = len(forces) // 2
    assert table.depth[middle] == 0.0
    assert forces[middle] == pytest.approx(r.force_compression, rel=1e-9)
    assert forces[0] == 0.0 and forces[-1] == 0.0  # no section beyond the edge


def test_force_from_the_edge_grows_towards_the_axis_and_is_symmetric_here() -> None:
    _, forces = fibres(2.0)
    top = forces[len(forces) // 2 :]
    assert all(a >= b for a, b in itertools.pairwise(top))
    assert forces == pytest.approx(forces[::-1], rel=1e-9)


def test_force_out_to_a_fibre_in_the_flange_is_f_y_times_width_times_distance() -> None:
    """Fully plastic: σ = f_y everywhere on the compression side. At depth 0.95, z = 152 mm, the
    part of the section from the top edge is 160 mm wide and 8 mm deep: F = 250 x 160 x 8."""
    table, forces = fibres(1e6)
    j = min(range(len(table.depth)), key=lambda k: abs(table.depth[k] - 0.95))
    assert table.depth[j] == pytest.approx(0.95)
    assert forces[j] == pytest.approx(FY_GERE * 160.0 * 8.0, rel=1e-6)


def test_width_of_the_section_at_each_fibre() -> None:
    table, _ = fibres(1.0)
    assert table.width[0] == pytest.approx(160.0, rel=1e-9)  # the flange edge
    assert table.width[len(table.width) // 2] == pytest.approx(8.0, rel=1e-9)  # the web
