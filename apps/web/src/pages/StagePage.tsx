import { Suspense, lazy, useMemo, useState, type ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ApiError } from "../api/client";
import type { BendingAxisKey, ComparisonResponse, ModelValuesOut } from "../api/types";
import { SourceBadge } from "../components/Working";
import { MaterialProblem } from "../components/MaterialProblem";
import { renderSymbols } from "../components/Symbols";
import { CaseSwitch } from "../components/stage/CaseSwitch";
import { StageDrawing } from "../components/stage/StageDrawing";
import { Headline, ResultBar } from "../components/stage/Headline";
import { Legend, Readout, Scrubber } from "../components/stage/StageControls";
import { StepCards } from "../components/stage/StepCards";
import { WhatIf } from "../components/stage/WhatIf";
import { Collapsible, Segmented, StatusBox } from "../components/ui";
import { Waiting } from "../components/Waiting";
import type { BendingDirection } from "../lib/bending";
import type { DeformationFormState } from "../lib/geometry";
import { formatFixed, formatNumber } from "../lib/format";
import type { MissingItem, ScopeCheck, TabStatus } from "../lib/inputs";
import { STAGE_CASES, mirrorFrame, whatIfFrames, type StageCase, type StageView } from "../lib/stage";
import { flatWidths, litRole, plateByLabel, stageSection } from "../lib/stageSection";
import { NOT_APPLICABLE_ERROR, NOT_BUILT_YET_ERROR } from "./BendingPage";

const Stage3D = lazy(() => import("../components/stage/Stage3D"));

type Mode = "drawing" | "3d";

/** What one load case hands the stage: its status, what it waits for, its view once the engine answered. */
export type StageCaseInput = {
  status: TabStatus;
  waiting: MissingItem[];
  /** the engine's answer, arranged for the screen; null until there is one */
  view: StageView | null;
  /** a refusal, or a case not built yet: shown as the clause page shows it */
  notice: { kind: "info" | "error"; content: ReactNode } | null;
  calculating: boolean;
  /** the answer belongs to the dimensions on the drawing; false while a newer request is on its way */
  fresh: boolean;
  /** the engine's B.5 base curve for this load case's stress pattern, once it has answered */
  baseFigure: Record<string, unknown> | null;
};

type Notice = StageCaseInput["notice"];

/**
 * What a load case says when the engine did not give a result: a refusal, a section beyond the B.5
 * limit (B.2), or a case not built yet. The words are those of the clause pages.
 */
export function caseNotice(
  key: StageCase,
  query: { isError: boolean; error: ApiError | null },
  scope: ScopeCheck,
): Notice {
  const beyond =
    scope.state === "beyond"
      ? `${scope.symbol} = ${formatNumber(scope.slenderness)} > ${formatNumber(scope.upper)}`
      : "";
  if (key !== "bending" && scope.state === "beyond") {
    return {
      kind: "error",
      content: renderSymbols(
        key === "compression"
          ? `B.6.2 does not apply: the section is beyond the B.5 slenderness limit (${beyond}), so there is no strain limit ε_csm and no CSM compression resistance.`
          : `B.2: the section is beyond the B.5 limit (${beyond}), so Annex B does not apply and there is no CSM tension resistance.`,
      ),
    };
  }
  if (!query.isError || query.error === null) return null;
  if (key === "bending" && query.error.errorType === NOT_BUILT_YET_ERROR) {
    return {
      kind: "info",
      content: (
        <>
          <strong>Not built yet.</strong> {renderSymbols(query.error.message)}
        </>
      ),
    };
  }
  if (key === "bending" && query.error.errorType === NOT_APPLICABLE_ERROR) {
    return { kind: "error", content: renderSymbols(query.error.message) };
  }
  return { kind: "error", content: query.error.message };
}

