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
| 8.2.2(5) | Section templates: the six shapes of B.2 from typed dimensions, with the flat width c of each plate (Tables 7.2 to 7.4) | done (phase 1b): c is derived where the PDF prints or draws it; the T-section stem c is typed |
| geometry | Section properties (A, centroid, I, W_el, W_pl, plastic axes, shear centre) from the typed dimensions | done (phase 1c): reference values only, geometry and not a rule of EN 1993-1-4; used only when you click Use |
| B.6.1 | Tension, Formulas B.12 to B.14 (resistance only; no force check) | done |
| B.6.2 | Compression, Formulas B.15 to B.17 (resistance only; no force check) | done |
| B.6.3.1(1), B.6.3.2 | Bending about an axis of symmetry, Formulas B.19 and B.20, Table B.2 (resistance only; no moment check) | done (phase 2): I-section (major, minor), rectangular and circular hollow sections, channel (major), T-section (minor); λ_LT up to 0.2 |
| B.6.3.1(2) | Interpolation, Formula B.18, for 0.2 < λ_LT ≤ 0.4 | planned (phase 3): the tool says "arrives in phase 3". λ_LT above 0.4 is refused (B.6.3.1 does not apply; use 8.2.4) |
| B.6.3.3 | Bending about an axis that is not one of symmetry (channel minor, T-section major, angles) | planned (phase 3): the tool says "arrives in phase 3" |
| B.6.4 | Combined bending and axial force, B.21 to B.29 | planned |

### Inputs from outside Annex B (never assumed)

Anything that Annex B uses but does not define is an input. Every one starts **empty** on the
website and none is suggested. Nothing is pre-filled; a complete worked example is loaded only when the user clicks Load example, and every example value shows its source. The engine has no defaults (each is a required
argument). The working shows such a value as "input", never as a clause.

