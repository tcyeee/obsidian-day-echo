import { Notice, Plugin, TAbstractFile, TFile } from "obsidian";
import { DayEchoView, VIEW_TYPE_DAY_ECHO } from "./ui/view";
import { fetchLocation } from "./core/geolocation";
import { fetchDeviceCoords } from "./core/device-location";
import { reverseGeocode } from "./core/reverse-geocode";
import { fetchWeather, type WeatherResult } from "./core/weather";
import { dailyNotePath } from "./core/daily-note";
import {
  getDailyNotesFolder,
  isDailyNotesPluginEnabled,
} from "./core/daily-notes-plugin";
import { DiaryNav } from "./ui/diary-nav";
import { registerInteractionBlock } from "./ui/interaction-block";
import { registerLocationBlock } from "./ui/location-block";
import { registerInsertMenu } from "./ui/insert-menu";
import {
  DayEchoSettings,
  DEFAULT_SETTINGS,
  DayEchoSettingTab,
} from "./settings";
import { t, setLocale } from "./i18n";

export default class DayEchoPlugin extends Plugin {
  settings: DayEchoSettings;
  diaryNav: DiaryNav;
  private refreshTimer: number | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();
    setLocale(this.settings.language);

    if (!isDailyNotesPluginEnabled(this.app)) {
      new Notice(t("notice.dailyNotesRequired"));
      this.addSettingTab(new DayEchoSettingTab(this.app, this));
      return;
    }
    this.settings.dailyFolder = getDailyNotesFolder(this.app);
    await this.saveSettings();

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
    registerLocationBlock(this);
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

  /** Redraw the timeline's title/subtitle after a settings change. */
  refreshTimelineHeader(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_DAY_ECHO)) {
      const view = leaf.view;
      if (view instanceof DayEchoView) view.refreshHeader();
    }
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
   * coordinates plus today's weather, then back-fill yesterday's note with
   * its now-finalized actual weather. Fire-and-forget: callers should not
   * await this, so the network lookups never delay opening the note. No-ops
   * when the setting is off; stays silent on any failure.
   */
  async recordContext(file: TFile): Promise<void> {
    if (!this.settings.recordLocation) return;
    try {
      await this.applyLocationAndWeather(file);
      if (this.settings.showLocationCard) await this.ensureLocationCard(file);
      await this.backfillYesterday();
    } catch (err: unknown) {
      console.warn("Day Echo: failed to record creation context", err);
    }
  }

  /**
   * Detect the current city/coordinates and today's weather, then write them
   * to `file`'s frontmatter. Shared by `recordContext` (on note creation) and
   * the `echo-location` card's "re-detect" button (a manual re-run, e.g. after
   * turning a VPN off or granting the location permission). A non-empty
   * `locationOverride` replaces the detected city label only — weather still
   * uses the detected coordinates. Returns false without writing anything
   * when every lookup fails (e.g. fully offline), so callers can tell the
   * difference from "nothing changed."
   */
  async applyLocationAndWeather(file: TFile): Promise<boolean> {
    const resolved = await resolveLocationContext();
    if (!resolved) return false;
    const override = this.settings.locationOverride.trim();
    const location = override || resolved.location;
    const hasCoords = resolved.lat !== null && resolved.lon !== null;
    const weather = hasCoords
      ? await fetchWeather(resolved.lat as number, resolved.lon as number, "today")
      : null;
    await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
      fm.location = location;
      if (hasCoords) fm.geo = `${resolved.lat},${resolved.lon}`;
      if (weather) applyWeather(fm, weather);
    });
    return true;
  }

  /** Append an `echo-location` card to the note body, unless it already has one. */
  private async ensureLocationCard(file: TFile): Promise<void> {
    const content = await this.app.vault.read(file);
    if (content.includes("```echo-location")) return;
    await this.app.vault.append(file, "\n```echo-location\n```\n");
  }

  /** Strip the auto-inserted `echo-location` card from the note body, if present. */
  private async removeLocationCard(file: TFile): Promise<void> {
    const content = await this.app.vault.read(file);
    const stripped = content.replace(/\n?```echo-location\n```\n?/, "");
    if (stripped !== content) await this.app.vault.modify(file, stripped);
  }

  /**
   * Add or remove the card in today's note right away when `showLocationCard`
   * is toggled, instead of only taking effect on the next note creation — the
   * setting's effect should be visible immediately. No-ops when today's note
   * doesn't exist yet (it'll get the card on creation, since the setting is
   * already in its new state by then).
   */
  async syncLocationCardToday(show: boolean): Promise<void> {
    const path = dailyNotePath(this.settings.dailyFolder, new Date());
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return;
    if (show) await this.ensureLocationCard(file);
    else await this.removeLocationCard(file);
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
    await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
      applyWeather(fm, weather);
    });
  }
}

interface LocationContext {
  /** "Region-City-District", already carrying a "(VPN?)" marker if applicable. */
  location: string;
  lat: number | null;
  lon: number | null;
}

/**
 * Resolve the creator's city and coordinates, preferring the device's own
 * location service over an IP-based lookup: a VPN reroutes network traffic,
 * not the OS location service, so device coordinates stay correct where an
 * IP lookup would report the exit node's city instead. Falls back to the
 * IP-based lookup (flagging VPN/proxy exits with a "(VPN?)" marker) when
 * device location is unavailable, denied, or its coordinates can't be
 * reverse-geocoded to a place name.
 */
async function resolveLocationContext(): Promise<LocationContext | null> {
  const coords = await fetchDeviceCoords();
  if (coords) {
    const location = await reverseGeocode(coords.lat, coords.lon);
    if (location) return { location, lat: coords.lat, lon: coords.lon };
  }
  const geo = await fetchLocation();
  if (!geo) return null;
  const location = geo.proxy ? `${geo.location} (VPN?)` : geo.location;
  return { location, lat: geo.lat, lon: geo.lon };
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
