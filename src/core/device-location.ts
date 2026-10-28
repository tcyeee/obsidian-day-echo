/**
 * Device-based geolocation via the browser's Geolocation API.
 *
 * Obsidian desktop is Chromium-based and Obsidian mobile is a WebView, so
 * `navigator.geolocation` is available on both and resolves through the OS's
 * own location service (Wi-Fi/cell/GPS positioning) rather than reading the
 * network's exit IP. That makes it immune to the VPN/proxy misdetection that
 * plagues the IP-based lookup in `geolocation.ts`: a VPN reroutes network
 * traffic, not the OS location service, so this keeps reporting the device's
 * actual position regardless of what the network looks like.
 *
 * Requires the user to grant a location permission prompt; resolves to
 * `null` on denial, timeout, or any platform without the API, so callers can
 * fall back to the IP-based lookup.
 */

/** Generous timeout — a cold GPS/Wi-Fi fix can take a few seconds. */
const TIMEOUT_MS = 8000;

/** Accept a fix up to 10 minutes old; a diary entry doesn't need live tracking. */
const MAX_AGE_MS = 10 * 60 * 1000;

export interface DeviceCoords {
  lat: number;
  lon: number;
}

export async function fetchDeviceCoords(): Promise<DeviceCoords | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: TIMEOUT_MS, maximumAge: MAX_AGE_MS }
    );
  });
}
