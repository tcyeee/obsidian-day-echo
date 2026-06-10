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

export const VIEW_TYPE_DAY_ECHO = "day-echo-timeline";

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

export class DayEchoView extends ItemView {
  private plugin: DayEchoPlugin;
  private entries: DiaryEntry[] = [];
  private zoom: ZoomLevel;
  /** File paths of cards the user has expanded, preserved across refreshes. */
  private expanded = new Set<string>();
  /** Group keys whose "+N" fold the user has opened, preserved likewise. */
  private unfolded = new Set<string>();
  private wheelAccum = 0;
  private lastWheelAt = 0;
  /** True while the zoom crossfade is playing; wheel steps are ignored. */
  private swapping = false;

  private scrollEl: HTMLElement | null = null;
  private spacerEl: HTMLElement | null = null;
  private listEl: HTMLElement | null = null;
  private zoomSwitchEl: HTMLElement | null = null;
  private imgObserver: IntersectionObserver | null = null;
  /** Group markers on the axis, each anchored to its group's first card. */
  private markers: { el: HTMLElement; label: string; cardEl: HTMLElement }[] =
    [];
  /** Re-anchors markers when column heights change (expansion, resize). */
  private colObserver: ResizeObserver | null = null;
  /** Label inside the sticky current-group indicator. */
  private stickyLabelEl: HTMLElement | null = null;

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
    this.colObserver?.disconnect();
    this.colObserver = null;
    this.scrollEl = null;
    this.spacerEl = null;
    this.listEl = null;
    this.zoomSwitchEl = null;
    this.stickyLabelEl = null;
    this.markers = [];
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
    // Breathing room above "today": scrolled to the top, the timeline starts
    // 30% of the screen down. Lives outside .de-inner so the axis line
    // (drawn on .de-inner) starts at the today dot, not in the empty space.
    this.spacerEl = this.scrollEl.createDiv({ cls: "de-top-spacer" });
    // Inner container caps the content width and carries the axis line, so
    // both stay centered when the panel is wider than the cap.
    this.listEl = this.scrollEl.createDiv({ cls: "de-inner" });
    this.ensureObserver();

    this.registerDomEvent(this.scrollEl, "wheel", (ev) => this.onWheel(ev), {
      passive: false,
    });
    this.registerDomEvent(this.scrollEl, "scroll", () => this.updateSticky());

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
    this.colObserver?.disconnect();
    this.colObserver = null;
    this.markers = [];
    this.stickyLabelEl = null;
    this.listEl.empty();

    // Section labels are styled per zoom level (month smaller, year larger).
    for (const level of ZOOM_ORDER) this.listEl.removeClass(`de-zoom-${level}`);
    this.listEl.addClass(`de-zoom-${this.zoom}`);

    // The today block (and its top spacer) only makes sense newest-first,
    // where the top of the timeline is today. When today's diary exists it
    // flows into the columns as a regular (highlighted) card under its own
    // "今天" marker; only the create-CTA renders as a standalone block.
    const ascending = this.plugin.settings.sortAscending;
    this.spacerEl?.toggleClass("de-hidden", ascending);
    const todayEntry = ascending ? null : this.findToday();
    if (!ascending && !todayEntry) this.renderTodayCta();

    // Today's entry gets its own section; drop it from the grouped flow so
    // it does not appear twice.
    const list = this.sorted().filter((e) => e !== todayEntry);
    if (!list.length && !todayEntry) {
      if (ascending) {
        this.listEl.createDiv({ cls: "de-empty", text: "No diary entries." });
      }
      return;
    }

    // Sticky current-group indicator: pinned at the viewport top, its text
    // swapped on scroll to the last group that crossed the top edge.
    const sticky = this.listEl.createDiv({ cls: "de-sticky is-hidden" });
    this.stickyLabelEl = sticky.createDiv({ cls: "de-sec-label" });

    // One continuous two-column flow for the whole timeline: group
    // boundaries never break the columns, so months/years meet seamlessly.
    const plan = planLayout(
      prependToday(
        buildItems(list, this.zoom, this.zoom === "month" ? Infinity : REPRESENTATIVES),
        todayEntry
      ),
      this.unfolded,
      estimateHeight
    );
    const flow = this.listEl.createDiv({ cls: "de-flow" });
    const cols = [
      flow.createDiv({ cls: "de-col" }),
      flow.createDiv({ cls: "de-col" }),
    ];
    const cardEls = plan.cards.map((card) => {
      const el =
        card.fold && card.foldKey
          ? this.buildFoldCard(card.foldKey, card.fold)
          : this.buildCard(card.entry);
      if (!card.fold && card.entry === todayEntry) el.addClass("de-today-card");
      cols[card.col].appendChild(el);
      return el;
    });

