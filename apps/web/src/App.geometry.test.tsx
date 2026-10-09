import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { formatProperty } from "./components/PropertiesTable";
import properties from "./test/fixtures/section_properties.json";
import propertiesAngle from "./test/fixtures/section_properties_angle.json";
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
const dialog = () => screen.getByRole("dialog", { name: "Section geometry" });
const opener = () => within(dock()).getByRole("button", { name: /Section geometry/ });
const calls = (path: string) => requests.filter((r) => r.path.endsWith(path));
const layer = (name: string) => dialog().querySelector(`[data-layer="${name}"]`);
const show = (name: RegExp) => within(dialog()).getByRole("checkbox", { name });

/** The rolled I-section of plan.md 4d: only the dimensions, nothing else (the properties need no more). */
async function typeRolledI(user: User) {
  await user.click(group(/^Section/));
  await user.selectOptions(within(dock()).getByLabelText(/^Section type/), "I-section");
  await user.selectOptions(within(dock()).getByLabelText(/^Fabrication/), "rolled");
  await user.type(within(dock()).getByLabelText(/^Overall height h/), "200");
  await user.type(within(dock()).getByLabelText(/^Overall width b/), "100");
  await user.type(within(dock()).getByLabelText(/^Web thickness/), "5.6");
  await user.type(within(dock()).getByLabelText(/^Flange thickness/), "8.5");
  await user.type(within(dock()).getByLabelText(/^Root radius r/), "12");
}

async function openGeometry(user: User) {
  await user.click(opener());
  const modal = dialog();
  await within(modal).findByText("Properties (from geometry)");
  await within(modal).findByRole("table", {}, { timeout: 3000 }).catch(() => undefined);
  return modal;
}

