import {
  MarkdownPostProcessorContext,
  MarkdownRenderChild,
  Notice,
  TAbstractFile,
  TFile,
  normalizePath,
  parseYaml,
  setIcon,
} from "obsidian";
import type DayEchoPlugin from "../main";
import { formatDate } from "../core/daily-note";
import { BlockConfig, parseDates, renderFingerprint } from "../core/interaction-days";
import { t } from "../i18n";

/**
 * Which blocks currently have their inline settings row expanded, keyed by
 * `${sourcePath}:${startLine}`. Writing the `date:` config re-renders the block
 * from scratch; this lets the row reopen in the same state after that re-render.
 */
const openRows = new Set<string>();

interface DayTarget {
  /** Original token from config, e.g. "today" / "yesterday" / a raw date. */
  token: string;
  /** Resolved YYYY-MM-DD string. */
  dateStr: string;
  /** Friendly label shown at the top of the card. */
  label: string;
  /** Absolute vault path of the daily note. */
  filePath: string;
  /** Existing scores read from frontmatter (null when absent). */
  energy: number | null;
  mood: number | null;
}

export function registerInteractionBlock(plugin: DayEchoPlugin): void {
  plugin.registerMarkdownCodeBlockProcessor(
    "echo-interaction",
    (source, el, ctx) => {
      ctx.addChild(new InteractionBlock(plugin, source, el, ctx));
    }
  );
}

/** How often the block re-checks whether the calendar day has rolled over. */
const DAY_CHECK_MS = 60_000;

/**
 * Owns one rendered `echo-interaction` block. A code-block processor runs only
 * once, so without help the card is a frozen snapshot of whatever was true when
 * it first rendered: it wouldn't follow the calendar day forward, and it
 * wouldn't notice the daily note behind it being edited. This keeps it live on
 * two signals —
 *   1. the clock: a once-a-minute check re-paints when the calendar day rolls
 *      over, so "today"/"yesterday" move forward on a note left open past
 *      midnight;
 *   2. the data: it watches the daily notes it shows, so a score added/cleared,
 *      the note deleted, or the new day's note appearing re-derives the card.
 * A render fingerprint skips no-op repaints; a short suppression window keeps
 * the block's own saves from cutting their save→dismiss animation short.
 * `registerInterval`/`registerEvent` are cleaned up when the block unmounts.
 */
class InteractionBlock extends MarkdownRenderChild {
  private day = formatDate(new Date());
  private fingerprint: string | null = null;
  /** Ignore self-induced data-change events until this timestamp (ms epoch). */
  private suppressUntil = 0;

  constructor(
    private plugin: DayEchoPlugin,
    private source: string,
    containerEl: HTMLElement,
    private ctx: MarkdownPostProcessorContext
  ) {
    super(containerEl);
  }

  onload(): void {
    this.repaint(true);

    this.registerInterval(
      window.setInterval(() => {
        const today = formatDate(new Date());
        if (today === this.day) return;
        this.day = today;
        this.repaint(true);
      }, DAY_CHECK_MS)
    );

    // React to the daily notes themselves changing. metadataCache "changed"
    // covers frontmatter being edited or cleared; the vault events cover the
    // note being created (rating a day with no note yet, or the new day's note
    // appearing), deleted, or renamed.
    const onFileChange = (file: TAbstractFile) => {
      if (Date.now() < this.suppressUntil) return;
      if (!this.watchedPaths().has(file.path)) return;
      this.repaint(false);
    };
    this.registerEvent(this.plugin.app.metadataCache.on("changed", onFileChange));
    this.registerEvent(this.plugin.app.vault.on("create", onFileChange));
    this.registerEvent(this.plugin.app.vault.on("delete", onFileChange));
    this.registerEvent(this.plugin.app.vault.on("rename", onFileChange));
  }

  /** Hold off self-triggered repaints for `ms` so an animation can finish. */
  suppressRefresh(ms: number): void {
    this.suppressUntil = Math.max(this.suppressUntil, Date.now() + ms);
  }

  /** Vault paths of the daily notes this block currently shows. */
  private watchedPaths(): Set<string> {
    const tokens = parseDates(parseConfig(this.source).date);
    return new Set(tokens.map((tk) => buildFilePath(this.plugin, resolveDate(tk))));
  }

  /**
   * Re-derive state and repaint, skipping the repaint when the rendered result
   * wouldn't change (unless `force`, used when the day set or config shifts).
   */
  private repaint(force: boolean): void {
    const tokens = parseDates(parseConfig(this.source).date);
    const targets = tokens.map((token) => buildTarget(this.plugin, token));
    const fp = renderFingerprint(targets);
    if (!force && fp === this.fingerprint) return;
    this.fingerprint = fp;
    paintBlock(this.plugin, this.containerEl, this.ctx, this, tokens, targets);
  }
}

