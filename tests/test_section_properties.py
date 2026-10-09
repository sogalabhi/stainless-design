"""Section properties from the template dimensions (plan.md 4d): reference values, geometry only.

The expected numbers come from published tables (the I-section), or are worked by hand in the
comment above them (RHS, CHS, T, angle, channel). Units: mm, mm², mm³, mm⁴. Axes: y horizontal,
z up, origin at the lower left corner of the bounding box.
"""

import math
from typing import Any

import pytest

from stainless_csm import services
from stainless_csm.core.enums import SectionType
from stainless_csm.core.errors import InvalidSectionError
from stainless_csm.sections.properties import SectionProperties, section_properties
from stainless_csm.sections.templates import (
    CHS,
    RHS,
    Angle,
    Channel,
    Fabrication,
    ISection,
    TSection,
)

ROLLED, WELDED = Fabrication.ROLLED, Fabrication.WELDED


def rel(value: float, expected: float, tolerance: float) -> bool:
    return abs(value - expected) <= tolerance * abs(expected)


# --- I-section: the published table (a rolled 200 x 100 x 5.6 x 8.5, r 12) -----------------------


@pytest.fixture(scope="module")
def i_section() -> SectionProperties:
    return section_properties(ISection(200, 100, 5.6, 8.5, ROLLED, r=12))


@pytest.mark.parametrize(
    ("name", "table"),
    [
        ("area", 2848.0),  # 28.48 cm²
        ("i_y", 1943e4),  # 1943 cm⁴
        ("i_z", 142.4e4),  # 142.4 cm⁴
        ("w_el_y", 194.3e3),  # 194.3 cm³
        ("w_pl_y", 220.6e3),  # 220.6 cm³
        ("w_el_z", 28.47e3),  # 28.47 cm³
        ("w_pl_z", 44.61e3),  # 44.61 cm³
    ],
)
def test_rolled_i_section_matches_the_published_table_within_half_a_percent(
    i_section: SectionProperties, name: str, table: float
) -> None:
    assert rel(getattr(i_section, name), table, 0.005), (name, getattr(i_section, name), table)


def test_rolled_i_section_area_is_exact_with_the_fillets(i_section: SectionProperties) -> None:
    # A = 2 b t_f + (h - 2 t_f) t_w + (4 - π) r²
    #   = 2 * 100 * 8.5 + (200 - 17) * 5.6 + (4 - π) * 144 = 1700 + 1024.8 + 123.6106 = 2848.4106
    exact = 2 * 100 * 8.5 + (200 - 17) * 5.6 + (4 - math.pi) * 12**2
    assert rel(i_section.area, exact, 1e-4)  # the polygon arcs are within 0.01 % of the circle


def test_i_section_is_symmetric(i_section: SectionProperties) -> None:
    # doubly symmetric: the centroid is at mid-height and mid-width, the product of inertia is 0,
    # the equal-area axes are the symmetry axes, the shear centre is the centroid
    assert i_section.y_c == pytest.approx(50.0, abs=1e-9)
    assert i_section.z_c == pytest.approx(100.0, abs=1e-9)
    assert i_section.i_yz == pytest.approx(0.0, abs=1e-6)
    assert i_section.plastic_axis_y == pytest.approx(100.0, abs=1e-9)
    assert i_section.plastic_axis_z == pytest.approx(50.0, abs=1e-9)
    assert i_section.w_el_y_top == pytest.approx(i_section.w_el_y_bottom, rel=1e-12)
    assert i_section.w_el_z_left == pytest.approx(i_section.w_el_z_right, rel=1e-12)
    assert (i_section.shear_centre_y, i_section.shear_centre_z) == pytest.approx((50.0, 100.0))
    assert i_section.principal is None
    assert (i_section.width, i_section.height) == pytest.approx((100.0, 200.0))


def test_welded_i_section_has_weld_triangles() -> None:
    # h 300, b 150, t_w 6, t_f 10, s 5:
    # A = 2 * 150 * 10 + (300 - 20) * 6 + 4 * (5² / 2) = 3000 + 1680 + 50 = 4730
    p = section_properties(ISection(300, 150, 6, 10, WELDED, s=5))
    assert p.area == pytest.approx(4730.0, rel=1e-12)
    assert (p.y_c, p.z_c) == pytest.approx((75.0, 150.0))


