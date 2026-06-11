import type { MarkdownView, TFile } from "obsidian";
import type DayEchoPlugin from "../main";
import { t } from "../i18n";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const NAV_CLS = "de-nav";
/** Marker on `.view-content` switching it to flex column while a nav bar is present. */
const HOST_CLS = "de-has-nav";

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

/** Injects a prev/next bar below the content of every Markdown view showing a daily note. */
export class DiaryNav {
  constructor(private plugin: DayEchoPlugin) {}

  /** Re-render the nav bar on all open Markdown leaves; idempotent. */
  refresh(): void {
    for (const leaf of this.plugin.app.workspace.getLeavesOfType("markdown")) {
      this.render(leaf.view as MarkdownView);
    }
  }

  /** Remove every injected bar, e.g. on unload or when the setting is off. */
  detachAll(): void {
    activeDocument.querySelectorAll(`.${NAV_CLS}`).forEach((el) => el.remove());
    activeDocument
      .querySelectorAll(`.${HOST_CLS}`)
      .forEach((el) => el.removeClass(HOST_CLS));
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
    if (prev) this.button(nav, view, prev, `← ${prev.basename}`, t("nav.prev"));
    else nav.createSpan();
    if (next) this.button(nav, view, next, `${next.basename} →`, t("nav.next"));
    else nav.createSpan();
    content.addClass(HOST_CLS);
    content.appendChild(nav);
  }

  private button(
    nav: HTMLElement,
    view: MarkdownView,
    target: TFile,
    text: string,
    label: string
  ): void {
    const btn = nav.createEl("a", { cls: "de-nav-btn", text });
    btn.setAttribute("aria-label", label);
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
    return this.plugin.app.vault
      .getMarkdownFiles()
      .filter((f) => this.inDailyFolder(f) && DATE_RE.test(f.basename));
  }
}
