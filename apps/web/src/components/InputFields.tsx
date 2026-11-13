import { Ruler } from "lucide-react";
import type { ReactNode } from "react";
import type { BendingAxisKey, FamilyKey, GradeOut, SectionType, StainlessFamily } from "../api/types";
import { asksForAxis, type BendingFormState } from "../lib/bending";
import {
  CIRCULAR,
  dimsOf,
  geometryKind,
  usesDimensions,
  withCustom,
  type DeformationFormState,
} from "../lib/geometry";
import {
  needsFabrication,
  plateRoles,
  sectionFields,
  type DimField,
  type DimKey,
  type Fabrication,
  type SketchDims,
} from "../lib/sectionTemplates";
import {
  CUSTOM,
  equivalentGrades,
  selectGrade,
  withFu,
  withFy,
  type MaterialFormState,
} from "../lib/material";
import type { TensionFormState } from "../lib/tension";
import { renderSymbols } from "./Symbols";
import { SectionThumbnail } from "./SectionSketch";
import { NodeLinkPreview } from "./CustomSection";
import { CheckField, NumberField, ReadOnlyField, SelectField } from "./ui";

const FAMILIES: { value: StainlessFamily; label: string }[] = [
  { value: "austenitic", label: "Austenitic" },
  { value: "duplex", label: "Duplex" },
  { value: "ferritic", label: "Ferritic" },
];

export const SECTION_TYPES: { value: SectionType; label: string }[] = [
  { value: "I-section", label: "I-section" },
  { value: "channel", label: "Channel" },
  { value: "T-section", label: "T-section" },
  { value: "angle", label: "Angle" },
  { value: "rectangular hollow section", label: "Rectangular hollow section" },
  { value: "circular hollow section", label: "Circular hollow section" },
];

const FAMILY_LABEL: Record<FamilyKey, string> = {
  flat_plates: "flat plates",
  circular_hollow: "circular hollow section",
};

/** The Material group of the dock. Every number starts empty; a grade only fills in f_y, f_u and the family. */
export function MaterialInputs({
  form,
  onChange,
  grades,
}: {
  form: MaterialFormState;
  onChange: (form: MaterialFormState) => void;
  grades: GradeOut[];
}) {
  const custom = form.designation === CUSTOM;
  const options = [
    { value: CUSTOM, label: "Custom (enter f_y and f_u)" },
    ...grades.map((grade) => ({ value: grade.designation, label: grade.label })),
  ];
  const same = equivalentGrades(grades, form);
  return (
    <>
      <p className="muted">
        {renderSymbols(
          "Give f_y, f_u, E and the family, or pick a grade to fill f_y, f_u and the family from Table 5.1. Grade, f_y and f_u are linked: enter any one and the other two follow the table. Values that match no grade make the material Custom.",
        )}
      </p>
      <SelectField
        label="Grade (Table 5.1)"
        value={form.designation}
        options={options}
        fieldKey="grade"
        onChange={(designation) => onChange(selectGrade(grades, designation, form))}
      />
      <NumberField
        label="f_y"
        unit="N/mm²"
        value={form.fy}
        step={10}
        fieldKey="fy"
        onChange={(fy) => onChange(withFy(grades, fy, form))}
      />
      <NumberField
        label="f_u"
        unit="N/mm²"
        value={form.fu}
        step={10}
        fieldKey="fu"
        onChange={(fu) => onChange(withFu(grades, fu, form))}
      />
      <SelectField
        label="Family"
        value={form.family}
        options={FAMILIES}
        placeholder="choose the family"
        fieldKey="family"
        onChange={(family) => onChange({ ...form, family })}
      />
      {custom ? (
        <CheckField
          label="Values enhanced by cold-forming (B.3(3))"
          fieldKey="enhanced"
          checked={form.enhanced}
          onChange={(enhanced) => onChange({ ...form, enhanced })}
        />
      ) : null}
      <NumberField
        label="E"
        unit="N/mm²"
        value={form.elasticModulus}
        step={1000}
        fieldKey="E"
        onChange={(elasticModulus) => onChange({ ...form, elasticModulus })}
      />
      {same.length > 0 ? (
        <p className="muted">
          {renderSymbols("Same f_y and f_u in Table 5.1 (identical in CSM): ")}
          {same.join(", ")}.
        </p>
      ) : null}
    </>
  );
}