    // Group markers live outside the flow, absolutely anchored to their
    // group's first card (positionMarkers reads its offsetTop).
    for (const group of plan.groups) {
      // The "today" marker reuses the glowing-dot/accent-label styling and
      // hides the entry count; its year anchors zoom restore like the rest.
      const isToday = group.key === "today";
      const year = isToday ? new Date().getFullYear() : parseInt(group.key, 10);
      const marker = this.listEl.createDiv({
        cls: "de-marker",
        attr: { "data-key": group.key, "data-year": String(year) },
      });
      marker.createDiv({
        cls: isToday ? "de-sec-dot de-today-dot" : "de-sec-dot",
      });
      marker.createDiv({
        cls: isToday ? "de-sec-label de-today-label" : "de-sec-label",
        text: group.label,
      });
      if (!isToday) {
        marker.createDiv({ cls: "de-sec-count", text: `${group.count} 篇` });
      }
      this.markers.push({
        el: marker,
        label: group.label,
        cardEl: cardEls[group.firstCard],
      });
    }
    this.positionMarkers();

    // Column heights move when cards expand or lazily rendered cards get
    // their real size; keep the markers glued to their first cards.
    this.colObserver = new ResizeObserver(() => {
      this.positionMarkers();
      this.updateSticky();
    });
    for (const col of cols) this.colObserver.observe(col);

    this.scrollEl.scrollTop = scrollTop;
    this.updateSticky();
  }

  /** Pin each group marker level with its first card, pushed apart on overlap. */
  private positionMarkers(): void {
    // offsetTop is relative to .de-inner (the nearest positioned ancestor),
    // the same box the markers are positioned in.
    const desired = this.markers.map((m) => m.cardEl.offsetTop);
    const tops = resolveMarkerTops(desired, MARKER_MIN_GAP);
    this.markers.forEach((m, i) => {
      m.el.style.top = `${tops[i]}px`;
    });
  }

  /** Show the last group that crossed the viewport top in the sticky label. */
  private updateSticky(): void {
    if (!this.stickyLabelEl || !this.scrollEl) return;
    const topEdge = this.scrollEl.getBoundingClientRect().top;
    let label: string | null = null;
    for (const m of this.markers) {
      if (m.el.getBoundingClientRect().top - topEdge < 1) label = m.label;
      else break; // markers are in vertical order
    }
    this.stickyLabelEl.parentElement?.toggleClass("is-hidden", label === null);
    if (label !== null) this.stickyLabelEl.setText(label);
  }

  /** Today's entry, if a diary for the current date exists. */
  private findToday(): DiaryEntry | null {
    const now = new Date();
    return (
      this.entries.find(
        (e) =>
          e.date.getFullYear() === now.getFullYear() &&
          e.date.getMonth() === now.getMonth() &&
          e.date.getDate() === now.getDate()
      ) ?? null
    );
  }

  /**
   * The "today" block pinned at the top of the timeline when no diary exists
   * yet: a call-to-action card that creates and opens today's note. (An
   * existing diary instead flows into the columns under a "今天" marker.)
   */
  private renderTodayCta(): void {
    const section = this.listEl!.createDiv({
      cls: "de-section de-today-section",
    });
    section.createDiv({ cls: "de-sec-dot de-today-dot" });
    const head = section.createDiv({ cls: "de-sec-head" });
    head.createDiv({ cls: "de-sec-label de-today-label", text: "今天" });

    const wrap = section.createDiv({ cls: "de-today-wrap" });
    const card = wrap.createDiv({
      cls: "de-card de-today-card de-today-empty",
    });
    const icon = card.createDiv({ cls: "de-today-plus" });
    setIcon(icon, "plus");
    card.createDiv({ text: "开始今天的日记" });
    card.addEventListener("click", () => void this.createTodayNote());
  }

  /** Create (if needed) and open today's daily note. */
  private async createTodayNote(): Promise<void> {
    const folder = this.plugin.settings.dailyFolder.replace(/\/+$/, "");
    const now = new Date();
    const name = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.md`;
    const path = folder ? `${folder}/${name}` : name;
    try {
      let file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) {
        if (folder && !this.app.vault.getAbstractFileByPath(folder)) {
          await this.app.vault.createFolder(folder);
        }
        file = await this.app.vault.create(path, "");
      }
      await this.app.workspace.getLeaf(false).openFile(file as TFile);
    } catch (err) {
      new Notice(`Day Echo: 创建今日日记失败 — ${String(err)}`);
    }
  }

  /**
   * The "+N more" placeholder: a real preview card of the first hidden entry,
   * dimmed by an overlay. Clicking marks the group unfolded and re-renders,
   * flowing the hidden entries into the columns in date order.
   */
  private buildFoldCard(key: string, hidden: DiaryEntry[]): HTMLElement {
    const card = this.buildCard(hidden[0]);
    card.addClass("de-fold-card");

    const mask = card.createDiv({ cls: "de-fold-mask" });
    const icon = mask.createDiv({ cls: "de-fold-icon" });
    setIcon(icon, "chevrons-down");
    mask.createDiv({ cls: "de-fold-count", text: `+${hidden.length}` });

    mask.addEventListener("click", (ev) => {
      // Keep the click from reaching the card's expand handler underneath.
      ev.stopPropagation();
      this.unfolded.add(key);
      this.renderTimeline(); // keeps scrollTop; hidden cards join the flow
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
