import { describe, expect, it } from "vitest";
import { sceneSection } from "./comparison";
import { exploreItems, sceneSolids, wrinkleField, type SceneItem } from "./exploreScene";
import { defaultDeformationForm, type DeformationFormState } from "./geometry";

const rolledI: DeformationFormState = {
  ...defaultDeformationForm,
  kind: "template",
  shape: "I-section",
  fabrication: "rolled",
  h: 200,
  b: 100,
  tw: 6,
  tf: 10,
  r: 12,
};

const section = sceneSection(rolledI, 1)!;
const tube = sceneSection({ ...defaultDeformationForm, kind: "chs", d: 100, t: 3 }, 1)!;

function item(id: string, over: Partial<SceneItem> = {}): SceneItem {
  return { id, label: id, detail: "Stocky", section, wrinkle: 0, zone: "stocky", governing: "web", ...over };
}

describe("the Explore sections as viewer items", () => {
  it("extrudes the true outline: fillets in, welds as their own solids", () => {
    const [rolled] = sceneSolids(section);
    expect(rolled.outer.length).toBeGreaterThan(12); // 12 corners plus the fillet arcs
    const welded = sceneSection({ ...rolledI, fabrication: "welded", s: 5 }, 1)!;
    expect(sceneSolids(welded)).toHaveLength(5);
    const [ring] = sceneSolids(tube);
    expect(ring.holes).toHaveLength(1);
  });

  it("draws every item the same length (twice the widest section) and says it is illustrative", () => {
    const items = exploreItems([item("a"), item("b", { section: tube })]);
    expect(items.map((i) => i.length)).toEqual([400, 400]);
    expect(items.every((i) => i.status?.kind === "illustrative")).toBe(true);
    expect(items[0].tone).toBe("stocky");
    expect(items[0].labels?.map((l) => l.text)).toEqual(["web, governing", "compression"]);
    expect(items[0].arrows).toHaveLength(2);
  });

  it("draws a flat section when the wrinkle is 0", () => {
    expect(wrinkleField(section, 0, "web")).toBeUndefined();
    expect(exploreItems([item("a")])[0].displacement).toBeUndefined();
  });

  it("only the governing plate moves: the web bows sideways, the flanges stay", () => {
    const web = wrinkleField(section, 1, "web")!;
    const quarter = 0.25; // a crest of the two half-waves along the member
    expect(web(3, 0, quarter)[0]).toBeCloseTo(0.18 * 180); // mid-height of the web, full wave
    expect(web(3, 90, quarter)).toEqual([0, 0]); // where the web meets the flange
    expect(web(40, 95, quarter)).toEqual([0, 0]); // in a flange
    expect(web(3, 0, 0)[0]).toBeCloseTo(0); // flat at the ends
  });

  it("a governing flange turns its outstands about the root, the web stays", () => {
    const flange = wrinkleField(section, 1, "flange")!;
    expect(flange(3, 0, 0.25)).toEqual([0, 0]);
    expect(flange(50, 100, 0.25)[1]).toBeCloseTo(0.18 * 100);
    expect(flange(-50, 100, 0.25)[1]).toBeCloseTo(-0.18 * 100);
    expect(flange(15, 100, 0.25)[1]).toBeCloseTo(0); // at the end of the fillet
  });

  it("a tube's wall moves in and out all round", () => {
    const ring = wrinkleField(tube, 1)!;
    const [dx, dy] = ring(0, 50, 1 / 8);
    expect(dx).toBeCloseTo(0);
    expect(dy).toBeCloseTo(0.04 * 100);
  });
});
