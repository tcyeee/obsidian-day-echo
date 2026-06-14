/**
 * Pure day-token resolution for the echo-interaction block. Kept free of any
 * runtime `obsidian` import so it can be unit-tested without mocking.
 */

export interface BlockConfig {
  date?: string | string[];
}

/** Which built-in days to show when a block has no explicit `date:`. */
export interface EnabledDays {
  today: boolean;
  yesterday: boolean;
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

/**
 * Resolve the day tokens a block should render. An inline `date:` always wins
 * (override). Otherwise the list is built from the user's settings toggles,
 * which may be empty (block renders nothing).
 */
export function resolveTokens(config: BlockConfig, enabled: EnabledDays): string[] {
  if (config.date != null) {
    return parseDates(config.date);
  }
  const tokens: string[] = [];
  if (enabled.today) tokens.push("today");
  if (enabled.yesterday) tokens.push("yesterday");
  return tokens;
}
