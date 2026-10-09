"""Section properties computed from the typed template dimensions: reference values.

These are geometry, not a rule of EN 1993-1-4. Nothing here enters a calculation: a value is used
only when the user copies it into an input field (the website's Use button). The standing rule of
the project still holds: the inputs A, W_el and W_pl of Annex B stay typed.

Method (one routine for all six shapes): the outline is a polygon (a hole is a second, clockwise
loop). Fillets and corner radii are arcs of many segments, welds are triangles of leg s, and a
circle is a polygon of 1024 sides, so A is within 0.01 % of the exact value. Green's theorem gives
A, the centroid and the second moments. The plastic neutral axis is the line that cuts the area in
two equal halves, found by bisection on a polygon clipped by a half-plane; W_pl is then the sum of
the first moments of the two halves about that line.

Units: mm, mm², mm³, mm⁴. Axes: y is horizontal and z is vertical (up). The origin is the lower
left corner of the bounding box of the section, which is b wide and h high (d by d for a circle).
Orientation of the shapes (the same as the website's drawing): the I-section, T-section and
rectangular hollow section stand h high and b wide, the T-section has its flange on top, the
channel has its web on the left with the flanges pointing right, and the angle has its longer leg
h standing on the left and its shorter leg b lying at the bottom.

The shear centre is a thin-walled approximation, not an exact value.
"""

import math
from dataclasses import dataclass

from stainless_csm.core.enums import SectionType
from stainless_csm.core.errors import InvalidSectionError
from stainless_csm.sections.templates import (
    CHS,
    RHS,
    Angle,
    Channel,
    Fabrication,
    ISection,
    Template,
    TSection,
)

Point = tuple[float, float]  # (y, z) in mm
Loop = list[Point]

ORIGIN = "the lower left corner of the bounding box, y to the right and z up"
LABEL = "computed from your dimensions: geometry, not a rule of EN 1993-1-4"
SHEAR_CENTRE_LABEL = "thin-walled approximation"

_ARC_SEGMENTS_PER_QUARTER = 128
_CIRCLE_SEGMENTS = 1024
_BISECTION_STEPS = 64


# --- the outline ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class _Corner:
    """A vertex of the outline and what to do there: round it (fillet) or cut it (weld)."""

    point: Point
    fillet: float = 0.0  # radius of a tangent arc; 0 keeps the vertex sharp
    weld: float = 0.0  # leg of a weld triangle: a straight cut across the corner


def _sub(a: Point, b: Point) -> Point:
    return (a[0] - b[0], a[1] - b[1])


def _unit(v: Point) -> Point:
    length = math.hypot(*v)
    return (v[0] / length, v[1] / length)


def _outline(corners: list[_Corner]) -> Loop:
    """The polygon through the corners: each fillet becomes an arc, each weld a straight cut."""
    n = len(corners)
    loop: Loop = []
    for i, corner in enumerate(corners):
        p = corner.point
        if corner.fillet <= 0 and corner.weld <= 0:
            loop.append(p)
            continue
        a = corners[i - 1].point
        b = corners[(i + 1) % n].point
        u1 = _unit(_sub(a, p))
        u2 = _unit(_sub(b, p))
        if corner.weld > 0:
            k = corner.weld
            loop.append((p[0] + u1[0] * k, p[1] + u1[1] * k))
            loop.append((p[0] + u2[0] * k, p[1] + u2[1] * k))
            continue
        r = corner.fillet
        theta = math.acos(max(-1.0, min(1.0, u1[0] * u2[0] + u1[1] * u2[1])))
        tangent = r / math.tan(theta / 2)
        t1 = (p[0] + u1[0] * tangent, p[1] + u1[1] * tangent)
        t2 = (p[0] + u2[0] * tangent, p[1] + u2[1] * tangent)
        bisector = _unit((u1[0] + u2[0], u1[1] + u2[1]))
        distance = r / math.sin(theta / 2)
        centre = (p[0] + bisector[0] * distance, p[1] + bisector[1] * distance)
        a1 = math.atan2(t1[1] - centre[1], t1[0] - centre[0])
        a2 = math.atan2(t2[1] - centre[1], t2[0] - centre[0])
        delta = (a2 - a1 + math.pi) % (2 * math.pi) - math.pi
        steps = max(2, math.ceil(abs(delta) / (math.pi / 2) * _ARC_SEGMENTS_PER_QUARTER))
        for j in range(steps + 1):
            angle = a1 + delta * j / steps
            loop.append((centre[0] + r * math.cos(angle), centre[1] + r * math.sin(angle)))
    return loop


