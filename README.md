# stainless-csm

Continuous Strength Method (Annex B) calculations for stainless steel.

Internal units are always **N, mm, N/mm²**. Conversion happens only at the UI edge.

## Layout

```
src/stainless_csm/
  core/            enums, errors, calculation trace, unit labels (imports nothing else)
  config/          National Annex defaults (E, γM0, Ω)
  data/            Table 5.1 and Table B.1 as JSON + the repository that loads them
  materials/       Grade (Table 5.1) and Material (what the steel is)
  material_models/ stress–strain idealisations (what we assume about it), incl. B.4
tests/
```

## Develop

```
python -m venv .venv
.venv/bin/pip install -e ".[dev]"
.venv/bin/pytest
.venv/bin/ruff check . && .venv/bin/mypy
```

## Conventions

- Every derived value is recorded as a `CalcStep` in a `CalcTrace`, with clause,
  formula, substituted numbers and result. The UI "show working" and the report read it.
- Strain sign: compression (negative strain) mirrors the tension curve (odd symmetry).
- Nothing is extrapolated: `stress_at` outside the defined strain range raises `OutOfRangeError`.
- Table data in `data/*.json` was transcribed from working notes and must be checked
  against the printed Table 5.1 / Table B.1 before results are relied on.
