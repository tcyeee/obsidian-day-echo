# Design: Split `src/ui/view.ts`

**Date:** 2026-06-10  
**Goal:** Reduce `view.ts` from 774 lines to ~430 by extracting constants and card-building logic into focused files.

---

## Problem

`view.ts` contains three logically distinct concerns in one file:
1. Configuration constants and the `ZoomAnchor` type
2. Card DOM construction and height estimation utilities
3. `DayEchoView` lifecycle, rendering, scroll, and zoom orchestration

The scroll/zoom methods (`applyZoom`, `onScrollWheel`, etc.) form a tight internal loop (e.g. `applyZoom` calls `renderTimeline` and `restoreAnchor`), so extracting them would require callback injection with no meaningful benefit. The constants and card builder have no such coupling and split cleanly.

---

## Architecture

### New files

#### `src/ui/view-constants.ts`
All module-level constants and the `ZoomAnchor` interface currently defined at the top of `view.ts`.

Exports:
- `PREVIEW_THUMBS`, `REPRESENTATIVES`, `ZOOM_ORDER`, `ZOOM_LABELS`
- `WHEEL_STEP`, `WHEEL_IDLE_RESET`
- `SCROLL_MAX_STEP`, `SCROLL_MAX_SPEED`, `SCROLL_EASE`
- `SWAP_OUT_MS`, `SWAP_IN_MS`
- `MARKER_MIN_GAP`
- `interface ZoomAnchor`

#### `src/ui/card-builder.ts`
Card DOM construction extracted from `DayEchoView`. Receives dependencies via a lightweight `CardContext` interface to avoid a circular import back to the view class.

```ts
interface CardContext {
  app: App;
  plugin: DayEchoPlugin;
  imgObserver: IntersectionObserver | null;
  expanded: Set<string>;
}

export function buildCard(entry: DiaryEntry, ctx: CardContext): HTMLElement
export function buildFoldCard(key: string, hidden: DiaryEntry[], ctx: CardContext): HTMLElement
export function estimateHeight(entry: DiaryEntry): number

// Private helpers (not exported): fullDate, pad, clamp
```

`buildCard` uses `ctx.app` for vault reads and markdown rendering, `ctx.imgObserver` for lazy-loading thumbnails, `ctx.expanded` for restoring expansion state across re-renders, and `ctx.plugin` (only its `app` reference, same as `ctx.app` — but kept for symmetry with `createTodayNote` in the view).

#### `src/ui/view.ts` (modified)
Retains only `DayEchoView` and the `VIEW_TYPE_DAY_ECHO` constant. Imports everything else from the two new files. Callers of `buildCard` / `buildFoldCard` pass `this` as `CardContext` (the view already satisfies the interface).

---

## Data Flow

```
view.ts (DayEchoView)
  ├── imports constants from view-constants.ts
  ├── imports buildCard / buildFoldCard / estimateHeight from card-builder.ts
  │     └── card-builder receives CardContext { app, plugin, imgObserver, expanded }
  └── renderTimeline() calls buildCard/buildFoldCard, passes `this` as context
```

No circular imports. `card-builder.ts` depends on `types.ts` and Obsidian API only.

---

## File Size After Split

| File | Estimated lines |
|---|---|
| `view-constants.ts` | ~35 |
| `card-builder.ts` | ~160 |
| `view.ts` | ~430 |

---

## Error Handling

No behavior changes. This is a pure structural refactor — same logic, different files.

---

## Testing

No tests cover the UI layer. Verify manually by building and deploying to the local vault after the split. Confirm:
- Cards render with correct content, thumbnails lazy-load, tags appear
- Fold cards show "+N" overlay and unfold on click
- Expanded state is preserved across timeline re-renders
