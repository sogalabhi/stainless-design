import type { SectionType } from "../api/types";
import { ANGLE, CHANNEL, I_SECTION, RHS, T_SECTION, type PlateRoleKey, type SketchDims } from "./sectionTemplates";

/**
 * Where each plate of a section template stands in the 3D scene. This is drawing layout from the
 * typed dimensions (web and flanges in place, extruded along y): no engineering value comes out of
 * it. Fillets and weld triangles are left out. The section's height h runs along z and its width b
 * along x.
 */
export type PlacedPlate = {
  role: PlateRoleKey;
  /** the direction the plate's width runs in the section plane */
  along: "x" | "z";
  cx: number;
  cz: number;
  width: number;
  thickness: number;
};

export type TemplateLayout = { plates: PlacedPlate[]; width: number; depth: number };

/** The plates of the assembled section, or null while a dimension is missing. */
export function templateLayout(shape: SectionType, d: SketchDims): TemplateLayout | null {
  const { h, b, tw, tf, t } = d;
  const flange = (width: number, thick: number, cz: number, role: PlateRoleKey = "flange"): PlacedPlate => ({
    role,
    along: "x",
    cx: 0,
    cz,
    width,
    thickness: thick,
  });
  const upright = (role: PlateRoleKey, width: number, thick: number, cx: number, cz: number): PlacedPlate => ({
    role,
    along: "z",
    cx,
    cz,
    width,
    thickness: thick,
  });
  if (h === null || b === null) return null;
  if (shape === I_SECTION || shape === CHANNEL || shape === T_SECTION) {
    if (tw === null || tf === null) return null;
    if (shape === T_SECTION) {
      return {
        width: b,
        depth: h,
        plates: [flange(b, tf, h / 2 - tf / 2), upright("stem", h - tf, tw, 0, -tf / 2)],
      };
    }
    const webX = shape === CHANNEL ? -b / 2 + tw / 2 : 0;
    return {
      width: b,
      depth: h,
      plates: [
        flange(b, tf, h / 2 - tf / 2),
        flange(b, tf, -h / 2 + tf / 2),
        upright("web", h - 2 * tf, tw, webX, 0),
      ],
    };
  }
  if (t === null) return null;
  if (shape === ANGLE) {
    return {
      width: b,
      depth: h,
      plates: [
        upright("leg", h, t, -b / 2 + t / 2, 0),
        { role: "leg", along: "x", cx: t / 2, cz: -h / 2 + t / 2, width: b - t, thickness: t },
      ],
    };
  }
  if (shape === RHS) {
    return {
      width: b,
      depth: h,
      plates: [
        flange(b, t, h / 2 - t / 2),
        flange(b, t, -h / 2 + t / 2),
        upright("web", h - 2 * t, t, b / 2 - t / 2, 0),
        upright("web", h - 2 * t, t, -b / 2 + t / 2, 0),
      ],
    };
  }
  return null;
}
