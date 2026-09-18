import { App, PluginSettingTab, Setting, type SettingDefinitionItem } from "obsidian";
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

  getSettingDefinitions(): SettingDefinitionItem[] {
    if (!isDailyNotesPluginEnabled(this.app)) {
      return [{ name: "", desc: t("settings.dailyNotesRequired") }];
    }

    return [
      {
        name: t("settings.section.general"),
        render: (setting) =>
          this.renderSection(setting, t("settings.section.general"), true, (container) =>
            this.buildGeneralSettings(container)
          ),
      },
      {
        name: t("settings.section.basic"),
        render: (setting) =>
          this.renderSection(setting, t("settings.section.basic"), true, (container) =>
            this.buildBasicSettings(container)
          ),
      },
      {
        name: t("settings.section.advanced"),
        render: (setting) =>
          this.renderSection(setting, t("settings.section.advanced"), false, (container) =>
            this.buildAdvancedSettings(container)
          ),
      },
    ];
  }

  /** Replace the framework-rendered row with a collapsible `<details>` section. */
  private renderSection(
    setting: Setting,
    title: string,
    defaultOpen: boolean,
    fill: (container: HTMLElement) => void
  ): void {
    setting.settingEl.empty();
    const details = setting.settingEl.createEl("details", {
      cls: "day-echo-settings-section",
    });
    details.open = defaultOpen;
    const summary = details.createEl("summary", {
      cls: "day-echo-settings-section-summary",
    });
    new Setting(summary).setName(title).setHeading();
    fill(details);
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

  private buildGeneralSettings(container: HTMLElement): void {
    new Setting(container)
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
            this.update();
          })
      );
  }

  private buildBasicSettings(container: HTMLElement): void {
    this.buildSortOrderSetting(container);

    new Setting(container)
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
  }

  private buildAdvancedSettings(container: HTMLElement): void {
    new Setting(container)
      .setName(t("settings.folder.name"))
      .setDesc(t("settings.folder.desc"))
      .addText((text) =>
        text.setValue(this.plugin.settings.dailyFolder).setDisabled(true)
      );

    new Setting(container)
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
