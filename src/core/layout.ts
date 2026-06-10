import { DiaryEntry, RenderItem } from "../types";

/** One card slot in the continuous two-column flow. */
export interface PlannedCard {
  col: 0 | 1;
  entry: DiaryEntry;
  /** Hidden entries behind this card when it renders as a "+N" fold. */
  fold?: DiaryEntry[];
  /** Group key of the fold, used to unfold it on click. */
  foldKey?: string;
}

/** One month/year marker, anchored to its first card. */
export interface PlannedGroup {
  key: string;
  label: string;
  count: number;
  /** Index into `cards` of the group's first card. */
  firstCard: number;
}

export interface TimelinePlan {
  groups: PlannedGroup[];
  cards: PlannedCard[];
}

/**
 * Lay every card out into two continuous columns spanning the whole
 * timeline: each card goes to the column whose estimated height is currently
 * smaller, and group boundaries never break the flow. Groups in `unfolded`
 * flow their hidden entries as plain cards; the rest get one fold card
 * (rendered as a dimmed preview of the first hidden entry).
 */
export function planLayout(
  items: RenderItem[],
  unfolded: ReadonlySet<string>,
  estimate: (entry: DiaryEntry) => number
): TimelinePlan {
  const groups: PlannedGroup[] = [];
  const cards: PlannedCard[] = [];
  const heights = [0, 0];

  const place = (entry: DiaryEntry, fold?: DiaryEntry[], foldKey?: string): void => {
    const col = heights[0] <= heights[1] ? 0 : 1;
    cards.push(fold && foldKey ? { col, entry, fold, foldKey } : { col, entry });
    heights[col] += estimate(entry);
  };

  for (const item of items) {
    if (item.kind === "group") {
      groups.push({
        key: item.key,
        label: item.label,
        count: item.count,
        firstCard: cards.length,
      });
    } else if (item.kind === "card") {
      place(item.entry);
    } else if (unfolded.has(item.key)) {
      for (const entry of item.hidden) place(entry);
    } else {
      place(item.hidden[0], item.hidden, item.key);
    }
  }
  return { groups, cards };
}

/**
 * Keep group markers from overlapping: each top is pushed down to sit at
 * least `minGap` below the previous one. Tops must already be ascending,
 * which they are when markers follow card order.
 */
export function resolveMarkerTops(desired: number[], minGap: number): number[] {
  const out: number[] = [];
  for (const top of desired) {
    const prev = out.length ? out[out.length - 1] : -Infinity;
    out.push(Math.max(top, prev + minGap));
  }
  return out;
}
