**STANDING RULE, DO NOT FORGET: every value that is not in the PDF (EN 1993-1-4:2025) must be an input field that the user fills in. For now, nothing is taken automatically from an external source: no value from another clause or another standard, no library or lookup, no assumed or pre-filled default, no suggested constant, and no quantity computed with a rule that is not in the PDF (for example section properties such as A, W_el and W_pl, neutral-axis positions, or k_σ). Such inputs start empty, the calculation waits until they are given, and the working labels them "input", never a clause. Nothing is pre-filled; a complete worked example is loaded only when the user clicks Load example, and every example value shows its source.**

# Plan: complete Annex B, with every visualisation

Source: EN 1993-1-4:2025, Annex B (normative), printed pages 59 to 66, which are PDF pages 63 to 70 of
`EN-1993-1-4-2025.pdf`. Every formula below was read from the rendered pages, not only from the text
extraction, because the extraction garbles exponents and brackets (B.20, B.23, B.25 to B.28).
Re-extract with `pdftotext -f 63 -l 70 -layout EN-1993-1-4-2025.pdf out.txt`.

Rules that stay in force (from the README and the project notes):

- N, mm, N/mm² inside the engine; kN only at the screen edge.
- Anything Annex B uses but does not define is a visible, empty input. The engine has no defaults.
- Every derived value is a `CalcStep` (clause, formula, numbers, result, LaTeX).
- The engine never imports a UI. The website talks to the API only. No emoji anywhere.
- Website first; the PySide6 app stays paused.

## 1. Coverage: every clause of Annex B

| Clause | Formulas | What it gives | Status |
|---|---|---|---|
| B.1, B.2 | none | Scope: I-sections, channels, T-sections, angles, RHS, CHS that meet the B.5 slenderness limits and the member limits of 8.3.2.1(3) and 8.3.3.1(3) | partly: slenderness limits enforced, member limits not checked (outside Annex B) |
| B.3 | B.1, B.2, B.3 | CSM resistances replace N_t,Rd, N_c,Rd, M_c,Rd of 8.2; f_ya and f_ua may replace f_y and f_u | f_ya and f_ua typed in; the replacement is only stated, not wired into a summary |
| B.4 | B.4, B.5, Table B.1, Figure B.1 | Bilinear material model | done |
| B.5.1 | B.6, B.7 | Base curve ε_csm/ε_y for plates and CHS, with the Ω cap | done |
| B.5.2 | B.8 to B.11 | λ_p,cs, λ_c,cs, σ_cr,p, σ_cr,c | done (conservative most-slender-plate route, or a typed σ_cr,cs) |
| B.6.1 | B.12 to B.14 | Tension resistance | done |
| B.6.2 | B.15 to B.17 | Compression resistance | done (phase 1, 2026-10-09); the extra charts of section 5 remain |
| B.6.3.1 | B.18 | Interpolation for 0.2 < λ_LT <= 0.4 | to do (phase 3) |
| B.6.3.2 | B.19, B.20, Table B.2 | Bending about an axis of symmetry, and the parameter α | to do (phase 2) |
| B.6.3.3 | none printed (procedure in words) | Bending about an axis that is not one of symmetry: ε_csm,max, ε_csm,t, design neutral axis | to do (phase 3) |
| B.6.4.1 | B.21 to B.24 | Combined loading, rectangular hollow sections | to do (phase 4) |
| B.6.4.2 | B.25 to B.27, plus B.23 and B.24 with I-section values | Combined loading, I-sections | to do (phase 5) |
| B.6.4.3 | B.28, B.29 | Combined loading, circular hollow sections | to do (phase 5) |

## 2. Formula sheet (verified against the page images)

```
B.4   E_sh = (f_u - f_y) / (C2 ε_u - ε_y)            ε_y = f_y / E
B.5   ε_u  = C3 (1 - f_y / f_u)                       Table B.1: austenitic, duplex C1 0.10 C2 0.16 C3 1.00
                                                               ferritic          C1 0.40 C2 0.45 C3 0.60
B.6   plates, λ_p,cs <= 0.68 : ε_csm/ε_y = 0.25 / λ^3.6   but not above min(Ω, C1 ε_u / ε_y)
      plates, 0.68 < λ <= 1.60: ε_csm/ε_y = (1 - 0.222 / λ^1.05) / λ^1.05
B.7   CHS,    λ_c,cs <= 0.30 : ε_csm/ε_y = 4.44e-3 / λ^4.5   but not above min(Ω, C1 ε_u / ε_y)
      CHS,    0.30 < λ <= 0.60: ε_csm/ε_y = (1 - 0.224 / λ^0.342) / λ^0.342
B.8   λ_p,cs = sqrt(f_y / σ_cr,cs)       B.10  λ_c,cs = sqrt(f_y / σ_cr,c)
B.9   σ_cr,p = k_σ π² E t² / (12 (1 - ν²) b̄²)          B.11  σ_cr,c = E / sqrt(3 (1 - ν²)) * 2t / d
B.12  N_csm,t,Rd = A f_csm,t / γ_M0
B.13  f_csm,t = f_y + E_sh ε_y (ε_csm,t / ε_y - 1)
B.14  ε_csm,t / ε_y = min(15 ; C1 ε_u / ε_y)
B.15  N_csm,Rd = (ε_csm / ε_y) A f_y / γ_M0           for ε_csm / ε_y <  1.0
B.16  N_csm,Rd = A f_csm / γ_M0                       for ε_csm / ε_y >= 1.0
B.17  f_csm = f_y + E_sh ε_y (ε_csm / ε_y - 1)
B.18  M_csm,int,Rd = M_c,Rd + (M_csm,c,Rd - M_c,Rd) (0.4 - λ_LT) / 0.2        for 0.2 < λ_LT <= 0.4
B.19  M_csm,c,Rd = (ε_csm / ε_y) W_el f_y / γ_M0       for ε_csm / ε_y <  1.0
B.20  M_csm,c,Rd = (W_pl f_y / γ_M0) [ 1 + (E_sh / E)(W_el / W_pl)(ε_csm/ε_y - 1)
                                         - (1 - W_el / W_pl) / (ε_csm/ε_y)^α ]  for ε_csm / ε_y >= 1.0
B.21  M_y,Ed <= M_N,csm,y,Rd = M_csm,y,Rd (1 - n_csm) / (1 - 0.5 a_w)   but not above M_csm,y,Rd
B.22  M_z,Ed <= M_N,csm,z,Rd = M_csm,z,Rd (1 - n_csm) / (1 - 0.5 a_f)   but not above M_csm,z,Rd
      a_w = (A - 2 b t) / A  (<= 0.5)     a_f = (A - 2 h t) / A  (<= 0.5)     n_csm = N_Ed / N_csm,Rd
B.23  [M_y,Ed / M_N,csm,y,Rd]^α_csm,y + [M_z,Ed / M_N,csm,z,Rd]^α_csm,z <= 1
      RHS: α_csm,y = α_csm,z = 1.66 / (1 - 1.13 n_csm²)  for n_csm <= 0.8;  = 6  for n_csm > 0.8
      I-section: α_csm,y = 2 and α_csm,z = 5 n_csm but not below 1
B.24  N_Ed / N_csm,c,Rd + M_y,Ed / M_csm,y,Rd + M_z,Ed / M_csm,z,Rd <= 1     (RHS and I-section, λ_p,cs > 0.60)
B.25  M_y,Ed <= M_N,csm,y,Rd = M_csm,y,Rd (1 - n_csm) / (1 - 0.5 a)   but below M_csm,y,Rd     a = (A - 2 b t_f) / A (<= 0.5)
B.26  n_csm <= a : M_N,csm,z,Rd = M_csm,z,Rd
B.27  n_csm >  a : M_N,csm,z,Rd = M_csm,z,Rd [1 - ((n_csm - a) / (1 - a))²]
B.28  CHS, λ_c,cs <= 0.27 : M_Ed <= M_N,csm,Rd = M_csm,c,Rd (1 - n_csm^1.7)
B.29  CHS, λ_c,cs >  0.27 : N_Ed / N_csm,c,Rd + M_Ed / M_csm,c,Rd <= 1
```