def test_sharp_i_section_by_rectangles() -> None:
    # rolled with r = 0 is three rectangles: 100 x 10 twice and 8 x 180
    # I_y = 2 [100 * 10³ / 12 + 1000 * 95²] + 8 * 180³ / 12 = 2 (8333.3 + 9 025 000) + 3 888 000
    #     = 18 066 666.7 + 3 888 000 = 21 954 666.7 ; A = 2000 + 1440 = 3440
    p = section_properties(ISection(200, 100, 8, 10, ROLLED, r=0))
    assert p.area == pytest.approx(3440.0, rel=1e-12)
    assert p.i_y == pytest.approx(21_954_666.667, rel=1e-9)
    # W_pl,y = 2 * (100 * 10 * 95) + 2 * (8 * 90 * 45) = 190 000 + 64 800 = 254 800
    assert p.w_pl_y == pytest.approx(254_800.0, rel=1e-9)


# --- rectangular hollow section: hand values (plan.md 4d), r_o = 0 ---------------------------


@pytest.fixture(scope="module")
def rhs() -> SectionProperties:
    return section_properties(RHS(100, 50, 4, r_o=0))


def test_rhs_hand_values(rhs: SectionProperties) -> None:
    # outer 100 x 50, inner 92 x 42
    # A   = 100 * 50 - 92 * 42 = 5000 - 3864 = 1136
    # I_y = (50 * 100³ - 42 * 92³) / 12 ; 92³ = 778 688 ; 42 * 778 688 = 32 704 896
    #     = (50 000 000 - 32 704 896) / 12 = 1 441 258.67
    i_y = (50 * 100**3 - 42 * 92**3) / 12
    assert rhs.area == pytest.approx(1136.0, rel=1e-12)
    assert rhs.i_y == pytest.approx(i_y, rel=1e-9)
    assert rhs.i_y == pytest.approx(1_441_259, rel=1e-6)
    # W_el,y = I_y / 50 = 28 825
    assert rhs.w_el_y == pytest.approx(28_825, rel=1e-4)
    # W_pl,y = 50 * 100² / 4 - 42 * 92² / 4 = 125 000 - 88 872 = 36 128
    assert rhs.w_pl_y == pytest.approx(36_128.0, rel=1e-9)
    # I_z = (100 * 50³ - 92 * 42³) / 12 = (12 500 000 - 6 816 096) / 12 = 473 658.7
    assert rhs.i_z == pytest.approx(473_659, rel=1e-6)
    # W_el,z = I_z / 25 = 18 946
    assert rhs.w_el_z == pytest.approx(18_946, rel=1e-4)
    # W_pl,z = 100 * 50² / 4 - 92 * 42² / 4 = 62 500 - 40 572 = 21 928
    assert rhs.w_pl_z == pytest.approx(21_928.0, rel=1e-9)


def test_rhs_is_symmetric(rhs: SectionProperties) -> None:
    assert (rhs.y_c, rhs.z_c) == pytest.approx((25.0, 50.0))
    assert rhs.i_yz == pytest.approx(0.0, abs=1e-6)
    assert (rhs.plastic_axis_y, rhs.plastic_axis_z) == pytest.approx((50.0, 25.0))
    assert (rhs.shear_centre_y, rhs.shear_centre_z) == pytest.approx((25.0, 50.0))


def test_rhs_corner_radius_changes_the_properties_by_the_exact_amount() -> None:
    # r_o 10, t 4 -> inner radius max(10 - 4, 0) = 6.
    # A = (b h - (4 - π) r_o²) - ((b - 2t)(h - 2t) - (4 - π) r_i²)
    #   = (5000 - 85.8407) - (3864 - 30.9027) = 4914.1593 - 3833.0973 = 1081.0620
    p = section_properties(RHS(100, 50, 4, r_o=10))
    exact = (5000 - (4 - math.pi) * 10**2) - (3864 - (4 - math.pi) * 6**2)
    assert rel(p.area, exact, 1e-4)
    sharp = section_properties(RHS(100, 50, 4, r_o=0))
    assert p.area < sharp.area and p.i_y < sharp.i_y and p.w_pl_y < sharp.w_pl_y


def test_rhs_with_a_corner_radius_as_large_as_the_wall_has_a_sharp_inside() -> None:
    # r_o = t = 4: the inner radius is max(4 - 4, 0) = 0
    p = section_properties(RHS(100, 50, 4, r_o=4))
    assert rel(p.area, 5000 - (4 - math.pi) * 16 - 3864, 1e-4)


