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

export const VIEW_TYPE_DAY_ECHO = "day-echo-timeline";


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
  /** Smooth-scroll glide state: where it's headed and the pending frame. */
  private scrollTarget = 0;
  private scrollRaf: number | null = null;

  private scrollEl: HTMLElement | null = null;
  private spacerEl: HTMLElement | null = null;
  /** Vault stats shown in the blank space above "today". */
  private statsEl: HTMLElement | null = null;
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
  /** Marker tops (px, relative to .de-inner) cached by positionMarkers so
   * the per-scroll sticky update never reads DOM layout. */
  private markerTops: number[] = [];
  /** .de-inner's offset from the top of the scroll content, cached likewise. */
  private listOffsetTop = 0;
  /** Label currently shown in the sticky indicator; null when hidden. */
  private stickyLabel: string | null = null;
  private reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

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
    this.stopScrollGlide();
    this.scrollEl = null;
    this.spacerEl = null;
    this.statsEl = null;
    this.listEl = null;
    this.zoomSwitchEl = null;
    this.stickyLabelEl = null;
    this.stickyLabel = null;
    this.markers = [];
    this.markerTops = [];
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
    this.statsEl = this.spacerEl.createDiv({ cls: "de-stats" });
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
      // 600px of lead ≈ 250ms at the capped glide speed, enough headroom to
      // decode full-size photos before they reach the viewport.
      { root: this.scrollEl, rootMargin: "600px" }
    );
  }

  /** Modifier + wheel zooms; a plain wheel becomes a smooth, capped glide. */
  private onWheel(ev: WheelEvent): void {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) {
      this.onZoomWheel(ev);
    } else {
      this.onScrollWheel(ev);
    }
  }

  /**
   * Replace native wheel scrolling with an eased glide toward an accumulated
   * target, capping both how far one event can push the target and how fast
   * the view moves per frame — limiting the top scroll speed.
   */
  private onScrollWheel(ev: WheelEvent): void {
    if (!this.scrollEl) return;
    // Honor reduced motion: leave the native (instant) scroll untouched.
    if (this.reduceMotion.matches) return;
    ev.preventDefault();
    // deltaMode 1 reports lines, not pixels; normalize.
    const px = ev.deltaY * (ev.deltaMode === 1 ? 20 : 1);
    // A fresh gesture (no glide running) starts from the live position, so
    // scrollbar drags and programmatic jumps are never undone.
    if (this.scrollRaf === null) this.scrollTarget = this.scrollEl.scrollTop;
    const maxTop = this.scrollEl.scrollHeight - this.scrollEl.clientHeight;
    this.scrollTarget = clamp(
      this.scrollTarget + clamp(px, -SCROLL_MAX_STEP, SCROLL_MAX_STEP),
      0,
      maxTop
    );
    this.animateScroll();
  }

  /**
   * Drive scrollTop toward the glide target, easing but speed-capped.
   * Steps are scaled by real elapsed time (in 60fps-frame units), so the
   * glide moves at the same speed on high-refresh displays and keeps pace
   * across dropped frames instead of visibly slowing down.
   */
  private animateScroll(): void {
    if (this.scrollRaf !== null) return;
    let last = performance.now();
    const step = (now: number): void => {
      this.scrollRaf = null;
      const el = this.scrollEl;
      if (!el) return;
      const diff = this.scrollTarget - el.scrollTop;
      if (Math.abs(diff) < 1) {
        el.scrollTop = this.scrollTarget;
        return;
      }
      // Elapsed 60fps frames, capped so a long stall cannot cause a jump.
      const frames = Math.min(Math.max((now - last) / (1000 / 60), 0.25), 3);
      last = now;
      const ease = 1 - (1 - SCROLL_EASE) ** frames;
      const cap = SCROLL_MAX_SPEED * frames;
      const eased = clamp(diff * ease, -cap, cap);
      // Always cover at least a pixel so the glide cannot stall short.
      el.scrollTop += Math.abs(eased) < 1 ? Math.sign(diff) : eased;
      this.scrollRaf = requestAnimationFrame(step);
    };
    this.scrollRaf = requestAnimationFrame(step);
  }

  private stopScrollGlide(): void {
    if (this.scrollRaf !== null) cancelAnimationFrame(this.scrollRaf);
    this.scrollRaf = null;
  }

  /** Ctrl/Cmd/Alt + wheel steps the zoom level, anchored under the cursor. */
  private onZoomWheel(ev: WheelEvent): void {
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
      const reduceMotion = this.reduceMotion.matches;
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
    // A redraw may move everything; kill any in-flight glide first.
    this.stopScrollGlide();
    const scrollTop = this.scrollEl.scrollTop;
    this.updateStats();
    // Release every observed thumbnail before clearing the DOM, otherwise the
    // observer keeps references to detached <img> nodes and leaks across redraws.
    this.imgObserver?.disconnect();
    this.colObserver?.disconnect();
    this.colObserver = null;
    this.markers = [];
    this.markerTops = [];
    this.stickyLabelEl = null;
    this.stickyLabel = null;
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
    this.scrollTarget = this.scrollEl.scrollTop;
    this.updateSticky();
  }

  /** Refresh the note-count stats shown in the top blank space. */
  private updateStats(): void {
    if (!this.statsEl) return;
    this.statsEl.empty();
    this.statsEl.createSpan({
      cls: "de-stats-num",
      text: String(this.entries.length),
    });
    this.statsEl.createSpan({ text: "篇日记" });
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
    // Cache the geometry the sticky update needs, so it never has to read
    // layout itself: marker tops plus .de-inner's offset within the scroll
    // content (top spacer + padding).
    this.markerTops = tops;
    if (this.scrollEl && this.listEl) {
      this.listOffsetTop =
        this.listEl.getBoundingClientRect().top -
        this.scrollEl.getBoundingClientRect().top +
        this.scrollEl.scrollTop;
    }
  }

  /**
   * Show the last group that crossed the viewport top in the sticky label.
   * Runs on every scroll event, so it must stay off the layout pipeline: it
   * compares scrollTop against the tops cached by positionMarkers (no rect
   * reads) and touches the DOM only when the label actually changes —
   * otherwise each scroll frame forces a synchronous reflow and the glide
   * stutters.
   */
  private updateSticky(): void {
    if (!this.stickyLabelEl || !this.scrollEl) return;
    const y = this.scrollEl.scrollTop - this.listOffsetTop;
    let label: string | null = null;
    for (let i = 0; i < this.markerTops.length; i++) {
      if (this.markerTops[i] - y < 1) label = this.markers[i].label;
      else break; // markers are in vertical order
    }
    if (label === this.stickyLabel) return;
    this.stickyLabel = label;
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

}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
