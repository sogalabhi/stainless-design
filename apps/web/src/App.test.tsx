import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { installMockApi, requests } from "./test/mockApi";

const plotly = vi.hoisted(() => ({ react: vi.fn(() => Promise.resolve()), purge: vi.fn() }));
vi.mock("plotly.js-dist-min", () => ({ default: plotly }));

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

describe("Material step", () => {
  it("shows the B.4 numbers, Table B.1 with the selected row, and a chart", async () => {
    renderApp();
    const results = await screen.findByRole("region", { name: "Material results" });
    await waitFor(() =>
      expect(results.querySelector(".metric-value")).toHaveTextContent("0.00105"),
    );
    expect(within(results).getByText("3 160.8")).toBeInTheDocument();
    expect(within(results).getByText(/15 will govern/)).toBeInTheDocument();

    const rows = within(results).getAllByRole("row");
    const austenitic = rows.find((row) => within(row).queryByText("Austenitic"));
    expect(austenitic).toHaveAttribute("aria-selected", "true");
    expect(plotly.react).toHaveBeenCalled();
  });

  it("lists the grades from the API plus a Custom entry; E is locked in beginner mode", async () => {
    renderApp();
    const select = await screen.findByLabelText("Grade (Table 5.1)");
    await waitFor(() => expect(within(select).getAllByRole("option").length).toBe(16));
    expect(within(select).getByText("Custom (not in Table 5.1)")).toBeInTheDocument();
    expect(screen.getByLabelText(/E \(5\.1\.5\)/)).toBeDisabled();
  });

  it("shows grade, f_y and f_u together, linked in both directions", async () => {
    const user = userEvent.setup();
    renderApp();
    const grade = await screen.findByLabelText("Grade (Table 5.1)");
    const fy = screen.getByLabelText(/^fy/);
    const fu = screen.getByLabelText(/^fu/);
    await waitFor(() => expect(within(grade).getAllByRole("option").length).toBe(16));
    expect(fy).toHaveValue(210);
    expect(fu).toHaveValue(500);

    // pick a grade: f_y and f_u follow
    await user.selectOptions(grade, "1.4003");
    expect(fy).toHaveValue(250);
    expect(fu).toHaveValue(450);

    // type f_y: grade and f_u follow
    await user.clear(fy);
    await user.type(fy, "450");
    await waitFor(() => expect(fu).toHaveValue(650));
    expect(grade).toHaveValue("1.4462");
    expect(screen.getByLabelText("Family")).toHaveValue("duplex");

    // type f_u to something in no grade: Custom, family becomes editable
    await user.clear(fu);
    await user.type(fu, "700");
    await waitFor(() => expect(grade).toHaveValue("custom"));
    expect(fy).toHaveValue(450);
    expect(screen.getByLabelText("Family")).toBeEnabled();

    // type f_u back to a Table 5.1 value: grade and f_y follow
    await user.clear(fu);
    await user.type(fu, "500");
    await waitFor(() => expect(grade).toHaveValue("1.4307"));
    expect(fy).toHaveValue(210);
    expect(screen.getByLabelText("Family")).toBeDisabled();
  });

  it("sends a custom material when the values match no grade", async () => {
    const user = userEvent.setup();
    renderApp();
    const fy = await screen.findByLabelText(/^fy/);
    await user.clear(fy);
    await user.type(fy, "333");
    await waitFor(() => {
      const last = requests.filter((r) => r.path.endsWith("/material-model")).at(-1);
      expect(JSON.stringify(last?.body)).toContain('"fy":333');
      expect(JSON.stringify(last?.body)).not.toContain("designation");
    });
  });

  it("expert mode unlocks E", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole("radio", { name: "Expert" }));
    expect(await screen.findByLabelText(/E \(5\.1\.5\)/)).toBeEnabled();
  });

  it("shows the working as typeset LaTeX equations", async () => {
    renderApp();
    const results = await screen.findByRole("region", { name: "Material results" });
    await waitFor(() => expect(results.querySelectorAll(".katex").length).toBeGreaterThan(5));
    expect(results.querySelector(".katex-mathml annotation")?.textContent).toContain("E = 200000");
  });

  it("the graph view switch asks the API for the other view", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("region", { name: "Material results" });
    await user.click(screen.getByRole("radio", { name: "True scale" }));
    await waitFor(() =>
      expect(
        requests.some(
          (r) => r.path.endsWith("/material-model") && JSON.stringify(r.body).includes("true_scale"),
        ),
      ).toBe(true),
    );
  });
});

