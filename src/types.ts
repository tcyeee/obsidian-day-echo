import { TFile } from "obsidian";

/** Timeline zoom level: per-month or per-year aggregation. */
export type ZoomLevel = "month" | "year";

/** A unit the timeline renderer draws, produced by `buildItems`. */
export type RenderItem =
  /** Month/year section header shown on the left of the axis. */
  | { kind: "group"; key: string; label: string; count: number }
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