def test_the_corner_radii_never_change_c() -> None:
    # c = h - 3t and b-bar = h are fixed by 8.2.2(5): r_o and the angle's r do not enter
    assert [p.c for p in RHS(100, 50, 4, r_o=10).plates()] == [88.0, 38.0]
    assert [p.c for p in RHS(100, 50, 4).plates()] == [88.0, 38.0]
    assert Angle(100, 75, 8, r=10).plates()[0].c == 100.0
    assert Angle(100, 75, 8).plates()[0].c == 100.0


# --- circular hollow section ------------------------------------------------------------------


def test_chs_hand_values() -> None:
    # d 100, t 5, inner diameter 90
    # A   = π (100² - 90²) / 4 = π * 1900 / 4 = 1492.2565
    # I   = π (100⁴ - 90⁴) / 64 = π * 34 390 000 / 64 = 1 688 115
    # W_el = I / 50 = 33 762
    # W_pl = (d³ - (d - 2t)³) / 6 = (1 000 000 - 729 000) / 6 = 45 166.67
    p = section_properties(CHS(100, 5))
    assert rel(p.area, math.pi * 1900 / 4, 1e-4)
    assert rel(p.i_y, math.pi * 34_390_000 / 64, 1e-4)
    assert p.i_y == pytest.approx(p.i_z, rel=1e-9)
    assert rel(p.w_el_y, 33_762, 1e-4)
    assert rel(p.w_pl_y, 45_166.67, 1e-4)
    assert p.w_pl_y == pytest.approx(p.w_pl_z, rel=1e-6)
    assert (p.y_c, p.z_c) == pytest.approx((50.0, 50.0), abs=1e-6)
    assert (p.shear_centre_y, p.shear_centre_z) == pytest.approx((50.0, 50.0), abs=1e-6)


# --- T-section, by an independent rectangle decomposition -------------------------------------


def test_t_section_by_rectangles() -> None:
    # h 100, b 100, t_w 6, t_f 8, r 0 (sharp): the flange 100 x 8 on top of the stem 6 x 92.
    # flange: A 800, centre z 96 ; stem: A 552, centre z 46 ; A = 1352
    # z_c = (800 * 96 + 552 * 46) / 1352 = 102 192 / 1352 = 75.5858
    flange, stem = (800.0, 96.0, 100 * 8**3 / 12), (552.0, 46.0, 6 * 92**3 / 12)
    area = flange[0] + stem[0]
    z_c = (flange[0] * flange[1] + stem[0] * stem[1]) / area
    i_y = sum(a_i + a * (z - z_c) ** 2 for a, z, a_i in (flange, stem))
    i_z = 8 * 100**3 / 12 + 92 * 6**3 / 12
    p = section_properties(TSection(100, 100, 6, 8, ROLLED, r=0))  # no c_stem needed
    assert p.area == pytest.approx(area, rel=1e-12)
    assert (p.y_c, p.z_c) == pytest.approx((50.0, z_c), rel=1e-12)
    assert p.i_y == pytest.approx(i_y, rel=1e-9)
    assert p.i_z == pytest.approx(i_z, rel=1e-9)
    assert p.i_yz == pytest.approx(0.0, abs=1e-6)
    # the elastic moduli differ: the smaller one is at the bottom fibre (the stem tip)
    assert p.e_top == pytest.approx(100 - z_c) and p.e_bottom == pytest.approx(z_c)
    assert p.w_el_y_bottom < p.w_el_y_top
    assert p.w_el_y == p.w_el_y_bottom
    # plastic: half the area 676 < flange 800, so the axis is in the flange, 676 / 100 = 6.76 below
    # the top: z = 93.24. Above it 676 (centre 96.62); below it 124 of flange (centre 92.62) and
    # the stem 552 (centre 46):  W_pl = 676 * 3.38 + 124 * 0.62 + 552 * 47.24
    #                                = 2284.88 + 76.88 + 26 076.48 = 28 438.24
    assert p.plastic_axis_y == pytest.approx(93.24, rel=1e-9)
    assert p.w_pl_y == pytest.approx(28_438.24, rel=1e-9)
    # z-z is a symmetry axis: the equal-area line is at mid-width
    assert p.plastic_axis_z == pytest.approx(50.0, abs=1e-9)
    # thin-walled shear centre: where the flange and stem centrelines meet
    assert (p.shear_centre_y, p.shear_centre_z) == pytest.approx((50.0, 96.0))


