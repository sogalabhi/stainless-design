import type { UseQueryResult } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ApiError } from "../api/client";
import type { BendingAxisKey, SectionPropertiesResponse, SectionType } from "../api/types";
import { dimsOf, usesDimensions, type DeformationFormState } from "../lib/geometry";
import type { MissingItem } from "../lib/inputs";
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
import { helpPanelIsOpen } from "./FieldHelp";
import { DimensionFields, FabricationField } from "./InputFields";
import { GEOMETRY_LABEL, PropertiesTable } from "./PropertiesTable";
import { SectionSketch } from "./SectionSketch";
import { Waiting } from "./Waiting";
import { CheckField, StatusBox } from "./ui";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
  onClose: () => void;
}) {
  const [layers, setLayers] = useState<SketchLayers>(loadLayers);
  const [focused, setFocused] = useState<DimKey | null>(null);
  const [hovered, setHovered] = useState<DimKey | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  const toggle = (key: LayerKey, on: boolean) =>
    setLayers((previous) => {
      const next = { ...previous, [key]: on };
      saveLayers(next);
      return next;
    });

  // Focus moves in on opening and back to the opener on closing; Esc closes; Tab stays inside.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (helpPanelIsOpen()) return; // an open "?" panel takes the first Escape
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialog.current) return;
      const items = [...dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!dialog.current.contains(active)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      opener?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fields = usesDimensions(form) ? sectionFields(sectionType, form.fabrication) : [];
  const dims = dimsOf(form);
  const pick = (key: DimKey) =>
    dialog.current?.querySelector<HTMLElement>(`[data-field="${key}"] input`)?.focus();
  const go = (item: MissingItem) =>
    dialog.current
      ?.querySelector<HTMLElement>(`[data-field="${item.field}"] input, [data-field="${item.field}"] select`)
      ?.focus();
  const set = (patch: Partial<DeformationFormState>) => onFormChange({ ...form, ...patch });
  const data = query.data;

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="geometry-title"
        ref={dialog}
      >
        <div className="modal-head">
          <h2 id="geometry-title">Section geometry</h2>
          <button type="button" className="icon-button" onClick={onClose} ref={closeButton}>
            <X size={16} aria-hidden="true" /> Close
          </button>
        </div>
        <div className="modal-body">
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
            </section>
            <section aria-label="Properties from geometry">
              <h3>Properties (from geometry)</h3>
              <p className="muted">
                {GEOMETRY_LABEL}. Reference values only: nothing is used in a calculation until you click Use,
                which copies the value into its input field.
              </p>
              <Waiting items={missing} onGo={go} />
              {missing.length === 0 && query.isError ? (
                <StatusBox kind="error">{query.error.message}</StatusBox>
              ) : null}
              {missing.length === 0 && !query.isError && !data ? <p className="muted">Calculating...</p> : null}
              {missing.length === 0 && data && !query.isError ? (
                <PropertiesTable
                  data={data}
                  stale={stale}
                  currentValues={currentValues}
                  bendingAxis={bendingAxis}
                  onUse={onUse}
                />
              ) : null}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