def _circle(centre: Point, radius: float, counter_clockwise: bool) -> Loop:
    sign = 1 if counter_clockwise else -1
    return [
        (
            centre[0] + radius * math.cos(sign * 2 * math.pi * i / _CIRCLE_SEGMENTS),
            centre[1] + radius * math.sin(sign * 2 * math.pi * i / _CIRCLE_SEGMENTS),
        )
        for i in range(_CIRCLE_SEGMENTS)
    ]


def _corner_size(fabrication: Fabrication, r: float | None, s: float | None) -> tuple[float, float]:
    """(fillet radius, weld leg) for the corner between web and flange."""
    if fabrication is Fabrication.ROLLED:
        return (r or 0.0, 0.0)
    return (0.0, s or 0.0)


def outline(template: Template) -> list[Loop]:
    """The loops of the section: the outer boundary counter-clockwise, holes clockwise."""
    if isinstance(template, ISection | Channel | TSection):
        return [_open_section(template)]
    if isinstance(template, Angle):
        t, h, b = template.t, template.h, template.b
        assert template.r is not None
        return [
            _outline(
                [
                    _Corner((0.0, 0.0)),
                    _Corner((b, 0.0)),
                    _Corner((b, t)),
                    _Corner((t, t), fillet=template.r),
                    _Corner((t, h)),
                    _Corner((0.0, h)),
                ]
            )
        ]
    if isinstance(template, RHS):
        h, b, t = template.h, template.b, template.t
        assert template.r_o is not None
        r_o = template.r_o
        r_i = max(r_o - t, 0.0)
        return [
            _outline(
                [
                    _Corner((0.0, 0.0), r_o),
                    _Corner((b, 0.0), r_o),
                    _Corner((b, h), r_o),
                    _Corner((0.0, h), r_o),
                ]
            ),
            _outline(
                [
                    _Corner((t, t), r_i),
                    _Corner((t, h - t), r_i),
                    _Corner((b - t, h - t), r_i),
                    _Corner((b - t, t), r_i),
                ]
            ),
        ]
    d, t = template.d, template.t
    return [
        _circle((d / 2, d / 2), d / 2, counter_clockwise=True),
        _circle((d / 2, d / 2), d / 2 - t, counter_clockwise=False),
    ]


def _open_section(template: ISection | Channel | TSection) -> Loop:
    h, b, tw, tf = template.h, template.b, template.tw, template.tf
    fillet, weld = _corner_size(template.fabrication, template.r, template.s)

    def junction(y: float, z: float) -> _Corner:
        return _Corner((y, z), fillet=fillet, weld=weld)

    if isinstance(template, ISection):
        left, right = (b - tw) / 2, (b + tw) / 2
        return _outline(
            [
                _Corner((0.0, 0.0)),
                _Corner((b, 0.0)),
                _Corner((b, tf)),
                junction(right, tf),
                junction(right, h - tf),
                _Corner((b, h - tf)),
                _Corner((b, h)),
                _Corner((0.0, h)),
                _Corner((0.0, h - tf)),
                junction(left, h - tf),
                junction(left, tf),
                _Corner((0.0, tf)),
            ]
        )
    if isinstance(template, Channel):
        return _outline(
            [
                _Corner((0.0, 0.0)),
                _Corner((b, 0.0)),
                _Corner((b, tf)),
                junction(tw, tf),
                junction(tw, h - tf),
                _Corner((b, h - tf)),
                _Corner((b, h)),
                _Corner((0.0, h)),
            ]
        )
    left, right = (b - tw) / 2, (b + tw) / 2
    return _outline(
        [
            _Corner((left, 0.0)),
            _Corner((right, 0.0)),
            junction(right, h - tf),
            _Corner((b, h - tf)),
            _Corner((b, h)),
            _Corner((0.0, h)),
            _Corner((0.0, h - tf)),
            junction(left, h - tf),
        ]
    )


# --- Green's theorem -----------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class _Moments:
    """Area and the moments of a region about the origin: first (Sy = ∫y dA, Sz = ∫z dA) and
    second (Iyy = ∫y² dA, Izz = ∫z² dA, Iyz = ∫yz dA)."""

    area: float
    sy: float
    sz: float
    iyy: float
    izz: float
    iyz: float


