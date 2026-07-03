import { describe, expect, test } from "vitest";
import { parseDates, parseFields, renderFingerprint } from "./interaction-days";

describe("parseDates", () => {
  test("defaults to today + yesterday when empty", () => {
    expect(parseDates(undefined)).toEqual(["today", "yesterday"]);
    expect(parseDates("")).toEqual(["today", "yesterday"]);
  });

  test("splits a comma-separated string and trims", () => {
    expect(parseDates("today, 2026-06-10")).toEqual(["today", "2026-06-10"]);
  });

  test("accepts an array and drops duplicates", () => {
    expect(parseDates(["today", "today", "yesterday"])).toEqual([
      "today",
      "yesterday",
    ]);
  });

  test("a single token stays a one-element list", () => {
    expect(parseDates("today")).toEqual(["today"]);
    expect(parseDates(["yesterday"])).toEqual(["yesterday"]);
  });
});

describe("parseFields", () => {
  const defined = ["energy", "mood", "coffee"];

  test("defaults to every defined key when the config is absent", () => {
    expect(parseFields(undefined, defined)).toEqual(["energy", "mood", "coffee"]);
  });

  test("an explicit empty string also falls back to every defined key", () => {
    expect(parseFields("", defined)).toEqual(defined);
  });

  test("an explicit empty array selects nothing", () => {
    expect(parseFields([], defined)).toEqual([]);
  });

  test("filters to the defined keys, ordered by settings order, not config order", () => {
    expect(parseFields(["coffee", "energy"], defined)).toEqual(["energy", "coffee"]);
    expect(parseFields("coffee, energy", defined)).toEqual(["energy", "coffee"]);
  });

  test("silently drops keys no longer defined", () => {
    expect(parseFields(["mood", "ghost"], defined)).toEqual(["mood"]);
  });

  test("a single token stays a one-element list", () => {
    expect(parseFields("mood", defined)).toEqual(["mood"]);
  });
});

describe("renderFingerprint", () => {
  test("is stable for identical state", () => {
    const a = renderFingerprint([{ filePath: "x.md", values: { energy: 3, mood: 2 } }]);
    const b = renderFingerprint([{ filePath: "x.md", values: { energy: 3, mood: 2 } }]);
    expect(a).toBe(b);
  });

  test("changes when a value is added or cleared", () => {
    const empty = renderFingerprint([
      { filePath: "d/2026-06-17.md", values: { energy: null, mood: null } },
    ]);
    const rated = renderFingerprint([
      { filePath: "d/2026-06-17.md", values: { energy: 4, mood: null } },
    ]);
    expect(rated).not.toBe(empty);
    // 0 must stay distinct from "absent".
    const zero = renderFingerprint([
      { filePath: "d/2026-06-17.md", values: { energy: 0, mood: null } },
    ]);
    expect(zero).not.toBe(empty);
  });

  test("treats a false boolean as answered, distinct from unanswered", () => {
    const unanswered = renderFingerprint([
      { filePath: "d/2026-06-17.md", values: { coffee: null } },
    ]);
    const answeredFalse = renderFingerprint([
      { filePath: "d/2026-06-17.md", values: { coffee: false } },
    ]);
    expect(answeredFalse).not.toBe(unanswered);
  });

  test("reflects the day set so a rollover forces a repaint", () => {
    const today = renderFingerprint([
      { filePath: "d/2026-06-17.md", values: { energy: null } },
    ]);
    const tomorrow = renderFingerprint([
      { filePath: "d/2026-06-18.md", values: { energy: null } },
    ]);
    expect(tomorrow).not.toBe(today);
  });
});