| Input | Used in |
|---|---|
| E | B.4 (ε_y), B.9, B.11 |
| ν (Poisson's ratio), unless σ_cr,cs is entered | B.9, B.11 |
| γ_M0 | B.12, B.15, B.16, B.19, B.20 |
| Ω | B.6, B.7 |
| k_σ of each plate role (web, flange, stem, leg) | B.9 |
| Section dimensions h, b, t_w, t_f, t, r (rolled) or s (welded), d, and for a T-section the stem width c_stem | 8.2.2(5), B.9, B.11 |
| Outer corner radius r_o of a rectangular hollow section, root radius r of an angle (0 is sharp) | the section properties and the drawing only; never c |
| Plate widths b̄ and thicknesses t, when the plates are entered one by one | B.9 |
| σ_cr,cs and the section family, optionally (a numerical value) | B.8 |
| Axis of bending (major or minor; none for a circular hollow section) | Table B.2, which is in the PDF, so α is looked up and never typed |
| W_el and W_pl about the axis of bending (the Use buttons may copy them from the geometry window, only on a click) | B.19, B.20 |
| λ_LT | B.6.3.1 (the gate: up to 0.2 B.19 and B.20, above 0.4 not applicable) |
| k_σ of each plate role for **bending** about the chosen axis (or a typed σ_cr,cs for bending), separate from the compression ones | B.9 for the section in bending |
| Area A | B.12, B.15, B.16 |
| "Section has holes" (tension only; B.6.2 has no holes clause) | B.12 |
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
| k_σ | Plate buckling factor: How easily a plate buckles; an input for each plate, and a separate input for bending. | - | input |
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
| c_w | Web flat width: Flat width of the web, an internal plate, from the section dimensions as 8.2.2(5) and Tables 7.2 to 7.4 draw it. | mm | 8.2.2(5) |
| c_f | Flange flat width: Flat width of the flange outstand (or the flange of a rectangular hollow section), derived from the section dimensions per 8.2.2(5). | mm | 8.2.2(5) |
| c_stem | Stem flat width: Flat width of the T-section stem outstand: an input, because no table in the standard draws it. | mm | input |

**Area and partial factor (B.6)**

| Symbol | Meaning | Unit | Clause |
|---|---|---|---|
| A | Cross-sectional area: Gross area of the cross-section; an input. | mm² | input |
| γ_M0 | Partial factor: Safety factor on cross-section resistance; an input. | - | input |

**Tension (B.6.1)**

| Symbol | Meaning | Unit | Clause |
|---|---|---|---|
| ε_csm,t/ε_y | Tensile strain limit ratio: The smaller of 15 and C₁ε_u/ε_y (Formula B.14). | - | B.6.1 |
| ε_csm,t | Tensile strain limit: Maximum attainable CSM tensile strain. | - | B.6.1 |
| 15ε_y | Fixed strain cap: The fixed limit of 15 times the yield strain written into Formula B.14. | - | B.6.1 |
| f_csm,t | CSM tensile design stress: Stress on the hardening line at ε_csm,t (Formula B.13). | N/mm² | B.6.1 |
| N_csm,t,Rd | CSM tension resistance: Design value of the CSM resistance to tension axial force (Formula B.12). | N | B.6.1 |

**Compression (B.6.2)**

| Symbol | Meaning | Unit | Clause |
|---|---|---|---|
| ε_csm/ε_y vs 1 | Branch test: Compares ε_csm/ε_y with 1.0 to pick the formula: B.15 or B.16 in compression, B.19 or B.20 in bending. | - | B.6.2, B.6.3.2 |
| f_csm | CSM compressive design stress: Stress on the hardening line at ε_csm (Formula B.17); used only when ε_csm/ε_y is at least 1.0. | N/mm² | B.6.2 |
| N_csm,Rd | CSM compression resistance: Design value of the CSM resistance of the cross-section to compression axial force (Formulas B.15 and B.16). | N | B.6.2 |

**Section dimensions**

| Symbol | Meaning | Unit | Clause |
|---|---|---|---|
| r_o | RHS outer corner radius: Outer corner radius of a rectangular hollow section; an input, 0 for sharp corners. | mm | input |

**Section properties (from geometry)**

| Symbol | Meaning | Unit | Clause |
|---|---|---|---|
| y_c | Centroid, horizontal: Horizontal position of the centroid from the lower left corner of the bounding box. | mm | geometry, not a rule of EN 1993-1-4 |
| z_c | Centroid, vertical: Vertical position of the centroid from the lower left corner of the bounding box. | mm | geometry, not a rule of EN 1993-1-4 |
| e_top | Centroid to the top fibre: Distance from the centroid to the extreme fibre at the top. | mm | geometry, not a rule of EN 1993-1-4 |
| e_bottom | Centroid to the bottom fibre: Distance from the centroid to the extreme fibre at the bottom. | mm | geometry, not a rule of EN 1993-1-4 |
| e_left | Centroid to the left fibre: Distance from the centroid to the extreme fibre on the left. | mm | geometry, not a rule of EN 1993-1-4 |
| e_right | Centroid to the right fibre: Distance from the centroid to the extreme fibre on the right. | mm | geometry, not a rule of EN 1993-1-4 |
| I_y | Second moment of area about y-y: Second moment of area about the horizontal axis through the centroid (the major axis of most sections). | mm⁴ | geometry, not a rule of EN 1993-1-4 |
| I_z | Second moment of area about z-z: Second moment of area about the vertical axis through the centroid (the minor axis of most sections). | mm⁴ | geometry, not a rule of EN 1993-1-4 |
| I_yz | Product of inertia: Product of inertia about the centroid; zero when a symmetry axis exists, and shown for angles. | mm⁴ | geometry, not a rule of EN 1993-1-4 |
| W_el,y | Elastic section modulus about y-y: Second moment I_y divided by the distance to the extreme fibre; the smaller of the two sides is the one listed. | mm³ | geometry, not a rule of EN 1993-1-4 |
| W_el,z | Elastic section modulus about z-z: Second moment I_z divided by the distance to the extreme fibre; the smaller of the two sides is the one listed. | mm³ | geometry, not a rule of EN 1993-1-4 |
| z_pl,y | Plastic neutral axis for y-y: Height of the line parallel to y that cuts the area into two equal halves, from the lowest point. | mm | geometry, not a rule of EN 1993-1-4 |
| y_pl,z | Plastic neutral axis for z-z: Distance from the leftmost point to the line parallel to z that cuts the area into two equal halves. | mm | geometry, not a rule of EN 1993-1-4 |
| W_pl,y | Plastic section modulus about y-y: First moment of the area about the plastic neutral axis for y-y: the bending resistance per unit yield stress when fully yielded. | mm³ | geometry, not a rule of EN 1993-1-4 |
| W_pl,z | Plastic section modulus about z-z: First moment of the area about the plastic neutral axis for z-z: the bending resistance per unit yield stress when fully yielded. | mm³ | geometry, not a rule of EN 1993-1-4 |
| y_s | Shear centre, horizontal: Horizontal position of the shear centre from the lower left corner; a thin-walled approximation. | mm | geometry, not a rule of EN 1993-1-4 |
| z_s | Shear centre, vertical: Vertical position of the shear centre from the lower left corner; a thin-walled approximation. | mm | geometry, not a rule of EN 1993-1-4 |
| θ_u | Major principal axis angle: Angle of the major principal axis u of an angle section from the y axis, counter-clockwise with z up. | ° | geometry, not a rule of EN 1993-1-4 |
| I_u | Second moment about the major axis: Largest second moment of area of an angle, about the major principal axis u. | mm⁴ | geometry, not a rule of EN 1993-1-4 |
| I_v | Second moment about the minor axis: Smallest second moment of area of an angle, about the minor principal axis v. | mm⁴ | geometry, not a rule of EN 1993-1-4 |

**Bending (B.6.3)**

| Symbol | Meaning | Unit | Clause |
|---|---|---|---|
| W_el | Elastic section modulus: Section modulus up to first yield, about the axis of bending; an input. | mm³ | input |
| W_pl | Plastic section modulus: Section modulus of the fully plastic section, about the axis of bending; an input. | mm³ | input |
| λ_LT | Relative slenderness for lateral-torsional buckling: How much lateral-torsional buckling limits the beam; decides whether B.6.3 applies; an input. | - | B.6.3.1 |
| α | CSM bending parameter: The exponent in Formula B.20 that sets how fast the plastic reserve is reached; read from Table B.2. | - | B.6.3.2, Table B.2 |
| M_el | Elastic moment: W_el f_y / γ_M0, the moment at first yield; a reference line, equal to Formula B.19 at ε_csm/ε_y = 1.0. | N mm | B.6.3.2 |
| M_pl | Plastic moment: W_pl f_y / γ_M0, the factor in front of the bracket of Formula B.20; a reference line. | N mm | B.6.3.2 |
| M_csm,c,Rd | CSM bending resistance: Design value of the CSM bending moment resistance of the cross-section about an axis of symmetry. | N mm | B.6.3.2 |
<!-- symbols:end -->

## Layout

```
src/stainless_csm/
  core/            enums, errors, calculation trace (CalcStep, with LaTeX), LaTeX helper, units
  config/          E, ν, γM0, Ω and the fixed cap of 15 in B.14 (kept separate on purpose)
  data/            Table 5.1 and Table B.1 as JSON, and the repository that loads them
  materials/       Grade (Table 5.1) and Material (what the steel is)
  material_models/ stress-strain models: CSM bilinear (B.4) and the classic elastic-plastic one
  csm/             Annex B: slenderness (B.5.2), base curve (B.5.1), tension (B.6.1), compression (B.6.2),
                   bending (B.6.3.2, Table B.2 from data/bending_parameters.json)
  sections/        section templates (8.2.2(5)): six shapes from typed dimensions, the plates and c for B.5;
                   properties.py: A, centroid, I, W_el, W_pl, plastic axes, shear centre (reference values)
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

The website has one **input dock** on the left and the results on the right. Every input lives in
the dock, in groups (**Material**, **Section**, **Deformation capacity (B.5)**, **Bending (B.6.3)**; one open at a time),
so no two pages can hold different values of A or γM0. Each group header counts the fields still to
enter. Everything starts empty. The **section type** is
chosen once, in the Section group; it also decides whether B.5 asks for a tube (diameter and
thickness) or for section dimensions.

**The "?" help.** Every input in the dock and in the Section geometry window has a "?" button beside
its label (named "What is <label>?"). A click opens a short panel under the field, a second click or
Esc closes it, and only one is open at a time. The panel has four parts: what the input is, why it is
needed (the clauses and formulas that use it), where to get it, and a source tag, "In EN 1993-1-4
(clause)" or "Outside EN 1993-1-4: you provide it". It never suggests a value of its own. The text is
in `src/stainless_csm/data/input_help.json`, served by `GET /api/v1/input-help`; if that request fails
the buttons are hidden and the fields work as before.

**How a section is entered.** The Section group asks for the section type, then (I-section, channel,
T-section) whether it is rolled (root radius r) or welded (weld leg s), then shows a **Section
geometry** button with a small thumbnail of the shape, and the dimension fields: h, b, t_w, t_f for
the I-section and channel (the T-section adds c_stem), h, b, t for the angle (h the longer leg) and
the rectangular hollow section, d and t for the circular hollow section. All are typed, in mm, and
start empty. Two more radii are asked for, only for the section properties and the drawing: the outer
corner radius r_o of a rectangular hollow section and the root radius r of an angle (0 means sharp).
They never change c (8.2.2(5) fixes c = h − 3t and b̄ = h), so B.5 and B.6.2 do not wait for them.

**The Section geometry window** (the button in the dock; Esc or Close shuts it, and it fills the
screen on a phone) holds the large drawing, the layers to show on it, the same dimension fields as the
dock (one state, not a copy) and the section properties. The drawing redraws on every keystroke: a
dashed schematic (symbols only, "not to scale until every dimension is given") until all the
dimensions are in, then a solid drawing to scale with your numbers on the dimension lines, the axes,
fillets or weld triangles (and the corner radii), and a tinted band on each plate where its flat
width c is measured. The value of c shown on a band always comes from the engine (the latest B.5
result): the browser never computes it. A shape that cannot exist (for example 2t_f not less than h)
shows a message naming the dimensions and the drawing stays a schematic. Focusing a field lights its
dimension line, hovering a line lights its field, and clicking a line focuses the field. The **Show**
checkboxes switch the layers: dimensions, flat widths c, the y-y and z-z axes, fillets and welds
(on at first), and the centroid (circle with a cross), the plastic neutral axis (dashed line), the
shear centre (small square) and, for an angle, the principal axes u and v (off at first), each with a
legend entry. The choice is remembered in the browser.

**Section properties** are the second half of that window: A, the centroid, the second moments I_y and
I_z (and I_yz, I_u, I_v for an angle), W_el,y and W_el,z (both sides when they differ, the smaller one
marked), the plastic neutral axes and W_pl,y, W_pl,z, the extreme-fibre distances and the shear
centre. The engine computes them from your dimensions (`sections/properties.py`, `POST
/api/v1/section-properties`): the outline becomes a polygon, fillets and corner radii are arcs of many
segments and welds are triangles, Green's theorem gives A, the centroid and I, and the plastic axis is
found by bisection. The shear centre is a **thin-walled approximation**, labelled so (I, RHS and CHS at
the centroid; T and angle where the leg centrelines meet; the channel by e = 3b'²t_f / (6b't_f + h't_w)
from the web centreline). There is no I_t or I_w: Annex B does not use them. The browser only draws
and shows what the engine returns. These are **reference values**, labelled "computed from your
dimensions: geometry, not a rule of EN 1993-1-4": nothing enters a calculation unless you click
**Use** beside a value, which copies it into its input field (today only A has a field). After Use the
field says "copied from geometry"; if the A you typed differs from the geometry A by more than 0.5 %,
a note under the field gives the geometry value. Nothing is copied without a click, and A, W_el and
W_pl remain typed inputs as far as Annex B is concerned.

The Deformation group then asks for **Slenderness from**: "Section dimensions (8.2.2(5))" (the
default once a type is picked, a choice of route and not a value), "Flat plates entered one by one" or
"A typed critical stress" (a tube has "Diameter and thickness" or the typed stress). With section
dimensions it lists the plates of the shape, internal or outstand, with the c rule as text and one
empty k_σ field each. The engine derives c as 8.2.2(5) and Tables 7.2 to 7.4 draw it: I-section web
h − 2t_f − 2r and flange outstand (b − t_w − 2r)/2 (s in place of r when welded); channel web as the
I-section web (by analogy, the PDF draws no channel) and flange b − t_w − r; T-section flange as the
I-section flange (by analogy) and a typed stem c; angle b̄ = h; rectangular hollow section h − 3t and
b − 3t. Each c is a step of the working that names its source. A, W_el, W_pl and k_σ stay typed.

The result tabs are **Material (B.4)**, **Deformation (B.5)**, **Tension (B.6.1)**,
**Compression (B.6.2)**, **Bending (B.6.3)**, **Explore** and **Help**. Each tab carries a status icon (done, waiting for inputs, not applicable, arrives in a later phase, needs attention).
A tab that is waiting lists what it needs as links ("Waiting for: A; γM0"); a link opens that field
in the dock. On a phone the dock becomes an **Inputs** button that slides a drawer out. "Graph view"
switches between a schematic (not to scale, like Figure B.1) and a true-scale view. "Show working"
lists each calculation step as a typeset equation, and "Symbols used on this page" explains every
symbol in one line.

**Compression (B.6.2)** has no inputs of its own: it uses the section type and B.5 inputs, and the area A
and γM0 of the Section group. It shows ε_csm/ε_y, f_csm (or "B.17 not used" when the ratio is below 1.0),
N_csm,Rd in kN, which formula applied (B.15 below 1.0, B.16 from 1.0) and why, a chart of the resistance
against slenderness (N_csm,Rd / (A f_y / γM0), the B.15 and B.16 branches, the cap and your section) and
the compression point on the material curve. Beyond the B.5 slenderness limit the tab is "not
applicable" and shows no resistance.

**Bending (B.6.3)** has its own Bending group in the dock: the axis of bending, W_el and W_pl about it, λ_LT and
one k_σ per plate for the bending stress pattern (a web in pure bending is held back less than one in uniform
compression, so these are separate from the compression k_σ; the engine runs B.5 again for the section in
bending). The Section geometry window gets Use buttons for W_el and W_pl of the chosen axis (y-y for the major
axis, z-z for the minor one), copied only on a click. The tab shows ε_csm/ε_y, α, M_csm,c,Rd in kN m, which
formula applied (B.19 below 1.0, B.20 from 1.0) and why, Table B.2 with the row used lit, a chart of M_csm,c,Rd
against ε_csm/ε_y with W_el f_y / γ_M0 and W_pl f_y / γ_M0 as reference lines and your section as a dot, and an
illustration of strain and stress across the depth at ε_csm. λ_LT above 0.4 is refused ("B.6.3.1 does not apply;
use 8.2.4"); the B.18 range (0.2 to 0.4) and the shapes that need B.6.3.3 show "arrives in phase 3", which is
a case not built yet and not a refusal of the standard.

**Explore** shows stocky against slender live. It uses the same dock inputs as the other tabs and
redraws as you type. A slider multiplies every thickness (t_w, t_f and t; h, b, r, s, d, c_stem and k_σ stay as entered, and c is derived again at each point), and each
position is a full B.5 calculation on the B.4 material, run by the engine, not re-derived in the
browser. It shows:

- a 3D view (three.js, loaded only when the tab opens) with your section, the section where the cap
  just holds, the one where the strain limit has fallen to yield, the thinnest section the method
  accepts, and the slider section, side by side. A section template is drawn assembled from the
  dimensions you typed (web and flanges in place, extruded; fillets and weld triangles are left out)
  and only the plate the engine reports as governing wrinkles. A tube is drawn from its diameter, and
  plates entered one by one are drawn as separate slabs because Annex B gives them no layout;
- the base curve and the material curve, each with those sections and the slider marked, and the
  flat-yield curve for contrast;
- a strain and stress picture across the depth of a bent section, with the CSM stress against the
  flat-yield stress (an illustration; the moment of the Bending tab comes from B.19 or B.20).

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
| POST | `/api/v1/compression` | B.6.2, with B.5 for the section |
| POST | `/api/v1/bending` | B.6.3.1(1) and B.6.3.2: the λ_LT gate, B.5 for the section in bending (`geometry.k_sigma` are the bending values), then B.19 or B.20 with α from Table B.2; 422 with `error_type` `NotApplicableError` (λ_LT above 0.4, beyond the B.5 limit) or `NotBuiltYetError` (B.18 range, B.6.3.3 shapes) |
| POST | `/api/v1/deformation-capacity` | B.5, with 8.2.2(5) for a section template (`geometry.kind = "template"`) |
| POST | `/api/v1/section-properties` | not a clause: reference geometry (A, centroid, I, W_el, W_pl, plastic axes, shear centre) from the template dimensions; needs r_o (RHS) or r (angle) |
| POST | `/api/v1/section-comparison` | B.5 and B.4 for the section made thicker and thinner (t_w, t_f and t are multiplied; c is derived again at each point) |

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
- Section templates: the PDF draws no channel and no T-section, so their c follow the I-section
  sketches by analogy and the T-section stem c is typed (see plan.md section 8, item 11). The toe
  radii of a rolled angle and the weld shape beyond a triangle of leg s are not modelled.
- Section properties are reference values from the dimensions you typed (a polygon with arcs, so
  A is within 0.01 % of the exact value): published tables include toe radii and rounding that
  differ a little. Only A has a Use button today; W_el, W_pl and the neutral-axis inputs get theirs
  when the bending phases add the fields. The shear centre is a thin-walled approximation.
- The front-end tests (`npm test`) are out of date after the "no assumptions" change and are
  to be updated; the Python tests (`pytest`) are current.
- The tension screen does not check the B.2 slenderness limits (only the area is given); step 3
  covers them for a section.
- Elliptical hollow sections are outside B.6.1.
- The Explore tab needs a circular hollow section or flat plates. A tube cannot be made thicker
  than half its diameter, so the slider stops there. The 3D wrinkles are illustrative, and the
  bending picture shows stress, not a moment.