function paintBlock(
  plugin: DayEchoPlugin,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext,
  block: InteractionBlock,
  tokens: string[],
  targets: DayTarget[]
): void {
  // Clear any prior render so a re-paint starts from a clean slate (and the
  // block correctly empties when nothing is left to rate).
  el.empty();
  el.removeClass("ei-block");

  // A day is hidden once it's fully rated (both energy and mood present).
  const pending = targets.filter((d) => d.energy === null || d.mood === null);

  // Nothing left to rate — render nothing so the whole block disappears.
  if (pending.length === 0) return;

  el.addClass("ei-block");

  // Inline settings row (first child), shown/hidden by the gear button. Its open
  // state survives the re-render triggered by writing the `date:` config back.
  const key = sectionKey(ctx, el);
  const row = renderSettingsRow(plugin, ctx, el, tokens);
  row.toggleClass("is-hidden", !(key !== null && openRows.has(key)));

  // Re-query the row at click time rather than capturing it: a reprocessed
  // block keeps its gear button (and this closure) while the row is rebuilt.
  injectSettingsButton(plugin, el, () => {
    const current = el.querySelector(":scope > .ei-settings-row");
    if (!(current instanceof HTMLElement)) return;
    const opening = current.hasClass("is-hidden");
    current.toggleClass("is-hidden", !opening);
    const k = sectionKey(ctx, el);
    if (k === null) return;
    if (opening) openRows.add(k);
    else openRows.delete(k);
  });

  let remaining = pending.length;
  const onCardComplete = () => {
    remaining--;
    if (remaining === 0) {
      el.empty();
      el.removeClass("ei-block");
    }
  };

  for (const day of pending) {
    renderCard(plugin, el, day, onCardComplete, block);
  }
}

/**
 * Add a gear button immediately to the left of Obsidian's native
 * "Edit this block" button. That button is appended asynchronously as a
 * sibling of our rendered element, so we look for it now and, failing that,
 * watch the parent until it appears. No-ops gracefully if it never does.
 * Clicking it runs `onToggle` to show/hide the inline settings row.
 */
function injectSettingsButton(
  plugin: DayEchoPlugin,
  el: HTMLElement,
  onToggle: () => void
): void {
  const tryInject = (): boolean => {
    const parent = el.parentElement;
    const editBtn =
      parent?.querySelector(":scope > .edit-block-button") ??
      el.querySelector(":scope > .edit-block-button");
    if (!(editBtn instanceof HTMLElement)) return false;
    // Don't double-inject if this element gets reprocessed.
    if (
      editBtn.previousElementSibling instanceof HTMLElement &&
      editBtn.previousElementSibling.hasClass("ei-settings-btn")
    ) {
      return true;
    }
    const btn = createEl("button", { cls: "ei-settings-btn clickable-icon" });
    setIcon(btn, "settings");
    btn.setAttribute("aria-label", t("interaction.toggleSettings"));
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onToggle();
    });
    editBtn.parentElement?.insertBefore(btn, editBtn);
    return true;
  };

  if (tryInject()) return;

  const parent = el.parentElement;
  if (!parent) return;
  const observer = new MutationObserver(() => {
    if (tryInject()) observer.disconnect();
  });
  observer.observe(parent, { childList: true });
  // Safety valve: stop watching after a few seconds.
  window.setTimeout(() => observer.disconnect(), 5000);
}

/**
 * Render the inline day-picker row: a label plus today / yesterday chips. A chip
 * click flips its state and writes the new day set back into the block's `date:`
 * config. At least one chip must stay on, so deselecting the last one is blocked.
 */
function renderSettingsRow(
  plugin: DayEchoPlugin,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  tokens: string[]
): HTMLElement {
  const row = el.createDiv({ cls: "ei-settings-row" });
  row.createSpan({ cls: "ei-settings-label", text: t("interaction.settingsLabel") });
  const chipsEl = row.createDiv({ cls: "ei-day-chips" });

  const state: Record<"today" | "yesterday", boolean> = {
    today: tokens.includes("today"),
    yesterday: tokens.includes("yesterday"),
  };

  const commit = () => {
    const next: string[] = [];
    if (state.today) next.push("today");
    if (state.yesterday) next.push("yesterday");
    void writeBlockDate(plugin, ctx, el, next);
  };

  const build = (
    token: "today" | "yesterday",
    labelKey: "interaction.today" | "interaction.yesterday"
  ) => {
    const chip = chipsEl.createEl("button", {
      cls: "ei-day-chip",
      text: t(labelKey),
    });
    chip.toggleClass("is-on", state[token]);
    chip.addEventListener("click", () => {
      const other = token === "today" ? "yesterday" : "today";
      // Block turning off the last active chip — the block would vanish.
      if (state[token] && !state[other]) {
        chip.addClass("is-shake");
        window.setTimeout(() => chip.removeClass("is-shake"), 400);
        return;
      }
      state[token] = !state[token];
      chip.toggleClass("is-on", state[token]);
      commit();
    });
  };

  build("today", "interaction.today");
  build("yesterday", "interaction.yesterday");

  return row;
}

