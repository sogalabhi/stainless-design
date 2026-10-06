Dont use emojies anywher. doesnt lookk profesion. use icons. 

Yes, but only a few are truly useful. B.4 and tension are 1D/2D calculations at heart, so most 3D plots would be decoration. A 3D plot earns its place when **two inputs change at once** and you want to see the effect on one output.

## Useful 3D visuals

| # | Visual | Axes | What it shows | Why it's worth it |
|---|---|---|---|---|
| 1 ⭐ | **Gain surface** | x = f_y, y = f_u, z = f_csm,t / f_y (one surface per family) | How much tension strength CSM adds for any steel | The surface has a visible **crease (fold line)** where the governing term in B.14 switches from 15 to C₁ε_u/ε_y. That's the best 3D picture in this scope. |
| 2 | **Hardening surface** | x = f_y, y = f_u, z = E_sh | How the hardening slope depends on strength and its ratio | The surface shoots up and breaks where C₂ε_u ≤ ε_y. Cut that region out and colour it red as "model not valid". |
| 3 | **3D tension member** | An extruded I-section or RHS with load arrows | The real member being checked, coloured by utilisation, with elongation exaggerated | It's mostly cosmetic, since stress in pure tension is uniform (one colour). But it helps beginners connect the numbers to a real member. |

You can draw the crease line in visual 1 exactly. It's where C₁·C₃·(1 − f_y/f_u)·E / f_y = 15. For austenitic, that's f_y ≈ 1333 × (1 − f_y/f_u).

As a sanity check: duplex 450/650 falls on the "C₁ε_u/ε_y governs" side of the line, which matches your earlier test case. Drawing this line on the surface also proves your code and the theory agree.

## The truly 3D one (later)

**N–M_y–M_z interaction surface (B.6.4).** Once you do combined bending and axial force, the check in B.23 is a real 3D surface. The design point is a dot: inside the surface means safe, outside means fail. This is the classic 3D plot in steel design.

## Two pieces of advice

- **Always pair a 3D surface with a 2D contour or heatmap of the same data.** 3D looks impressive but is hard to read exact values from, especially in a printed report. The contour is what the reader actually uses, and the crease shows up there as a clear line too.
- **Avoid 3D for things that are naturally 2D**, like stress–strain curves stacked as 3D ribbons. They look fancy but are harder to read than the 2D overlay.

## Tools

- **matplotlib (mplot3d)** is simple and static, and good enough for reports. It's already in your stack.
- **plotly** gives rotate and zoom in a Jupyter notebook, which is great for showing your prof live.
- **pyvista** is better for visual 3 (actual member geometry). It's only worth adding if you build the desktop app.

That works well. The calculation engine is written once, and the two front ends are just different ways into it.

## Overall shape

```
              ┌──────────────────────────────┐
              │  stainless_csm (Python pkg)  │
              │  domain · services · schemas │
              │  viz · data                  │
              └──────────────┬───────────────┘
           direct import     │      direct import
        ┌────────────────────┴────────────────────┐
        ▼                                         ▼
 PySide6 desktop app                      FastAPI server
 (offline, no server)                            │  HTTP / JSON
                                                 ▼
                                       React web app (browser)
```

**The desktop imports the engine directly; it does not call the API.** That way the desktop works offline, needs no server running, and is faster. Only the web app needs the API, because a browser can't run your Python.

## Folder structure (one repo)

```
stainless-csm/
├── pyproject.toml              # Python workspace (uv)
├── packages/
│   └── stainless_csm/          # the shared engine
│       ├── src/stainless_csm/
│       │   ├── domain/         # enums, errors, Material, CSMMaterialModel, CSMTension
│       │   ├── schemas/        # Pydantic input/output models
│       │   ├── services/       # run_material_model(), run_tension()
│       │   ├── viz/            # plot data / Plotly figure specs
│       │   └── data/           # Table 5.1, Table B.1 as JSON
│       └── tests/
├── apps/
│   ├── api/                    # FastAPI
│   │   ├── main.py
│   │   ├── routers/
│   │   ├── error_handlers.py
│   │   └── tests/
│   ├── desktop/                # PySide6
│   │   ├── main.py
│   │   ├── views/
│   │   ├── presenters/
│   │   └── tests/
│   └── web/                    # React + Vite + TypeScript
│       └── src/ (api/, components/, pages/, types/)
└── README.md
```

## The layers inside the engine, and why each exists

