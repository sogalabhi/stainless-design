"""The calculation trace: every derived value, with clause, formula and numbers plugged in.

One trace feeds the "show working" panel, the PDF report and the tests.
"""

from collections.abc import Iterable, Iterator
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class CalcStep:
    """One line of working, e.g. ε_y = f_y / E = 210 / 200000 = 0.00105."""

    symbol: str
    description: str
    clause: str
    formula: str
    substituted: str
    value: float
    unit: str
    latex: str = ""  # the whole step as one LaTeX equation, for display


class CalcTrace:
    """Ordered list of :class:`CalcStep`, looked up by symbol."""

    def __init__(self, steps: Iterable[CalcStep] = ()) -> None:
        self._steps: list[CalcStep] = []
        for step in steps:
            self.add(step)

    def add(self, step: CalcStep) -> None:
        if any(existing.symbol == step.symbol for existing in self._steps):
            raise ValueError(f"Symbol {step.symbol!r} is already in the trace")
        self._steps.append(step)

    def get(self, symbol: str) -> CalcStep:
        for step in self._steps:
            if step.symbol == symbol:
                return step
        raise KeyError(symbol)

    @property
    def steps(self) -> tuple[CalcStep, ...]:
        return tuple(self._steps)

    def __iter__(self) -> Iterator[CalcStep]:
        return iter(self._steps)

    def __len__(self) -> int:
        return len(self._steps)
