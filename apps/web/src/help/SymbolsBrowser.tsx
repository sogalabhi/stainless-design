import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";
import type { SymbolOut } from "../api/types";
import { Latex } from "../components/Latex";
import { renderSymbols } from "../components/Symbols";
import { DIAGRAMS } from "./diagrams";

const TOPIC_LABELS: Record<string, string> = {
  material: "Material",
  tension: "Tension",
  deformation: "Deformation",
  compression: "Compression",
};

function matches(entry: SymbolOut, needle: string): boolean {
  if (!needle) return true;
  const haystack = `${entry.symbol} ${entry.name} ${entry.meaning} ${entry.detail}`.toLowerCase();
  return haystack.includes(needle.toLowerCase());
}

/** A symbol card draws its sketch only while open, so a long list stays light. */
function SymbolCard({ entry }: { entry: SymbolOut }) {
  const [open, setOpen] = useState(false);
  const Diagram = entry.diagram ? DIAGRAMS[entry.diagram] : undefined;
  return (
    <details className="symbol-card" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        <span className="symbol-glyph">
          <Latex tex={entry.latex} display={false} />
        </span>
        <span className="symbol-name">{entry.name}</span>
        <span className="symbol-unit">{entry.unit === "-" ? "no unit" : entry.unit}</span>
      </summary>
      <div className="symbol-body">
        <p className="lead">{renderSymbols(entry.meaning)}</p>
        <p>{renderSymbols(entry.detail)}</p>
        <p className="muted">
          Clause: {entry.clause}. Shown on:{" "}
          {entry.topics.map((topic) => TOPIC_LABELS[topic] ?? topic).join(", ")}.
        </p>
        {open && Diagram ? <Diagram /> : null}
      </div>
    </details>
  );
}

export function SymbolsBrowser() {
  const query = useQuery({ queryKey: ["symbols", "all"], queryFn: () => api.symbols(), staleTime: Infinity });
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("");
  const all = query.data ?? [];
  const groups = [...new Set(all.map((entry) => entry.group))];
  const shown = all.filter((entry) => (!group || entry.group === group) && matches(entry, search));

  return (
    <div className="help-stack">
      <section className="help-card" aria-labelledby="sym-title">
        <h2 id="sym-title">Every symbol, explained</h2>
        <p className="lead">
          Open a symbol to see what it means, where it comes from and why it matters. Most have a
          sketch.
        </p>
        <div className="symbol-filters">
          <div className="field">
            <label htmlFor="sym-search">Search symbols</label>
            <input
              id="sym-search"
              type="search"
              value={search}
              placeholder="for example buckling, yield or ε_y"
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="sym-group">Group</label>
            <select id="sym-group" value={group} onChange={(event) => setGroup(event.target.value)}>
              <option value="">All groups</option>
              {groups.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {query.isError ? <p className="muted">The symbol list could not be loaded.</p> : null}
        {query.isSuccess ? (
          <p className="muted" aria-live="polite">
            {shown.length} of {all.length} symbols
          </p>
        ) : null}
        {groups
          .filter((name) => shown.some((entry) => entry.group === name))
          .map((name) => (
            <div key={name} className="symbol-group">
              <h3>{name}</h3>
              {shown
                .filter((entry) => entry.group === name)
                .map((entry) => (
                  <SymbolCard key={entry.symbol} entry={entry} />
                ))}
            </div>
          ))}
      </section>
    </div>
  );
}
