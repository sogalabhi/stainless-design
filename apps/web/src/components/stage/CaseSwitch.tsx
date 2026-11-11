import { ChevronsDownUp, MoveVertical, Spline } from "lucide-react";
import type { ComponentType } from "react";
import { STATUS_WORDS, type TabStatus } from "../../lib/inputs";
import { CASE_CLAUSES, CASE_NAMES, STAGE_CASES, type StageCase } from "../../lib/stage";
import { StatusIcon } from "../Waiting";

const GLYPHS: Record<StageCase, ComponentType<{ size?: number; "aria-hidden"?: boolean }>> = {
  tension: MoveVertical,
  compression: ChevronsDownUp,
  bending: Spline,
};

/**
 * Tension, Compression and Bending, each with its own status (done, waiting, not applicable, later):
 * the same statuses the clause tabs show. The pressed one is the load case on the stage.
 */
export function CaseSwitch({
  status,
  selected,
  onSelect,
}: {
  status: Record<StageCase, TabStatus>;
  selected: StageCase;
  onSelect: (key: StageCase) => void;
}) {
  return (
    <div className="case-switch" role="group" aria-label="Load case">
      {STAGE_CASES.map((key) => {
        const Glyph = GLYPHS[key];
        return (
          <button
            key={key}
            type="button"
            className="case-button"
            aria-pressed={selected === key}
            title={`${CASE_NAMES[key]} (${CASE_CLAUSES[key]}): ${STATUS_WORDS[status[key]]}`}
            onClick={() => onSelect(key)}
          >
            <Glyph size={26} aria-hidden={true} />
            <span className="case-text">
              <span className="case-name">{CASE_NAMES[key]}</span>
              <span className="case-clause">{CASE_CLAUSES[key]}</span>
            </span>
            <StatusIcon status={status[key]} />
          </button>
        );
      })}
    </div>
  );
}