| Layer | Contains | Depends on | Why it's separate |
|---|---|---|---|
| `domain` | The classes we designed (formulas, validation) | Nothing | Pure maths. It's easiest to test and never changes because of UI decisions. |
| `schemas` | Pydantic models: `MaterialInput`, `TensionInput`, `TensionOutput`, etc. | Pydantic | Defines the "shape" of data going in and out. The API needs it; the desktop reuses it for input validation. Keeps Pydantic out of the domain. |
| `services` | One function per use case: build `Material` → model → tension → return the output schema | domain, schemas | **This is the most important layer.** Both apps call it, so the steps "create material, then model, then check" are written once, not twice. |
| `viz` | Plot *data*: curve points, key points, shaded regions; optionally full Plotly figure JSON | domain | The same plot data on both sides means the web and desktop graphs always show the same numbers. |
| `data` | Table 5.1 and Table B.1 as JSON | – | The code tables live in one place. |

**Rule:** arrows only point inward. `domain` imports nothing, and the apps import the engine, never the other way round. Break this once and you'll get circular imports and logic leaking into the UI.

### One choice to make for plots

- **Option A: share Plotly figure JSON.** `viz` builds the figure once. The web renders it with Plotly.js, and the desktop renders the *same* JSON inside a `QWebEngineView`. The plots are identical and written once, but the desktop app gets about 100 MB bigger, since it bundles a browser engine.
- **Option B: share only the data.** `viz` returns points; the web draws them with Plotly.js and the desktop with matplotlib. The desktop app stays lighter, but you write each plot twice.

I'd pick **A**, because writing every plot twice is a long-term cost, while app size isn't a real problem for a student project.

## API design

| Method | Path | Returns | Clause |
|---|---|---|---|
| GET | `/api/v1/health` | ok | – |
| GET | `/api/v1/grades` | Table 5.1 grades | 5.1 |
| GET | `/api/v1/csm-coefficients` | Table B.1 | B.4 |
| POST | `/api/v1/material-model` | ε_y, ε_u, E_sh, key points, curve | B.4 |
| POST | `/api/v1/tension` | ratio, governing term, f_csm,t, N_csm,t,Rd, N_pl,Rd, gain | B.6.1 |

**Why each choice:**
- **`/v1` in the path:** when you add B.5 or change an output later, old clients don't break.
- **POST for calculations:** the inputs are a structured body, not short query strings.
- **Error mapping:** domain errors become HTTP **422** with a clear message, through one handler in `error_handlers.py`. The desktop maps the same errors to a message box. One error type gives one message in both apps.
- **Generated TypeScript types:** FastAPI produces an OpenAPI spec automatically. Use **openapi-typescript** to generate the TypeScript types for React from it. Then the web app and API can never disagree about field names.

## Desktop structure (Model–View–Presenter)

- **View:** widgets only (inputs, plot area, results). No maths, no engine calls.
- **Presenter:** reads the inputs from the view, calls `services`, and puts the results back into the view.

**Why:** you can test the presenter with pytest without opening a window. This is the same idea as keeping logic out of Flutter widgets.

## Web structure

- React + Vite + TypeScript
- **TanStack Query** for API calls, which handles loading, errors and caching
- **Plotly.js** for plots
- **KaTeX** for equations

## Tests at each level

1. **Engine:** the hand-calculated values we already have (B.4 and tension).
2. **Services:** a given input schema gives the expected output schema.
3. **API:** FastAPI's `TestClient` (good input → 200, bad input → 422).
4. **Contract test, the important one:** run the same input through the service directly and through the API, and assert the results are identical. This proves desktop and web can never show different numbers.
5. **Desktop:** presenter tests without a GUI.

## Build order

1. **Engine `domain`** (already planned), with tests.
2. **`schemas` and `services`** for B.4 only.
3. **`viz`** for the B.4 curve.
4. **API** with the B.4 endpoint and the contract test.
5. **A minimal desktop screen** for B.4.
6. **A minimal web page** for B.4, with generated types.
7. **Tension**, added to engine → API → desktop → web.

**Why B.4 in all three apps before tension:** a thin "vertical slice" through every layer shows any sharing problems early, like schemas that don't fit or plots that don't render the same. Then tension is just "repeat the pattern".

**One honest warning:** two front ends roughly double the UI work. If time gets tight, finish the engine, the API and **one** front end properly before polishing the other. A finished app beats two half-done ones in a review.

