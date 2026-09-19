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
        type: "group",
        heading: t("settings.section.general"),
        items: [
          {
            name: t("settings.language.name"),
            render: (setting: Setting) => {
              setting.addDropdown((dropdown) =>
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
            },
          },
        ],
      },
      {
        type: "group",
        heading: t("settings.section.basic"),
        items: [
          {
            name: t("settings.sortOrder.name"),
            render: (setting: Setting) => this.buildSortOrderSetting(setting),
          },
          {
            name: t("settings.diaryNav.name"),
            render: (setting: Setting) => {
              setting.addToggle((toggle) =>
                toggle
                  .setValue(this.plugin.settings.showDiaryNav)
                  .onChange(async (value) => {
                    this.plugin.settings.showDiaryNav = value;
                    await this.plugin.saveSettings();
                    this.plugin.diaryNav.refresh();
                  })
              );
            },
          },
        ],
      },
      {
        type: "page",
        name: t("settings.section.advanced"),
        items: [
          {
            name: t("settings.folder.name"),
            desc: t("settings.folder.desc"),
            render: (setting: Setting) => {
              setting.addText((text) =>
                text.setValue(this.plugin.settings.dailyFolder).setDisabled(true)
              );
            },
          },
          {
            name: t("settings.location.name"),
            desc: t("settings.location.desc"),
            render: (setting: Setting) => {
              setting.addToggle((toggle) =>
                toggle
                  .setValue(this.plugin.settings.recordLocation)
                  .onChange(async (value) => {
                    this.plugin.settings.recordLocation = value;
                    await this.plugin.saveSettings();
                  })
              );
            },
          },
        ],
      },
    ];
  }

  /** Segmented newest-first/oldest-first control, in place of a plain toggle. */
  private buildSortOrderSetting(setting: Setting): void {
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

    setting
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
}
