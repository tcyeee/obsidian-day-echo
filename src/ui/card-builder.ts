import { App, Component, setIcon } from "obsidian";
import type { DiaryEntry } from "../types";
import { PREVIEW_THUMBS } from "./view-constants";
import { openDiaryModal } from "./diary-modal";

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
    const previewImages = entry.images.slice(0, PREVIEW_THUMBS);
    for (const [idx, src] of previewImages.entries()) {
      const frame = thumbs.createDiv({ cls: "de-polaroid" });
      frame.style.setProperty("--de-thumb-index", String(idx));
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
  copy.createDiv({ cls: "de-fold-title", text: "显示更多" });
  copy.createDiv({ cls: "de-fold-count", text: `${hidden.length} 篇日记` });

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

function fullDate(d: Date): string {
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