Limits of the combined-loading clauses: RHS and I-sections use B.21 to B.23 or B.25 to B.27 only when
λ_p,cs <= 0.60, otherwise B.24. CHS uses B.28 when λ_c,cs <= 0.27, otherwise B.29.

Table B.2, the bending parameter α:

| Cross-section | Axis | Aspect ratio | α |
|---|---|---|---|
| Rectangular hollow section | any | any | 2.0 |
| Circular hollow section | any | none | 2.0 |
| I-section | major | any | 2.0 |
| I-section | minor | any | 1.2 |
| Channel | major | any | 2.0 |
| Channel | minor | h/b < 2 | 1.5 |
| Channel | minor | h/b >= 2 | 1.0 |
| T-section | major | h/b < 1 | 1.0 |
| T-section | major | h/b >= 1 | 1.5 |
| T-section | minor | any | 1.2 |
| Equal angle | any | none | 1.0 |
| Unequal angle | major | any | 1.5 |
| Unequal angle | minor | any | 1.0 |

Table B.2 lies inside Annex B, so it is a lookup like Table B.1 (JSON in `data/`), not an assumption.
The user picks the section type and axis; the aspect ratio comes from their h and b.

## 3. New inputs from outside Annex B (visible, empty, never defaulted)

| Input | Used in | Where it comes from |
|---|---|---|
| A (area) | B.12, B.15 to B.17, a, a_w, a_f | already an input for tension |
| W_el, W_pl | B.19, B.20 | section properties, typed by the user (no section presets). For B.6.3.3 (phase 3), B.6.3.3(1) takes W_el relative to the fibre that yields first. The user types that value. From the wording it is the smaller of the two elastic moduli about the axis (to confirm) |
| Section type, axis of bending | Table B.2 (inside Annex B) | user's choice |
| h, b, t, t_w, t_f, r, s, d (phase 1b templates) | 3D and SVG drawing, c of the B.5 plates (8.2.2(5)), later Table B.2 and a, a_w, a_f | typed in the Section group, beside the live sketch. r is the root radius of a rolled section, s the weld leg of a welded one. |
| h, b, t, t_f (overall height, width, wall or flange thickness) | a_w, a_f, a, Table B.2 aspect ratio | the usual EN 1993-1-1 section symbols; the Annex does not define them, so a labelled sketch goes next to the fields |
| λ_LT | B.6.3.1 gate, B.18 | Typed input for every bending check. It selects the route: λ_LT ≤ 0.2 gives B.19 or B.20; 0.2 < λ_LT ≤ 0.4 gives B.18; above 0.4 CSM does not apply (section 8, item 6). From member design, outside Annex B |
| M_c,Rd | B.18 | Needed only for 0.2 < λ_LT ≤ 0.4, from 8.2.4: outside Annex B |
| N_Ed, M_Ed, M_y,Ed, M_z,Ed | B.21 to B.29 | design actions, typed by the user |
| Elastic and plastic neutral axis positions, distances to the extreme fibres, first-yield fibre | B.6.3.3 | section properties, typed by the user |
| γ_M0, Ω, ν, k_σ, E | as today | already inputs |

## 4. Build order

Each phase ends the same way: engine and tests, API route and schema, regenerated types, website
page with the working, symbol glossary entries, Help text, the phase's visualisations, and the
README row marked done. A contract test (service against API) covers every new endpoint.

| Phase | Clause | Engine work | New website content |
|---|---|---|---|
| 0 | website layout (no new clause), DONE 2026-10-09 | none; the API stays as it is | the input dock and result tabs of section 4b; move the inputs out of the Material, Tension and Deformation tabs into the dock; one section-type picker; status icon on each tab; "Waiting for" links |
| 1 | B.6.2 compression, DONE 2026-10-09 | `csm/compression.py`: B.15 to B.17, takes the `DeformationResult` of B.5.1 and refuses when the section is outside the slenderness limit | step "Compression (B.6.2)"; live capacity curve; compression point on the material curve |
| 1b | section templates (8.2.2(5), Tables 7.2 to 7.4), DONE 2026-10-09 | `sections/templates.py`: the six shapes from typed dimensions, the B.5 plates with c derived per 8.2.2(5); a `template` geometry kind for B.5, B.6.2 and the comparison | live SVG sketch in the dock's Section group; generated plates with a k_σ field each; the assembled section in the Explore 3D. Spec in section 4c |

**Hand-off, 2026-10-09 (stopped for the weekly limit):**
- Phases 0 and 1 are built, reviewed and green (388 Python tests passed before 1b started; web: 86 passing plus the 20 deferred failures). Not yet looked at in a browser, not committed.
- Phase 1b was stopped part-way by its agent: `src/stainless_csm/sections/templates.py` exists and the template kind is partly wired into `services.py` and `api/schemas.py`; no tests, no web work (no SectionSketch, no sectionTemplates.ts). Python is green again (388 passed, 2026-10-09: the two failures were a stale kinds list in test_api.py and a symbol line one character too long). Next session: review the partial 1b engine work against section 4c, then finish 1b (engine tests, API, all web work).
- Added after 1b, before phase 2 (user request 2026-10-09):
  - "Load example" button in the dock: fills every field with one worked example only when clicked; banner "Example values: replace them with your own"; each value shows its source (E, ν: 5.1.5; γM0 1.10: 8.1 NOTE; grade 1.4301: Table 5.1; Ω 15 and k_σ 4.0 / 0.43: example only, outside the PDF; rolled I 200 x 100 x 5.6 x 8.5, r 12, A 2848 mm²). Reword the standing rule to "nothing is pre-filled; an example is loaded only on request" once the user confirms the wording.
  - Done 2026-10-09: the Load example button is built (`apps/web/src/lib/example.ts`, banner with Clear all and the source list in the dock, `App.example.test.tsx`), and the standing rule above carries the new sentence.
  - A "?" button on every input: what it is, why (the clauses that use it), where to get it, and whether it is in the PDF. Text in `data/symbols.json` (one source for Help, symbols panels and the "?"), opens on click, no suggested values.
- Phase 1d done 2026-10-09: `data/input_help.json` (28 entries; the dock key `rO` is the outer corner radius; plate width, thickness and k_σ are `plateWidth`, `plateThickness`, `kSigma`, matched by suffix in `helpKeyOf`), `input_help.py`, `GET /api/v1/input-help`, `components/FieldHelp.tsx` (provider, "?" button, panel; Esc closes the panel before a drawer or the geometry window), tests `tests/test_input_help.py` and `App.help.test.tsx`. The "Used in" line is gone from under the fields (it is the Why part of the panel); `usedIn` was removed from `DimField`. Not yet seen in a browser.
- Commit phases 0, 1 and 1b only after the user's browser check.

