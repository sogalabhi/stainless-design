import { BookCheck, CircleHelp, PencilLine } from "lucide-react";
import { createContext, type ReactNode, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { InputHelpOut } from "../api/types";
import { renderSymbols } from "./Symbols";

/** The marker on an open help panel, so Esc in a drawer or a window closes the panel first. */
export const HELP_PANEL_ATTRIBUTE = "data-help-panel";

/** True while a "?" panel is open anywhere: Esc then belongs to the panel, not to a drawer or window. */
export function helpPanelIsOpen(): boolean {
  return document.querySelector(`[${HELP_PANEL_ATTRIBUTE}]`) !== null;
}

/**
 * The key of the help entry for a dock field key. The plate fields carry the plate in their key
 * (`kSigma-web`, `plate-2-width`), so they are matched by suffix: one entry each for the flat width,
 * the thickness and k_σ. Every other field key is its own entry.
 */
export function helpKeyOf(fieldKey: string): string {
  if (fieldKey.startsWith("kSigma-")) return "kSigma";
  const plate = /^plate-\d+-(width|thickness|kSigma)$/.exec(fieldKey);
  if (plate) return plate[1] === "kSigma" ? "kSigma" : plate[1] === "width" ? "plateWidth" : "plateThickness";
  return fieldKey;
}

type HelpState = {
  entries: Record<string, InputHelpOut>;
  /** which "?" panel is open (the id of one field), or null: only one is open at a time */
  openId: string | null;
  setOpenId: (id: string | null) => void;
};

const HelpContext = createContext<HelpState | null>(null);

/**
 * Fetches the "?" help once and shares it with every field. If the fetch fails the entries stay empty,
 * so no button is drawn and the fields work exactly as before.
 */
export function InputHelpProvider({ children }: { children: ReactNode }) {
  const query = useQuery({ queryKey: ["input-help"], queryFn: api.inputHelp, staleTime: Infinity });
  const [openId, setOpenId] = useState<string | null>(null);
  const entries = useMemo(
    () => Object.fromEntries((query.data ?? []).map((entry) => [entry.key, entry])),
    [query.data],
  );
  const value = useMemo(() => ({ entries, openId, setOpenId }), [entries, openId]);
  return <HelpContext.Provider value={value}>{children}</HelpContext.Provider>;
}

/** The "?" button and its panel for one field; both are null when the field has no help entry. */
export function useFieldHelp(fieldKey: string | undefined, label: string): { button: ReactNode; panel: ReactNode } {
  const state = useContext(HelpContext);
  const id = useId();
  const panelId = `help-${id}`;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const entry = fieldKey && state ? state.entries[helpKeyOf(fieldKey)] : undefined;
  const open = entry !== undefined && state?.openId === id;
  const setOpenId = state?.setOpenId;

  // Esc closes the panel and gives the focus back to its button.
  useEffect(() => {
    if (!open || !setOpenId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpenId(null);
      buttonRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, setOpenId]);

  if (!entry || !state) return { button: null, panel: null };
  const button = (
    <button
      ref={buttonRef}
      type="button"
      className="help-button"
      aria-label={`What is ${label}?`}
      aria-expanded={open}
      aria-controls={open ? panelId : undefined}
      aria-describedby={open ? panelId : undefined}
      data-help-for={helpKeyOf(fieldKey!)}
      onClick={() => state.setOpenId(open ? null : id)}
    >
      <CircleHelp size={16} aria-hidden="true" />
    </button>
  );
  return { button, panel: open ? <HelpPanel id={panelId} entry={entry} /> : null };
}

/** Four short parts: what it is, why it is needed, where to get it, and whether the standard has it. */
function HelpPanel({ id, entry }: { id: string; entry: InputHelpOut }) {
  const SourceIcon = entry.in_standard ? BookCheck : PencilLine;
  return (
    <div className="help-panel" id={id} role="note" {...{ [HELP_PANEL_ATTRIBUTE]: entry.key }}>
      <dl>
        <dt>What it is</dt>
        <dd>{renderSymbols(entry.what)}</dd>
        <dt>Why it is needed</dt>
        <dd>{renderSymbols(entry.why)}</dd>
        <dt>Where to get it</dt>
        <dd>{renderSymbols(entry.where)}</dd>
      </dl>
      <p className={`help-source ${entry.in_standard ? "help-source-in" : "help-source-out"}`}>
        <SourceIcon size={14} aria-hidden="true" /> {entry.source}
      </p>
    </div>
  );
}
