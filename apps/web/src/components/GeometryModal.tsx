import type { UseQueryResult } from "@tanstack/react-query";
import { Table2 } from "lucide-react";
import { useRef, useState } from "react";
import type { ApiError } from "../api/client";
import type { BendingAxisKey, SectionPropertiesResponse, SectionType } from "../api/types";
import { dimsOf, usesDimensions, type DeformationFormState } from "../lib/geometry";
import type { MissingItem } from "../lib/inputs";
import { templateNodesAndLinks } from "../lib/templateTables";
import {
  LAYER_LABELS,
  LAYER_ORDER,
  loadLayers,
  saveLayers,
  type LayerKey,
  type SketchLayers,
} from "../lib/layers";
import {
  needsFabrication,
  sectionFields,
  type DimKey,
  type PlateRoleKey,
} from "../lib/sectionTemplates";
import { DimensionFields, FabricationField } from "./InputFields";
import { Modal } from "./Modal";
import { PropertiesSection } from "./PropertiesSection";
import { SectionSketch } from "./SectionSketch";
import { CheckField } from "./ui";

/**
 * The Section geometry window: the large to-scale drawing, the layers to show on it, the dimension
 * fields (the same form state as the dock, not a copy) and the properties the engine computed from
 * those dimensions. Esc or Close shuts it; focus stays inside while it is open and returns to the
 * button that opened it. At phone width it fills the screen.
 */
export function GeometryModal({
  sectionType,
  form,
  onFormChange,
  cValues,
  query,
  properties,
  stale,
  missing,
  currentValues,
  bendingAxis,
  onUse,
  onEditAsTables,
  onClose,
}: {
  sectionType: SectionType;
  form: DeformationFormState;
  onFormChange: (form: DeformationFormState) => void;
  /** the engine's flat widths c from the latest B.5 response, for the bands */
  cValues: Partial<Record<PlateRoleKey, number>> | null;
  query: UseQueryResult<SectionPropertiesResponse, ApiError>;
  /** the engine's properties for exactly the dimensions now typed, or null (none yet, or out of date) */
  properties: SectionPropertiesResponse | null;
  /** the dimensions changed and the engine has not answered yet */
  stale: boolean;
  /** what the properties still need */
  missing: MissingItem[];
  /** what the dock's input fields hold now (to mark a value as used) */
  currentValues: Record<string, number | null>;
  /** the axis of bending chosen in the Bending group, so the moduli of that axis get a Use button */
  bendingAxis: BendingAxisKey | null;
  onUse: (key: string, value: number) => void;
  /** turn this template into the nodes and links tables of a custom section, to edit there */
  onEditAsTables: () => void;
  onClose: () => void;
}) {
  const [layers, setLayers] = useState<SketchLayers>(loadLayers);
  const [focused, setFocused] = useState<DimKey | null>(null);
  const [hovered, setHovered] = useState<DimKey | null>(null);
  const dialog = useRef<HTMLDivElement>(null);

  const toggle = (key: LayerKey, on: boolean) =>
    setLayers((previous) => {
      const next = { ...previous, [key]: on };
      saveLayers(next);
      return next;
    });

  const canEditAsTables = form.kind === "template" && templateNodesAndLinks(sectionType, dimsOf(form), form.kSigma) !== null;
  const fields = usesDimensions(form) ? sectionFields(sectionType, form.fabrication) : [];
  const dims = dimsOf(form);
  const pick = (key: DimKey) =>
    dialog.current?.querySelector<HTMLElement>(`[data-field="${key}"] input`)?.focus();
  const go = (item: MissingItem) =>
    dialog.current
      ?.querySelector<HTMLElement>(`[data-field="${item.field}"] input, [data-field="${item.field}"] select`)
      ?.focus();
  const set = (patch: Partial<DeformationFormState>) => onFormChange({ ...form, ...patch });

  return (
    <Modal title="Section geometry" titleId="geometry-title" onClose={onClose} dialogRef={dialog}>
          <div className="modal-drawing">
            <SectionSketch
              shape={sectionType}
              fabrication={form.fabrication}
              dims={dims}
              highlight={hovered ?? focused}
              cValues={form.kind === "template" ? cValues : null}
              layers={layers}
              properties={properties}
              onHover={setHovered}
              onSelect={pick}
            />
          </div>
          <div className="modal-side">
            <fieldset className="layers">
              <legend>Show</legend>
              {LAYER_ORDER.filter((key) => key !== "principal" || sectionType === "angle").map((key) => (
                <CheckField key={key} label={LAYER_LABELS[key]} checked={layers[key]} onChange={(on) => toggle(key, on)} />
              ))}
              <p className="muted">
                Centroid, plastic neutral axis, shear centre and principal axes are drawn from the
                engine&apos;s values, to scale only.
              </p>
            </fieldset>
            <section aria-label="Dimensions">
              <h3>Dimensions</h3>
              <p className="muted">The same fields as the Section group of the dock.</p>
              {form.kind === "template" && needsFabrication(sectionType) ? (
                <FabricationField value={form.fabrication} onChange={(fabrication) => set({ fabrication })} />
              ) : null}
              <DimensionFields
                fields={fields}
                dims={dims}
                onChange={(key, value) => set({ [key]: value } as Partial<DeformationFormState>)}
                highlighted={hovered}
                onFocusKey={setFocused}
              />
              {canEditAsTables ? (
                <div className="edit-as-tables">
                  <button type="button" className="icon-button" onClick={onEditAsTables}>
                    <Table2 size={14} aria-hidden="true" /> Edit as nodes and links
                  </button>
                  <p className="muted">
                    Copies this section into the two tables of a custom section (paste to and from Excel), as centre
                    lines, so you can change a thickness, move a node or add a plate. Fillets, welds and corner radii
                    are dropped, so b̄ and A differ slightly from the template&apos;s.
                  </p>
                </div>
              ) : null}
            </section>
            <PropertiesSection
              query={query}
              stale={stale}
              missing={missing}
              onGo={go}
              currentValues={currentValues}
              bendingAxis={bendingAxis}
              onUse={onUse}
            />
          </div>
    </Modal>
  );
}
