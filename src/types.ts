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

/** A user-defined field's storage format: a ranged number, or a yes/no flag. */
export type FieldType = "number" | "boolean";

/**
 * A user-defined field tracked per day, e.g. "Mood" (number, 1~5) or "Coffee"
 * (boolean). `key` is the frontmatter identifier the value is stored under;
 * `min`/`max` only apply when `type` is `"number"`.
 */
export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  min?: number;
  max?: number;
}

/**
 * A structured chunk of the preview body, parsed well enough to tell
 * paragraphs apart from bullet/numbered/task lists so the collapsed card can
 * render real `<ul>`/`<ol>`/checkbox markup instead of raw list syntax.
 */
export type PreviewBlock =
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "task"; items: { text: string; checked: boolean }[] };

/** One parsed daily note, ready to render on the timeline. */
export interface DiaryEntry {
  /** Date of the entry, used for sorting and node grouping. */
  date: Date;
  /** Source file, opened when the date node is clicked. */
  file: TFile;
  /** Plain-text preview (images/code stripped), capped for the collapsed card. */
  previewText: string;
  /** Structured preview blocks (paragraphs/lists), rendered on the collapsed card. */
  previewBlocks: PreviewBlock[];
  /** Full plain-text body (lowercased), used for searching beyond the preview cap. */
  searchText: string;
  /** Resolved image resource URLs, in order of appearance. */
  images: string[];
  /** Tags on the note (inline + frontmatter), excluding the `#daily` marker. */
  tags: string[];
}
