import { requestUrl } from "obsidian";

/**
 * IP-based geolocation via ip-api.com (free tier, no key required).
 *
 * Resolves the caller's approximate location from their network IP and returns
 * a "region-city-district" string (English place names) with empty parts
 * omitted, e.g. "Shanghai-Shanghai-Pudong" or, when the district is
 * unavailable, "Shanghai-Shanghai". English keeps frontmatter uniform and easy
 * to parse for card display.
 *
 * Province and city are usually present; district is frequently empty because
 * IP geolocation rarely resolves below city level. When the IP looks like a
 * VPN/proxy or data-center address the lookup reflects the exit node, not the
 * real location, so `proxy` is set and callers can flag it. Any failure
 * (offline, rate limit, lookup miss) resolves to `null` so callers can skip
 * silently.
 */

const ENDPOINT =
  "http://ip-api.com/json/?lang=en&fields=status,message,regionName,city,district,proxy,hosting,lat,lon";

/** Abort the lookup if the network is slow; a diary card click must stay snappy. */
const TIMEOUT_MS = 3000;

interface IpApiResponse {
  status: string;
  message?: string;
  regionName?: string;
  city?: string;
  district?: string;
  proxy?: boolean;
  hosting?: boolean;
  lat?: number;
  lon?: number;
}

export interface GeoResult {
  /** "省-市-区" with empty parts omitted. */
  location: string;
  /** True when the IP is a VPN/proxy/data-center exit — location is unreliable. */
  proxy: boolean;
  /** Latitude of the IP, or null when ip-api omitted it. Used for weather lookup. */
  lat: number | null;
  /** Longitude of the IP, or null when ip-api omitted it. */
  lon: number | null;
}

/** Reject after `ms` so a hung request never blocks the caller indefinitely. */
function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error("geolocation request timed out")), ms)
  );
}

export async function fetchLocation(): Promise<GeoResult | null> {
  try {
    const res = await Promise.race([
      requestUrl({ url: ENDPOINT }),
      timeout(TIMEOUT_MS),
    ]);
    const data = res.json as IpApiResponse;
    if (!data || data.status !== "success") return null;
    const parts = [data.regionName, data.city, data.district]
      .map((p) => (p ?? "").trim())
      .filter((p) => p.length > 0);
    if (!parts.length) return null;
    return {
      location: parts.join("-"),
      proxy: data.proxy === true || data.hosting === true,
      lat: typeof data.lat === "number" ? data.lat : null,
      lon: typeof data.lon === "number" ? data.lon : null,
    };
  } catch {
    return null;
  }
}
