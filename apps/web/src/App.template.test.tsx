import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
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
  plotly.react.mockClear();
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
});

type User = ReturnType<typeof userEvent.setup>;
const dock = () => screen.getByRole("complementary", { name: "Inputs" });
const tab = (name: RegExp) => screen.getByRole("tab", { name });
const group = (name: RegExp) => within(dock()).getByRole("button", { name });
// The big drawing lives in the Section geometry window; the dock holds only its button and thumbnail.
const geometry = () => screen.getByRole("dialog", { name: "Section geometry" });
const sketch = () => within(geometry()).getByRole("img", { name: /sketch/ });
const dimLine = (key: string) => geometry().querySelector(`[data-dim="${key}"]`) as SVGGElement;
const field = (key: string) => dock().querySelector(`[data-field="${key}"]`) as HTMLElement;
const modalField = (key: string) => geometry().querySelector(`[data-field="${key}"]`) as HTMLElement;
async function openGeometry(user: User) {
  await user.click(within(dock()).getByRole("button", { name: /Section geometry/ }));
  return geometry();
}
const calls = (path: string) => requests.filter((r) => r.path.endsWith(path));

async function material(user: User) {
  await within(dock()).findByRole("option", { name: /^1\.4307/ });
  await user.selectOptions(within(dock()).getByLabelText("Grade (Table 5.1)"), "1.4307");
  await user.type(within(dock()).getByLabelText(/^E \[/), "200000");
}

async function openSection(user: User) {
  await user.click(group(/^Section/));
}

async function typeInto(user: User, label: RegExp, value: string) {
  await user.type(within(dock()).getByLabelText(label), value);
}

/** The rolled I-section of plan.md 4c, every field typed, ready for the engine. */
async function fillRolledI(user: User) {
  await material(user);
  await openSection(user);
  await user.selectOptions(within(dock()).getByLabelText(/^Section type/), "I-section");
  await user.selectOptions(within(dock()).getByLabelText(/^Fabrication/), "rolled");
  await typeInto(user, /^Overall height h/, "200");
  await typeInto(user, /^Overall width b/, "100");
  await typeInto(user, /^Web thickness/, "5.6");
  await typeInto(user, /^Flange thickness/, "8.5");
  await typeInto(user, /^Root radius r/, "12");
  await typeInto(user, /^Area A/, "2848");
  await typeInto(user, /^γM0/, "1.1");
  await user.click(group(/^Deformation capacity/));
  await typeInto(user, /^k_?σ, web/, "4");
  await typeInto(user, /^k_?σ, flange outstand/, "0.43");
  await typeInto(user, /^Poisson/, "0.3");
  await typeInto(user, /^Ω/, "15");
}

describe("the Section group", () => {
  it("lists section type, fabrication, the geometry button, the dimensions, then A, γM0 and holes, in that order", async () => {
    const user = userEvent.setup();
    renderApp();
    await openSection(user);
    await user.selectOptions(within(dock()).getByLabelText(/^Section type/), "I-section");
    const body = dock().querySelector("#dock-section") as HTMLElement;
    const order = [
      "[data-field=sectionType]",
      "[data-field=fabrication]",
      ".geometry-button",
      "[data-field=h]",
      "[data-field=tf]",
      "[data-field=area]",
      "[data-field=gammaM0]",
      ".field-check",
    ].map((selector) => body.querySelector(selector) as HTMLElement);
    order.forEach((element, index) => {
      expect(element, String(index)).toBeInTheDocument();
      if (index > 0) {
        expect(order[index - 1].compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      }
    });
  });

  it("asks nothing until the section type is chosen, then shows a schematic and empty fields", async () => {
    const user = userEvent.setup();
    renderApp();
    await openSection(user);
    expect(within(dock()).queryByRole("button", { name: /Section geometry/ })).not.toBeInTheDocument();
    expect(within(dock()).queryByRole("img", { name: /Thumbnail/ })).not.toBeInTheDocument();
    await user.selectOptions(within(dock()).getByLabelText(/^Section type/), "channel");
    // the dock holds a small thumbnail; the big drawing is in the window, a schematic for now
    expect(within(dock()).getByRole("img", { name: /Thumbnail of the channel, schematic/ })).toBeInTheDocument();
    expect(within(dock()).queryByRole("img", { name: /sketch/ })).not.toBeInTheDocument();
    for (const label of [/^Overall height h/, /^Overall width b/, /^Web thickness/, /^Flange thickness/]) {
      expect(within(dock()).getByLabelText(label)).toHaveValue(null);
    }
    // no corner field until rolled or welded is chosen, and no default for it
    expect(within(dock()).getByLabelText(/^Fabrication/)).toHaveValue("");
    expect(within(dock()).queryByLabelText(/^Root radius r/)).not.toBeInTheDocument();
    expect(within(dock()).queryByLabelText(/^Weld leg s/)).not.toBeInTheDocument();
    await user.selectOptions(within(dock()).getByLabelText(/^Fabrication/), "welded");
    expect(within(dock()).getByLabelText(/^Weld leg s/)).toHaveValue(null);
    expect(within(dock()).queryByLabelText(/^Root radius r/)).not.toBeInTheDocument();
    await openGeometry(user);
    expect(sketch()).toHaveAccessibleName(/Schematic, not to scale/);
    expect(within(geometry()).getByText(/Schematic: not to scale until every dimension is given/)).toBeInTheDocument();
  });

  it.each([
    ["I-section", ["h", "b", "tw", "tf", "r"]],
    ["channel", ["h", "b", "tw", "tf", "r"]],
    ["T-section", ["h", "b", "tw", "tf", "r", "cStem"]],
    ["angle", ["h", "b", "t", "r"]],
    ["rectangular hollow section", ["h", "b", "t", "rO"]],
    ["circular hollow section", ["d", "t"]],
  ])("%s: its dimension fields, each with a ? button", async (type, keys) => {
    const user = userEvent.setup();
    renderApp();
    await openSection(user);
    await user.selectOptions(within(dock()).getByLabelText(/^Section type/), type);
    if (["I-section", "channel", "T-section"].includes(type)) {
      await user.selectOptions(within(dock()).getByLabelText(/^Fabrication/), "rolled");
    }
    for (const key of keys) {
      expect(field(key), key).toBeInTheDocument();
      expect(field(key).querySelector("input")).toHaveValue(null);
      expect(await within(field(key)).findByRole("button", { name: /^What is / })).toBeInTheDocument();
      expect(field(key)).not.toHaveTextContent(/Used in/);
    }
    expect(dock().querySelectorAll(".dimension-fields [data-field]")).toHaveLength(keys.length);
  });

  it("counts every empty dimension in the group header", async () => {
    const user = userEvent.setup();
    renderApp();
    await openSection(user);
    expect(group(/^Section/)).toHaveTextContent("3 to enter"); // type, A, γM0
    await user.selectOptions(within(dock()).getByLabelText(/^Section type/), "I-section");
    // type given; fabrication, h, b, t_w, t_f, A, γM0 empty
    expect(group(/^Section/)).toHaveTextContent("7 to enter");
    await user.selectOptions(within(dock()).getByLabelText(/^Fabrication/), "rolled");
    expect(group(/^Section/)).toHaveTextContent("7 to enter"); // fabrication given, r is now asked for
    await typeInto(user, /^Root radius r/, "12");
    expect(group(/^Section/)).toHaveTextContent("6 to enter");
  });

  it("the sketch is drawn to scale, with the typed values, once the dimensions are complete", async () => {
    const user = userEvent.setup();
    renderApp();
    await openSection(user);
    await user.selectOptions(within(dock()).getByLabelText(/^Section type/), "I-section");
    await user.selectOptions(within(dock()).getByLabelText(/^Fabrication/), "rolled");
    await typeInto(user, /^Overall height h/, "200");
    await typeInto(user, /^Overall width b/, "100");
    await typeInto(user, /^Web thickness/, "5.6");
    await typeInto(user, /^Flange thickness/, "8.5");
    await openGeometry(user);
    expect(sketch()).toHaveAccessibleName(/Schematic/); // r is still missing
    await typeInto(user, /^Root radius r/, "12");
    expect(sketch()).toHaveAccessibleName(/Drawn to scale.*h = 200 mm, b = 100 mm/);
    expect(dimLine("h")).toHaveTextContent("h = 200");
    expect(dimLine("r")).toHaveTextContent("r = 12");
    // no engine answer yet: the bands carry the symbol only
    expect(geometry().querySelector('[data-band="c_w"]')).toHaveTextContent(/^c_?w$/);
  });

  it("shows a message naming the dimensions when the shape cannot exist, and stays a schematic", async () => {
    const user = userEvent.setup();
    renderApp();
    await openSection(user);
    await user.selectOptions(within(dock()).getByLabelText(/^Section type/), "I-section");
    await user.selectOptions(within(dock()).getByLabelText(/^Fabrication/), "rolled");
    await typeInto(user, /^Overall height h/, "200");
    await typeInto(user, /^Overall width b/, "100");
    await typeInto(user, /^Web thickness/, "5.6");
    await typeInto(user, /^Flange thickness/, "100");
    await typeInto(user, /^Root radius r/, "12");
    await openGeometry(user);
    expect(within(geometry()).getByText(/2t.*not less than h/)).toBeInTheDocument();
    expect(sketch()).toHaveAccessibleName(/Schematic/);
  });
});

describe("field and sketch linking", () => {
  async function ready(user: User) {
    renderApp();
    await openSection(user);
    await user.selectOptions(within(dock()).getByLabelText(/^Section type/), "I-section");
    await user.selectOptions(within(dock()).getByLabelText(/^Fabrication/), "rolled");
    await openGeometry(user); // the linked sketch and fields are in the Section geometry window
  }

  it("focusing a field highlights its dimension line", async () => {
    const user = userEvent.setup();
    await ready(user);
    await user.click(within(geometry()).getByLabelText(/^Web thickness/));
    expect(dimLine("tw")).toHaveClass("is-active");
    expect(dimLine("h")).not.toHaveClass("is-active");
    await user.click(within(geometry()).getByLabelText(/^Overall width b/));
    expect(dimLine("b")).toHaveClass("is-active");
    expect(dimLine("tw")).not.toHaveClass("is-active");
  });

  it("hovering a dimension line highlights its field", async () => {
    const user = userEvent.setup();
    await ready(user);
    await user.hover(dimLine("tf"));
    expect(modalField("tf")).toHaveClass("field-highlight");
    expect(modalField("tw")).not.toHaveClass("field-highlight");
    await user.unhover(dimLine("tf"));
    expect(modalField("tf")).not.toHaveClass("field-highlight");
  });

  it("clicking a dimension line focuses its field", async () => {
    const user = userEvent.setup();
    await ready(user);
    fireEvent.click(dimLine("h"));
    expect(within(geometry()).getByLabelText(/^Overall height h/)).toHaveFocus();
    fireEvent.click(dimLine("r"));
    expect(within(geometry()).getByLabelText(/^Root radius r/)).toHaveFocus();
  });
});

describe("missing dimensions and k_σ are 'Waiting for' links", () => {
  it("every empty dimension is a link that opens the Section group and focuses the field", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(tab(/Deformation/));
    await openSection(user);
    await user.selectOptions(within(dock()).getByLabelText(/^Section type/), "T-section");
    const results = screen.getByRole("region", { name: "Deformation capacity results" });
    for (const link of [/fabrication/, /height h/, /width b/, /web thickness t_?w/, /flange thickness t_?f/]) {
      expect(within(results).getByRole("status")).toHaveTextContent(link);
    }
    await user.selectOptions(within(dock()).getByLabelText(/^Fabrication/), "welded");
    expect(within(results).getByRole("status")).toHaveTextContent(/weld leg s/);
    expect(within(results).getByRole("status")).toHaveTextContent(/stem flat width c_?stem/);

    await user.click(group(/^Material/));
    await user.click(within(results).getByRole("button", { name: /the stem flat width/ }));
    expect(group(/^Section/)).toHaveAttribute("aria-expanded", "true");
    expect(within(dock()).getByLabelText(/^Stem flat width/)).toHaveFocus();
  });

  it("each k_σ is a link to its own field in the Deformation group", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(tab(/Deformation/));
    await openSection(user);
    await user.selectOptions(within(dock()).getByLabelText(/^Section type/), "I-section");
    const results = screen.getByRole("region", { name: "Deformation capacity results" });
    await user.click(within(results).getByRole("button", { name: /k_?σ of the flange outstand/ }));
    expect(group(/^Deformation capacity/)).toHaveAttribute("aria-expanded", "true");
    expect(within(dock()).getByLabelText(/^k_?σ, flange outstand/)).toHaveFocus();
  });
});

