import { afterEach, describe, expect, test, vi } from "vitest";

const requestUrl = vi.fn();

vi.mock("obsidian", () => ({
  requestUrl: (...args: unknown[]) => requestUrl(...args),
}));

import { reverseGeocode } from "./reverse-geocode";

function reply(json: unknown) {
  requestUrl.mockResolvedValueOnce({ json });
}

afterEach(() => {
  requestUrl.mockReset();
});

describe("reverseGeocode", () => {
  test("joins region-city-locality when all present and distinct", async () => {
    reply({ principalSubdivision: "Shanghai", city: "Shanghai", locality: "Pudong" });
    expect(await reverseGeocode(31.22, 121.54)).toBe("Shanghai-Shanghai-Pudong");
  });

  test("omits empty parts", async () => {
    reply({ principalSubdivision: "Beijing", city: "", locality: "" });
    expect(await reverseGeocode(39.9, 116.4)).toBe("Beijing");
  });

  test("returns null when every part is empty", async () => {
    reply({ principalSubdivision: "", city: "", locality: "" });
    expect(await reverseGeocode(0, 0)).toBeNull();
  });

  test("returns null on network error", async () => {
    requestUrl.mockRejectedValueOnce(new Error("offline"));
    expect(await reverseGeocode(31.22, 121.54)).toBeNull();
  });
});
