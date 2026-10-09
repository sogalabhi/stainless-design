"""Section templates (EN 1993-1-4:2025, 8.2.2(5), Tables 7.2 to 7.4): the six shapes of B.2 from
their typed dimensions, and the flat plates B.5 (B.8, B.9) receives from them.

Units: mm. Every dimension is typed by the user; nothing is assumed. The flat width c of each plate
is derived only where the PDF prints or draws it (the working names the source); the T-section stem,
which the PDF draws nowhere, is typed. A, W_el, W_pl and k_sigma are not computed here: they are
inputs from outside Annex B.

Each derived c is a CalcStep (clause "8.2.2(5)"). A shape that cannot exist (a c of zero or less,
flanges thicker than the section is deep, ...) raises InvalidSectionError.
"""

import math
from dataclasses import dataclass
from enum import Enum

from stainless_csm.core import units
from stainless_csm.core.errors import InvalidSectionError
from stainless_csm.core.latex import tex
from stainless_csm.core.trace import CalcStep

CLAUSE = "8.2.2(5)"
_LENGTH = r"\,\mathrm{mm}"


class Fabrication(Enum):
    """How an I-section, channel or T-section is made: it decides the corner at the web."""

    ROLLED = "rolled"  # root radius r
    WELDED = "welded"  # weld leg s


class PlateRole(Enum):
    """The part of the section a plate is. Each role has its own typed k_sigma."""

    WEB = "web"
    FLANGE = "flange"
    STEM = "stem"
    LEG = "leg"


class PlateType(Enum):
    INTERNAL = "internal"
    OUTSTAND = "outstand"


@dataclass(frozen=True, slots=True)
class TemplatePlate:
    """One plate handed to B.5: its flat width c, thickness, and where c came from."""

    role: PlateRole
    kind: PlateType
    c: float
    thickness: float
    source: str  # short text for the plate table, for example "c as drawn in Table 7.2"
    step: CalcStep

    @property
    def label(self) -> str:
        return self.role.value


# --- checks --------------------------------------------------------------------------------


def _positive(name: str, value: float) -> None:
    if not math.isfinite(value) or value <= 0:
        raise InvalidSectionError(f"{name} must be a positive number, got {value!r}.")


def _not_negative(name: str, value: float) -> None:
    if not math.isfinite(value) or value < 0:
        raise InvalidSectionError(f"{name} must be zero or more, got {value!r}.")


def _corner(
    fabrication: Fabrication, r: float | None, s: float | None
) -> tuple[str, float]:
    """The corner dimension that goes with the fabrication: r when rolled, s when welded."""
    if fabrication is Fabrication.ROLLED:
        if r is None:
            raise InvalidSectionError("A rolled section needs its root radius r.")
        _not_negative("Root radius r", r)
        return "r", r
    if s is None:
        raise InvalidSectionError("A welded section needs its weld leg s.")
    _not_negative("Weld leg s", s)
    return "s", s


def _flat(name: str, value: float, why: str) -> float:
    """c must be a positive length; otherwise the shape cannot exist."""
    if value <= 0:
        raise InvalidSectionError(
            f"The flat width {name} comes out as {value:g} mm, which is zero or less ({why}). "
            "These dimensions do not make a section."
        )
    return value


def _c_step(
    symbol: str,
    description: str,
    formula: str,
    substituted: str,
    value: float,
    latex: str,
    clause: str = CLAUSE,
) -> CalcStep:
    return CalcStep(
        symbol, description, clause, formula, substituted, value, units.LENGTH, latex
    )


def _num(value: float) -> str:
    return f"{value:g}"


