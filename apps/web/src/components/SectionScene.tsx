import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowHelper,
  AmbientLight,
  Box3,
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Sprite,
  SpriteMaterial,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { SceneSection, Zone } from "../lib/comparison";
import { slabGeometry, tubeGeometry } from "../lib/sectionMesh";

export type SceneItem = {
  id: string;
  label: string;
  detail: string;
  section: SceneSection;
  /** 0 flat, 1 at the upper limit of the method: how strong the wrinkles are drawn */
  wrinkle: number;
  zone: Zone;
};

const ZONE_COLOUR: Record<Zone, { light: string; dark: string }> = {
  stocky: { light: "#2a78d6", dark: "#3987e5" },
  slender: { light: "#898781", dark: "#a5a39b" },
  not_allowed: { light: "#d03b3b", dark: "#e25555" },
};

const LENGTH_PER_WIDTH = 2;
const TUBE_WAVES = 4;
const PLATE_WAVES = 2;

function footprint(section: SceneSection): number {
  if (section.kind === "chs") return section.d;
  const widest = Math.max(...section.plates.map((p) => p.width));
  return section.plates.reduce((sum, p) => sum + p.width, 0) + widest * 0.15 * (section.plates.length - 1);
}

function referenceWidth(section: SceneSection): number {
  return section.kind === "chs" ? section.d : Math.max(...section.plates.map((p) => p.width));
}

/** Everything that decides where things stand, so the camera is only reset when it changes. */
export function layoutKey(items: SceneItem[]): string {
  return items
    .map((item) => `${item.id}:${item.section.kind}:${footprint(item.section).toFixed(3)}`)
    .join("|");
}

function labelSprite(label: string, detail: string, colour: string, width: number): Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 200;
  const context = canvas.getContext("2d");
  if (context) {
    context.textAlign = "center";
    context.fillStyle = colour;
    const fit = (text: string, size: number, weight: string) => {
      let px = size;
      context.font = `${weight} ${px}px system-ui, sans-serif`;
      while (context.measureText(text).width > 600 && px > 18) {
        px -= 2;
        context.font = `${weight} ${px}px system-ui, sans-serif`;
      }
    };
    fit(label, 58, "600");
    context.fillText(label, 320, 78);
    fit(detail, 50, "400");
    context.globalAlpha = 0.85;
    context.fillText(detail, 320, 160);
  }
  const texture = new CanvasTexture(canvas);
  const sprite = new Sprite(new SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(width, (width * 200) / 640, 1);
  return sprite;
}

function buildItem(item: SceneItem, length: number, material: MeshStandardMaterial): Group {
  const group = new Group();
  const { section, wrinkle } = item;
  if (section.kind === "chs") {
    const amplitude = wrinkle * 0.04 * section.d;
    group.add(new Mesh(tubeGeometry(section.d, section.t, length, amplitude, TUBE_WAVES), material));
    return group;
  }
  const gap = referenceWidth(section) * 0.15;
  let cursor = -footprint(section) / 2;
  for (const plate of section.plates) {
    const amplitude = wrinkle * 0.18 * plate.width;
    const mesh = new Mesh(slabGeometry(plate.width, plate.thickness, length, amplitude, PLATE_WAVES), material);
    mesh.position.x = cursor + plate.width / 2;
    group.add(mesh);
    cursor += plate.width + gap;
  }
  // turned a little, so the waves catch the light instead of facing the viewer
  group.rotation.y = -0.7;
  return group;
}

function disposeGroup(group: Group): void {
  group.traverse((object) => {
    const mesh = object as Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const sprite = object as Sprite;
    if (sprite.isSprite) {
      sprite.material.map?.dispose();
      sprite.material.dispose();
    }
  });
}

type Rig = {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  controls: OrbitControls;
  content: Group;
  render: () => void;
  fitted: string;
};

/** All sections in one scene and one orbit control, so they turn together and compare fairly. */
export default function SectionScene({ items, dark }: { items: SceneItem[]; dark: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const rig = useRef<Rig | null>(null);
  const [failed, setFailed] = useState(false);

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
    element.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.touchAction = "none";

    const scene = new Scene();
    scene.add(new AmbientLight(0xffffff, 1.1));
    const key = new DirectionalLight(0xffffff, 2.2);
    key.position.set(3, 5, 4);
    scene.add(key);
    const fill = new DirectionalLight(0xffffff, 0.9);
    fill.position.set(-4, -1, -3);
    scene.add(fill);
    const content = new Group();
    scene.add(content);

    const camera = new PerspectiveCamera(38, 2, 0.1, 100000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.enablePan = false;
    const render = () => renderer.render(scene, camera);
    controls.addEventListener("change", render);

    const resize = () => {
      const width = Math.max(element.clientWidth, 200);
      const height = Math.round(Math.min(Math.max(width * 0.5, 280), 520));
      renderer.setSize(width, height, false);
      renderer.domElement.style.height = `${height}px`;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      render();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();

    rig.current = { renderer, scene, camera, controls, content, render, fitted: "" };
    return () => {
      observer.disconnect();
      controls.dispose();
      disposeGroup(content);
      renderer.dispose();
      renderer.domElement.remove();
      rig.current = null;
    };
  }, []);

  const key = useMemo(() => layoutKey(items), [items]);

  useEffect(() => {
    const current = rig.current;
    if (!current || items.length === 0) return;
    const { content, camera, controls, render } = current;
    for (const child of [...content.children]) {
      content.remove(child);
      disposeGroup(child as Group);
    }

    const length = Math.max(...items.map((item) => referenceWidth(item.section))) * LENGTH_PER_WIDTH;
    const widths = items.map((item) => footprint(item.section));
    const gap = (widths.reduce((a, b) => a + b, 0) / widths.length) * 0.55;
    const total = widths.reduce((a, b) => a + b, 0) + gap * (items.length - 1);
    const labelColour = dark ? "#e8e8e6" : "#1a1a19";

    let cursor = -total / 2;
    items.forEach((item, index) => {
      const colour = ZONE_COLOUR[item.zone][dark ? "dark" : "light"];
      const material = new MeshStandardMaterial({
        color: new Color(colour),
        metalness: 0.1,
        roughness: 0.65,
        side: DoubleSide,
      });
      const model = buildItem(item, length, material);
      const centre = cursor + widths[index] / 2;
      model.position.x = centre;
      content.add(model);
      const arrow = new ArrowHelper(new Vector3(0, -1, 0), new Vector3(centre, length * 0.85, 0), length * 0.28, 0xeb6834, length * 0.09, length * 0.06);
      content.add(arrow);
      const cell = widths[index] + gap;
      const label = labelSprite(item.label, item.detail, labelColour, cell * 0.95);
      label.position.set(centre, -length * 0.5 - cell * 0.38, length * 0.6);
      content.add(label);
      cursor += widths[index] + gap;
    });

    if (current.fitted !== key) {
      const box = new Box3().setFromObject(content);
      const size = box.getSize(new Vector3());
      const centre = box.getCenter(new Vector3());
      const distance = (Math.max(size.x / camera.aspect, size.y) * 1.08) / Math.tan((camera.fov * Math.PI) / 360) / 2 + size.z;
      camera.position.set(centre.x + distance * 0.12, centre.y + distance * 0.42, centre.z + distance);
      controls.target.copy(centre);
      controls.update();
      current.fitted = key;
    }
    render();
  }, [items, dark, key]);

  if (failed) {
    return (
      <p className="muted" role="status">
        The 3D view needs WebGL, which this browser does not offer. The numbers and graphs below show
        the same comparison.
      </p>
    );
  }
  return <div ref={host} className="scene3d" />;
}
