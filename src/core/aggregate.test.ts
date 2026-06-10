import { describe, expect, test } from "vitest";
import { buildItems, prependToday } from "./aggregate";
import { DiaryEntry, RenderItem } from "../types";

/** Minimal entry fixture; buildItems only reads `date` and `images`. */
function entry(date: string, images = 0): DiaryEntry {
  return {
    date: new Date(date),
    file: { path: date } as never,
    previewText: "",
    searchText: "",
    images: Array.from({ length: images }, (_, i) => `img${i}`),
    tags: [],
  };
}

const cards = (items: RenderItem[]): DiaryEntry[] =>
  items.filter((i) => i.kind === "card").map((i) => (i as { entry: DiaryEntry }).entry);

describe("buildItems · month", () => {
  test("emits a group header per month and keeps every entry when at or under the cap", () => {
    const entries = [entry("2026-06-03"), entry("2026-06-02"), entry("2026-05-30")];

    const items = buildItems(entries, "month", 6);

    expect(items.map((i) => i.kind)).toEqual(["group", "card", "card", "group", "card"]);
    expect(items.filter((i) => i.kind === "fold")).toHaveLength(0);
  });

  test("caps a group at N cards and folds the rest", () => {
    const entries = Array.from({ length: 8 }, (_, i) =>
      entry(`2026-06-${String(8 - i).padStart(2, "0")}`)
    );

    const items = buildItems(entries, "month", 6);

    expect(cards(items)).toHaveLength(6);
    const fold = items.find((i) => i.kind === "fold") as { hidden: DiaryEntry[] };
    expect(fold.hidden).toHaveLength(2);
  });

  test("Infinity cap (month view) shows every entry without folding", () => {
    const entries = Array.from({ length: 9 }, (_, i) =>
      entry(`2026-06-${String(9 - i).padStart(2, "0")}`)
    );

    const items = buildItems(entries, "month", Infinity);

    expect(cards(items)).toEqual(entries);
    expect(items.filter((i) => i.kind === "fold")).toHaveLength(0);
  });

  test("entries with images are chosen first, regardless of position", () => {
    // Newest entry has no image; the six older ones do. With N=6 the image
    // entries must fill the quota and the image-less newest one must fold.
    const newestNoImg = entry("2026-06-07", 0);
    const withImg = Array.from({ length: 6 }, (_, i) =>
      entry(`2026-06-0${6 - i}`, 1)
    );
    const entries = [newestNoImg, ...withImg];

    const items = buildItems(entries, "month", 6);

    expect(cards(items)).toEqual(withImg);
    const fold = items.find((i) => i.kind === "fold") as { hidden: DiaryEntry[] };
    expect(fold.hidden).toEqual([newestNoImg]);
  });

  test("shown cards keep input (date) order even when image entries are selected out of order", () => {
    const entries = [
      entry("2026-06-05", 0),
      entry("2026-06-04", 1),
      entry("2026-06-03", 0),
    ];

    const items = buildItems(entries, "month", 2);

    // Selection picks the image entry (06-04) plus one more, but display
    // order follows the input order, not selection order.
    expect(cards(items)).toEqual([entries[0], entries[1]]);
  });
});

describe("prependToday", () => {
  test("prepends a dedicated today section ahead of the grouped items", () => {
    const today = entry("2026-06-10");
    const rest = buildItems([entry("2026-06-09")], "month", 6);

    const items = prependToday(rest, today);

    expect(items[0]).toEqual({
      kind: "group",
      key: "today",
      label: "今天",
      count: 1,
    });
    expect(items[1]).toEqual({ kind: "card", entry: today });
    expect(items.slice(2)).toEqual(rest);
  });

  test("returns the items untouched when there is no today entry", () => {
    const rest = buildItems([entry("2026-06-09")], "month", 6);

    expect(prependToday(rest, null)).toEqual(rest);
  });
});

describe("buildItems · year", () => {
  test("groups by year and folds beyond the cap", () => {
    const y2026 = Array.from({ length: 7 }, (_, i) =>
      entry(`2026-0${(i % 9) + 1}-01`)
    );
    const y2025 = [entry("2025-04-01")];
    const items = buildItems([...y2026, ...y2025], "year", 6);

    const groups = items.filter((i) => i.kind === "group");
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => (g as { label: string }).label)).toEqual([
      "2026",
      "2025",
    ]);
    expect(groups.map((g) => (g as { count: number }).count)).toEqual([7, 1]);
    expect(cards(items)).toHaveLength(7); // 6 from 2026 + 1 from 2025
    expect(items.filter((i) => i.kind === "fold")).toHaveLength(1);
  });
});
