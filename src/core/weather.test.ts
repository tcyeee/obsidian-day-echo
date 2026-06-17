import { afterEach, describe, expect, test, vi } from "vitest";

const requestUrl = vi.fn();

vi.mock("obsidian", () => ({
  requestUrl: (...args: unknown[]) => requestUrl(...args),
}));

import { describeCode, fetchWeather } from "./weather";

function reply(json: unknown) {
  requestUrl.mockResolvedValueOnce({ json });
}

/** A 24-hour humidity series whose mean is exactly `value`. */
function flatHumidity(value: number): number[] {
  return Array.from({ length: 24 }, () => value);
}

afterEach(() => {
  requestUrl.mockReset();
});

describe("describeCode", () => {
  test("maps known WMO codes to English labels", () => {
    expect(describeCode(0)).toBe("Clear");
    expect(describeCode(2)).toBe("Partly cloudy");
    expect(describeCode(95)).toBe("Thunderstorm");
  });

  test("falls back for unknown codes", () => {
    expect(describeCode(7)).toBe("Unknown");
  });
});

describe("fetchWeather", () => {
  test("summarizes a day's forecast with rounded values", async () => {
    reply({
      daily: {
        weather_code: [2],
        temperature_2m_max: [25.6],
        temperature_2m_min: [17.8],
      },
      hourly: { relative_humidity_2m: flatHumidity(64.4) },
    });
    expect(await fetchWeather(31.22, 121.54, "today")).toEqual({
      condition: "Partly cloudy",
      tempHigh: 26,
      tempLow: 18,
      humidity: 64,
    });
  });

  test("averages the hourly humidity series", async () => {
    reply({
      daily: {
        weather_code: [0],
        temperature_2m_max: [10],
        temperature_2m_min: [2],
      },
      hourly: { relative_humidity_2m: [40, 60, 80] },
    });
    const result = await fetchWeather(0, 0, "yesterday");
    expect(result?.humidity).toBe(60);
    expect(result?.condition).toBe("Clear");
  });

  test("requests past_days for the yesterday window", async () => {
    reply({
      daily: { weather_code: [3], temperature_2m_max: [9], temperature_2m_min: [1] },
      hourly: { relative_humidity_2m: flatHumidity(70) },
    });
    await fetchWeather(31.22, 121.54, "yesterday");
    const url = requestUrl.mock.calls[0][0].url as string;
    expect(url).toContain("past_days=1");
    expect(url).toContain("forecast_days=0");
  });

  test("requests only today for the today window", async () => {
    reply({
      daily: { weather_code: [3], temperature_2m_max: [9], temperature_2m_min: [1] },
      hourly: { relative_humidity_2m: flatHumidity(70) },
    });
    await fetchWeather(31.22, 121.54, "today");
    const url = requestUrl.mock.calls[0][0].url as string;
    expect(url).toContain("past_days=0");
    expect(url).toContain("forecast_days=1");
  });

  test("returns null when a daily field is missing", async () => {
    reply({
      daily: { weather_code: [2], temperature_2m_max: [25] },
      hourly: { relative_humidity_2m: flatHumidity(60) },
    });
    expect(await fetchWeather(0, 0, "today")).toBeNull();
  });

  test("returns null when humidity series is empty", async () => {
    reply({
      daily: { weather_code: [2], temperature_2m_max: [25], temperature_2m_min: [18] },
      hourly: { relative_humidity_2m: [] },
    });
    expect(await fetchWeather(0, 0, "today")).toBeNull();
  });

  test("returns null on network error", async () => {
    requestUrl.mockRejectedValueOnce(new Error("offline"));
    expect(await fetchWeather(0, 0, "today")).toBeNull();
  });
});
