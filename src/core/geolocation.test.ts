import { afterEach, describe, expect, test, vi } from "vitest";

const requestUrl = vi.fn();

vi.mock("obsidian", () => ({
  requestUrl: (...args: unknown[]) => requestUrl(...args),
}));

import { fetchLocation } from "./geolocation";

function reply(json: unknown) {
  requestUrl.mockResolvedValueOnce({ json });
}

afterEach(() => {
  requestUrl.mockReset();
});

describe("fetchLocation", () => {
  test("joins region-city-district when all present", async () => {
    reply({
      status: "success",
      regionName: "Shanghai",
      city: "Shanghai",
      district: "Pudong",
      lat: 31.22,
      lon: 121.54,
    });
    expect(await fetchLocation()).toEqual({
      location: "Shanghai-Shanghai-Pudong",
      proxy: false,
      lat: 31.22,
      lon: 121.54,
    });
  });

  test("omits empty district", async () => {
    reply({ status: "success", regionName: "Guangdong", city: "Shenzhen", district: "" });
    expect(await fetchLocation()).toEqual({
      location: "Guangdong-Shenzhen",
      proxy: false,
      lat: null,
      lon: null,
    });
  });

  test("trims and drops whitespace-only parts", async () => {
    reply({ status: "success", regionName: " Beijing ", city: "Beijing", district: "  " });
    expect(await fetchLocation()).toEqual({
      location: "Beijing-Beijing",
      proxy: false,
      lat: null,
      lon: null,
    });
  });

  test("flags proxy IPs", async () => {
    reply({ status: "success", regionName: "Tokyo", city: "Tokyo", proxy: true });
    expect(await fetchLocation()).toEqual({
      location: "Tokyo-Tokyo",
      proxy: true,
      lat: null,
      lon: null,
    });
  });

  test("flags hosting / data-center IPs as proxy", async () => {
    reply({ status: "success", regionName: "Virginia", city: "Ashburn", hosting: true });
    expect(await fetchLocation()).toEqual({
      location: "Virginia-Ashburn",
      proxy: true,
      lat: null,
      lon: null,
    });
  });

  test("returns null when the lookup fails", async () => {
    reply({ status: "fail", message: "private range" });
    expect(await fetchLocation()).toBeNull();
  });

  test("returns null when every part is empty", async () => {
    reply({ status: "success", regionName: "", city: "", district: "" });
    expect(await fetchLocation()).toBeNull();
  });

  test("returns null on network error", async () => {
    requestUrl.mockRejectedValueOnce(new Error("offline"));
    expect(await fetchLocation()).toBeNull();
  });
});
