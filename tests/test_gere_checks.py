"""Hand checks against the textbook: Gere & Timoshenko, Mechanics of Materials, 2nd ed., CBS
Publishers, Chapter 10 "Inelastic Bending", pp. 515-549.

Each test names the equation and the printed page it comes from (plan.md, section 4h). The
standard is EN 1993-1-4:2025; Formula (B.20) is on printed page 63 (PDF page 67), Formulas (B.4)
and (B.5) and Table B.1 on printed page 60 (PDF page 64). Units: N, mm, N/mm².

These tests only read the engine; a mismatch is a discrepancy to report, not something to tune.
"""

import pytest

from stainless_csm.core.enums import StainlessFamily
from stainless_csm.csm.bending import moment_b20
from stainless_csm.material_models.csm_bilinear import CSMBilinearModel
from stainless_csm.materials.material import Material
from stainless_csm.sections.properties import SectionProperties, section_properties
from stainless_csm.sections.templates import Fabrication, ISection


def rel(value: float, expected: float, tolerance: float) -> bool:
    return abs(value - expected) <= tolerance * abs(expected)


# --- 1. Section properties: Gere Prob. 10.3-7 (p. 543) ----------------------------------------
#
# Wide-flange beam h = 320, b = 160, t_f = 15, t_w = 8 mm (Prob. 10.3-7, p. 543, figure of
# Probs. 10.3-6 and 10.3-7: sharp corners, no fillets).
#
#   Z = b t_f (h - t_f) + t_w (h/2 - t_f)^2                       Gere eq. (10-14), p. 520
#     = 160 x 15 x 305 + 8 x 145^2 = 732 000 + 168 200           = 900 200 mm³
#
#   I: a rectangle has S = b h^2/6 (Gere p. 520, above eq. 10-13) and S = I/c with c = h/2
#   (eq. 10-5, p. 517), so I_rect = b h^3/12. The I-section is the b x h rectangle less the two
#   side voids, together (b - t_w) wide and (h - 2 t_f) high, centred on the same axis (Derived):
#   I = (b h^3 - (b - t_w)(h - 2 t_f)^3) / 12
#     = (160 x 320^3 - 152 x 290^3) / 12
#     = (5 242 880 000 - 3 707 128 000) / 12                     = 127 979 333.3 mm⁴
#   S = I / (h/2) = 127 979 333.3 / 160                           = 799 870.8 mm³   eq. (10-5)
#   f = Z / S = 900 200 / 799 870.8                               = 1.125 43        eq. (10-11)

H, B, TF, TW = 320.0, 160.0, 15.0, 8.0
Z_HAND = B * TF * (H - TF) + TW * (H / 2 - TF) ** 2
I_HAND = (B * H**3 - (B - TW) * (H - 2 * TF) ** 3) / 12
S_HAND = I_HAND / (H / 2)

# Sharp corners give an exact polygon; the only error left is floating point and the 64-step
# bisection for the plastic axis, which for a symmetric section lands on h/2 to ~1e-13 mm.
EXACT = 1e-9


def test_hand_values_of_gere_problem_10_3_7() -> None:
    """The hand values themselves, so a typo in the formulas above shows up here.

    Sources: Gere eq. (10-14), p. 520 (Z); eq. (10-5), p. 517 and S = b h²/6 on p. 520 (I and S,
    Derived as in the module comment); eq. (10-11), p. 520 (f).
    """
    assert Z_HAND == 900_200.0
    assert abs(I_HAND - 127_979_333.333) < 1e-3
    assert abs(S_HAND - 799_870.833) < 1e-3
    assert abs(Z_HAND / S_HAND - 1.12543) < 1e-5


@pytest.mark.parametrize(
    "template",
    [
        ISection(H, B, TW, TF, Fabrication.ROLLED, r=0.0),
        ISection(H, B, TW, TF, Fabrication.WELDED, s=0.0),
    ],
    ids=["rolled r=0", "welded s=0"],
)
def test_section_properties_match_gere_problem_10_3_7_exactly(template: ISection) -> None:
    """Gere Prob. 10.3-7 (p. 543): W_pl, W_el and W_pl/W_el about the major axis.

    Gere's wide-flange beam has sharp corners. The I-section template accepts a zero corner: the
    root radius r of a rolled section and the weld leg s of a welded one need only be zero or
    more (templates._corner), and a zero corner keeps the vertex sharp in the outline
    (properties._outline). Both give Gere's section exactly, so the tolerance is 1e-9 relative.

    Hand values (module comment): W_pl = Z = 900 200 mm³, Gere eq. (10-14), p. 520;
    I = 127 979 333.3 mm⁴ and W_el = S = I/(h/2) = 799 870.8 mm³, eq. (10-5), p. 517 (Derived);
    W_pl/W_el = f = Z/S = 1.125 43, eq. (10-11), p. 520.
    """
    props: SectionProperties = section_properties(template)
    assert rel(props.w_pl_y, Z_HAND, EXACT), props.w_pl_y
    assert rel(props.i_y, I_HAND, EXACT), props.i_y
    assert rel(props.w_el_y_top, S_HAND, EXACT), props.w_el_y_top
    assert rel(props.w_el_y_bottom, S_HAND, EXACT), props.w_el_y_bottom
    assert rel(props.w_pl_y / props.w_el_y, Z_HAND / S_HAND, EXACT)
    assert props.plastic_axis_y == pytest.approx(H / 2, abs=1e-9)