export function StagePage({
  cases,
  selected,
  onSelect,
  materialProblem,
  onGo,
  onOpenMaterial,
  form,
  axis,
  direction = "sagging",
  values,
  sweep,
  dark,
}: {
  cases: Record<StageCase, StageCaseInput>;
  selected: StageCase;
  onSelect: (key: StageCase) => void;
  materialProblem: boolean;
  onGo: (item: MissingItem) => void;
  onOpenMaterial: () => void;
  form: DeformationFormState;
  axis: BendingAxisKey | null;
  /** sagging (compression at the top) or hogging (compression at the bottom), for the bending case */
  direction?: BendingDirection;
  /** the B.4 values of the material (E_sh and its share of E), for the second card */
  values: ModelValuesOut | null;
  /** the engine's thickness sweep (compression what-if); null while it is not asked for */
  sweep: UseQueryResult<ComparisonResponse, ApiError> | null;
  dark: boolean;
}) {
  const input = cases[selected];
  const ready = input.waiting.length === 0 && !materialProblem;
  const view = ready ? input.view : null;
  const status = Object.fromEntries(STAGE_CASES.map((key) => [key, cases[key].status])) as Record<StageCase, TabStatus>;
  return (
    <section className="results stage-page" aria-label="Section Stage" aria-busy={input.calculating}>
      <h2>Section Stage</h2>
      <CaseSwitch status={status} selected={selected} onSelect={onSelect} />
      <Waiting items={input.waiting} onGo={onGo} />
      {materialProblem ? <MaterialProblem onOpenMaterial={onOpenMaterial} /> : null}
      {ready && input.notice ? <StatusBox kind={input.notice.kind}>{input.notice.content}</StatusBox> : null}
      {ready && !view && !input.notice ? <p className="muted">Calculating...</p> : null}
      {!ready && !materialProblem && input.waiting.length > 0 ? (
        <p className="muted stage-empty">
          The stage appears here once the inputs are given. Click Load example in the dock to see a worked section,
          or type your own.
        </p>
      ) : null}
      {view && !input.notice ? <Loaded view={view} input={input} form={form} axis={axis} direction={direction} values={values} sweep={sweep} dark={dark} /> : null}
    </section>
  );
}

