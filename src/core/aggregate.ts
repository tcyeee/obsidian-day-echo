import { DiaryEntry, RenderItem, ZoomLevel } from "../types";

/** Turn sorted entries into a flat list of render items for the given zoom level. */
export function buildItems(
  entries: DiaryEntry[],
  zoom: ZoomLevel,
  n: number
): RenderItem[] {
  if (zoom === "day") return dayItems(entries);
  return groupItems(entries, zoom, n);
}

/** Day view: a year divider whenever the year changes, then one card per entry. */
function dayItems(entries: DiaryEntry[]): RenderItem[] {
  const items: RenderItem[] = [];
  let lastYear: number | null = null;
  for (const entry of entries) {
    const year = entry.date.getFullYear();
    if (year !== lastYear) {
      items.push({ kind: "year", year });
      lastYear = year;
    }
    items.push({ kind: "card", entry });
  }
  return items;
}

/** Month/year view: a header per group, the picked representatives, then a fold. */
function groupItems(
  entries: DiaryEntry[],
  zoom: "month" | "year",
  n: number
): RenderItem[] {
  const items: RenderItem[] = [];
  for (const group of groupBy(entries, zoom)) {
    items.push({ kind: "group", key: group.key, label: group.label });
    const { shown, hidden } = pickRepresentatives(group.entries, n);
    for (const entry of shown) items.push({ kind: "card", entry });
    if (hidden.length) items.push({ kind: "fold", key: group.key, hidden });
  }
  return items;
}

interface Group {
  key: string;
  label: string;
  entries: DiaryEntry[];
}

/** Bucket entries into month or year groups, preserving first-seen order. */
function groupBy(entries: DiaryEntry[], zoom: "month" | "year"): Group[] {
  const byKey = new Map<string, Group>();
  for (const entry of entries) {
    const year = entry.date.getFullYear();
    const key =
      zoom === "year" ? String(year) : `${year}-${pad(entry.date.getMonth() + 1)}`;
    const label = zoom === "year" ? String(year) : `${year}.${pad(entry.date.getMonth() + 1)}`;
    let group = byKey.get(key);
    if (!group) {
      group = { key, label, entries: [] };
      byKey.set(key, group);
    }
    group.entries.push(entry);
  }
  return [...byKey.values()];
}

/**
 * Pick up to `n` representatives, preferring entries that have images, while
 * keeping the original (date) order for both shown and hidden lists.
 */
function pickRepresentatives(
  entries: DiaryEntry[],
  n: number
): { shown: DiaryEntry[]; hidden: DiaryEntry[] } {
  const withImages = entries.filter((e) => e.images.length > 0);
  const withoutImages = entries.filter((e) => e.images.length === 0);
  const selected = new Set([...withImages, ...withoutImages].slice(0, n));
  return {
    shown: entries.filter((e) => selected.has(e)),
    hidden: entries.filter((e) => !selected.has(e)),
  };
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
