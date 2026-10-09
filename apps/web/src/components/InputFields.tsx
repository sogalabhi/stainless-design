import { Plus, Ruler, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import type { FamilyKey, GradeOut, SectionType, StainlessFamily } from "../api/types";
import { CIRCULAR, dimsOf, usesDimensions, type DeformationFormState, type PlateRow } from "../lib/geometry";
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
import { CheckField, NumberField, SelectField } from "./ui";

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

/**
 * The Section group: the section type, how it is made, a "Section geometry" button with a small
 * thumbnail (the big drawing, layers and properties are in the window it opens), the dimensions,
 * then the area, γM0 and holes. The dimension fields are the same state as the window's.
 */
export function SectionInputs({
  sectionType,
  onSectionType,
  tension,
  onTensionChange,
  form,
  onFormChange,
  onOpenGeometry,
  areaNote,
}: {
  sectionType: SectionType | null;
  onSectionType: (type: SectionType) => void;
  tension: TensionFormState;
  onTensionChange: (form: TensionFormState) => void;
  form: DeformationFormState;
  onFormChange: (form: DeformationFormState) => void;
  onOpenGeometry: () => void;
  /** what to say under the area field: where its value came from, and whether it matches the geometry */
  areaNote: ReactNode;
}) {
  const set = (patch: Partial<DeformationFormState>) => onFormChange({ ...form, ...patch });
  const showDimensions = sectionType !== null && usesDimensions(form);
  const fields = showDimensions ? sectionFields(sectionType, form.fabrication) : [];
  const dims = dimsOf(form);
  return (
    <div>
      <SelectField
        label="Section type"
        value={sectionType}
        options={SECTION_TYPES}
        placeholder="choose the section type"
        fieldKey="sectionType"
        onChange={onSectionType}
      />
      {sectionType !== null && form.kind === "template" && needsFabrication(sectionType) ? (
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
      {sectionType !== null && !showDimensions ? (
        <p className="muted">
          {form.kind === "plates"
            ? "The flat plates are entered one by one in the Deformation group, so no section dimensions are asked for here."
            : "A typed σ_cr,cs needs no section dimensions."}
        </p>
      ) : null}
      <DimensionFields
        fields={fields}
        dims={dims}
        onChange={(key, value) => set({ [key]: value } as Partial<DeformationFormState>)}
      />
      <NumberField
        label="Area A"
        unit="mm²"
        value={tension.area}
        step={100}
        fieldKey="area"
        onChange={(area) => onTensionChange({ ...tension, area })}
        note={areaNote}
      />
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
                { value: "template", label: "Section dimensions (8.2.2(5))" },
                { value: "plates", label: "Flat plates entered one by one" },
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
      {form.kind === "plates" ? <PlatesEditor form={form} onChange={onChange} /> : null}
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

function PlatesEditor({
  form,
  onChange,
}: {
  form: DeformationFormState;
  onChange: (form: DeformationFormState) => void;
}) {
  const update = (id: number, patch: Partial<PlateRow>) =>
    onChange({ ...form, plates: form.plates.map((row) => (row.id === id ? { ...row, ...patch } : row)) });
  const add = () => {
    const id = Math.max(0, ...form.plates.map((row) => row.id)) + 1;
    onChange({
      ...form,
      plates: [...form.plates, { id, label: `plate ${id}`, width: null, thickness: null, kSigma: null }],
    });
  };
  return (
    <div className="plates-editor">
      {form.plates.map((row) => (
        <fieldset key={row.id} className="plate-row">
          <legend>{row.label || "plate"}</legend>
          <div className="field">
            <label htmlFor={`plate-label-${row.id}`}>Name</label>
            <input
              id={`plate-label-${row.id}`}
              type="text"
              value={row.label}
              onChange={(event) => update(row.id, { label: event.target.value })}
            />
          </div>
          <NumberField
            label="Flat width b̄"
            unit="mm"
            value={row.width}
            fieldKey={`plate-${row.id}-width`}
            onChange={(width) => update(row.id, { width })}
          />
          <NumberField
            label="Thickness t"
            unit="mm"
            value={row.thickness}
            fieldKey={`plate-${row.id}-thickness`}
            onChange={(thickness) => update(row.id, { thickness })}
          />
          <NumberField
            label="k_σ"
            value={row.kSigma}
            step={0.01}
            fieldKey={`plate-${row.id}-kSigma`}
            onChange={(kSigma) => update(row.id, { kSigma })}
          />
          <button
            type="button"
            className="icon-button"
            disabled={form.plates.length <= 1}
            onClick={() => onChange({ ...form, plates: form.plates.filter((item) => item.id !== row.id) })}
          >
            <Trash2 size={16} aria-hidden="true" /> Remove plate
          </button>
        </fieldset>
      ))}
      <button type="button" className="icon-button" onClick={add} disabled={form.plates.length >= 20}>
        <Plus size={16} aria-hidden="true" /> Add plate
      </button>
    </div>
  );
}
