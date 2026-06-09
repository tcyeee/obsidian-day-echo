import { TFile } from "obsidian";

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
