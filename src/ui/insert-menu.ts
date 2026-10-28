import { Editor, MarkdownView, Menu } from "obsidian";
import type DayEchoPlugin from "../main";
import { t } from "../i18n";

const INTERACTION_SNIPPET = "```echo-interaction\ndate: [today, yesterday]\n```\n";
const LOCATION_SNIPPET = "```echo-location\n```\n";

/**
 * Add "Insert echo interaction" and "Insert location & weather card" items to
 * the editor right-click menu. Each drops its code block at the cursor, which
 * the matching markdown post-processor then renders as the live widget.
 */
export function registerInsertMenu(plugin: DayEchoPlugin): void {
  plugin.registerEvent(
    plugin.app.workspace.on(
      "editor-menu",
      (menu: Menu, editor: Editor, view: MarkdownView) => {
        if (!view) return;
        menu.addItem((item) => {
          item
            .setTitle(t("interaction.insertMenu"))
            .setIcon("heart-pulse")
            .onClick(() => {
              editor.replaceSelection(INTERACTION_SNIPPET);
            });
        });
        menu.addItem((item) => {
          item
            .setTitle(t("location.insertMenu"))
            .setIcon("map-pin")
            .onClick(() => {
              editor.replaceSelection(LOCATION_SNIPPET);
            });
        });
      }
    )
  );
}