def test_welded_t_section_adds_the_weld_triangles() -> None:
    # h 100, b 100, t_w 6, t_f 8, s 4: two triangles of area 4² / 2 = 8 each
    sharp = section_properties(TSection(100, 100, 6, 8, WELDED, s=0))
    welded = section_properties(TSection(100, 100, 6, 8, WELDED, s=4))
    assert welded.area == pytest.approx(sharp.area + 16.0, rel=1e-12)


# --- angle, by an independent rectangle decomposition -----------------------------------------


@pytest.fixture(scope="module")
def angle() -> SectionProperties:
    return section_properties(Angle(100, 75, 8, r=0))


def test_angle_by_rectangles(angle: SectionProperties) -> None:
    # 100 x 75 x 8, sharp. Leg 1 (vertical): y 0..8, z 0..100, A 800, centre (4, 50).
    # Leg 2 (horizontal, the rest): y 8..75, z 0..8, A 536, centre (41.5, 4).
    # A = 1336 ; y_c = (800 * 4 + 536 * 41.5) / 1336 = 19.0449 ; z_c = (800 * 50 + 536 * 4) / 1336
    #   = 31.5449
    legs = [(800.0, 4.0, 50.0, 8, 100), (536.0, 41.5, 4.0, 67, 8)]  # A, y, z, width, height
    area = sum(a for a, *_ in legs)
    y_c = sum(a * y for a, y, _, _, _ in legs) / area
    z_c = sum(a * z for a, _, z, _, _ in legs) / area
    i_y = sum(w * h**3 / 12 + a * (z - z_c) ** 2 for a, _, z, w, h in legs)
    i_z = sum(h * w**3 / 12 + a * (y - y_c) ** 2 for a, y, _, w, h in legs)
    i_yz = sum(a * (y - y_c) * (z - z_c) for a, y, z, _, _ in legs)
    assert angle.area == pytest.approx(area, rel=1e-12)
    assert (angle.y_c, angle.z_c) == pytest.approx((y_c, z_c), rel=1e-12)
    assert angle.i_y == pytest.approx(i_y, rel=1e-9)
    assert angle.i_z == pytest.approx(i_z, rel=1e-9)
    assert angle.i_yz == pytest.approx(i_yz, rel=1e-9)
    assert angle.i_yz < 0  # the long leg is up and to the left of the centroid, the short one low
    # plastic: A / 2 = 668. Above z = 8 only the vertical leg (8 wide): 8 (100 - z) = 668,
    # so z = 16.5.
    assert angle.plastic_axis_y == pytest.approx(16.5, rel=1e-9)
    # Right of y = 8 only the horizontal leg, 536 < 668, so the line is inside the vertical leg:
    # (8 - y) * 100 + 536 = 668 -> y = 6.68
    assert angle.plastic_axis_z == pytest.approx(6.68, rel=1e-9)
    # thin-walled shear centre: where the leg centrelines meet, (t/2, t/2)
    assert (angle.shear_centre_y, angle.shear_centre_z) == pytest.approx((4.0, 4.0))


def test_angle_principal_axes(angle: SectionProperties) -> None:
    assert angle.principal is not None
    u = angle.principal
    # the principal moments keep the sum and the product I_u I_v = I_y I_z - I_yz²
    assert u.i_u + u.i_v == pytest.approx(angle.i_y + angle.i_z, rel=1e-12)
    assert u.i_u * u.i_v == pytest.approx(angle.i_y * angle.i_z - angle.i_yz**2, rel=1e-9)
    assert u.i_u > u.i_v

    # the moment about an axis at angle θ from y is I_y cos² + I_z sin² - 2 I_yz sin cos: it
    # is largest at the reported angle, equal to I_u there and to I_v a quarter turn away
    def about(theta_deg: float) -> float:
        th = math.radians(theta_deg)
        return (
            angle.i_y * math.cos(th) ** 2
            + angle.i_z * math.sin(th) ** 2
            - 2 * angle.i_yz * math.sin(th) * math.cos(th)
        )

    assert about(u.angle_deg) == pytest.approx(u.i_u, rel=1e-9)
    assert about(u.angle_deg + 90) == pytest.approx(u.i_v, rel=1e-9)
    assert all(about(u.angle_deg + delta) <= u.i_u + 1e-6 for delta in range(-90, 91, 5))
    assert 0 < u.angle_deg < 45  # leaning from the long leg: tan(2θ) = -2 I_yz / (I_y - I_z)


