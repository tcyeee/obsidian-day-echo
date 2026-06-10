import { App, TFile, getAllTags } from "obsidian";
import { DiaryEntry } from "../types";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// Matches both Obsidian embeds `![[file]]` and markdown images `![alt](url)`.
const IMG_RE = /!\[\[([^\]]+?)\]\]|!\[[^\]]*\]\(([^)\s]+)[^)]*\)/g;

/**
 * Parsed entries keyed by file path, tagged with the mtime they were parsed at.
 * Lets a rescan skip the regex/plain-text work for files that have not changed.
 */
const parseCache = new Map<string, { mtime: number; entry: DiaryEntry }>();

/** Scan the daily folder and return parsed entries sorted newest-first. */
export async function scanDiaries(app: App, folder: string): Promise<DiaryEntry[]> {
  const prefix = folder ? folder.replace(/\/+$/, "") + "/" : "";
  const files = app.vault
    .getMarkdownFiles()
    .filter((f) => !prefix || f.path.startsWith(prefix));

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

  entries.sort((a, b) => b.date.getTime() - a.date.getTime());
  return entries;
}

/** Resolve the entry date from the filename, falling back to frontmatter `created`. */
function entryDate(app: App, file: TFile): Date | null {
  const m = DATE_RE.exec(file.basename);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (!isNaN(d.getTime())) return d;
  }
  const created = app.metadataCache.getFileCache(file)?.frontmatter?.created;
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

/** Strip markup down to readable plain text (uncapped). */
function toPlainText(body: string): string {
  return body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[\[[^\]]*\]\]/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[\[([^\]]*)\]\]/g, "$1")
    .replace(/[#>*_`~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupe(items: string[]): string[] {
  return [...new Set(items)];
}
