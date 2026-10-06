import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { Latex } from "./Latex";
import { renderSymbols } from "./Symbols";
import { Collapsible } from "./ui";

export type SymbolTopic = "material" | "tension" | "deformation";

/** One line per symbol used on the page: what it is, its unit and where it comes from. */
export function SymbolsPanel({ topic }: { topic: SymbolTopic }) {
  const query = useQuery({
    queryKey: ["symbols", topic],
    queryFn: () => api.symbols(topic),
    staleTime: Infinity,
  });
  const groups = new Map<string, NonNullable<typeof query.data>>();
  for (const entry of query.data ?? []) {
    groups.set(entry.group, [...(groups.get(entry.group) ?? []), entry]);
  }
  return (
    <Collapsible title="Symbols used on this page">
      <p className="muted">Longer explanations with sketches are in the Help tab.</p>
      {query.isError ? <p className="muted">The symbol list could not be loaded.</p> : null}
      {[...groups.entries()].map(([group, entries]) => (
        <div className="table-wrap symbols" key={group}>
          <h3>{group}</h3>
          <table>
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Meaning</th>
                <th>Unit</th>
                <th>Clause</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.symbol}>
                  <td>
                    <Latex tex={entry.latex} display={false} />
                  </td>
                  <td>
                    <strong>{entry.name}.</strong> {renderSymbols(entry.meaning)}
                  </td>
                  <td>{entry.unit}</td>
                  <td>{entry.clause}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </Collapsible>
  );
}
