import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
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

const dock = () => screen.getByRole("complementary", { name: "Inputs" });
const tab = (name: RegExp) => screen.getByRole("tab", { name });

describe("the input dock", () => {
  it("starts with every field empty and counts what is still to enter in each group", () => {
    renderApp();
    const group = (name: RegExp) => within(dock()).getByRole("button", { name });
    expect(group(/^Material/)).toHaveTextContent("4 to enter");
    expect(group(/^Section/)).toHaveTextContent("3 to enter");
    expect(group(/^Deformation capacity/)).toHaveTextContent("2 to enter");
    expect(within(dock()).getByLabelText(/^f_?y/)).toHaveValue(null);
  });

  it("keeps one group open at a time", async () => {
    const user = userEvent.setup();
    renderApp();
    const material = within(dock()).getByRole("button", { name: /^Material/ });
    const section = within(dock()).getByRole("button", { name: /^Section/ });
    expect(material).toHaveAttribute("aria-expanded", "true");
    await user.click(section);
    expect(section).toHaveAttribute("aria-expanded", "true");
    expect(material).toHaveAttribute("aria-expanded", "false");
    expect(within(dock()).queryByLabelText(/^f_?y/)).not.toBeInTheDocument();
  });

  it("says where each field is used in the Why part of its ? panel, not under the field", async () => {
    const user = userEvent.setup();
    renderApp();
    expect(within(dock()).queryByText(/Used in/)).not.toBeInTheDocument();
    await user.click(await within(dock()).findByRole("button", { name: "What is f_y?" }));
    expect(within(dock()).getByText(/Used in B\.4, B\.5, B\.8 and B\.13/)).toBeInTheDocument();
  });

  it("is hidden on the Help tab, which needs the full width", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(tab(/Help/));
    expect(screen.queryByRole("complementary", { name: "Inputs" })).not.toBeInTheDocument();
  });
});

describe("the result tabs", () => {
  it("show a status icon with words, and every tab is waiting at the start", () => {
    renderApp();
    for (const name of [/Material/, /Deformation/, /Tension/, /Explore/]) {
      expect(tab(name)).toHaveTextContent("waiting for inputs");
    }
    expect(tab(/Help/)).not.toHaveTextContent("waiting");
  });

  it("list the missing inputs as links that open the field in the dock", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(tab(/Tension/));
    const results = screen.getByRole("region", { name: "Tension results" });
    expect(within(results).getByRole("status")).toHaveTextContent(/Waiting for:.*fy.*the area A.*γM0/);

    await user.click(within(results).getByRole("button", { name: "the area A" }));
    expect(within(dock()).getByRole("button", { name: /^Section/ })).toHaveAttribute("aria-expanded", "true");
    expect(within(dock()).getByLabelText(/^Area A/)).toHaveFocus();
  });

  it("send nothing to the API while an input is missing", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(tab(/Tension/));
    await user.click(tab(/Deformation/));
    expect(requests.filter((r) => r.path.endsWith("/tension") || r.path.endsWith("/deformation-capacity"))).toEqual([]);
  });

  it("have no inputs of their own: the dock holds the only copy of each value", async () => {
    const user = userEvent.setup();
    renderApp();
    for (const name of [/Material/, /Deformation/, /Tension/, /Explore/]) {
      await user.click(tab(name));
      const main = screen.getByRole("main");
      expect(within(main).queryAllByRole("spinbutton")).toEqual([]);
      expect(within(main).queryAllByRole("combobox")).toEqual([]);
    }
  });
});

describe("one section-type picker", () => {
  it("chooses the tube fields for a circular hollow section and the section template for the rest", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(within(dock()).getByRole("button", { name: /^Deformation capacity/ }));
    expect(within(dock()).getByText(/Choose the section type in the Section group first/)).toBeInTheDocument();

    await user.click(within(dock()).getByRole("button", { name: /^Section/ }));
    const picker = within(dock()).getByLabelText(/^Section type/);
    await user.selectOptions(picker, "circular hollow section");
    // d and t live in the Section group now, beside the sketch
    expect(within(dock()).getByLabelText(/^Outer diameter d/)).toBeInTheDocument();
    expect(within(dock()).getByLabelText(/^Wall thickness t/)).toBeInTheDocument();
    await user.click(within(dock()).getByRole("button", { name: /^Deformation capacity/ }));
    expect(within(dock()).queryByLabelText(/^Outer diameter d/)).not.toBeInTheDocument();
    expect(within(dock()).getByLabelText(/^Poisson/)).toBeInTheDocument();
    expect(within(dock()).queryByLabelText(/^k_?σ/)).not.toBeInTheDocument();

    await user.click(within(dock()).getByRole("button", { name: /^Section/ }));
    await user.selectOptions(within(dock()).getByLabelText(/^Section type/), "I-section");
    expect(within(dock()).queryByLabelText(/^Outer diameter d/)).not.toBeInTheDocument();
    expect(within(dock()).getByLabelText(/^Overall height h/)).toBeInTheDocument();
    await user.click(within(dock()).getByRole("button", { name: /^Deformation capacity/ }));
    expect(within(dock()).getByLabelText(/^Slenderness from/)).toHaveValue("template");
    expect(within(dock()).getByLabelText(/^k_?σ, web \(internal\)/)).toBeInTheDocument();
    expect(within(dock()).getByLabelText(/^k_?σ, flange outstand \(outstand\)/)).toBeInTheDocument();
    expect(within(dock()).queryByLabelText(/^Flat width/)).not.toBeInTheDocument();

    await user.selectOptions(within(dock()).getByLabelText(/^Slenderness from/), "plates");
    expect(within(dock()).getByLabelText(/^Flat width/)).toBeInTheDocument();
    expect(within(dock()).queryByLabelText(/^k_?σ, web/)).not.toBeInTheDocument();
  });

  it("is also what the Deformation tab waits for", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(tab(/Deformation/));
    const results = screen.getByRole("region", { name: "Deformation capacity results" });
    expect(within(results).getByRole("button", { name: "the section type" })).toBeInTheDocument();
    await user.click(within(results).getByRole("button", { name: "the section type" }));
    expect(within(dock()).getByLabelText(/^Section type/)).toHaveFocus();
  });
});

describe("phone width", () => {
  it("has an Inputs button that slides the dock out, and Close puts it away", async () => {
    const user = userEvent.setup();
    renderApp();
    expect(dock()).not.toHaveClass("open");
    await user.click(screen.getByRole("button", { name: /^Inputs/ }));
    expect(dock()).toHaveClass("open");
    await user.keyboard("{Escape}");
    expect(dock()).not.toHaveClass("open");
  });
});
