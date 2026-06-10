# Split `src/ui/view.ts` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `src/ui/view.ts` (774 lines) into three focused files with no behavior changes.

**Architecture:** Extract all module-level constants + `ZoomAnchor` interface into `view-constants.ts`. Extract the two card-building methods + utility functions into `card-builder.ts` via a `CardContext` dependency-injection interface. `DayEchoView` stays in `view.ts`, shrinking from 774 to ~430 lines.

**Tech Stack:** TypeScript, Obsidian Plugin API (ItemView, MarkdownRenderer, Component)

---

## File Map

| File | Action | Result |
|---|---|---|
| `src/ui/view-constants.ts` | **Create** | All 12 constants + `ZoomAnchor` interface (~35 lines) |
| `src/ui/card-builder.ts` | **Create** | `CardContext`, `buildCard`, `buildFoldCard`, `estimateHeight`, `pad` (~155 lines) |
| `src/ui/view.ts` | **Modify** | `DayEchoView` only, imports from new files (~430 lines) |

---

## Task 1: Create `src/ui/view-constants.ts`

**Files:**
- Create: `src/ui/view-constants.ts`

- [ ] **Step 1: Create the file**

Write `src/ui/view-constants.ts` with this exact content:

```ts
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/tcyeee/Documents/Code/obsidian/obsidian-day-echo && pnpm build 2>&1 | head -30
```

