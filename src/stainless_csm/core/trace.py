"""The calculation trace: every derived value, with clause, formula and numbers plugged in.

One trace feeds the "show working" panel, the PDF report and the tests.

Every step names its source (plan.md, section 4h): a clause of a code, a textbook equation, a paper,
a value the user typed, or a value derived only from steps that cite one of those.
"""

import re
from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from enum import Enum

EN_1993_1_4 = "EN 1993-1-4:2025"
INPUT_CITATION = "Entered by the user"

# A clause, paragraph or formula number of EN 1993-1-4 as the steps write it: "B.4", "B.6.3.1(1)",
# "8.2.2(5)", "5.1.5". Only these (and "input") get a source from the clause alone.
_EN_1993_1_4_CLAUSE = re.compile(r"(?:[A-C]\.)?\d+(?:\.\d+)*(?:\(\d+\))?")


class SourceKind(Enum):
    """Where a step's rule or value comes from: the five kinds of plan.md, section 4h."""

    CODE = "code"  # an EN clause or formula
    TEXTBOOK = "textbook"  # author, edition, equation, page
    PAPER = "paper"  # a numbered reference of the standard's Bibliography, or a full citation
    INPUT = "input"  # a value the user typed, or copied with a Use click
    DERIVED = "derived"  # only when every step shown cites one of the other kinds


@dataclass(frozen=True, slots=True)
class Source:
    """The kind of source and the citation a reader can open, e.g. "EN 1993-1-4:2025, B.17"."""

    kind: SourceKind
    citation: str

    def __post_init__(self) -> None:
        if not isinstance(self.kind, SourceKind):
            raise TypeError(f"Source kind must be a SourceKind, got {self.kind!r}.")
        if not self.citation.strip():
            raise ValueError("A source needs a citation.")


def code(clause: str, standard: str = EN_1993_1_4) -> Source:
    """A clause or formula of a code, e.g. code("B.4(1), Formula (B.4)")."""
    return Source(SourceKind.CODE, f"{standard}, {clause}")


def user_input(citation: str = INPUT_CITATION) -> Source:
    """A value the user typed (or copied with a Use click)."""
    return Source(SourceKind.INPUT, citation)


def source_for_clause(clause: str) -> Source:
    """The source a bare clause implies, only where that is unambiguous.

    "input" is a typed value; a clause of EN 1993-1-4 ("B.17", "8.2.2(5)") is that clause of
    EN 1993-1-4:2025. Anything else raises ValueError: give the step an explicit source.
    """
    if clause == "input":
        return user_input()
    if _EN_1993_1_4_CLAUSE.fullmatch(clause):
        return code(clause)
    raise ValueError(f"Clause {clause!r} does not name a source; give the step an explicit one.")


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
    # Where the step comes from. Left out, it is taken from the clause (see source_for_clause);
    # after construction it is never None.
    source: Source | None = None

    def __post_init__(self) -> None:
        if self.source is None:
            object.__setattr__(self, "source", source_for_clause(self.clause))


def source_of(step: CalcStep) -> Source:
    """The step's source, typed as never None (CalcStep fills it in on construction)."""
    if step.source is None:  # pragma: no cover - __post_init__ always sets it
        raise ValueError(f"Step {step.symbol!r} has no source")
    return step.source


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
