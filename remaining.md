# What is left (as of 2026-11-10)

A short list of everything still open, so the next chat can start here. The full specs stay in
`plan.md`; this file only says what is left, in what order, and which model each piece needs.

The standing rule of `plan.md` still applies to all of it: any value not in EN 1993-1-4:2025 is a typed
input or a cited source, nothing is pre-filled, and the browser never re-derives a formula.

## State of the repo

- Built: B.4 material, B.5 deformation capacity, B.6.1 tension, B.6.2 compression, B.6.3.2 bending about
  an axis of symmetry, section templates, section properties, the "?" help, source badges, linked charts,
  the shared 3D viewer.
- `main` is 6 commits ahead of origin, not pushed.
- Uncommitted: the dynamic table (`components/DataTable.tsx`, `lib/dataTable.ts`, their tests) and the
  edits that go with it. `uv.lock` is untracked and should be deleted, not committed.
- Known failing web tests: 17 in `App.test.tsx`, 3 in `lib/material.test.ts` (deferred to phase 8).
- UI work targets laptop width only for now. Phone layout is not a priority.

## Which model for what

Fable is needed for few things. Use the cheapest model that fits, one chat per task (plan section 4a).

| Model | Use it for |
|---|---|
| Haiku | Mechanical work: JSON tables, symbols, README rows, generated types, contract tests that copy an existing one, simple 2D charts, Help drafts, the phase 8 test repairs once the cause is known |
| Sonnet | Engine logic with hand-calculated tests, API routes and mappers, new pages, ordinary charts and 3D surfaces |
| Opus | Phase specs, the judgement calls of plan sections 8 and 9, engine review before merge |
| Fable | Only the visual and UX redesign: the Section Stage port, new 3D views, any picture that has to explain the method at a glance |

## 1. Section Stage redesign (decision needed first)

Prototype: https://claude.ai/artifact/MHbF6NWUHNVgLbuMEuHzVZ (a standalone page; nothing from it is in
the repo yet). It was built because the current result pages are cluttered: the section is never shown
beside the results, seven tabs hide one chain of numbers, each tab repeats three note boxes, Bending
prints all of Table B.2, numbers carry five significant figures, and Explore's 3D is five small thumbnails.

What the prototype proposes:

- One screen with a Tension / Compression / Bending switch, one headline resistance and a bar against
  the yield or `M_el` / `M_pl` values.
- The stage: the section to scale with its dimensions and the governing plate lit, strain and stress
  diagrams aligned to its depth, a strain slider with a "Load it" button, and a 3D cut where the block
  depth is the stress at each fibre.
- Three linked cards in place of the clause tabs (strain limit, stress, resistance), each with one chart
  and the engine's working with source badges. The base curve uses a log axis.
- A thickness what-if slider for compression, from the engine's sweep.

Approved 2026-11-11: port everything in the prototype into the app, with Sonnet (the design is done, so
Fable is not needed). The prototype's source is saved at `docs/prototypes/section-stage.html`.

Decisions taken for the port:

- Inputs stay in the dock, unchanged. The stage is a new first tab, "Stage", beside the existing clause
  tabs. The old tabs stay until the stage is proven, then they can be retired.
- The engine returns the slider frames (strain, stress block, resistance at each step) inside the tension,
  compression and bending responses. The browser shows a frame; it never reads between points.
- The 3D cut shows the member deforming by its strain, magnified and labelled with the factor, with no
  displacement value. This changes the plan's earlier "no shortening is drawn" line (user request).
- The section drawing and the 3D body come from the app's own outline code, so all six shapes work, not
  only the I-section of the prototype.

| Task | Model | Status |
|---|---|---|
| Stage frames from the engine, API, types, tests | Sonnet | built 2026-11-11 (see plan.md, Section Stage hand-off) |
| Stage tab: case switch, headline and bar, 2D drawing, slider, readout | Sonnet | built 2026-11-11 (see plan.md, Section Stage hand-off) |
| 3D cut with press and pull arrows and the deformed member | Sonnet | built 2026-11-11 (see plan.md, Section Stage hand-off) |
| Three linked cards (strain limit, stress, resistance) | Sonnet | built 2026-11-11 (see plan.md, Section Stage hand-off) |
| Thickness what-if for compression | Sonnet | built 2026-11-11 (see plan.md, Section Stage hand-off) |
| Retire the clause tabs once the stage is accepted | Sonnet | not started |
| Look at the stage in a real GPU browser; live marker on the card charts; tidy the engine figures' annotations at card size | Sonnet | open |

## 2. Clauses not built

