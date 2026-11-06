import { Check, Hand, Maximize2, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { OrthographicCamera, PerspectiveCamera, Vector3, WebGLRenderer } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  VIEW_DIRECTION,
  VIEW_LABEL,
  boundingRadius,
  fitHalfHeight,
  fitKey,
  perspectiveDistance,
} from "./camera";
import { interactionPolicy, isTap, nextActive } from "./interaction";
import { buildItemScene, type ItemScene } from "./itemScene";
import { ndcToPixels, placeLabels } from "./labels";
import {
  statusBadge,
  type LegendEntry,
  type Projection,
  type Vec3,
  type ViewName,
  type ViewerItem,
} from "./types";

/**
 * The shared 3D viewer: small multiples, one viewport per item, all seen through one camera, so
 * turning or zooming one turns them all and every item is drawn to the same scale. Orthographic by
 * default; preset views, Fit and Reset; HTML labels and legend; tap to activate on a phone; renders only
 * when something changed. The three.js code lives in this lazy chunk only.
 */
export type Viewer3DProps = {
  items: ViewerItem[];
  dark: boolean;
  /** names the view for screen readers, e.g. "3D view of the sections" */
  label: string;
  projection?: Projection;
  initialView?: ViewName;
  /** the line that states the common scale */
  scaleNote?: string;
  legend?: LegendEntry[];
};

export const WEBGL_MISSING =
  "The 3D view needs WebGL, which this browser does not offer. The numbers and graphs below show the same comparison.";

const VIEWS: ViewName[] = ["front", "side", "top", "iso"];
const FOV = 30;
const MARGIN = 1.12;
const ZOOM_STEP = 1.25;

type Rig = {
  renderer: WebGLRenderer;
  camera: OrthographicCamera | PerspectiveCamera;
  controls: OrbitControls;
  scenes: { id: string; built: ItemScene }[];
  direction: Vec3;
  halfHeight: number;
  aspect: number;
  fitted: string;
  frame: number | null;
  render: () => void;
  request: () => void;
};

function setFrustum(rig: Rig): void {
  const { camera, halfHeight, aspect } = rig;
  if (camera instanceof OrthographicCamera) {
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.left = -halfHeight * aspect;
    camera.right = halfHeight * aspect;
  } else {
    camera.aspect = aspect;
  }
  camera.updateProjectionMatrix();
}

/** Look from `direction` at the origin, with every item in view; zoom back to 1. */
function fit(rig: Rig): void {
  const points = rig.scenes.flatMap((entry) => entry.built.corners);
  if (points.length === 0) return;
  const radius = boundingRadius(points);
  const direction = new Vector3(...rig.direction);
  rig.halfHeight = fitHalfHeight(points, rig.direction, rig.aspect, MARGIN);
  rig.controls.target.set(0, 0, 0);
  const { camera } = rig;
  if (camera instanceof OrthographicCamera) {
    camera.position.copy(direction.multiplyScalar(radius * 4));
    camera.near = radius * 0.01;
    camera.far = radius * 8;
    camera.zoom = 1;
  } else {
    const distance = perspectiveDistance(rig.halfHeight, FOV, radius);
    camera.position.copy(direction.multiplyScalar(distance));
    camera.near = Math.max(distance * 0.01, 0.01);
    camera.far = distance * 20 + radius * 4;
  }
  camera.lookAt(0, 0, 0);
  setFrustum(rig);
  rig.controls.update();
  rig.request();
}

