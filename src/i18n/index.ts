import { en, type MessageKey, type Messages } from "./en";
import { zh } from "./zh";

/** Language setting value: explicit locale or `auto` (follow Obsidian). */
export type LanguageSetting = "auto" | "en" | "zh";

const CATALOGS: Record<"en" | "zh", Messages> = { en, zh };

/** Active catalog; defaults to English until `setLocale` runs on load. */
let active: Messages = en;

/**
 * Resolve `auto` to a concrete locale by reading Obsidian's UI language from
 * localStorage (set to a code like "zh" / "zh-TW" / "en"). Anything that
 * isn't Chinese falls back to English.
 */
function resolveAuto(): "en" | "zh" {
  if (typeof window === "undefined") return "en";
  const lang = window.localStorage.getItem("language") ?? "";
  return lang.toLowerCase().startsWith("zh") ? "zh" : "en";
}

/** Switch the active catalog. Call on load and whenever the setting changes. */
export function setLocale(setting: LanguageSetting): void {
  const locale = setting === "auto" ? resolveAuto() : setting;
  active = CATALOGS[locale];
}

/**
 * Look up a message, filling `{name}` placeholders from `params`. Missing keys
 * fall back to English, then to the raw key, so the UI never renders blank.
 */
export function t(
  key: MessageKey,
  params?: Record<string, string | number>
): string {
  let text = active[key] ?? en[key] ?? key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replace(`{${name}}`, String(value));
    }
  }
  return text;
}