/** Stable key for an open settings row: file path + the block's start line. */
function sectionKey(
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement
): string | null {
  const info = ctx.getSectionInfo(el);
  if (!info) return null;
  return `${ctx.sourcePath}:${info.lineStart}`;
}

/**
 * Rewrite the `date:` line inside this block's fences to reflect `tokens`,
 * leaving any other body lines untouched. No-ops if the section or file can't
 * be located.
 */
async function writeBlockDate(
  plugin: DayEchoPlugin,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  tokens: string[]
): Promise<void> {
  const info = ctx.getSectionInfo(el);
  if (!info) return;
  const file = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
  if (!(file instanceof TFile)) return;

  const value = tokens.length === 1 ? tokens[0] : `[${tokens.join(", ")}]`;

  try {
    await plugin.app.vault.process(file, (content) => {
      const lines = content.split("\n");
      // Body sits between the opening (lineStart) and closing (lineEnd) fences.
      const bodyStart = info.lineStart + 1;
      const body = lines.slice(bodyStart, info.lineEnd);
      const newBody = upsertDateLine(body, value);
      lines.splice(bodyStart, info.lineEnd - bodyStart, ...newBody);
      return lines.join("\n");
    });
  } catch (err) {
    new Notice(t("interaction.saveFailed", { error: String(err) }));
  }
}

/** Replace the existing `date:` line in a block body, or append one. */
function upsertDateLine(body: string[], value: string): string[] {
  const dateRe = /^\s*date\s*:/;
  const idx = body.findIndex((line) => dateRe.test(line));
  if (idx === -1) return [...body, `date: ${value}`];
  const next = [...body];
  next[idx] = `date: ${value}`;
  return next;
}

function renderCard(
  plugin: DayEchoPlugin,
  parent: HTMLElement,
  day: DayTarget,
  onComplete: () => void,
  block: InteractionBlock
): void {
  const card = parent.createDiv({ cls: "ei-card" });
  const header = card.createDiv({ cls: "ei-card-header" });
  header.createDiv({ cls: "ei-card-label", text: day.label });
  const status = header.createDiv({ cls: "ei-status" });

  let energy = day.energy;
  let mood = day.mood;

  const save = (key: "energy" | "mood", value: number) => {
    if (key === "energy") energy = value;
    else mood = value;
    // Our own write fires metadataCache/vault events; ignore them for a moment
    // so the block doesn't repaint over the in-progress card or its dismissal.
    block.suppressRefresh(2000);
    void (async () => {
      try {
        await writeScores(plugin, day.filePath, { [key]: value });
        flashSaved(status);
        // Once both scores are in, play the "saved" flash, then animate the
        // card out before removing it from the layout.
        if (energy !== null && mood !== null) {
          window.setTimeout(() => dismissCard(card, onComplete), 900);
        }
      } catch (err) {
        const msg = t("interaction.saveFailed", { error: String(err) });
        status.setText(msg);
        status.removeClass("ei-status--ok");
        status.addClass("ei-status--warn");
        new Notice(msg);
      }
    })();
  };

  renderRatingField(card, t("interaction.energy"), day.energy, (v) =>
    save("energy", v)
  );
  renderRatingField(card, t("interaction.mood"), day.mood, (v) =>
    save("mood", v)
  );
}

/** Fade + collapse the card out of view, then remove it and notify. */
function dismissCard(card: HTMLElement, onComplete: () => void): void {
  // Pin the current height so the collapse transition has something to animate.
  card.style.maxHeight = `${card.scrollHeight}px`;
  // Force a reflow so the starting max-height is committed before we shrink it.
  void card.offsetHeight;
  card.addClass("is-leaving");

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    card.remove();
    onComplete();
  };
  card.addEventListener("transitionend", finish, { once: true });
  // Fallback in case transitionend never fires (e.g. reduced-motion).
  window.setTimeout(finish, 500);
}

/** Briefly show a "saved ✓" confirmation, then fade it out. */
function flashSaved(el: HTMLElement): void {
  el.setText(t("interaction.saved"));
  el.removeClass("ei-status--warn");
  el.addClass("ei-status--ok");
  el.addClass("is-visible");
  window.setTimeout(() => el.removeClass("is-visible"), 1500);
}

