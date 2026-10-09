import { Check, CornerDownLeft } from "lucide-react";
import type { PropertyRowOut, SectionPropertiesResponse } from "../api/types";
import { renderSymbols } from "./Symbols";

/** Said wherever these numbers appear. They are geometry, not a rule of the standard. */
export const GEOMETRY_LABEL = "computed from your dimensions: geometry, not a rule of EN 1993-1-4";

/** The rows that have an input field to copy into. Today only A; W_el, W_pl and the neutral-axis inputs follow with their phases. */
export const USABLE: Record<string, { field: string; fieldName: string }> = {
  A: { field: "area", fieldName: "Area A" },
};

/** An engine value as shown: six significant figures at most, thousands grouped with a space. */
export function formatProperty(value: number): string {
  if (value === 0) return "0";
  return value.toLocaleString("en-US", { maximumSignificantDigits: 6 }).replace(/,/g, " ");
}

function groupRows(rows: PropertyRowOut[]): [string, PropertyRowOut[]][] {
  const groups = new Map<string, PropertyRowOut[]>();
  for (const row of rows) groups.set(row.group, [...(groups.get(row.group) ?? []), row]);
  return [...groups.entries()];
}

/**
 * The properties the engine returned, each with its unit and note, grouped as the engine groups them.
 * The browser only shows them; a Use button copies one into its input field, and only on a click.
 */
export function PropertiesTable({
  data,
  stale,
  currentValues,
  onUse,
}: {
  data: SectionPropertiesResponse;
  /** true while the dimensions have changed and the engine has not answered yet */
  stale: boolean;
  /** what the input fields hold now, by field name, to say which value has been used */
  currentValues: Record<string, number | null>;
  onUse: (key: string, value: number) => void;
}) {
  return (
    <div className={`properties${stale ? " properties-stale" : ""}`} aria-busy={stale}>
      {groupRows(data.rows).map(([group, rows]) => (
        <div className="table-wrap" key={group}>
          <h4>{renderSymbols(group)}</h4>
          <table>
            <thead>
              <tr>
                <th scope="col">Symbol</th>
                <th scope="col">Property</th>
                <th scope="col">Value</th>
                <th scope="col">Use</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const usable = USABLE[row.key];
                const used = usable !== undefined && currentValues[usable.field] === row.value;
                return (
                  <tr key={row.key} data-property={row.key}>
                    <td>{renderSymbols(row.symbol)}</td>
                    <td>
                      {row.name}
                      {row.note ? <div className="muted property-note">{renderSymbols(row.note)}</div> : null}
                    </td>
                    <td className="property-value">
                      <span data-value>{formatProperty(row.value)}</span> <span className="unit">{row.unit}</span>
                    </td>
                    <td>
                      {usable ? (
                        <button
                          type="button"
                          className="icon-button"
                          disabled={stale}
                          aria-label={`Use ${row.symbol} in the ${usable.fieldName} field`}
                          onClick={() => onUse(row.key, row.value)}
                        >
                          {used ? <Check size={14} aria-hidden="true" /> : <CornerDownLeft size={14} aria-hidden="true" />} Use
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
      <p className="muted">{data.notes.join(" ")}</p>
    </div>
  );
}
