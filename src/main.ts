import { Plugin, TAbstractFile } from "obsidian";
import { DayEchoView, VIEW_TYPE_DAY_ECHO } from "./ui/view";
import { DiaryNav } from "./ui/diary-nav";
import { registerInteractionBlock } from "./ui/interaction-block";
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
      name: "Open Day Echo timeline",
      callback: () => this.activateView(),
    });

    this.addSettingTab(new DayEchoSettingTab(this.app, this));
    registerInteractionBlock(this);

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
    workspace.revealLeaf(leaf);
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
}
