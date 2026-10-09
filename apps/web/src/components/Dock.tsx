import { ChevronDown, ChevronRight, CircleAlert, CircleCheck, FlaskConical, Trash2, X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { EXAMPLE_SOURCES } from "../lib/example";
import type { GradeOut, SectionType } from "../api/types";
import type { DeformationFormState } from "../lib/geometry";
import { GROUP_TITLES, countByGroup, type GroupKey, type MissingItem } from "../lib/inputs";
import type { MaterialFormState } from "../lib/material";
import type { TensionFormState } from "../lib/tension";
import { helpPanelIsOpen } from "./FieldHelp";
import { DeformationInputs, MaterialInputs, SectionInputs } from "./InputFields";

/** Ask the dock to open a group and put the cursor in one of its fields. `nonce` makes a repeat request count. */
export type FocusRequest = { field: string; nonce: number };

export type DockProps = {
  materialForm: MaterialFormState;
  onMaterialChange: (form: MaterialFormState) => void;
  grades: GradeOut[];
  sectionType: SectionType | null;
  onSectionType: (type: SectionType) => void;
  tensionForm: TensionFormState;
  onTensionChange: (form: TensionFormState) => void;
  deformationForm: DeformationFormState;
  onDeformationChange: (form: DeformationFormState) => void;
  /** Opens the section geometry window (the big drawing, the layers and the properties). */
  onOpenGeometry: () => void;
  /** Under the area field: where its value came from, and whether it matches the geometry. */
  areaNote: ReactNode;
  /** Every required input still empty, over all groups (the dock counts them per group). */
  missing: MissingItem[];
  openGroup: GroupKey | null;
  onOpenGroup: (group: GroupKey | null) => void;
  focusRequest: FocusRequest | null;
  /** Phone width: the dock is a drawer, and this says whether it is out. */
  drawerOpen: boolean;
  onCloseDrawer: () => void;
  /** True while the worked example is loaded (the banner shows until Clear all). */
  exampleLoaded: boolean;
  /** The example needs the Table 5.1 grades, so the button waits until they have arrived. */
  canLoadExample: boolean;
  onLoadExample: () => void;
  onClearAll: () => void;
};

const ORDER: GroupKey[] = ["material", "section", "deformation"];

export function Dock(props: DockProps) {
  const { missing, openGroup, onOpenGroup, focusRequest, drawerOpen, onCloseDrawer } = props;
  const counts = countByGroup(missing);

  // Escape puts the drawer away (phone width).
  useEffect(() => {
    if (!drawerOpen) return;
    // an open "?" panel takes the first Escape
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && !helpPanelIsOpen() && onCloseDrawer();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen, onCloseDrawer]);

  // After a "Waiting for" link opened a group, put the cursor in the field it named.
  useEffect(() => {
    if (!focusRequest) return;
    const target = document.querySelector<HTMLElement>(
      `.dock [data-field="${focusRequest.field}"] input, .dock [data-field="${focusRequest.field}"] select`,
    );
    target?.focus();
    target?.scrollIntoView?.({ block: "center" });
  }, [focusRequest]);

  const body: Record<GroupKey, ReactNode> = {
    material: (
      <MaterialInputs form={props.materialForm} onChange={props.onMaterialChange} grades={props.grades} />
    ),
    section: (
      <SectionInputs
        sectionType={props.sectionType}
        onSectionType={props.onSectionType}
        tension={props.tensionForm}
        onTensionChange={props.onTensionChange}
        form={props.deformationForm}
        onFormChange={props.onDeformationChange}
        onOpenGeometry={props.onOpenGeometry}
        areaNote={props.areaNote}
      />
    ),
    deformation: (
      <DeformationInputs
        form={props.deformationForm}
        onChange={props.onDeformationChange}
        sectionType={props.sectionType}
      />
    ),
  };

  return (
    <>
      {drawerOpen ? <div className="dock-backdrop" onClick={onCloseDrawer} aria-hidden="true" /> : null}
      <aside className={`dock${drawerOpen ? " open" : ""}`} aria-label="Inputs" id="input-dock">
        <div className="dock-head">
          <h2>Inputs</h2>
          <div className="dock-actions">
            <button
              type="button"
              className="icon-button"
              disabled={!props.canLoadExample}
              onClick={props.onLoadExample}
            >
              <FlaskConical size={16} aria-hidden="true" /> Load example
            </button>
            <button type="button" className="icon-button dock-close" onClick={onCloseDrawer}>
              <X size={16} aria-hidden="true" /> Close
            </button>
          </div>
        </div>
        {props.exampleLoaded ? (
          <div className="example-banner" role="status">
            <div className="example-banner-row">
              <span>Example values loaded: replace them with your own.</span>
              <button type="button" className="icon-button" onClick={props.onClearAll}>
                <Trash2 size={16} aria-hidden="true" /> Clear all
              </button>
            </div>
            <details className="example-sources">
              <summary>Where these example values come from</summary>
              <ul>
                {EXAMPLE_SOURCES.map((source) => (
                  <li key={source}>{source}</li>
                ))}
              </ul>
            </details>
          </div>
        ) : null}
        <p className="muted dock-note">
          Every value starts empty. Results appear as soon as what they need is given.
        </p>
        {ORDER.map((group) => {
          const open = openGroup === group;
          const empty = counts[group];
          const Chevron = open ? ChevronDown : ChevronRight;
          return (
            <section key={group} className="dock-group">
              <h3>
                <button
                  type="button"
                  className="dock-group-button"
                  aria-expanded={open}
                  aria-controls={`dock-${group}`}
                  onClick={() => onOpenGroup(open ? null : group)}
                >
                  <Chevron size={16} aria-hidden="true" />
                  <span className="dock-group-title">{GROUP_TITLES[group]}</span>
                  {empty === 0 ? (
                    <span className="dock-count dock-count-ok">
                      <CircleCheck size={14} aria-hidden="true" /> complete
                    </span>
                  ) : (
                    <span className="dock-count dock-count-empty">
                      <CircleAlert size={14} aria-hidden="true" /> {empty} to enter
                    </span>
                  )}
                </button>
              </h3>
              {open ? (
                <div className="dock-group-body" id={`dock-${group}`}>
                  {body[group]}
                </div>
              ) : null}
            </section>
          );
        })}
      </aside>
    </>
  );
}