/**
 * The dimension fields of a section template, in the order they are asked. The Section group of the
 * dock and the geometry window both show this component on the same form state, so a value typed in
 * either is the value in both. `highlighted` lights one field (the matching dimension line is under the
 * pointer in the big drawing); `onFocusKey` reports which field has the cursor, so the drawing can light its line.
 */
export function DimensionFields({
  fields,
  dims,
  onChange,
  highlighted = null,
  onFocusKey,
}: {
  fields: DimField[];
  dims: SketchDims;
  onChange: (key: DimKey, value: number | null) => void;
  highlighted?: DimKey | null;
  onFocusKey?: (key: DimKey | null) => void;
}) {
  if (fields.length === 0) return null;
  const keys = new Set<string>(fields.map((field) => field.key));
  const keyOf = (target: EventTarget | null): DimKey | null => {
    const key = (target as HTMLElement | null)?.closest<HTMLElement>("[data-field]")?.dataset.field;
    return key && keys.has(key) ? (key as DimKey) : null;
  };
  return (
    <div
      onFocus={onFocusKey ? (event) => onFocusKey(keyOf(event.target)) : undefined}
      onBlur={onFocusKey ? () => onFocusKey(null) : undefined}
      className="dimension-fields"
    >
      {fields.map((field) => (
        <NumberField
          key={field.key}
          label={field.label}
          unit={field.unit}
          value={dims[field.key]}
          step={field.key === "r" || field.key === "s" || field.key === "rO" ? 1 : 0.5}
          fieldKey={field.key}
          hint={field.hint}
          highlighted={highlighted === field.key}
          onChange={(value) => onChange(field.key, value)}
        />
      ))}
    </div>
  );
}

/** The fabrication choice of an I-section, channel or T-section (rolled radius r, or weld leg s). */
export function FabricationField({
  value,
  onChange,
}: {
  value: Fabrication | null;
  onChange: (fabrication: Fabrication) => void;
}) {
  return (
    <SelectField
      label="Fabrication"
      value={value}
      options={[
        { value: "rolled", label: "Rolled (root radius r)" },
        { value: "welded", label: "Welded (weld leg s)" },
      ]}
      placeholder="choose rolled or welded"
      fieldKey="fabrication"
      onChange={onChange}
    />
  );
}

/** What the geometry button in the dock says about the custom section. */
function customSummary(form: DeformationFormState): string {
  const nodes = form.nodes.filter((node) => node.x !== null || node.y !== null).length;
  const links = form.links.filter((l) => l.from !== null || l.to !== null || l.thickness !== null).length;
  return nodes === 0 && links === 0
    ? "Enter or paste the nodes and the links; the geometric properties follow"
    : `${nodes} node${nodes === 1 ? "" : "s"}, ${links} link${links === 1 ? "" : "s"}. Tables, drawing and properties`;
}

/**
 * The Section group, in the order the choices depend on each other: how the geometry is given
 * (a template of standard dimensions or a custom set of nodes and links), the section type, how it
 * is made, then a button that opens the geometry window (the template's drawing and dimensions, or
 * the custom section's two tables), γM0 and holes. The area A is not typed: it comes from the geometry.
 */
