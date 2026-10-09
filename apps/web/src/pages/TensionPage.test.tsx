import { QueryClient, QueryClientProvider, type UseQueryResult } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiError } from "../api/client";
import type { TensionResponse } from "../api/types";
import type { MissingItem, ScopeCheck } from "../lib/inputs";
import tension from "../test/fixtures/tension.json";
import { installMockApi } from "../test/mockApi";
import { TensionPage } from "./TensionPage";

const plotly = vi.hoisted(() => ({ react: vi.fn(() => Promise.resolve()), purge: vi.fn() }));
vi.mock("plotly.js-dist-min", () => ({ default: plotly }));

beforeEach(() => installMockApi());

function fake(data: TensionResponse): UseQueryResult<TensionResponse, ApiError> {
  return { data, isError: false, error: null, isFetching: false } as unknown as UseQueryResult<
    TensionResponse,
    ApiError
  >;
}

function renderPage(scope: ScopeCheck, onGo: (item: MissingItem) => void = () => undefined) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TensionPage
        waiting={[]}
        materialProblem={false}
        scope={scope}
        onGo={onGo}
        onOpenMaterial={() => undefined}
        query={fake(response)}
        dark={false}
      />
    </QueryClientProvider>,
  );
}

// The recorded fixture predates the single `figure` field (fixtures are refreshed in phase 8).
const response = { ...tension, figure: { data: [], layout: {} } } as unknown as TensionResponse;

const resistance = () => document.querySelector(".metric");

describe("B.2 on the Tension tab", () => {
  it("within the B.5 limit: says so with the slenderness, and shows the resistance", () => {
    renderPage({ state: "within", slenderness: 0.45, upper: 1.6, symbol: "λ_p,cs" });
    expect(screen.getByText(/within the B\.5 limit/)).toHaveTextContent(/0\.45.*1\.6/);
    expect(resistance()).toBeInTheDocument();
  });

  it("beyond the B.5 limit: Annex B does not apply, so no resistance is shown", () => {
    renderPage({ state: "beyond", slenderness: 0.72, upper: 0.6, symbol: "λ_c,cs" });
    expect(screen.getByRole("alert")).toHaveTextContent(/beyond the B\.5 limit.*does not apply/);
    expect(resistance()).not.toBeInTheDocument();
  });

  it("B.5 inputs missing: the result stands, and the missing inputs are links into the dock", async () => {
    const onGo = vi.fn();
    const item: MissingItem = { label: "Ω", group: "deformation", field: "omega" };
    renderPage({ state: "waiting", items: [item] }, onGo);
    expect(screen.getByText(/not checked until B\.5 has its inputs/)).toBeInTheDocument();
    expect(resistance()).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Ω" }));
    expect(onGo).toHaveBeenCalledWith(item);
  });

  it("does not repeat the engine's 'not checked' note beside the B.2 line", () => {
    renderPage({ state: "within", slenderness: 0.45, upper: 1.6, symbol: "λ_p,cs" });
    expect(screen.queryByText(/only the area was given/)).not.toBeInTheDocument();
  });
});
