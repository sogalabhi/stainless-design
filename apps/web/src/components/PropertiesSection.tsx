import type { UseQueryResult } from "@tanstack/react-query";
import type { ApiError } from "../api/client";
import type { BendingAxisKey, SectionPropertiesResponse } from "../api/types";
import type { MissingItem } from "../lib/inputs";
import { GEOMETRY_LABEL, PropertiesTable } from "./PropertiesTable";
import { Waiting } from "./Waiting";
import { StatusBox } from "./ui";

/**
 * The "Properties (from geometry)" part of both section windows: what is still missing, the engine's
 * error if it refused, or the table. The area A goes into every calculation by itself; W_el and W_pl
 * are copied into the Bending group only by a click on Use.
 */
export function PropertiesSection({
  query,
  stale,
  missing,
  onGo,
  currentValues,
  bendingAxis,
  onUse,
}: {
  query: UseQueryResult<SectionPropertiesResponse, ApiError>;
  stale: boolean;
  missing: MissingItem[];
  onGo: (item: MissingItem) => void;
  currentValues: Record<string, number | null>;
  bendingAxis: BendingAxisKey | null;
  onUse: (key: string, value: number) => void;
}) {
  const data = query.data;
  return (
    <section aria-label="Properties from geometry">
      <h3>Properties (from geometry)</h3>
      <p className="muted">
        {GEOMETRY_LABEL}. The area A goes into the calculations by itself; W_el and W_pl are used only when
        you click Use, which copies the value into the Bending group.
      </p>
      <Waiting items={missing} onGo={onGo} />
      {missing.length === 0 && query.isError ? <StatusBox kind="error">{query.error.message}</StatusBox> : null}
      {missing.length === 0 && !query.isError && !data ? <p className="muted">Calculating...</p> : null}
      {missing.length === 0 && data && !query.isError ? (
        <PropertiesTable
          data={data}
          stale={stale}
          currentValues={currentValues}
          bendingAxis={bendingAxis}
          onUse={onUse}
        />
      ) : null}
    </section>
  );
}
