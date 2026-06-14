import { Notice, TFile, normalizePath, parseYaml, setIcon } from "obsidian";
import type DayEchoPlugin from "../main";
import { BlockConfig, resolveTokens } from "../core/interaction-days";
import { t } from "../i18n";

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
    async (source, el) => {
      await renderBlock(plugin, source, el);
    }
  );
}

async function renderBlock(
  plugin: DayEchoPlugin,
  source: string,
  el: HTMLElement
): Promise<void> {
  const config = parseConfig(source);
  const tokens = resolveTokens(config, {
    today: plugin.settings.interactionToday,
    yesterday: plugin.settings.interactionYesterday,
  });
  const targets = tokens.map((token) => buildTarget(plugin, token));

  // A day is hidden once it's fully rated (both energy and mood present).
  const pending = targets.filter((d) => d.energy === null || d.mood === null);

  // Nothing left to rate — render nothing so the whole block disappears.
  if (pending.length === 0) return;

  el.addClass("ei-block");

  let remaining = pending.length;
  const onCardComplete = () => {
    remaining--;
    if (remaining === 0) {
      el.empty();
      el.removeClass("ei-block");
    }
  };

  for (const day of pending) {
    renderCard(plugin, el, day, onCardComplete);
  }
}

function renderCard(
  plugin: DayEchoPlugin,
  parent: HTMLElement,
  day: DayTarget,
  onComplete: () => void
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
    await app.vault.create(filePath, `---\n${fm}\n---\n`);
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

function formatDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
