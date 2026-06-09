import { Plugin, TAbstractFile } from "obsidian";
import { DayEchoView, VIEW_TYPE_DAY_ECHO } from "./view";
import {
  DayEchoSettings,
  DEFAULT_SETTINGS,
  DayEchoSettingTab,
} from "./settings";

export default class DayEchoPlugin extends Plugin {
  settings: DayEchoSettings;
  private refreshTimer: number | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(
      VIEW_TYPE_DAY_ECHO,
      (leaf) => new DayEchoView(leaf, this)
    );

    this.addRibbonIcon("calendar-clock", "Open Day Echo timeline", () =>
      this.activateView()
    );

    this.addCommand({
      id: "open-timeline",
      name: "Open Day Echo timeline",
      callback: () => this.activateView(),
    });

    this.addSettingTab(new DayEchoSettingTab(this.app, this));

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
    this.app.workspace.onLayoutReady(() => this.updateStatusBarVisibility());
  }

  onunload(): void {
    if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
    document.body.removeClass("day-echo-active");
  }

  /** Hide the global status bar while the timeline view is active. */
  private updateStatusBarVisibility(): void {
    const active = this.app.workspace.getActiveViewOfType(DayEchoView);
    document.body.toggleClass("day-echo-active", !!active);
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
    }, 300);
  }

  async activateView(): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_DAY_ECHO)[0];
    if (!leaf) {
      leaf = workspace.getLeaf(true);
      await leaf.setViewState({ type: VIEW_TYPE_DAY_ECHO, active: true });
    }
    workspace.revealLeaf(leaf);
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      (await this.loadData()) as Partial<DayEchoSettings>
    );
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
