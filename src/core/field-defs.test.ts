import { describe, expect, test } from "vitest";
import { isDuplicateKey, isValidKey, isValidRange } from "./field-defs";
import type { FieldDef } from "../types";

describe("isValidKey", () => {
  test("accepts letters, digits, underscore, not starting with a digit", () => {
    expect(isValidKey("coffee")).toBe(true);
    expect(isValidKey("_private")).toBe(true);
    expect(isValidKey("focus2")).toBe(true);
  });

  test("rejects empty, spaces, leading digits, and punctuation", () => {
    expect(isValidKey("")).toBe(false);
    expect(isValidKey("my field")).toBe(false);
    expect(isValidKey("2fast")).toBe(false);
    expect(isValidKey("coffee!")).toBe(false);
  });
});

describe("isDuplicateKey", () => {
  const fields: FieldDef[] = [
    { key: "energy", label: "Energy", type: "number", min: 1, max: 5 },
    { key: "mood", label: "Mood", type: "number", min: 1, max: 5 },
  ];

  test("true when another field already uses the key", () => {
    expect(isDuplicateKey("mood", fields, 0)).toBe(true);
  });

  test("false when only the field being edited uses the key", () => {
    expect(isDuplicateKey("energy", fields, 0)).toBe(false);
  });

  test("false when no field uses the key", () => {
    expect(isDuplicateKey("coffee", fields, 0)).toBe(false);
  });
});

describe("isValidRange", () => {
  test("true for integers with min below max", () => {
    expect(isValidRange(1, 5)).toBe(true);
  });

  test("false when min equals or exceeds max", () => {
    expect(isValidRange(5, 5)).toBe(false);
    expect(isValidRange(6, 5)).toBe(false);
  });

  test("false for non-integers", () => {
    expect(isValidRange(1.5, 5)).toBe(false);
    expect(isValidRange(1, 5.5)).toBe(false);
  });
});
