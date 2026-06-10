import type { ZoomLevel } from "../types";

export const PREVIEW_THUMBS = 4;
/** How many entries each year group shows before the rest is folded. */
export const REPRESENTATIVES = 6;
/** Zoom levels from finest to coarsest. */
export const ZOOM_ORDER: ZoomLevel[] = ["month", "year"];
export const ZOOM_LABELS: Record<ZoomLevel, string> = { month: "月", year: "年" };
/** Accumulated wheel delta needed to step one zoom level. */
export const WHEEL_STEP = 80;
/** Gap (ms) after which a paused gesture's accumulated delta is discarded. */
export const WHEEL_IDLE_RESET = 200;
/** Cap how far one wheel event may push the glide target. */
export const SCROLL_MAX_STEP = 120;
/** Top speed of the glide, px per frame (~60fps → ~2400 px/s). */
export const SCROLL_MAX_SPEED = 40;
/** Fraction of the remaining distance covered each frame (easing). */
export const SCROLL_EASE = 0.16;
/** Crossfade durations (ms): fade the old view out, then the new one in. */
export const SWAP_OUT_MS = 120;
export const SWAP_IN_MS = 180;
/** Minimum vertical distance between group markers. */
export const MARKER_MIN_GAP = 64;

/** Where the cursor was anchored before a zoom, so the view can stay put after. */
export interface ZoomAnchor {
  /** Exact group key ("2026-06" or "2026") of the section under the cursor. */
  key: string;
  /** Its year, the fallback when the other zoom level has no such key. */
  year: number;
  offset: number;
}
