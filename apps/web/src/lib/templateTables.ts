import type { SectionType } from "../api/types";
import type { LinkRow, NodeRow } from "./geometry";
import type { PlateRoleKey, SketchDims } from "./sectionTemplates";

/**
 * A template as the nodes and links of the custom section, so it can be edited in the tables (change a
 * thickness, move a node, add a stiffener). It is the centre-line model of the template: each plate is
 * a link along its centre line, so the lengths b̄ and the area differ a little from the template's
 * clear flat widths c and gross area (no fillets, welds or corner radii). The k_σ already typed for a
 * plate role are carried over to the links of that role; nothing else is filled in.
 */
export function templateNodesAndLinks(
  type: SectionType | null,
  dims: SketchDims,
  kSigma: Record<PlateRoleKey, number | null>,
): { nodes: NodeRow[]; links: LinkRow[] } | null {
  const { h, b, tw, tf, t } = dims;
  const points: [number, number][] = [];
  // [from, to, name, thickness, role] with 1-based node numbers
  const plates: [number, number, string, number, PlateRoleKey | null][] = [];
  const positive = (...values: (number | null)[]) => values.every((v) => v !== null && v > 0);

  switch (type) {
    case "I-section":
      if (!positive(h, b, tw, tf) || h! <= 2 * tf!) return null;
      points.push([0, tf! / 2], [b! / 2, tf! / 2], [b!, tf! / 2], [0, h! - tf! / 2], [b! / 2, h! - tf! / 2], [b!, h! - tf! / 2]);
      plates.push(
        [1, 2, "bottom flange, left", tf!, "flange"],
        [3, 2, "bottom flange, right", tf!, "flange"],
        [2, 5, "web", tw!, "web"],
        [4, 5, "top flange, left", tf!, "flange"],
        [6, 5, "top flange, right", tf!, "flange"],
      );
      break;
    case "channel":
      if (!positive(h, b, tw, tf) || h! <= 2 * tf!) return null;
      points.push([b!, tf! / 2], [tw! / 2, tf! / 2], [tw! / 2, h! - tf! / 2], [b!, h! - tf! / 2]);
      plates.push(
        [1, 2, "bottom flange", tf!, "flange"],
        [2, 3, "web", tw!, "web"],
        [4, 3, "top flange", tf!, "flange"],
      );
      break;
    case "T-section":
      if (!positive(h, b, tw, tf) || h! <= tf!) return null;
      points.push([0, h! - tf! / 2], [b! / 2, h! - tf! / 2], [b!, h! - tf! / 2], [b! / 2, 0]);
      plates.push(
        [1, 2, "flange, left", tf!, "flange"],
        [3, 2, "flange, right", tf!, "flange"],
        [4, 2, "stem", tw!, "stem"],
      );
      break;
    case "angle":
      if (!positive(h, b, t)) return null;
      points.push([t! / 2, h!], [t! / 2, t! / 2], [b!, t! / 2]);
      plates.push([1, 2, "longer leg", t!, "leg"], [2, 3, "shorter leg", t!, null]);
      break;
    case "rectangular hollow section":
      if (!positive(h, b, t) || h! <= 2 * t! || b! <= 2 * t!) return null;
      points.push([t! / 2, t! / 2], [b! - t! / 2, t! / 2], [b! - t! / 2, h! - t! / 2], [t! / 2, h! - t! / 2]);
      plates.push(
        [1, 2, "bottom flange", t!, "flange"],
        [2, 3, "right web", t!, "web"],
        [3, 4, "top flange", t!, "flange"],
        [4, 1, "left web", t!, "web"],
      );
      break;
    default:
      return null;
  }
  const round = (v: number) => Math.round(v * 1000) / 1000;
  const nodes: NodeRow[] = points.map(([x, y], index) => ({ uid: index + 1, id: index + 1, x: round(x), y: round(y) }));
  const links: LinkRow[] = plates.map(([from, to, label, thickness, role], index) => ({
    uid: index + 1,
    label,
    from,
    to,
    thickness,
    kSigma: role ? kSigma[role] : null,
  }));
  return { nodes, links };
}