# --- 2. B.20 with E_sh = 0 against Gere eq. (10-17) (p. 521) ----------------------------------
#
# Formula (B.20), EN 1993-1-4:2025, printed p. 63 (PDF p. 67), with r = ε_csm/ε_y:
#   M_csm,c,Rd = (W_pl f_y/γM0) [1 + (E_sh/E)(W_el/W_pl)(r - 1) - (1 - W_el/W_pl) / r^α]
#
# Gere eq. (10-17), p. 521, rectangle of elastic-plastic material (Fig. 10-2, p. 517):
#   M/M_y = 3/2 - κ_y²/(2 κ²)              (M_y <= M <= M_p)
# with κ/κ_y = h/(2e) (eq. (f), p. 521). The strain is linear over the depth (κ = -ε/y,
# eq. 10-1), and κ_y = 2σ_y/(E h) (eq. (e), p. 521) is the curvature at which the extreme fibre,
# y = h/2, reaches ε_y = σ_y/E. So κ/κ_y is the extreme-fibre strain over ε_y, the r of B.20.
#
# For the rectangle W_el/W_pl = S/Z = 1/f = 2/3 (eqs. 10-12, 10-13, p. 520), and M_y = σ_y S
# (eq. 10-5) is (2/3) W_pl σ_y. Dividing by M_pl = W_pl f_y/γM0 (γM0 cancels on both sides):
#   Gere:  M/M_pl = (2/3)(3/2 - 1/(2 r²)) = 1 - 1/(3 r²)
#   B.20, E_sh = 0, α = 2:  1 - (1 - 2/3)/r² = 1 - 1/(3 r²)
# α = 2 is the exponent that matches eq. (10-17); Table B.2 (printed p. 64) gives α = 2.0 for
# rectangular hollow sections and for I-sections about the major axis.

STRAIN_RATIOS = (1.0, 1.5, 2.0, 5.0, 10.0, 15.0)
RECT_SHAPE = 2.0 / 3.0  # W_el/W_pl of a rectangle, Gere eqs. (10-12), (10-13), p. 520
ALPHA = 2.0
FY, GAMMA_M0 = 230.0, 1.1  # any positive values: they cancel in the ratio
W_PL = 1.0e6  # mm³, any positive value: it cancels in the ratio
M_PL = W_PL * FY / GAMMA_M0


def gere_10_17(r: float) -> float:
    """Gere eq. (10-17), p. 521: M/M_y = 3/2 - κ_y²/(2κ²), with κ/κ_y = r."""
    return 1.5 - 1.0 / (2.0 * r**2)


@pytest.mark.parametrize("r", STRAIN_RATIOS)
def test_b20_without_hardening_is_gere_equation_10_17_for_a_rectangle(r: float) -> None:
    """B.20 with E_sh = 0, α = 2, W_el/W_pl = 2/3 equals Gere eq. (10-17) times W_el/W_pl.

    Sources: Code, EN 1993-1-4:2025, Formula (B.20), printed p. 63 (PDF p. 67). Textbook, Gere &
    Timoshenko, 2nd ed., eq. (10-17), p. 521, with κ/κ_y = ε_max/ε_y from eqs. (e), (f), p. 521;
    W_el/W_pl = 2/3 from eqs. (10-12), (10-13), p. 520; M_y = σ_y S, eq. (10-5), p. 517.
    Expected: B.20 / (W_pl f_y/γM0) = (2/3)(3/2 - 1/(2r²)) = 1 - 1/(3r²).

    This checks the pure function `moment_b20` (plan.md 4f: the E_sh = 0 limit is tested on the
    pure B.20 function, not through the engine).
    """
    b20 = moment_b20(r, RECT_SHAPE * W_PL, W_PL, FY, 0.0, ALPHA, GAMMA_M0)
    assert b20 / M_PL == pytest.approx(RECT_SHAPE * gere_10_17(r), rel=1e-12)
    assert b20 / M_PL == pytest.approx(1.0 - 1.0 / (3.0 * r**2), rel=1e-12)


