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
import {
  BlockConfig,
  FieldValue,
  parseDates,
  parseFields,
  renderFingerprint,
} from "../core/interaction-days";
import type { FieldDef } from "../types";
import { t } from "../i18n";

/**
 * Which blocks currently have their inline settings row expanded, keyed by
 * `${sourcePath}:${startLine}`. Writing the block's config back re-renders it
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
  /** This block's currently-selected field values, keyed by field key. */
  values: Record<string, FieldValue>;
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
 *   2. the data: it watches the daily notes it shows, so a value added/cleared,
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
   * wouldn't change (unless `force`, used when the day set, field set, or
   * config shifts).
   */
  private repaint(force: boolean): void {
    const config = parseConfig(this.source);
    const tokens = parseDates(config.date);
    const fieldDefs = resolveFields(this.plugin, config.fields);
    const targets = tokens.map((token) => buildTarget(this.plugin, token, fieldDefs));
    const fp = renderFingerprint(targets);
    if (!force && fp === this.fingerprint) return;
    this.fingerprint = fp;
    paintBlock(this.plugin, this.containerEl, this.ctx, this, tokens, fieldDefs, targets);
  }
}

/** Resolve a block's `fields:` config into the actual `FieldDef`s it selects,
 * in settings order. */
function resolveFields(
  plugin: DayEchoPlugin,
  fieldsConfig: string | string[] | undefined
): FieldDef[] {
  const defined = plugin.settings.dataFields;
  const keys = parseFields(
    fieldsConfig,
    defined.map((f) => f.key)
  );
  const byKey = new Map(defined.map((f) => [f.key, f]));
  return keys
    .map((k) => byKey.get(k))
    .filter((f): f is FieldDef => f !== undefined);
}

