import { App, TFile, TFolder, getAllTags } from "obsidian";
import { DiaryEntry, PreviewBlock } from "../types";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * All Markdown files within `folder`, collected by walking that folder's
 * subtree rather than enumerating the whole vault. An empty `folder` means the
 * vault root. Returns `[]` when the path is missing or isn't a folder.
 */
export function markdownFilesIn(app: App, folder: string): TFile[] {
  const clean = folder.replace(/\/+$/, "");
  const root = clean
    ? app.vault.getAbstractFileByPath(clean)
    : app.vault.getRoot();
  if (!(root instanceof TFolder)) return [];

  const out: TFile[] = [];
  const walk = (dir: TFolder): void => {
    for (const child of dir.children) {
      if (child instanceof TFolder) walk(child);
      else if (child instanceof TFile && child.extension === "md") out.push(child);
    }
  };
  walk(root);
  return out;
}

// Matches both Obsidian embeds `![[file]]` and markdown images `![alt](url)`.
const IMG_RE = /!\[\[([^\]]+?)\]\]|!\[[^\]]*\]\(([^)\s]+)[^)]*\)/g;

/**
 * Parsed entries keyed by file path, tagged with the mtime they were parsed at.
 * Lets a rescan skip the regex/plain-text work for files that have not changed.
 */
const parseCache = new Map<string, { mtime: number; entry: DiaryEntry }>();

/** Scan the daily folder and return parsed entries sorted newest-first. */
export async function scanDiaries(app: App, folder: string): Promise<DiaryEntry[]> {
  const files = markdownFilesIn(app, folder);

  const entries: DiaryEntry[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    const date = entryDate(app, file);
    if (!date) continue;
    seen.add(file.path);

    const mtime = file.stat.mtime;
    const cached = parseCache.get(file.path);
    if (cached && cached.mtime === mtime) {
      entries.push(cached.entry);
      continue;
    }

    const cache = app.metadataCache.getFileCache(file);
    const tags = dedupe((cache ? getAllTags(cache) ?? [] : []).filter(
      (t) => t.toLowerCase() !== "#daily"
    ));

    const content = await app.vault.cachedRead(file);
    const body = stripFrontmatter(content);
    const plain = toPlainText(body);

    const entry: DiaryEntry = {
      date,
      file,
      previewText: plain.slice(0, 400),
      previewBlocks: parsePreviewBlocks(body),
      searchText: plain.toLowerCase(),
      images: extractImages(body, app, file),
      tags,
    };
    parseCache.set(file.path, { mtime, entry });
    entries.push(entry);
  }

  // Drop cache entries for files that were deleted, renamed, or fell out of scope.
  for (const path of parseCache.keys()) {
    if (!seen.has(path)) parseCache.delete(path);
  }

  // Hide notes that are empty apart from frontmatter: an auto-created daily
  // may carry only recorded weather/location properties with no diary written
  // yet, and those should not surface as timeline cards.
  const visible = entries.filter((e) => !isEmptyEntry(e));
  visible.sort((a, b) => b.date.getTime() - a.date.getTime());
  return visible;
}

/**
 * True when a note has no body content — no preview text and no images. Such a
 * note exists only as frontmatter/properties (e.g. the weather and geolocation
 * recorded on a freshly created daily), which `stripFrontmatter` removes before
 * the preview is built, so it is skipped rather than shown as a blank card.
 */
export function isEmptyEntry(entry: DiaryEntry): boolean {
  return entry.previewText.length === 0 && entry.images.length === 0;
}

/** Resolve the entry date from the filename, falling back to frontmatter `created`. */
function entryDate(app: App, file: TFile): Date | null {
  const m = DATE_RE.exec(file.basename);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (!isNaN(d.getTime())) return d;
  }
  const created = app.metadataCache.getFileCache(file)?.frontmatter?.["created"] as string | undefined;
  if (created) {
    const d = new Date(String(created).replace(" ", "T"));
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

/** Drop a leading YAML frontmatter block, returning the note body. */
export function stripFrontmatter(content: string): string {
  if (!content.startsWith("---")) return content;
  const close = content.indexOf("\n---", 3);
  if (close === -1) return content;
  const nl = content.indexOf("\n", close + 1);
  return nl === -1 ? "" : content.slice(nl + 1);
}

/** Extensions an <img> tag can render; embeds of anything else (mp4, mov, m4a…) are skipped. */
const IMAGE_EXTS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif", "jfif",
]);

