import { normalizePath } from "obsidian";

/** Format a date as the `YYYY-MM-DD` stem used for daily-note filenames. */
export function formatDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Vault path of the daily note for `date`, honoring the configured daily
 * folder. A blank folder puts notes at the vault root.
 */
export function dailyNotePath(dailyFolder: string, date: Date): string {
  const folder = dailyFolder.replace(/\/+$/, "");
  const name = `${formatDate(date)}.md`;
  return normalizePath(folder ? `${folder}/${name}` : name);
}
