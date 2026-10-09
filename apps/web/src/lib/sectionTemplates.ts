import type { SectionType } from "../api/types";

/**
 * Static facts about the six section templates (8.2.2(5), Tables 7.2 to 7.4): which dimensions each
 * shape asks for, which plates B.5 gets from it, and a drawing-feasibility check. Text and keys
 * only. Nothing here computes an engineering value: the flat width c of each plate is derived by the
 * engine (the API), and the formulas below are shown as text.
 */

export type Fabrication = "rolled" | "welded";
export type PlateRoleKey = "web" | "flange" | "stem" | "leg";
export type DimKey = "h" | "b" | "tw" | "tf" | "t" | "d" | "r" | "s" | "cStem" | "rO";

/** The typed dimensions, null while empty. */
export type SketchDims = Record<DimKey, number | null>;

export const EMPTY_DIMS: SketchDims = {
  h: null,
  b: null,
  tw: null,
  tf: null,
  t: null,
  d: null,
  r: null,
  s: null,
  cStem: null,
  rO: null,
};

export const I_SECTION: SectionType = "I-section";
export const CHANNEL: SectionType = "channel";
export const T_SECTION: SectionType = "T-section";
export const ANGLE: SectionType = "angle";
export const RHS: SectionType = "rectangular hollow section";
export const CHS: SectionType = "circular hollow section";

/** I-sections, channels and T-sections are rolled (root radius r) or welded (weld leg s). */
export function needsFabrication(type: SectionType | null): boolean {
  return type === I_SECTION || type === CHANNEL || type === T_SECTION;
}

export type DimField = {
  key: DimKey;
  /** the symbol as written in the working, for the drawing */
  symbol: string;
  label: string;
  unit: "mm";
  /** how the "Waiting for" link names it */
  missingLabel: string;
  /** a hint under the field */
  hint?: string;
  /** true when B.5 and B.6.2 do not need it: only the section properties and the drawing do */
  forPropertiesOnly?: boolean;
};

const FIELD: Record<DimKey, Omit<DimField, "key">> = {
  h: { symbol: "h", label: "Overall height h", unit: "mm", missingLabel: "the height h" },
  b: { symbol: "b", label: "Overall width b", unit: "mm", missingLabel: "the width b" },
  tw: { symbol: "t_w", label: "Web thickness t_w", unit: "mm", missingLabel: "the web thickness t_w" },
  tf: { symbol: "t_f", label: "Flange thickness t_f", unit: "mm", missingLabel: "the flange thickness t_f" },
  t: { symbol: "t", label: "Wall thickness t", unit: "mm", missingLabel: "the thickness t" },
  d: { symbol: "d", label: "Outer diameter d", unit: "mm", missingLabel: "the diameter d" },
  r: { symbol: "r", label: "Root radius r", unit: "mm", missingLabel: "the root radius r" },
  s: { symbol: "s", label: "Weld leg s", unit: "mm", missingLabel: "the weld leg s" },
  cStem: { symbol: "c_stem", label: "Stem flat width c_stem", unit: "mm", missingLabel: "the stem flat width c_stem" },
  rO: {
    symbol: "r_o",
    label: "Outer corner radius r_o",
    unit: "mm",
    missingLabel: "the outer corner radius r_o",
    hint: "0 for sharp corners. The inner radius is taken as the larger of r_o − t and 0. It does not change c = h − 3t (8.2.2(5)).",
    forPropertiesOnly: true,
  },
};

function fields(...keys: DimKey[]): DimField[] {
  return keys.map((key) => ({ key, ...FIELD[key] }));
}

