import type { MissingItem } from "./inputs";

/** Every number starts empty: nothing is assumed. The section type lives in the Section group of the dock. */
export type TensionFormState = {
  area: number | null; // mm2
  hasHoles: boolean;
  gammaM0: number | null;
};

export const defaultTensionForm: TensionFormState = {
  area: null,
  hasHoles: false,
  gammaM0: null,
};

export function missingTensionItems(form: TensionFormState): MissingItem[] {
  const missing: MissingItem[] = [];
  if (form.area === null) missing.push({ label: "the area A", group: "section", field: "area" });
  if (form.gammaM0 === null) missing.push({ label: "γM0", group: "section", field: "gammaM0" });
  return missing;
}

export function missingTension(form: TensionFormState): string[] {
  return missingTensionItems(form).map((item) => item.label);
}
