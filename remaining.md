# What is left

Civil features only. Reference: EN 1993-1-4:2025, Annex B, unless noted. What is already done is in
`built.md`.

Rule for all of it: any value not in EN 1993-1-4:2025 is a typed input or a cited source; nothing is
pre-filled.

## Clauses not done

1. **B.6.3.1(2): bending with 0.2 < λ_LT ≤ 0.4.** B.18 interpolation, with M_c,Rd as an input.
2. **B.6.3.3: sections not symmetric about the axis of bending.** Channel about the minor axis, T-section
   about the major axis, angles. Needs the elastic and plastic neutral axis positions, the midway rule and
   the equilibrium neutral axis (B.6.3.3(3), Gere ch. 10).
3. **B.6.4.1: combined loading, rectangular hollow sections** (B.21 to B.24), with the design axial force
   and moments as inputs.
4. **B.6.4.2 and B.6.4.3: combined loading, I-sections** (B.25 to B.27) **and circular hollow sections**
   (B.28, B.29).
5. **Biaxial bending (N, M_y, M_z).** Not now, but it has to fit: strain then depends on both y and z.
6. **B.5.2(2): numerical elastic buckling stress** by finite strip, with the buckling mode shares (global,
   distortional, local, other).
7. **B.1 to B.3: applicability checks and the overall summary** of the section and its resistances.
8. **Serviceability deflection (clause 9.2).** Formulae 9.1 and 9.2, Table 9.1, only if displacements are
   wanted.

## Unsymmetric sections

- The true neutral axis of an unequal-flange section. The stage draws it at mid-height and the curvature
  uses the half depth as drawn.
- W_el and W_pl for each fibre, so that hogging uses the right value (today you type one value).
- The strain and stress through the depth of an unsymmetric section, which assumes a centred depth today.

## More of the stress and strain picture

- The elastic and plastic stress blocks as separate labelled pictures: elastic at first yield, fully
  plastic at M_pl, and the semi-plastic state between.
- Depth of the plastic zone and of the elastic core, and the shape factor M_pl / M_el (Gere 10.3, as a
  textbook reference).
- Strain and stress on a vertical slice at any position across the section (web slice beside flange
  slice), showing where there is material.
- The governing plate and the flat widths drawn for a custom section (only the standard sections have them).
- Comparing your own tensile-test stress-strain data against the B.4 model.

## Charts not done

- Material: families compared, E_sh against f_y / f_u, ductility-cap map.
- Section slenderness: σ_cr,p against b̄/t, λ_p per plate, plates against circular hollow sections.
- Tension and compression: gain over yield against f_y and slenderness, sensitivity of the result to each
  input, the result for every grade in Table 5.1.
- Bending: effect of α, M / M_pl against λ, the B.18 line, shift of the neutral axis.
- Combined loading: interaction curves, the α_csm curve, the I-section minor-axis kink, B.28 against
  B.29.

## To review

- The steps marked unsure when sources were assigned: the flat widths of the channel web and the T-section
  flange (taken by analogy), the stress at C₁ε_u read from the hardening line, the citation for M_el and
  M_pl, and the yield strain of the elastic-perfectly-plastic comparison.
- Two working lines show a wrong substitution (the answers are right): the plate buckling stress σ_cr,p
  repeats its result, and the base-curve line prints λ = 0.483877 = 3.4111.
- The engine's strain and stress frames for an unsymmetric section.

## Decisions waiting on you

- May the combined-loading check say "satisfied / not satisfied"? It would be the one exception to showing
  numbers only.
- Offer Ω as "15 (7.4.3.5(3) NOTE) or your National Annex value" instead of an empty field?
- When n_csm ≥ 1: show "not satisfied" with the reason, never a negative capacity.
- Finite strip: which minimum counts as σ_cr,cs, the section model, the reference stress.

## Ideas, not approved

- Plastic hinges and collapse mechanisms (Gere 10.4 to 10.6, 10.8), and the "M_p + LB = compact"
  classification from your hand sheet. Not in Annex B.