def test_equal_angle_has_its_major_axis_on_the_diagonal() -> None:
    # equal legs: I_y = I_z and the major axis u is the axis of symmetry, at 45 degrees
    p = section_properties(Angle(80, 80, 8, r=0))
    assert p.i_y == pytest.approx(p.i_z, rel=1e-12)
    assert p.principal is not None
    assert p.principal.angle_deg == pytest.approx(45.0, abs=1e-9)
    assert p.principal.i_u > p.principal.i_v


def test_angle_root_radius_adds_the_fillet_area() -> None:
    # the root fillet adds (1 - π/4) r² = 0.2146 r² at the inside corner: r 10 -> 21.46 mm²
    sharp = section_properties(Angle(100, 75, 8, r=0))
    rounded = section_properties(Angle(100, 75, 8, r=10))
    assert rounded.area - sharp.area == pytest.approx((1 - math.pi / 4) * 100, rel=1e-4)


# --- channel -----------------------------------------------------------------------------------


def test_channel_by_rectangles_and_its_shear_centre() -> None:
    # h 200, b 75, t_w 8.5, t_f 11.5, r 0 (sharp): the web 8.5 x 200 and two flanges 66.5 x 11.5
    # A = 1700 + 2 * 764.75 = 3229.5 ; the web is on the left, so y_c = 15.46 from the back
    web = (8.5 * 200, 8.5 / 2, 8.5 * 200**3 / 12, 200 * 8.5**3 / 12)
    flange = (66.5 * 11.5, 8.5 + 66.5 / 2, 66.5 * 11.5**3 / 12, 11.5 * 66.5**3 / 12)
    area = web[0] + 2 * flange[0]
    y_c = (web[0] * web[1] + 2 * flange[0] * flange[1]) / area
    i_y = web[2] + 2 * (flange[2] + flange[0] * (100 - 5.75) ** 2)
    i_z = (
        web[3]
        + web[0] * (web[1] - y_c) ** 2
        + 2 * (flange[3] + flange[0] * (flange[1] - y_c) ** 2)
    )
    p = section_properties(Channel(200, 75, 8.5, 11.5, ROLLED, r=0))
    assert p.area == pytest.approx(area, rel=1e-12)
    assert p.y_c == pytest.approx(y_c, rel=1e-12) and p.z_c == pytest.approx(100.0)
    assert p.i_y == pytest.approx(i_y, rel=1e-9)
    assert p.i_z == pytest.approx(i_z, rel=1e-9)
    assert p.i_yz == pytest.approx(0.0, abs=1e-6)
    # thin-walled shear centre: e = 3 b'² t_f / (6 b' t_f + h' t_w) from the web centreline,
    # b' = b - t_w / 2 = 70.75, h' = h - t_f = 188.5:
    # e = 3 * 70.75² * 11.5 / (6 * 70.75 * 11.5 + 188.5 * 8.5) = 172 691.8 / 6484.0 = 26.6335
    e = 3 * 70.75**2 * 11.5 / (6 * 70.75 * 11.5 + 188.5 * 8.5)
    assert e == pytest.approx(26.6335, rel=1e-5)
    # outside the web, on the side away from the flanges (the web centreline is at y = 4.25)
    assert p.shear_centre_y == pytest.approx(4.25 - e, rel=1e-9)
    assert p.shear_centre_z == pytest.approx(100.0)
    assert "e = " in p.shear_centre_note


def test_rolled_channel_area_with_fillets() -> None:
    # A = h t_w + 2 (b - t_w) t_f + 2 (1 - π/4) r² = 1700 + 1529.5 + 2 * 0.2146 * 132.25 = 3286.27
    p = section_properties(Channel(200, 75, 8.5, 11.5, ROLLED, r=11.5))
    exact = 200 * 8.5 + 2 * (75 - 8.5) * 11.5 + 2 * (1 - math.pi / 4) * 11.5**2
    assert rel(p.area, exact, 1e-4)


# --- geometry that cannot exist, and the radii the properties need -----------------------------


