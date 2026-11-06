import {
  AmbientLight,
  Box3,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  EdgesGeometry,
  LineBasicMaterial,
  LineSegments,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Quaternion,
  Scene,
  Vector3,
} from "three";
import { boxCorners } from "./camera";
import { memberGeometry } from "./extrude";
import type { Arrow, Tone, Vec3, ViewerItem } from "./types";

/** The data colours (the zone swatches of the page), light and dark. Colour is only ever data. */
export const TONE_COLOUR: Record<Tone, { light: string; dark: string }> = {
  stocky: { light: "#2a78d6", dark: "#3987e5" },
  slender: { light: "#898781", dark: "#a5a39b" },
  not_allowed: { light: "#d03b3b", dark: "#e25555" },
  neutral: { light: "#b8b6ae", dark: "#6b6a66" },
};

const INK = { light: "#1a1a19", dark: "#e8e8e6" };
const ARROW_COLOUR = "#eb6834";
/** Faces closer than this angle (degrees) share an edge line: arcs stay smooth, real corners get a line. */
const EDGE_ANGLE = 28;

export type ItemScene = {
  scene: Scene;
  /** the corners of the box holding everything drawn, for the fit */
  corners: Vec3[];
  dispose: () => void;
};

function arrowParts(arrow: Arrow, material: MeshBasicMaterial, geometries: BufferGeometry[]): Mesh[] {
  const direction = new Vector3(...arrow.direction).normalize();
  const head = Math.min(arrow.length * 0.35, arrow.length);
  const shaft = arrow.length - head;
  const radius = head * 0.32;
  const turn = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction);
  const from = new Vector3(...arrow.from);
  const meshes: Mesh[] = [];
  if (shaft > 0) {
    const geometry = new CylinderGeometry(radius * 0.3, radius * 0.3, shaft, 12);
    geometries.push(geometry);
    const mesh = new Mesh(geometry, material);
    mesh.quaternion.copy(turn);
    mesh.position.copy(from).addScaledVector(direction, shaft / 2);
    meshes.push(mesh);
  }
  const cone = new ConeGeometry(radius, head, 20);
  geometries.push(cone);
  const tip = new Mesh(cone, material);
  tip.quaternion.copy(turn);
  tip.position.copy(from).addScaledVector(direction, shaft + head / 2);
  meshes.push(tip);
  return meshes;
}

/** One item as its own scene: the member with its edge lines, its arrows and two lights. */
export function buildItemScene(item: ViewerItem, dark: boolean): ItemScene {
  const theme = dark ? "dark" : "light";
  const scene = new Scene();
  scene.add(new AmbientLight(0xffffff, 1.5));
  const key = new DirectionalLight(0xffffff, 1.6);
  key.position.set(-0.7, 1, 0.9);
  scene.add(key);
  const fill = new DirectionalLight(0xffffff, 0.5);
  fill.position.set(0.8, -0.5, -0.6);
  scene.add(fill);

  const geometries: BufferGeometry[] = [];
  const materials: Material[] = [];

  const geometry = memberGeometry(item.section, item.length, {
    displacement: item.displacement,
    stations: item.stations,
  });
  const face = new MeshLambertMaterial({
    color: TONE_COLOUR[item.tone][theme],
    flatShading: true,
    // pushed back a little so the edge lines are drawn on top of the faces
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  const edges = new EdgesGeometry(geometry, EDGE_ANGLE);
  const ink = new LineBasicMaterial({ color: INK[theme] });
  geometries.push(geometry, edges);
  materials.push(face, ink);
  scene.add(new Mesh(geometry, face));
  scene.add(new LineSegments(edges, ink));

  if (item.arrows && item.arrows.length > 0) {
    const arrowMaterial = new MeshBasicMaterial({ color: ARROW_COLOUR });
    materials.push(arrowMaterial);
    for (const arrow of item.arrows) {
      for (const mesh of arrowParts(arrow, arrowMaterial, geometries)) scene.add(mesh);
    }
  }

  const box = new Box3().setFromObject(scene);
  const corners = box.isEmpty() ? [] : boxCorners(box.min.toArray() as Vec3, box.max.toArray() as Vec3);
  return {
    scene,
    corners,
    dispose: () => {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      scene.clear();
    },
  };
}