export default function Viewer3D({
  items,
  dark,
  label,
  projection = "orthographic",
  initialView = "iso",
  scaleNote = "Drawn to the same scale: one camera for every view, so turning or zooming one turns them all.",
  legend = [],
}: Viewer3DProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const canvasHost = useRef<HTMLDivElement>(null);
  const viewports = useRef(new Map<string, HTMLDivElement>());
  const labelSpans = useRef(new Map<string, HTMLSpanElement>());
  const rig = useRef<Rig | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const activeRef = useRef(false);
  const [active, setActive] = useState(false);
  const [view, setView] = useState<ViewName | null>(initialView);
  const [failed, setFailed] = useState(false);

  // the renderer, the camera and the controls, once per projection
  useEffect(() => {
    const host = canvasHost.current;
    const element = stage.current;
    const outer = wrap.current;
    if (!host || !element || !outer) return;
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.autoClear = false;
    host.appendChild(renderer.domElement);
    renderer.domElement.className = "v3d-canvas";

    const camera =
      projection === "perspective" ? new PerspectiveCamera(FOV, 1, 0.1, 1000) : new OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    const controls = new OrbitControls(camera, element);
    controls.enableDamping = false;
    controls.enablePan = true;
    controls.screenSpacePanning = true;
    controls.minZoom = 0.2;
    controls.maxZoom = 20;
    controls.enableZoom = activeRef.current;
    // OrbitControls takes every touch; until the view is active the page keeps its scrolling
    element.style.touchAction = interactionPolicy(activeRef.current).touchAction;

    const render = () => {
      const current = rig.current;
      if (!current) return;
      const stageRect = element.getBoundingClientRect();
      renderer.setScissorTest(false);
      renderer.clear();
      renderer.setScissorTest(true);
      const projected = new Vector3();
      for (const { id, built } of current.scenes) {
        const viewport = viewports.current.get(id);
        if (!viewport) continue;
        const rect = viewport.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;
        if (width < 1 || height < 1) continue;
        const left = rect.left - stageRect.left;
        const top = rect.top - stageRect.top;
        const bottom = stageRect.height - top - height;
        const aspect = width / height;
        if (Math.abs(aspect - current.aspect) > 1e-6) {
          current.aspect = aspect;
          setFrustum(current);
        }
        renderer.setViewport(left, bottom, width, height);
        renderer.setScissor(left, bottom, width, height);
        renderer.render(built.scene, camera);

        const item = itemsRef.current.find((entry) => entry.id === id);
        const labels = item?.labels ?? [];
        if (labels.length === 0) continue;
        const boxes = labels.map((entry) => {
          const span = labelSpans.current.get(`${id}:${entry.id}`);
          projected.set(...entry.at).project(camera);
          const at = ndcToPixels([projected.x, projected.y, projected.z], width, height);
          return { id: entry.id, ...at, width: span?.offsetWidth ?? 0, height: span?.offsetHeight ?? 0 };
        });
        for (const place of placeLabels(boxes, width, height)) {
          const span = labelSpans.current.get(`${id}:${place.id}`);
          if (!span) continue;
          span.style.transform = `translate(${Math.round(place.left)}px, ${Math.round(place.top)}px)`;
          span.style.visibility = place.visible ? "visible" : "hidden";
        }
      }
    };
    const request = () => {
      const current = rig.current;
      if (!current || current.frame !== null) return;
      current.frame = requestAnimationFrame(() => {
        current.frame = null;
        render();
      });
    };

    rig.current = {
      renderer,
      camera,
      controls,
      scenes: [],
      direction: VIEW_DIRECTION[initialView],
      halfHeight: 1,
      aspect: 1.25,
      fitted: "",
      frame: null,
      render,
      request,
    };
    controls.addEventListener("change", request);
    controls.addEventListener("start", () => setView(null));

    // per pointer: a mouse may drag to turn at any time, a finger only once the view is active
    let down: { x: number; y: number; time: number } | null = null;
    const onDown = (event: PointerEvent) => {
      const policy = interactionPolicy(activeRef.current, event.pointerType);
      controls.enabled = policy.controls;
      controls.enableZoom = policy.zoom;
      down = { x: event.clientX, y: event.clientY, time: event.timeStamp };
    };
    const onUp = (event: PointerEvent) => {
      if (down && !activeRef.current && isTap(down, { x: event.clientX, y: event.clientY, time: event.timeStamp })) {
        activeRef.current = nextActive("tap");
        setActive(activeRef.current);
      }
      down = null;
    };
    outer.addEventListener("pointerdown", onDown, { capture: true });
    element.addEventListener("pointerup", onUp);

    const resize = () => {
      renderer.setSize(Math.max(element.clientWidth, 1), Math.max(element.clientHeight, 1), false);
      render();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();

    return () => {
      observer.disconnect();
      outer.removeEventListener("pointerdown", onDown, { capture: true });
      element.removeEventListener("pointerup", onUp);
      const current = rig.current;
      if (current) {
        if (current.frame !== null) cancelAnimationFrame(current.frame);
        for (const entry of current.scenes) entry.built.dispose();
      }
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      rig.current = null;
    };
  }, [projection, initialView]);

  // the scenes, rebuilt (and the old ones disposed) whenever the items or the theme change
  useEffect(() => {
    const current = rig.current;
    if (!current) return;
    for (const entry of current.scenes) entry.built.dispose();
    current.scenes = items.map((item) => ({ id: item.id, built: buildItemScene(item, dark) }));
    const points = current.scenes.flatMap((entry) => entry.built.corners);
    const key = fitKey(
      items.map((item) => item.id),
      points.length > 0 ? boundingRadius(points) : 0,
    );
    if (key !== current.fitted) {
      current.fitted = key;
      fit(current);
    }
    current.request();
  }, [items, dark, projection, initialView]);

  // the active state reaches the controls and the page's scrolling
  useEffect(() => {
    activeRef.current = active;
    const current = rig.current;
    if (current) {
      current.controls.enabled = true;
      current.controls.enableZoom = active;
    }
    if (stage.current) stage.current.style.touchAction = interactionPolicy(active).touchAction;
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActive(nextActive("escape"));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  const goTo = useCallback((name: ViewName) => {
    const current = rig.current;
    setView(name);
    if (!current) return;
    current.direction = VIEW_DIRECTION[name];
    fit(current);
  }, []);

  const refit = useCallback(() => {
    const current = rig.current;
    if (!current) return;
    current.direction = current.camera.position.clone().sub(current.controls.target).normalize().toArray() as Vec3;
    fit(current);
  }, []);

  const zoom = useCallback((factor: number) => {
    const current = rig.current;
    if (!current) return;
    const { camera, controls } = current;
    if (camera instanceof OrthographicCamera) {
      camera.zoom = Math.min(Math.max(camera.zoom * factor, controls.minZoom), controls.maxZoom);
      camera.updateProjectionMatrix();
    } else {
      camera.position.sub(controls.target).divideScalar(factor).add(controls.target);
    }
    controls.update();
    current.request();
  }, []);

  if (failed) {
    return (
      <p className="muted" role="status">
        {WEBGL_MISSING}
      </p>
    );
  }

  const release = () => setActive(nextActive("done"));
  const engage = () => setActive(nextActive("interact"));

  return (
    <div ref={wrap} className={`v3d${active ? " is-active" : ""}`} role="group" aria-label={label}>
      <div className="v3d-toolbar" role="toolbar" aria-label="3D view controls">
        <div className="v3d-buttons" role="group" aria-label="Preset views">
          {VIEWS.map((name) => (
            <button
              key={name}
              type="button"
              className="v3d-button"
              aria-pressed={view === name}
              onClick={() => goTo(name)}
            >
              {VIEW_LABEL[name]}
            </button>
          ))}
        </div>
        <div className="v3d-buttons" role="group" aria-label="Zoom and fit">
          <button type="button" className="v3d-button" aria-label="Zoom in" title="Zoom in" onClick={() => zoom(ZOOM_STEP)}>
            <ZoomIn size={16} aria-hidden="true" />
          </button>
          <button type="button" className="v3d-button" aria-label="Zoom out" title="Zoom out" onClick={() => zoom(1 / ZOOM_STEP)}>
            <ZoomOut size={16} aria-hidden="true" />
          </button>
          <button type="button" className="v3d-button" title="Fit every item in its view" onClick={refit}>
            <Maximize2 size={16} aria-hidden="true" /> Fit
          </button>
          <button type="button" className="v3d-button" title="Back to the first view" onClick={() => goTo(initialView)}>
            <RotateCcw size={16} aria-hidden="true" /> Reset
          </button>
        </div>
        {active ? (
          <button type="button" className="v3d-button v3d-primary" onClick={release}>
            <Check size={16} aria-hidden="true" /> Done
          </button>
        ) : (
          <button type="button" className="v3d-button" onClick={engage}>
            <Hand size={16} aria-hidden="true" /> Interact
          </button>
        )}
      </div>

      <div className="v3d-stagewrap">
        {active ? (
          <div className="v3d-done-dock">
            <button type="button" className="v3d-button v3d-primary" onClick={release}>
              <Check size={16} aria-hidden="true" /> Done
            </button>
          </div>
        ) : null}
        <div ref={stage} className="v3d-stage">
          <div ref={canvasHost} className="v3d-canvas-host" aria-hidden="true" />
          <div className="v3d-grid">
            {items.map((item) => {
              const badge = statusBadge(item.status);
              return (
                <figure key={item.id} className="v3d-cell" data-item={item.id}>
                  <figcaption className="v3d-title">
                    <span className={`swatch swatch-${item.tone}`} aria-hidden="true" />
                    <strong>{item.title}</strong>
                    {item.subtitle ? <span className="v3d-subtitle">{item.subtitle}</span> : null}
                  </figcaption>
                  <div
                    className="v3d-viewport"
                    ref={(element) => {
                      if (element) viewports.current.set(item.id, element);
                      else viewports.current.delete(item.id);
                    }}
                  >
                    {badge ? (
                      <span className={`v3d-badge v3d-badge-${item.status?.kind}`} title={badge.detail}>
                        {badge.text}
                        <span className="sr-only">: {badge.detail}</span>
                      </span>
                    ) : null}
                    {(item.labels ?? []).map((entry) => (
                      <span
                        key={entry.id}
                        className="v3d-label"
                        ref={(element) => {
                          const key = `${item.id}:${entry.id}`;
                          if (element) labelSpans.current.set(key, element);
                          else labelSpans.current.delete(key);
                        }}
                      >
                        {entry.text}
                      </span>
                    ))}
                  </div>
                </figure>
              );
            })}
          </div>
        </div>
      </div>

      <p className="v3d-hint muted">
        {active
          ? "Drag to turn, right-drag or two fingers to pan, wheel or pinch to zoom. Done (or Esc) gives the page its scrolling back."
          : "Drag with a mouse to turn. Tap or click the view (or Interact) to pan and zoom; until then the page scrolls over it."}{" "}
        {scaleNote}
      </p>
      {legend.length > 0 ? (
        <ul className="v3d-legend" aria-label="Legend of the 3D view">
          {legend.map((entry) => (
            <li key={entry.key}>
              {entry.arrow ? (
                <span className="v3d-arrow-key" aria-hidden="true">→</span>
              ) : entry.tone ? (
                <span className={`swatch swatch-${entry.tone}`} aria-hidden="true" />
              ) : null}
              {entry.label}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