| 1c | section properties and the geometry modal, DONE 2026-10-09 | `sections/properties.py`: A, centroid, I, W_el, W_pl, plastic neutral axis, principal axes, shear centre from the template dimensions; `POST /api/v1/section-properties` | the Section geometry modal with layer checkboxes, editable dimensions and a properties table with Use buttons. Spec in section 4d |
| 1d | "?" help on every input, DONE 2026-10-09 | `data/input_help.json` keyed by field key, served at `GET /api/v1/input-help`; a test that every dock field has an entry | a "?" button beside every input label opening a short panel. Spec in section 4e |
| 2 | B.6.3.2 bending, Table B.2 | `data/bending_parameters.json`, a lookup by type, axis and h/b; `csm/bending.py`: B.19, B.20, with the λ_LT gate of B.6.3.1(1). Refuses channel minor axis, T-section major axis and all angles (B.6.3.3, phase 3) | step "Bending (B.6.3)"; section type and axis picker; moment against ε_csm/ε_y; stress block with real moments |
| 3 | B.6.3.1 and B.6.3.3 | B.6.3.3(1) for channel minor axis, T-section major axis and angles (B.19 or B.20 with ε_csm,max, the first-yield fibre); B.18 (needs λ_LT and M_c,Rd as inputs); ε_csm,max and ε_csm,t from the linear strain assumption. ε_csm,t first uses the elastic neutral axis; if ε_csm,max > ε_y, it is recalculated at the midway point between the elastic and plastic axes (the approximation printed in B.6.3.3(3)), with both axis positions typed in. Equilibrium is out for now (section 9) | interpolation chart; neutral-axis shift diagram for angles, channels, T-sections |
| 4 | B.6.4.1 RHS | `csm/combined.py`: B.21 to B.24 for RHS. Refuses bending with tension, and channels, T-sections and angles (outside B.6.4, B.3(2)). I-sections and CHS show "not built yet (phase 5)", which is not a refusal | interaction curve; biaxial surface |
| 5 | B.6.4.2 and B.6.4.3 | B.25 to B.27, I-section values for B.23, B.28 and B.29. Refuses channels, T-sections and angles, which fall under EN 1993-1-1 8.2.9 (outside the Annex) | I-section and CHS interaction curves |
| 6 | B.1 to B.3 wrapper | an applicability gate (section type, slenderness limits, a reminder of the member limits), and a summary that places N_csm,t,Rd, N_csm,Rd, M_csm,c,Rd where 8.2 uses N_t,Rd, N_c,Rd, M_c,Rd | "Summary" page: all resistances in one place, with the flow diagram |
| 7 | polish | generic input sweep, report export, remaining 3D surfaces | see section 5 |
| 8 | tests | bring the out-of-date front-end tests up to date and fix `make_fixtures.py` (deferred on purpose until the site is feature-complete) | |

Reasoning for the order: phase 0 comes first because compression is the first page that needs inputs another tab already owns (A and γ_M0 from tension); building the dock later means moving every new page over afterwards. Compression gives f_csm and N_csm,Rd, which the bending interaction needs
(n_csm = N_Ed / N_csm,Rd). Bending gives M_csm,Rd, which every combined-loading formula needs.

## 4b. Website layout (phase 0)

One input dock on the left holding every input; results on the right, one tab per clause. Every input
lives in one place, so no two tabs can hold different values of A or γ_M0, and the inputs stay
visible while any result is read.

```
+------------------------------+------------------------------------------------+
| INPUTS                       | Material | Deformation | Tension | Compression |
|                              | Bending | Combined | Summary | Explore | Help  |
| v Material          [check]  |------------------------------------------------|
|   Grade, family, E           |  Compression (B.6.2)                           |
|   f_y, f_u                   |                                                |
| v Section          [!] 1     |  +----------------+                            |
|   Type  [RHS        v]       |  | N_csm,Rd       |  result card               |
|   Axis  [major      v]       |  +----------------+                            |
|   h, b, t     [sketch]       |                                                |
|   A, W_el, W_pl              |  Working:  B.17 ... B.16 ...                   |
|   γ_M0  [ empty ]  <-- !     |                                                |
| > Deformation (B.5)          |  [ main chart ]                                |
| > Bending                    |                                                |
| > Design actions             |  More charts in Explore ->                     |
+------------------------------+------------------------------------------------+
```

Input dock:
- Groups: Material, Section, Deformation (B.5), Bending, Design actions. Collapsible, one open at a time.
- Shows only what applies: the section type hides fields it does not use (CHS hides h, b, t_f);
  λ_LT appears when bending is used, M_c,Rd only for 0.2 < λ_LT <= 0.4, the neutral-axis inputs only
  for the B.6.3.3 cases, the design actions only for combined loading.
- Each group header counts its empty required fields. Fields start empty (standing rule).
- Each field can say where it is used, for example "used in B.12, B.15, B.19".
- One section-type picker; it also sets the deformation route (CHS or plates).

Result tabs:
- Material, Deformation, Tension, Compression, Bending, Combined, Summary, Explore, Help.
- Each tab label carries a status icon (lucide, never emoji): done, waiting for inputs, not applicable.
- Every clause tab has the same order: result card, working (CalcSteps), one or two must-have charts,
  then a link to Explore for the rest.
- Waiting: "Waiting for: γ_M0, W_pl", each a link that opens that field in the dock.
- Not applicable: the reason and the clause, for example "λ_LT > 0.4: B.6.3.1 does not apply".
- Combined shows each criterion as a bar against 1, labelled "Annex B criterion", never "safe".
- Explore replaces Visualise: pick a clause, then a chart; 3D surfaces toggle to their 2D contour.
  The live stocky-against-slender comparison moves here.
- Summary: one card per resistance with its clause, and the flow diagram with the path taken lit.
  A card opens its tab.

Phone width: the dock becomes an "Inputs" button that slides out a drawer; the tabs scroll sideways.

**Phase 0 hand-off (done).** The input dock (`components/Dock.tsx`, fields in `components/InputFields.tsx`) now
holds every input; Material, Deformation, Tension and Explore (the renamed Visualise) are results only.
The section type lives in `App.tsx` and drives the B.5 route through `withSectionType` in `lib/geometry.ts`;
`DeformationFormState.kind` is `null` until it is chosen (no hidden default). Missing inputs are structured
(`MissingItem` in `lib/inputs.ts`), which feeds the group counts, the "Waiting for" links and the tab status
icons. Tension's form moved to `lib/tension.ts` (the section type left it). Not done on purpose: the Bending
and Design actions groups, and the section sketch, arrive with their phases; Explore is still the single
live comparison (no clause or chart picker yet); Summary and the other new tabs wait for their phases.
Tests: `lib/inputs.test.ts` and `App.dock.test.tsx` are new and pass. `App.test.tsx` is still the
out-of-date file (phase 8), now also written for the old per-tab inputs, so rewrite it for the dock then.
Not checked in a browser (none available in that session): look at the layout at desktop and phone width.

