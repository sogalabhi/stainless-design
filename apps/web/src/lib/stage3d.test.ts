import { describe, expect, it } from "vitest";
import type { BendingResponse } from "../api/types";
import bendingTemplate from "../test/fixtures/bending_template.json";
import { bendingView, profileAt } from "./stage";
import {
  LENGTH_PER_SIDE,
  MAGNIFICATION_RULE,
  STAGE_MAGNIFICATION,
  faceArrows,
  faceToWorld,
  intervalsAt,
  lengthPerStress,
  memberPose,
  restPose,
  stageBody,
  stageCorners,
  stressTone,
} from "./stage3d";
import type { StageSection } from "./stageSection";

const dims = { h: 200, b: 100, tw: 5.6, tf: 8.5, t: null, d: null, r: 12, s: null, cStem: null, rO: null };
const upright: StageSection = { shape: "I-section", fabrication: "rolled", dims, turned: false, width: 100, height: 200 };
const turned: StageSection = { ...upright, turned: true, width: 200, height: 100 };
const body = stageBody(upright);
const frames = bendingView(bendingTemplate as unknown as BendingResponse).frames.frames;
const last = frames[frames.length - 1];

describe("the member of the 3D cut", () => {
  it("is drawn LENGTH_PER_SIDE times the larger side", () => {
    expect(body.length).toBe(LENGTH_PER_SIDE * 200);
    expect(body.halfDepth).toBe(100);
  });

  it("keeps the depth on y when turned for minor-axis bending", () => {
    const t = stageBody(turned);
    const ys = t.solids[0].outer.map(([, y]) => y);
    const xs = t.solids[0].outer.map(([x]) => x);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(100, 6);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(200, 6);
  });

  it("states one magnification rule for every case", () => {
    expect(MAGNIFICATION_RULE).toContain(String(STAGE_MAGNIFICATION));
  });
});

describe("how the member deforms", () => {
  const strain = 0.00358;
  const shift = (key: "tension" | "compression") => memberPose(key, strain, body).face.position[2];

  it("compression shortens it: the cut face moves in from the unloaded face, by strain x length x factor", () => {
    expect(shift("compression")).toBeCloseTo(-strain * STAGE_MAGNIFICATION * body.length, 9);
    expect(shift("compression")).toBeLessThan(0);
    // the far end is held
    expect(memberPose("compression", strain, body).place(0, 0, 0)[2]).toBeCloseTo(-body.length);
    expect(memberPose("compression", strain, body).place(0, 0, 1)[2]).toBeCloseTo(shift("compression"));
  });

  it("tension lengthens it by the same rule", () => {
    expect(shift("tension")).toBeCloseTo(strain * STAGE_MAGNIFICATION * body.length, 9);
    expect(shift("tension")).toBeGreaterThan(0);
  });

  it("an unloaded member is the unloaded outline", () => {
    for (const key of ["tension", "compression", "bending"] as const) {
      const pose = memberPose(key, 0, body);
      expect(pose.place(10, 20, 0.5)).toEqual(restPose(body.length).place(10, 20, 0.5));
      expect(Math.abs(pose.face.position[2]) + Math.abs(pose.face.rotationX)).toBeLessThan(1e-9);
    }
  });

  it("bending: the top fibres shorten, the bottom fibres lengthen, the face turns about the neutral axis", () => {
    const pose = memberPose("bending", 0.01575, body);
    const rest = restPose(body.length);
    const [, , zTop] = pose.place(0, 100, 1);
    const [, , zBottom] = pose.place(0, -100, 1);
    const [, , zRest] = rest.place(0, 0, 1);
    expect(zTop).toBeLessThan(zRest);
    expect(zBottom).toBeGreaterThan(zRest);
    // the fibre at height y is (1 - kappa y) times the arc: strain times magnification at the edge
    expect(pose.face.rotationX).toBeLessThan(0);
    // the neutral axis keeps its length: arc length = member length
    const mid = [0, 0.25, 0.5, 0.75, 1].map((s) => pose.place(0, 0, s));
    let arc = 0;
    for (let i = 1; i < mid.length; i += 1) arc += Math.hypot(mid[i][1] - mid[i - 1][1], mid[i][2] - mid[i - 1][2]);
    expect(arc).toBeLessThanOrEqual(body.length + 1e-6);
    expect(arc).toBeGreaterThan(body.length * 0.95);
  });

  it("a point of the cut face's own frame lands where the member's own placement puts it", () => {
    const pose = memberPose("bending", 0.01575, body);
    const direct = pose.place(30, 70, 1);
    const viaFace = faceToWorld(pose, [30, 70, 0]);
    viaFace.forEach((v, i) => expect(v).toBeCloseTo(direct[i], 6));
  });

  it("the camera fit holds the unloaded member, the member at its limit and the longest arrow", () => {
    const limit = memberPose("bending", last.strain, body);
    const corners = stageCorners(body, limit, 100);
    const zs = corners.map((c) => c[2]);
    expect(Math.min(...zs)).toBeLessThanOrEqual(-body.length + 1e-9);
    expect(Math.max(...zs)).toBeGreaterThan(0);
  });
});

