"""The symbol glossary: one line per symbol, for the website and the README.

Source of truth: data/symbols.json. Print the README table with `python -m stainless_csm.symbols`.
"""

import json
from dataclasses import dataclass
from functools import cache
from importlib.resources import files

README_START = "<!-- symbols:start -->"
README_END = "<!-- symbols:end -->"


@dataclass(frozen=True, slots=True)
class SymbolEntry:
    symbol: str  # exactly as used in the calculation trace
    latex: str
    name: str
    meaning: str
    unit: str
    clause: str
    group: str
    topics: tuple[str, ...]
    detail: str  # the long explanation shown on the Help page
    diagram: str | None  # which sketch is drawn beside it


@cache
def load_symbols() -> tuple[SymbolEntry, ...]:
    text = files("stainless_csm.data").joinpath("symbols.json").read_text(encoding="utf-8")
    records = json.loads(text)["symbols"]
    return tuple(
        SymbolEntry(
            symbol=r["symbol"],
            latex=r["latex"],
            name=r["name"],
            meaning=r["meaning"],
            unit=r["unit"],
            clause=r["clause"],
            group=r["group"],
            topics=tuple(r["topics"]),
            detail=r["detail"],
            diagram=r.get("diagram"),
        )
        for r in records
    )


def symbols_for(topic: str | None = None) -> list[SymbolEntry]:
    entries = load_symbols()
    return [e for e in entries if topic is None or topic in e.topics]


def symbols_markdown() -> str:
    """The glossary as markdown tables, one per group."""
    lines: list[str] = []
    group = None
    for entry in load_symbols():
        if entry.group != group:
            group = entry.group
            lines += [
                "",
                f"**{group}**",
                "",
                "| Symbol | Meaning | Unit | Clause |",
                "|---|---|---|---|",
            ]
        lines.append(
            f"| {entry.symbol} | {entry.name}: {entry.meaning} | {entry.unit} | {entry.clause} |"
        )
    return "\n".join(lines).strip()


if __name__ == "__main__":
    print(symbols_markdown())
