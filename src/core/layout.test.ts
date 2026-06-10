import { describe, expect, test } from "vitest";
import { planLayout, resolveMarkerTops } from "./layout";
import { DiaryEntry, RenderItem } from "../types";

/** Minimal entry fixture; planLayout only reads identity. */
function entry(date: string): DiaryEntry {
  return {
    date: new Date(date),
    file: { path: date } as never,
    previewText: "",
    searchText: "",
    images: [],
    tags: [],
  };
}

const group = (key: string, count: number): RenderItem => ({
  kind: "group",
  key,
  label: key.replace("-", "."),
  count,
});
const card = (entry: DiaryEntry): RenderItem => ({ kind: "card", entry });

const flat = () => 100;

describe("planLayout · column placement", () => {
  test("each card goes to the currently shorter column, continuing across group boundaries", () => {
    const [a, b, c] = [entry("2026-06-02"), entry("2026-06-01"), entry("2026-05-30")];
    const items: RenderItem[] = [
      group("2026-06", 2),
      card(a),
      card(b),
      group("2026-05", 1),
      card(c),
    ];

    const plan = planLayout(items, new Set(), flat);

    // c lands in column 0 even though a new month started: no reset.
    expect(plan.cards.map((p) => p.col)).toEqual([0, 1, 0]);
    expect(plan.cards.map((p) => p.entry)).toEqual([a, b, c]);
  });

  test("a tall card routes the following cards into the other column", () => {
    const [a, b, c, d] = [
      entry("2026-06-04"),
      entry("2026-06-03"),
      entry("2026-06-02"),
      entry("2026-06-01"),
    ];
    const items: RenderItem[] = [group("2026-06", 4), card(a), card(b), card(c), card(d)];

    const plan = planLayout(items, new Set(), (e) => (e === a ? 300 : 100));

    expect(plan.cards.map((p) => p.col)).toEqual([0, 1, 1, 1]);
  });
});

describe("planLayout · groups", () => {
  test("each group records the index of its first card", () => {
    const items: RenderItem[] = [
      group("2026-06", 2),
      card(entry("2026-06-02")),
      card(entry("2026-06-01")),
      group("2026-05", 1),
      card(entry("2026-05-30")),
    ];

    const plan = planLayout(items, new Set(), flat);

    expect(plan.groups.map((g) => g.key)).toEqual(["2026-06", "2026-05"]);
    expect(plan.groups.map((g) => g.firstCard)).toEqual([0, 2]);
    expect(plan.groups[0]).toMatchObject({ label: "2026.06", count: 2 });
  });
});

describe("planLayout · folds", () => {
  const a = entry("2026-06-03");
  const h1 = entry("2026-06-02");
  const h2 = entry("2026-06-01");
  const items: RenderItem[] = [
    group("2026-06", 3),
    card(a),
    { kind: "fold", key: "2026-06", hidden: [h1, h2] },
  ];

  test("a folded group yields one fold card carrying the hidden entries", () => {
    const plan = planLayout(items, new Set(), flat);

    expect(plan.cards).toHaveLength(2);
    expect(plan.cards[1].entry).toBe(h1);
    expect(plan.cards[1].fold).toEqual([h1, h2]);
    expect(plan.cards[1].foldKey).toBe("2026-06");
    expect(plan.cards[1].col).toBe(1);
  });

  test("an unfolded group flows its hidden entries as plain cards", () => {
    const plan = planLayout(items, new Set(["2026-06"]), flat);

    expect(plan.cards.map((p) => p.entry)).toEqual([a, h1, h2]);
    expect(plan.cards.every((p) => !p.fold)).toBe(true);
    expect(plan.cards.map((p) => p.col)).toEqual([0, 1, 0]);
  });
});

describe("resolveMarkerTops", () => {
  test("leaves well-separated tops unchanged", () => {
    expect(resolveMarkerTops([0, 200, 500], 56)).toEqual([0, 200, 500]);
  });

  test("pushes overlapping tops down to keep the minimum gap, cascading", () => {
    expect(resolveMarkerTops([0, 30, 60], 56)).toEqual([0, 56, 112]);
  });

  test("handles an empty list", () => {
    expect(resolveMarkerTops([], 56)).toEqual([]);
  });
});