# --- 3. B.20 with strain hardening against Gere Prob. 10.7-7 (p. 548): Derived ----------------
#
# Gere Prob. 10.7-7, p. 548: a rectangle of a bilinear material (slopes E_1, then E_2 after σ_y,
# figure of Probs. 10.7-3 to 10.7-7):
#   M/M_y = 1/2 [(1 - E_2/E_1)(3 - κ_y²/κ²) + 2 E_2 κ/(E_1 κ_y)]      (M/M_y >= 1)
# With E_1 = E, E_2 = E_sh (Figure B.1, the CSM bilinear model), e = E_sh/E, κ/κ_y = r, and
# W_el/W_pl = 2/3, M_y = (2/3) M_pl as in section 2:
#   Gere / M_pl = (2/3)(1/2)[(1 - e)(3 - 1/r²) + 2 e r]
#               = (1/3)[3 - 1/r² - 3e + e/r² + 2 e r]
#               = 1 - 1/(3r²) - e + e/(3r²) + (2/3) e r
#   B.20 / M_pl = 1 + e (2/3)(r - 1) - (1/3)/r²
#               = 1 + (2/3) e r - (2/3) e - 1/(3r²)
#   B.20 / M_pl - Gere / M_pl = -(2/3) e + e - e/(3r²) = e/3 - e/(3r²) = (e/3)(1 - 1/r²)
# So B.20 is above the textbook rectangle by (E_sh/(3E))(1 - 1/r²) M_pl: zero at r = 1, and
# tending to E_sh/(3E) of M_pl for a large r.
#
# E_sh from B.4 and B.5 (printed p. 60), austenitic (Table B.1: C_2 = 0.16, C_3 = 1.00),
# f_y = 230, f_u = 540, E = 200 000 N/mm² (the project's worked example, tests/test_bending.py):
#   ε_y  = f_y/E = 230/200 000                    = 0.00115
#   ε_u  = C_3 (1 - f_y/f_u) = 1.00 (1 - 230/540) = 0.574 074          (B.5)
#   E_sh = (f_u - f_y)/(C_2 ε_u - ε_y)
#        = 310/(0.16 x 0.574 074 - 0.00115) = 310/0.090 702          = 3417.79 N/mm²   (B.4)

E_MOD, FU = 200_000.0, 540.0
C2, C3 = 0.16, 1.00  # Table B.1, austenitic
EPS_Y = FY / E_MOD
EPS_U = C3 * (1 - FY / FU)
E_SH = (FU - FY) / (C2 * EPS_U - EPS_Y)


def gere_10_7_7(r: float, e2_over_e1: float) -> float:
    """Gere Prob. 10.7-7, p. 548: M/M_y for a rectangle of bilinear material, κ/κ_y = r."""
    return 0.5 * ((1 - e2_over_e1) * (3 - 1 / r**2) + 2 * e2_over_e1 * r)


def test_strain_hardening_modulus_from_b4() -> None:
    """E_sh by hand from Formulas (B.4), (B.5) and Table B.1 (EN 1993-1-4:2025, printed p. 60),
    and the engine's bilinear model gives the same."""
    assert abs(E_SH - 3417.79) < 0.01
    model = CSMBilinearModel(Material(StainlessFamily.AUSTENITIC, FY, FU, E_MOD))
    assert model.strain_hardening_modulus == pytest.approx(E_SH, rel=1e-12)


@pytest.mark.parametrize("r", STRAIN_RATIOS)
def test_b20_with_hardening_exceeds_gere_problem_10_7_7_by_the_derived_term(r: float) -> None:
    """Derived: B.20/(W_pl f_y/γM0) - (2/3) x Gere Prob. 10.7-7 = (E_sh/(3E))(1 - 1/r²).

    Sources: Code, EN 1993-1-4:2025, Formula (B.20), printed p. 63 (PDF p. 67), and E_sh from
    Formulas (B.4), (B.5), Table B.1, printed p. 60. Textbook, Gere & Timoshenko, 2nd ed.,
    Prob. 10.7-7, p. 548 (M/M_y of a rectangle of bilinear material), with E_1 = E, E_2 = E_sh,
    κ/κ_y = r (eqs. (e), (f), p. 521) and W_el/W_pl = 2/3 (eqs. 10-12, 10-13, p. 520).
    The algebra is in the module comment above this test.
    """
    e = E_SH / E_MOD
    b20 = moment_b20(r, RECT_SHAPE * W_PL, W_PL, FY, e, ALPHA, GAMMA_M0) / M_PL
    gere = RECT_SHAPE * gere_10_7_7(r, e)
    assert b20 - gere == pytest.approx(e / 3 * (1 - 1 / r**2), rel=1e-9, abs=1e-15)