# --- I-section -------------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class ISection:
    """Two flanges of width b joined by a web. Rolled has a root radius r; welded a weld leg s."""

    h: float
    b: float
    tw: float
    tf: float
    fabrication: Fabrication
    r: float | None = None
    s: float | None = None

    def validate(self) -> None:
        """Raises InvalidSectionError when the dimensions cannot make this shape."""
        self.plates()

    def plates(self) -> tuple[TemplatePlate, ...]:
        h, b, tw, tf = self.h, self.b, self.tw, self.tf
        for name, value in (("h", h), ("b", b), ("t_w", tw), ("t_f", tf)):
            _positive(name, value)
        name, k = _corner(self.fabrication, self.r, self.s)
        if 2 * tf >= h:
            raise InvalidSectionError(
                f"The two flanges (2 t_f = {2 * tf:g} mm) fill the whole height h = {h:g} mm: "
                "2 t_f must be less than h."
            )
        if tw >= b:
            raise InvalidSectionError(
                f"The web thickness t_w = {tw:g} mm is not less than the flange width b = {b:g} mm."
            )
        toe = "fillet" if self.fabrication is Fabrication.ROLLED else "weld"
        c_w = _flat("c_w", h - 2 * tf - 2 * k, f"h − 2 t_f − 2 {name}")
        c_f = _flat("c_f", (b - tw - 2 * k) / 2, f"(b − t_w − 2 {name}) / 2")
        web_source = f"c as drawn in Table 7.2 (between the {toe} toes)"
        flange_source = f"c as drawn in Table 7.3 (from the {toe} toe to the free edge)"
        web = _c_step(
            "c_w",
            f"flat width of the web, an internal plate: {web_source}",
            f"h − 2 t_f − 2 {name}",
            f"{_num(h)} − 2 × {_num(tf)} − 2 × {_num(k)}",
            c_w,
            tex(
                r"c_w = h - 2t_f - 2<n> = <h> - 2 \times <tf> - 2 \times <k> = <v>" + _LENGTH,
                n=name, h=h, tf=tf, k=k, v=c_w,
            ),
        )
        flange = _c_step(
            "c_f",
            f"flat width of the flange outstand: {flange_source}",
            f"(b − t_w − 2 {name}) / 2",
            f"({_num(b)} − {_num(tw)} − 2 × {_num(k)}) / 2",
            c_f,
            tex(
                r"c_f = \frac{b - t_w - 2<n>}{2} = \frac{<b> - <tw> - 2 \times <k>}{2} = <v>"
                + _LENGTH,
                n=name, b=b, tw=tw, k=k, v=c_f,
            ),
        )
        return (
            TemplatePlate(PlateRole.WEB, PlateType.INTERNAL, c_w, tw, web_source, web),
            TemplatePlate(PlateRole.FLANGE, PlateType.OUTSTAND, c_f, tf, flange_source, flange),
        )


# --- channel ---------------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class Channel:
    """A web with two flanges on one side. The flange outstand runs from the web face."""

    h: float
    b: float
    tw: float
    tf: float
    fabrication: Fabrication
    r: float | None = None
    s: float | None = None

    def validate(self) -> None:
        """Raises InvalidSectionError when the dimensions cannot make this shape."""
        self.plates()

    def plates(self) -> tuple[TemplatePlate, ...]:
        h, b, tw, tf = self.h, self.b, self.tw, self.tf
        for name, value in (("h", h), ("b", b), ("t_w", tw), ("t_f", tf)):
            _positive(name, value)
        name, k = _corner(self.fabrication, self.r, self.s)
        if 2 * tf >= h:
            raise InvalidSectionError(
                f"The two flanges (2 t_f = {2 * tf:g} mm) fill the whole height h = {h:g} mm: "
                "2 t_f must be less than h."
            )
        if tw >= b:
            raise InvalidSectionError(
                f"The web thickness t_w = {tw:g} mm is not less than the flange width b = {b:g} mm."
            )
        toe = "fillet" if self.fabrication is Fabrication.ROLLED else "weld"
        c_w = _flat("c_w", h - 2 * tf - 2 * k, f"h − 2 t_f − 2 {name}")
        c_f = _flat("c_f", b - tw - k, f"b − t_w − {name}")
        web_source = (
            f"by analogy with the I-section web sketch of Table 7.2 (between the {toe} toes); "
            "the PDF draws no channel"
        )
        flange_source = f"c as drawn in Table 7.3 (from the {toe} toe to the free edge)"
        web = _c_step(
            "c_w",
            f"flat width of the web, an internal plate: {web_source}",
            f"h − 2 t_f − 2 {name}",
            f"{_num(h)} − 2 × {_num(tf)} − 2 × {_num(k)}",
            c_w,
            tex(
                r"c_w = h - 2t_f - 2<n> = <h> - 2 \times <tf> - 2 \times <k> = <v>" + _LENGTH,
                n=name, h=h, tf=tf, k=k, v=c_w,
            ),
        )
        flange = _c_step(
            "c_f",
            f"flat width of the flange outstand: {flange_source}",
            f"b − t_w − {name}",
            f"{_num(b)} − {_num(tw)} − {_num(k)}",
            c_f,
            tex(
                r"c_f = b - t_w - <n> = <b> - <tw> - <k> = <v>" + _LENGTH,
                n=name, b=b, tw=tw, k=k, v=c_f,
            ),
        )
        return (
            TemplatePlate(PlateRole.WEB, PlateType.INTERNAL, c_w, tw, web_source, web),
            TemplatePlate(PlateRole.FLANGE, PlateType.OUTSTAND, c_f, tf, flange_source, flange),
        )


