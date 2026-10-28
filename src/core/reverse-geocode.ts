import { requestUrl } from "obsidian";

/**
 * Coordinate-based reverse geocoding via BigDataCloud's free client-side API
 * (no key required, built for exactly this browser use case).
 *
 * Turns a latitude/longitude pair into a "region-city-locality" string with
 * empty parts omitted, matching the shape `geolocation.ts`'s IP-based lookup
 * produces so both can feed the same frontmatter field. Used with
 * device-sourced coordinates (see `device-location.ts`), so the result
 * reflects the coordinates given, not the network's exit IP. Place names come
 * back in the requested locale, so a note written under the Chinese locale
 * gets Chinese place names instead of English ones.
 *
 * Any failure (offline, rate limit, malformed response) resolves to `null` so
 * callers can fall back to the IP-based lookup.
 */

const ENDPOINT = "https://api.bigdatacloud.net/data/reverse-geocode-client";

/** Abort the lookup if the network is slow; a diary card click must stay snappy. */
const TIMEOUT_MS = 3000;

interface BigDataCloudResponse {
  principalSubdivision?: string;
  city?: string;
  locality?: string;
}

/** Reject after `ms` so a hung request never blocks the caller indefinitely. */
function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    window.setTimeout(() => reject(new Error("reverse geocode request timed out")), ms)
  );
}

export async function reverseGeocode(
  lat: number,
  lon: number,
  locale: "en" | "zh" = "en"
): Promise<string | null> {
  try {
    const url = `${ENDPOINT}?latitude=${lat}&longitude=${lon}&localityLanguage=${locale}`;
    const res = await Promise.race([requestUrl({ url }), timeout(TIMEOUT_MS)]);
    const data = res.json as BigDataCloudResponse;
    const parts = [data.principalSubdivision, data.city, data.locality]
      .map((p) => (p ?? "").trim())
      .filter((p) => p.length > 0);
    if (!parts.length) return null;
    return parts.join("-");
  } catch {
    return null;
  }
}
