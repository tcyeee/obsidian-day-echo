import { describe, expect, test, vi } from "vitest";

// The obsidian package ships only type declarations; stub the values scanner.ts uses.
vi.mock("obsidian", () => ({
  getAllTags: () => [],
  TFile: class {},
}));

import { isEmptyEntry, isImageRef } from "./scanner";
import type { DiaryEntry } from "../types";

const makeEntry = (over: Partial<DiaryEntry>): DiaryEntry => ({
  date: new Date(2026, 0, 1),
  file: {} as DiaryEntry["file"],
  previewText: "",
  searchText: "",
  images: [],
  tags: [],
  ...over,
});

describe("isEmptyEntry", () => {
  test("empty when the note has neither body text nor images", () => {
    expect(isEmptyEntry(makeEntry({}))).toBe(true);
  });

  test("not empty when the note has body text", () => {
    expect(isEmptyEntry(makeEntry({ previewText: "went for a walk" }))).toBe(false);
  });

  test("not empty when the note has images but no text", () => {
    expect(isEmptyEntry(makeEntry({ images: ["app://vault/photo.png"] }))).toBe(false);
  });

  test("empty when only frontmatter properties (weather/tags) exist", () => {
    // Frontmatter is stripped before previewText, so a note carrying only
    // recorded weather/location or frontmatter tags reads as empty.
    expect(isEmptyEntry(makeEntry({ tags: ["#weather"] }))).toBe(true);
  });
});

describe("isImageRef", () => {
  test("accepts common image extensions", () => {
    expect(isImageRef("assets/photo.png")).toBe(true);
    expect(isImageRef("assets/photo.JPG")).toBe(true);
    expect(isImageRef("assets/photo.jpeg")).toBe(true);
    expect(isImageRef("assets/photo.webp")).toBe(true);
    expect(isImageRef("assets/photo.gif")).toBe(true);
  });

  test("rejects video and audio files", () => {
    expect(isImageRef("assets/iShot_2026-04-18_12.44.35.mp4")).toBe(false);
    expect(isImageRef("assets/IMG_9765.mov")).toBe(false);
    expect(isImageRef("assets/clip.webm")).toBe(false);
    expect(isImageRef("assets/voice.m4a")).toBe(false);
    expect(isImageRef("assets/song.mp3")).toBe(false);
    expect(isImageRef("assets/doc.pdf")).toBe(false);
  });

  test("allows extensionless remote URLs", () => {
    expect(isImageRef("https://example.com/image")).toBe(true);
  });

  test("ignores query strings and fragments after the extension", () => {
    expect(isImageRef("https://example.com/a.png?w=200")).toBe(true);
    expect(isImageRef("https://example.com/a.mp4?t=3")).toBe(false);
  });
});