describe("Tension step", () => {
  async function openTension() {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole("tab", { name: /Tension/ }));
    return user;
  }

  it("shows the kN resistances and the classic comparison, with no pass/fail verdict", async () => {
    await openTension();
    const results = await screen.findByRole("region", { name: "Tension results" });
    await waitFor(() => expect(within(results).getByText("233.1")).toBeInTheDocument());
    expect(within(results).getByText("+22 % vs classic")).toBeInTheDocument();
    expect(within(results).getByText(/not checked because only the area/)).toBeInTheDocument();
    expect(within(results).queryByText(/\bPASS\b|\bFAIL\b|[Uu]tilisation/)).not.toBeInTheDocument();
  });

  it("has no design-force input and sends none", async () => {
    await openTension();
    await screen.findByRole("region", { name: "Tension results" });
    expect(screen.queryByLabelText(/^NEd/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/design tension force/)).not.toBeInTheDocument();
    await waitFor(() => expect(requests.some((r) => r.path.endsWith("/tension"))).toBe(true));
    const call = requests.find((r) => r.path.endsWith("/tension"));
    expect(JSON.stringify(call?.body)).not.toContain("design_force");
  });

  it("holes show the API's clear message, not a crash", async () => {
    const user = await openTension();
    await user.click(await screen.findByLabelText(/Section has holes/));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("B.6.1");
  });

  it("expert mode adds the gamma field and sends it", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole("radio", { name: "Expert" }));
    await user.click(screen.getByRole("tab", { name: /Tension/ }));
    expect(await screen.findByLabelText(/γM0/)).toBeInTheDocument();
    await waitFor(() => {
      const call = requests.filter((r) => r.path.endsWith("/tension")).at(-1);
      expect(call?.body?.tension?.gamma_m0).toBe(1.1);
    });
  });
});

describe("Deformation capacity step", () => {
  async function openDeformation() {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole("tab", { name: /Deformation capacity/ }));
    return user;
  }

  it("shows sigma_cr,cs, the slenderness, the strain limit and the plate table", async () => {
    await openDeformation();
    const results = await screen.findByRole("region", { name: "Deformation capacity results" });
    await waitFor(() => expect(within(results).getByText("Plates (B.9)")).toBeInTheDocument());
    expect(within(results).getByRole("cell", { name: /^web \(most slender\)/ })).toBeInTheDocument();
    expect(within(results).getByText(/^(Stocky|Slender): /)).toBeInTheDocument();
    expect(results.querySelectorAll(".metric").length).toBe(5);
    expect(plotly.react).toHaveBeenCalled();
    expect(results.querySelectorAll(".katex").length).toBeGreaterThan(3);
  });

  it("offers the preset sections in beginner mode and the custom ones in expert mode", async () => {
    const user = await openDeformation();
    const select = await screen.findByLabelText("Section");
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Welded I-section",
      "Rectangular hollow section",
      "Circular hollow section",
    ]);
    await user.click(screen.getByRole("radio", { name: "Expert" }));
    expect(within(select).getAllByRole("option").length).toBe(5);
    expect(await screen.findByLabelText(/^Ω/)).toBeInTheDocument();
  });

  it("changing the section changes the fields and what is sent", async () => {
    const user = await openDeformation();
    const select = await screen.findByLabelText("Section");
    expect(screen.getByLabelText(/Clear web depth/)).toBeInTheDocument();
    await user.selectOptions(select, "chs");
    expect(screen.getByLabelText(/Outer diameter/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Clear web depth/)).not.toBeInTheDocument();
    await waitFor(() => {
      const last = requests.filter((r) => r.path.endsWith("/deformation-capacity")).at(-1);
      expect(last?.body?.geometry?.kind).toBe("chs");
    });
  });

  it("a section beyond the slenderness limit shows the guard-rail message, not a number", async () => {
    const user = await openDeformation();
    await user.selectOptions(await screen.findByLabelText("Section"), "rhs");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/too slender/);
    const results = screen.getByRole("region", { name: "Deformation capacity results" });
    expect(within(results).getAllByText("not allowed").length).toBeGreaterThan(0);
    expect(plotly.react).toHaveBeenCalled(); // the chart still shows where the section falls
  });

  it("expert mode lets you add and remove plates", async () => {
    const user = await openDeformation();
    await user.click(screen.getByRole("radio", { name: "Expert" }));
    await user.selectOptions(await screen.findByLabelText("Section"), "plates");
    const rows = () => document.querySelectorAll("fieldset.plate-row").length;
    expect(rows()).toBe(1);
    await user.click(screen.getByRole("button", { name: /Add plate/ }));
    expect(rows()).toBe(2);
    await user.click(screen.getAllByRole("button", { name: /Remove plate/ })[1]);
    expect(rows()).toBe(1);
    expect(screen.getByRole("button", { name: /Remove plate/ })).toBeDisabled();
  });

  it("sends omega only in expert mode", async () => {
    const user = await openDeformation();
    await screen.findByRole("region", { name: "Deformation capacity results" });
    await waitFor(() => expect(requests.some((r) => r.path.endsWith("/deformation-capacity"))).toBe(true));
    expect(requests.filter((r) => r.path.endsWith("/deformation-capacity")).at(-1)?.body?.omega).toBe(15);
    await user.click(screen.getByRole("radio", { name: "Expert" }));
    const omega = await screen.findByLabelText(/^Ω/);
    await user.clear(omega);
    await user.type(omega, "10");
    await waitFor(() => {
      const last = requests.filter((r) => r.path.endsWith("/deformation-capacity")).at(-1);
      expect(last?.body?.omega).toBe(10);
    });
  });
});