function paintBlock(
  plugin: DayEchoPlugin,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext,
  block: InteractionBlock,
  tokens: string[],
  fieldDefs: FieldDef[],
  targets: DayTarget[]
): void {
  // Clear any prior render so a re-paint starts from a clean slate (and the
  // block correctly empties when nothing is left to rate).
  el.empty();
  el.removeClass("ei-block");

  // A day is hidden once every one of this block's selected fields is filled.
  // With zero fields selected, `values` is empty and no day is ever pending —
  // that's the intended way to turn a block's content off.
  const pending = targets.filter((d) => Object.values(d.values).some((v) => v === null));

  // Nothing left to rate — render nothing so the whole block disappears.
  if (pending.length === 0) return;

  el.addClass("ei-block");

  // Inline settings row (first child), shown/hidden by the gear button. Its open
  // state survives the re-render triggered by writing the config back.
  const key = sectionKey(ctx, el);
  const row = renderSettingsRow(plugin, ctx, el, tokens, fieldDefs);
  row.toggleClass("is-hidden", !(key !== null && openRows.has(key)));

  // Re-query the row at click time rather than capturing it: a reprocessed
  // block keeps its gear button (and this closure) while the row is rebuilt.
  injectSettingsButton(plugin, el, () => {
    const current = el.querySelector(":scope > .ei-settings-row");
    if (!current?.instanceOf(HTMLElement)) return;
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
      dismissBlock(el);
    }
  };

  for (const day of pending) {
    renderCard(plugin, el, day, fieldDefs, onCardComplete, block);
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
    if (!editBtn?.instanceOf(HTMLElement)) return false;
    // Don't double-inject if this element gets reprocessed.
    if (
      editBtn.previousElementSibling?.instanceOf(HTMLElement) &&
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
 * Render the inline settings row: a day-chip subrow (today/yesterday) and a
 * field-chip subrow (one chip per defined field). A day chip click flips its
 * state and writes the new day set back into the block's `date:` config; a
 * field chip click flips its membership in the block's `fields:` config.
 * Unlike the day chips, field chips have no "keep at least one on" rule —
 * deselecting every field is how a block's content is turned off.
 */
function renderSettingsRow(
  plugin: DayEchoPlugin,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  tokens: string[],
  fieldDefs: FieldDef[]
): HTMLElement {
  const row = el.createDiv({ cls: "ei-settings-row" });

  const daysSubrow = row.createDiv({ cls: "ei-settings-subrow" });
  daysSubrow.createSpan({ cls: "ei-settings-label", text: t("interaction.settingsLabel") });
  const dayChipsEl = daysSubrow.createDiv({ cls: "ei-chips" });

  const dayState: Record<"today" | "yesterday", boolean> = {
    today: tokens.includes("today"),
    yesterday: tokens.includes("yesterday"),
  };

  const commitDays = () => {
    const next: string[] = [];
    if (dayState.today) next.push("today");
    if (dayState.yesterday) next.push("yesterday");
    void writeBlockConfig(plugin, ctx, el, "date", next);
  };

  const buildDayChip = (
    token: "today" | "yesterday",
    labelKey: "interaction.today" | "interaction.yesterday"
  ) => {
    const chip = dayChipsEl.createEl("button", { cls: "ei-chip", text: t(labelKey) });
    chip.toggleClass("is-on", dayState[token]);
    chip.addEventListener("click", () => {
      const other = token === "today" ? "yesterday" : "today";
      // Block turning off the last active chip — the block would vanish.
      if (dayState[token] && !dayState[other]) {
        chip.addClass("is-shake");
        window.setTimeout(() => chip.removeClass("is-shake"), 400);
        return;
      }
      dayState[token] = !dayState[token];
      chip.toggleClass("is-on", dayState[token]);
      commitDays();
    });
  };

  buildDayChip("today", "interaction.today");
  buildDayChip("yesterday", "interaction.yesterday");

  const fieldsSubrow = row.createDiv({ cls: "ei-settings-subrow" });
  fieldsSubrow.createSpan({ cls: "ei-settings-label", text: t("interaction.fieldsLabel") });
  const fieldChipsEl = fieldsSubrow.createDiv({ cls: "ei-chips" });

  const allDefinedKeys = plugin.settings.dataFields.map((f) => f.key);
  const selectedKeys = new Set(fieldDefs.map((f) => f.key));

  for (const field of plugin.settings.dataFields) {
    const chip = fieldChipsEl.createEl("button", { cls: "ei-chip", text: field.label });
    chip.toggleClass("is-on", selectedKeys.has(field.key));
    chip.addEventListener("click", () => {
      if (selectedKeys.has(field.key)) selectedKeys.delete(field.key);
      else selectedKeys.add(field.key);
      chip.toggleClass("is-on", selectedKeys.has(field.key));
      const next = allDefinedKeys.filter((k) => selectedKeys.has(k));
      void writeBlockConfig(plugin, ctx, el, "fields", next);
    });
  }

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
 * Rewrite a single config line (`date:` or `fields:`) inside this block's
 * fences, leaving any other body lines untouched. No-ops if the section or
 * file can't be located.
 */
async function writeBlockConfig(
  plugin: DayEchoPlugin,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  key: "date" | "fields",
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
      const newBody = upsertConfigLine(body, key, value);
      lines.splice(bodyStart, info.lineEnd - bodyStart, ...newBody);
      return lines.join("\n");
    });
  } catch (err: unknown) {
    new Notice(t("interaction.saveFailed", { error: String(err) }));
  }
}

/** Replace the existing `key:` line in a block body, or append one. */
function upsertConfigLine(body: string[], key: string, value: string): string[] {
  const re = new RegExp(`^\\s*${key}\\s*:`);
  const idx = body.findIndex((line) => re.test(line));
  if (idx === -1) return [...body, `${key}: ${value}`];
  const next = [...body];
  next[idx] = `${key}: ${value}`;
  return next;
}

function renderCard(
  plugin: DayEchoPlugin,
  parent: HTMLElement,
  day: DayTarget,
  fieldDefs: FieldDef[],
  onComplete: () => void,
  block: InteractionBlock
): void {
  const card = parent.createDiv({ cls: "ei-card" });
  const header = card.createDiv({ cls: "ei-card-header" });
  header.createDiv({ cls: "ei-card-label", text: day.label });
  const status = header.createDiv({ cls: "ei-status" });

  const values = { ...day.values };

  const save = (key: string, value: number | boolean) => {
    values[key] = value;
    // Our own write fires metadataCache/vault events; ignore them for a moment
    // so the block doesn't repaint over the in-progress card or its dismissal.
    block.suppressRefresh(2000);
    void (async () => {
      try {
        await writeValues(plugin, day.filePath, { [key]: value });
        flashSaved(status);
        // Once every selected field is filled, play the "saved" flash, then
        // animate the card out before removing it from the layout.
        const allFilled = Object.values(values).every((v) => v !== null);
        if (allFilled) {
          window.setTimeout(() => dismissCard(card, onComplete), 900);
        }
      } catch (err: unknown) {
        const msg = t("interaction.saveFailed", { error: String(err) });
        status.setText(msg);
        status.removeClass("ei-status--ok");
        status.addClass("ei-status--warn");
        new Notice(msg);
      }
    })();
  };

  for (const field of fieldDefs) {
    const current = day.values[field.key];
    if (field.type === "number") {
      renderRatingField(
        card,
        field.label,
        typeof current === "number" ? current : null,
        field.min ?? 1,
        field.max ?? 5,
        (v) => save(field.key, v)
      );
    } else {
      renderBooleanField(
        card,
        field.label,
        typeof current === "boolean" ? current : null,
        (v) => save(field.key, v)
      );
    }
  }
}

/**
 * Fade + collapse the whole block out of view once every card is dismissed,
 * mirroring `dismissCard` so the container's own border/gear button doesn't
 * just vanish the instant the last card finishes its animation.
 */
function dismissBlock(el: HTMLElement): void {
  // Pin the current height so the collapse transition has something to animate.
  el.setCssStyles({ maxHeight: `${el.scrollHeight}px` });
  // Force a reflow so the starting max-height is committed before we shrink it.
  void el.offsetHeight;
  el.addClass("is-leaving");
  // Collapse via the same inline property we pinned above (rather than via a
  // CSS class rule) so there's no specificity fight to win with !important.
  el.setCssStyles({ maxHeight: "0" });

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    el.empty();
    el.removeClass("ei-block");
    el.removeClass("is-leaving");
    el.setCssStyles({ maxHeight: "" });
  };
  el.addEventListener("transitionend", finish, { once: true });
  window.setTimeout(finish, 500);
}

