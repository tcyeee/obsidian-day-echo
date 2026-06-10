import {
  ItemView,
  MarkdownRenderer,
  WorkspaceLeaf,
  setIcon,
} from "obsidian";
import { DiaryEntry, ZoomLevel } from "../types";
import { buildItems, collectRuns } from "../core/aggregate";
import { scanDiaries, stripFrontmatter } from "../core/scanner";
import type DayEchoPlugin from "../main";

export const VIEW_TYPE_DAY_ECHO = "day-echo-timeline";

const PREVIEW_THUMBS = 4;
/** How many entries each month/year group shows before the rest is folded. */
const REPRESENTATIVES = 6;
/** Zoom levels from finest to coarsest. */
const ZOOM_ORDER: ZoomLevel[] = ["month", "year"];
const ZOOM_LABELS: Record<ZoomLevel, string> = { month: "月", year: "年" };
/** Accumulated wheel delta needed to step one zoom level. One mouse-wheel
 * notch (~100-120) crosses it at once; a trackpad pinch builds up to it. */
const WHEEL_STEP = 80;
/** Gap (ms) after which a paused gesture's accumulated delta is discarded. */
const WHEEL_IDLE_RESET = 200;
/** Crossfade durations (ms): fade the old view out, then the new one in. */
const SWAP_OUT_MS = 120;
const SWAP_IN_MS = 180;

/** Where the cursor was anchored before a zoom, so the view can stay put after. */
interface ZoomAnchor {
  /** Exact group key ("2026-06" or "2026") of the section under the cursor. */
  key: string;
  /** Its year, the fallback when the other zoom level has no such key. */
  year: number;
  offset: number;
}

export class DayEchoView extends ItemView {
  private plugin: DayEchoPlugin;
  private entries: DiaryEntry[] = [];
  private zoom: ZoomLevel;
  /** File paths of cards the user has expanded, preserved across refreshes. */
  private expanded = new Set<string>();
  private wheelAccum = 0;
  private lastWheelAt = 0;
  /** True while the zoom crossfade is playing; wheel steps are ignored. */
  private swapping = false;

