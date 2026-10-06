"""Turning engine values into text. Conversion to kN happens here, not in core."""

import re

from stainless_csm.core.trace import CalcStep

_LOOKUP_FORMULA = re.compile(r"^(Table .+|\d+(\.\d+)*)$")


def kn(newtons: float) -> float:
    """N → kN, only for display."""
    return newtons / 1000.0


def number(value: float) -> str:
    """Compact number: small values keep significant figures, large ones get thousands spaces."""
    if value == 0:
        return "0"
    magnitude = abs(value)
    if magnitude < 0.01 or magnitude >= 1e7:
        return f"{value:.4g}"
    if magnitude >= 1000:
        return f"{value:,.1f}".replace(",", " ")
    return f"{value:.5g}"


def percent(fraction: float, signed: bool = False) -> str:
    return f"{fraction * 100:+.0f} %" if signed else f"{fraction * 100:.0f} %"


def step_line(step: CalcStep) -> str:
    """One line of working: symbolic form, numbers substituted, result."""
    unit = "" if step.unit == "–" else f" {step.unit}"
    value = number(step.value)
    if step.formula == "input":
        return f"{step.symbol} = {value}{unit}   (input)"
    if _LOOKUP_FORMULA.match(step.formula):
        return f"{step.symbol} = {value}{unit}   ({step.formula}: {step.substituted})"
    return f"{step.symbol} = {step.formula} = {step.substituted} = {value}{unit}"