describe("the Deformation group on the template route", () => {
  it("lists the plates of the shape with the c rule as text and one empty k_σ each", async () => {
    const user = userEvent.setup();
    renderApp();
    await openSection(user);
    await user.selectOptions(within(dock()).getByLabelText(/^Section type/), "I-section");
    await user.click(group(/^Deformation capacity/));
    expect(within(dock()).getByLabelText(/^Slenderness from/)).toHaveValue("template");
    const web = field("kSigma-web");
    const flange = field("kSigma-flange");
    expect(web.querySelector("input")).toHaveValue(null);
    expect(flange.querySelector("input")).toHaveValue(null);
    expect(web).toHaveTextContent(/internal plate: c = h − 2t.*2r or s/);
    expect(flange).toHaveTextContent(/outstand plate: c = \(b − t.*\) \/ 2/);
    await user.click(group(/^Section/));
    await user.selectOptions(within(dock()).getByLabelText(/^Fabrication/), "welded");
    await user.click(group(/^Deformation capacity/));
    expect(field("kSigma-web")).toHaveTextContent(/c = h − 2t.*2s/);
    // ν and Ω as before; no k_σ default
    expect(within(dock()).getByLabelText(/^Poisson/)).toHaveValue(null);
    expect(within(dock()).getByLabelText(/^Ω/)).toHaveValue(null);
  });

  it("offers the three routes for a template shape and two for a tube", async () => {
    const user = userEvent.setup();
    renderApp();
    await openSection(user);
    await user.selectOptions(within(dock()).getByLabelText(/^Section type/), "angle");
    await user.click(group(/^Deformation capacity/));
    const route = within(dock()).getByLabelText(/^Slenderness from/);
    expect(within(route).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Section dimensions (8.2.2(5))",
      "Flat plates entered one by one",
      "A typed critical stress σ_cr,cs",
    ]);
    expect(field("kSigma-leg")).toHaveTextContent(/b̄ = h/);
    await user.click(group(/^Section/));
    await user.selectOptions(within(dock()).getByLabelText(/^Section type/), "circular hollow section");
    await user.click(group(/^Deformation capacity/));
    expect(
      within(within(dock()).getByLabelText(/^Slenderness from/)).getAllByRole("option").map((o) => o.textContent),
    ).toEqual(["Diameter and thickness (B.10, B.11)", "A typed critical stress σ_cr,cs"]);
  });

  it("the typed σ_cr,cs route still works, and needs no dimensions", async () => {
    const user = userEvent.setup();
    renderApp();
    await openSection(user);
    await user.selectOptions(within(dock()).getByLabelText(/^Section type/), "I-section");
    await user.click(group(/^Deformation capacity/));
    await user.selectOptions(within(dock()).getByLabelText(/^Slenderness from/), "sigma_cr");
    await user.click(group(/^Section/));
    expect(within(dock()).queryByLabelText(/^Overall height h/)).not.toBeInTheDocument();
    expect(within(dock()).getByText(/needs no section dimensions/)).toBeInTheDocument();
    expect(within(dock()).queryByRole("button", { name: /Section geometry/ })).not.toBeInTheDocument();
    expect(within(dock()).queryByRole("img", { name: /Thumbnail/ })).not.toBeInTheDocument();
  });

  it("the manual plates route still works", async () => {
    const user = userEvent.setup();
    renderApp();
    await openSection(user);
    await user.selectOptions(within(dock()).getByLabelText(/^Section type/), "I-section");
    await user.click(group(/^Deformation capacity/));
    await user.selectOptions(within(dock()).getByLabelText(/^Slenderness from/), "plates");
    expect(within(dock()).getByLabelText(/^Flat width/)).toBeInTheDocument();
    await user.click(group(/^Section/));
    expect(within(dock()).queryByLabelText(/^Overall height h/)).not.toBeInTheDocument();
    expect(within(dock()).getByText(/entered one by one in the Deformation group/)).toBeInTheDocument();
  });
});