  private scrollEl: HTMLElement | null = null;
  private listEl: HTMLElement | null = null;
  private zoomSwitchEl: HTMLElement | null = null;
  private imgObserver: IntersectionObserver | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: DayEchoPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.zoom = plugin.settings.zoom;
  }

  getViewType(): string {
    return VIEW_TYPE_DAY_ECHO;
  }

  getDisplayText(): string {
    return "Day Echo";
  }

  getIcon(): string {
    return "calendar-clock";
  }

  async onOpen(): Promise<void> {
    await this.refresh();
  }

  async onClose(): Promise<void> {
    this.imgObserver?.disconnect();
    this.imgObserver = null;
    this.scrollEl = null;
    this.listEl = null;
    this.zoomSwitchEl = null;
  }

  /** Re-scan the vault and rebuild only what changed. */
  async refresh(): Promise<void> {
    this.entries = await scanDiaries(this.app, this.plugin.settings.dailyFolder);

    // Build the body shell once; later refreshes only redraw the timeline,
    // keeping the scroll position intact.
    if (this.listEl) {
      this.renderTimeline();
    } else {
      this.renderShell();
    }
  }

  private sorted(): DiaryEntry[] {
    const ascending = this.plugin.settings.sortAscending;
    return [...this.entries].sort((a, b) =>
      ascending
        ? a.date.getTime() - b.date.getTime()
        : b.date.getTime() - a.date.getTime()
    );
  }

  /** Build the body containers once, then fill the timeline. */
  private renderShell(): void {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass("day-echo-view");

    const body = root.createDiv({ cls: "de-body" });
    this.scrollEl = body.createDiv({ cls: "de-scroll" });
    // Inner container caps the content width and carries the axis line, so
    // both stay centered when the panel is wider than the cap.
    this.listEl = this.scrollEl.createDiv({ cls: "de-inner" });
    this.ensureObserver();

    this.registerDomEvent(this.scrollEl, "wheel", (ev) => this.onWheel(ev), {
      passive: false,
    });

    this.renderZoomSwitch(root);
    this.renderTimeline();
  }

  /**
   * Floating month/year segmented control in the bottom-right corner — the
   * spot the hidden status bar used to occupy. Clicking a segment reuses the
   * same crossfade path as wheel zoom (no cursor anchor, so it zooms from
   * the viewport center).
   */
  private renderZoomSwitch(root: HTMLElement): void {
    const wrap = root.createDiv({ cls: "de-zoom-switch" });
    wrap.createDiv({ cls: "de-zoom-thumb" });
    for (const level of ZOOM_ORDER) {
      const btn = wrap.createEl("button", {
        cls: "de-zoom-opt",
        text: ZOOM_LABELS[level],
      });
      btn.addEventListener("click", () => void this.applyZoom(level, null));
    }
    this.zoomSwitchEl = wrap;
    this.updateZoomSwitch();
  }

  /** Slide the highlight pill to the current zoom level. */
  private updateZoomSwitch(): void {
    if (!this.zoomSwitchEl) return;
    const idx = ZOOM_ORDER.indexOf(this.zoom);
    this.zoomSwitchEl.style.setProperty("--de-zoom-index", String(idx));
    const opts =
      this.zoomSwitchEl.querySelectorAll<HTMLElement>(".de-zoom-opt");
    opts.forEach((opt, i) => opt.toggleClass("is-active", i === idx));
  }

  /** Lazy-load thumbnails as they scroll into the timeline viewport. */
  private ensureObserver(): void {
    if (this.imgObserver || !this.scrollEl) return;
    this.imgObserver = new IntersectionObserver(
      (records) => {
        for (const record of records) {
          if (!record.isIntersecting) continue;
          const img = record.target as HTMLImageElement;
          const src = img.dataset.src;
          if (src) {
            img.src = src;
            delete img.dataset.src;
          }
          this.imgObserver?.unobserve(img);
        }
      },
      { root: this.scrollEl, rootMargin: "300px" }
    );
  }

  /** Ctrl/Cmd/Alt + wheel steps the zoom level, anchored under the cursor. */
  private onWheel(ev: WheelEvent): void {
    if (!(ev.ctrlKey || ev.metaKey || ev.altKey)) return;
    ev.preventDefault();
    if (this.swapping) return;

    // Accumulate deltas so trackpads need a deliberate gesture per step,
    // while one mouse-wheel notch still steps immediately. A pause or a
    // direction change starts the accumulation over.
    const now = Date.now();
    if (
      now - this.lastWheelAt > WHEEL_IDLE_RESET ||
      this.wheelAccum * ev.deltaY < 0
    ) {
      this.wheelAccum = 0;
    }
    this.lastWheelAt = now;
    this.wheelAccum += ev.deltaY;
    if (Math.abs(this.wheelAccum) < WHEEL_STEP) return;

    const dir = this.wheelAccum < 0 ? -1 : 1; // up = finer (month), down = coarser (year)
    this.wheelAccum = 0;
    const next = ZOOM_ORDER[ZOOM_ORDER.indexOf(this.zoom) + dir];
    if (!next || next === this.zoom) return;

    void this.applyZoom(next, ev.clientY);
  }

  /**
   * Switch zoom level, persist it, and swap the timeline with a two-phase
   * crossfade: fade/scale the old view out, redraw while invisible (restoring
   * the cursor anchor), then fade/scale the new view in. The scale direction
   * follows the zoom direction so the motion reads as zooming, and it pivots
   * on the cursor — the same point the scroll anchor keeps in place.
   */
  private async applyZoom(
    next: ZoomLevel,
    anchorClientY: number | null
  ): Promise<void> {
    if (next === this.zoom || !this.scrollEl || this.swapping) return;
    const coarser = ZOOM_ORDER.indexOf(next) > ZOOM_ORDER.indexOf(this.zoom);
    const anchor =
      anchorClientY === null ? null : this.captureAnchor(anchorClientY);

    this.zoom = next;
    this.plugin.settings.zoom = next;
    void this.plugin.saveSettings();
    this.updateZoomSwitch();

    this.swapping = true;
    const el = this.scrollEl;
    try {
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
      const rect = el.getBoundingClientRect();
      const originY =
        anchorClientY === null ? rect.height / 2 : anchorClientY - rect.top;
      el.style.transformOrigin = `50% ${originY}px`;
      // Coarser = everything shrinks away; finer = everything grows closer.
      const [outScale, inScale] = coarser ? [0.96, 1.04] : [1.04, 0.96];

      const fadeOut = el.animate(
        { opacity: [1, 0], transform: ["scale(1)", `scale(${outScale})`] },
        {
          duration: reduceMotion ? 0 : SWAP_OUT_MS,
          easing: "ease-in",
          fill: "forwards",
        }
      );
      await fadeOut.finished.catch(() => {});

      // Swap content while fully transparent. Everything up to starting the
      // fade-in runs in one task, so the fully-opaque cancel state and the
      // freshly built DOM are never painted before the fade-in's first frame.
      this.renderTimeline();
      if (anchor) this.restoreAnchor(anchor);
      fadeOut.cancel();

      const fadeIn = el.animate(
        { opacity: [0, 1], transform: [`scale(${inScale})`, "scale(1)"] },
        { duration: reduceMotion ? 0 : SWAP_IN_MS, easing: "ease-out" }
      );
      await fadeIn.finished.catch(() => {});
      el.style.transformOrigin = "";
    } finally {
      this.swapping = false;
    }
  }

  /** Record which section sits at the cursor and how far down the viewport it is. */
  private captureAnchor(clientY: number): ZoomAnchor | null {
    if (!this.listEl) return null;
    const listTop = this.listEl.getBoundingClientRect().top;
    const markers = this.listEl.querySelectorAll<HTMLElement>("[data-key]");
    let anchor: ZoomAnchor | null = null;
    for (const marker of Array.from(markers)) {
      const top = marker.getBoundingClientRect().top;
      if (top > clientY) break; // markers are in document (vertical) order
      anchor = {
        key: marker.dataset.key ?? "",
        year: Number(marker.dataset.year),
        offset: top - listTop,
      };
    }
    return anchor;
  }

  /** After a redraw, scroll so the anchored section sits where it was. */
  private restoreAnchor(anchor: ZoomAnchor): void {
    if (!this.listEl || !this.scrollEl) return;
    // Prefer the exact key; when the other zoom level has no such section,
    // fall back to the first section of the same year.
    const marker =
      this.listEl.querySelector<HTMLElement>(`[data-key="${anchor.key}"]`) ??
      this.listEl.querySelector<HTMLElement>(`[data-year="${anchor.year}"]`);
    if (!marker) return;
    const listTop = this.listEl.getBoundingClientRect().top;
    const current = marker.getBoundingClientRect().top - listTop;
    this.scrollEl.scrollTop += current - anchor.offset;
  }

  private renderTimeline(): void {
    if (!this.scrollEl || !this.listEl) return;
    const scrollTop = this.scrollEl.scrollTop;
    // Release every observed thumbnail before clearing the DOM, otherwise the
    // observer keeps references to detached <img> nodes and leaks across redraws.
    this.imgObserver?.disconnect();
    this.listEl.empty();

    // Section labels are styled per zoom level (month smaller, year larger).
    for (const level of ZOOM_ORDER) this.listEl.removeClass(`de-zoom-${level}`);
    this.listEl.addClass(`de-zoom-${this.zoom}`);

    const list = this.sorted();
    if (!list.length) {
      this.listEl.createDiv({ cls: "de-empty", text: "No diary entries." });
      return;
    }

    const items = collectRuns(buildItems(list, this.zoom, REPRESENTATIVES));
    let section: HTMLElement | null = null;

    for (const item of items) {
      if (item.kind === "group") {
        section = this.renderSection(item, parseInt(item.key, 10));
      } else {
        // A run before any header can't happen (buildItems always leads with
        // a group), but fall back to the list so nothing is silently dropped.
        (section ?? this.listEl).appendChild(this.buildRun(item));
      }
    }

    this.scrollEl.scrollTop = scrollTop;
  }

  /** Start a new section: sticky year/month label on the left of the axis. */
  private renderSection(
    item: { key: string; label: string; count: number },
    year: number
  ): HTMLElement {
    const section = this.listEl!.createDiv({
      cls: "de-section",
      attr: { "data-key": item.key, "data-year": String(year) },
    });
    // The dot sits at the section's start on the axis; the sticky head would
    // drag it along while stuck, so it lives on the section itself.
    section.createDiv({ cls: "de-sec-dot" });
    const head = section.createDiv({ cls: "de-sec-head" });
    head.createDiv({ cls: "de-sec-label", text: item.label });
    head.createDiv({ cls: "de-sec-count", text: `${item.count} 篇` });
    return section;
  }

  /**
   * Lay a run of cards out as two independent columns. Each card goes into
   * the column whose estimated height is currently smaller, so a tall card
   * in one column never forces a gap in the other.
   */
  private buildRun(item: { entries: DiaryEntry[]; hidden: DiaryEntry[] }): HTMLElement {
    const run = createDiv({ cls: "de-run" });
    const cols = [run.createDiv({ cls: "de-col" }), run.createDiv({ cls: "de-col" })];
    const heights = [0, 0];
    const place = (el: HTMLElement, height: number) => {
      const i = heights[0] <= heights[1] ? 0 : 1;
      cols[i].appendChild(el);
      heights[i] += height;
    };

    for (const entry of item.entries) {
      place(this.buildCard(entry), estimateHeight(entry));
    }
    if (item.hidden.length) {
      place(this.buildFoldCard(item.hidden, place), estimateHeight(item.hidden[0]));
    }
    return run;
  }

  /**
   * The "+N more" placeholder: a real preview card of the first hidden entry,
   * dimmed by an overlay. Clicking reveals it and flows the remaining hidden
   * entries into the columns.
   */
  private buildFoldCard(
    hidden: DiaryEntry[],
    place: (el: HTMLElement, height: number) => void
  ): HTMLElement {
    const card = this.buildCard(hidden[0]);
    card.addClass("de-fold-card");

    const mask = card.createDiv({ cls: "de-fold-mask" });
    const icon = mask.createDiv({ cls: "de-fold-icon" });
    setIcon(icon, "chevrons-down");
    mask.createDiv({ cls: "de-fold-count", text: `+${hidden.length}` });

    mask.addEventListener("click", (ev) => {
      // Keep the click from reaching the card's expand handler underneath.
      ev.stopPropagation();
      card.removeClass("de-fold-card");
      mask.remove();
      for (const entry of hidden.slice(1)) {
        place(this.buildCard(entry), estimateHeight(entry));
      }
    });
    return card;
  }

  /** Build one entry card with date label, preview, and expansion. */
  private buildCard(entry: DiaryEntry): HTMLElement {
    const card = createDiv({ cls: "de-card" });

    const label = card.createDiv({
      cls: "de-card-date",
      text: fullDate(entry.date),
    });
    label.setAttr("title", "Open this day's note");
    label.addEventListener("click", (ev) => {
      ev.stopPropagation();
      this.app.workspace.getLeaf(false).openFile(entry.file);
    });

    const preview = card.createDiv({ cls: "de-preview" });

    if (entry.previewText) {
      preview.createDiv({ cls: "de-text", text: entry.previewText });
    }
    if (entry.images.length) {
      const thumbs = preview.createDiv({ cls: "de-thumbs" });
      for (const src of entry.images.slice(0, PREVIEW_THUMBS)) {
        const img = thumbs.createEl("img", { cls: "de-thumb" });
        img.dataset.src = src;
        this.imgObserver?.observe(img);
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
          const content = await this.app.vault.cachedRead(entry.file);
          await MarkdownRenderer.render(
            this.app,
            stripFrontmatter(content),
            fullEl,
            path,
            this
          );
        }
        card.addClass("is-expanded");
        this.expanded.add(path);
      } else {
        card.removeClass("is-expanded");
        this.expanded.delete(path);
      }
    };
    card.addEventListener("click", (ev) => {
      if ((ev.target as HTMLElement).closest("a")) return;
      void setExpanded(!card.hasClass("is-expanded"));
    });

    // Restore expansion when a refresh rebuilds a card the user had opened.
    if (this.expanded.has(path)) void setExpanded(true);

    return card;
  }

}

/**
 * Estimate a collapsed card's rendered height in px, for column balancing.
 * Collapsed cards are predictable: fixed 96x72 thumbs, text clamped to four
 * lines, one tag row. Estimates only steer placement, so being a few pixels
 * off merely leaves the two column bottoms slightly uneven.
 */
function estimateHeight(entry: DiaryEntry): number {
  let h = 26 + 26 + 16; // padding+border, date line, run gap
  if (entry.previewText) {
    // ~50 chars per rendered line, clamped to 4 lines of ~26px each.
    h += Math.min(4, Math.ceil(entry.previewText.length / 50)) * 26;
  }
  if (entry.images.length) {
    const cells =
      Math.min(entry.images.length, PREVIEW_THUMBS) +
      (entry.images.length > PREVIEW_THUMBS ? 1 : 0);
    h += Math.ceil(cells / 3) * 80 + 10; // ~3 thumbs per column row
  }
  if (entry.tags.length) h += 34;
  return h;
}

function fullDate(d: Date): string {
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