/** Fade + collapse the card out of view, then remove it and notify. */
function dismissCard(card: HTMLElement, onComplete: () => void): void {
  // Pin the current height so the collapse transition has something to animate.
  card.setCssStyles({ maxHeight: `${card.scrollHeight}px` });
  // Force a reflow so the starting max-height is committed before we shrink it.
  void card.offsetHeight;
  card.addClass("is-leaving");
  // Collapse via the same inline property we pinned above (rather than via a
  // CSS class rule) so there's no specificity fight to win with !important.
  card.setCssStyles({ maxHeight: "0" });

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
  min: number,
  max: number,
  onChange: (v: number) => void
): void {
  const field = parent.createDiv({ cls: "ei-field" });
  field.createDiv({ cls: "ei-label", text: label });
  const dots = field.createDiv({ cls: "ei-dots" });

  const values: number[] = [];
  for (let v = min; v <= max; v++) values.push(v);

  const btns: HTMLElement[] = [];
  for (const v of values) {
    const btn = dots.createEl("button", { cls: "ei-dot", text: String(v) });
    if (initial !== null && v < initial) btn.addClass("is-filled");
    if (initial === v) btn.addClass("is-selected");
    btns.push(btn);
  }

  btns.forEach((btn, idx) => {
    btn.addEventListener("click", () => {
      const val = values[idx];
      btns.forEach((b, i) => {
        b.toggleClass("is-filled", i < idx);
        b.toggleClass("is-selected", i === idx);
      });
      onChange(val);
    });
  });
}

/** Two-button "是/否" field for a boolean value. Neither button is
 * highlighted while `initial` is `null` (unanswered) — there's no forced
 * choice, unlike the day chips. */
function renderBooleanField(
  parent: HTMLElement,
  label: string,
  initial: boolean | null,
  onChange: (v: boolean) => void
): void {
  const field = parent.createDiv({ cls: "ei-field" });
  field.createDiv({ cls: "ei-label", text: label });
  const chips = field.createDiv({ cls: "ei-chips" });

  const options: { value: boolean; text: string }[] = [
    { value: true, text: t("interaction.yes") },
    { value: false, text: t("interaction.no") },
  ];

  const btns = options.map((opt) => {
    const chip = chips.createEl("button", { cls: "ei-chip", text: opt.text });
    chip.toggleClass("is-on", initial === opt.value);
    return chip;
  });

  btns.forEach((chip, idx) => {
    chip.addEventListener("click", () => {
      btns.forEach((b, i) => b.toggleClass("is-on", i === idx));
      onChange(options[idx].value);
    });
  });
}

async function writeValues(
  plugin: DayEchoPlugin,
  filePath: string,
  values: Record<string, number | boolean>
): Promise<void> {
  const app = plugin.app;
  const existing = app.vault.getAbstractFileByPath(filePath);

  if (!(existing instanceof TFile)) {
    const folder =
      filePath.lastIndexOf("/") > 0 ? filePath.substring(0, filePath.lastIndexOf("/")) : "";
    if (folder && !app.vault.getAbstractFileByPath(folder)) {
      await app.vault.createFolder(folder);
    }
    const fm = Object.entries(values)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
    const file = await app.vault.create(filePath, `---\n${fm}\n---\n`);
    // Fire-and-forget so the IP / weather lookups never delay the interaction save.
    void plugin.recordContext(file);
    return;
  }

  await app.vault.process(existing, (content) => patchFrontmatter(content, values));
}

function patchFrontmatter(
  content: string,
  values: Record<string, number | boolean>
): string {
  const fmLine = (entries: Record<string, number | boolean>) =>
    Object.entries(entries)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");

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
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    // ignore, use defaults
  }
  return {};
}

function buildTarget(
  plugin: DayEchoPlugin,
  token: string,
  fieldDefs: FieldDef[]
): DayTarget {
  const dateStr = resolveDate(token);
  const filePath = buildFilePath(plugin, dateStr);
  const values = readValues(plugin, filePath, fieldDefs);
  return { token, dateStr, label: labelFor(token, dateStr), filePath, values };
}

function readValues(
  plugin: DayEchoPlugin,
  filePath: string,
  fieldDefs: FieldDef[]
): Record<string, FieldValue> {
  const file = plugin.app.vault.getAbstractFileByPath(filePath);
  const fm =
    file instanceof TFile
      ? plugin.app.metadataCache.getFileCache(file)?.frontmatter
      : undefined;

  const values: Record<string, FieldValue> = {};
  for (const field of fieldDefs) {
    const raw: unknown = fm?.[field.key];
    if (field.type === "number") {
      values[field.key] = typeof raw === "number" ? raw : null;
    } else {
      values[field.key] = typeof raw === "boolean" ? raw : null;
    }
  }
  return values;
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
