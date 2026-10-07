# stainless-csm

Continuous Strength Method (EN 1993-1-4:2025, Annex B) for stainless steel: a calculation engine,
a web API and a website that shows every step of the working, for beginners and experts alike.

Internal units are always **N, mm, N/mm²**. Conversion to kN happens only when a number is shown.

## What is implemented

### Annex B formulas (the core scope)

| Clause | Content | Status |
|---|---|---|
| B.3 | General: CSM resistances replace 8.2 resistances; cold-formed f_ya, f_ua may be used | f_ya and f_ua are typed in as custom values (not computed) |
| B.4 | Material model: Formulas B.4, B.5, Table B.1, Figure B.1 | done |
| B.5.1 | Base curves, Formulas B.6 (flat plates) and B.7 (circular hollow sections), with the Ω cap | done |
| B.5.2 | Slenderness, Formulas B.8 to B.11 | done, conservative route (most slender plate); plates, circular hollow sections, or a numerical σ_cr,cs |
| B.6.1 | Tension, Formulas B.12 to B.14 (resistance only; no force check) | done |
| B.6.2 | Compression, B.15 to B.17 | next |
| B.6.3 | Bending, B.18 to B.20, Table B.2 | planned |
| B.6.4 | Combined bending and axial force, B.21 to B.29 | planned |

### Inputs from outside Annex B (never assumed)

Anything that Annex B uses but does not define is an input. Every one starts **empty** on the
website, nothing is pre-filled or suggested, and the engine has no defaults (each is a required
argument). The working shows such a value as "input", never as a clause.

