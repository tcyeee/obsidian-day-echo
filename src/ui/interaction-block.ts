import { Notice, TFile, normalizePath, parseYaml } from "obsidian";
import type DayEchoPlugin from "../main";
import { t } from "../i18n";

interface BlockConfig {
  date?: string;
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
  const dateStr = resolveDate(config.date ?? "yesterday");
  const filePath = buildFilePath(plugin, dateStr);
  const app = plugin.app;

  // Read existing scores
  const file = app.vault.getAbstractFileByPath(filePath);
  let initEnergy: number | null = null;
  let initMood: number | null = null;
  if (file instanceof TFile) {
    const fm = app.metadataCache.getFileCache(file)?.frontmatter;
    const energy = fm?.["energy"] as number | undefined;
    const mood = fm?.["mood"] as number | undefined;
    if (typeof energy === "number") initEnergy = energy;
    if (typeof mood === "number") initMood = mood;
  }

  el.addClass("ei-block");
  el.createDiv({ cls: "ei-date", text: `${dateStr}` });

  let energy = initEnergy;
  let mood = initMood;

  renderRatingField(el, t("interaction.energy"), initEnergy, (v) => { energy = v; });
  renderRatingField(el, t("interaction.mood"), initMood, (v) => { mood = v; });

  const footer = el.createDiv({ cls: "ei-footer" });
  const saveBtn = footer.createEl("button", {
    cls: "ei-save mod-cta",
    text: t("interaction.save"),
  });
  const status = footer.createDiv({ cls: "ei-status" });

  saveBtn.addEventListener("click", () => {
    if (energy === null || mood === null) {
      setStatus(status, t("interaction.rateFirst"), false);
      return;
    }
    const scores = { energy, mood };
    void (async () => {
      try {
        await writeScores(plugin, filePath, scores);
        setStatus(status, t("interaction.saved"), true);
      } catch (err) {
        const msg = t("interaction.saveFailed", { error: String(err) });
        setStatus(status, msg, false);
        new Notice(msg);
      }
    })();
  });
}

function setStatus(el: HTMLElement, text: string, ok: boolean): void {
  el.setText(text);
  el.toggleClass("ei-status--ok", ok);
  el.toggleClass("ei-status--warn", !ok);
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
    if (initial !== null && i <= initial) btn.addClass("is-filled");
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