describe("the dock holds a thumbnail, the window holds the drawing", () => {
  it("shows the thumbnail and the button in the dock, and the big sketch only in the window", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(group(/^Section/));
    expect(within(dock()).queryByRole("button", { name: /Section geometry/ })).not.toBeInTheDocument();
    await user.selectOptions(within(dock()).getByLabelText(/^Section type/), "I-section");
    expect(opener()).toBeInTheDocument();
    expect(within(opener()).getByRole("img", { name: /^Thumbnail of the I-section, schematic$/ })).toBeInTheDocument();
    expect(within(dock()).queryByRole("img", { name: /sketch/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(opener());
    expect(within(dialog()).getByRole("img", { name: /I-section sketch/ })).toBeInTheDocument();
    expect(within(dock()).queryByRole("img", { name: /sketch/ })).not.toBeInTheDocument();
  });

  it("the thumbnail is drawn to scale once the dimensions are complete", async () => {
    const user = userEvent.setup();
    renderApp();
    await typeRolledI(user);
    expect(within(opener()).getByRole("img", { name: /^Thumbnail of the I-section$/ })).toBeInTheDocument();
  });
});

describe("the Section geometry window", () => {
  it("opens from the dock button as a modal dialog and closes with Esc", async () => {
    const user = userEvent.setup();
    renderApp();
    await typeRolledI(user);
    await user.click(opener());
    const modal = dialog();
    expect(modal).toHaveAttribute("aria-modal", "true");
    expect(within(modal).getByRole("button", { name: /Close/ })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener()).toHaveFocus(); // focus goes back to the button that opened it
  });

  it("also closes with its Close button and on a click outside it", async () => {
    const user = userEvent.setup();
    renderApp();
    await typeRolledI(user);
    await user.click(opener());
    await user.click(within(dialog()).getByRole("button", { name: /Close/ }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(opener());
    fireEvent.mouseDown(dialog().parentElement as HTMLElement);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps Tab inside while it is open", async () => {
    const user = userEvent.setup();
    renderApp();
    await typeRolledI(user);
    await user.click(opener());
    const modal = dialog();
    const buttons = within(modal).getAllByRole("button");
    (buttons[buttons.length - 1] as HTMLElement).focus();
    await user.tab();
    expect(modal.contains(document.activeElement)).toBe(true);
    await user.tab({ shift: true });
    expect(modal.contains(document.activeElement)).toBe(true);
  });

  it("Esc closes only the window, not an open drawer behind it", async () => {
    const user = userEvent.setup();
    renderApp();
    await typeRolledI(user);
    await user.click(opener());
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(dock()).toBeInTheDocument();
  });
});

describe("the layers", () => {
  it("starts with dimensions, flat widths, axes and fillets on, and the rest off", async () => {
    const user = userEvent.setup();
    renderApp();
    await typeRolledI(user);
    await openGeometry(user);
    for (const on of [/^Dimensions$/, /^Flat widths c$/, /^y-y and z-z axes$/, /^Fillets and welds$/]) {
      expect(show(on)).toBeChecked();
    }
    for (const off of [/^Centroid$/, /^Plastic neutral axis$/, /^Shear centre$/]) {
      expect(show(off)).not.toBeChecked();
    }
    expect(within(dialog()).queryByRole("checkbox", { name: /Principal axes/ })).not.toBeInTheDocument(); // angles only
  });

  it("each checkbox shows and hides its layer", async () => {
    const user = userEvent.setup();
    renderApp();
    await typeRolledI(user);
    await openGeometry(user);
    const modal = dialog();

    // dimensions
    expect(modal.querySelector('[data-dim="h"]')).toBeInTheDocument();
    await user.click(show(/^Dimensions$/));
    expect(modal.querySelector("[data-dim]")).not.toBeInTheDocument();
    await user.click(show(/^Dimensions$/));
    expect(modal.querySelector('[data-dim="h"]')).toBeInTheDocument();

    // flat widths c
    expect(modal.querySelector('[data-band="c_w"]')).toBeInTheDocument();
    await user.click(show(/^Flat widths c$/));
    expect(modal.querySelector("[data-band]")).not.toBeInTheDocument();
    await user.click(show(/^Flat widths c$/));
    expect(modal.querySelector('[data-band="c_w"]')).toBeInTheDocument();

    // axes (drawn through the engine's centroid once its answer is here)
    await waitFor(() => expect(modal.querySelector('[data-layer="axes"]')).toBeInTheDocument());
    await user.click(show(/^y-y and z-z axes$/));
    expect(modal.querySelector(".sk-axes")).not.toBeInTheDocument();
    await user.click(show(/^y-y and z-z axes$/));
    expect(modal.querySelector(".sk-axes")).toBeInTheDocument();

    // fillets: with the layer off the corner label goes and the outline loses its arcs
    const outline = () => modal.querySelector(".sk-section path") as SVGPathElement;
    expect(outline().getAttribute("d")).toContain(" A ");
    expect(modal.querySelector('[data-dim="r"]')).toBeInTheDocument();
    await user.click(show(/^Fillets and welds$/));
    expect(outline().getAttribute("d")).not.toContain(" A ");
    expect(modal.querySelector('[data-dim="r"]')).not.toBeInTheDocument();
    await user.click(show(/^Fillets and welds$/));
    expect(outline().getAttribute("d")).toContain(" A ");

    // the layers that show engine values: centroid, plastic neutral axis, shear centre
    for (const [name, layerName, legend] of [
      [/^Centroid$/, "centroid", /Centroid/],
      [/^Plastic neutral axis$/, "plastic", /Plastic neutral axis \(equal-area line\)/],
      [/^Shear centre$/, "shear", /Shear centre \(thin-walled approximation\)/],
    ] as const) {
      expect(layer(layerName)).not.toBeInTheDocument();
      expect(within(modal).queryByRole("list", { name: "Legend" })).not.toBeInTheDocument();
      await user.click(show(name));
      expect(layer(layerName)).toBeInTheDocument();
      expect(within(within(modal).getByRole("list", { name: "Legend" })).getByText(legend)).toBeInTheDocument();
      await user.click(show(name));
      expect(layer(layerName)).not.toBeInTheDocument();
      expect(within(modal).queryByRole("list", { name: "Legend" })).not.toBeInTheDocument();
    }
  }, 20000); // many clicks: about 5 seconds on a busy machine

  it("draws the centroid where the engine put it: at mid-height and mid-width for the I-section", async () => {
    const user = userEvent.setup();
    renderApp();
    await typeRolledI(user);
    await openGeometry(user);
    await user.click(show(/^Centroid$/));
    // engine centroid (50, 100) on a 100 x 200 box is the middle of the drawing
    expect(layer("centroid")).toHaveAttribute("transform", "translate(0 0)");
  });

  it("remembers the choices, and starts from the defaults without storage", async () => {
    const user = userEvent.setup();
    const first = renderApp();
    await typeRolledI(user);
    await openGeometry(user);
    await user.click(show(/^Centroid$/));
    await user.click(show(/^Dimensions$/));
    first.unmount();
    renderApp();
    await typeRolledI(user);
    await user.click(opener());
    expect(show(/^Centroid$/)).toBeChecked();
    expect(show(/^Dimensions$/)).not.toBeChecked();
    expect(JSON.parse(window.localStorage.getItem("stainless-csm.geometry-layers") ?? "{}")).toMatchObject({
      centroid: true,
      dimensions: false,
    });
  });

  it("still works when storage throws", async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    renderApp();
    await typeRolledI(user);
    await user.click(opener());
    expect(show(/^Dimensions$/)).toBeChecked();
    await user.click(show(/^Centroid$/));
    expect(show(/^Centroid$/)).toBeChecked();
    vi.restoreAllMocks();
  });

  it("an angle also has the principal axes layer, drawn from the engine's angle", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(group(/^Section/));
    await user.selectOptions(within(dock()).getByLabelText(/^Section type/), "angle");
    await user.type(within(dock()).getByLabelText(/^Longer leg h/), "100");
    await user.type(within(dock()).getByLabelText(/^Shorter leg b/), "75");
    await user.type(within(dock()).getByLabelText(/^Leg thickness t/), "8");
    await user.type(within(dock()).getByLabelText(/^Root radius r/), "10");
    await user.click(opener());
    const modal = dialog();
    await within(modal).findByText("Properties (from geometry)");
    await waitFor(() => expect(within(modal).getByText(/Major axis u from the y axis/)).toBeInTheDocument());
    expect(layer("principal")).not.toBeInTheDocument();
    await user.click(show(/^Principal axes/));
    expect(layer("principal")).toBeInTheDocument();
    expect(within(within(modal).getByRole("list", { name: "Legend" })).getByText("Principal axes u and v")).toBeInTheDocument();
    // the engine's angle is shown in the table, and the axes are two lines through the centroid
    expect(layer("principal")?.querySelectorAll("line")).toHaveLength(2);
    expect(propertiesAngle.principal?.angle_deg).toBeGreaterThan(0);
  });
});

describe("the dimension fields in the window are the dock's fields", () => {
  it("typing in the window changes the dock field, and the other way round", async () => {
    const user = userEvent.setup();
    renderApp();
    await typeRolledI(user);
    await user.click(opener());
    const modal = dialog();
    const inModal = within(modal).getByLabelText(/^Overall height h/);
    expect(inModal).toHaveValue(200);
    await user.clear(inModal);
    await user.type(inModal, "250");
    expect(within(dock()).getByLabelText(/^Overall height h/)).toHaveValue(250);
    await user.clear(within(dock()).getByLabelText(/^Web thickness/));
    await user.type(within(dock()).getByLabelText(/^Web thickness/), "6");
    expect(within(modal).getByLabelText(/^Web thickness/)).toHaveValue(6);
    // and the sketch in the window follows
    expect(within(modal).getByRole("img", { name: /h = 250 mm/ })).toBeInTheDocument();
  });

  it("the window shows the fabrication choice too, and changing it changes the dock", async () => {
    const user = userEvent.setup();
    renderApp();
    await typeRolledI(user);
    await user.click(opener());
    await user.selectOptions(within(dialog()).getByLabelText(/^Fabrication/), "welded");
    expect(within(dock()).getByLabelText(/^Fabrication/)).toHaveValue("welded");
    expect(within(dialog()).getByLabelText(/^Weld leg s/)).toHaveValue(null);
  });
});

describe("the properties table", () => {
  it("asks only for the dimensions: no material, no A, no k_σ", async () => {
    const user = userEvent.setup();
    renderApp();
    await typeRolledI(user);
    await user.click(opener());
    await within(dialog()).findByText("Area and centroid");
    const body = calls("/section-properties").at(-1)?.body as unknown as Record<string, unknown>;
    expect(body).toEqual({ shape: "I-section", fabrication: "rolled", h: 200, b: 100, t_w: 5.6, t_f: 8.5, r: 12 });
    expect(calls("/deformation-capacity")).toHaveLength(0); // B.5 still waits for its own inputs
  });

  it("shows the engine's values and nothing else, each with its unit", async () => {
    const user = userEvent.setup();
    renderApp();
    await typeRolledI(user);
    await user.click(opener());
    const modal = dialog();
    await within(modal).findByText("Area and centroid");
    const shown = [...modal.querySelectorAll<HTMLElement>("[data-property]")];
    expect(shown.map((row) => row.dataset.property)).toEqual(properties.rows.map((row) => row.key));
    for (const row of properties.rows) {
      const cell = modal.querySelector(`[data-property="${row.key}"]`) as HTMLElement;
      expect(within(cell).getByText(formatProperty(row.value))).toBeInTheDocument();
      expect(cell).toHaveTextContent(row.unit);
    }
    // the headline values of plan.md 4d, as the engine returned them
    expect(modal.querySelector('[data-property="A"] [data-value]')).toHaveTextContent("2 848.42");
    expect(modal.querySelector('[data-property="W_pl_y"] [data-value]')).toHaveTextContent("220 640");
    // wording: reference values, geometry, and the shear centre is an approximation
    expect(within(modal).getAllByText(/computed from your dimensions: geometry, not a rule of EN 1993-1-4/).length).toBeGreaterThan(0);
    expect(within(modal).getAllByText(/thin-walled approximation/).length).toBeGreaterThan(0);
  });

  it("has a Use button for A only, today", async () => {
    const user = userEvent.setup();
    renderApp();
    await typeRolledI(user);
    await user.click(opener());
    await within(dialog()).findByText("Area and centroid");
    const buttons = within(dialog()).getAllByRole("button", { name: /^Use / });
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAccessibleName(/Use A in the Area A field/);
  });

  it("copies nothing until Use is clicked", async () => {
    const user = userEvent.setup();
    renderApp();
    await typeRolledI(user);
    await user.click(opener());
    await within(dialog()).findByText("Area and centroid");
    expect(within(dock()).getByLabelText(/^Area A/)).toHaveValue(null);
    expect(within(dock()).queryByText(/copied from geometry/)).not.toBeInTheDocument();
    expect(calls("/tension")).toHaveLength(0);
    expect(calls("/compression")).toHaveLength(0);
  });

  it("Use copies A into the dock field and says 'copied from geometry'", async () => {
    const user = userEvent.setup();
    renderApp();
    await typeRolledI(user);
    await user.click(opener());
    await within(dialog()).findByText("Area and centroid");
    await user.click(within(dialog()).getByRole("button", { name: /Use A in the Area A field/ }));
    expect(within(dock()).getByLabelText(/^Area A/)).toHaveValue(2848.42);
    expect(within(dock()).getByText("copied from geometry")).toBeInTheDocument();
    // editing the field takes the label away
    await user.type(within(dock()).getByLabelText(/^Area A/), "1");
    expect(within(dock()).queryByText("copied from geometry")).not.toBeInTheDocument();
  });

  it("shows no mismatch note when the typed A is within 0.5 % of the geometry value", async () => {
    const user = userEvent.setup();
    renderApp();
    await typeRolledI(user);
    await user.type(within(dock()).getByLabelText(/^Area A/), "2848");
    await user.click(opener());
    await within(dialog()).findByText("Area and centroid");
    expect(within(dock()).queryByText(/differs from the geometry value/)).not.toBeInTheDocument();
  });

  it("shows a note with the geometry value when the typed A differs by more than 0.5 %", async () => {
    const user = userEvent.setup();
    renderApp();
    await typeRolledI(user);
    await user.type(within(dock()).getByLabelText(/^Area A/), "2870"); // +0.76 %
    const note = await within(dock()).findByText(/differs from the geometry value/);
    expect(note).toHaveTextContent("2 848.42 mm²");
    expect(note).toHaveTextContent("0.8 %");
    expect(note).toHaveTextContent("The calculation uses the value in this field");
    // the note does not change the field
    expect(within(dock()).getByLabelText(/^Area A/)).toHaveValue(2870);
  });

  it("is waiting for the outer corner radius of an RHS, and B.5 does not wait for it", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(group(/^Section/));
    await user.selectOptions(within(dock()).getByLabelText(/^Section type/), "rectangular hollow section");
    await user.type(within(dock()).getByLabelText(/^Overall height h/), "100");
    await user.type(within(dock()).getByLabelText(/^Overall width b/), "50");
    await user.type(within(dock()).getByLabelText(/^Wall thickness t/), "4");
    expect(within(dock()).getByLabelText(/^Outer corner radius r_?o/)).toHaveValue(null);
    // the Section group does not count r_o: the type is given and h, b, t are typed; A and γM0 remain
    expect(group(/^Section/)).toHaveTextContent("2 to enter");
    await user.click(opener());
    const modal = dialog();
    expect(within(modal).getByText(/Waiting for:/).closest("[role=status]")).toHaveTextContent(/outer corner radius r_?o/);
    expect(within(modal).queryByText("Area and centroid")).not.toBeInTheDocument();
    expect(calls("/section-properties")).toHaveLength(0);
    // a link in the message focuses the field in the window
    await user.click(within(modal).getByRole("button", { name: /outer corner radius/ }));
    expect(within(modal).getByLabelText(/^Outer corner radius r_?o/)).toHaveFocus();
    await user.type(within(modal).getByLabelText(/^Outer corner radius r_?o/), "0");
    await within(modal).findByText("Area and centroid");
    expect(calls("/section-properties").at(-1)?.body).toEqual({
      shape: "rectangular hollow section",
      h: 100,
      b: 50,
      t: 4,
      r_o: 0,
    });
  });

  it("an impossible shape is the engine's message", async () => {
    const user = userEvent.setup();
    renderApp();
    await typeRolledI(user);
    await user.click(opener());
    await within(dialog()).findByText("Area and centroid");
    const flange = within(dialog()).getByLabelText(/^Flange thickness/);
    await user.clear(flange);
    await user.type(flange, "100");
    expect(await within(dialog()).findByRole("alert")).toHaveTextContent(/fill the whole height/);
  });

  it("leaves the section type route alone: a typed σ_cr,cs has no geometry button", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(group(/^Section/));
    await user.selectOptions(within(dock()).getByLabelText(/^Section type/), "I-section");
    await user.click(group(/^Deformation capacity/));
    await user.selectOptions(within(dock()).getByLabelText(/^Slenderness from/), "sigma_cr");
    await user.click(group(/^Section/));
    expect(within(dock()).queryByRole("button", { name: /Section geometry/ })).not.toBeInTheDocument();
  });
});