**Phase 1 hand-off (B.6.2 compression, done 2026-10-09).** Engine: `csm/compression.py` (B.15, B.16, B.17)
takes the `CSMBilinearModel`, the B.5 `DeformationResult`, A and γ_M0, and refuses with the B.5 message
(`NotApplicableError`) beyond λ_p,cs 1.60 or λ_c,cs 0.60. There is no holes clause in B.6.2, so none is checked.
`services.run_compression` runs B.5 and then B.6.2; its trace is B.4, the B.5.2 and B.5.1 steps, then the three
B.6.2 steps (branch test `ε_csm/ε_y vs 1`, `f_csm` only with B.16, `N_csm,Rd`). API: `POST /api/v1/compression`
(request = the deformation fields + `area`, `gamma_m0`, `graph_view`; response = B.5 slenderness and strain limit,
`strain_ratio`, `formula`, `design_stress` (null for B.15), `resistance` in N, notes, trace, `capacity_figure`,
`point_figure`). Charts built by the engine in `viz/plotly_figures.py`: the capacity curve
N_csm,Rd / (A f_y / γ_M0) against λ (`compression_capacity_figure`, with one ring where ε_csm/ε_y = 1, found by
bisection on the engine's own base curve, so it lands near but not exactly on 0.68 or 0.30), and the compression
point on the B.4 curve (`compression_point_figure`, schematic or true scale; no shaded band when the ratio is below
1.0, since B.17 is not used there). Website: tab "Compression (B.6.2)" after Tension, no new inputs (A and γ_M0
are the dock's, their "used in" now reads B.12, B.15, B.16), `lib/compression.ts`, `pages/CompressionPage.tsx`,
a Help module "4 · Compression (B.6.2)" with a sketch, new symbols (`N_csm,Rd`, `f_csm`, `ε_csm/ε_y vs 1`; the
group of A and γ_M0 renamed "Area and partial factor (B.6)"), README symbols table regenerated. The compression
query runs in parallel with B.5; beyond the B.5 limit the tab is "not applicable" from the B.5 result and the
engine's 422 is hidden. Tests: `tests/test_compression.py`, compression tests in `tests/test_api.py` (including the
contract tests), `CompressionPage.test.tsx` and `App.compression.test.tsx` with fixtures recorded from the API
(`compression.json`, `compression_b15.json`, `compression_beyond_error.json`). Not checked in a browser (none
available): look at the label placement of the two charts.

**Phase 1b hand-off (section templates, done 2026-10-09).** Engine: `sections/templates.py` has one frozen
dataclass per shape (`ISection`, `Channel`, `TSection`, `Angle`, `RHS`, `CHS`) with the typed dimensions and
fabrication (`Fabrication.ROLLED` with r, `WELDED` with s), validation (`InvalidSectionError` for 2t_f >= h, t_w >= b,
any c <= 0, 2t >= min(h, b), t >= d/2, an angle with b > h, c_stem >= h) and `plates()`, which returns
`TemplatePlate`s (role, internal or outstand, c, thickness, source text, CalcStep). The c steps have clause
"8.2.2(5)" (the T-section stem: clause "input"), symbols `c_w`, `c_f`, `c_stem`, `b̄ [leg]`, all in `symbols.json`
(README table regenerated). `services.GeometryKind.TEMPLATE` and the new `GeometryForm` fields (shape, fabrication,
h, b, tw, tf, r, s, c_stem, k_sigma by `PlateRole`) feed the existing B.8/B.9 route (a CHS template feeds B.10/B.11);
the c steps come first in the B.5 trace and `DeformationOutcome.template_plates` carries the plates. The comparison
sweep scales t_w, t_f and t (h, b, r, s, d, c_stem stay) and bisects the largest factor at which the template still
exists; `ComparisonPoint.governing_label` is new. API: `GeometryInput` has `kind "template"`, `shape`, `fabrication`,
`h`, `b`, `t_w`, `t_f`, `r`, `s`, `c_stem`, `k_sigma {web, flange, stem, leg}`; `PlateOut` gained `role`,
`plate_type`, `c_source`; `ComparisonPointOut` gained `governing_label`. B.5, B.6.2 and the comparison accept it.
Website: `lib/sectionTemplates.ts` (static field and plate lists, drawing-feasibility check, no maths),
`components/SectionSketch.tsx` (the live SVG), `lib/templateScene.ts` (3D layout), the Section group of the dock
(type, fabrication, sketch, dimensions, then A, γM0, holes), the Deformation group routes and one k_σ per plate
role, the Deformation tab plate table (c, type, source), the Explore 3D assembled section with wrinkles on the
governing plate only, and the Load example button now fills the rolled I-section template (h 200, b 100, t_w 5.6,
t_f 8.5, r 12, k_σ 4.0 and 0.43). The sketch gets c only from a B.5 response asked for exactly the dimensions now
typed. Tests: `tests/test_section_templates.py` (the six hand values with working, refusals, B.5 and B.6.2 runs,
sweep), template tests in `tests/test_api.py` (200, 422, contract for B.5, B.6.2 and the comparison),
`SectionSketch.test.tsx`, `sectionTemplates.test.ts`, `App.template.test.tsx`, template tests in `inputs.test.ts`
and `VisualisePage.test.tsx`, fixtures recorded from TestClient (`deformation_template`, `compression_template`,
`comparison_template`, `deformation_template_error`; `comparison` re-recorded for `governing_label`).
Changed for the new Section group: `App.dock.test.tsx`, `App.compression.test.tsx` (uses the manual route),
`App.example.test.tsx`, `inputs.test.ts`, `test_api.py::test_there_are_no_section_presets` (now lists `template`).
Not done on purpose: the sketch draws the y-y and z-z axes only where symmetry fixes them (the centroid is not
computed); angle root radii and RHS corner radii have no input and are drawn sharp; `make_fixtures.py` was not
updated (phase 8). Not checked in a browser (none available): look at the sketch label placement at the dock
width and in the phone drawer, and the 3D assembled section.

**Phase 1c hand-off (section properties and the geometry modal, done 2026-10-09).** Engine:
`sections/properties.py` builds each template's outline as polygon loops (fillets, root and corner radii as
arcs of 128 segments per quarter, welds as triangles of leg s, a circle as 1024 sides; the RHS inner radius is
`max(r_o - t, 0)`), and Green's theorem gives A, the centroid, I_y, I_z, I_yz. W_el per side (the smaller one is
reported and marked), the plastic neutral axis by bisection on the polygon clipped by a half-plane (W_pl is the sum
of the first moments of the two halves), the extreme-fibre distances, the principal axes of an angle (angle of the
major axis u from the y axis, counter-clockwise with z up, and I_u, I_v), and the shear centre (thin-walled
approximation: centroid for I, RHS, CHS; leg centrelines for T and angle; channel by the e formula from the web
centreline). Orientation matches the drawing (I, T, RHS h high and b wide, T flange on top, channel web on the left,
angle with its longer leg h on the left and b at the bottom); origin at the lower left corner of the bounding box,
y right, z up. New inputs: `RHS.r_o` and `Angle.r` (None = not given, 0 = sharp), `GeometryForm.r_o`,
`GeometryInput.r_o` (the angle's root radius reuses `r`); `TSection.c_stem` is now optional (the properties do not
use it; `plates()` still demands it) and every template has `validate()`. The radii never change c (tests pass
unchanged). Services: `run_section_properties(GeometryForm)`. API: `POST /api/v1/section-properties` (flat request:
shape, fabrication, h, b, t_w, t_f, t, d, r, s, r_o; response: structured values for drawing plus `rows`, the table
with key, symbol, name, value to 6 significant figures, unit, group, note), labelled "computed from your dimensions:
geometry, not a rule of EN 1993-1-4". Glossary: 21 new symbols (group "Section properties (from geometry)", plus r_o
in "Section dimensions"), README table regenerated. Website: the sketch left the dock; the Section group has the type,
fabrication, a **Section geometry** button with a thumbnail (`SectionThumbnail`), the dimension fields (shared
`DimensionFields`, plus r_o for an RHS and r for an angle, hint "0 for sharp", never counted as missing for B.5) and
the A field with `AreaNote` ("copied from geometry"; mismatch note above 0.5 %). `components/GeometryModal.tsx`
(role="dialog", aria-modal, focus in and back, Esc closes via a capture listener so a drawer behind it stays,
Tab trap, full screen under 900 px): `SectionSketch` extended with `layers` (`lib/layers.ts`, localStorage in
try/catch) and `properties` (centroid, PNA, shear centre, principal axes, axes through the centroid, legend; only on
the to-scale sketch and only for exactly the dimensions typed), RHS and angle radii drawn, the same dimension fields
as the dock with the phase 1b linking, and `PropertiesTable` (engine rows only, a Use button for A, today the only
`USABLE` entry). The properties query is separate and waits for nothing else (no material, no k_sigma); App holds
`areaFromGeometry`. Tests: `tests/test_section_properties.py` (44: published I-section table within 0.5 %, RHS and
CHS hand values with working, symmetry, T, angle and channel by independent rectangle decomposition, channel shear
centre formula, principal axes, impossible geometry, B.5 unchanged by r_o), API tests in `tests/test_api.py` (200, 422 and contracts)
for the service against the API; web `App.geometry.test.tsx` (24), `SectionSketch.test.tsx` additions, `lib/properties.test.ts`,
fixtures `section_properties*.json` recorded from TestClient; `App.template.test.tsx` and `App.example.test.tsx`
now look for the thumbnail in the dock and the sketch in the dialog.
Judgement calls and what is left:
- r_o and the angle's r are required by the properties only: B.5, B.6.2, the dock group counts and the tab statuses do
  not wait for them (they do not use them). The properties table says "Waiting for: the outer corner radius r_o".