| Phase | Clause | What it adds | Model |
|---|---|---|---|
| 2b | B.5.2(2) | Finite strip buckling with pyCUFSM: signature curve, mode shapes, G/D/L/O shares, numerical `σ_cr,cs` as a "Slenderness from" route. Starts with the spike of plan 4g | Opus for the spike review, Sonnet for the rest |
| 3 | B.6.3.1(2) | B.18 interpolation for 0.2 < `λ_LT` ≤ 0.4, `M_c,Rd` as a new input | Sonnet |
| 3 | B.6.3.3 | Channel minor axis, T-section major axis, angles: neutral-axis inputs, the midway rule, the equilibrium route from Gere ch. 10 | Opus spec, Sonnet build |
| 4 | B.6.4.1 | Combined loading for RHS (B.21 to B.24), design actions as inputs | Sonnet |
| 5 | B.6.4.2, B.6.4.3 | Combined loading for I-sections (B.25 to B.27) and CHS (B.28, B.29) | Sonnet |
| 6 | B.1 to B.3 | Applicability gate and the Summary page with the flow diagram | Opus for the gate, Sonnet for the page |
| 7 | polish | Generic input sweep, printable report, remaining 3D surfaces | Sonnet |
| 8 | tests | Repair the 20 out-of-date front-end tests and `make_fixtures.py` | Haiku |

Each phase ends as plan section 10 says: engine and tests, route and schema, regenerated types, page,
symbols, Help text, charts, README row.

## 3. Website pieces not built

| Piece | Model |
|---|---|
| Combined and Summary tabs (arrive with phases 4 to 6) | Sonnet |
| Design actions group in the dock; `M_c,Rd` and the neutral-axis inputs in Bending | Sonnet |
| Explore: clause and chart picker, a bending view | Sonnet |
| Use buttons for the neutral-axis values (phase 3) | Haiku |
| A source badge on each chart and 3D view itself | Haiku |
| A visible "Paste from Excel" button or file import for the plate table (today only Ctrl+V into a cell works) | Sonnet |

## 4. Charts of plan section 5 not built

All 2D charts here are Haiku work once the engine returns the data; surfaces and 3D members are Sonnet.

- Material (B.4): family comparison, `E_sh` against `f_y/f_u` with the invalid region, hardening surface,
  ductility-cap map.
- Deformation (B.5): `σ_cr,p` against `b̄/t`, `λ_p` bar chart per plate, cap-source diagram, plates against
  CHS, heatmaps, plate-buckling animation (illustrative).
- Tension (B.6.1): gain surface, gain against `f_y`, bar chart for every Table 5.1 grade, 3D tension member.
- Compression (B.6.2): slider dot, sensitivity (tornado) chart, gain surface, 3D stub column, stocky
  against slender with real resistances.
- Bending (B.6.3): to-scale section with stress blocks (the Section Stage covers this), effect of `α`,
  shape-factor surface, `M/M_pl` against `λ`, B.18 line, neutral-axis shift diagram, 3D beam.
- Combined (B.6.4): interaction curves, `α_csm` curve, I-section minor-axis kink, CHS B.28 against B.29,
  N-My-Mz surface, B.24 plane, criterion bars.
- Whole section: flow diagram with the path lit, summary dashboard.

If the Section Stage replaces the tabs, look at this list again first: several of these charts were
planned for pages that would no longer exist.

## 5. Decisions waiting on you (plan section 9)

- May B.6.4 show "satisfied / not satisfied"? It would be the one exception to "no pass/fail".
- Should Ω be offered as "15 (7.4.3.5(3) NOTE), or your National Annex value" instead of an empty field?
- `n_csm` ≥ 1: show "not satisfied" with the reason, never a negative capacity. Confirm before phase 4.
- Finite strip: which minimum counts as `σ_cr,cs`, the section model, the reference stress. Settle after
  the spike.

## 6. Source-rule follow-ups (plan section 4h)

| Task | Model |
|---|---|
| Review the steps flagged as unsure: channel web and T-flange flat widths, `σ` at `C₁ε_u`, the `M_el` / `M_pl` citation, the elastic-perfectly-plastic `ε_y` | Opus |
| The 9.2 serviceability deflection (Formulae 9.1, 9.2, Table 9.1), only if displacements are wanted | Sonnet |

## 7. Bug found on 2026-11-10

Two working lines print a wrong substitution (the values are right). Haiku can fix both.

- `σ_cr,p [web]` prints `= 896.91 = 896.91 N/mm²`: the substituted part repeats the result instead of
  showing the numbers.
- `(ε_csm/ε_y) base curve` prints `= 0.25 / λ^3.6 = λ = 0.483877 = 3.4111`.

The steps are built at `csm/slenderness.py:141` and `csm/deformation_capacity.py:241`; look at the
substituted text each one passes. The LaTeX of the neighbouring `λ_p` step is right, so the fault is
only in the plain line.

## 8. Ideas discussed, not in the plan

Not approved scope. Ask before building any of them.

- Import of your own tensile-test data (Excel, CSV or paste) to compare against the B.4 model. Reuses
  the dynamic table.
- Stress and strain per vertical slice of the section, with check points (edges, junction, neutral axis).
- A node and element (CUFSM-style) section table.
- Biaxial bending: not now, but the design must leave room for it (phases 4 and 5 already carry N-My-Mz).

## Suggested order

1. Commit the dynamic table, delete `uv.lock`, push `main`.
2. Fix the two working lines (section 7).
3. Decide on the Section Stage (section 1). It changes where every later chart goes.
4. Phase 3, then phases 4 and 5, then 6.
5. Phase 2b whenever the finite strip is wanted; it does not block the others.
6. Phases 7 and 8 last.
