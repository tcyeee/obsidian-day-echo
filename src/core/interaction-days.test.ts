import { describe, expect, test } from "vitest";
import { parseDates, resolveTokens } from "./interaction-days";

const enabled = (today: boolean, yesterday: boolean) => ({ today, yesterday });

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
});

describe("resolveTokens", () => {
  test("inline string date overrides settings", () => {
    expect(resolveTokens({ date: "2026-06-10" }, enabled(false, false))).toEqual([
      "2026-06-10",
    ]);
  });

  test("inline array date overrides settings", () => {
    expect(
      resolveTokens({ date: ["today", "yesterday"] }, enabled(false, false))
    ).toEqual(["today", "yesterday"]);
  });

  test("no inline date: both toggles on -> today + yesterday", () => {
    expect(resolveTokens({}, enabled(true, true))).toEqual([
      "today",
      "yesterday",
    ]);
  });

  test("no inline date: only today", () => {
    expect(resolveTokens({}, enabled(true, false))).toEqual(["today"]);
  });

  test("no inline date: both off -> empty", () => {
    expect(resolveTokens({}, enabled(false, false))).toEqual([]);
  });

  test("empty `date:` (null) falls back to settings", () => {
    expect(
      resolveTokens({ date: null as unknown as string }, enabled(true, false))
    ).toEqual(["today"]);
  });
});
