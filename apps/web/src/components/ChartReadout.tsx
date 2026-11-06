/** The parts under a chart: value tags, the pin card, linked-chart notes and "Show values". */
import { Download, X } from "lucide-react";
import { useState } from "react";
import {
  downloadText,
  heading,
  linkText,
  nearestComputedPoints,
  readoutCsv,
  withUnit,
  type HoverTags,
  type LinkMarker,
  type Pin,
  type PinValue,
  type Readout,
} from "../lib/chartReadout";
import { formatNumber } from "../lib/format";
import { renderSymbols } from "./Symbols";

function valueText(value: PinValue): string {
  return `${value.label} = ${withUnit(value.value, value.unit)}`;
}

/** The hovered x under the plot area and the hovered y at its left edge, with a y guide. */
export function ValueTags({ tags }: { tags: HoverTags | null }) {
  if (!tags) return null;
  return (
    <div className="value-tags" aria-hidden="true">
      {tags.y ? (
        <>
          <div className="value-guide" style={{ top: tags.y.top, left: tags.y.left, width: tags.y.width }} />
          <div className="value-tag value-tag-y" style={{ top: tags.y.top, left: tags.y.left }}>
            {tags.y.text}
          </div>
        </>
      ) : null}
      {tags.x ? (
        <div className="value-tag value-tag-x" style={{ top: tags.x.top, left: tags.x.left }}>
          {tags.x.text}
        </div>
      ) : null}
    </div>
  );
}

/** The values at a clicked point: the x, then each series there with its unit and source. */
export function PinCard({ pin, title, onClear }: { pin: Pin; title: string; onClear: () => void }) {
  return (
    <section className="pin-card" aria-label={`Pinned values on ${title}`}>
      <div className="pin-card-head">
        <strong>Pinned: {renderSymbols(valueText(pin.x))}</strong>
        <button type="button" className="icon-button" onClick={onClear}>
          <X size={14} aria-hidden="true" /> Clear
        </button>
      </div>
      <ul className="plain pin-rows">
        {pin.rows.map((row) => (
          <li key={`${row.series}-${row.value.label}`}>
            <span className="pin-series">{renderSymbols(row.series)}</span>
            {": "}
            <strong>{renderSymbols(valueText(row.value))}</strong>
            {row.at ? <span className="muted"> at {renderSymbols(valueText(row.at))}</span> : null}
            <span className="pin-source muted"> ({renderSymbols(row.source)})</span>
          </li>
        ))}
      </ul>
      <p className="muted pin-hint">Double-click the chart or press Clear to remove the pin.</p>
    </section>
  );
}

/**
 * What another chart's pin means here: its value, and on each computed curve of this chart the
 * nearest point the server computed (not an interpolation).
 */
export function LinkNotes({
  markers,
  figure,
  onClear,
}: {
  markers: LinkMarker[];
  figure: Record<string, unknown>;
  onClear: (chart: string) => void;
}) {
  if (markers.length === 0) return null;
  return (
    <div className="link-notes">
      {markers.map((marker) => {
        const nearest = nearestComputedPoints(figure, marker);
        return (
          <div key={`${marker.axis}-${marker.quantity}`} className="link-note">
            <div className="pin-card-head">
              <span>Linked: {renderSymbols(linkText(marker.pinned, false))}</span>
              <button type="button" className="icon-button" onClick={() => onClear(marker.pinned.chart)}>
                <X size={14} aria-hidden="true" /> Clear pin
              </button>
            </div>
            {nearest.length > 0 ? (
              <ul className="plain pin-rows">
                {nearest.map((point) => (
                  <li key={point.series}>
                    Nearest computed point on {renderSymbols(point.series)}:{" "}
                    <strong>
                      {renderSymbols(valueText(point.x))}, {renderSymbols(valueText(point.y))}
                    </strong>
                    <span className="pin-source muted"> ({renderSymbols(point.source)})</span>
                    {point.outside ? <span className="muted"> (the pinned value is outside this curve)</span> : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** A collapsed table per series, and the whole figure as one CSV file. */
export function ChartValues({ readout, fileName }: { readout: Readout; fileName: string }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="chart-values" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>Show values</summary>
      <div className="chart-values-body">
        <button
          type="button"
          className="icon-button"
          onClick={() => downloadText(`${fileName}.csv`, readoutCsv(readout))}
        >
          <Download size={14} aria-hidden="true" /> Download CSV
        </button>
        {/* built when opened: some series have a few hundred rows */}
        {open
          ? readout.tables.map((table, index) => (
              <div key={`${table.title}-${index}`} className="chart-table">
                <table>
                  <caption>
                    <strong>{renderSymbols(table.title)}</strong>
                    <span className="muted">
                      {" "}
                      {table.source_kind}: {renderSymbols(table.source)}
                    </span>
                  </caption>
                  <thead>
                    <tr>
                      {table.columns.map((column) => (
                        <th key={heading(column)} scope="col">
                          {renderSymbols(heading(column))}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {row.map((value, cell) => (
                          <td key={cell}>{formatNumber(value)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          : null}
      </div>
    </details>
  );
}
