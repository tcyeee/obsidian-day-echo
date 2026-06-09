import { TFile } from "obsidian";

/** Timeline zoom level: per-day, per-month, or per-year aggregation. */
export type ZoomLevel = "day" | "month" | "year";

/** A unit the timeline renderer draws, produced by `buildItems`. */
export type RenderItem =
  /** Large year divider, used in the day view. */
  | { kind: "year"; year: number }
  /** Month/year group header, used in the aggregated views. */
  | { kind: "group"; key: string; label: string }
  /** A single diary card. */
  | { kind: "card"; entry: DiaryEntry }
  /** A "+N more" placeholder holding the entries hidden from a group. */
  | { kind: "fold"; key: string; hidden: DiaryEntry[] };

/** One parsed daily note, ready to render on the timeline. */
export interface DiaryEntry {
  /** Date of the entry, used for sorting and node grouping. */
  date: Date;
  /** Source file, opened when the date node is clicked. */
  file: TFile;
  /** Plain-text preview (images/code stripped), capped for the collapsed card. */
  previewText: string;
  /** Full plain-text body (lowercased), used for searching beyond the preview cap. */
  searchText: string;
  /** Resolved image resource URLs, in order of appearance. */
  images: string[];
  /** Tags on the note (inline + frontmatter), excluding the `#daily` marker. */
  tags: string[];
}