Expected: build succeeds (no errors from the new file — `view.ts` hasn't changed yet so constants are still defined there too, which is fine temporarily).

- [ ] **Step 3: Commit**

```bash
git add src/ui/view-constants.ts
git commit -m "refactor: extract view constants and ZoomAnchor into view-constants.ts"
```

---

## Task 2: Create `src/ui/card-builder.ts`

**Files:**
- Create: `src/ui/card-builder.ts`

- [ ] **Step 1: Create the file**

Write `src/ui/card-builder.ts` with this exact content:

```ts
import { App, Component, MarkdownRenderer, setIcon } from "obsidian";
import type { DiaryEntry } from "../types";
import { stripFrontmatter } from "../core/scanner";
import { PREVIEW_THUMBS } from "./view-constants";

/**
 * Dependencies injected by DayEchoView when building cards, so card-builder
 * does not import the view class (which would create a circular dependency).
 */
export interface CardContext {
  app: App;
  /** The Obsidian Component used as owner for MarkdownRenderer.render. */
  component: Component;
  imgObserver: IntersectionObserver | null;
  expanded: Set<string>;
  unfolded: Set<string>;
  /** Called when the user clicks a fold card's overlay to expand the group. */
  onUnfold: () => void;
}

export function buildCard(entry: DiaryEntry, ctx: CardContext): HTMLElement {
  const card = createDiv({ cls: "de-card" });

  const label = card.createDiv({
    cls: "de-card-date",
    text: fullDate(entry.date),
  });
  label.setAttr("title", "Open this day's note");
  label.addEventListener("click", (ev) => {
    ev.stopPropagation();
    ctx.app.workspace.getLeaf(false).openFile(entry.file);
  });

  const preview = card.createDiv({ cls: "de-preview" });

  if (entry.previewText) {
    preview.createDiv({ cls: "de-text", text: entry.previewText });
  }
  if (entry.images.length) {
    const thumbs = preview.createDiv({ cls: "de-thumbs" });
    for (const src of entry.images.slice(0, PREVIEW_THUMBS)) {
      const img = thumbs.createEl("img", { cls: "de-thumb" });
      img.decoding = "async";
      img.dataset.src = src;
      ctx.imgObserver?.observe(img);
    }
    const extra = entry.images.length - PREVIEW_THUMBS;
    if (extra > 0) thumbs.createDiv({ cls: "de-more", text: `+${extra}` });
  }
  if (entry.tags.length) {
    const tagWrap = preview.createDiv({ cls: "de-tags" });
    for (const tag of entry.tags) {
      tagWrap.createSpan({ cls: "de-tag", text: tag });
    }
  }

  const path = entry.file.path;
  let fullEl: HTMLElement | null = null;
  const setExpanded = async (want: boolean): Promise<void> => {
    if (want) {
      if (!fullEl) {
        fullEl = card.createDiv({ cls: "de-full" });
        const content = await ctx.app.vault.cachedRead(entry.file);
        await MarkdownRenderer.render(
          ctx.app,
          stripFrontmatter(content),
          fullEl,
          path,
          ctx.component
        );
      }
      card.addClass("is-expanded");
      ctx.expanded.add(path);
    } else {
      card.removeClass("is-expanded");
      ctx.expanded.delete(path);
    }
  };
  card.addEventListener("click", (ev) => {
    if ((ev.target as HTMLElement).closest("a")) return;
    void setExpanded(!card.hasClass("is-expanded"));
  });

  if (ctx.expanded.has(path)) void setExpanded(true);

  return card;
}

/**
 * The "+N more" placeholder: a real preview card of the first hidden entry,
 * dimmed by an overlay. Clicking marks the group unfolded and calls onUnfold.
 */
export function buildFoldCard(
  key: string,
  hidden: DiaryEntry[],
  ctx: CardContext
): HTMLElement {
  const card = buildCard(hidden[0], ctx);
  card.addClass("de-fold-card");

  const mask = card.createDiv({ cls: "de-fold-mask" });
  const icon = mask.createDiv({ cls: "de-fold-icon" });
  setIcon(icon, "chevrons-down");
  mask.createDiv({ cls: "de-fold-count", text: `+${hidden.length}` });

  mask.addEventListener("click", (ev) => {
    ev.stopPropagation();
    ctx.unfolded.add(key);
    ctx.onUnfold();
  });
  return card;
}

/**
 * Estimate a collapsed card's rendered height in px, for column balancing.
 * Collapsed cards are predictable: fixed 96x72 thumbs, text clamped to four
 * lines, one tag row. Estimates only steer placement, so being a few pixels
 * off merely leaves the two column bottoms slightly uneven.
 */
export function estimateHeight(entry: DiaryEntry): number {
  let h = 26 + 26 + 16; // padding+border, date line, run gap
  if (entry.previewText) {
    h += Math.min(4, Math.ceil(entry.previewText.length / 50)) * 26;
  }
  if (entry.images.length) {
    const cells =
      Math.min(entry.images.length, PREVIEW_THUMBS) +
      (entry.images.length > PREVIEW_THUMBS ? 1 : 0);
    h += Math.ceil(cells / 3) * 80 + 10;
  }
  if (entry.tags.length) h += 34;
  return Math.max(h, 140);
}

function fullDate(d: Date): string {
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

export function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/tcyeee/Documents/Code/obsidian/obsidian-day-echo && pnpm build 2>&1 | head -30
```

Expected: build succeeds (no errors — card-builder.ts is not imported yet).

- [ ] **Step 3: Commit**

```bash
git add src/ui/card-builder.ts
git commit -m "refactor: extract card building into card-builder.ts"
```

---

## Task 3: Refactor `src/ui/view.ts`

**Files:**
- Modify: `src/ui/view.ts`

This task replaces the imports block, removes the constants/ZoomAnchor block, removes the `buildCard`/`buildFoldCard` class methods, removes the bottom utility functions, and updates `renderTimeline` to call the imported functions.

- [ ] **Step 1: Replace the imports block (lines 1–13)**

Replace:
```ts
import {
  ItemView,
  MarkdownRenderer,
  Notice,
  TFile,
  WorkspaceLeaf,
  setIcon,
} from "obsidian";
import { DiaryEntry, ZoomLevel } from "../types";
import { buildItems, prependToday } from "../core/aggregate";
import { planLayout, resolveMarkerTops } from "../core/layout";
import { scanDiaries, stripFrontmatter } from "../core/scanner";
import type DayEchoPlugin from "../main";
```

With:
```ts
import {
  ItemView,
  Notice,
  TFile,
  WorkspaceLeaf,
  setIcon,
} from "obsidian";
import { DiaryEntry, ZoomLevel } from "../types";
import { buildItems, prependToday } from "../core/aggregate";
import { planLayout, resolveMarkerTops } from "../core/layout";
import { scanDiaries } from "../core/scanner";
import type DayEchoPlugin from "../main";
import {
  ZOOM_ORDER,
  ZOOM_LABELS,
  WHEEL_STEP,
  WHEEL_IDLE_RESET,
  SCROLL_MAX_STEP,
  SCROLL_MAX_SPEED,
  SCROLL_EASE,
  SWAP_OUT_MS,
  SWAP_IN_MS,
  MARKER_MIN_GAP,
  REPRESENTATIVES,
  ZoomAnchor,
} from "./view-constants";
import { buildCard, buildFoldCard, estimateHeight, pad, CardContext } from "./card-builder";
```

- [ ] **Step 2: Delete the constants block and ZoomAnchor (lines 17–50)**

Delete these lines entirely (from `const PREVIEW_THUMBS` through the closing `}` of `ZoomAnchor`):

```ts
const PREVIEW_THUMBS = 4;
/** How many entries each year group shows before the rest is folded; the
 * month view shows every entry without folding. */
const REPRESENTATIVES = 6;
/** Zoom levels from finest to coarsest. */
const ZOOM_ORDER: ZoomLevel[] = ["month", "year"];
const ZOOM_LABELS: Record<ZoomLevel, string> = { month: "月", year: "年" };
/** Accumulated wheel delta needed to step one zoom level. One mouse-wheel
 * notch (~100-120) crosses it at once; a trackpad pinch builds up to it. */
const WHEEL_STEP = 80;
/** Gap (ms) after which a paused gesture's accumulated delta is discarded. */
const WHEEL_IDLE_RESET = 200;
/** Smooth scrolling: cap how far one wheel event may push the glide target,
 * so a fast flick cannot fling the timeline across months. */
const SCROLL_MAX_STEP = 120;
/** Top speed of the glide, px per frame (~60fps → ~2400 px/s). */
const SCROLL_MAX_SPEED = 40;
/** Fraction of the remaining distance covered each frame (easing). */
const SCROLL_EASE = 0.16;
/** Crossfade durations (ms): fade the old view out, then the new one in. */
const SWAP_OUT_MS = 120;
const SWAP_IN_MS = 180;
/** Minimum vertical distance between group markers, so a group with one
 * short card cannot shove its label into the next group's label. */
const MARKER_MIN_GAP = 64;

/** Where the cursor was anchored before a zoom, so the view can stay put after. */
interface ZoomAnchor {
  /** Exact group key ("2026-06" or "2026") of the section under the cursor. */
  key: string;
  /** Its year, the fallback when the other zoom level has no such key. */
  year: number;
  offset: number;
}
```

- [ ] **Step 3: Update `renderTimeline` to use imported card functions**

Find this block inside `renderTimeline` (around line 479 in the original):
```ts
    const cardEls = plan.cards.map((card) => {
      const el =
        card.fold && card.foldKey
          ? this.buildFoldCard(card.foldKey, card.fold)
          : this.buildCard(card.entry);
      if (!card.fold && card.entry === todayEntry) el.addClass("de-today-card");
      cols[card.col].appendChild(el);
      return el;
    });
```

Replace with:
```ts
    const ctx: CardContext = {
      app: this.app,
      component: this,
      imgObserver: this.imgObserver,
      expanded: this.expanded,
      unfolded: this.unfolded,
      onUnfold: () => this.renderTimeline(),
    };
    const cardEls = plan.cards.map((card) => {
      const el =
        card.fold && card.foldKey
          ? buildFoldCard(card.foldKey, card.fold, ctx)
          : buildCard(card.entry, ctx);
      if (!card.fold && card.entry === todayEntry) el.addClass("de-today-card");
      cols[card.col].appendChild(el);
      return el;
    });
```

- [ ] **Step 4: Delete the `buildCard` and `buildFoldCard` methods from the class**

Delete from `/** Build one entry card with date label, preview, and expansion. */` (around line 665) through the closing `}` of `buildCard` (around line 734), and delete `buildFoldCard` (around lines 646–662) as well. Both private methods are gone.

- [ ] **Step 5: Delete the bottom utility functions (lines 738–773)**

Delete from `/**` before `estimateHeight` through the end of the file. Keep only `clamp` — it is still used in `view.ts` for scroll math. The final bottom of the file should be:

```ts
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
```

- [ ] **Step 6: Build and verify**

```bash
cd /Users/tcyeee/Documents/Code/obsidian/obsidian-day-echo && pnpm build 2>&1
```

Expected: zero TypeScript errors, build succeeds. Then check line count:

```bash
wc -l src/ui/view.ts src/ui/view-constants.ts src/ui/card-builder.ts
```

Expected: `view.ts` ~430 lines, `view-constants.ts` ~35 lines, `card-builder.ts` ~155 lines.

- [ ] **Step 7: Commit**

```bash
git add src/ui/view.ts
git commit -m "refactor: split view.ts — import constants and cards from new modules"
```

---

## Task 4: Deploy to local Obsidian vault and verify

**Files:**
- Run: `pnpm build`
- Copy build artifacts to vault plugin directory

- [ ] **Step 1: Build**

```bash
cd /Users/tcyeee/Documents/Code/obsidian/obsidian-day-echo && pnpm build
```

Expected: build succeeds with no errors.

- [ ] **Step 2: Read plugin id from manifest**

```bash
node -e "const m=require('./manifest.json'); console.log(m.id)"
```

Note the id (e.g. `day-echo`).

- [ ] **Step 3: Copy artifacts to vault**

Replace `<id>` with the value from Step 2:

```bash
PLUGIN_ID=$(node -e "const m=require('./manifest.json'); process.stdout.write(m.id)")
DEST="/Users/tcyeee/Library/Mobile Documents/iCloud~md~obsidian/Documents/Lucas/.obsidian/plugins/${PLUGIN_ID}"
mkdir -p "$DEST"
cp main.js manifest.json styles.css "$DEST/"
echo "Deployed to $DEST"
```

Expected: `Deployed to .../plugins/day-echo`

- [ ] **Step 4: Manually verify in Obsidian**

Hot-reload will pick up the new `main.js`. Confirm:
1. Timeline opens and diary cards render with correct dates, text, thumbnails, and tags
2. Clicking a fold card's overlay (`+N`) expands the group
3. Expanding a card inline (click on card body) shows rendered markdown
4. Expansion state is preserved after the vault fires a refresh (create/modify any `.md` file)
5. Zoom switch (月/年) and Ctrl+wheel zoom work

---

## Self-Review

**Spec coverage check:**
- ✅ `view-constants.ts` — all 12 constants + `ZoomAnchor` extracted (Tasks 1)
- ✅ `card-builder.ts` — `buildCard`, `buildFoldCard`, `estimateHeight`, `pad` extracted (Task 2)
- ✅ `view.ts` imports updated, old code removed, `buildCard`/`buildFoldCard` call sites patched (Task 3)
- ✅ Build + deploy + manual smoke test (Task 4)
- ✅ No behavior changes — same DOM output, same event wiring

**Placeholder scan:** No TBDs or vague steps. Every step shows the exact code to write or the exact diff to apply.

**Type consistency:**
- `CardContext` defined in Task 2, imported in Task 3 — names match
- `pad` exported from `card-builder.ts` (Task 2), imported in Task 3 — name matches
- `estimateHeight` exported from `card-builder.ts` (Task 2), imported in Task 3 — name matches
- `ZoomAnchor` defined in Task 1, imported in Task 3 — name matches
- `REPRESENTATIVES` exported from `view-constants.ts` (Task 1), imported in Task 3 — name matches
