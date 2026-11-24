import { describe, expect, it } from "vitest";
import { depthY, stageLayout } from "./stageLayout";
import { forceArrows } from "./stageForces";

const L = stageLayout(null, 15, 300, 210);

describe("where the resultant forces stand on the drawing", () => {
  it("puts each force at its distance from the neutral axis, compression above", () => {
    const arrows = forceArrows(L, { distance_compression: 50, distance_tension: 50 }, 100, false)!;
    expect(arrows.compressionY).toBeCloseTo(depthY(L, 0.5));
    expect(arrows.tensionY).toBeCloseTo(depthY(L, -0.5));
    expect(arrows.compressionY).toBeLessThan(L.mid);
    expect(arrows.tensionY).toBeGreaterThan(L.mid);
  });

  it("turns the picture over for hogging: compression below the axis", () => {
    const arrows = forceArrows(L, { distance_compression: 50, distance_tension: 30 }, 100, true)!;
    expect(arrows.compressionY).toBeCloseTo(depthY(L, -0.5));
    expect(arrows.tensionY).toBeCloseTo(depthY(L, 0.3));
  });

  it("keeps an arrow on the drawing and draws none without a depth", () => {
    expect(forceArrows(L, { distance_compression: 500, distance_tension: 0 }, 100, false)!.compressionY).toBeCloseTo(L.top);
    expect(forceArrows(L, { distance_compression: 5, distance_tension: 5 }, 0, false)).toBeNull();
  });

  it("makes the drawing wider only when the forces are on", () => {
    expect(stageLayout(null, 15, 300, 210, true).viewW).toBeGreaterThan(L.viewW);
    expect(stageLayout(null, 15, 300, 210, false).viewW).toBe(L.viewW);
  });
});

import { blockToFibre, forceCardLines, readFibre } from "./stageForces";

describe("the force at a fibre, read from the engine's grid", () => {
  const depths = [-1, -0.5, 0, 0.5, 1];
  const widths = [100, 10, 8, 10, 100];
  const forces = [0, 40, 50, 40, 0];

  it("reads between two nodes the way the stress arrows read the profile", () => {
    expect(readFibre(depths, widths, forces, 0.25)).toEqual({ width: 9, force: 45 });
    expect(readFibre(depths, widths, forces, 0)).toEqual({ width: 8, force: 50 });
    expect(readFibre(depths, widths, forces, 1)).toEqual({ width: 100, force: 0 });
  });

  it("reads nothing where the engine gave no grid or a fibre off the section", () => {
    expect(readFibre(depths, widths, null, 0.2)).toBeNull();
    expect(readFibre([], [], [], 0.2)).toBeNull();
    expect(readFibre(depths, widths, forces, 1.5)).toBeNull();
  });

  it("outlines the block from the nearer edge to the fibre", () => {
    const valueAt = (u: number) => 100 * Math.abs(u);
    const top = blockToFibre([-1, -0.4, 0.4, 1], 0.2, valueAt);
    expect(top[0]).toEqual([0, 1]); // starts on the axis line at the edge
    expect(top.map(([, d]) => d)).toEqual([1, 1, 0.4, 0.2, 0.2]);
    const bottom = blockToFibre([-1, -0.4, 0.4, 1], -0.7, valueAt);
    expect(bottom[0]).toEqual([0, -1]);
    expect(bottom.map(([, d]) => d)).toEqual([-1, -1, -0.7, -0.7]);
  });

  it("writes the card of a force: the total, where it acts, and its parts", () => {
    const lines = forceCardLines(
      {
        force_compression: 345419,
        force_tension: 345419,
        distance_compression: 80,
        distance_tension: 80,
        parts: [
          { name: "elastic core", side: "compression", force: 3900, distance: 4.4, moment: 1 },
          { name: "yielded zone", side: "tension", force: 291200, distance: 79.5, moment: 1 },
        ],
      },
      "compression",
    );
    expect(lines).toEqual(["F_c = 345.4 kN", "acts 80.0 mm from the neutral axis", "elastic core: 3.9 kN at 4.4 mm"]);
  });
});
