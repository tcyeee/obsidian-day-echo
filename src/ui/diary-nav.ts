import type { MarkdownView, TFile } from "obsidian";
import type DayEchoPlugin from "../main";
import { markdownFilesIn } from "../core/scanner";
import { t } from "../i18n";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const NAV_CLS = "de-nav";
/** Marker on `.view-content` establishing the positioning context for the overlay. */
const HOST_CLS = "de-has-nav";
/** Editor/preview sizer whose left edge marks where the note's text actually starts. */
const CONTENT_SIZER_SELECTOR = ".cm-sizer, .markdown-preview-sizer";

export interface DiaryNeighbors<T> {
  prev: T | null;
  next: T | null;
}

/** Pick the nearest older/newer diary around `current` among `YYYY-MM-DD`-named files. */
export function findNeighbors<T extends { basename: string }>(
  files: T[],
  current: T
): DiaryNeighbors<T> {
  if (!DATE_RE.test(current.basename)) return { prev: null, next: null };
  const sorted = files
    .filter((f) => DATE_RE.test(f.basename))
    .sort((a, b) => a.basename.localeCompare(b.basename));
  const idx = sorted.findIndex(
    (f) => f === current || f.basename === current.basename
  );
  if (idx === -1) return { prev: null, next: null };
  return {
    prev: idx > 0 ? sorted[idx - 1] : null,
    next: idx < sorted.length - 1 ? sorted[idx + 1] : null,
  };
}

/** Overlays a prev/next pill pair in the bottom-left corner of daily-note views. */
export class DiaryNav {
  private observers = new Map<HTMLElement, ResizeObserver>();

  constructor(private plugin: DayEchoPlugin) {}

  /** Re-render the nav overlay on all open Markdown leaves; idempotent. */
  refresh(): void {
    for (const leaf of this.plugin.app.workspace.getLeavesOfType("markdown")) {
      this.render(leaf.view as MarkdownView);
    }
  }

  /** Remove every injected overlay, e.g. on unload or when the setting is off. */
  detachAll(): void {
    for (const [content, observer] of this.observers) {
      observer.disconnect();
      content.removeClass(HOST_CLS);
    }
    this.observers.clear();
    activeDocument.querySelectorAll(`.${NAV_CLS}`).forEach((el) => el.remove());
  }

  private render(view: MarkdownView): void {
    const content = view.containerEl.querySelector<HTMLElement>(
      ":scope > .view-content"
    );
    if (!content) return;
    content.querySelector(`:scope > .${NAV_CLS}`)?.remove();
    this.observers.get(content)?.disconnect();
    this.observers.delete(content);
    content.removeClass(HOST_CLS);

    const file = view.file;
    if (!this.plugin.settings.showDiaryNav || !file || !this.inDailyFolder(file))
      return;
    const { prev, next } = findNeighbors(this.diaries(), file);
    if (!prev && !next) return;

    const nav = createDiv({ cls: NAV_CLS });
    if (prev) this.button(nav, view, prev, "←", t("nav.prev"));
    if (next) this.button(nav, view, next, "→", t("nav.next"));
    content.addClass(HOST_CLS);
    content.appendChild(nav);

    const alignNav = () => this.alignLeft(content, nav);
    alignNav();
    const observer = new ResizeObserver(alignNav);
    observer.observe(content);
    this.observers.set(content, observer);
  }

  /** Pin `nav`'s left edge to the note's own text margin, so it lines up with the content. */
  private alignLeft(content: HTMLElement, nav: HTMLElement): void {
    const sizer = content.querySelector<HTMLElement>(CONTENT_SIZER_SELECTOR);
    if (!sizer) return;
    const offset = sizer.getBoundingClientRect().left -
      content.getBoundingClientRect().left;
    nav.style.left = `${Math.max(offset, 0)}px`;
  }

  private button(
    nav: HTMLElement,
    view: MarkdownView,
    target: TFile,
    arrow: string,
    label: string
  ): void {
    const btn = nav.createEl("a", {
      cls: "de-nav-btn",
      text: `${arrow} ${target.basename}`,
    });
    const title = `${label}: ${target.basename}`;
    btn.setAttribute("aria-label", title);
    btn.setAttribute("title", title);
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      void view.leaf.openFile(target);
    });
  }

  private inDailyFolder(file: TFile): boolean {
    const folder = this.plugin.settings.dailyFolder.replace(/\/+$/, "");
    return folder === "" || file.path.startsWith(folder + "/");
  }

  /** All date-named Markdown files inside the daily folder. */
  private diaries(): TFile[] {
    return markdownFilesIn(
      this.plugin.app,
      this.plugin.settings.dailyFolder
    ).filter((f) => DATE_RE.test(f.basename));
  }
}