/** The dimension fields of a shape, in the order they are asked. */
export function dimensionFields(type: SectionType | null, fabrication: Fabrication | null): DimField[] {
  if (type === null) return [];
  const corner: DimKey[] = fabrication === "welded" ? ["s"] : fabrication === "rolled" ? ["r"] : [];
  switch (type) {
    case I_SECTION:
    case CHANNEL:
      return fields("h", "b", "tw", "tf", ...corner);
    case T_SECTION:
      return fields("h", "b", "tw", "tf", ...corner, "cStem");
    case ANGLE:
      return [
        { key: "h", ...FIELD.h, label: "Longer leg h", missingLabel: "the longer leg h" },
        { key: "b", ...FIELD.b, label: "Shorter leg b", missingLabel: "the shorter leg b" },
        ...fields("t").map((f) => ({ ...f, label: "Leg thickness t" })),
      ];
    case RHS:
      return fields("h", "b", "t");
    case CHS:
      return fields("d", "t");
    default:
      return [];
  }
}

/**
 * Inputs that only the section properties and the drawing use, never B.5 or B.6.2: the outer corner
 * radius r_o of a rectangular hollow section and the root radius r of an angle. They are empty until
 * typed (0 means sharp) and they never change c (8.2.2(5) fixes c = h − 3t and b̄ = h).
 */
export function propertyOnlyFields(type: SectionType | null): DimField[] {
  if (type === RHS) return fields("rO");
  if (type === ANGLE) {
    return [
      {
        key: "r",
        ...FIELD.r,
        label: "Root radius r",
        hint: "0 for a sharp corner. It does not change b̄ = h (8.2.2(5)).",
        forPropertiesOnly: true,
      },
    ];
  }
  return [];
}

/** Every field the Section group and the geometry window ask for: the B.5 dimensions, then those two. */
export function sectionFields(type: SectionType | null, fabrication: Fabrication | null): DimField[] {
  return [...dimensionFields(type, fabrication), ...propertyOnlyFields(type)];
}

/**
 * What the section properties need: the dimensions the shape is made of, with the two radii, but not
 * the T-section's typed stem width (c_stem is a plate width for B.9, not part of the outline).
 */
export function propertyFields(type: SectionType | null, fabrication: Fabrication | null): DimField[] {
  return sectionFields(type, fabrication).filter((field) => field.key !== "cStem");
}

export type PlateRoleInfo = {
  role: PlateRoleKey;
  name: string;
  kind: "internal" | "outstand";
  /** the flat-width rule as text, for the Deformation group (the engine derives the number) */
  formula: string;
};

/** The plates B.5 receives from a shape, with the c rule written out as text. */
export function plateRoles(type: SectionType | null, fabrication: Fabrication | null): PlateRoleInfo[] {
  const k = fabrication === "welded" ? "s" : fabrication === "rolled" ? "r" : "r or s";
  switch (type) {
    case I_SECTION:
      return [
        { role: "web", name: "Web", kind: "internal", formula: `c = h − 2t_f − 2${k}` },
        { role: "flange", name: "Flange outstand", kind: "outstand", formula: `c = (b − t_w − 2${k}) / 2` },
      ];
    case CHANNEL:
      return [
        { role: "web", name: "Web", kind: "internal", formula: `c = h − 2t_f − 2${k}` },
        { role: "flange", name: "Flange outstand", kind: "outstand", formula: `c = b − t_w − ${k}` },
      ];
    case T_SECTION:
      return [
        { role: "flange", name: "Flange outstand", kind: "outstand", formula: `c = (b − t_w − 2${k}) / 2` },
        { role: "stem", name: "Stem outstand", kind: "outstand", formula: "c_stem, typed in the Section group" },
      ];
    case ANGLE:
      return [{ role: "leg", name: "Leg (the longer one)", kind: "outstand", formula: "b̄ = h (8.2.2(5))" }];
    case RHS:
      return [
        { role: "web", name: "Web", kind: "internal", formula: "c = h − 3t (8.2.2(5))" },
        { role: "flange", name: "Flange", kind: "internal", formula: "c = b − 3t (8.2.2(5))" },
      ];
    default:
      return [];
  }
}

