import { App, Component, setIcon } from "obsidian";
import type { DiaryEntry, PreviewBlock } from "../types";
import { PREVIEW_THUMBS } from "./view-constants";
import { openDiaryModal } from "./diary-modal";
import { t } from "../i18n";

/**
 * Dependencies injected by DayEchoView when building cards, so card-builder
 * does not import the view class (which would create a circular dependency).
 */
export interface CardContext {
  app: App;
  /** The Obsidian Component used as owner for MarkdownRenderer.render. */
  component: Component;
  imgObserver: IntersectionObserver | null;
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
  label.setAttr("title", t("card.openNote"));
  label.addEventListener("click", (ev) => {
    ev.stopPropagation();
    void ctx.app.workspace.getLeaf(false).openFile(entry.file);
  });

  const preview = card.createDiv({ cls: "de-preview" });

  if (entry.previewBlocks.length) {
    // The `markdown-rendered` class picks up the theme's own list/task-list
    // CSS, so bullets, numbering, and checkboxes match the note's reading view.
    const text = preview.createDiv({ cls: "de-text markdown-rendered" });
    renderPreviewBlocks(text, entry.previewBlocks);
  }
  if (entry.images.length) {
    const thumbs = preview.createDiv({ cls: "de-thumbs" });
    const previewImages = entry.images.slice(0, PREVIEW_THUMBS);
    for (const [idx, src] of previewImages.entries()) {
      const frame = thumbs.createDiv({ cls: "de-polaroid" });
      frame.setCssProps({ "--de-thumb-index": String(idx) });
      const img = frame.createEl("img", { cls: "de-thumb" });
      // Thumbs show full-size vault images; decode them off the critical
      // path so a large photo cannot stall scrolling when it loads.
      img.decoding = "async";
      img.dataset.src = src;
      ctx.imgObserver?.observe(img);
    }
  }
  if (entry.tags.length) {
    const tagWrap = preview.createDiv({ cls: "de-tags" });
    for (const tag of entry.tags) {
      tagWrap.createSpan({ cls: "de-tag", text: tag });
    }
  }

  card.addEventListener("click", (ev) => {
    if ((ev.target as HTMLElement).closest("a")) return;
    openDiaryModal(entry, ctx.app, ctx.component);
  });

  return card;
}

/**
 * The "show more" placeholder: a real preview card of the first hidden entry,
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
  const action = mask.createDiv({ cls: "de-fold-action" });
  const icon = action.createDiv({ cls: "de-fold-icon" });
  setIcon(icon, "chevrons-down");
  const copy = action.createDiv({ cls: "de-fold-copy" });
  copy.createDiv({ cls: "de-fold-title", text: t("card.showMore") });
  copy.createDiv({
    cls: "de-fold-count",
    text: t("card.diaryCount", { count: hidden.length }),
  });

  mask.addEventListener("click", (ev) => {
    ev.stopPropagation();
    ctx.unfolded.add(key);
    ctx.onUnfold();
  });
  return card;
}

/**
 * Estimate a collapsed card's rendered height in px, for column balancing.
 * Collapsed cards are predictable: one overlapped thumbnail row, text clamped
 * to four lines, one tag row. Estimates only steer placement and
 * content-visibility placeholders, so being a few pixels off merely leaves the
 * two column bottoms slightly uneven.
 */
export function estimateHeight(entry: DiaryEntry): number {
  let h = 26 + 26 + 16; // padding+border, date line, run gap
  if (entry.previewText) {
    // ~50 chars per rendered line, clamped to 4 lines of ~26px each.
    h += Math.min(4, Math.ceil(entry.previewText.length / 50)) * 26;
  }
  if (entry.images.length) {
    h += 112; // one horizontal overlapped row of polaroids
  }
  if (entry.tags.length) h += 34;
  return Math.max(h, 140);
}

/** Render parsed preview blocks as real paragraph/list markup, matching the
 * DOM shape Obsidian's own reading view produces for lists and task lists. */
function renderPreviewBlocks(container: HTMLElement, blocks: PreviewBlock[]): void {
  for (const block of blocks) {
    switch (block.type) {
      case "p":
        container.createEl("p", { text: block.text });
        break;
      case "ul": {
        const ul = container.createEl("ul");
        for (const item of block.items) ul.createEl("li", { text: item });
        break;
      }
      case "ol": {
        const ol = container.createEl("ol");
        for (const item of block.items) ol.createEl("li", { text: item });
        break;
      }
      case "task": {
        const ul = container.createEl("ul", { cls: "contains-task-list" });
        for (const item of block.items) {
          const li = ul.createEl("li", {
            cls: item.checked ? "task-list-item is-checked" : "task-list-item",
          });
          li.setAttr("data-task", item.checked ? "x" : " ");
          const checkbox = li.createEl("input", {
            cls: "task-list-item-checkbox",
            type: "checkbox",
          });
          checkbox.disabled = true;
          checkbox.checked = item.checked;
          li.createSpan({ text: item.text });
        }
        break;
      }
    }
  }
}

function fullDate(d: Date): string {
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
