import { StatusBox } from "./ui";

/** Shown on a result tab when the material is complete but the Material step rejected it. */
export function MaterialProblem({ onOpenMaterial }: { onOpenMaterial: () => void }) {
  return (
    <StatusBox kind="error">
      <span>The material could not be calculated, so this step has nothing to build on. </span>
      <button type="button" className="link-button" onClick={onOpenMaterial}>
        See the Material tab
      </button>
      <span>.</span>
    </StatusBox>
  );
}