export type Feasibility = {
  /** every dimension the shape needs has been typed */
  complete: boolean;
  /** why the typed dimensions cannot make this shape, naming the dimensions; null when they can */
  message: string | null;
};

/**
 * Drawing-feasibility only: positive numbers and the obvious orderings (2t_f < h and so on). The
 * engine repeats these checks, adds the flat-width ones (c > 0), and is the authority.
 */
export function feasibility(
  type: SectionType | null,
  fabrication: Fabrication | null,
  dims: SketchDims,
): Feasibility {
  const main = mainFeasibility(type, fabrication, dims);
  if (!drawable(main)) return main;
  return radiusMessage(type, dims) ?? main;
}

/** The two properties-only radii, when typed: not negative and not larger than the shape allows. */
function radiusMessage(type: SectionType | null, dims: SketchDims): Feasibility | null {
  const bad = (message: string): Feasibility => ({ complete: true, message });
  if (type === RHS && dims.rO !== null) {
    if (dims.rO < 0) return bad("r_o must be zero or more.");
    if (dims.h !== null && dims.b !== null && dims.rO > Math.min(dims.h, dims.b) / 2) {
      return bad("r_o is more than half the smaller of h and b.");
    }
  }
  if (type === ANGLE && dims.r !== null) {
    if (dims.r < 0) return bad("r must be zero or more.");
    if (dims.b !== null && dims.t !== null && dims.r > dims.b - dims.t) {
      return bad("r is more than the free length of the shorter leg, b − t.");
    }
  }
  return null;
}

function mainFeasibility(
  type: SectionType | null,
  fabrication: Fabrication | null,
  dims: SketchDims,
): Feasibility {
  if (type === null) return { complete: false, message: null };
  if (needsFabrication(type) && fabrication === null) return { complete: false, message: null };
  const required = dimensionFields(type, fabrication).map((f) => f.key);
  if (required.some((key) => dims[key] === null)) return { complete: false, message: null };
  const v = (key: DimKey) => dims[key] as number;
  const nonPositive = required.filter((key) => (key === "r" || key === "s" ? v(key) < 0 : v(key) <= 0));
  if (nonPositive.length > 0) {
    const names = nonPositive.map((key) => FIELD[key].symbol).join(", ");
    return { complete: true, message: `${names}: every dimension must be a positive number (r and s may be zero).` };
  }
  const bad = (message: string): Feasibility => ({ complete: true, message });
  switch (type) {
    case I_SECTION:
    case CHANNEL:
      if (2 * v("tf") >= v("h")) return bad("2t_f is not less than h: the two flanges fill the whole height.");
      if (v("tw") >= v("b")) return bad("t_w is not less than b: the web is as wide as the flange.");
      return { complete: true, message: null };
    case T_SECTION:
      if (v("tf") >= v("h")) return bad("t_f is not less than h: the flange fills the whole height.");
      if (v("tw") >= v("b")) return bad("t_w is not less than b: the stem is as wide as the flange.");
      if (v("cStem") >= v("h")) return bad("c_stem is not less than h: the stem is deeper than the section.");
      return { complete: true, message: null };
    case ANGLE:
      if (v("b") > v("h")) return bad("h is the longer leg, but b is longer than h. Swap them.");
      if (v("t") >= v("b")) return bad("t is not less than b: the leg is thicker than it is wide.");
      return { complete: true, message: null };
    case RHS:
      if (2 * v("t") >= Math.min(v("h"), v("b"))) {
        return bad("2t is not less than the smaller of h and b: the walls fill the section.");
      }
      return { complete: true, message: null };
    case CHS:
      if (2 * v("t") >= v("d")) return bad("2t is not less than d: the wall is thicker than half the diameter.");
      return { complete: true, message: null };
    default:
      return { complete: true, message: null };
  }
}

/** The sketch is drawn to scale only when every dimension is given and the shape can exist. */
export function drawable(f: Feasibility): boolean {
  return f.complete && f.message === null;
}
