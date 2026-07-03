/**
 * Pure validation helpers for user-defined data fields, kept free of any
 * runtime `obsidian` import so they can be unit-tested without mocking.
 */
import type { FieldDef } from "../types";

/** A field's frontmatter key must be a bare identifier. */
const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function isValidKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

/** True if `key` is already used by a field other than the one at `ignoreIndex`. */
export function isDuplicateKey(
  key: string,
  fields: FieldDef[],
  ignoreIndex: number
): boolean {
  return fields.some((f, i) => i !== ignoreIndex && f.key === key);
}

/** A number field's range must be two integers with `min` strictly below `max`. */
export function isValidRange(min: number, max: number): boolean {
  return Number.isInteger(min) && Number.isInteger(max) && min < max;
}