When you've built the domain layer, share it and I'll review it before you start on the schemas and services.


Here are the visuals that make sense for B.4 and tension, grouped by what they explain. ⭐ marks the must-haves, the ones your prof will most likely expect.

## B.4: material model

| # | Visual | What it shows | Why it helps |
|---|---|---|---|
| 1 ⭐ | **Bilinear stress–strain curve** (a live Figure B.1) | The elastic line, the hardening line, and points at ε_y, C₁ε_u, C₂ε_u, f_y and f_u | Turns the three formulas into one picture. It's the base for almost every other visual. |
| 2 ⭐ | **CSM vs elastic-perfectly-plastic overlay** | The CSM line against a flat line at f_y, with the gap between them shaded | Shows what CSM adds: extra strength from strain hardening that the old method ignores. |
| 3 | **Family comparison** | Austenitic, duplex and ferritic curves on one plot, ideally normalised (σ/f_y against ε/ε_y) | Shows how Table B.1 changes the curve shape. Ferritic hardens less and stops earlier. |
| 4 | **E_sh vs f_y/f_u ratio** | How the hardening slope changes as f_y gets closer to f_u, with the invalid zone (C₂ε_u ≤ ε_y) shaded | Explains why your validation rule exists. A "strong but not ductile" steel breaks the model. |

## B.6.1: tension

| # | Visual | What it shows | Why it helps |
|---|---|---|---|
| 5 ⭐ | **Tension point on the B.4 curve** | A marker at (ε_csm,t, f_csm,t) on the hardening line, with the band between f_y and f_csm,t shaded | Shows that tension is just "reading a point off B.4". This links the two clauses. |
| 6 ⭐ | **The two strain caps** | Vertical lines at 15ε_y and C₁ε_u, with the one further left highlighted as "governs" | Makes the min{} in B.14 visible. Otherwise users just see a number. |
| 7 ⭐ | **Resistance bars** | N_pl,Rd (classic A·f_y/γ_M0) next to N_csm,t,Rd, with the % gain labelled | The final answer: how much more load CSM allows. |
| 8 | **Utilisation gauge** (only if N_Ed is given) | N_Ed / N_csm,t,Rd as green, amber or red | An instant pass/fail a beginner can read. |
| 9 | **Gain vs f_y, one line per family** | f_csm,t / f_y as f_y increases | Has a visible kink where the governing term switches from 15 to C₁ε_u/ε_y. It's the most "engineering insight" plot in the set. |
| 10 | **All grades in Table 5.1** | A bar chart of the % gain for every grade (1.4003, 1.4307, 1.4462, …) | Lets your prof see in one glance which steels benefit most from CSM. |

## For explaining the project

| # | Visual | What it shows | Why it helps |
|---|---|---|---|
| 11 ⭐ | **Calculation flow diagram** | Inputs (f_y, f_u, E, family, A, γ_M0) → ε_y → ε_u → E_sh → strain ratio → f_csm,t → N_csm,t,Rd, with the formula number on each arrow | Shows the order of calculation and where each input enters. Very useful in a presentation. |

## Later, when you do B.5

| # | Visual | What it shows |
|---|---|---|
| 12 | **Base curve ε_csm/ε_y vs slenderness** | Formulas B.6 and B.7, with the Ω cap, the 0.68 switch point, and the user's section as a dot |

## Suggested order

Build 1 → 2 → 5 → 6 → 7 first. Together they tell the full story: "here's the model, here's what it adds, here's where tension sits, here's which limit governs, and here's the final gain."

Add 9 and 11 next. Those two show you understood the code, not just coded it.

One reminder for plot 1: the elastic part is tiny compared to the hardening part. Add a zoomed inset near ε_y, or label your schematic version "not to scale".

Yes, but only a few are truly useful. B.4 and tension are 1D/2D calculations at heart, so most 3D plots would be decoration. A 3D plot earns its place when **two inputs change at once** and you want to see the effect on one output.

## Useful 3D visuals