export function SectionInputs({
  sectionType,
  onSectionType,
  tension,
  onTensionChange,
  form,
  onFormChange,
  onOpenGeometry,
  area,
}: {
  sectionType: SectionType | null;
  onSectionType: (type: SectionType) => void;
  tension: TensionFormState;
  onTensionChange: (form: TensionFormState) => void;
  form: DeformationFormState;
  onFormChange: (form: DeformationFormState) => void;
  onOpenGeometry: () => void;
  /** the area A from the geometry, null while the dimensions are incomplete */
  area: ReactNode;
}) {
  const set = (patch: Partial<DeformationFormState>) => onFormChange({ ...form, ...patch });
  const showDimensions = sectionType !== null && usesDimensions(form);
  const fields = showDimensions ? sectionFields(sectionType, form.fabrication) : [];
  const dims = dimsOf(form);
  const typedStress = form.kind === "sigma_cr";
  const types = form.custom ? SECTION_TYPES.filter((t) => t.value !== CIRCULAR) : SECTION_TYPES;
  return (
    <div>
      {!typedStress ? (
        <SelectField
          label="Geometry"
          value={form.custom ? "custom" : "template"}
          options={[
            { value: "template", label: "Template: the standard dimensions" },
            { value: "custom", label: "Custom: nodes and links in two tables (paste from Excel)" },
          ]}
          fieldKey="geometry"
          onChange={(choice) => onFormChange(withCustom(form, choice === "custom"))}
        />
      ) : null}
      <SelectField
        label="Section type"
        value={sectionType}
        options={types}
        placeholder="choose the section type"
        fieldKey="sectionType"
        onChange={onSectionType}
      />
      {form.custom && !typedStress ? (
        <p className="muted">
          {renderSymbols("For a custom section the type only picks α and the axes of bending (Table B.2); the geometry is the tables.")}
        </p>
      ) : null}
      {sectionType !== null && !form.custom && form.kind === "template" && needsFabrication(sectionType) ? (
        <FabricationField value={form.fabrication} onChange={(fabrication) => set({ fabrication })} />
      ) : null}
      {sectionType !== null && showDimensions ? (
        <button type="button" className="geometry-button" aria-haspopup="dialog" onClick={onOpenGeometry}>
          <SectionThumbnail shape={sectionType} fabrication={form.fabrication} dims={dims} />
          <span className="geometry-button-text">
            <span className="geometry-button-title">
              <Ruler size={16} aria-hidden="true" /> Section geometry
            </span>
            <span className="muted">Large drawing, layers and the properties computed from your dimensions</span>
          </span>
        </button>
      ) : null}
      {form.custom && !typedStress ? (
        <button type="button" className="geometry-button" aria-haspopup="dialog" onClick={onOpenGeometry}>
          <span className="geometry-button-thumb" aria-hidden="true">
            <NodeLinkPreview nodes={form.nodes} links={form.links} plates={form.plates} maxHeight={64} />
          </span>
          <span className="geometry-button-text">
            <span className="geometry-button-title">
              <Ruler size={16} aria-hidden="true" /> Nodes and links
            </span>
            <span className="muted">{customSummary(form)}</span>
          </span>
        </button>
      ) : null}
      {sectionType !== null && typedStress ? (
        <p className="muted">{renderSymbols("A typed σ_cr,cs needs no section dimensions.")}</p>
      ) : null}
      <DimensionFields
        fields={fields}
        dims={dims}
        onChange={(key, value) => set({ [key]: value } as Partial<DeformationFormState>)}
      />
      {typedStress ? (
        <NumberField
          label="Area A"
          unit="mm²"
          value={tension.area}
          step={100}
          fieldKey="area"
          onChange={(value) => onTensionChange({ ...tension, area: value })}
        />
      ) : (
        <ReadOnlyField label="Area A" unit="mm²" fieldKey="area" hint="From the section geometry: nothing to enter.">
          {area}
        </ReadOnlyField>
      )}
      <NumberField
        label="γM0"
        value={tension.gammaM0}
        step={0.05}
        fieldKey="gammaM0"
        onChange={(gammaM0) => onTensionChange({ ...tension, gammaM0 })}
      />
      <CheckField
        label="Section has holes (bolt holes, slots)"
        fieldKey="hasHoles"
        checked={tension.hasHoles}
        onChange={(hasHoles) => onTensionChange({ ...tension, hasHoles })}
      />
    </div>
  );
}

