import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { helpKeyOf } from "./components/FieldHelp";
import inputHelp from "./test/fixtures/input_help.json";
import { installMockApi, requests } from "./test/mockApi";

const plotly = vi.hoisted(() => ({ react: vi.fn(() => Promise.resolve()), purge: vi.fn() }));
vi.mock("plotly.js-dist-min", () => ({ default: plotly }));
vi.mock("./components/SectionScene", () => ({ default: () => <div aria-label="3D scene" /> }));

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

type User = ReturnType<typeof userEvent.setup>;
const dock = () => screen.getByRole("complementary", { name: "Inputs" });
const group = (name: RegExp) => within(dock()).getByRole("button", { name });
const field = (key: string) => dock().querySelector(`[data-field="${key}"]`) as HTMLElement;
const panels = () => document.querySelectorAll("[data-help-panel]");
const helpButton = (label: string) => within(dock()).findByRole("button", { name: `What is ${label}?` });
const entries = inputHelp as { key: string }[];

async function openGroup(user: User, name: RegExp) {
  if (group(name).getAttribute("aria-expanded") !== "true") await user.click(group(name));
}

/** The data-field keys now drawn in the dock, and the fields among them that lack a "?" button. */
function inspectDock() {
  const keys: string[] = [];
  const bare: string[] = [];
  dock()
    .querySelectorAll<HTMLElement>("[data-field]")
    .forEach((element) => {
      const key = element.dataset.field as string;
      keys.push(key);
      if (!element.querySelector("button[data-help-for]")) bare.push(key);
    });
  return { keys, bare };
}

describe("helpKeyOf", () => {
  it("matches the plate fields by suffix and leaves every other key alone", () => {
    expect(helpKeyOf("kSigma-web")).toBe("kSigma");
    expect(helpKeyOf("kSigma-flange")).toBe("kSigma");
    expect(helpKeyOf("plate-3-kSigma")).toBe("kSigma");
    expect(helpKeyOf("plate-1-width")).toBe("plateWidth");
    expect(helpKeyOf("plate-12-thickness")).toBe("plateThickness");
    expect(helpKeyOf("fy")).toBe("fy");
    expect(helpKeyOf("rO")).toBe("rO");
  });
});

