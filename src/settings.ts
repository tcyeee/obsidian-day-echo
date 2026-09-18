import { App, PluginSettingTab, Setting } from "obsidian";
import type DayEchoPlugin from "./main";
import { ZoomLevel } from "./types";
import { t, type LanguageSetting } from "./i18n";
import { isDailyNotesPluginEnabled } from "./core/daily-notes-plugin";

export interface DayEchoSettings {
  /** Folder scanned for daily notes. */
  dailyFolder: string;
  /** Timeline sort direction; true = oldest first, false = newest first. */
  sortAscending: boolean;
  /** Last timeline zoom level, restored when the view reopens. */
  zoom: ZoomLevel;
  /** Show the prev/next bar on top of open daily notes. */
  showDiaryNav: boolean;
  /** Record the creator's city (via IP lookup) in new notes' frontmatter. */
  recordLocation: boolean;
  /** UI language; `auto` follows Obsidian's interface language. */
  language: LanguageSetting;
}

export const DEFAULT_SETTINGS: DayEchoSettings = {
  dailyFolder: "daily",
  sortAscending: false,
  zoom: "month",
  showDiaryNav: true,
  recordLocation: true,
  language: "auto",
};

export class DayEchoSettingTab extends PluginSettingTab {
  plugin: DayEchoPlugin;

  constructor(app: App, plugin: DayEchoPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    this.buildUI();
  }

  /** Build a collapsible `<details>` section with a heading summary. */
  private createSection(title: string, defaultOpen: boolean): HTMLDetailsElement {
    const details = this.containerEl.createEl("details", {
      cls: "day-echo-settings-section",
    });
    details.open = defaultOpen;
    const summary = details.createEl("summary", {
      cls: "day-echo-settings-section-summary",
    });
    new Setting(summary).setName(title).setHeading();
    return details;
  }

  /** Segmented newest-first/oldest-first control, in place of a plain toggle. */
  private buildSortOrderSetting(container: HTMLElement): void {
    let newestBtn: HTMLButtonElement;
    let oldestBtn: HTMLButtonElement;
    const sync = () => {
      const ascending = this.plugin.settings.sortAscending;
      newestBtn.toggleClass("is-active", !ascending);
      oldestBtn.toggleClass("is-active", ascending);
    };
    const select = async (ascending: boolean) => {
      this.plugin.settings.sortAscending = ascending;
      await this.plugin.saveSettings();
      sync();
    };

    new Setting(container)
      .setName(t("settings.sortOrder.name"))
      .addButton((btn) => {
        newestBtn = btn.buttonEl;
        btn
          .setButtonText(t("settings.sortOrder.newestFirst"))
          .setClass("day-echo-sort-btn")
          .onClick(() => select(false));
      })
      .addButton((btn) => {
        oldestBtn = btn.buttonEl;
        btn
          .setButtonText(t("settings.sortOrder.oldestFirst"))
          .setClass("day-echo-sort-btn")
          .onClick(() => select(true));
      });
    sync();
  }

  private buildUI(): void {
    const { containerEl } = this;
    containerEl.empty();

    if (!isDailyNotesPluginEnabled(this.app)) {
      new Setting(containerEl).setDesc(t("settings.dailyNotesRequired"));
      return;
    }

    const general = this.createSection(t("settings.section.general"), true);

    new Setting(general)
      .setName(t("settings.language.name"))
      .addDropdown((dropdown) =>
        dropdown
          .addOption("auto", t("settings.language.auto"))
          .addOption("zh", "中文")
          .addOption("en", "English")
          .setValue(this.plugin.settings.language)
          .onChange(async (value) => {
            this.plugin.settings.language = value as LanguageSetting;
            await this.plugin.saveSettings();
            this.plugin.refreshLanguage();
            this.buildUI();
          })
      );

    const basic = this.createSection(t("settings.section.basic"), true);

    this.buildSortOrderSetting(basic);

    new Setting(basic)
      .setName(t("settings.diaryNav.name"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showDiaryNav)
          .onChange(async (value) => {
            this.plugin.settings.showDiaryNav = value;
            await this.plugin.saveSettings();
            this.plugin.diaryNav.refresh();
          })
      );

    const advanced = this.createSection(t("settings.section.advanced"), false);

    new Setting(advanced)
      .setName(t("settings.folder.name"))
      .setDesc(t("settings.folder.desc"))
      .addText((text) =>
        text.setValue(this.plugin.settings.dailyFolder).setDisabled(true)
      );

    new Setting(advanced)
      .setName(t("settings.location.name"))
      .setDesc(t("settings.location.desc"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.recordLocation)
          .onChange(async (value) => {
            this.plugin.settings.recordLocation = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
