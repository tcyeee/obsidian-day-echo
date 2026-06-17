import { describe, expect, test } from "vitest";
import { parseDates, renderFingerprint } from "./interaction-days";

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

describe("renderFingerprint", () => {
  test("is stable for identical state", () => {
    const a = renderFingerprint([{ filePath: "x.md", energy: 3, mood: 2 }]);
    const b = renderFingerprint([{ filePath: "x.md", energy: 3, mood: 2 }]);
    expect(a).toBe(b);
  });

  test("changes when a score is added or cleared", () => {
    const empty = renderFingerprint([
      { filePath: "d/2026-06-17.md", energy: null, mood: null },
    ]);
    const rated = renderFingerprint([
      { filePath: "d/2026-06-17.md", energy: 4, mood: null },
    ]);
    expect(rated).not.toBe(empty);
    // 0 must stay distinct from "absent".
    const zero = renderFingerprint([
      { filePath: "d/2026-06-17.md", energy: 0, mood: null },
    ]);
    expect(zero).not.toBe(empty);
  });

  test("reflects the day set so a rollover forces a repaint", () => {
    const today = renderFingerprint([
      { filePath: "d/2026-06-17.md", energy: null, mood: null },
    ]);
    const tomorrow = renderFingerprint([
      { filePath: "d/2026-06-18.md", energy: null, mood: null },
    ]);
    expect(tomorrow).not.toBe(today);
  });
});