/** True if the embed target is renderable as an image. Extensionless URLs pass. */
export function isImageRef(raw: string): boolean {
  const m = /\.([a-z0-9]+)(?:[?#]|$)/i.exec(raw);
  return !m || IMAGE_EXTS.has(m[1].toLowerCase());
}

/** Collect resolved image URLs from the body in order of appearance. */
function extractImages(body: string, app: App, file: TFile): string[] {
  const out: string[] = [];
  IMG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = IMG_RE.exec(body)) !== null) {
    const raw = m[1] !== undefined ? m[1].split("|")[0].trim() : m[2].trim();
    if (!isImageRef(raw)) continue;
    const src = resolveImage(raw, app, file);
    if (src) out.push(src);
  }
  return out;
}

/** Turn a raw image reference into a renderable resource URL, or null if unresolved. */
function resolveImage(raw: string, app: App, file: TFile): string | null {
  if (/^https?:\/\//.test(raw)) return raw;
  const cleaned = raw.replace(/^\//, "");

  let target = app.vault.getAbstractFileByPath(safeDecode(cleaned));
  if (!(target instanceof TFile)) {
    target = app.metadataCache.getFirstLinkpathDest(cleaned, file.path);
  }
  return target instanceof TFile ? app.vault.getResourcePath(target) : null;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Drop fenced code blocks and image embeds, shared by the preview parsers below. */
function stripCodeAndImages(body: string): string {
  return body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[\[[^\]]*\]\]/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ");
}

/**
 * Strip markup down to readable plain text (uncapped), preserving line breaks
 * so the timeline preview keeps the note's paragraph structure. Horizontal
 * whitespace is collapsed and blank lines are flattened to a single break.
 */
function toPlainText(body: string): string {
  return stripCodeAndImages(body)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[\[([^\]]*)\]\]/g, "$1")
    .replace(/[#>*_`~]/g, " ")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

// Recognized at the start of a line; captures the list marker's text content.
const TASK_LINE_RE = /^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/;
const BULLET_LINE_RE = /^\s*[-*+]\s+(.*)$/;
const ORDERED_LINE_RE = /^\s*\d+[.)]\s+(.*)$/;

/** Total characters of list/paragraph content a card preview will parse. */
const PREVIEW_CHAR_BUDGET = 400;

/** Clean a single line's inline markdown down to plain text. */
function sanitizeInline(line: string): string {
  return line
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[\[([^\]]*)\]\]/g, "$1")
    .replace(/[#>*_`~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse the note body into paragraph/list blocks for the collapsed card, so
 * bullet, numbered, and task list syntax render as real markup instead of raw
 * dashes/digits/brackets. Stops once `PREVIEW_CHAR_BUDGET` characters of
 * content have been collected, mirroring the `previewText` cap.
 */
export function parsePreviewBlocks(body: string): PreviewBlock[] {
  const blocks: PreviewBlock[] = [];
  let budget = PREVIEW_CHAR_BUDGET;
  let currentP: string[] | null = null;

  const flushParagraph = (): void => {
    if (currentP && currentP.length) blocks.push({ type: "p", text: currentP.join("\n") });
    currentP = null;
  };

  for (const line of stripCodeAndImages(body).split("\n")) {
    if (budget <= 0) break;
    if (!line.trim()) continue; // blank lines are insignificant, like in toPlainText

    let m: RegExpExecArray | null;
    const last = blocks[blocks.length - 1];
    if ((m = TASK_LINE_RE.exec(line))) {
      flushParagraph();
      const text = sanitizeInline(m[2]);
      const checked = m[1].toLowerCase() === "x";
      budget -= text.length;
      if (last?.type === "task") last.items.push({ text, checked });
      else blocks.push({ type: "task", items: [{ text, checked }] });
    } else if ((m = BULLET_LINE_RE.exec(line))) {
      flushParagraph();
      const text = sanitizeInline(m[1]);
      budget -= text.length;
      if (last?.type === "ul") last.items.push(text);
      else blocks.push({ type: "ul", items: [text] });
    } else if ((m = ORDERED_LINE_RE.exec(line))) {
      flushParagraph();
      const text = sanitizeInline(m[1]);
      budget -= text.length;
      if (last?.type === "ol") last.items.push(text);
      else blocks.push({ type: "ol", items: [text] });
    } else {
      const text = sanitizeInline(line);
      if (!text) continue;
      budget -= text.length;
      (currentP ??= []).push(text);
    }
  }
  flushParagraph();
  return blocks;
}

function dedupe(items: string[]): string[] {
  return [...new Set(items)];
}
