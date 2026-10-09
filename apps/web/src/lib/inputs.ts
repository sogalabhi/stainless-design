/** The groups of the input dock, in the order they appear. */
export type GroupKey = "material" | "section" | "deformation";

export const GROUP_TITLES: Record<GroupKey, string> = {
  material: "Material",
  section: "Section",
  deformation: "Deformation capacity (B.5)",
};

/** An input the user has not given yet, and where to find it in the dock. */
export type MissingItem = {
  label: string; // as shown to the user, symbols written as in the glossary (f_y, γM0)
  group: GroupKey;
  field: string; // the data-field key of the input, so a link can focus it
};

/** What a result tab shows beside its name. */
export type TabStatus = "done" | "waiting" | "not_applicable" | "error";

export const STATUS_WORDS: Record<TabStatus, string> = {
  done: "done",
  waiting: "waiting for inputs",
  not_applicable: "not applicable",
  error: "needs attention",
};

/** The empty required fields in each group (shown in the group header). */
export function countByGroup(items: MissingItem[]): Record<GroupKey, number> {
  const counts: Record<GroupKey, number> = { material: 0, section: 0, deformation: 0 };
  for (const item of items) counts[item.group] += 1;
  return counts;
}

/** The same item once, even when two tabs both ask for it. */
export function uniqueItems(items: MissingItem[]): MissingItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.group}/${item.field}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * B.2: Annex B applies only within the B.5 cross-section slenderness limits. Tension (B.12 to B.14)
 * never uses slenderness, so its result stands on its own; this says whether B.5 has been checked
 * for the same section, using the engine's B.5 result (nothing is re-derived here).
 */
export type ScopeCheck =
  | { state: "waiting"; items: MissingItem[] }
  | { state: "within" | "beyond"; slenderness: number; upper: number; symbol: string }
  | { state: "unchecked"; reason: string };
