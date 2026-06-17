/**
 * Pure day-token resolution for the echo-interaction block. Kept free of any
 * runtime `obsidian` import so it can be unit-tested without mocking.
 */

export interface BlockConfig {
  date?: string | string[];
}

/**
 * Normalize the `date` config into an ordered list of tokens. Accepts a YAML
 * array (`[today, yesterday]`), a comma-separated string (`today, yesterday`),
 * or a single token. Defaults to today + yesterday. Duplicates are dropped.
 */
export function parseDates(date: string | string[] | undefined): string[] {
  let tokens: string[];
  if (Array.isArray(date)) {
    tokens = date.map((d) => String(d).trim());
  } else if (typeof date === "string" && date.trim()) {
    tokens = date.split(",").map((d) => d.trim());
  } else {
    tokens = ["today", "yesterday"];
  }
  tokens = tokens.filter(Boolean);
  if (tokens.length === 0) tokens = ["today", "yesterday"];
  return [...new Set(tokens)];
}

/** Minimal per-day state that determines what a block renders. */
export interface DayState {
  filePath: string;
  energy: number | null;
  mood: number | null;
}

/**
 * A stable fingerprint of what the block would render for `targets`. Two renders
 * with the same fingerprint are visually identical, so the block can skip the
 * repaint; anything that changes the result — a score added or cleared, a day
 * rolling over to a new file path — shifts the fingerprint and forces a repaint.
 */
export function renderFingerprint(targets: DayState[]): string {
  return targets
    .map((d) => `${d.filePath}|${d.energy ?? ""}|${d.mood ?? ""}`)
    .join("\n");
}
