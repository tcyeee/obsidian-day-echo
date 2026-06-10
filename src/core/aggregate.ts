import { DiaryEntry, LayoutItem, RenderItem, ZoomLevel } from "../types";

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
 * Merge consecutive cards into a run (one two-column layout block). A fold
 * attaches to the run it follows, so its placeholder card can take a column
 * slot. Headers break a run, so cards never share columns across a group.
 */
export function collectRuns(items: RenderItem[]): LayoutItem[] {
  const out: LayoutItem[] = [];
  const tail = (): LayoutItem | undefined => out[out.length - 1];
  for (const item of items) {
    if (item.kind === "card") {
      const run = tail();
      if (run?.kind === "run" && !run.hidden.length) run.entries.push(item.entry);
      else out.push({ kind: "run", entries: [item.entry], hidden: [] });
    } else if (item.kind === "fold") {
      const run = tail();
      if (run?.kind === "run" && !run.hidden.length) run.hidden = item.hidden;
      else out.push({ kind: "run", entries: [], hidden: item.hidden });
    } else {
      out.push(item);
    }
  }
  return out;
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
