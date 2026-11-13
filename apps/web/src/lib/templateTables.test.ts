import { describe, expect, it } from "vitest";
import { EMPTY_DIMS } from "./sectionTemplates";
import { platesFromLinks } from "./geometry";
import { templateNodesAndLinks } from "./templateTables";

const noK = { web: null, flange: null, stem: null, leg: null };

describe("a template as nodes and links", () => {
  it("makes the I-section of the example: 6 nodes, 5 links, centre lines, k_σ carried over by role", () => {
    const dims = { ...EMPTY_DIMS, h: 200, b: 100, tw: 6, tf: 10 };
    const tables = templateNodesAndLinks("I-section", dims, { ...noK, web: 4, flange: 0.43 })!;
    expect(tables.nodes).toHaveLength(6);
    expect(tables.links).toHaveLength(5);
    expect(tables.nodes[4]).toMatchObject({ id: 5, x: 50, y: 195 });
    expect(tables.links[2]).toMatchObject({ label: "web", from: 2, to: 5, thickness: 6, kSigma: 4 });
    expect(tables.links[0].kSigma).toBe(0.43);
    const plates = platesFromLinks(tables.nodes, tables.links);
    expect(plates[2].width).toBe(190); // the web centre line, flange centre to flange centre
    expect(plates[0].width).toBe(50);
  });

  it("leaves k_σ empty when none was typed, and gives nothing for a tube or missing dimensions", () => {
    const dims = { ...EMPTY_DIMS, h: 100, b: 50, t: 5 };
    expect(templateNodesAndLinks("rectangular hollow section", dims, noK)!.links.every((l) => l.kSigma === null)).toBe(true);
    expect(templateNodesAndLinks("circular hollow section", dims, noK)).toBeNull();
    expect(templateNodesAndLinks("I-section", EMPTY_DIMS, noK)).toBeNull();
  });

  it("every link of every shape joins two nodes that exist", () => {
    const dims = { ...EMPTY_DIMS, h: 120, b: 80, tw: 5, tf: 8, t: 6 };
    for (const type of ["I-section", "channel", "T-section", "angle", "rectangular hollow section"] as const) {
      const tables = templateNodesAndLinks(type, dims, noK)!;
      const ids = new Set(tables.nodes.map((n) => n.id));
      for (const link of tables.links) {
        expect(ids.has(link.from!) && ids.has(link.to!)).toBe(true);
        expect(link.thickness).toBeGreaterThan(0);
      }
    }
  });
});
