import { Plugin, TAbstractFile, TFile } from "obsidian";
import { DayEchoView, VIEW_TYPE_DAY_ECHO } from "./ui/view";
import { fetchLocation } from "./core/geolocation";
import { fetchWeather, type WeatherResult } from "./core/weather";
import { dailyNotePath } from "./core/daily-note";
import { DiaryNav } from "./ui/diary-nav";
import { registerInteractionBlock } from "./ui/interaction-block";
import { registerInsertMenu } from "./ui/insert-menu";
import {
  DayEchoSettings,
  DEFAULT_SETTINGS,
  DayEchoSettingTab,
} from "./settings";
import { setLocale } from "./i18n";

export default class DayEchoPlugin extends Plugin {
  settings: DayEchoSettings;
  diaryNav: DiaryNav;
  private refreshTimer: number | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();
    setLocale(this.settings.language);

    this.registerView(
      VIEW_TYPE_DAY_ECHO,
      (leaf) => new DayEchoView(leaf, this)
    );

    this.addRibbonIcon("calendar-clock", "Open Day Echo timeline", () =>
      this.activateView()
    );

    this.addCommand({
      id: "open-timeline",
      name: "Open timeline",
      callback: () => this.activateView(),
    });

    this.addSettingTab(new DayEchoSettingTab(this.app, this));
    registerInteractionBlock(this);
    registerInsertMenu(this);

    const onChange = (file: TAbstractFile) => this.scheduleRefresh(file.path);
    this.registerEvent(this.app.vault.on("create", onChange));
    this.registerEvent(this.app.vault.on("modify", onChange));
    this.registerEvent(this.app.vault.on("delete", onChange));
    this.registerEvent(this.app.vault.on("rename", onChange));

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () =>
        this.updateStatusBarVisibility()
      )
    );

    this.diaryNav = new DiaryNav(this);
    this.registerEvent(
      this.app.workspace.on("file-open", () => this.diaryNav.refresh())
    );
    this.registerEvent(
      this.app.workspace.on("layout-change", () => this.diaryNav.refresh())
    );

    this.app.workspace.onLayoutReady(() => {
      this.updateStatusBarVisibility();
      this.diaryNav.refresh();
    });
  }

  onunload(): void {
    if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
    activeDocument.body.removeClass("day-echo-active");
    this.diaryNav.detachAll();
  }

  /** Hide the global status bar while the timeline view is active. */
  private updateStatusBarVisibility(): void {
    const active = this.app.workspace.getActiveViewOfType(DayEchoView);
    activeDocument.body.toggleClass("day-echo-active", !!active);
  }

  private inDailyFolder(path: string): boolean {
    const folder = this.settings.dailyFolder.replace(/\/+$/, "");
    return folder === "" || path.startsWith(folder + "/");
  }

  /** Debounce vault changes into a single timeline refresh. */
  private scheduleRefresh(path: string): void {
    if (!path.endsWith(".md") || !this.inDailyFolder(path)) return;
    if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_DAY_ECHO)) {
        const view = leaf.view;
        if (view instanceof DayEchoView) void view.refresh();
      }
      this.diaryNav.refresh();
    }, 300);
  }

  /** Re-resolve the active locale and redraw everything that shows text. */
  refreshLanguage(): void {
    setLocale(this.settings.language);
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_DAY_ECHO)) {
      const view = leaf.view;
      if (view instanceof DayEchoView) void view.refresh();
    }
    this.diaryNav.refresh();
  }

  async activateView(): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_DAY_ECHO)[0];
    if (!leaf) {
      leaf = workspace.getLeaf(true);
      await leaf.setViewState({ type: VIEW_TYPE_DAY_ECHO, active: true });
    }
    await workspace.revealLeaf(leaf);
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      (await this.loadData()) as Partial<DayEchoSettings>
    );
    // The "day" zoom level no longer exists; older installs may have it saved.
    if ((this.settings.zoom as string) === "day") {
      this.settings.zoom = "month";
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /**
   * Record creation context on a freshly created note: the creator's city and
   * coordinates (by IP) plus today's weather, then back-fill yesterday's note
   * with its now-finalized actual weather. Fire-and-forget: callers should not
   * await this, so the network lookups never delay opening the note. No-ops
   * when the setting is off; stays silent on any failure. VPN/proxy exits get a
   * "(VPN?)" marker since the reported city is the exit node's, not the user's.
   */
  async recordContext(file: TFile): Promise<void> {
    if (!this.settings.recordLocation) return;
    try {
      const geo = await fetchLocation();
      if (geo) {
        const location = geo.proxy ? `${geo.location} (VPN?)` : geo.location;
        const hasCoords = geo.lat !== null && geo.lon !== null;
        // Today's high/low are still a forecast; backfillYesterday corrects each
        // note with actuals the next day a note is created.
        const weather = hasCoords
          ? await fetchWeather(geo.lat as number, geo.lon as number, "today")
          : null;
        await this.app.fileManager.processFrontMatter(file, (fm) => {
          fm.location = location;
          if (hasCoords) fm.geo = `${geo.lat},${geo.lon}`;
          if (weather) applyWeather(fm, weather);
        });
      }
      await this.backfillYesterday();
    } catch (err) {
      console.warn("Day Echo: failed to record creation context", err);
    }
  }

  /**
   * Overwrite yesterday's note weather with what actually happened. Yesterday's
   * note stored its own `geo`, so a trip is handled correctly — the lookup uses
   * where you were, not where you are now. No-ops when yesterday's note is
   * missing or has no coordinates (created before this feature, or with
   * location recording off).
   */
  private async backfillYesterday(): Promise<void> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const path = dailyNotePath(this.settings.dailyFolder, yesterday);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return;
    const coords = parseGeo(this.app.metadataCache.getFileCache(file)?.frontmatter?.geo);
    if (!coords) return;
    const weather = await fetchWeather(coords.lat, coords.lon, "yesterday");
    if (!weather) return;
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      applyWeather(fm, weather);
    });
  }
}

/** Write a weather summary into frontmatter using the agreed field shape. */
function applyWeather(fm: Record<string, unknown>, weather: WeatherResult): void {
  fm.weather = weather.condition;
  fm.temp = `${weather.tempLow}~${weather.tempHigh}°C`;
  fm.humidity = `${weather.humidity}%`;
}

/** Parse a stored `"lat,lon"` frontmatter value back into coordinates. */
function parseGeo(value: unknown): { lat: number; lon: number } | null {
  if (typeof value !== "string") return null;
  const [latStr, lonStr] = value.split(",");
  const lat = Number(latStr);
  const lon = Number(lonStr);
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
  return { lat, lon };
}
