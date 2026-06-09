import { TFile } from "obsidian";

/** One parsed daily note, ready to render on the timeline. */
export interface DiaryEntry {
  /** Date of the entry, used for sorting and node grouping. */
  date: Date;
  /** Source file, opened when the date node is clicked. */
  file: TFile;
  /** Plain-text preview (images/code stripped), for the collapsed card and search. */
  previewText: string;
  /** Resolved image resource URLs, in order of appearance. */
  images: string[];
  /** Tags on the note (inline + frontmatter), excluding the `#daily` marker. */
  tags: string[];
}
