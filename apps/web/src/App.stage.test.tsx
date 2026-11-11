import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { installMockApi, requests } from "./test/mockApi";

const plotly = vi.hoisted(() => ({ react: vi.fn(() => Promise.resolve()), purge: vi.fn() }));
vi.mock("plotly.js-dist-min", () => ({ default: plotly }));
vi.mock("./components/SectionScene", () => ({ default: () => <div aria-label="3D scene" /> }));
vi.mock("./components/stage/Stage3D", () => ({ default: () => <div aria-label="3D cut scene" /> }));

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  installMockApi();
  window.localStorage.clear();
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
});

const dock = () => screen.getByRole("complementary", { name: "Inputs" });
const caseButton = (name: RegExp) => within(screen.getByRole("group", { name: "Load case" })).getByRole("button", { name });
const sweepCalls = () => requests.filter((r) => r.path.endsWith("/section-comparison"));

async function loadExample(user: ReturnType<typeof userEvent.setup>) {
  const button = within(dock()).getByRole("button", { name: /Load example/ });
  await waitFor(() => expect(button).toBeEnabled());
  await user.click(button);
}

describe("the Stage tab", () => {
  it("is the first tab, selected at the start, with a status icon", () => {
    renderApp();
    const tabs = screen.getAllByRole("tab");
    expect(tabs[0]).toHaveTextContent(/^Stage/);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[0]).toHaveTextContent(/waiting for inputs/);
    // the clause tabs are all still there
    expect(tabs.map((t) => t.textContent)).toEqual([
      expect.stringContaining("Stage"),
      expect.stringContaining("Material (B.4)"),
      expect.stringContaining("Deformation (B.5)"),
      expect.stringContaining("Tension (B.6.1)"),
      expect.stringContaining("Compression (B.6.2)"),
      expect.stringContaining("Bending (B.6.3)"),
      expect.stringContaining("Explore"),
      expect.stringContaining("Help"),
    ]);
  });

  it("is empty before Load example: the case switch, Waiting links and no result", () => {
    renderApp();
    expect(screen.getByRole("region", { name: "Section Stage" })).toBeInTheDocument();
    expect(screen.getByText(/Waiting for:/)).toBeInTheDocument();
    expect(document.querySelector(".headline-value")).toBeNull();
    expect(caseButton(/Tension/)).toHaveAttribute("aria-pressed", "true");
  });

  it("Load example fills the stage from the engine, with the first case that is done chosen", async () => {
    const user = userEvent.setup();
    renderApp();
    await loadExample(user);
    await waitFor(() => expect(document.querySelector(".headline-value")).not.toBeNull());
    expect(caseButton(/Tension/)).toHaveAttribute("aria-pressed", "true");
    expect(document.querySelector(".headline-value")).toHaveTextContent("233.1");
    await user.click(caseButton(/Bending/));
    await waitFor(() => expect(document.querySelector(".headline-value")).toHaveTextContent("50.30"));
    expect(screen.getByRole("tab", { name: /^Stage/ })).toHaveAttribute("aria-selected", "true");
  });

  it("asks the engine for the thickness sweep only while the Stage shows compression", async () => {
    const user = userEvent.setup();
    renderApp();
    await loadExample(user);
    await waitFor(() => expect(document.querySelector(".headline-value")).not.toBeNull());
    expect(sweepCalls()).toHaveLength(0);
    await user.click(caseButton(/Compression/));
    await waitFor(() => expect(sweepCalls().length).toBeGreaterThan(0));
    expect(await screen.findByLabelText(/What if every thickness changed/)).toBeInTheDocument();
  });

  it("keeps the clause tabs working", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole("tab", { name: /Material \(B\.4\)/ }));
    expect(screen.getByRole("tab", { name: /Material \(B\.4\)/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("region", { name: "Section Stage" })).toBeNull();
  });
});
