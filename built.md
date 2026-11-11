# What is built, in order

Civil features only, in the order they were built. Reference: EN 1993-1-4:2025, Annex B (Continuous
Strength Method) unless noted.

1. **Stainless steel material model (B.4).** Stress-strain curve: elastic up to the 0.2 % proof stress
   f_y, then a straight hardening line to f_u, with the coefficients C₁, C₂, C₃ of Table B.1 for each
   material family. Grade table from Table 5.1. This also gives the strain-hardening modulus E_sh and the
   ductility cap C₁ε_u.
2. **Tension resistance (B.6.1).** Gross section resistance using the hardening stress at the strain limit,
   divided by γM0. Sections with holes are flagged as outside the clause.
3. **Section slenderness and deformation capacity (B.5).** Elastic buckling stress of each flat plate,
   plate slenderness λ_p, the cross-section slenderness λ_cs and the strain limit ε_csm/ε_y from the base
   curve. A section too slender for the method is refused with the reason.
4. **Compression resistance (B.6.2).** The B.15 branch (slender, buckles before yield) and the B.16 branch
   (stocky, gains on yield).
5. **Standard sections and their geometry.** I-section (rolled or welded), channel, T-section, angle,
   rectangular hollow section and circular hollow section, with the flat widths c of each plate worked out
   from the dimensions, and the section properties: area, centroid, second moment of area, W_el and W_pl.
6. **Bending about an axis of symmetry (B.6.3.2).** The B.19 (elastic-to-first-yield) and B.20 (past yield,
   with hardening) bending resistances, the α factor from Table B.2 for the section and axis, major or
   minor axis, with W_el, W_pl and λ_LT as inputs.
7. **Checks against the textbook.** Section properties and the fully plastic moment checked against Gere &
   Timoshenko, Mechanics of Materials, 2nd ed., ch. 10 (problems 10.3-7 and 10.7-7).
8. **Source on every step.** Each line of a calculation says where it comes from: the code clause, a user
   input, a textbook, or derived. The value of Ω cites 7.4.3.5(3) NOTE.
9. **Review of the standard.** Check of the work against the 2025 edition of EN 1993-1-4, including the
   equilibrium neutral axis and the serviceability deflection of clause 9.2 (noted, not built).
10. **Comparison of stocky and slender sections.** Live comparison of how a stocky and a slender plate
    buckle, with a guide to local buckling and plastic bending.
11. **Charts of the results.** Stress-strain curve, strain limit against slenderness, resistance against
    slenderness or strain ratio, with the clause and unit named on every value.
12. **Section stepped to its strain limit.** The section drawn to scale with strain and stress through the
    depth from zero strain to the limit: first yield, the point where the moment passes M_pl, the stress
    above f_y from hardening, the governing plate lit, the member shortening or lengthening or bending in 3D
    with arrows for the stress on each fibre, and a "what if every thickness changed" view for compression.
13. **Custom section from nodes and links.** A section of any layout of flat plates, given by the
    coordinates of its nodes and the plates between them, with the flat width taken from the length of each
    link. Example: an I-section with unequal flanges.
14. **Sagging and hogging.** Choice of compression at the top (sagging, +M) or at the bottom (hogging, −M),
    with signed moment and curvature κ.
15. **Sign convention guide.** Axes, internal and external moments, sagging and hogging, curvature, and
    how the Eurocode axis names y-y and z-z map to the right-hand system.