# --- T-section -------------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class TSection:
    """A flange of width b on top of a stem. The stem's flat width is typed: no table draws it.

    c_stem is needed for B.5 only; the section properties do not use it, so it may be left out
    (None) when only the properties are asked for.
    """

    h: float
    b: float
    tw: float
    tf: float
    fabrication: Fabrication
    c_stem: float | None = None
    r: float | None = None
    s: float | None = None

    def validate(self) -> None:
        """The geometry checks that do not involve the stem's typed flat width."""
        self._flange_flat()

    def _flange_flat(self) -> tuple[str, float, float]:
        h, b, tw, tf = self.h, self.b, self.tw, self.tf
        for name, value in (("h", h), ("b", b), ("t_w", tw), ("t_f", tf)):
            _positive(name, value)
        name, k = _corner(self.fabrication, self.r, self.s)
        if tf >= h:
            raise InvalidSectionError(
                f"The flange thickness t_f = {tf:g} mm is not less than the height h = {h:g} mm."
            )
        if tw >= b:
            raise InvalidSectionError(
                f"The stem thickness t_w = {tw:g} mm is not less than the flange width "
                f"b = {b:g} mm."
            )
        c_f = _flat("c_f", (b - tw - 2 * k) / 2, f"(b − t_w − 2 {name}) / 2")
        return name, k, c_f

    def plates(self) -> tuple[TemplatePlate, ...]:
        h, b, tw, tf = self.h, self.b, self.tw, self.tf
        if self.c_stem is None:
            raise InvalidSectionError("A T-section needs the stem flat width c_stem.")
        c_stem = self.c_stem
        _positive("c_stem", c_stem)
        if c_stem >= h:
            raise InvalidSectionError(
                f"The stem flat width c_stem = {c_stem:g} mm is not less than the height "
                f"h = {h:g} mm."
            )
        name, k, c_f = self._flange_flat()
        toe = "fillet" if self.fabrication is Fabrication.ROLLED else "weld"
        flange_source = (
            f"by analogy with the I-section flange sketch of Table 7.3 (from the {toe} toe to "
            "the free edge); the PDF draws no T-section"
        )
        stem_source = "typed: no table draws the stem of a T-section"
        flange = _c_step(
            "c_f",
            f"flat width of the flange outstand: {flange_source}",
            f"(b − t_w − 2 {name}) / 2",
            f"({_num(b)} − {_num(tw)} − 2 × {_num(k)}) / 2",
            c_f,
            tex(
                r"c_f = \frac{b - t_w - 2<n>}{2} = \frac{<b> - <tw> - 2 \times <k>}{2} = <v>"
                + _LENGTH,
                n=name, b=b, tw=tw, k=k, v=c_f,
            ),
        )
        stem = _c_step(
            "c_stem",
            f"flat width of the stem outstand, {stem_source}",
            "input",
            _num(c_stem),
            c_stem,
            tex(r"c_{stem} = <v>" + _LENGTH + r"\quad(\text{input})", v=c_stem),
            clause="input",
        )
        return (
            TemplatePlate(PlateRole.FLANGE, PlateType.OUTSTAND, c_f, tf, flange_source, flange),
            TemplatePlate(PlateRole.STEM, PlateType.OUTSTAND, c_stem, tw, stem_source, stem),
        )