def _moments(loops: list[Loop]) -> _Moments:
    area = sy = sz = iyy = izz = iyz = 0.0
    for loop in loops:
        n = len(loop)
        for i in range(n):
            y1, z1 = loop[i]
            y2, z2 = loop[(i + 1) % n]
            cross = y1 * z2 - y2 * z1
            area += cross
            sy += (y1 + y2) * cross
            sz += (z1 + z2) * cross
            iyy += (y1 * y1 + y1 * y2 + y2 * y2) * cross
            izz += (z1 * z1 + z1 * z2 + z2 * z2) * cross
            iyz += (y1 * z2 + 2 * y1 * z1 + 2 * y2 * z2 + y2 * z1) * cross
    return _Moments(area / 2, sy / 6, sz / 6, iyy / 12, izz / 12, iyz / 24)


# --- cutting the section by a line (for the plastic neutral axis) ----------------------------


def _clip(loop: Loop, normal: Point, offset: float) -> Loop:
    """The part of a loop where normal · p >= offset (one Sutherland-Hodgman pass).

    For a concave loop the result may have zero-width edges along the cut; they add nothing to
    the area or the moments.
    """
    out: Loop = []
    n = len(loop)
    for i in range(n):
        p, q = loop[i], loop[(i + 1) % n]
        dp = normal[0] * p[0] + normal[1] * p[1] - offset
        dq = normal[0] * q[0] + normal[1] * q[1] - offset
        if dp >= 0:
            if dq >= 0:
                out.append(q)
            else:
                out.append(_cross(p, q, dp, dq))
        elif dq >= 0:
            out.append(_cross(p, q, dp, dq))
            out.append(q)
    return out


def _cross(p: Point, q: Point, dp: float, dq: float) -> Point:
    f = dp / (dp - dq)
    return (p[0] + f * (q[0] - p[0]), p[1] + f * (q[1] - p[1]))


def _side(loops: list[Loop], normal: Point, offset: float) -> tuple[float, float]:
    """(area, ∫ (normal · p - offset) dA) of the part where normal · p >= offset."""
    m = _moments([_clip(loop, normal, offset) for loop in loops if loop])
    return m.area, normal[0] * m.sy + normal[1] * m.sz - offset * m.area


def _plastic_axis(loops: list[Loop], total: float, normal: Point) -> tuple[float, float]:
    """(offset of the equal-area line normal · p = offset, plastic modulus about it)."""
    values = [normal[0] * y + normal[1] * z for loop in loops for y, z in loop]
    low, high = min(values), max(values)
    for _ in range(_BISECTION_STEPS):
        mid = (low + high) / 2
        if _side(loops, normal, mid)[0] > total / 2:
            low = mid
        else:
            high = mid
    offset = (low + high) / 2
    above = _side(loops, normal, offset)[1]
    below = _side(loops, (-normal[0], -normal[1]), -offset)[1]
    return offset, above + below


# --- the result ----------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class PrincipalAxes:
    """For an angle: the major axis u, at `angle` degrees counter-clockwise from the y axis."""

    angle_deg: float
    i_u: float
    i_v: float


@dataclass(frozen=True, slots=True)
class SectionProperties:
    shape: SectionType
    width: float  # bounding box along y [mm]
    height: float  # bounding box along z [mm]
    area: float
    y_c: float
    z_c: float
    i_y: float  # about the centroidal axis parallel to y [mm⁴]
    i_z: float
    i_yz: float
    e_top: float  # distance from the centroid to the extreme fibre on each side [mm]
    e_bottom: float
    e_left: float
    e_right: float
    w_el_y_top: float  # elastic modulus I / e for each side [mm³]
    w_el_y_bottom: float
    w_el_z_left: float
    w_el_z_right: float
    plastic_axis_y: float  # z of the equal-area line parallel to y, for bending about y-y [mm]
    plastic_axis_z: float  # y of the equal-area line parallel to z, for bending about z-z [mm]
    w_pl_y: float
    w_pl_z: float
    shear_centre_y: float  # thin-walled approximation [mm]
    shear_centre_z: float
    shear_centre_note: str
    principal: PrincipalAxes | None  # angles only

    @property
    def w_el_y(self) -> float:
        """The smaller of the two elastic moduli about y-y."""
        return min(self.w_el_y_top, self.w_el_y_bottom)

    @property
    def w_el_z(self) -> float:
        return min(self.w_el_z_left, self.w_el_z_right)