- Use exists for A only; W_el, W_pl and the neutral-axis inputs get a Use button when phases 2 and 3 add the fields
  (add the key to `USABLE` in `PropertiesTable.tsx`). W_el,u, W_pl,u (about the principal axes) are not computed.
- Load example is unchanged (the I-section needs neither radius); there is no RHS or angle example.
- New glossary symbols use the topic "deformation" (the test fixes the topics to the four pages).
- The fillets-and-welds layer off draws sharp corners and drops the r and s labels (a view choice, not a geometry).
- Not checked in a browser (none available): the SVG was rendered with rsvg to check the radii and the overlay
  positions; look at the modal layout at desktop and phone width, the legend and the label placement.
- `make_fixtures.py` not updated (phase 8). The 20 failures in `src/App.test.tsx` and `src/lib/material.test.ts` remain.

## 4c. Phase 1b spec: section templates

Decided 2026-10-09: all six shapes of B.2 get a template; c is derived from the dimensions where
Tables 7.2 to 7.4 or 8.2.2(5) print or draw it (the working says which), and typed where nothing
in the PDF defines it. A, W_el and W_pl stay typed (standing rule). The manual "plates one by one"
route and the typed σ_cr,cs route stay as alternatives.

### Dimensions and plates per shape

All dimensions are typed, start empty, in mm. "Plates" are what B.5 (B.8, B.9) receives; each
plate gets its own typed k_σ (EN 1993-1-5, outside the PDF), labelled internal or outstand so the
user knows which k_σ case to look up.

| Shape | Fabrication | Dimensions | Plates for B.5 and their c | Source |
|---|---|---|---|---|
| I-section | rolled (r) or welded (s) | h, b, t_w, t_f, r or s | web: c_w = h − 2t_f − 2r (welded: − 2s), internal; flange outstand: c_f = (b − t_w − 2r) / 2 (welded: − 2s), outstand | Table 7.2 and 7.3 sketches (c between fillet or weld toes) |
| Channel | rolled (r) or welded (s) | h, b, t_w, t_f, r or s | web: c_w = h − 2t_f − 2r, internal; flange outstand: c_f = b − t_w − r (welded: − s), outstand | flange: Table 7.3 sketch; web: the I-section web sketch, by analogy (section 8, item 11) |
| T-section | rolled (r) or welded (s) | h, b, t_w, t_f, r or s, and c_stem | flange outstand: c_f = (b − t_w − 2r) / 2, outstand; stem: c_stem typed, outstand | flange: the I-section flange sketch, by analogy; stem: drawn nowhere, so typed (section 8, item 11) |
| Angle | none | h, b, t (h the longer leg) | one plate: b̄ = h, outstand | 8.2.2(5) printed: "h for equal-leg and unequal-leg angles" |
| RHS | none | h, b, t | web: c = h − 3t, internal; flange: c = b − 3t, internal | 8.2.2(5) and Table 7.2, printed |
| CHS | none | d, t | none: B.10 and B.11 use d and t | B.5.2(4), (5) |

Each derived c is a CalcStep (clause "8.2.2(5)", the formula, the numbers, LaTeX) and the working
labels the source ("c as drawn in Table 7.2" or "c = h − 3t, 8.2.2(5)"). The engine refuses
geometry that cannot exist (any c <= 0, 2t_f >= h, t_w >= b, t >= b/2 for an RHS, t >= d/2).

Hand-calculated values for the tests:
- Rolled I, h 200, b 100, t_w 5.6, t_f 8.5, r 12: c_w = 200 − 17 − 24 = 159.0; c_f = (100 − 5.6 − 24) / 2 = 35.2
- Welded I, h 300, b 150, t_w 6, t_f 10, s 5: c_w = 300 − 20 − 10 = 270.0; c_f = (150 − 6 − 10) / 2 = 67.0
- Rolled channel, h 200, b 75, t_w 8.5, t_f 11.5, r 11.5: c_w = 200 − 23 − 23 = 154.0; c_f = 75 − 8.5 − 11.5 = 55.0
- Rolled T, h 100, b 100, t_w 6, t_f 8, r 10: c_f = (100 − 6 − 20) / 2 = 37.0; c_stem as typed
- RHS 100 x 50 x 4: c_web = 88.0, c_flange = 38.0
- Angle 100 x 75 x 8: b̄ = 100.0

### Live SVG sketch (dock, Section group)

- Order in the group: section type, fabrication (I, channel, T), the sketch, the dimension fields,
  then A, γM0 and holes.
- The sketch redraws on every keystroke from the typed dimensions only. It never shows a number the
  user did not type, except the engine's c values (see below).
- Before every dimension is given, or while the shape cannot exist, the sketch is a schematic:
  dashed outline in fixed proportions, symbol labels only, captioned "Schematic: not to scale until
  every dimension is given". The proportions are a drawing choice, not values, and never fill a field.
- Once complete and valid, it is drawn to scale (one scale for both directions), solid, with
  dimension lines labelled "h = 200" and so on, the y-y (major) and z-z (minor) axes, fillets of
  radius r or weld triangles of leg s.
- Field and sketch are linked: focusing a field highlights its dimension line; hovering a dimension
  line highlights its field; clicking a dimension line focuses the field.
- The flat widths c are drawn as a tinted band on each plate with its symbol (c_w, c_f). Their
  values come from the engine (the latest B.5 response) and appear when available; the browser
  never computes c.
- Geometry that cannot exist (for example 2t_f >= h) shows a plain message under the sketch naming
  the dimensions involved; the sketch stays schematic. These are drawing-feasibility checks; the
  engine repeats them and is the authority.
- Accessible: the SVG has role="img" and an aria-label listing the shape and the typed dimensions.
  Colours from the CSS tokens, so it works in dark mode. Fits the dock width and the phone drawer.

### Deformation group and the rest of the site

- "Slenderness from": "Section dimensions (8.2.2(5))" for a template shape (the default route once
  a type is picked: a UI mode, not a value), "Flat plates entered one by one", or "A typed σ_cr,cs".
  For CHS: "Diameter and thickness" or "A typed σ_cr,cs". d and t move to the Section group.
- With the template route, the Deformation group lists the shape's plates (static per shape: name,
  internal or outstand, the c formula as text) with one empty k_σ field each; ν and Ω as today.
- Deformation tab: the plate table shows each c with its source, from the engine.
- Compression and Tension: unchanged, they take the same geometry.
- Explore: the comparison accepts the template geometry; the slider multiplies t_w, t_f and t (h, b,
  r, s, d stay); the engine re-derives c at each point. The 3D scene draws the assembled section
  (web and flanges in place, extruded) from the typed dimensions, with the wrinkles on the plate the
  engine reports as governing. Fillets may be omitted in 3D (say so in a caption).

## 4d. Phase 1c spec: section properties and the geometry modal

Decided 2026-10-09 (option 2): section properties are computed from the typed template dimensions
as reference values only. They enter a calculation only when the user clicks Use, which copies the
value into its input field (the same idea as Load example). Label everywhere: "computed from your
dimensions: geometry, not a rule of EN 1993-1-4".

