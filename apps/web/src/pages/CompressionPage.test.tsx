import { QueryClient, QueryClientProvider, type UseQueryResult } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import type { CompressionResponse } from "../api/types";
import type { MissingItem, ScopeCheck } from "../lib/inputs";
import b15 from "../test/fixtures/compression_b15.json";
import b16 from "../test/fixtures/compression.json";
import { installMockApi } from "../test/mockApi";
import { CompressionPage } from "./CompressionPage";
import { HelpPage } from "./HelpPage";

const plotly = vi.hoisted(() => ({ react: vi.fn(() => Promise.resolve()), purge: vi.fn() }));
vi.mock("plotly.js-dist-min", () => ({ default: plotly }));

beforeEach(() => {
  installMockApi();
  plotly.react.mockClear();
});

// Both fixtures were recorded from POST /api/v1/compression (grade 1.4307, E 200000, one plate k_σ 4,
// Ω 15, ν 0.3, A 1000, γM0 1.1): a plate 100 x 5 gives Formula B.16, a plate 250 x 3 gives B.15.
const stocky = b16 as unknown as CompressionResponse;
const slender = b15 as unknown as CompressionResponse;

function fake(
  data: CompressionResponse | undefined,
  error?: ApiError,
): UseQueryResult<CompressionResponse, ApiError> {
  return {
    data,
    isError: error !== undefined,
    error: error ?? null,
    isFetching: false,
  } as unknown as UseQueryResult<CompressionResponse, ApiError>;
}

const within16: ScopeCheck = { state: "within", slenderness: 0.34, upper: 1.6, symbol: "λ_p,cs" };

function renderPage({
  data = stocky,
  scope = within16,
  waiting = [],
  error,
  onGo = () => undefined,
}: {
  data?: CompressionResponse;
  scope?: ScopeCheck;
  waiting?: MissingItem[];
  error?: ApiError;
  onGo?: (item: MissingItem) => void;
} = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CompressionPage
        waiting={waiting}
        materialProblem={false}
        scope={scope}
        onGo={onGo}
        onOpenMaterial={() => undefined}
        query={fake(error ? undefined : data, error)}
        dark={false}
      />
    </QueryClientProvider>,
  );
}

const card = (title: RegExp) => {
  const found = [...document.querySelectorAll(".metric")].find((el) =>
    title.test(el.querySelector(".metric-title")?.textContent ?? ""),
  );
  if (!found) throw new Error(`no result card ${title}`);
  return found as HTMLElement;
};

describe("Formula B.16 (stocky section)", () => {
  it("shows the strain ratio, f_csm and N_csm,Rd in kN", () => {
    renderPage();
    expect(card(/εcsm \/ εy/)).toHaveTextContent(String(Number(stocky.strain_ratio.toPrecision(5))));
    expect(card(/fcsm/)).toHaveTextContent("246.65");
    expect(card(/Ncsm,Rd/)).toHaveTextContent("224.2");
    expect(card(/Ncsm,Rd/)).toHaveTextContent("Formula B.16");
  });

  it("says which formula applied and why", () => {
    renderPage();
    expect(screen.getByText(/Formula B\.16 applies because/)).toHaveTextContent(
      /at least 1\.0.*Formula B\.17.*A fcsm/,
    );
  });

  it("draws both charts from the engine's figures", () => {
    renderPage();
    expect(plotly.react).toHaveBeenCalledTimes(2);
    const drawn = plotly.react.mock.calls as unknown as [unknown, { name?: string }[]][];
    const names = drawn.flatMap(([, data]) => data.map((trace) => trace.name));
    expect(names).toContain("Your section");
    expect(names.some((n) => n?.includes("B.15"))).toBe(true);
    expect(names.some((n) => n?.includes("B.16"))).toBe(true);
    expect(names).toContain("CSM bilinear (B.4)");
    expect(screen.getByRole("img", { name: /Compression resistance against relative slenderness/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /compression point at the strain limit/ })).toBeInTheDocument();
  });

  it("has the working, with the B.5 steps before the B.6.2 steps, and the symbols panel", async () => {
    renderPage();
    const user = userEvent.setup();
    await user.click(screen.getByText(/Show working: B\.5 and B\.6\.2/));
    const chips = [...document.querySelectorAll(".working .chip")].map((el) => el.textContent);
    expect(chips.indexOf("B.5.2")).toBeLessThan(chips.indexOf("B.5.1"));
    expect(chips.indexOf("B.5.1")).toBeLessThan(chips.indexOf("B.6.2"));
    expect(chips).not.toContain("B.4");
    expect(chips.filter((chip) => chip === "B.6.2")).toHaveLength(3);
    expect(screen.getByText("Symbols used on this page")).toBeInTheDocument();
  });

  it("has no inputs of its own and no verdict, utilisation or classic comparison", () => {
    renderPage();
    const main = screen.getByRole("region", { name: "Compression results" });
    expect(within(main).queryAllByRole("spinbutton")).toEqual([]);
    expect(main.textContent).not.toMatch(/PASS|FAIL|utilisation|classic|\bgain\b|N_Ed/i);
  });
});

describe("Formula B.15 (slender section)", () => {
  it("says B.17 is not used and shows no f_csm number", () => {
    renderPage({ data: slender, scope: { ...within16, slenderness: 1.42 } });
    expect(card(/fcsm/)).toHaveTextContent("B.17 not used");
    expect(card(/Ncsm,Rd/)).toHaveTextContent("Formula B.15");
    expect(card(/Ncsm,Rd/)).toHaveTextContent("111.");
    expect(screen.getByText(/Formula B\.15 applies because/)).toHaveTextContent(
      /below 1\.0.*Formula B\.17 is not used/,
    );
  });
});

describe("not applicable and waiting", () => {
  it("beyond the B.5 limit: says so with the clause and the slenderness, and shows no resistance", () => {
    renderPage({ scope: { state: "beyond", slenderness: 0.72, upper: 0.6, symbol: "λ_c,cs" } });
    expect(screen.getByRole("alert")).toHaveTextContent(
      /B\.6\.2 does not apply.*beyond the B\.5 slenderness limit.*λc,cs = 0\.72 > 0\.6/,
    );
    expect(document.querySelector(".metric")).not.toBeInTheDocument();
    expect(plotly.react).not.toHaveBeenCalled();
  });

  it("missing inputs are links into the dock, and nothing is calculated", async () => {
    const onGo = vi.fn();
    const items: MissingItem[] = [
      { label: "the area A", group: "section", field: "area" },
      { label: "γM0", group: "section", field: "gammaM0" },
    ];
    renderPage({ waiting: items, onGo });
    expect(screen.getByRole("status")).toHaveTextContent(/Waiting for:.*the area A.*γM0/);
    expect(document.querySelector(".metric")).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "γM0" }));
    expect(onGo).toHaveBeenCalledWith(items[1]);
  });

  it("an engine refusal is shown as the engine's own message", () => {
    renderPage({ error: new ApiError("The cross-section is too slender for the CSM.", "NotApplicableError") });
    expect(screen.getByRole("alert")).toHaveTextContent("too slender for the CSM");
    expect(document.querySelector(".metric")).not.toBeInTheDocument();
  });
});

describe("Help", () => {
  it("has a compression module with its sketch in the Modules topic", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <HelpPage />
      </QueryClientProvider>,
    );
    await userEvent.setup().click(screen.getByRole("radio", { name: "Modules" }));
    expect(screen.getByRole("heading", { name: /4 · Compression \(B\.6\.2\)/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /A member in compression and the compression resistance/ })).toBeInTheDocument();
  });
});