IMPOSSIBLE: list[tuple[Any, str]] = [
    (ISection(200, 100, 5.6, 100, ROLLED, r=12), r"2 t_f"),
    (ISection(200, 100, 5.6, 8.5, ROLLED, r=95), r"c_w"),
    (ISection(200, 100, 5.6, 8.5, ROLLED), r"root radius"),
    (Channel(200, 75, 8.5, 11.5, ROLLED, r=70), r"c_f"),
    (TSection(100, 100, 6, 100, ROLLED, r=10), r"t_f"),
    (Angle(75, 100, 8, r=0), r"longer leg"),
    (Angle(100, 75, 8, r=70), r"root radius"),  # r > b - t = 67
    (Angle(100, 75, 8, r=-1), r"zero or more"),
    (Angle(100, 75, 8), r"root radius r of the angle"),  # not given
    (RHS(100, 50, 25, r_o=0), r"too thick"),
    (RHS(100, 50, 4, r_o=26), r"half the smaller"),  # more than min(100, 50) / 2 = 25
    (RHS(100, 50, 4, r_o=-1), r"zero or more"),
    (RHS(100, 50, 4), r"outer corner radius r_o"),  # not given
    (CHS(100, 50), r"half the diameter"),
]


@pytest.mark.parametrize(("template", "message"), IMPOSSIBLE)
def test_impossible_or_incomplete_geometry_is_refused(template: Any, message: str) -> None:
    with pytest.raises(InvalidSectionError, match=message):
        section_properties(template)


def test_zero_is_a_valid_radius() -> None:
    assert section_properties(RHS(100, 50, 4, r_o=0)).area == pytest.approx(1136.0)
    assert section_properties(Angle(100, 75, 8, r=0)).area == pytest.approx(1336.0)


def test_the_largest_rhs_radius_is_allowed() -> None:
    # r_o = 25 = b / 2 makes the short sides fully round
    assert section_properties(RHS(100, 50, 4, r_o=25)).area > 0


# --- through services --------------------------------------------------------------------------


def i_geometry(**changes: Any) -> services.GeometryForm:
    values: dict[str, Any] = {
        "kind": services.GeometryKind.TEMPLATE,
        "shape": SectionType.I_SECTION,
        "fabrication": ROLLED,
        "h": 200,
        "b": 100,
        "tw": 5.6,
        "tf": 8.5,
        "r": 12,
    }
    values.update(changes)
    return services.GeometryForm(**values)


def test_service_runs_the_template_without_k_sigma_or_c_stem() -> None:
    p = services.run_section_properties(i_geometry())
    assert rel(p.area, 2848.0, 0.005)
    t = services.run_section_properties(
        services.GeometryForm(
            services.GeometryKind.TEMPLATE,
            shape=SectionType.T_SECTION,
            fabrication=ROLLED,
            h=100,
            b=100,
            tw=6,
            tf=8,
            r=0,
        )
    )
    assert t.area == pytest.approx(1352.0)


def test_service_names_a_missing_dimension() -> None:
    with pytest.raises(InvalidSectionError, match="tf"):
        services.run_section_properties(i_geometry(tf=None))
    with pytest.raises(InvalidSectionError, match="outer corner radius"):
        services.run_section_properties(
            services.GeometryForm(
                services.GeometryKind.TEMPLATE, shape=SectionType.RHS, h=100, b=50, t=4
            )
        )


def test_r_o_does_not_change_b5() -> None:
    # the radii are for the properties and the drawing: B.5 gives the same numbers with or without
    from helpers import NU, OMEGA, grade_material
    from stainless_csm.material_models.csm_bilinear import CSMBilinearModel
    from stainless_csm.sections.templates import PlateRole

    model = CSMBilinearModel(grade_material("1.4307"))
    k = {PlateRole.WEB: 4.0, PlateRole.FLANGE: 4.0}

    def run(r_o: float | None) -> services.DeformationOutcome:
        geometry = services.GeometryForm(
            services.GeometryKind.TEMPLATE,
            shape=SectionType.RHS,
            h=100, b=50, t=4, r_o=r_o, k_sigma=k,
        )  # fmt: skip
        return services.run_deformation_capacity(
            model, services.DeformationForm(geometry, OMEGA, NU)
        )

    with_radius, without = run(10), run(None)
    assert with_radius.slenderness.slenderness == without.slenderness.slenderness
    assert [p.c for p in with_radius.template_plates] == [88.0, 38.0]
