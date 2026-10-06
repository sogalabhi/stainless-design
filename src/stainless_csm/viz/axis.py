"""The strain axis used by every chart: true scale, or schematic with evenly spaced key strains.

In schematic mode (like Figure B.1) the labelled strains are spaced evenly so every part of the
curve is visible. Both curves are straight lines between those strains, so they stay straight.
"""

from collections.abc import Callable
from dataclasses import dataclass


@dataclass(frozen=True)
class StrainAxis:
    """Maps strain to x. In schematic mode the labelled strains are evenly spaced."""

    strains: tuple[float, ...]
    labels: tuple[str, ...]
    schematic: bool

    @classmethod
    def build(cls, labelled: list[tuple[float, str]], schematic: bool) -> "StrainAxis":
        merged: list[tuple[float, str]] = []
        for strain, label in sorted(labelled):
            if merged and abs(strain - merged[-1][0]) <= 1e-9 * max(strain, 1e-12):
                names = merged[-1][1].split(" = ")
                if label not in names:
                    merged[-1] = (merged[-1][0], f"{merged[-1][1]} = {label}")
            else:
                merged.append((strain, label))
        return cls(tuple(s for s, _ in merged), tuple(n for _, n in merged), schematic)

    def x(self, strain: float) -> float:
        if not self.schematic:
            return strain
        knots = self.strains
        for i in range(len(knots) - 1):
            if strain <= knots[i + 1] or i == len(knots) - 2:
                return i + (strain - knots[i]) / (knots[i + 1] - knots[i])
        return 0.0

    def ticks(self, typeset: Callable[[str], str] = str) -> tuple[list[float], list[str]]:
        values = [self.x(s) for s in self.strains]
        if not self.schematic and self.labels[0] == "0":
            # in true scale the origin tick would collide with ε_y; the axes already show 0
            values, strains, labels = values[1:], self.strains[1:], self.labels[1:]
        else:
            strains, labels = self.strains, self.labels
        text = [
            "0" if n == "0" else f"{typeset(n)}\n{s:.4g}"
            for s, n in zip(strains, labels, strict=True)
        ]
        return values, text