### Engine (`sections/properties.py`, `POST /api/v1/section-properties`)
- Method: build each template's outline as a polygon (fillets and corner radii as arcs of enough
  segments that A is within 0.01 % of the exact value; welds as triangles of leg s) and integrate
  (Green's theorem) for A, centroid, I_y, I_z, I_yz. One routine for all six shapes.
- Outputs: A; centroid (y_c, z_c) from a stated origin; I_y, I_z; for angles also the principal
  axes (angle and I_u, I_v); W_el,y and W_el,z (to the extreme fibre on each side, both reported
  when they differ, the smaller one marked); plastic neutral axis positions and W_pl,y, W_pl,z
  (equal-area axis, by bisection where symmetry does not give it); extreme-fibre distances; shear
  centre (thin-walled approximation, labelled: I, RHS, CHS at the centroid; T and angle at the
  meeting point of the leg centrelines; channel e = 3 b'² t_f / (6 b' t_f + h' t_w) from the web
  centreline, b' = b − t_w/2, h' = h − t_f). No I_t or I_w (Annex B does not use them).
- New typed inputs needed for honest geometry (empty, 0 allowed for sharp): RHS outer corner
  radius r_o (inner radius taken as max(r_o − t, 0), stated); angle root radius r. These affect the
  properties and the drawing only, not c (8.2.2(5) fixes c = h − 3t and b̄ = h).
- Tests against published tables and hand values:
  - Rolled I h 200, b 100, t_w 5.6, t_f 8.5, r 12: A 2848 mm², I_y 1943 × 10⁴ mm⁴, I_z 142.4 × 10⁴,
    W_el,y 194.3 × 10³ mm³, W_pl,y 220.6 × 10³, W_el,z 28.47 × 10³, W_pl,z 44.61 × 10³ (within 0.5 %).
  - RHS 100 × 50 × 4, r_o 0 (sharp): A = 100·50 − 92·42 = 1136; I_y = (50·100³ − 42·92³)/12 =
    1 441 259; W_el,y 28 825; W_pl,y = 50·100²/4 − 42·92²/4 = 36 128; I_z 473 659; W_el,z 18 946;
    W_pl,z 21 928.
  - CHS 100 × 5: A 1492.26; I 1 688 115; W_el 33 762; W_pl = (d³ − (d − 2t)³)/6 = 45 167.
  - Symmetry checks (centroid of I and RHS at mid-height), a T and an angle by an independent
    hand decomposition into rectangles, and the channel shear centre formula.

### Website
- The sketch leaves the dock. The Section group keeps the type, fabrication and dimension fields,
  plus a "Section geometry" button with a small thumbnail of the shape that opens the modal.
- Modal (role="dialog", focus kept inside, Esc closes, full screen at phone width):
  - Left: the large to-scale SVG (the phase 1b sketch, extended).
  - Right, "Show" checkboxes: dimensions, flat widths c, y-y and z-z axes, centroid, plastic
    neutral axis, shear centre, principal axes (angles), fillets and welds. Defaults: dimensions,
    c, axes, fillets on; the rest off. Choices remembered in localStorage (try/catch).
  - Right, the dimension fields: the same state as the dock (not a copy), with the field and
    dimension-line linking of phase 1b.
  - Right, "Properties (from geometry)": each value with unit and source label; a Use button where
    an input field exists (A today; W_el, W_pl and the neutral-axis inputs get theirs when phases
    2 and 3 add the fields). Values only from the engine.
- After Use, the field shows "copied from geometry"; if a typed A differs from the geometry A by
  more than 0.5 %, a note under the field says so with the geometry value. Nothing is copied
  without a click.
- The sketch can mark the centroid (circle with cross), the plastic neutral axis (dashed line) and
  the shear centre (small square), each with a legend entry, only when their checkbox is on.
- Load example: also fills r_o or r when the example shape needs it (the I-section example does not).

## 4e. Phase 1d spec: "?" help on every input

Every input in the dock and the geometry modal gets a "?" button beside its label. Click (not
hover) opens a small panel under the field; Esc or a second click closes it; one open at a time;
screen readers get a button named "What is <label>?" and the panel as its described content.

Panel, four short parts, plain language for beginners:
- What it is (one or two sentences).
- Why it is needed: the clauses and formulas that use it (this replaces the "Used in ..." line
  under each field, which moves into the panel).
- Where to get it: the source. It names a clause, a table, a standard or a document; it never
  suggests a number of its own. Quoting a value printed in EN 1993-1-4 with its clause is fine
  (E = 200 000 N/mm², 5.1.5).
- Source tag: "In EN 1993-1-4 (clause)" or "Outside EN 1993-1-4: you provide it".

Content (one source of truth): `src/stainless_csm/data/input_help.json`, keyed by the dock field
key (fy, fu, family, grade, E, enhanced, sectionType, fabrication, h, b, tw, tf, t, r, s, ro, d,
cStem, area, gammaM0, hasHoles, route, nu, omega, sigmaCr, and the plate width, thickness and k_σ
fields as one entry each), served at `GET /api/v1/input-help`. A Python test checks the JSON is
complete and short (each part at most about 200 characters); a web test checks every rendered
field has an entry.

Facts the text must use (checked against the PDF):
- f_y, f_u: Table 5.1 by grade and product form, or the specified values; for cold-formed
  sections the averages f_ya, f_ua of 5.1.2.3 may be used (B.3(3)).
- E and ν: 5.1.5 gives E = 200 000 N/mm² and ν = 0.3.
- γM0: 8.1 NOTE gives 1.10 unless the National Annex gives another value.
- Ω: 7.4.3.5, a project-specific limit on plastic strain; the PDF gives no value.
- k_σ: EN 1993-1-5:2024, 6.4.1, by plate support (internal or outstand) and stress ratio ψ;
  outside EN 1993-1-4.
- σ_cr,cs: numerical methods (for example a finite strip program) or the analytical expressions
  of reference [9] (B.5.2(2)); outside EN 1993-1-4.
- Dimensions h, b, t_w, t_f, t, r, s, r_o, d: the manufacturer's section table or the drawings.
  r and s change c (Tables 7.2, 7.3); r_o and the angle r change only the section properties.
- c_stem: typed because the PDF draws no flat width for a T-section stem.
- A: the section table, or Use from the Section geometry window.
- Holes: B.6.1(2) sends sections with holes to EN 1993-1-3:2024, 8.1.2 or EN 1993-1-1:2022, 8.2.3.
- Section type: B.2 lists the six shapes Annex B covers.

## 4a. Who does what (model split and hand-off)

Each phase is split by model tier. Use one chat per task, not one chat switched between models, so each
agent starts with a clean context and only the brief.

| Model | Takes | Examples |
|---|---|---|
| Haiku | Mechanical work, pattern copying, transcription | Table B.2 into JSON; `symbols.json` entries and README regeneration; type regeneration; contract tests following existing ones; simple 2D charts (capacity curve, M against ε_csm/ε_y, α curves, bar charts, tornado, criterion bars); Help drafts; README rows; the phase-8 test repairs once the cause is known |
| Sonnet | Engine logic, hand-calculated tests, harder front end | `csm/compression.py`, `bending.py`, `combined.py`; continuity and limit tests; API routes and mappers; the compression, bending and combined pages; gain surfaces and the 3D stub column, beam and member views; the summary page; sweep, report export |
| Opus | Judgement, standard ambiguities, review | Drafting recommendations for the section 8 items and the section 9 decisions, which you decide; the B.6.3.3 neutral-axis procedure; the B.18 refusal rules; the applicability gate for B.1 to B.3; reviewing each phase's engine before merge; reviewing the phase 0 layout (section 4b) |

**Workflow per phase:**

1. Opus writes the phase spec from this plan: formulas, test values, refusals.
2. Sonnet writes the engine and tests, and checks each hand-calculated value independently.
3. Haiku does the API boilerplate, the generated types, the symbols, the README, the Help drafts and the simple charts.
4. Opus reviews the engine diff before merge. Sonnet reviews the Haiku output.

**Hand-off rule:** each chat ends by writing what it did and what is left into this file (the phase table in
section 4 and the checkboxes in section 10). The next chat starts from this file, not from memory of an earlier chat.

**Standing rule for every agent:** any value not in EN 1993-1-4 is a typed input. Nothing is pre-filled, taken
from another clause or standard, or assumed. See the rule at the top of this file.

## 5. Visualisations, per clause

"live" means it redraws as inputs change, driven by the engine through the API (the browser never
re-derives a formula). Every 3D surface gets a 2D contour of the same data beside it. Static sketches
in Help stay as they are.

### B.4 Material (B.4, B.5, Table B.1, Figure B.1)
- done: bilinear curve against the elastic-perfectly-plastic one, schematic and true-scale, Table B.1 with the selected row.
- Family comparison: austenitic, duplex and ferritic curves, normalised (σ/f_y against ε/ε_y), same f_y and f_u.
- E_sh against f_y/f_u, with the invalid region (C2 ε_u <= ε_y) shaded red. This explains the validation rule.
- Hardening surface (3D): x = f_y, y = f_u, z = E_sh, the invalid region cut out. Contour beside it.
- Ductility-cap map: C1 ε_u / ε_y over f_y and f_u, with the line where it equals 15 (the B.14 crossover).

### B.5 Deformation capacity (B.6 to B.11)
- done: base curve with zones, cap, your section; live 3D comparison with the thickness slider; plate and tube meshes.
- σ_cr,p against b̄/t with the f_y line, so λ is seen as where the two meet.
- λ_p,cs against b̄/t for each plate, with the governing plate highlighted (bar chart).
- Cap-source diagram: Ω against C1 ε_u / ε_y, showing which one sets the cap for the chosen family.
- Plates against CHS base curves on one chart, normalised.
- Heatmap: ε_csm/ε_y over (b̄/t, f_y), and over (λ, Ω).
- Plate-buckling mode animation (3D): the half-sine wave of B.9 growing as λ rises. Illustrative, labelled as such.

### B.6.1 Tension (B.12 to B.14)
- done in step 2: tension point on the B.4 curve, the two caps with the governing one marked.
- Gain surface (3D): x = f_y, y = f_u, z = f_csm,t / f_y, one per family, with the crease where B.14 switches. The crease is exact: C1 C3 (1 - f_y/f_u) E / f_y = 15.
- Gain against f_y, one line per family, with the kink.
- Bar chart of f_csm,t / f_y for every Table 5.1 grade.
- 3D tension member, illustrative: an extruded section with load arrows, in one colour because stress in pure tension is uniform. No elongation is drawn or calculated. The section dimensions are typed inputs that only set the drawing's shape.

### B.6.2 Compression (B.15 to B.17)
Done in phase 1: the capacity curve (with the junction marker and your section as a dot, without the slider dot)
and the compression point on the material curve. Remaining: the slider dot (Explore), the sensitivity chart,
the gain surface, the 3D stub column and the stocky-against-slender view with real resistances.
- Capacity curve: N_csm,Rd / (A f_y / γ_M0) against λ, with the B.15 branch, the B.16 branch and the cap. One marker where ε_csm/ε_y = 1: the base curve reaches 1 at λ = 0.68 for plates and λ = 0.30 for tubes, which is the same point as the B.6 and B.7 switch, not a second one. It is a true kink only if the cap does not govern. Your section as a dot, the slider as a second dot.
- Compression point on the material curve (ε_csm, f_csm), with the extra strength above f_y shaded.
- Continuity marker at ε_csm/ε_y = 1 (B.15 meets B.16 there).
- Sensitivity chart (tornado): how much N_csm,Rd moves for a change of p % in each input (f_y, f_u, t, Ω, E). The step p is a user setting, empty until typed, never a fixed 10 %.
- Gain surface (3D): f_csm / f_y over (λ, f_y/f_u), and over (λ, Ω), with contours.
- 3D stub column, illustrative: local waves from the live slenderness, coloured by N_csm,Rd / (A f_y / γ_M0). The column length is a typed input that sets only the drawing's proportions. No shortening is calculated or shown, since Annex B gives no displacement rule.
- Stocky against slender side by side, as in the Visualise tab, now with real resistances.

### B.6.3 Bending (B.18 to B.20, Table B.2)
- Cross-section drawing to scale from the entered dimensions, with the neutral axes at the positions the user enters (never computed from the shape), and strain and stress blocks at ε_csm. Replaces today's shape-agnostic picture with real moments.
- M_csm,c,Rd against ε_csm/ε_y, with M_el and M_pl as reference lines, so the CSM gain above M_pl is seen at once.
- Effect of α: curves for α = 1.0, 1.2, 1.5 and 2.0 on one chart, the selected one highlighted; Table B.2 beside it with the selected row lit.
- Shape-factor effect: M_csm,c,Rd / M_el over (ε_csm/ε_y, W_pl/W_el), a 3D surface with a contour.
- M_csm,c,Rd / M_pl against λ (follows the base curve).
- B.18 interpolation line: M_csm,int,Rd against λ_LT between 0.2 and 0.4, with M_csm,c,Rd and M_c,Rd as its ends.
- B.6.3.3 neutral-axis shift diagram: the elastic axis, the plastic axis, the design axis midway, and ε_csm,t against ε_csm.
- Continuity marker: B.19 meets B.20 at ε_csm/ε_y = 1 (both equal W_el f_y / γ_M0).
- 3D beam, illustrative: a deflected shape coloured by strain, with local wrinkling on the compression flange from the live slenderness. The span and load are typed inputs that only draw the shape. No displacement value is calculated or shown, since Annex B gives no displacement rule.

### B.6.4 Combined bending and axial force (B.21 to B.29)
- Interaction curve, M_N / M against n_csm, for the selected criterion (RHS, I-section major and minor axes, CHS), with the design point inside or outside.
- α_csm against n_csm for RHS: the curve 1.66 / (1 - 1.13 n²) rising to 6 at n_csm = 0.8, with the join marked.
- I-section minor-axis curve with the kink at n_csm = a (B.26 flat, B.27 falling).
- CHS: B.28 (1 - n^1.7) against the linear B.29 rule, with the λ_c,cs = 0.27 switch.
- N-My-Mz interaction surface (3D) for RHS and I-section, with the design point; a contour slice at the current n_csm.
- B.24 plane: the linear criterion drawn as a plane, for λ > 0.60.
- Criterion bars: each criterion's value against 1, with the governing one highlighted.

### Whole-section
- Flow diagram with the formula number on every arrow, and the path taken in this calculation lit (for example B.15 or B.16, B.19 or B.20).
- Summary dashboard: N_csm,t,Rd, N_csm,Rd, M_csm,c,Rd and the criteria, one card each, with the clause.
- Generic input sweep: choose any input, plot any output against it, one engine call per point (the pattern of `run_comparison`).
- Printable report: working, charts and inputs, with the unit conventions stated.
- Qualitative IS 800 comparison sketches stay qualitative (no IS 800 numbers).

## 6. Engine and API additions

| Piece | New |
|---|---|
| `data/` | `bending_parameters.json` (Table B.2) |
| `csm/` | `compression.py`, `bending.py`, `combined.py`, an `applicability.py` for B.1 to B.3 |
| `services.py` | `run_compression`, `run_bending`, `run_combined`, `run_summary` |
| `api/` | `POST /api/v1/compression`, `/bending`, `/combined`, `/summary`; schemas and mappers |
| `viz/` | one figure function per chart above; Plotly for 2D and surfaces, three.js for members |
| `symbols.json` | every new symbol (N_csm,Rd, f_csm, W_el, W_pl, α, a_w, a_f, a, n_csm, α_csm, M_N,csm,Rd, ε_csm,max, ε_csm,t, λ_LT ...), regenerate the README table |
| `apps/web` | the layout of section 4b: one input dock on the left, one result tab per clause in clause order (Material, Deformation, Tension, Compression, Bending, Combined, Summary), then Explore (replaces Visualise, keeps the live comparison) and Help |

## 7. Tests

- A hand-calculated worked example per formula, with the working in the test, like `tests/test_tension.py`.
- Continuity (the standard's formulas must join):
  - B.15 and B.16 give the same value at ε_csm/ε_y = 1.
  - B.19 and B.20 give W_el f_y / γ_M0 at ε_csm/ε_y = 1.
  - α_csm of B.23 is 1.66 / (1 - 1.13 * 0.64) = 5.997 at n_csm = 0.8, which meets 6 to within 0.1 %.
  - B.26 and B.27 meet at n_csm = a.
  - The B.6 branches meet at λ_p,cs = 0.68 and the B.7 branches at λ_c,cs = 0.30, both at ε_csm/ε_y ≈ 1.00. The coefficients are rounded, so the joins differ by about 0.2 % (plates: 1.0021 and 1.0002; tubes: 1.0008 and 0.9991). Test with a tolerance of 0.5 %, chosen so the rounding passes, not with exact equality.
- Limits: B.20 tends to W_pl f_y / γ_M0 as ε_csm/ε_y grows when E_sh is zero (tested on the pure B.20 function, not through the engine: B.4 rejects f_u = f_y, and the strain ratio is capped at min(Ω, C1 ε_u/ε_y)); B.28 gives M at n = 0 and 0 at n = 1; B.21 and B.25 never exceed M_csm,Rd (the cap).
- Refusals: λ_p,cs > 1.60 and λ_c,cs > 0.60 (the B.5 limits, B.2); λ_LT above 0.4 (B.18 is silent, section 8 item 6); bending with tension, and sections outside B.6.4 (B.3(2)); a missing input.
- Not refusals: the 0.60 switch (B.24 applies above it) and the 0.27 switch (B.29 applies above it). These change the formula, so they are tested as switches.
- Contract test per endpoint (service against API give identical numbers).
- Front end: tests for each new page and visual, mocking WebGL as the Visualise test does.
- The 20 out-of-date front-end tests and `make_fixtures.py` are repaired later, as decided (tests come after the site works). Every new test added from now on must pass, and the Python suite stays green throughout.

## 8. Places where the standard's text needs care

1. B.24 writes N_csm,c,Rd while B.15 and B.16 write N_csm,Rd. B.3 equates N_c,Rd with N_csm,c,Rd, so they are taken as the same quantity. Confirm against the standard.
2. B.25 prints "but M_N,csm,y,Rd < M_csm,y,Rd" (strict) where B.21 prints "<=". Implement as a cap at M_csm,y,Rd; the result is the same.
3. The Annex does not define b, h, t or t_f. From the formulas: for an RHS (B.21, B.22), a_w = (A - 2bt)/A and a_f = (A - 2ht)/A, so b and h are the outer width and height and t is the uniform wall thickness. For an I-section (B.25), a = (A - 2bt_f)/A, so b is the flange width and t_f the flange thickness. Confirm against the section-dimension figure of EN 1993-1-1, and put a labelled sketch beside the fields.
4. B.6.3.3 gives a procedure, not a formula. The outer-fibre tensile strain follows from a linear strain distribution about the neutral axis (ε_csm,t = ε_csm times the distance to the tension fibre over the distance to the compression fibre). That relation is derived, not printed, so the working states it.
5. B.6.3.1 (1) says "from B.6.3.1 or B.6.3.2" where B.6.3.2 and B.6.3.3 appear meant. Follow the intent: B.6.3.2 for an axis of symmetry, B.6.3.3 otherwise.
6. B.18 is silent for λ_LT above 0.4 and when M_csm,c,Rd does not exceed M_c,Rd. Report "CSM does not apply" or "use the 8.2.4 value" instead of inventing a rule.
7. B.2 requires the member slenderness limits of 8.3.2.1(3) and 8.3.3.1(3). Those are outside Annex B, so the tool states the requirement and does not check it.
8. B.5.2(2) and (3): σ_cr,cs from reference [9] and k_σ from EN 1993-1-5:2024, 6.4.1 are not in the PDF. They stay inputs.
9. For n_csm ≥ 1, B.21, B.25 and B.27 give a moment capacity of zero or less, and B.28 does the same at n = 1 and above. The moment criterion cannot then be met. Recommended: show "not satisfied" with the reason, never a negative capacity. This is one of the section 9 decisions for you to confirm.
10. B.6.3.3(1) says "as indicated in B.6.3.1", the same slip as item 5. It means B.6.3.2, which holds B.19, B.20 and Table B.2.
11. c for the channel web and the T-section flange follows the I-section sketches of Tables 7.2 and 7.3 by analogy (the PDF draws neither); welded channels and T-sections likewise. The T-section stem is drawn nowhere, so its c is a typed input. Confirm against the standard.
12. Angles: 8.2.2(5) gives b̄ = h only (the longer leg), so one plate is checked; Table 7.4 also refers to Table 7.3 for outstands.

## 9. Decisions needed from you

| Decision | Recommendation |
|---|---|
| B.6.4 is a pass/fail criterion (≤ 1) and needs the design actions N_Ed and M_Ed. You removed the pass/fail verdict and utilisation on 2026-10-06, and the README says "no pass/fail verdict, no force check". | Allow it for B.6.4 only. The criterion is defined inside Annex B; the loads are typed inputs. Show the criterion value and "satisfied / not satisfied" labelled as the Annex B criterion alone, and say in the README that this is the one exception. |
| Section dimensions (b, h, t, t_f) and W_el, W_pl | Plain inputs with a labelled sketch, no section presets, as today. |
| λ_LT drives the bending route (B.6.3.1(1)), and M_c,Rd is needed only for B.18 | λ_LT is an input on every bending check. M_c,Rd is an input, shown only when λ_LT is in the 0.2 to 0.4 range. |
| B.6.3.3 neutral-axis inputs | Take the elastic and plastic axis positions and the extreme-fibre distances as inputs. The midway approximation is printed in B.6.3.3, so it may be offered as a choice the user selects. Solving the neutral axis by equilibrium needs section-geometry rules that are not in the PDF, so it is out for now. |
| n_csm ≥ 1 (B.21, B.25, B.27 and B.28 give a moment capacity of zero or less) | Show "not satisfied" with the reason, never a negative capacity. This is the one row you confirm before phase 4. |
| Where the printed Annex lives in the repo | Keep a short transcription (this section 2) in the plan and the clause numbers in the code; do not commit the PDF. |

## 10. Definition of done for each clause

- [ ] engine function with a CalcTrace and LaTeX for every step
- [ ] hand-calculated test, continuity test, limit tests, refusal tests
- [ ] schema, route, mapper, regenerated OpenAPI and TypeScript types
- [ ] contract test (service against API)
- [ ] website page with inputs, working, charts and the visualisations listed above
- [ ] symbol entries in `symbols.json`, README table regenerated, test_symbols passes
- [ ] Help module text and, where useful, a sketch
- [ ] README coverage row marked done

Ticked per phase in the phase hand-offs above; phase 1 (B.6.2) did every item except the remaining charts of section 5.
