import { App, PluginSettingTab, Setting } from "obsidian";
import type DayEchoPlugin from "./main";
import { ZoomLevel } from "./types";
import { t, type LanguageSetting } from "./i18n";

export interface DayEchoSettings {
  /** Folder scanned for daily notes. */
  dailyFolder: string;
  /** Timeline sort direction; true = oldest first, false = newest first. */
  sortAscending: boolean;
  /** Last timeline zoom level, restored when the view reopens. */
  zoom: ZoomLevel;
  /** Show the prev/next bar on top of open daily notes. */
  showDiaryNav: boolean;
  /** UI language; `auto` follows Obsidian's interface language. */
  language: LanguageSetting;
}

export const DEFAULT_SETTINGS: DayEchoSettings = {
  dailyFolder: "daily",
  sortAscending: false,
  zoom: "month",
  showDiaryNav: true,
  language: "auto",
};

export class DayEchoSettingTab extends PluginSettingTab {
  plugin: DayEchoPlugin;

  constructor(app: App, plugin: DayEchoPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName(t("settings.language.name"))
      .setDesc(t("settings.language.desc"))
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
            // eslint-disable-next-line @typescript-eslint/no-deprecated -- PluginSettingTab.display() deprecated in 1.13.0; migrate to getSettingDefinitions() when refactoring settings
            this.display();
          })
      );

    new Setting(containerEl)
      .setName(t("settings.folder.name"))
      .setDesc(t("settings.folder.desc"))
      .addText((text) =>
        text
          .setPlaceholder(t("settings.folder.placeholder"))
          .setValue(this.plugin.settings.dailyFolder)
          .onChange(async (value) => {
            this.plugin.settings.dailyFolder = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t("settings.oldestFirst.name"))
      .setDesc(t("settings.oldestFirst.desc"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.sortAscending)
          .onChange(async (value) => {
            this.plugin.settings.sortAscending = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t("settings.diaryNav.name"))
      .setDesc(t("settings.diaryNav.desc"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showDiaryNav)
          .onChange(async (value) => {
            this.plugin.settings.showDiaryNav = value;
            await this.plugin.saveSettings();
            if (value) this.plugin.diaryNav.refresh();
            else this.plugin.diaryNav.detachAll();
          })
      );
  }
}