| Input | Used in |
|---|---|
| E | B.4 (ε_y), B.9, B.11 |
| ν (Poisson's ratio), unless σ_cr,cs is entered | B.9, B.11 |
| γ_M0 | B.12 |
| Ω | B.6, B.7 |
| k_σ of each plate | B.9 |
| Plate widths b̄ and thicknesses t, or d and t for a tube | B.9, B.11 |
| σ_cr,cs and the section family, optionally (a numerical value) | B.8 |
| Area A, "section has holes" | B.12 |
| f_y, f_u and the family (or f_ya, f_ua when cold-formed, B.3(3)) | B.4 |

The only lookup that is not an Annex B formula is the grade library (Table 5.1, with corrosion
classes from Table A.3). It exists because grade, f_y and f_u are linked fields: picking a grade
fills f_y, f_u and the family, f_y and f_u stay editable, and a combination that matches no grade is
simply "Custom".

There are no section presets (no RHS or I-section shortcuts) and no pass/fail verdict, force check
or "classic" comparison, because those need rules from outside Annex B.

Also added, none of it affecting results:

- **Input checks and guard rails:** f_u > f_y, C₂ε_u > ε_y, 0 <= ν < 0.5, a section too slender for
  the CSM, a section with holes in tension. Nothing fails silently.
- **Presentation:** a calculation trace for every step (clause, formula, numbers, result, LaTeX),
  charts, the symbol glossary, the web API and the website.

### Deliberately not implemented

Section classification (7.5), effective widths (8.2.2), member buckling (8.3), lateral-torsional
buckling, connections, fatigue, fire. The engine does not check anything outside Annex B.

## Symbols

One line per symbol, in the order they appear. The same glossary is served by `GET /api/v1/symbols`
and shown on each website page under "Symbols used on this page". Longer explanations can be added
later in a separate module. The source is `src/stainless_csm/data/symbols.json`; this table is
generated from it (`python -m stainless_csm.symbols`) and a test keeps the two in step.

<!-- symbols:start -->

**Material and the CSM model (B.4)**

| Symbol | Meaning | Unit | Clause |
|---|---|---|---|
| f_y | Yield strength: The 0.2 % proof strength: the stress where the steel starts to yield; an input. | N/mm² | input |
| f_u | Ultimate tensile strength: The highest stress the steel reaches before it fails; an input. | N/mm² | input |
| f_ya, f_ua | Average strengths of cold-formed sections: Yield and ultimate strength raised by cold-forming; may replace f_y and f_u (B.3(3)); an input. | N/mm² | B.3(3) |
| E | Modulus of elasticity: Stiffness of the elastic range, the slope of the first line; an input. | N/mm² | input |
| ν | Poisson's ratio: Ratio of lateral to axial strain in the elastic range; an input. | - | input |
| ε_y | Yield strain: Elastic strain at the yield strength, f_y / E. | - | B.4 |
| ε_u | Ultimate strain: Strain at the ultimate strength, estimated from f_y / f_u (Formula B.5). | - | B.4 |
| E_sh | Strain hardening modulus: Slope of the second line of the bilinear model: rise over run from (ε_y, f_y) to (C₂ε_u, f_u). | N/mm² | B.4 |
| C₁ | CSM coefficient C1: Sets the ductility cap C₁ε_u (Table B.1). | - | B.4 |
| C₂ | CSM coefficient C2: Sets where the hardening line ends, C₂ε_u (Table B.1). | - | B.4 |
| C₃ | CSM coefficient C3: Scales the ultimate strain ε_u; lower for the less ductile ferritic steels (Table B.1). | - | B.4 |
| C₁ε_u | Ductility cap: The largest strain the method lets you use. | - | B.4 |
| C₂ε_u | End of the bilinear curve: Strain where the stress reaches f_u: an anchor point for the straight line, not the fracture strain. | - | B.4 |
| σ(C₁ε_u) | Stress at the ductility cap: Stress on the hardening line at C₁ε_u. | N/mm² | B.4 |
| E_sh/E | Hardening ratio: Hardening slope as a fraction of the elastic slope. | - | B.4 |
| C₁ε_u/ε_y | Ductility cap ratio: The ductility cap as a multiple of the yield strain; compared with 15 in Formula B.14. | - | B.4 |

**Slenderness and the base curve (B.5)**

| Symbol | Meaning | Unit | Clause |
|---|---|---|---|
| σ_cr,p | Plate buckling stress: Elastic critical buckling stress of one plate element (Formula B.9). | N/mm² | B.5.2 |
| σ_cr,cs | Section buckling stress: Elastic critical local buckling stress of the full cross-section; here the most slender plate. | N/mm² | B.5.2 |
| σ_cr,c | Tube buckling stress: Elastic critical local buckling stress of a circular hollow section (Formula B.11). | N/mm² | B.5.2 |
| λ_p | Plate slenderness: Relative slenderness of one plate, the square root of f_y / σ_cr,p. | - | B.5.2 |
| λ_p,cs | Cross-section slenderness (plates): Relative slenderness of a section of flat plates: the square root of f_y / σ_cr,cs (Formula B.8). | - | B.5.2 |
| λ_c,cs | Cross-section slenderness (tube): Relative slenderness of a circular hollow section: the square root of f_y / σ_cr,c (Formula B.10). | - | B.5.2 |
| λ_cs | Cross-section slenderness: The slenderness used on the base curve: λ_p,cs for plates or λ_c,cs for tubes. | - | B.5.1 |
| k_σ | Plate buckling factor: How easily a plate buckles; an input for each plate. | - | input |
| ε_csm | CSM strain limit: The limiting compressive strain the cross-section can reach before local buckling. | - | B.5.1 |
| ε_csm/ε_y | Strain limit ratio: The CSM strain limit as a multiple of the yield strain; above 1 the section can strain-harden. | - | B.5.1 |
| (ε_csm/ε_y) base curve | Base curve value: The value read from the base curve (B.6 or B.7) before the cap is applied. | - | B.5.1 |
| min(Ω, C₁ε_u/ε_y) | Strain cap: The cap on the stocky branch: the smaller of Ω and the material ductility cap. | - | B.5.1 |
| Ω | Plastic deformation parameter: Limit on the permitted plastic strain; an input. | - | input |

**Section dimensions**

| Symbol | Meaning | Unit | Clause |
|---|---|---|---|
| b̄ | Flat plate width: Width of the flat part of a plate element; an input. | mm | input |
| t | Thickness: Thickness of a plate or wall; an input. | mm | input |
| d | Outer diameter: Outer diameter of a circular hollow section; an input. | mm | input |

**Tension (B.6.1)**

| Symbol | Meaning | Unit | Clause |
|---|---|---|---|
| A | Cross-sectional area: Gross area of the cross-section; an input. | mm² | input |
| γ_M0 | Partial factor: Safety factor on cross-section resistance; an input. | - | input |
| ε_csm,t/ε_y | Tensile strain limit ratio: The smaller of 15 and C₁ε_u/ε_y (Formula B.14). | - | B.6.1 |
| ε_csm,t | Tensile strain limit: Maximum attainable CSM tensile strain. | - | B.6.1 |
| 15ε_y | Fixed strain cap: The fixed limit of 15 times the yield strain written into Formula B.14. | - | B.6.1 |
| f_csm,t | CSM tensile design stress: Stress on the hardening line at ε_csm,t (Formula B.13). | N/mm² | B.6.1 |
| N_csm,t,Rd | CSM tension resistance: Design value of the CSM resistance to tension axial force (Formula B.12). | N | B.6.1 |

<!-- symbols:end -->

## Layout

```
src/stainless_csm/
  core/            enums, errors, calculation trace (CalcStep, with LaTeX), LaTeX helper, units
  config/          E, ν, γM0, Ω and the fixed cap of 15 in B.14 (kept separate on purpose)
  data/            Table 5.1 and Table B.1 as JSON, and the repository that loads them
  materials/       Grade (Table 5.1) and Material (what the steel is)
  material_models/ stress-strain models: CSM bilinear (B.4) and the classic elastic-plastic one
  csm/             Annex B: slenderness (B.5.2), base curve (B.5.1), section presets, tension (B.6.1)
  services.py      use cases shared by every front end (no UI imports), incl. the thickness sweep
  formatting.py    number and text formatting (no UI imports)
  viz/             strain axis and Plotly figures (no UI imports)
  api/             FastAPI service: schemas, mappers, routes, OpenAPI export
  ui/              PySide6 desktop app (paused, see below)
apps/web/          React + TypeScript website, talks to the API only
tests/             engine, API, contract and desktop tests
```

Arrows point inward: `core` imports nothing, the engine never imports a UI, and the front ends
only call `services` or the API.

## Run the website

```
.venv/bin/pip install -e ".[web]"
cd apps/web && npm install && npm run build      # once, builds apps/web/dist
.venv/bin/stainless-csm-api                       # http://127.0.0.1:8100 (API and built site)
```

The website has three steps, **1 Material (B.4)**, **2 Tension (B.6.1)** and **3 Deformation
capacity (B.5)**, a **4 Visualise** tab and a **Help** tab. "Graph view" switches between a schematic
(not to scale, like Figure B.1) and a true-scale view. "Show working" lists each calculation step as
a typeset equation, and "Symbols used on this page" explains every symbol in one line.

**4 Visualise** shows stocky against slender live. It carries the same material and section fields
as steps 1 and 3 (one shared state, so a change in either place shows in both) and redraws as you
type. A slider multiplies every thickness (widths, diameter and k_σ stay as entered), and each
position is a full B.5 calculation on the B.4 material, run by the engine, not re-derived in the
browser. It shows:

- a 3D view (three.js, loaded only when the tab opens) with your section, the section where the cap
  just holds, the one where the strain limit has fallen to yield, the thinnest section the method
  accepts, and the slider section, side by side. The sections are drawn from the plate widths or
  diameter you entered, and the plates are drawn as separate slabs because Annex B gives them no
  layout;
- the base curve and the material curve, each with those sections and the slider marked, and the
  flat-yield curve for contrast;
- a strain and stress picture across the depth of a bent section, with the CSM stress against the
  flat-yield stress (no moment: B.6.3 is not built).

The wave size in 3D is only a picture of "more slender, more buckling": the CSM does not calculate a
buckled shape. A typed σ_cr,cs has no thickness to change, so that mode shows a message instead.

The Help tab also has a **Buckling and bending** topic: overall buckling, local buckling and plastic
bending, a moment-rotation sketch of the IS 800 classes against the continuous CSM, and a table of
mild steel (IS 800) against this tool.

The API port is 8100 (8000 is often taken by other dev servers); change it with
`STAINLESS_CSM_PORT`. For front-end development run `npm run dev` in `apps/web`; Vite proxies
`/api` to the API.

### API

| Method | Path | Clause |
|---|---|---|
| GET | `/api/v1/health` | |
| GET | `/api/v1/grades` | Table 5.1 |
| GET | `/api/v1/csm-coefficients` | Table B.1 |
| POST | `/api/v1/material-model` | B.4 |
| POST | `/api/v1/tension` | B.6.1 |
| POST | `/api/v1/deformation-capacity` | B.5 |
| POST | `/api/v1/section-comparison` | B.5 and B.4 for the section made thicker and thinner |

Domain errors come back as HTTP 422 with a plain message and an `error_type`. Interactive docs are
served at `/docs`. After changing the schemas, regenerate the TypeScript types:
`PYTHON=../../.venv/bin/python npm run gen:api` (from `apps/web`).

## Deploy to Vercel

One Vercel project with two services: the website (static build) and the API (one Python serverless function). The website calls the API through relative `/api/v1/...` URLs on the same domain, so no service binding is needed.

| File | Role |
|---|---|
| `vercel.json` | Two services: `web` (Vite, `apps/web`) and `api` (FastAPI, `api/index.py`). `/api/*` goes to `api`, everything else to `web` |
| `api/index.py` | The function: exposes the FastAPI `app` (adds `src/` to the path) |
| `pyproject.toml` | Function dependencies (`dependencies`: `fastapi`, `plotly`). Vercel installs from here and ignores `requirements.txt`. PySide6 and matplotlib stay in the `ui` extra, so they are not deployed |
| `.python-version` | Python version for the function |
| `.vercelignore` | Keeps `.venv`, `node_modules` and `tests` out of the upload |

Import the repository in Vercel (root directory = the repository root) or run `vercel` from it.
Try it locally first with `vercel dev`, which runs both services together. The first request after idle time is slower (cold start).

## Desktop app (paused)

A PySide6 version of steps 1 and 2 exists in `src/stainless_csm/ui`. It is not being developed and
lacks the linked grade fields, the LaTeX working and step 3.

```
.venv/bin/pip install -e ".[ui]"
.venv/bin/stainless-csm
```

## Develop

```
python -m venv .venv
.venv/bin/pip install -e ".[dev,web,ui]"
.venv/bin/pytest                                  # engine, API, contract tests
.venv/bin/ruff check . && .venv/bin/mypy         # lint and strict type check
cd apps/web && npm run build                      # `npm test` / `npm run typecheck`: to be updated
```

A contract test runs the same input through the service and through the API for all 15 grades and
asserts identical numbers, so the website can never disagree with the engine.

## Conventions

- Every derived value is recorded as a `CalcStep` in a `CalcTrace`: clause, formula, substituted
  numbers, result and a LaTeX equation. The website's "show working" and any report read it.
- The cap of 15 in Formula B.14 and the parameter Ω are separate settings (`TENSION_STRAIN_RATIO_CAP`
  and `OMEGA`), because the standard writes them as different symbols.
- Compression (negative strain) mirrors the tension curve. `stress_at` never extrapolates: outside
  the defined range it raises `OutOfRangeError`.
- Table data in `data/*.json` is transcribed from EN 1993-1-4:2025: Table 5.1 (p.14), Table A.3 for
  corrosion classes (p.57) and Table B.1 (p.60). Footnotes are kept in `note`.
- No emoji anywhere (UI, code or docs); messages are shown with an icon and words, never colour
  alone. `tests/test_no_emoji.py` enforces this.

## Known limits

- σ_cr,cs uses the conservative most-slender-plate route. The Gardner et al. formulae (reference
  [9]) and the full EN 1993-1-5 k_σ rules are not in the PDF; a numerical σ_cr,cs can be entered.
- Each plate's k_σ is the user's input; the app does not know the rules for it.
- The front-end tests (`npm test`) are out of date after the "no assumptions" change and are
  to be updated; the Python tests (`pytest`) are current.
- The tension screen does not check the B.2 slenderness limits (only the area is given); step 3
  covers them for a section.
- Elliptical hollow sections are outside B.6.1.
- The Visualise tab needs a circular hollow section or flat plates. A tube cannot be made thicker
  than half its diameter, so the slider stops there. The 3D wrinkles are illustrative, and the
  bending picture shows stress, not a moment.