function Loaded({
  view,
  input,
  form,
  axis,
  direction,
  values,
  sweep,
  dark,
}: {
  view: StageView;
  input: StageCaseInput;
  form: DeformationFormState;
  axis: BendingAxisKey | null;
  direction: BendingDirection;
  values: ModelValuesOut | null;
  sweep: UseQueryResult<ComparisonResponse, ApiError> | null;
  dark: boolean;
}) {
  const hogging = view.key === "bending" && direction === "hogging";
  // the thickness what-if (compression): a point of the engine's sweep, or null for the user's section
  const [pick, setPick] = useState<number | null>(null);
  const points = view.key === "compression" ? (sweep?.data?.points ?? []) : [];
  const yours = points.findIndex((point) => point.factor === 1);
  const picked = pick !== null && pick !== yours && points[pick] ? points[pick] : null;
  const whatIfPoint = picked;
  const beyond = picked !== null && picked.strain_ratio === null;
  const effective = picked && !beyond ? whatIfFrames(view.frames, picked) : null;
  const shown: StageView = effective ? { ...view, frames: effective } : view;
  const frames = shown.frames.frames;
  const last = frames.length - 1;
  const key = `${view.key}:${frames.length}:${shown.ratio}:${picked?.factor ?? "yours"}`;
  const [state, setState] = useState<{ key: string; index: number | null }>({ key: "", index: null });
  const [playing, setPlaying] = useState(false);
  const [mode, setMode] = useState<Mode>("drawing");
  const index = state.key === key && state.index !== null ? Math.min(state.index, last) : last;
  const setIndex = (next: number) => setState({ key, index: next });
  const frame = frames[index];
  const fy = view.frames.yield_stress;
  // hogging is the sagging picture turned over: compression at the bottom, the member curving the other way
  const drawnFrame = hogging ? mirrorFrame(frame) : frame;

  const factor = picked ? picked.factor : 1;
  const section = useMemo(() => stageSection(form, view.key, axis, factor, hogging), [form, view.key, axis, factor, hogging]);
  const lit = !input.fresh
    ? null
    : picked
      ? litRole(plateByLabel(view.plates, picked.governing_label))
      : view.governing
        ? litRole(view.governing)
        : view.governingLabel === "circular hollow section"
          ? "tube"
          : null;
  // the flat widths c are the engine's for the user's section; the sweep returns none
  const cValues = input.fresh && !picked ? flatWidths(view.plates) : null;
  // one scale for the panels, so a what-if is compared with the user's section on the same axes
  const yourFrames = view.frames.frames;
  const stressTop = Math.max(...yourFrames.map((f) => Math.abs(f.stress)), ...frames.map((f) => Math.abs(f.stress)));
  const limitRatio = Math.max(yourFrames[yourFrames.length - 1].ratio, frames[last].ratio);

  return (
    <>
      <div className="verdict">
        <Headline view={view} />
        <ResultBar view={view} live={frame.resistance !== null && index < last ? frame.resistance / 1e6 : null} />
        {view.notes.length > 0 ? (
          <Collapsible title={`${view.notes.length} ${view.notes.length === 1 ? "note" : "notes"} on what this result covers`}>
            <ul className="stage-notes">
              {view.notes.map((note) => (
                <li key={note}>{renderSymbols(note)}</li>
              ))}
            </ul>
          </Collapsible>
        ) : null}
      </div>

      <div className="stage-card">
        <div className="stage-head">
          <div>
            <h3>{picked ? "What if every thickness changed" : "The section at its strain limit"}</h3>
            <p className="muted">
              {view.uniform
                ? "Every fibre carries the same strain, so the stress block is a rectangle."
                : "Strain is a straight line through the depth. Stress follows the material curve at each fibre."}
            </p>
          </div>
          <Segmented
            label="View"
            value={mode}
            options={[
              { value: "drawing", label: "Drawing" },
              { value: "3d", label: "3D cut" },
            ]}
            onChange={setMode}
          />
        </div>
        {picked ? (
          <div className="banner" role="status">
            <span>
              {beyond
                ? `What-if: every thickness × ${formatFixed(picked.factor, 2)}. `
                : `What-if: every thickness × ${formatFixed(picked.factor, 2)}. The strain limit and the stress are the engine's sweep values; the resistance above is still your section's. `}
              {beyond ? "" : "The flat widths c are not returned for a what-if point, so none is printed."}
            </span>
            <button type="button" className="link-button" onClick={() => setPick(null)}>
              Back to your section
            </button>
          </div>
        ) : null}
        {beyond && picked ? (
          <div className="stage-beyond">
            <p>
              {renderSymbols(
                `${view.lambdaSymbol ?? "λ"} = ${formatFixed(picked.slenderness, 2)} is beyond ${formatFixed(view.strainLimit?.upper ?? 0, 2)}.`,
              )}
            </p>
            <p className="muted">Annex B does not apply (B.2), so there is no strain limit to draw. Move the thickness slider back, or return to your section.</p>
          </div>
        ) : mode === "drawing" || !section ? (
          <>
            {mode === "3d" && !section ? (
              <p className="stage-note muted">
                The 3D cut needs the section's dimensions or nodes and links: none were given (or a typed
                σ_cr,cs), so there is no member to draw. The drawing shows the strain and stress.
              </p>
            ) : null}
            <div className="stage-scroll">
              <StageDrawing
                view={shown}
                frame={drawnFrame}
                hogging={hogging}
                section={section}
                cValues={cValues}
                lit={lit}
                fy={fy}
                whatIf={picked ? picked.factor : null}
                limitRatio={limitRatio}
                stressTop={stressTop}
              />
            </div>
          </>
        ) : (
          <Suspense fallback={<p className="muted stage-note">Loading the 3D view...</p>}>
            <Stage3D view={shown} frame={drawnFrame} section={section} fy={fy} stressTop={stressTop} dark={dark} />
          </Suspense>
        )}
        <Scrubber
          frames={frames}
          index={index}
          onIndex={setIndex}
          capped={Boolean(view.strainLimit?.capped) && !picked}
          playing={playing}
          onPlaying={setPlaying}
          disabled={beyond}
        />
        {view.key === "compression" ? (
          <WhatIf sweep={sweep} yours={yours} value={pick ?? yours} onChange={(next) => { setPlaying(false); setPick(next); }} />
        ) : null}
        {beyond ? (
          <div className="readout">
            <div>
              <span className="readout-k">Outside the method</span>
              <span className="readout-s">Move the thickness slider back, or return to your section.</span>
            </div>
          </div>
        ) : (
          <Readout view={shown} frame={frame} hogging={hogging} halfDepth={section ? section.height / 2 : null} limit={frames[last].ratio} fy={fy} whatIf={picked !== null} />
        )}
        <Legend view={view} withPlate={lit !== null} />
        <div className="stage-source">
          <span className="muted">Where the frames come from:</span>
          <SourceBadge source={view.frames.source} />
        </div>
      </div>

      <StepCards view={view} baseFigure={input.baseFigure} values={values} dark={dark} whatIf={whatIfPoint} />
    </>
  );
}
