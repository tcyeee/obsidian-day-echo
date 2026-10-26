import { App, normalizePath } from "obsidian";

/** Shape of Obsidian's undocumented core "daily-notes" internal plugin. */
interface DailyNotesInternalPlugin {
  enabled: boolean;
  instance?: {
    options?: {
      folder?: string;
    };
  };
}

interface AppWithInternalPlugins extends App {
  internalPlugins: {
    getPluginById(id: "daily-notes"): DailyNotesInternalPlugin | null;
  };
}

function getDailyNotesPlugin(app: App): DailyNotesInternalPlugin | null {
  return (app as AppWithInternalPlugins).internalPlugins.getPluginById(
    "daily-notes"
  );
}

/** Whether Obsidian's core Daily notes plugin is enabled in this vault. */
export function isDailyNotesPluginEnabled(app: App): boolean {
  return !!getDailyNotesPlugin(app)?.enabled;
}

/**
 * Folder configured in the core Daily notes plugin. Mirrors that plugin's own
 * default (the vault root) when left blank.
 */
export function getDailyNotesFolder(app: App): string {
  const folder = getDailyNotesPlugin(app)?.instance?.options?.folder?.trim();
  if (!folder) return "";
  // Core plugin stores the raw user input (e.g. a leading "/"), but vault
  // lookups and path comparisons require Obsidian's normalized form.
  const normalized = normalizePath(folder);
  return normalized === "/" ? "" : normalized;
}
