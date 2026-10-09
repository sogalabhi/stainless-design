import { Check, CircleAlert } from "lucide-react";
import { GEOMETRY_LABEL, formatProperty } from "./PropertiesTable";

/** More than this fraction between the typed area and the geometry area earns a note. */
export const AREA_TOLERANCE = 0.005;

/**
 * Under the area field. "copied from geometry" while the field still holds the value Use put there;
 * and a note when the typed area differs from the area the engine computed from the dimensions by more
 * than 0.5 %. Nothing is ever copied without a click; the note only points at the difference.
 */
export function AreaNote({
  typed,
  copiedValue,
  geometryArea,
}: {
  typed: number | null;
  /** the value the Use button last copied, null if none or edited since */
  copiedValue: number | null;
  /** the engine's area for exactly the dimensions now typed, null if not available */
  geometryArea: number | null;
}) {
  const copied = copiedValue !== null && typed === copiedValue;
  const difference =
    geometryArea !== null && geometryArea > 0 && typed !== null
      ? Math.abs(typed - geometryArea) / geometryArea
      : null;
  const mismatch = difference !== null && difference > AREA_TOLERANCE;
  if (!copied && !mismatch) return null;
  return (
    <>
      {copied ? (
        <p className="field-note field-note-ok" role="status">
          <Check size={14} aria-hidden="true" /> copied from geometry
        </p>
      ) : null}
      {mismatch && geometryArea !== null && difference !== null ? (
        <p className="field-note field-note-warn" role="status">
          <CircleAlert size={14} aria-hidden="true" /> The area you typed differs from the geometry value,{" "}
          {formatProperty(Number(geometryArea.toPrecision(6)))} mm², by {(difference * 100).toFixed(1)} % ({GEOMETRY_LABEL}).
          The calculation uses the value in this field.
        </p>
      ) : null}
    </>
  );
}

/**
 * Under W_el and W_pl. "copied from geometry" while the field holds the value Use put there, and a
 * note when the typed modulus differs from the engine's value for the chosen axis by more than 0.5 %.
 * Nothing is copied without a click.
 */
export function ModulusNote({
  name,
  typed,
  copiedValue,
  geometryValue,
  axisLabel,
}: {
  name: string;
  typed: number | null;
  copiedValue: number | null;
  /** the engine's modulus about the chosen axis for exactly the dimensions now typed, or null */
  geometryValue: number | null;
  /** for example "y-y" */
  axisLabel: string | null;
}) {
  const copied = copiedValue !== null && typed === copiedValue;
  const difference =
    geometryValue !== null && geometryValue > 0 && typed !== null
      ? Math.abs(typed - geometryValue) / geometryValue
      : null;
  const mismatch = difference !== null && difference > AREA_TOLERANCE;
  if (!copied && !mismatch) return null;
  return (
    <>
      {copied ? (
        <p className="field-note field-note-ok" role="status">
          <Check size={14} aria-hidden="true" /> copied from geometry
        </p>
      ) : null}
      {mismatch && geometryValue !== null && difference !== null ? (
        <p className="field-note field-note-warn" role="status">
          <CircleAlert size={14} aria-hidden="true" /> The {name} you typed differs from the geometry value
          about {axisLabel ?? "the chosen axis"}, {formatProperty(Number(geometryValue.toPrecision(6)))} mm³, by{" "}
          {((difference ?? 0) * 100).toFixed(1)} % ({GEOMETRY_LABEL}). The calculation uses the value in this field.
        </p>
      ) : null}
    </>
  );
}