/** The Deformation group (B.5). The section type has already chosen the template, tube or plates. */
export function DeformationInputs({
  form,
  onChange,
  sectionType,
}: {
  form: DeformationFormState;
  onChange: (form: DeformationFormState) => void;
  sectionType: SectionType | null;
}) {
  const set = (patch: Partial<DeformationFormState>) => onChange({ ...form, ...patch });
  if (sectionType === null || form.kind === null) {
    return <p className="muted">Choose the section type in the Section group first: it decides which fields apply here.</p>;
  }
  const circular = sectionType === CIRCULAR;
  const roles = plateRoles(sectionType, form.fabrication);
  return (
    <>
      <SelectField
        label="Slenderness from"
        value={form.kind}
        options={
          circular
            ? [
                { value: "chs", label: "Diameter and thickness (B.10, B.11)" },
                { value: "sigma_cr", label: "A typed critical stress σ_cr,cs" },
              ]
            : [
                {
                  value: geometryKind(form, sectionType),
                  label: form.custom
                    ? "The custom plates of the Section group (B.9)"
                    : "Section dimensions (8.2.2(5))",
                },
                { value: "sigma_cr", label: "A typed critical stress σ_cr,cs" },
              ]
        }
        fieldKey="route"
        onChange={(kind) => set({ kind })}
      />
      {form.kind === "template" ? (
        <>
          <p className="muted">
            {renderSymbols(
              "The engine derives the flat width c of each plate from the dimensions in the Section group. k_σ of each plate is yours to give (EN 1993-1-5, 6.4.1): internal plates and outstands use different cases.",
            )}
          </p>
          {roles.map((plate) => (
            <NumberField
              key={plate.role}
              label={`k_σ, ${plate.name.toLowerCase()} (${plate.kind})`}
              value={form.kSigma[plate.role]}
              step={0.01}
              fieldKey={`kSigma-${plate.role}`}
              hint={`${plate.name}, ${plate.kind} plate: ${plate.formula}.`}
              onChange={(value) => set({ kSigma: { ...form.kSigma, [plate.role]: value } })}
            />
          ))}
        </>
      ) : null}
      {form.kind === "plates" ? (
        <p className="muted">
          {renderSymbols("b̄ is the length of each link between its two nodes; t and k_σ are columns of the links table in the Section group.")}
        </p>
      ) : null}
      {form.kind === "sigma_cr" ? (
        <>
          <NumberField
            label="σ_cr,cs"
            unit="N/mm²"
            value={form.sigmaCr}
            step={10}
            fieldKey="sigmaCr"
            onChange={(sigmaCr) => set({ sigmaCr })}
          />
          {form.family ? (
            <p className="muted">
              Treated as {FAMILY_LABEL[form.family]}, from the section type.
            </p>
          ) : null}
        </>
      ) : null}
      {form.kind !== "sigma_cr" ? (
        <NumberField
          label="Poisson's ratio ν"
          value={form.poissonRatio}
          step={0.05}
          fieldKey="nu"
          onChange={(poissonRatio) => set({ poissonRatio })}
        />
      ) : null}
      <NumberField label="Ω" value={form.omega} step={1} fieldKey="omega" onChange={(omega) => set({ omega })} />
    </>
  );
}

const AXES: { value: BendingAxisKey; label: string }[] = [
  { value: "major", label: "Major axis (y-y)" },
  { value: "minor", label: "Minor axis (z-z)" },
];

/**
 * The Bending group (B.6.3.1(1), B.6.3.2). Everything here starts empty: the axis of bending, W_el and
 * W_pl about it, λ_LT, and the plate buckling factors of the bending stress pattern, which are
 * separate from the compression ones in the Deformation group. α is not typed: Table B.2 is in the
 * PDF, so the engine looks it up from the section type and the axis.
 */
