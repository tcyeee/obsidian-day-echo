import type { MarkdownView, TFile } from "obsidian";
import type DayEchoPlugin from "../main";
import { markdownFilesIn } from "../core/scanner";
import { t } from "../i18n";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const NAV_CLS = "de-nav";
/** Marker on `.view-content` establishing the positioning context for the overlay. */
const HOST_CLS = "de-has-nav";
/** Modifier applied when the note uses Obsidian's readable line length, so the
 *  overlay's CSS can mirror the same max-width/centering as the note's text. */
const READABLE_CLS = "de-nav-readable";
/** Marks the editor/preview root when readable line length is active. */
const READABLE_SELECTOR =
  ".markdown-source-view.is-readable-line-width, .markdown-preview-view.is-readable-line-width";

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
  constructor(private plugin: DayEchoPlugin) {}

  /** Re-render the nav overlay on all open Markdown leaves; idempotent. */
  refresh(): void {
    for (const leaf of this.plugin.app.workspace.getLeavesOfType("markdown")) {
      this.render(leaf.view as MarkdownView);
    }
  }

  /** Remove every injected overlay, e.g. on unload or when the setting is off. */
  detachAll(): void {
    activeDocument
      .querySelectorAll(`.${HOST_CLS}`)
      .forEach((el) => el.removeClass(HOST_CLS));
    activeDocument.querySelectorAll(`.${NAV_CLS}`).forEach((el) => el.remove());
  }

  private render(view: MarkdownView): void {
    const content = view.containerEl.querySelector<HTMLElement>(
      ":scope > .view-content"
    );
    if (!content) return;
    content.querySelector(`:scope > .${NAV_CLS}`)?.remove();
    content.removeClass(HOST_CLS);

    const file = view.file;
    if (!this.plugin.settings.showDiaryNav || !file || !this.inDailyFolder(file))
      return;
    const { prev, next } = findNeighbors(this.diaries(), file);
    if (!prev && !next) return;

    const nav = createDiv({ cls: NAV_CLS });
    if (content.querySelector(READABLE_SELECTOR)) nav.addClass(READABLE_CLS);
    if (prev) this.button(nav, view, prev, "←", t("nav.prev"), "before");
    if (next) this.button(nav, view, next, "→", t("nav.next"), "after");
    content.addClass(HOST_CLS);
    content.appendChild(nav);
  }

  private button(
    nav: HTMLElement,
    view: MarkdownView,
    target: TFile,
    arrow: string,
    label: string,
    arrowPlacement: "before" | "after"
  ): void {
    const btn = nav.createEl("a", { cls: "de-nav-btn" });
    btn.setText(
      arrowPlacement === "before"
        ? `${arrow} ${target.basename}`
        : `${target.basename} ${arrow}`
    );
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
