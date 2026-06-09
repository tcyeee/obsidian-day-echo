import {
  ItemView,
  MarkdownRenderer,
  Menu,
  WorkspaceLeaf,
  debounce,
} from "obsidian";
import { DiaryEntry } from "./types";
import { scanDiaries, stripFrontmatter } from "./scanner";
import type DayEchoPlugin from "./main";

export const VIEW_TYPE_DAY_ECHO = "day-echo-timeline";

const PREVIEW_THUMBS = 4;

export class DayEchoView extends ItemView {
  private plugin: DayEchoPlugin;
  private entries: DiaryEntry[] = [];
  private search = "";
  private selectedTags = new Set<string>();
  private sortAscending: boolean;

  private listEl: HTMLElement | null = null;
  private railEl: HTMLElement | null = null;
  private tagBtn: HTMLButtonElement | null = null;
  private imgObserver: IntersectionObserver | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: DayEchoPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.sortAscending = plugin.settings.sortAscending;
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
      { root: this.containerEl, rootMargin: "300px" }
    );

    await this.refresh();
  }

  async onClose(): Promise<void> {
    this.imgObserver?.disconnect();
    this.imgObserver = null;
  }

  /** Re-scan the vault and rebuild the view. */
  async refresh(): Promise<void> {
    this.entries = await scanDiaries(this.app, this.plugin.settings.dailyFolder);
    this.renderShell();
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
      if (query && !entry.previewText.toLowerCase().includes(query)) return false;
      for (const tag of this.selectedTags) {
        if (!entry.tags.includes(tag)) return false;
      }
      return true;
    });
    list.sort((a, b) =>
      this.sortAscending
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
      sortBtn.setText(this.sortAscending ? "Oldest first" : "Newest first");
    paintSort();
    sortBtn.addEventListener("click", () => {
      this.sortAscending = !this.sortAscending;
      paintSort();
      this.renderTimeline();
    });

    const body = root.createDiv({ cls: "de-body" });
    this.listEl = body.createDiv({ cls: "de-scroll" });
    this.railEl = body.createDiv({ cls: "de-rail" });

    this.renderTimeline();
  }

  private updateTagBtn(): void {
    if (!this.tagBtn) return;
    const count = this.selectedTags.size;
    this.tagBtn.setText(count ? `Tags (${count})` : "Tags");
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

  private renderTimeline(): void {
    if (!this.listEl || !this.railEl) return;
    this.listEl.empty();
    this.railEl.empty();

    const list = this.filtered();
    if (!list.length) {
      this.listEl.createDiv({ cls: "de-empty", text: "No matching entries." });
      return;
    }

    const years: number[] = [];
    let lastYear: number | null = null;
    for (const entry of list) {
      const year = entry.date.getFullYear();
      if (year !== lastYear) {
        years.push(year);
        const node = this.listEl.createDiv({
          cls: "de-year",
          attr: { "data-year": String(year) },
        });
        node.createDiv({ cls: "de-year-label", text: String(year) });
        node.createDiv({ cls: "de-year-dot" });
        lastYear = year;
      }
      this.renderCard(entry);
    }
    this.renderRail(years);
  }

  private renderCard(entry: DiaryEntry): void {
    if (!this.listEl) return;
    const row = this.listEl.createDiv({ cls: "de-row" });

    const date = row.createDiv({ cls: "de-date", text: monthDay(entry.date) });
    date.setAttr("title", "Open this day's note");
    date.addEventListener("click", () => {
      this.app.workspace.getLeaf(false).openFile(entry.file);
    });

    row.createDiv({ cls: "de-dot" });

    const card = row.createDiv({ cls: "de-card" });
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

    let fullEl: HTMLElement | null = null;
    const toggle = async (): Promise<void> => {
      if (card.hasClass("is-expanded")) {
        card.removeClass("is-expanded");
        return;
      }
      if (!fullEl) {
        fullEl = card.createDiv({ cls: "de-full" });
        const content = await this.app.vault.cachedRead(entry.file);
        await MarkdownRenderer.render(
          this.app,
          stripFrontmatter(content),
          fullEl,
          entry.file.path,
          this
        );
      }
      card.addClass("is-expanded");
    };
    card.addEventListener("click", (ev) => {
      if ((ev.target as HTMLElement).closest("a")) return;
      void toggle();
    });
  }

  private renderRail(years: number[]): void {
    if (!this.railEl || !this.listEl) return;
    for (const year of years) {
      const btn = this.railEl.createDiv({
        cls: "de-rail-year",
        text: String(year).slice(2),
      });
      btn.addEventListener("click", () => {
        const node = this.listEl?.querySelector(
          `.de-year[data-year="${year}"]`
        );
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
