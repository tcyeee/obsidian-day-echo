import { describe, expect, test, vi } from "vitest";

// The obsidian package ships only type declarations; stub the values scanner.ts uses.
vi.mock("obsidian", () => ({
  getAllTags: () => [],
  TFile: class {},
}));

import { isImageRef } from "./scanner";

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
