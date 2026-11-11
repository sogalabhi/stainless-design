import { useEffect, useMemo, useRef, useState } from "react";
import {
  AmbientLight,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  OrthographicCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { StageFrameOut } from "../../api/types";
import { formatFixed } from "../../lib/format";
import { type StageView } from "../../lib/stage";
import {
  LENGTH_NOTE,
  MAGNIFICATION_RULE,
  STAGE_MAGNIFICATION,
  faceArrows,
  faceToWorld,
  lengthPerStress,
  memberPose,
  restPose,
  stageBody,
  stageCorners,
  stressAtHeight,
  stressTone,
  type StageBody,
} from "../../lib/stage3d";
import type { StageSection } from "../../lib/stageSection";
import { VIEW_DIRECTION, VIEW_LABEL, boundingRadius, fitHalfHeight } from "../viewer3d/camera";
import { capGeometry, memberGeometry, oriented, resampled } from "../viewer3d/extrude";
import { ndcToPixels, placeLabels } from "../viewer3d/labels";
import type { Vec3, ViewName } from "../viewer3d/types";

export const STAGE_WEBGL_MISSING =
  "The 3D cut needs WebGL, which this browser does not offer. The drawing holds the same values.";

const VIEWS: ViewName[] = ["iso", "side", "front"];
const MARGIN = 1.15;

type LabelSpec = { id: string; text: string; at: Vec3; plain?: boolean };

type Rig = {
  renderer: WebGLRenderer;
  camera: OrthographicCamera;
  controls: OrbitControls;
  scene: Scene;
  content: Group | null;
  labels: LabelSpec[];
  fitted: string;
  frame: number | null;
  halfHeight: number;
  aspect: number;
  request: () => void;
  disposeContent: (() => void) | null;
};

/** A colour of the page, read where the scene is built so it follows light and dark mode. */
function token(name: string, fallback: string): Color {
  const value = typeof document === "undefined" ? "" : getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return new Color(value || fallback);
}

type Palette = {
  steel: Color;
  steelEdge: Color;
  ink: Color;
  zero: Color;
  comp: { soft: Color; strong: Color; deep: Color };
  tens: { soft: Color; strong: Color; deep: Color };
};

function palette(): Palette {
  return {
    steel: token("--steel", "#b8c3cc"),
    steelEdge: token("--steel-edge", "#52616d"),
    ink: token("--text", "#1a1a19"),
    zero: token("--steel-cut", "#9dabb6"),
    comp: { soft: token("--comp-soft", "#f8cdb9"), strong: token("--orange", "#eb6834"), deep: token("--comp-deep", "#a53c0c") },
    tens: { soft: token("--tens-soft", "#c3daf8"), strong: token("--accent", "#2a78d6"), deep: token("--tens-deep", "#104281") },
  };
}

/** The envelope of the stress block: the section raised to the stress at each fibre, with walls. */
function envelopeGeometry(body: StageBody, height: (y: number) => number): BufferGeometry {
  const maxSegment = body.height / 40;
  const top = capGeometry(body.solids, (x, y) => [x, y, height(y)], undefined, maxSegment);
  const positions = Array.from(top.getAttribute("position").array);
  const indices = Array.from(top.getIndex()?.array ?? []);
  for (const solid of body.solids) {
    const loops = [oriented(resampled(solid.outer, maxSegment), true), ...(solid.holes ?? []).map((h) => oriented(resampled(h, maxSegment), false))];
    for (const loop of loops) {
      for (let i = 0; i < loop.length; i += 1) {
        const [ax, ay] = loop[i];
        const [bx, by] = loop[(i + 1) % loop.length];
        const base = positions.length / 3;
        positions.push(ax, ay, 0, bx, by, 0, bx, by, height(by), ax, ay, height(ay));
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** One arrow along z, from the tail to the head, with a head sized from the section. */
function arrowMeshes(
  x: number,
  y: number,
  tailZ: number,
  headZ: number,
  head: number,
  material: MeshBasicMaterial,
  geometries: BufferGeometry[],
): Mesh[] {
  const direction = Math.sign(headZ - tailZ) || 1;
  const total = Math.abs(headZ - tailZ);
  const headLength = Math.min(head, total * 0.5);
  const shaftLength = total - headLength;
  const meshes: Mesh[] = [];
  if (shaftLength > 0) {
    const shaft = new CylinderGeometry(head * 0.12, head * 0.12, shaftLength, 8);
    geometries.push(shaft);
    const mesh = new Mesh(shaft, material);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(x, y, tailZ + (direction * shaftLength) / 2);
    meshes.push(mesh);
  }
  const cone = new ConeGeometry(head * 0.36, headLength, 14);
  geometries.push(cone);
  const tip = new Mesh(cone, material);
  tip.rotation.x = (direction * Math.PI) / 2;
  tip.position.set(x, y, headZ - (direction * headLength) / 2);
  meshes.push(tip);
  return meshes;
}

type Content = { group: Group; labels: LabelSpec[]; dispose: () => void };

function buildContent(
  view: StageView,
  frame: StageFrameOut,
  body: StageBody,
  fy: number,
  stressTop: number,
): Content {
  const colours = palette();
  const geometries: BufferGeometry[] = [];
  const materials: Material[] = [];
  const group = new Group();
  const pose = memberPose(view.key, frame.strain, body);
  const rest = restPose(body.length);
  const face = new Group();
  face.position.set(...pose.face.position);
  face.rotation.x = pose.face.rotationX;

  // the member, deformed
  const bodyGeometry = memberGeometry(body.solids, body.length, { warp: pose.place, stations: 48 });
  const bodyMaterial = new MeshLambertMaterial({ color: colours.steel, flatShading: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const edgeMaterial = new LineBasicMaterial({ color: colours.steelEdge });
  const bodyEdges = new EdgesGeometry(bodyGeometry, 28);
  geometries.push(bodyGeometry, bodyEdges);
  materials.push(bodyMaterial, edgeMaterial);
  group.add(new Mesh(bodyGeometry, bodyMaterial), new LineSegments(bodyEdges, edgeMaterial));

  // the unloaded outline, faint
  if (frame.ratio > 0) {
    const restGeometry = memberGeometry(body.solids, body.length, { warp: rest.place, stations: 2 });
    const restEdges = new EdgesGeometry(restGeometry, 28);
    const restMaterial = new LineBasicMaterial({ color: colours.ink, transparent: true, opacity: 0.45 });
    geometries.push(restGeometry, restEdges);
    materials.push(restMaterial);
    group.add(new LineSegments(restEdges, restMaterial));
  }

  // the cut face, coloured by the stress at each fibre
  const side = (stress: number) => (stress >= 0 ? colours.comp : colours.tens);
  const colourAt = (_x: number, y: number): [number, number, number] => {
    const stress = stressAtHeight(body, frame, y);
    const tone = stressTone(stress, fy, stressTop);
    const set = side(stress);
    const colour = colours.zero.clone().lerp(set.soft, tone.soft);
    if (tone.deep > 0) colour.copy(set.soft).lerp(set.strong, tone.deep);
    return [colour.r, colour.g, colour.b];
  };
  const faceGeometry = capGeometry(body.solids, (x, y) => [x, y, 0.4], colourAt, body.height / 60);
  const faceMaterial = new MeshBasicMaterial({ vertexColors: true, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  geometries.push(faceGeometry);
  materials.push(faceMaterial);
  face.add(new Mesh(faceGeometry, faceMaterial));

  const labels: LabelSpec[] = [];
  const scale = lengthPerStress(body, stressTop);
  const heightAt = (y: number) => Math.abs(stressAtHeight(body, frame, y)) * scale;
  if (frame.ratio > 0 && scale > 0) {
    // a faint envelope of the stress block, and the arrows: their length is the stress at that fibre
    const envelope = envelopeGeometry(body, heightAt);
    const envelopeMaterial = new MeshLambertMaterial({ color: view.press ? colours.comp.soft : colours.tens.soft, transparent: true, opacity: 0.32, side: DoubleSide, depthWrite: false });
    const envelopeEdges = new EdgesGeometry(envelope, 28);
    const envelopeInk = new LineBasicMaterial({ color: colours.ink, transparent: true, opacity: 0.55 });
    geometries.push(envelope, envelopeEdges);
    materials.push(envelopeMaterial, envelopeInk);
    face.add(new Mesh(envelope, envelopeMaterial), new LineSegments(envelopeEdges, envelopeInk));

    const press = new MeshBasicMaterial({ color: colours.comp.deep });
    const pull = new MeshBasicMaterial({ color: colours.tens.deep });
    materials.push(press, pull);
    const head = Math.max(body.width, body.height) * 0.07;
    for (const arrow of faceArrows(body, frame, scale)) {
      // compression presses: the head touches the face; tension pulls: the head is away from it
      const parts = arrow.press
        ? arrowMeshes(arrow.x, arrow.y, 0.4 + arrow.length, 0.4, head, press, geometries)
        : arrowMeshes(arrow.x, arrow.y, 0.4, 0.4 + arrow.length, head, pull, geometries);
      face.add(...parts);
    }
    const top = stressAtHeight(body, frame, body.halfDepth);
    const text = (stress: number) =>
      `${formatFixed(Math.abs(stress), 1)} N/mm² ${stress >= 0 ? "compression, pressing on the face" : "tension, pulling on the face"}`;
    labels.push({ id: "top", text: text(view.uniform ? (view.press ? 1 : -1) * Math.abs(top) : top), at: faceToWorld(pose, [0, body.halfDepth + 14, heightAt(body.halfDepth)]) });
    if (!view.uniform) {
      const bottom = stressAtHeight(body, frame, -body.halfDepth);
      labels.push({ id: "bottom", text: text(bottom), at: faceToWorld(pose, [0, -body.halfDepth - 14, heightAt(-body.halfDepth)]) });
    }
  }
  group.add(face);
  if (frame.ratio > 0) {
    labels.push({ id: "rest", text: "unloaded outline", at: [body.width / 2 + 24, -body.halfDepth - 16, 0], plain: true });
  }

  // a dimension from the unloaded face to the loaded one (tension and compression)
  if (view.key !== "bending" && Math.abs(pose.face.position[2]) > 4) {
    const x = body.width / 2 + 16;
    const y = body.halfDepth;
    const z = pose.face.position[2];
    const points = [x, y, 0, x, y, z, x - 6, y, 0, x + 6, y, 0, x - 6, y, z, x + 6, y, z, body.width / 2, y, 0, x, y, 0, body.width / 2, y, z, x, y, z];
    const dim = new BufferGeometry();
    dim.setAttribute("position", new Float32BufferAttribute(points, 3));
    const dimMaterial = new LineBasicMaterial({ color: colours.ink });
    geometries.push(dim);
    materials.push(dimMaterial);
    group.add(new LineSegments(dim, dimMaterial));
    labels.push({ id: "dim", text: view.press ? "shortens" : "lengthens", at: [x + 12, y + 12, z / 2] });
  }

  return {
    group,
    labels,
    dispose: () => {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
}

/**
 * The 3D cut: the member cut at the section, the stress at every fibre of the cut face as an arrow and
 * a faint envelope, and the member deforming by the engine's strain of the current frame under one stated
 * magnification, against a faint unloaded outline. Drag to turn; Iso, Side and Front put the camera back.
 * The scene is rebuilt from the frame on every step; the camera is fitted once per section and case.
 */
export default function Stage3D({
  view,
  frame,
  section,
  fy,
  stressTop,
  dark,
}: {
  view: StageView;
  frame: StageFrameOut;
  section: StageSection;
  fy: number;
  stressTop: number;
  dark: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const rig = useRef<Rig | null>(null);
  const spans = useRef(new Map<string, HTMLSpanElement>());
  const [failed, setFailed] = useState(false);
  const [preset, setPreset] = useState<ViewName | null>("iso");
  const [labels, setLabels] = useState<LabelSpec[]>([]);
  const body = useMemo(() => stageBody(section), [section]);
  const frames = view.frames.frames;
  const limitStrain = frames[frames.length - 1].strain;
  const fitKey = `${view.key}|${section.shape}|${section.width}x${section.height}|${section.turned}|${limitStrain}`;

  // the renderer, camera and controls, once
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    element.appendChild(renderer.domElement);
    renderer.domElement.className = "stage3d-canvas";
    const camera = new OrthographicCamera(-1, 1, 1, -1, 1, 8000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.enablePan = false;
    controls.enableZoom = false; // the wheel scrolls the page
    const scene = new Scene();
    scene.add(new AmbientLight(0xffffff, 1.5));
    const key = new DirectionalLight(0xffffff, 1.6);
    key.position.set(-0.7, 1, 0.9);
    scene.add(key);
    const fill = new DirectionalLight(0xffffff, 0.5);
    fill.position.set(0.8, -0.5, -0.6);
    scene.add(fill);

    const state: Rig = {
      renderer,
      camera,
      controls,
      scene,
      content: null,
      labels: [],
      fitted: "",
      frame: null,
      halfHeight: 1,
      aspect: 1.6,
      request: () => undefined,
      disposeContent: null,
    };
    rig.current = state;

    const render = () => {
      const w = element.clientWidth;
      const h = element.clientHeight;
      if (w < 1 || h < 1) return;
      renderer.setSize(w, h, false);
      state.aspect = w / h;
      camera.left = -state.halfHeight * state.aspect;
      camera.right = state.halfHeight * state.aspect;
      camera.top = state.halfHeight;
      camera.bottom = -state.halfHeight;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      const projected = new Vector3();
      const boxes = state.labels.map((label) => {
        const span = spans.current.get(label.id);
        projected.set(...label.at).project(camera);
        return { id: label.id, ...ndcToPixels([projected.x, projected.y, projected.z], w, h), width: span?.offsetWidth ?? 0, height: span?.offsetHeight ?? 0 };
      });
      for (const place of placeLabels(boxes, w, h)) {
        const span = spans.current.get(place.id);
        if (!span) continue;
        span.style.transform = `translate(${Math.round(place.left)}px, ${Math.round(place.top)}px)`;
        span.style.visibility = place.visible ? "visible" : "hidden";
      }
    };
    const request = () => {
      if (state.frame !== null) return;
      state.frame = requestAnimationFrame(() => {
        state.frame = null;
        render();
      });
    };
    state.request = request;
    controls.addEventListener("change", request);
    controls.addEventListener("start", () => setPreset(null));
    const observer = new ResizeObserver(request);
    observer.observe(element);
    request();
    return () => {
      observer.disconnect();
      if (state.frame !== null) cancelAnimationFrame(state.frame);
      state.disposeContent?.();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      rig.current = null;
    };
  }, []);

  // the scene: rebuilt for every frame and for the theme
  useEffect(() => {
    const state = rig.current;
    if (!state) return;
    if (state.content) state.scene.remove(state.content);
    state.disposeContent?.();
    const built = buildContent(view, frame, body, fy, stressTop);
    state.disposeContent = built.dispose;
    state.content = built.group;
    state.scene.add(built.group);
    state.labels = built.labels;
    setLabels(built.labels);
    state.request();
  }, [view, frame, body, fy, stressTop, dark]);

  // the camera: fitted once per section and case, and on a preset button; turning by hand is kept
  useEffect(() => {
    const state = rig.current;
    if (!state) return;
    const pose = memberPose(view.key, limitStrain, body);
    const longest = (stressTop * lengthPerStress(body, stressTop)) || 0;
    const points = stageCorners(body, pose, longest);
    const centre = new Vector3(0, 0, 0);
    for (const p of points) centre.add(new Vector3(...p));
    centre.divideScalar(points.length);
    const relative = points.map((p): Vec3 => [p[0] - centre.x, p[1] - centre.y, p[2] - centre.z]);
    let direction: Vec3;
    if (preset !== null) direction = VIEW_DIRECTION[preset];
    else if (state.fitted === fitKey) return;
    else direction = state.camera.position.clone().sub(state.controls.target).normalize().toArray() as Vec3;
    state.fitted = fitKey;
    state.halfHeight = fitHalfHeight(relative, direction, state.aspect, MARGIN);
    const radius = boundingRadius(relative);
    state.controls.target.copy(centre);
    state.camera.position.copy(centre).add(new Vector3(...direction).multiplyScalar(radius * 4));
    state.camera.near = radius * 0.01;
    state.camera.far = radius * 10;
    state.camera.lookAt(centre);
    state.controls.update();
    state.request();
  }, [fitKey, preset, view.key, body, limitStrain, stressTop]);

  // the labels exist in the page now: place them
  useEffect(() => {
    rig.current?.request();
  }, [labels]);

  if (failed) {
    return (
      <p className="muted" role="status">
        {STAGE_WEBGL_MISSING}
      </p>
    );
  }
  return (
    <div className="stage3d">
      <div ref={host} className="stage3d-host" role="img" aria-label="3D view of the member cut at the section, with the stress at every fibre on the cut face. Drag to turn.">
        <div className="stage3d-tools" role="group" aria-label="Camera">
          {VIEWS.map((name) => (
            <button key={name} type="button" className="v3d-button" aria-pressed={preset === name} onClick={() => setPreset(name)}>
              {VIEW_LABEL[name]}
            </button>
          ))}
        </div>
        <span className="v3d-badge v3d-badge-illustrative stage3d-badge" title={`${MAGNIFICATION_RULE} ${LENGTH_NOTE}`}>
          Illustrative: the drawn length and the ×{STAGE_MAGNIFICATION} scale
        </span>
        {labels.map((label) => (
          <span
            key={label.id}
            className={`v3d-label${label.plain ? " stage3d-plain" : ""}`}
            ref={(element) => {
              if (element) spans.current.set(label.id, element);
              else spans.current.delete(label.id);
            }}
          >
            {label.text}
          </span>
        ))}
      </div>
      <p className="stage3d-note">
        <strong>The member deforms by its strain, drawn {STAGE_MAGNIFICATION} times larger so it shows.</strong>{" "}
        {view.uniform
          ? view.press
            ? "Every fibre shortens by the same amount, so the cut face moves in from the unloaded outline."
            : "Every fibre lengthens by the same amount, so the cut face moves out past the unloaded outline."
          : "The top fibres shorten and the bottom fibres lengthen, so the cut face turns about the neutral axis and the member curves."}{" "}
        {MAGNIFICATION_RULE} {LENGTH_NOTE} The far end is held. Arrow length is the stress at that fibre.
      </p>
    </div>
  );
}
