import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { installMockApi, requests } from "./test/mockApi";

const plotly = vi.hoisted(() => ({ react: vi.fn(() => Promise.resolve()), purge: vi.fn() }));
vi.mock("plotly.js-dist-min", () => ({ default: plotly }));

type User = ReturnType<typeof userEvent.setup>;

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
  plotly.react.mockClear();
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
});

const dock = () => screen.getByRole("complementary", { name: "Inputs" });
const group = (name: RegExp) => within(dock()).getByRole("button", { name });
const calls = (path: string) => requests.filter((r) => r.path.endsWith(path));

async function typeTemplateI(user: User) {
  await user.click(group(/^Section/));
  await user.selectOptions(within(dock()).getByLabelText(/^Section type/), "I-section");
  await user.selectOptions(within(dock()).getByLabelText(/^Fabrication/), "rolled");
  for (const [label, value] of [
    [/^Overall height h/, "200"],
    [/^Overall width b/, "100"],
    [/^Web thickness/, "5.6"],
    [/^Flange thickness/, "8.5"],
    [/^Root radius r/, "12"],
  ] as const) {
    await user.type(within(dock()).getByLabelText(label), value);
  }
}

describe("the custom section's window", () => {
  it("holds the two tables, not the dock; the dock has a button with a count", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(group(/^Section/));
    await user.selectOptions(within(dock()).getByLabelText(/^Geometry/), "custom");
    await user.selectOptions(within(dock()).getByLabelText(/^Section type/), "channel");
    const button = within(dock()).getByRole("button", { name: /Nodes and links/ });
    expect(within(dock()).queryByRole("table")).not.toBeInTheDocument();
    await user.click(button);
    const modal = screen.getByRole("dialog", { name: "Custom section: nodes and links" });
    expect(within(modal).getAllByRole("table")).toHaveLength(2);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it("asks nothing of the engine until the tables hold a link, and says what is missing", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(group(/^Section/));
    await user.selectOptions(within(dock()).getByLabelText(/^Geometry/), "custom");
    await user.selectOptions(within(dock()).getByLabelText(/^Section type/), "I-section");
    await user.click(within(dock()).getByRole("button", { name: /Nodes and links/ }));
    const modal = screen.getByRole("dialog");
    expect(calls("/section-properties/custom")).toHaveLength(0);
    expect(within(modal).getByText(/Waiting for/)).toBeInTheDocument();
  });

  it("the area in the dock is the engine's, for the nodes and links (load the example)", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(await screen.findByRole("button", { name: /Load example/ }));
    await user.click(group(/^Section/));
    await waitFor(() => expect(within(dock()).getByLabelText(/^Area A/)).toHaveTextContent("3 140"));
    expect(calls("/section-properties/custom").length).toBeGreaterThan(0);
    const body = calls("/section-properties/custom").at(-1)?.body as unknown as { nodes: unknown[]; links: unknown[] };
    expect(body.nodes.length).toBeGreaterThanOrEqual(2);
    await user.click(within(dock()).getByRole("button", { name: /Nodes and links/ }));
    const modal = screen.getByRole("dialog");
    await within(modal).findByText("Area and centroid");
    for (const name of [/Node coordinates/, /Flat widths/, /y-y and z-z axes/, /Centroid/, /Plastic neutral axis/, /Principal axes/]) {
      expect(within(modal).getByRole("checkbox", { name })).toBeInTheDocument();
    }
    expect(within(modal).queryByRole("checkbox", { name: /Shear centre/ })).not.toBeInTheDocument();
    await user.click(within(modal).getByRole("checkbox", { name: /Centroid/ }));
    expect(modal.querySelector("svg.node-preview")).toBeInTheDocument();
  });
});

describe("Edit as nodes and links", () => {
  it("turns the template into the custom tables and opens them", async () => {
    const user = userEvent.setup();
    renderApp();
    await typeTemplateI(user);
    await user.click(within(dock()).getByRole("button", { name: /Section geometry/ }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Edit as nodes and links/ }));
    const modal = await screen.findByRole("dialog", { name: "Custom section: nodes and links" });
    expect(within(dock()).getByLabelText(/^Geometry/)).toHaveValue("custom");
    expect(within(dock()).getByLabelText(/^Section type/)).toHaveValue("I-section");
    // 6 nodes and 5 links, plus the always-empty last row of each table
    const [nodes, links] = within(modal).getAllByRole("table");
    expect(within(nodes).getAllByRole("row").length).toBeGreaterThanOrEqual(7);
    expect(within(links).getAllByRole("row").length).toBeGreaterThanOrEqual(6);
    await waitFor(() => expect(calls("/section-properties/custom").length).toBeGreaterThan(0));
    const body = calls("/section-properties/custom").at(-1)?.body as unknown as { nodes: unknown[]; links: { thickness: number }[] };
    expect(body.nodes).toHaveLength(6);
    expect(body.links.map((l) => l.thickness)).toEqual([8.5, 8.5, 5.6, 8.5, 8.5]);
  });
});
