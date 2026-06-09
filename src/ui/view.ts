import {
  ItemView,
  MarkdownRenderer,
  Menu,
  WorkspaceLeaf,
  debounce,
} from "obsidian";
import { DiaryEntry, RenderItem, ZoomLevel } from "../types";
import { buildItems } from "../core/aggregate";
import { scanDiaries, stripFrontmatter } from "../core/scanner";
import type DayEchoPlugin from "../main";

export const VIEW_TYPE_DAY_ECHO = "day-echo-timeline";

const PREVIEW_THUMBS = 4;
/** How many entries each month/year group shows before the rest is folded. */
const REPRESENTATIVES = 6;
/** Zoom levels from finest to coarsest. */
const ZOOM_ORDER: ZoomLevel[] = ["day", "month", "year"];
/** Min gap between wheel-driven zoom steps, so one gesture jumps one level. */
const ZOOM_COOLDOWN = 250;

/** Where the cursor was anchored before a zoom, so the view can stay put after. */
interface ZoomAnchor {
  year: number;
  offset: number;
}

export class DayEchoView extends ItemView {
  private plugin: DayEchoPlugin;
  private entries: DiaryEntry[] = [];
  private zoom: ZoomLevel;
  private search = "";
  private selectedTags = new Set<string>();
  /** File paths of cards the user has expanded, preserved across refreshes. */
  private expanded = new Set<string>();
  private lastZoomAt = 0;