# --- angle -----------------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class Angle:
    """An L of legs h (the longer) and b, thickness t. B.5 checks the one plate b̄ = h.

    r is the root radius (the inside corner between the legs). It changes the section properties
    and the drawing only, never b̄ = h (8.2.2(5)); None means not given yet, 0 means sharp.
    """

    h: float
    b: float
    t: float
    r: float | None = None

    def validate(self) -> None:
        self.plates()

    def plates(self) -> tuple[TemplatePlate, ...]:
        h, b, t = self.h, self.b, self.t
        for name, value in (("h", h), ("b", b), ("t", t)):
            _positive(name, value)
        if b > h:
            raise InvalidSectionError(
                f"h is the longer leg: h = {h:g} mm is shorter than b = {b:g} mm. Swap them."
            )
        if t >= b:
            raise InvalidSectionError(
                f"The thickness t = {t:g} mm is not less than the shorter leg b = {b:g} mm."
            )
        if self.r is not None:
            _not_negative("Root radius r", self.r)
            if self.r > b - t:
                raise InvalidSectionError(
                    f"The root radius r = {self.r:g} mm is more than the free length of the "
                    f"shorter leg, b − t = {b - t:g} mm."
                )
        source = "8.2.2(5): b̄ = h for equal-leg and unequal-leg angles"
        step = _c_step(
            "b̄ [leg]",
            f"flat width of the angle leg, an outstand: {source}",
            "h",
            _num(h),
            h,
            tex(r"\bar b = h = <v>" + _LENGTH, v=h),
        )
        return (TemplatePlate(PlateRole.LEG, PlateType.OUTSTAND, h, t, source, step),)


# --- rectangular hollow section ---------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class RHS:
    """Outer height h, outer width b, uniform wall t. Webs are the sides of height h.

    r_o is the outer corner radius; the inner radius is max(r_o − t, 0). It changes the section
    properties and the drawing only, never c = h − 3t (8.2.2(5)); None means not given, 0 sharp.
    """

    h: float
    b: float
    t: float
    r_o: float | None = None

    def validate(self) -> None:
        self.plates()

    def plates(self) -> tuple[TemplatePlate, ...]:
        h, b, t = self.h, self.b, self.t
        for name, value in (("h", h), ("b", b), ("t", t)):
            _positive(name, value)
        if 2 * t >= min(h, b):
            raise InvalidSectionError(
                f"The wall t = {t:g} mm is too thick: 2 t must be less than the smaller of "
                f"h = {h:g} mm and b = {b:g} mm."
            )
        if self.r_o is not None:
            _not_negative("Outer corner radius r_o", self.r_o)
            if self.r_o > min(h, b) / 2:
                raise InvalidSectionError(
                    f"The outer corner radius r_o = {self.r_o:g} mm is more than half the smaller "
                    f"of h = {h:g} mm and b = {b:g} mm."
                )
        c_web = _flat("c_w", h - 3 * t, "h − 3t")
        c_flange = _flat("c_f", b - 3 * t, "b − 3t")
        source = "c = h − 3t or b − 3t, 8.2.2(5) (the flat part, Table 7.2)"
        web = _c_step(
            "c_w",
            f"flat width of the web, an internal plate: {source}",
            "h − 3t",
            f"{_num(h)} − 3 × {_num(t)}",
            c_web,
            tex(r"c_w = h - 3t = <h> - 3 \times <t> = <v>" + _LENGTH, h=h, t=t, v=c_web),
        )
        flange = _c_step(
            "c_f",
            f"flat width of the flange, an internal plate: {source}",
            "b − 3t",
            f"{_num(b)} − 3 × {_num(t)}",
            c_flange,
            tex(r"c_f = b - 3t = <b> - 3 \times <t> = <v>" + _LENGTH, b=b, t=t, v=c_flange),
        )
        return (
            TemplatePlate(PlateRole.WEB, PlateType.INTERNAL, c_web, t, source, web),
            TemplatePlate(PlateRole.FLANGE, PlateType.INTERNAL, c_flange, t, source, flange),
        )


# --- circular hollow section ------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class CHS:
    """Outer diameter d and wall t. No plates: B.10 and B.11 use d and t directly."""

    d: float
    t: float

    def validate(self) -> None:
        self.plates()

    def plates(self) -> tuple[TemplatePlate, ...]:
        _positive("d", self.d)
        _positive("t", self.t)
        if 2 * self.t >= self.d:
            raise InvalidSectionError(
                f"The wall t = {self.t:g} mm is not less than half the diameter d = {self.d:g} mm."
            )
        return ()


Template = ISection | Channel | TSection | Angle | RHS | CHS