describe("the arrows on the cut face", () => {
  it("find the material of a section on a slice: two flanges and a web", () => {
    expect(intervalsAt(body.solids, 0)).toHaveLength(1); // the web
    expect(intervalsAt(body.solids, 0)[0][1] - intervalsAt(body.solids, 0)[0][0]).toBeCloseTo(5.6, 6);
    expect(intervalsAt(body.solids, 96)).toHaveLength(1); // the flange
    expect(intervalsAt(body.solids, 96)[0]).toEqual([-50, 50]);
  });

  it("find two walls of a hollow section", () => {
    const hollow = stageBody({ shape: "rectangular hollow section", fabrication: null, dims: { ...dims, h: 150, b: 100, t: 5, r: null, tw: null, tf: null }, turned: false, width: 100, height: 150 });
    expect(intervalsAt(hollow.solids, 0)).toHaveLength(2);
  });

  it("press in compression, pull in tension, and are as long as the stress", () => {
    const scale = lengthPerStress(body, last.stress);
    const arrows = faceArrows(body, last, scale);
    expect(arrows.length).toBeGreaterThan(10);
    const top = arrows.filter((a) => a.y > 50);
    const bottom = arrows.filter((a) => a.y < -50);
    expect(top.every((a) => a.press)).toBe(true);
    expect(bottom.every((a) => !a.press)).toBe(true);
    for (const a of arrows) expect(a.length).toBeCloseTo(Math.abs(profileAt(last.depth, last.stress_profile, a.y / 100)) * scale, 6);
    // the longest arrow is the stress at the slice nearest the edge, just under 0.55 of the larger side
    const longest = Math.max(...arrows.map((a) => a.length));
    expect(longest).toBeLessThanOrEqual(0.55 * 200);
    expect(longest).toBeGreaterThan(0.5 * 200);
  });

  it("are shorter at a smaller strain, and absent when unloaded", () => {
    const scale = lengthPerStress(body, last.stress);
    const mid = frames[Math.floor(frames.length / 4)];
    const longest = (f: typeof last) => Math.max(0, ...faceArrows(body, f, scale).map((a) => a.length));
    expect(longest(mid)).toBeLessThan(longest(last));
    expect(faceArrows(body, frames[0], scale)).toEqual([]);
  });

  it("tone: soft up to f_y, deeper with the hardening above", () => {
    expect(stressTone(105, 210, 256)).toMatchObject({ side: "comp", soft: 0.5, deep: 0 });
    expect(stressTone(-256, 210, 256)).toMatchObject({ side: "tens", soft: 1, deep: 1 });
  });
});
