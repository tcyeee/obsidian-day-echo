import { describe, expect, test } from "vitest";
import { findNeighbors } from "./diary-nav";

/** Minimal file fixture; findNeighbors only reads `basename`. */
function file(basename: string): { basename: string } {
  return { basename };
}

const names = (fs: { basename: string }[]) => fs.map((f) => f.basename);

describe("findNeighbors", () => {
  test("skips calendar gaps to the nearest existing diaries", () => {
    const files = [file("2020-01-01"), file("2020-03-15"), file("2021-07-09")];
    const { prev, next } = findNeighbors(files, files[1]);
    expect(prev?.basename).toBe("2020-01-01");
    expect(next?.basename).toBe("2021-07-09");
  });

  test("sorts unsorted input by date", () => {
    const files = [file("2021-07-09"), file("2020-01-01"), file("2020-03-15")];
    const { prev, next } = findNeighbors(files, files[2]);
    expect(prev?.basename).toBe("2020-01-01");
    expect(next?.basename).toBe("2021-07-09");
  });

  test("oldest entry has no prev, newest has no next", () => {
    const files = [file("2020-01-01"), file("2020-03-15"), file("2021-07-09")];
    expect(findNeighbors(files, files[0]).prev).toBeNull();
    expect(findNeighbors(files, files[2]).next).toBeNull();
  });

  test("ignores files whose name is not YYYY-MM-DD", () => {
    const files = [
      file("2020-01-01"),
      file("template"),
      file("2020-03-15"),
      file("2020-02-99-draft"),
    ];
    const { prev, next } = findNeighbors(files, files[2]);
    expect(prev?.basename).toBe("2020-01-01");
    expect(next).toBeNull();
    expect(names(files)).toContain("template"); // input untouched
  });

  test("returns nothing when the current file is not date-named", () => {
    const files = [file("2020-01-01"), file("template")];
    const { prev, next } = findNeighbors(files, files[1]);
    expect(prev).toBeNull();
    expect(next).toBeNull();
  });

  test("sole diary has no neighbors", () => {
    const files = [file("2020-01-01")];
    const { prev, next } = findNeighbors(files, files[0]);
    expect(prev).toBeNull();
    expect(next).toBeNull();
  });
});