describe("with everything typed for a rolled I-section", () => {
  it("sends the template to the engine: dimensions, fabrication and one k_σ per role", async () => {
    const user = userEvent.setup();
    renderApp();
    await fillRolledI(user);
    await waitFor(() => expect(calls("/deformation-capacity").length).toBeGreaterThan(0));
    const body = calls("/deformation-capacity").at(-1)?.body as unknown as Record<string, unknown>;
    expect(body.geometry).toEqual({
      kind: "template",
      shape: "I-section",
      fabrication: "rolled",
      h: 200,
      b: 100,
      t_w: 5.6,
      t_f: 8.5,
      r: 12,
      k_sigma: { web: 4, flange: 0.43 },
    });
    expect(body).toMatchObject({ omega: 15, poisson_ratio: 0.3 });
  });

  it("the sketch then shows the engine's c values, from the B.5 response", async () => {
    const user = userEvent.setup();
    renderApp();
    await fillRolledI(user);
    await user.click(group(/^Section/));
    await openGeometry(user);
    await waitFor(() => expect(geometry().querySelector('[data-band="c_w"]')).toHaveTextContent("cw = 159"));
    expect(geometry().querySelector('[data-band="c_f"]')).toHaveTextContent("cf = 35.2");
  });

  it("the sketch stops showing a c as soon as a dimension is edited, until the engine answers again", async () => {
    const user = userEvent.setup();
    renderApp();
    await fillRolledI(user);
    await user.click(group(/^Section/));
    await openGeometry(user);
    await waitFor(() => expect(geometry().querySelector('[data-band="c_w"]')).toHaveTextContent("cw = 159"));
    await user.type(within(geometry()).getByLabelText(/^Overall height h/), "1");
    expect(geometry().querySelector('[data-band="c_w"]')).toHaveTextContent(/^c_?w$/);
  });

  it("the Deformation tab shows each c, its type, thickness and where it came from", async () => {
    const user = userEvent.setup();
    renderApp();
    await fillRolledI(user);
    await user.click(tab(/Deformation/));
    const results = screen.getByRole("region", { name: "Deformation capacity results" });
    const table = await within(results).findByRole("table");
    expect(within(table).getByText("web (most slender)")).toBeInTheDocument();
    expect(within(table).getByText("internal")).toBeInTheDocument();
    expect(within(table).getByText("outstand")).toBeInTheDocument();
    expect(within(table).getByText("159")).toBeInTheDocument();
    expect(within(table).getByText("35.2")).toBeInTheDocument();
    expect(within(table).getByText(/c as drawn in Table 7\.2/)).toBeInTheDocument();
    expect(within(table).getByText(/c as drawn in Table 7\.3/)).toBeInTheDocument();
    expect(within(results).getByText(/derived from the section dimensions as 8\.2\.2\(5\)/)).toBeInTheDocument();
  });

  it("Compression takes the same template and sends A and γM0 with it", async () => {
    const user = userEvent.setup();
    renderApp();
    await fillRolledI(user);
    await user.click(tab(/Compression/));
    const results = screen.getByRole("region", { name: "Compression results" });
    expect(await within(results).findByText(/Formula B\.16 applies/)).toBeInTheDocument();
    const body = calls("/compression").at(-1)?.body as unknown as Record<string, unknown>;
    expect(body).toMatchObject({ area: 2848, gamma_m0: 1.1 });
    expect(body.geometry).toMatchObject({ kind: "template", shape: "I-section" });
  });

  it("Explore asks the comparison with the template and draws the assembled section", async () => {
    const user = userEvent.setup();
    renderApp();
    await fillRolledI(user);
    await user.click(tab(/Explore/));
    expect(await screen.findByLabelText("3D scene")).toBeInTheDocument();
    const body = calls("/section-comparison").at(-1)?.body as unknown as Record<string, unknown>;
    expect(body.geometry).toMatchObject({ kind: "template", h: 200, t_w: 5.6, t_f: 8.5 });
  });

  it("an impossible shape is the engine's 422 in the Deformation tab, not a crash", async () => {
    const user = userEvent.setup();
    renderApp();
    await fillRolledI(user);
    await user.click(group(/^Section/));
    const flange = within(dock()).getByLabelText(/^Flange thickness/);
    await user.clear(flange);
    await user.type(flange, "100");
    await user.click(tab(/Deformation/));
    const results = screen.getByRole("region", { name: "Deformation capacity results" });
    expect(await within(results).findByRole("alert")).toHaveTextContent(/2 t_f/);
  });
});