  private listEl: HTMLElement | null = null;
  private railEl: HTMLElement | null = null;
  private tagBtn: HTMLButtonElement | null = null;
  private zoomBtn: HTMLButtonElement | null = null;
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
    this.listEl = null;
    this.railEl = null;
  }

  /** Re-scan the vault, prune stale filters, and rebuild only what changed. */
  async refresh(): Promise<void> {
    this.entries = await scanDiaries(this.app, this.plugin.settings.dailyFolder);

    // Drop selected tags that no longer exist, so the filter can't hide everything.
    const valid = new Set(this.allTags());
    for (const tag of [...this.selectedTags]) {
      if (!valid.has(tag)) this.selectedTags.delete(tag);
    }

    // Build the toolbar/body shell once; later refreshes only redraw the timeline,
    // keeping the search box, its focus, and scroll position intact.
    if (this.listEl) {
      this.updateTagBtn();
      this.renderTimeline();
    } else {
      this.renderShell();
    }
  }

  private allTags(): string[] {
    const set = new Set<string>();
    for (const entry of this.entries) {
      for (const tag of entry.tags) set.add(tag);
    }
    return [...set].sort();
  }

  private filtered(): DiaryEntry[] {
    const query = this.search.trim().toLowerCase();
    const list = this.entries.filter((entry) => {
      if (query && !entry.searchText.includes(query)) return false;
      for (const tag of this.selectedTags) {
        if (!entry.tags.includes(tag)) return false;
      }
      return true;
    });
    const ascending = this.plugin.settings.sortAscending;
    list.sort((a, b) =>
      ascending
        ? a.date.getTime() - b.date.getTime()
        : b.date.getTime() - a.date.getTime()
    );
    return list;
  }

  /** Build the toolbar + body containers once, then fill the timeline. */
  private renderShell(): void {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass("day-echo-view");

    const toolbar = root.createDiv({ cls: "de-toolbar" });

    const search = toolbar.createEl("input", {
      cls: "de-search",
      attr: { type: "text", placeholder: "Search entries…" },
    });
    search.value = this.search;
    search.addEventListener(
      "input",
      debounce(() => {
        this.search = search.value;
        this.renderTimeline();
      }, 200)
    );

    this.tagBtn = toolbar.createEl("button", { cls: "de-tool-btn" });
    this.updateTagBtn();
    this.tagBtn.addEventListener("click", (ev) => this.openTagMenu(ev));

    const sortBtn = toolbar.createEl("button", { cls: "de-tool-btn" });
    const paintSort = () =>
      sortBtn.setText(
        this.plugin.settings.sortAscending ? "Oldest first" : "Newest first"
      );
    paintSort();
    sortBtn.addEventListener("click", () => {
      this.plugin.settings.sortAscending = !this.plugin.settings.sortAscending;
      void this.plugin.saveSettings();
      paintSort();
      this.renderTimeline();
    });

    // Zoom level indicator. Ctrl/Cmd+wheel is the primary control; clicking
    // cycles levels too, for discoverability.
    this.zoomBtn = toolbar.createEl("button", {
      cls: "de-tool-btn",
      attr: { title: "Ctrl/Cmd + scroll to zoom the timeline" },
    });
    this.updateZoomBtn();
    this.zoomBtn.addEventListener("click", () => {
      const idx = ZOOM_ORDER.indexOf(this.zoom);
      this.applyZoom(ZOOM_ORDER[(idx + 1) % ZOOM_ORDER.length], null);
    });

    const body = root.createDiv({ cls: "de-body" });
    this.listEl = body.createDiv({ cls: "de-scroll" });
    this.railEl = body.createDiv({ cls: "de-rail" });
    this.ensureObserver();

    this.registerDomEvent(this.listEl, "wheel", (ev) => this.onWheel(ev), {
      passive: false,
    });

    this.renderTimeline();
  }

  /** Lazy-load thumbnails as they scroll into the timeline viewport. */
  private ensureObserver(): void {
    if (this.imgObserver || !this.listEl) return;
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
      { root: this.listEl, rootMargin: "300px" }
    );
  }

  private updateTagBtn(): void {
    if (!this.tagBtn) return;
    const count = this.selectedTags.size;
    this.tagBtn.setText(count ? `Tags (${count})` : "Tags");
  }

  private updateZoomBtn(): void {
    if (!this.zoomBtn) return;
    const label = { day: "Day", month: "Month", year: "Year" }[this.zoom];
    this.zoomBtn.setText(label);
  }

  private openTagMenu(ev: MouseEvent): void {
    const tags = this.allTags();
    const menu = new Menu();

    if (!tags.length) {
      menu.addItem((item) => item.setTitle("No tags").setDisabled(true));
    }
    for (const tag of tags) {
      menu.addItem((item) =>
        item
          .setTitle(tag)
          .setChecked(this.selectedTags.has(tag))
          .onClick(() => {
            if (this.selectedTags.has(tag)) this.selectedTags.delete(tag);
            else this.selectedTags.add(tag);
            this.updateTagBtn();
            this.renderTimeline();
          })
      );
    }
    if (this.selectedTags.size) {
      menu.addSeparator();
      menu.addItem((item) =>
        item.setTitle("Clear filter").onClick(() => {
          this.selectedTags.clear();
          this.updateTagBtn();
          this.renderTimeline();
        })
      );
    }
    menu.showAtMouseEvent(ev);
  }

  /** Ctrl/Cmd + wheel steps the zoom level, anchored under the cursor. */
  private onWheel(ev: WheelEvent): void {
    if (!(ev.ctrlKey || ev.metaKey)) return;
    ev.preventDefault();

    const now = Date.now();
    if (now - this.lastZoomAt < ZOOM_COOLDOWN) return;

    const dir = ev.deltaY < 0 ? -1 : 1; // up = finer (day), down = coarser (year)
    const next = ZOOM_ORDER[ZOOM_ORDER.indexOf(this.zoom) + dir];
    if (!next || next === this.zoom) return;

    this.lastZoomAt = now;
    this.applyZoom(next, ev.clientY);
  }

  /** Switch zoom level, persist it, and redraw with a crossfade + anchor. */
  private applyZoom(next: ZoomLevel, anchorClientY: number | null): void {
    if (next === this.zoom || !this.listEl) return;
    const anchor =
      anchorClientY === null ? null : this.captureAnchor(anchorClientY);

    this.zoom = next;
    this.plugin.settings.zoom = next;
    void this.plugin.saveSettings();
    this.updateZoomBtn();

    this.listEl.addClass("is-swapping");
    requestAnimationFrame(() => {
      this.renderTimeline();
      if (anchor) this.restoreAnchor(anchor);
      requestAnimationFrame(() => this.listEl?.removeClass("is-swapping"));
    });
  }

  /** Record which year sits at the cursor and how far down the viewport it is. */
  private captureAnchor(clientY: number): ZoomAnchor | null {
    if (!this.listEl) return null;
    const listTop = this.listEl.getBoundingClientRect().top;
    const markers = this.listEl.querySelectorAll<HTMLElement>("[data-year]");
    let anchor: ZoomAnchor | null = null;
    for (const marker of Array.from(markers)) {
      const top = marker.getBoundingClientRect().top;
      if (top > clientY) break; // markers are in document (vertical) order
      anchor = { year: Number(marker.dataset.year), offset: top - listTop };
    }
    return anchor;
  }

  /** After a redraw, scroll so the anchored year sits where it was. */
  private restoreAnchor(anchor: ZoomAnchor): void {
    if (!this.listEl) return;
    const marker = this.listEl.querySelector<HTMLElement>(
      `[data-year="${anchor.year}"]`
    );
    if (!marker) return;
    const listTop = this.listEl.getBoundingClientRect().top;
    const current = marker.getBoundingClientRect().top - listTop;
    this.listEl.scrollTop += current - anchor.offset;
  }

  private renderTimeline(): void {
    if (!this.listEl || !this.railEl) return;
    const scrollTop = this.listEl.scrollTop;
    // Release every observed thumbnail before clearing the DOM, otherwise the
    // observer keeps references to detached <img> nodes and leaks across redraws.
    this.imgObserver?.disconnect();
    this.listEl.empty();
    this.railEl.empty();

    const list = this.filtered();
    if (!list.length) {
      this.listEl.createDiv({ cls: "de-empty", text: "No matching entries." });
      return;
    }

    const items = buildItems(list, this.zoom, REPRESENTATIVES);
    const years: number[] = [];
    const seenYears = new Set<number>();
    const noteYear = (year: number) => {
      if (!seenYears.has(year)) {
        seenYears.add(year);
        years.push(year);
      }
    };

    for (const item of items) {
      switch (item.kind) {
        case "year":
          noteYear(item.year);
          this.renderYear(item.year);
          break;
        case "group":
          noteYear(parseInt(item.key, 10));
          this.renderGroup(item);
          break;
        case "card":
          this.listEl.appendChild(this.buildCardRow(item.entry));
          break;
        case "fold":
          this.renderFold(item);
          break;
      }
    }

    this.renderRail(years);
    this.listEl.scrollTop = scrollTop;
  }

  private renderYear(year: number): void {
    if (!this.listEl) return;
    const node = this.listEl.createDiv({
      cls: "de-year",
      attr: { "data-year": String(year) },
    });
    node.createDiv({ cls: "de-year-label", text: String(year) });
    node.createDiv({ cls: "de-year-dot" });
  }

  private renderGroup(item: { key: string; label: string }): void {
    if (!this.listEl) return;
    const node = this.listEl.createDiv({
      cls: "de-group",
      attr: { "data-year": String(parseInt(item.key, 10)) },
    });
    node.createDiv({ cls: "de-date" }); // spacer keeps the dot on the axis
    node.createDiv({ cls: "de-year-dot" });
    node.createDiv({ cls: "de-group-label", text: item.label });
  }

  private renderFold(item: { hidden: DiaryEntry[] }): void {
    if (!this.listEl) return;
    const row = this.listEl.createDiv({ cls: "de-row de-fold-row" });
    row.createDiv({ cls: "de-date" });
    row.createDiv({ cls: "de-dot" });
    const fold = row.createDiv({
      cls: "de-fold",
      text: `+${item.hidden.length} more`,
    });
    fold.addEventListener("click", () => {
      for (const entry of item.hidden) {
        this.listEl?.insertBefore(this.buildCardRow(entry), row);
      }
      row.remove();
    });
  }

  /** Build a detached entry card row, ready to append or insert. */
  private buildCardRow(entry: DiaryEntry): HTMLElement {
    const row = createDiv({ cls: "de-row" });

    const date = row.createDiv({ cls: "de-date", text: monthDay(entry.date) });
    date.setAttr("title", "Open this day's note");
    date.addEventListener("click", () => {
      this.app.workspace.getLeaf(false).openFile(entry.file);
    });

    row.createDiv({ cls: "de-dot" });

    const card = row.createDiv({ cls: "de-card" });
    if (entry.images.length) row.addClass("has-thumbs");
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

    return row;
  }

  private renderRail(years: number[]): void {
    if (!this.railEl || !this.listEl) return;
    for (const year of years) {
      const btn = this.railEl.createDiv({
        cls: "de-rail-year",
        text: String(year).slice(2),
      });
      btn.addEventListener("click", () => {
        const node = this.listEl?.querySelector(`[data-year="${year}"]`);
        node?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }
}

function monthDay(d: Date): string {
  return `${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
