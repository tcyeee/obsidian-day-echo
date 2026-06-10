import { DiaryEntry, RenderItem, ZoomLevel } from "../types";

/**
 * Turn sorted entries into a flat list of render items for the given zoom
 * level. Every level emits section headers (month or year); each group is
 * capped at `n` representatives and the rest is folded.
 */
export function buildItems(
  entries: DiaryEntry[],
  zoom: ZoomLevel,
  n: number
): RenderItem[] {
  const items: RenderItem[] = [];
  for (const group of groupBy(entries, zoom)) {
    items.push({
      kind: "group",
      key: group.key,
      label: group.label,
      count: group.entries.length,
    });
    const { shown, hidden } = pickRepresentatives(group.entries, n);
    for (const entry of shown) items.push({ kind: "card", entry });
    if (hidden.length) items.push({ kind: "fold", key: group.key, hidden });
  }
  return items;
}

/**
 * Put today's entry in its own "今天" section ahead of the grouped flow, so
 * it renders as a regular column card under a dedicated marker. `entries`
 * passed to `buildItems` must already exclude it.
 */
export function prependToday(
  items: RenderItem[],
  today: DiaryEntry | null
): RenderItem[] {
  if (!today) return items;
  return [
    { kind: "group", key: "today", label: "今天", count: 1 },
    { kind: "card", entry: today },
    ...items,
  ];
}

interface Group {
  key: string;
  label: string;
  entries: DiaryEntry[];
}

/** Bucket entries into month or year groups, preserving first-seen order. */
function groupBy(entries: DiaryEntry[], unit: "month" | "year"): Group[] {
  const byKey = new Map<string, Group>();
  for (const entry of entries) {
    const year = entry.date.getFullYear();
    const key =
      unit === "year" ? String(year) : `${year}-${pad(entry.date.getMonth() + 1)}`;
    const label = unit === "year" ? String(year) : `${year}.${pad(entry.date.getMonth() + 1)}`;
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
