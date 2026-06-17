import { requestUrl } from "obsidian";

/**
 * Coordinate-based daily weather via Open-Meteo (free, no API key required).
 *
 * Returns one day's summary — condition, high/low temperature, and mean
 * relative humidity — for a given latitude/longitude. Two windows are
 * supported: `"today"` reads today's forecast (the day is still unfolding, so
 * the high/low are predicted), and `"yesterday"` reads the now-finalized
 * `past_days` record, i.e. what actually happened. Callers back-fill a diary's
 * weather the morning after with the `"yesterday"` window so the note reflects
 * reality rather than the forecast captured when it was first written.
 *
 * Open-Meteo exposes no daily humidity aggregate, so humidity is the rounded
 * mean of that day's hourly `relative_humidity_2m` series. Any failure
 * (offline, bad coordinates, malformed response) resolves to `null` so callers
 * can skip silently. `timezone=auto` aligns the day boundaries to the queried
 * location's local midnight, matching how the diary's date is interpreted.
 */

const ENDPOINT = "https://api.open-meteo.com/v1/forecast";

/** Abort the lookup if the network is slow; recording must stay non-blocking. */
const TIMEOUT_MS = 3000;

export type WeatherWindow = "today" | "yesterday";

export interface WeatherResult {
  /** English condition text, e.g. "Partly cloudy". Kept language-neutral so
   * frontmatter stays uniformly English and easy to parse for card display. */
  condition: string;
  /** Rounded daily high in °C. */
  tempHigh: number;
  /** Rounded daily low in °C. */
  tempLow: number;
  /** Rounded mean relative humidity for the day, in percent. */
  humidity: number;
}

interface OpenMeteoResponse {
  daily?: {
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
  };
  hourly?: {
    relative_humidity_2m?: number[];
  };
}

/** Reject after `ms` so a hung request never blocks the caller indefinitely. */
function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error("weather request timed out")), ms)
  );
}

function buildUrl(lat: number, lon: number, when: WeatherWindow): string {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    daily: "weather_code,temperature_2m_max,temperature_2m_min",
    hourly: "relative_humidity_2m",
    timezone: "auto",
    // "yesterday" pulls the finalized past day and nothing else; "today" pulls
    // just today's forecast. Either way the day we want sits at index 0.
    past_days: when === "yesterday" ? "1" : "0",
    forecast_days: when === "yesterday" ? "0" : "1",
  });
  return `${ENDPOINT}?${params.toString()}`;
}

function mean(values: number[]): number | null {
  const nums = values.filter((v) => typeof v === "number" && !Number.isNaN(v));
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export async function fetchWeather(
  lat: number,
  lon: number,
  when: WeatherWindow
): Promise<WeatherResult | null> {
  try {
    const res = await Promise.race([
      requestUrl({ url: buildUrl(lat, lon, when) }),
      timeout(TIMEOUT_MS),
    ]);
    const data = res.json as OpenMeteoResponse;
    const code = data?.daily?.weather_code?.[0];
    const high = data?.daily?.temperature_2m_max?.[0];
    const low = data?.daily?.temperature_2m_min?.[0];
    const humidity = mean(data?.hourly?.relative_humidity_2m ?? []);
    if (
      typeof code !== "number" ||
      typeof high !== "number" ||
      typeof low !== "number" ||
      humidity === null
    ) {
      return null;
    }
    return {
      condition: describeCode(code),
      tempHigh: Math.round(high),
      tempLow: Math.round(low),
      humidity: Math.round(humidity),
    };
  } catch {
    return null;
  }
}

/**
 * WMO weather interpretation codes Open-Meteo returns, mapped to short English
 * labels. Frontmatter stays uniformly English so a card renderer can read the
 * value directly. Unknown codes fall back to "Unknown" so a note never gets a
 * blank condition.
 */
const WMO: Record<number, string> = {
  0: "Clear",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Rime fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Dense drizzle",
  56: "Freezing drizzle",
  57: "Dense freezing drizzle",
  61: "Slight rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Heavy freezing rain",
  71: "Slight snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  85: "Snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Thunderstorm with heavy hail",
};

export function describeCode(code: number): string {
  return WMO[code] ?? "Unknown";
}
