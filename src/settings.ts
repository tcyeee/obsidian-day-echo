import { App, PluginSettingTab, Setting } from "obsidian";
import type DayEchoPlugin from "./main";

export interface DayEchoSettings {
  /** Folder scanned for daily notes. */
  dailyFolder: string;
  /** Timeline sort direction; true = oldest first, false = newest first. */
  sortAscending: boolean;
}

export const DEFAULT_SETTINGS: DayEchoSettings = {
  dailyFolder: "daily",
  sortAscending: false,
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
  }
}