describe("the ? button on every input", () => {
  it("is drawn beside every label of the Material group, named 'What is <label>?'", async () => {
    renderApp();
    await helpButton("f_y");
    for (const label of ["Grade (Table 5.1)", "f_y", "f_u", "Family", "E"]) {
      expect(await helpButton(label)).toBeInTheDocument();
    }
    expect(inspectDock().bare).toEqual([]);
  });

  it("is drawn for the checkboxes too: cold-forming in Custom, and holes in the Section group", async () => {
    const user = userEvent.setup();
    renderApp();
    await helpButton("f_y");
    await user.selectOptions(within(dock()).getByLabelText(/^Grade/), "custom");
    expect(await helpButton("Values enhanced by cold-forming (B.3(3))")).toBeInTheDocument();
    await openGroup(user, /^Section/);
    expect(await helpButton("Section has holes (bolt holes, slots)")).toBeInTheDocument();
  });

  it("has an entry for every field key the dock and the geometry window can draw", async () => {
    const user = userEvent.setup();
    renderApp();
    await helpButton("f_y");
    const seen = new Set<string>();
    const collect = () => {
      const { keys, bare } = inspectDock();
      keys.forEach((key) => seen.add(key));
      expect(bare, "fields without a ? button").toEqual([]);
    };
    await user.selectOptions(within(dock()).getByLabelText(/^Grade/), "custom");
    collect();

    await openGroup(user, /^Section/);
    for (const type of [
      "I-section",
      "channel",
      "T-section",
      "angle",
      "rectangular hollow section",
      "circular hollow section",
    ]) {
      await user.selectOptions(within(dock()).getByLabelText(/^Section type/), type);
      for (const fabrication of ["rolled", "welded"]) {
        const select = within(dock()).queryByLabelText(/^Fabrication/);
        if (select) await user.selectOptions(select, fabrication);
        collect();
      }
    }

    // the three routes of the Deformation group, on a shape with flat plates and on the tube
    for (const type of ["I-section", "circular hollow section"]) {
      await openGroup(user, /^Section/);
      await user.selectOptions(within(dock()).getByLabelText(/^Section type/), type);
      await openGroup(user, /^Deformation capacity/);
      const route = within(dock()).getByLabelText(/^Slenderness from/) as HTMLSelectElement;
      const routes = [...route.options].map((option) => option.value).filter(Boolean);
      for (const value of routes) {
        await user.selectOptions(route, value);
        if (value === "plates") await user.click(within(dock()).getByRole("button", { name: /Add plate/ }));
        collect();
      }
    }

    expect(seen.size).toBeGreaterThan(20);
    const known = new Set(entries.map((entry) => entry.key));
    for (const key of seen) expect(known.has(helpKeyOf(key)), `no help entry for ${key}`).toBe(true);
    // the three plate fields were met, and so were the template k_σ fields
    expect([...seen].some((key) => /^plate-\d+-width$/.test(key))).toBe(true);
    expect([...seen].some((key) => /^plate-\d+-thickness$/.test(key))).toBe(true);
    expect([...seen].some((key) => /^plate-\d+-kSigma$/.test(key))).toBe(true);
    expect([...seen].some((key) => key.startsWith("kSigma-"))).toBe(true);
  });

  it("opens a panel under the field on a click and closes it on a second click", async () => {
    const user = userEvent.setup();
    renderApp();
    const button = await helpButton("f_y");
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(panels()).toHaveLength(0);

    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(panels()).toHaveLength(1);
    const panel = field("fy").querySelector("[data-help-panel]") as HTMLElement;
    expect(panel).toBeInTheDocument(); // under this field
    expect(button).toHaveAttribute("aria-describedby", panel.id); // the panel is its described content
    for (const heading of ["What it is", "Why it is needed", "Where to get it"]) {
      expect(within(panel).getByText(heading)).toBeInTheDocument();
    }
    expect(within(panel).getByText("In EN 1993-1-4 (Table 5.1)")).toBeInTheDocument();

    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).not.toHaveAttribute("aria-describedby");
    expect(panels()).toHaveLength(0);
  });

  it("closes on Escape and gives the focus back to the button", async () => {
    const user = userEvent.setup();
    renderApp();
    const button = await helpButton("E");
    await user.click(button);
    expect(panels()).toHaveLength(1);
    await user.keyboard("{Escape}");
    expect(panels()).toHaveLength(0);
    expect(button).toHaveFocus();
  });

  it("keeps one panel open at a time", async () => {
    const user = userEvent.setup();
    renderApp();
    const fy = await helpButton("f_y");
    const fu = await helpButton("f_u");
    await user.click(fy);
    await user.click(fu);
    expect(panels()).toHaveLength(1);
    expect(fu).toHaveAttribute("aria-expanded", "true");
    expect(fy).toHaveAttribute("aria-expanded", "false");
    expect(field("fu").querySelector("[data-help-panel]")).toBeInTheDocument();
  });

  it("moves the 'Used in' line into the Why part: nothing is printed under the fields any more", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(await helpButton("E"));
    expect(within(dock()).queryByText(/Used in/)).toBeInTheDocument(); // inside the panel only
    const panel = field("E").querySelector("[data-help-panel]") as HTMLElement;
    expect(within(panel).getByText(/Used in B\.4, B\.9 and B\.11/)).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(within(dock()).queryByText(/Used in/)).not.toBeInTheDocument();
  });

  it("states the facts for gamma M0 and Omega, and says which inputs are outside the standard", async () => {
    const user = userEvent.setup();
    renderApp();
    await openGroup(user, /^Section/);
    await user.click(await helpButton("γM0"));
    expect(field("gammaM0")).toHaveTextContent("8.1 NOTE gives 1.10 unless the National Annex gives another value.");
    expect(field("gammaM0")).toHaveTextContent("In EN 1993-1-4 (8.1 NOTE)");
    await user.selectOptions(within(dock()).getByLabelText(/^Section type/), "I-section");
    await openGroup(user, /^Deformation capacity/);
    await user.click(await helpButton("Ω"));
    expect(field("omega")).toHaveTextContent(/7\.4\.3\.5/);
    expect(field("omega")).toHaveTextContent("Outside EN 1993-1-4: you provide it");
  });

  it("is drawn in the Section geometry window as well, and Escape closes the panel before the window", async () => {
    const user = userEvent.setup();
    renderApp();
    await openGroup(user, /^Section/);
    await user.selectOptions(within(dock()).getByLabelText(/^Section type/), "I-section");
    await user.selectOptions(within(dock()).getByLabelText(/^Fabrication/), "rolled");
    await user.click(within(dock()).getByRole("button", { name: /Section geometry/ }));
    const modal = screen.getByRole("dialog", { name: "Section geometry" });
    const button = await within(modal).findByRole("button", { name: /^What is Overall height h/ });
    await user.click(button);
    expect(modal.querySelector("[data-help-panel]")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(panels()).toHaveLength(0);
    expect(screen.getByRole("dialog", { name: "Section geometry" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Section geometry" })).not.toBeInTheDocument();
  });

  it("asks the API for the help once", async () => {
    const user = userEvent.setup();
    renderApp();
    await helpButton("f_y");
    await openGroup(user, /^Section/);
    await openGroup(user, /^Material/);
    await helpButton("f_y");
    expect(requests.filter((request) => request.path.endsWith("/input-help"))).toHaveLength(1);
  });
});

describe("when the help cannot be fetched", () => {
  it("hides the buttons and the fields still work", async () => {
    const user = userEvent.setup();
    const working = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).endsWith("/input-help")
        ? new Response("{}", { status: 500 })
        : working(input, init)) as typeof fetch;
    renderApp();
    await waitFor(() => expect(screen.getByRole("tab", { name: /Material/ })).toBeInTheDocument());
    await within(dock()).findByRole("option", { name: /1\.4301/ });
    expect(screen.queryAllByRole("button", { name: /^What is / })).toHaveLength(0);
    const fy = within(dock()).getByLabelText(/^f_?y/);
    await user.type(fy, "210");
    expect(fy).toHaveValue(210);
  });
});
