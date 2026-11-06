/**
 * Tap to activate. Until the user taps the view (or the Interact button), a finger on the view scrolls
 * the page and the wheel scrolls the page: the view captures nothing. A mouse may still drag to turn,
 * since a mouse drag never scrolls a page. Once active, every gesture turns, pans or zooms the view,
 * until Done (or Escape) releases it.
 */

export type InteractionEvent = "interact" | "tap" | "done" | "escape";

/** The next state: a tap or Interact activates (a tap on an active view keeps it active); Done or Escape releases. */
export function nextActive(event: InteractionEvent): boolean {
  return event === "interact" || event === "tap";
}

export type PointerKind = "mouse" | "touch" | "pen" | string;

export type Policy = {
  /** whether the orbit controls react to this pointer */
  controls: boolean;
  /** whether the wheel (and pinch) zooms the view instead of scrolling the page */
  zoom: boolean;
  /** the CSS touch-action of the view */
  touchAction: "none" | "pan-x pan-y pinch-zoom";
};

export function interactionPolicy(active: boolean, pointer: PointerKind = "mouse"): Policy {
  if (active) return { controls: true, zoom: true, touchAction: "none" };
  return { controls: pointer === "mouse", zoom: false, touchAction: "pan-x pan-y pinch-zoom" };
}

/** A press and release close together in place and time is a tap, not a drag. */
export function isTap(
  down: { x: number; y: number; time: number },
  up: { x: number; y: number; time: number },
  { maxMove = 8, maxMs = 500 }: { maxMove?: number; maxMs?: number } = {},
): boolean {
  return Math.hypot(up.x - down.x, up.y - down.y) <= maxMove && up.time - down.time <= maxMs;
}
