import { afterEach, describe, expect, test } from "vitest";

import { fetchDeviceCoords } from "./device-location";

const originalNavigator = globalThis.navigator;

afterEach(() => {
  Object.defineProperty(globalThis, "navigator", {
    value: originalNavigator,
    configurable: true,
  });
});

function stubGeolocation(geolocation: unknown) {
  Object.defineProperty(globalThis, "navigator", {
    value: { ...originalNavigator, geolocation },
    configurable: true,
  });
}

describe("fetchDeviceCoords", () => {
  test("resolves coordinates from a successful fix", async () => {
    stubGeolocation({
      getCurrentPosition: (success: (pos: unknown) => void) =>
        success({ coords: { latitude: 31.22, longitude: 121.54 } }),
    });
    expect(await fetchDeviceCoords()).toEqual({ lat: 31.22, lon: 121.54 });
  });

  test("resolves null when the user denies the permission prompt", async () => {
    stubGeolocation({
      getCurrentPosition: (_success: unknown, error: (err: unknown) => void) =>
        error(new Error("denied")),
    });
    expect(await fetchDeviceCoords()).toBeNull();
  });

  test("resolves null when the Geolocation API is unavailable", async () => {
    stubGeolocation(undefined);
    expect(await fetchDeviceCoords()).toBeNull();
  });
});