function renderRatingField(
  parent: HTMLElement,
  label: string,
  initial: number | null,
  onChange: (v: number) => void
): void {
  const field = parent.createDiv({ cls: "ei-field" });
  field.createDiv({ cls: "ei-label", text: label });
  const dots = field.createDiv({ cls: "ei-dots" });

  const btns: HTMLElement[] = [];
  for (let i = 1; i <= 5; i++) {
    const btn = dots.createEl("button", { cls: "ei-dot", text: String(i) });
    if (initial !== null && i < initial) btn.addClass("is-filled");
    if (initial === i) btn.addClass("is-selected");
    btns.push(btn);
  }

  btns.forEach((btn, idx) => {
    btn.addEventListener("click", () => {
      const val = idx + 1;
      btns.forEach((b, i) => {
        b.toggleClass("is-filled", i < idx);
        b.toggleClass("is-selected", i === idx);
      });
      onChange(val);
    });
  });
}

async function writeScores(
  plugin: DayEchoPlugin,
  filePath: string,
  scores: Record<string, number>
): Promise<void> {
  const app = plugin.app;
  const existing = app.vault.getAbstractFileByPath(filePath);

  if (!(existing instanceof TFile)) {
    const folder = filePath.lastIndexOf("/") > 0
      ? filePath.substring(0, filePath.lastIndexOf("/"))
      : "";
    if (folder && !app.vault.getAbstractFileByPath(folder)) {
      await app.vault.createFolder(folder);
    }
    const fm = Object.entries(scores).map(([k, v]) => `${k}: ${v}`).join("\n");
    const file = await app.vault.create(filePath, `---\n${fm}\n---\n`);
    // Fire-and-forget so the IP / weather lookups never delay the interaction save.
    void plugin.recordContext(file);
    return;
  }

  await app.vault.process(existing, (content) => patchFrontmatter(content, scores));
}

function patchFrontmatter(content: string, values: Record<string, number>): string {
  const fmLine = (entries: Record<string, number>) =>
    Object.entries(entries).map(([k, v]) => `${k}: ${v}`).join("\n");

  if (!content.startsWith("---")) {
    return `---\n${fmLine(values)}\n---\n${content}`;
  }
  const closeIdx = content.indexOf("\n---", 3);
  if (closeIdx === -1) {
    return `---\n${fmLine(values)}\n---\n${content}`;
  }

  let fmBody = content.slice(4, closeIdx);
  const tail = content.slice(closeIdx);

  for (const [key, val] of Object.entries(values)) {
    const re = new RegExp(`^(${key}):.*$`, "m");
    if (re.test(fmBody)) {
      fmBody = fmBody.replace(re, `${key}: ${val}`);
    } else {
      fmBody = fmBody ? `${fmBody}\n${key}: ${val}` : `${key}: ${val}`;
    }
  }

  return `---\n${fmBody}${tail}`;
}

function parseConfig(source: string): BlockConfig {
  const trimmed = source.trim();
  if (!trimmed) return {};
  try {
    const parsed: unknown = parseYaml(trimmed);
    if (parsed && typeof parsed === "object") return parsed as BlockConfig;
  } catch {
    // ignore, use defaults
  }
  return {};
}

function buildTarget(plugin: DayEchoPlugin, token: string): DayTarget {
  const dateStr = resolveDate(token);
  const filePath = buildFilePath(plugin, dateStr);
  const { energy, mood } = readScores(plugin, filePath);
  return { token, dateStr, label: labelFor(token, dateStr), filePath, energy, mood };
}

function readScores(
  plugin: DayEchoPlugin,
  filePath: string
): { energy: number | null; mood: number | null } {
  const file = plugin.app.vault.getAbstractFileByPath(filePath);
  if (!(file instanceof TFile)) return { energy: null, mood: null };
  const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
  const energy = fm?.["energy"];
  const mood = fm?.["mood"];
  return {
    energy: typeof energy === "number" ? energy : null,
    mood: typeof mood === "number" ? mood : null,
  };
}

function labelFor(token: string, dateStr: string): string {
  if (token === "today") return t("interaction.today");
  if (token === "yesterday") return t("interaction.yesterday");
  return dateStr;
}

function resolveDate(dateStr: string): string {
  if (dateStr === "yesterday") {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return formatDate(d);
  }
  if (dateStr === "today") return formatDate(new Date());
  return dateStr;
}

function buildFilePath(plugin: DayEchoPlugin, dateStr: string): string {
  const folder = plugin.settings.dailyFolder.replace(/\/+$/, "");
  return normalizePath(folder ? `${folder}/${dateStr}.md` : `${dateStr}.md`);
}