| # | Visual | Axes | What it shows | Why it's worth it |
|---|---|---|---|---|
| 1 ⭐ | **Gain surface** | x = f_y, y = f_u, z = f_csm,t / f_y (one surface per family) | How much tension strength CSM adds for any steel | The surface has a visible **crease (fold line)** where the governing term in B.14 switches from 15 to C₁ε_u/ε_y. That's the best 3D picture in this scope. |
| 2 | **Hardening surface** | x = f_y, y = f_u, z = E_sh | How the hardening slope depends on strength and its ratio | The surface shoots up and breaks where C₂ε_u ≤ ε_y. Cut that region out and colour it red as "model not valid". |
| 3 | **3D tension member** | An extruded I-section or RHS with load arrows | The real member being checked, coloured by utilisation, with elongation exaggerated | It's mostly cosmetic, since stress in pure tension is uniform (one colour). But it helps beginners connect the numbers to a real member. |

You can draw the crease line in visual 1 exactly. It's where C₁·C₃·(1 − f_y/f_u)·E / f_y = 15. For austenitic, that's f_y ≈ 1333 × (1 − f_y/f_u).

As a sanity check: duplex 450/650 falls on the "C₁ε_u/ε_y governs" side of the line, which matches your earlier test case. Drawing this line on the surface also proves your code and the theory agree.

## The truly 3D one (later)

**N–M_y–M_z interaction surface (B.6.4).** Once you do combined bending and axial force, the check in B.23 is a real 3D surface. The design point is a dot: inside the surface means safe, outside means fail. This is the classic 3D plot in steel design.

## Two pieces of advice

- **Always pair a 3D surface with a 2D contour or heatmap of the same data.** 3D looks impressive but is hard to read exact values from, especially in a printed report. The contour is what the reader actually uses, and the crease shows up there as a clear line too.
- **Avoid 3D for things that are naturally 2D**, like stress–strain curves stacked as 3D ribbons. They look fancy but are harder to read than the 2D overlay.

## Tools

- **matplotlib (mplot3d)** is simple and static, and good enough for reports. It's already in your stack.
- **plotly** gives rotate and zoom in a Jupyter notebook, which is great for showing your prof live.
- **pyvista** is better for visual 3 (actual member geometry). It's only worth adding if you build the desktop app.

Yes, but only a few are truly useful. B.4 and tension are 1D/2D calculations at heart, so most 3D plots would be decoration. A 3D plot earns its place when **two inputs change at once** and you want to see the effect on one output.

## Useful 3D visuals

| # | Visual | Axes | What it shows | Why it's worth it |
|---|---|---|---|---|
| 1 ⭐ | **Gain surface** | x = f_y, y = f_u, z = f_csm,t / f_y (one surface per family) | How much tension strength CSM adds for any steel | The surface has a visible **crease (fold line)** where the governing term in B.14 switches from 15 to C₁ε_u/ε_y. That's the best 3D picture in this scope. |
| 2 | **Hardening surface** | x = f_y, y = f_u, z = E_sh | How the hardening slope depends on strength and its ratio | The surface shoots up and breaks where C₂ε_u ≤ ε_y. Cut that region out and colour it red as "model not valid". |
| 3 | **3D tension member** | An extruded I-section or RHS with load arrows | The real member being checked, coloured by utilisation, with elongation exaggerated | It's mostly cosmetic, since stress in pure tension is uniform (one colour). But it helps beginners connect the numbers to a real member. |

You can draw the crease line in visual 1 exactly. It's where C₁·C₃·(1 − f_y/f_u)·E / f_y = 15. For austenitic, that's f_y ≈ 1333 × (1 − f_y/f_u).

As a sanity check: duplex 450/650 falls on the "C₁ε_u/ε_y governs" side of the line, which matches your earlier test case. Drawing this line on the surface also proves your code and the theory agree.

## The truly 3D one (later)

**N–M_y–M_z interaction surface (B.6.4).** Once you do combined bending and axial force, the check in B.23 is a real 3D surface. The design point is a dot: inside the surface means safe, outside means fail. This is the classic 3D plot in steel design.

## Two pieces of advice

- **Always pair a 3D surface with a 2D contour or heatmap of the same data.** 3D looks impressive but is hard to read exact values from, especially in a printed report. The contour is what the reader actually uses, and the crease shows up there as a clear line too.
- **Avoid 3D for things that are naturally 2D**, like stress–strain curves stacked as 3D ribbons. They look fancy but are harder to read than the 2D overlay.

## Tools

- **matplotlib (mplot3d)** is simple and static, and good enough for reports. It's already in your stack.
- **plotly** gives rotate and zoom in a Jupyter notebook, which is great for showing your prof live.
- **pyvista** is better for visual 3 (actual member geometry). It's only worth adding if you build the desktop app.

