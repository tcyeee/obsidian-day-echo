import { App, PluginSettingTab, Setting } from "obsidian";
import type DayEchoPlugin from "./main";
import { ZoomLevel } from "./types";

export interface DayEchoSettings {
  /** Folder scanned for daily notes. */
  dailyFolder: string;
  /** Timeline sort direction; true = oldest first, false = newest first. */
  sortAscending: boolean;
  /** Last timeline zoom level, restored when the view reopens. */
  zoom: ZoomLevel;
  /** Show the prev/next bar on top of open daily notes. */
  showDiaryNav: boolean;
}

export const DEFAULT_SETTINGS: DayEchoSettings = {
  dailyFolder: "daily",
  sortAscending: false,
  zoom: "day",
  showDiaryNav: true,
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
      .setName("Daily notes folder")
      .setDesc("Folder scanned for daily notes (relative to the vault root).")
      .addText((text) =>
        text
          .setPlaceholder("daily")
          .setValue(this.plugin.settings.dailyFolder)
          .onChange(async (value) => {
            this.plugin.settings.dailyFolder = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Oldest first")
      .setDesc("Default sort direction. Off shows the newest entries at the top.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.sortAscending)
          .onChange(async (value) => {
            this.plugin.settings.sortAscending = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Show diary navigation")
      .setDesc("Show a prev/next bar on top of open daily notes.")
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
