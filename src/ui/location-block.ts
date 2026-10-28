import {
  MarkdownPostProcessorContext,
  MarkdownRenderChild,
  Notice,
  TAbstractFile,
  TFile,
  setIcon,
} from "obsidian";
import type DayEchoPlugin from "../main";
import { t } from "../i18n";

/**
 * `echo-location` code block: an in-note card showing the city/weather that
 * `recordContext` captured, with a button to re-run detection (useful after
 * turning a VPN off, or granting the location permission that was denied at
 * creation time) and a pencil to type the city in by hand for a one-off fix.
 * Auto-inserted into a note on creation when `showLocationCard` is on; can
 * also be inserted manually from the editor's right-click menu.
 */
export function registerLocationBlock(plugin: DayEchoPlugin): void {
  plugin.registerMarkdownCodeBlockProcessor("echo-location", (_source, el, ctx) => {
    ctx.addChild(new LocationBlock(plugin, el, ctx));
  });
}

interface LocationData {
  location: string | null;
  weather: string | null;
  temp: string | null;
  humidity: string | null;
}

/**
 * Owns one rendered card. Stays live by watching `metadataCache`'s "changed"
 * event for this specific note, so a re-detect, a manual edit, or any other
 * edit to the frontmatter (even outside this card) repaints it immediately.
 */
class LocationBlock extends MarkdownRenderChild {
  constructor(
    private plugin: DayEchoPlugin,
    containerEl: HTMLElement,
    private ctx: MarkdownPostProcessorContext
  ) {
    super(containerEl);
  }

  onload(): void {
    this.repaint();
    const onChange = (file: TAbstractFile) => {
      if (file.path !== this.ctx.sourcePath) return;
      this.repaint();
    };
    this.registerEvent(this.plugin.app.metadataCache.on("changed", onChange));
  }

  file(): TFile | null {
    const f = this.plugin.app.vault.getAbstractFileByPath(this.ctx.sourcePath);
    return f instanceof TFile ? f : null;
  }

  readData(): LocationData {
    const file = this.file();
    const fm = file ? this.plugin.app.metadataCache.getFileCache(file)?.frontmatter : undefined;
    const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
    return {
      location: str(fm?.location),
      weather: str(fm?.weather),
      temp: str(fm?.temp),
      humidity: str(fm?.humidity),
    };
  }

  repaint(): void {
    paintCard(this.plugin, this.containerEl, this);
  }
}

function paintCard(plugin: DayEchoPlugin, el: HTMLElement, block: LocationBlock): void {
  el.empty();
  el.addClass("el-card");

  const header = el.createDiv({ cls: "el-header" });
  const headerIcon = header.createSpan({ cls: "el-header-icon" });
  setIcon(headerIcon, "map-pin");
  header.createSpan({ cls: "el-title", text: t("location.title") });

  const status = header.createSpan({ cls: "el-status" });

  const relocateBtn = header.createEl("button", {
    cls: "el-relocate-btn clickable-icon",
  });
  setIcon(relocateBtn, "rotate-cw");
  relocateBtn.setAttribute("aria-label", t("location.relocate"));
  relocateBtn.addEventListener("click", () => void relocate(plugin, block, relocateBtn, status));

  const data = block.readData();
  const rows = el.createDiv({ cls: "el-rows" });
  renderLocationRow(plugin, rows, block, data);
  renderWeatherRow(rows, data);
}

async function relocate(
  plugin: DayEchoPlugin,
  block: LocationBlock,
  btn: HTMLButtonElement,
  status: HTMLElement
): Promise<void> {
  const file = block.file();
  if (!file) return;
  btn.disabled = true;
  btn.addClass("is-loading");
  setStatus(status, t("location.relocating"), false);
  try {
    const ok = await plugin.applyLocationAndWeather(file);
    if (!ok) {
      setStatus(status, t("location.relocateFailed"), true);
      new Notice(t("location.relocateFailed"));
    }
    // On success the frontmatter write fires metadataCache "changed", which
    // repaints this block with the fresh values — nothing more to do here.
  } catch (err: unknown) {
    setStatus(status, t("location.relocateFailed"), true);
    new Notice(t("location.relocateFailed"));
    console.warn("Day Echo: re-detect failed", err);
  } finally {
    btn.disabled = false;
    btn.removeClass("is-loading");
  }
}

function setStatus(status: HTMLElement, text: string, warn: boolean): void {
  status.setText(text);
  status.toggleClass("el-status--warn", warn);
  status.toggleClass("is-visible", text.length > 0);
}

/** The city row: shows the detected/overridden city, editable via the pencil button. */
function renderLocationRow(
  plugin: DayEchoPlugin,
  parent: HTMLElement,
  block: LocationBlock,
  data: LocationData
): void {
  const row = parent.createDiv({ cls: "el-row" });
  const icon = row.createSpan({ cls: "el-row-icon" });
  setIcon(icon, "map-pin");

  const valueEl = row.createSpan({ cls: "el-row-value" });
  if (data.location) valueEl.setText(data.location);
  else {
    valueEl.setText(t("location.noLocation"));
    valueEl.addClass("el-row-value--empty");
  }

  const editBtn = row.createEl("button", { cls: "el-edit-btn clickable-icon" });
  setIcon(editBtn, "pencil");
  editBtn.setAttribute("aria-label", t("location.editAria"));
  editBtn.addEventListener("click", () => startEdit(plugin, block, row, valueEl, editBtn, data.location ?? ""));
}

/** Swap the city text for an input; Enter/blur commits, Escape cancels. */
function startEdit(
  plugin: DayEchoPlugin,
  block: LocationBlock,
  row: HTMLElement,
  valueEl: HTMLElement,
  editBtn: HTMLElement,
  current: string
): void {
  valueEl.addClass("is-hidden");
  editBtn.addClass("is-hidden");

  const input = row.createEl("input", { cls: "el-row-input", type: "text" });
  input.value = current;
  input.focus();
  input.select();

  let settled = false;
  const cleanup = () => {
    input.remove();
    valueEl.removeClass("is-hidden");
    editBtn.removeClass("is-hidden");
  };
  const commit = () => {
    if (settled) return;
    settled = true;
    void commitLocation(plugin, block, input.value).finally(cleanup);
  };
  const cancel = () => {
    if (settled) return;
    settled = true;
    cleanup();
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  });
  input.addEventListener("blur", commit);
}

/** Write a manually-typed city straight to frontmatter; blank clears it. */
async function commitLocation(
  plugin: DayEchoPlugin,
  block: LocationBlock,
  value: string
): Promise<void> {
  const file = block.file();
  if (!file) return;
  const trimmed = value.trim();
  try {
    await plugin.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
      if (trimmed) fm.location = trimmed;
      else delete fm.location;
    });
  } catch (err: unknown) {
    new Notice(t("interaction.saveFailed", { error: String(err) }));
  }
}

/** The weather row: condition + temp range + humidity, or an empty-state message. */
function renderWeatherRow(parent: HTMLElement, data: LocationData): void {
  const row = parent.createDiv({ cls: "el-row" });
  const icon = row.createSpan({ cls: "el-row-icon" });
  setIcon(icon, "cloud");

  const valueEl = row.createSpan({ cls: "el-row-value" });
  if (data.weather) {
    const parts = [data.weather, data.temp, data.humidity].filter((p): p is string => !!p);
    valueEl.setText(parts.join(" · "));
  } else {
    valueEl.setText(t("location.noWeather"));
    valueEl.addClass("el-row-value--empty");
  }
}
