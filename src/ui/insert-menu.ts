import { Editor, MarkdownView, Menu } from "obsidian";
import type DayEchoPlugin from "../main";
import { t } from "../i18n";

const SNIPPET = "```echo-interaction\ndate: [today, yesterday]\n```\n";

/**
 * Add a top-level "Insert echo interaction" item to the editor right-click
 * menu. Clicking it drops an `echo-interaction` code block at the cursor,
 * which the markdown post-processor then renders as the interaction widget.
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
              editor.replaceSelection(SNIPPET);
            });
        });
      }
    )
  );
}
