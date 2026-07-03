/**
 * Pure day-token and field-selection resolution for the echo-interaction
 * block. Kept free of any runtime `obsidian` import so it can be unit-tested
 * without mocking.
 */

export interface BlockConfig {
  date?: string | string[];
  fields?: string | string[];
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
 * Normalize the `fields` config into an ordered list of field keys, filtered
 * to `definedKeys` and always ordered to match `definedKeys` (settings order)
 * regardless of how the block's YAML lists them.
 *
 * A missing `fields` config, or an explicit empty string, selects every
 * defined key. An explicit empty array (`fields: []`) selects none — that's
 * how a block's content is turned off without deleting the block.
 */
export function parseFields(
  fields: string | string[] | undefined,
  definedKeys: string[]
): string[] {
  if (fields === undefined) return [...definedKeys];

  let tokens: string[];
  if (Array.isArray(fields)) {
    tokens = fields.map((f) => String(f).trim()).filter(Boolean);
  } else {
    const trimmed = fields.trim();
    if (!trimmed) return [...definedKeys];
    tokens = trimmed
      .split(",")
      .map((f) => f.trim())
      .filter(Boolean);
  }

  const selected = new Set(tokens);
  return definedKeys.filter((key) => selected.has(key));
}

/** A field's value as read from frontmatter: its type's value, or `null` when
 * absent/unanswered. */
export type FieldValue = number | boolean | null;

/** Minimal per-day state that determines what a block renders. */
export interface DayState {
  filePath: string;
  /** This block's currently-selected field values, keyed by field key. */
  values: Record<string, FieldValue>;
}

/**
 * A stable fingerprint of what the block would render for `targets`. Two renders
 * with the same fingerprint are visually identical, so the block can skip the
 * repaint; anything that changes the result — a value added or cleared, a day
 * rolling over to a new file path — shifts the fingerprint and forces a repaint.
 */
export function renderFingerprint(targets: DayState[]): string {
  return targets
    .map(
      (d) =>
        `${d.filePath}|` +
        Object.entries(d.values)
          .map(([key, value]) => `${key}=${value ?? ""}`)
          .join(",")
    )
    .join("\n");
}