export function BendingInputs({
  sectionType,
  deformation,
  form,
  onChange,
  wElNote,
  wPlNote,
}: {
  sectionType: SectionType | null;
  deformation: DeformationFormState;
  form: BendingFormState;
  onChange: (form: BendingFormState) => void;
  /** under W_el and W_pl: where a copied value came from (the Use button in the geometry window) */
  wElNote?: ReactNode;
  wPlNote?: ReactNode;
}) {
  const set = (patch: Partial<BendingFormState>) => onChange({ ...form, ...patch });
  // W_el, W_pl and λ_LT do not depend on the shape; the axis and the plate k_σ do, so they wait for the type.
  const known = sectionType !== null && deformation.kind !== null;
  const roles = plateRoles(sectionType, deformation.fabrication);
  return (
    <>
      <p className="muted">
        {renderSymbols(
          "Bending about an axis of symmetry (B.6.3.2). W_el, W_pl and λ_LT are outside Annex B, so they are yours to give. The bending k_σ are separate from the compression ones: the stress pattern is different. α comes from Table B.2.",
        )}
      </p>
      {!known ? (
        <p className="muted">Choose the section type in the Section group first: it decides the axis and the plate k_σ asked for here.</p>
      ) : null}
      {known && asksForAxis(sectionType) ? (
        <SelectField
          label="Axis of bending"
          value={form.axis}
          options={AXES}
          placeholder="choose the axis"
          fieldKey="axis"
          onChange={(axis) => set({ axis })}
        />
      ) : null}
      <SelectField
        label="Direction of bending"
        value={form.direction}
        options={[
          { value: "sagging", label: "Sagging (+M): compression at the top" },
          { value: "hogging", label: "Hogging (−M): compression at the bottom" },
        ]}
        fieldKey="direction"
        onChange={(direction) => set({ direction })}
      />
      <p className="muted">
        {renderSymbols("Sets the compression side on the Stage and the sign of M and κ; the resistance is a magnitude. For a section that is not symmetric, give W_el and W_pl for the side in compression.")}
      </p>
      {known && !asksForAxis(sectionType) ? (
        <p className="muted">A circular hollow section bends alike about every axis, so no axis is asked for (Table B.2: any).</p>
      ) : null}
      <NumberField
        label="Elastic modulus W_el"
        unit="mm³"
        value={form.wEl}
        step={1000}
        fieldKey="wEl"
        onChange={(wEl) => set({ wEl })}
        note={wElNote}
      />
      <NumberField
        label="Plastic modulus W_pl"
        unit="mm³"
        value={form.wPl}
        step={1000}
        fieldKey="wPl"
        onChange={(wPl) => set({ wPl })}
        note={wPlNote}
      />
      <NumberField
        label="Relative slenderness λ_LT"
        value={form.lambdaLT}
        step={0.05}
        fieldKey="lambdaLT"
        onChange={(lambdaLT) => set({ lambdaLT })}
      />
      {deformation.kind === "template"
        ? roles.map((plate) => (
            <NumberField
              key={plate.role}
              label={`k_σ in bending, ${plate.name.toLowerCase()} (${plate.kind})`}
              value={form.kSigma[plate.role]}
              step={0.01}
              fieldKey={`kSigmaB-${plate.role}`}
              hint={`${plate.name}, ${plate.kind} plate, with its stress ratio ψ when the section bends about the chosen axis.`}
              onChange={(value) => set({ kSigma: { ...form.kSigma, [plate.role]: value } })}
            />
          ))
        : null}
      {deformation.kind === "plates"
        ? deformation.plates.map((row) => (
            <NumberField
              key={row.id}
              label={`k_σ in bending, ${row.label || "plate"}`}
              value={form.plateKSigma[row.id] ?? null}
              step={0.01}
              fieldKey={`plate-${row.id}-kSigmaB`}
              onChange={(value) => set({ plateKSigma: { ...form.plateKSigma, [row.id]: value } })}
            />
          ))
        : null}
      {deformation.kind === "sigma_cr" ? (
        <NumberField
          label="σ_cr,cs in bending"
          unit="N/mm²"
          value={form.sigmaCr}
          step={10}
          fieldKey="sigmaCrBending"
          onChange={(sigmaCr) => set({ sigmaCr })}
        />
      ) : null}
      {deformation.kind === "chs" ? (
        <p className="muted">{renderSymbols("The tube formula B.11 holds for compression and bending, so a circular hollow section needs no k_σ here.")}</p>
      ) : null}
    </>
  );
}
