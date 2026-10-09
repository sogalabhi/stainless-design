"""The "?" help on every input of the website: four short parts per field.

Source of truth: data/input_help.json, keyed by the dock field key.
Served at GET /api/v1/input-help.
"""

import json
from dataclasses import dataclass
from functools import cache
from importlib.resources import files

IN_STANDARD_PREFIX = "In EN 1993-1-4 ("
OUTSIDE_STANDARD = "Outside EN 1993-1-4: you provide it"


@dataclass(frozen=True, slots=True)
class InputHelpEntry:
    key: str  # the dock field key (the three plate fields are one entry each)
    name: str
    what: str  # what it is
    why: str  # the clauses and formulas that use it
    where: str  # where to get it; never a number of its own
    source: str  # "In EN 1993-1-4 (clause)" or "Outside EN 1993-1-4: you provide it"

    @property
    def in_standard(self) -> bool:
        return self.source.startswith(IN_STANDARD_PREFIX)


@cache
def load_input_help() -> tuple[InputHelpEntry, ...]:
    text = files("stainless_csm.data").joinpath("input_help.json").read_text(encoding="utf-8")
    records = json.loads(text)["fields"]
    return tuple(
        InputHelpEntry(
            key=key,
            name=r["name"],
            what=r["what"],
            why=r["why"],
            where=r["where"],
            source=r["source"],
        )
        for key, r in records.items()
    )