def _need(template: Template) -> None:
    """The properties need the radius the plates do not: r_o of an RHS, r of an angle."""
    if isinstance(template, RHS) and template.r_o is None:
        raise InvalidSectionError(
            "The section properties need the outer corner radius r_o of the rectangular hollow "
            "section (0 for sharp corners)."
        )
    if isinstance(template, Angle) and template.r is None:
        raise InvalidSectionError(
            "The section properties need the root radius r of the angle (0 for a sharp corner)."
        )


def _shear_centre(template: Template, y_c: float, z_c: float) -> tuple[float, float, str]:
    """The shear centre by the thin-walled approximation (a labelled estimate)."""
    if isinstance(template, ISection | RHS | CHS):
        return y_c, z_c, "doubly symmetric: at the centroid"
    if isinstance(template, TSection):
        return (
            template.b / 2,
            template.h - template.tf / 2,
            "where the centrelines of the flange and the stem meet",
        )
    if isinstance(template, Angle):
        return (
            template.t / 2,
            template.t / 2,
            "where the centrelines of the two legs meet",
        )
    b_prime = template.b - template.tw / 2  # flange centreline length from the web centreline
    h_prime = template.h - template.tf  # distance between the flange centrelines
    e = 3 * b_prime**2 * template.tf / (6 * b_prime * template.tf + h_prime * template.tw)
    return (
        template.tw / 2 - e,
        template.h / 2,
        f"e = 3 b'² t_f / (6 b' t_f + h' t_w) = {e:.4g} mm from the web centreline, on the side "
        "away from the flanges (b' = b − t_w/2, h' = h − t_f)",
    )


def section_properties(template: Template) -> SectionProperties:
    """A, centroid, I, W_el, W_pl, plastic axes and shear centre of a template. Raises
    InvalidSectionError for dimensions that cannot make the shape or a missing radius."""
    template.validate()
    _need(template)
    loops = outline(template)
    whole = _moments(loops)
    area = whole.area
    y_c, z_c = whole.sy / area, whole.sz / area
    i_y = whole.izz - area * z_c**2
    i_z = whole.iyy - area * y_c**2
    i_yz = whole.iyz - area * y_c * z_c

    ys = [y for loop in loops for y, _ in loop]
    zs = [z for loop in loops for _, z in loop]
    e_top, e_bottom = max(zs) - z_c, z_c - min(zs)
    e_left, e_right = y_c - min(ys), max(ys) - y_c

    plastic_axis_y, w_pl_y = _plastic_axis(loops, area, (0.0, 1.0))
    plastic_axis_z, w_pl_z = _plastic_axis(loops, area, (1.0, 0.0))
    shear_y, shear_z, note = _shear_centre(template, y_c, z_c)

    principal = None
    if isinstance(template, Angle):
        mean = (i_y + i_z) / 2
        radius = math.hypot((i_y - i_z) / 2, i_yz)
        angle = 0.5 * math.degrees(math.atan2(-2 * i_yz, i_y - i_z))
        principal = PrincipalAxes(angle, mean + radius, mean - radius)

    return SectionProperties(
        shape=_shape_of(template),
        width=max(ys) - min(ys),
        height=max(zs) - min(zs),
        area=area,
        y_c=y_c,
        z_c=z_c,
        i_y=i_y,
        i_z=i_z,
        i_yz=i_yz,
        e_top=e_top,
        e_bottom=e_bottom,
        e_left=e_left,
        e_right=e_right,
        w_el_y_top=i_y / e_top,
        w_el_y_bottom=i_y / e_bottom,
        w_el_z_left=i_z / e_left,
        w_el_z_right=i_z / e_right,
        plastic_axis_y=plastic_axis_y,
        plastic_axis_z=plastic_axis_z,
        w_pl_y=w_pl_y,
        w_pl_z=w_pl_z,
        shear_centre_y=shear_y,
        shear_centre_z=shear_z,
        shear_centre_note=note,
        principal=principal,
    )


def _shape_of(template: Template) -> SectionType:
    if isinstance(template, ISection):
        return SectionType.I_SECTION
    if isinstance(template, Channel):
        return SectionType.CHANNEL
    if isinstance(template, TSection):
        return SectionType.T_SECTION
    if isinstance(template, Angle):
        return SectionType.ANGLE
    if isinstance(template, RHS):
        return SectionType.RHS
    return SectionType.CHS
