import { App, Component, MarkdownRenderer, setIcon } from "obsidian";
import type { DiaryEntry } from "../types";
import { stripFrontmatter } from "../core/scanner";
import { PREVIEW_THUMBS } from "./view-constants";

/**
 * Dependencies injected by DayEchoView when building cards, so card-builder
 * does not import the view class (which would create a circular dependency).
 */
export interface CardContext {
  app: App;
  /** The Obsidian Component used as owner for MarkdownRenderer.render. */
  component: Component;
  imgObserver: IntersectionObserver | null;
  expanded: Set<string>;
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
    for (const src of entry.images.slice(0, PREVIEW_THUMBS)) {
      const img = thumbs.createEl("img", { cls: "de-thumb" });
      img.decoding = "async";
      img.dataset.src = src;
      ctx.imgObserver?.observe(img);
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
        const content = await ctx.app.vault.cachedRead(entry.file);
        await MarkdownRenderer.render(
          ctx.app,
          stripFrontmatter(content),
          fullEl,
          path,
          ctx.component
        );
      }
      card.addClass("is-expanded");
      ctx.expanded.add(path);
    } else {
      card.removeClass("is-expanded");
      ctx.expanded.delete(path);
    }
  };
  card.addEventListener("click", (ev) => {
    if ((ev.target as HTMLElement).closest("a")) return;
    void setExpanded(!card.hasClass("is-expanded"));
  });

  if (ctx.expanded.has(path)) void setExpanded(true);

  return card;
}

/**
 * The "+N more" placeholder: a real preview card of the first hidden entry,
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
  const icon = mask.createDiv({ cls: "de-fold-icon" });
  setIcon(icon, "chevrons-down");
  mask.createDiv({ cls: "de-fold-count", text: `+${hidden.length}` });

  mask.addEventListener("click", (ev) => {
    ev.stopPropagation();
    ctx.unfolded.add(key);
    ctx.onUnfold();
  });
  return card;
}

/**
 * Estimate a collapsed card's rendered height in px, for column balancing.
 * Collapsed cards are predictable: fixed 96x72 thumbs, text clamped to four
 * lines, one tag row. Estimates only steer placement, so being a few pixels
 * off merely leaves the two column bottoms slightly uneven.
 */
export function estimateHeight(entry: DiaryEntry): number {
  let h = 26 + 26 + 16; // padding+border, date line, run gap
  if (entry.previewText) {
    h += Math.min(4, Math.ceil(entry.previewText.length / 50)) * 26;
  }
  if (entry.images.length) {
    const cells =
      Math.min(entry.images.length, PREVIEW_THUMBS) +
      (entry.images.length > PREVIEW_THUMBS ? 1 : 0);
    h += Math.ceil(cells / 3) * 80 + 10;
  }
  if (entry.tags.length) h += 34;
  return Math.max(h, 140);
}

function fullDate(d: Date): string {
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

export function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
