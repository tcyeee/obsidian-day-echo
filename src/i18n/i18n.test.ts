import { afterEach, describe, expect, test } from "vitest";
import { en } from "./en";
import { zh } from "./zh";
import { setLocale, t } from "./index";

afterEach(() => setLocale("en"));

describe("catalogs", () => {
  test("zh defines exactly the same keys as en", () => {
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
  });

  test("every placeholder in en also appears in zh", () => {
    const holders = (s: string) => (s.match(/\{[a-z]+\}/gi) ?? []).sort();
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(holders(zh[key])).toEqual(holders(en[key]));
    }
  });
});

describe("t", () => {
  test("returns the active locale's string", () => {
    setLocale("zh");
    expect(t("view.today")).toBe("今天");
    setLocale("en");
    expect(t("view.today")).toBe("Today");
  });

  test("fills named placeholders", () => {
    setLocale("en");
    expect(t("view.entryCount", { count: 3 })).toBe("3 entries");
    setLocale("zh");
    expect(t("card.diaryCount", { count: 12 })).toBe("12 篇日记");
  });

  test("leaves text unchanged when no params are given", () => {
    setLocale("en");
    expect(t("interaction.saved")).toBe("Saved ✓");
  });
});
