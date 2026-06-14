# echo-interaction: settings button + settings-driven day selection

**Date:** 2026-06-14
**Status:** Approved

## Goal

Two changes to the `echo-interaction` code block:

1. Add a settings button beside Obsidian's native "Edit this block" button (top-right, on hover) that opens this plugin's settings tab.
2. Stop requiring users to write `date: [today, yesterday]` inline. Which days the card shows is configured by two toggles in the settings page. An inline `date:` still works as an optional override.

## Decisions

- **Day picker UI:** two toggles in settings — "Show today's card" / "Show yesterday's card".
- **Inline config:** kept as an optional override. A block with `date:` wins; otherwise day list comes from settings.
- **Button placement:** beside the native `.edit-block-button`, injected immediately to its left, revealed on hover with the same affordance.
- **Live re-render:** out of scope. Toggle changes take effect on the next render of the block (reopen / re-render the note). No live-block registry.

## Design

### 1. Settings fields (`src/settings.ts`)

Add to `DayEchoSettings`, both defaulting to `true` to preserve the current today+yesterday behavior:

```ts
interactionToday: boolean;     // default true
interactionYesterday: boolean; // default true
```

Add two toggles to `buildUI()`, styled like the existing toggles, after the existing entries. Each saves on change via `saveSettings()`.

### 2. Day selection (`src/ui/interaction-block.ts`)

Change how the token list is resolved:

- If the block's parsed config has a `date:` value → use it verbatim (override; current `parseDates` behavior).
- Otherwise → build tokens from settings: include `"today"` if `settings.interactionToday`, `"yesterday"` if `settings.interactionYesterday`.
- If neither toggle is on and there is no inline config → empty list → block renders nothing (existing "nothing to rate" path handles a clean exit).

`parseDates` is refactored to take the plugin/settings so the settings fallback replaces the hardcoded `["today", "yesterday"]` default. Inline-config detection must distinguish "no `date` key" from "empty `date`".

### 3. Settings button (`src/ui/interaction-block.ts` + `styles.css`)

- After rendering the block, locate the native `.edit-block-button`. Obsidian injects it asynchronously as a sibling of `el`, so find it via a `MutationObserver` on the parent (or a deferred lookup), and no-op gracefully if it never appears (unsupported mode).
- Create our button (`.ei-settings-btn`) with a gear icon via `setIcon`, insert it immediately before the native edit button so it shares the same positioning context, offset via CSS to sit just to its left, and reveal on hover matching the edit button.
- Click handler opens the plugin's own settings tab:
  ```ts
  const setting = (plugin.app as any).setting;
  setting.open();
  setting.openTabById(plugin.manifest.id); // "day-echo"
  ```
  `app.setting` is outside the public API, so cast through `any` (kept local and commented).
- Use the **dom-inject** skill for the injection mechanics; verify by building and deploying to the local vault.

### 4. i18n (`src/i18n/en.ts`, `src/i18n/zh.ts`)

New keys (English is the source-of-truth catalog; zh must match the shape):

- `settings.interactionToday.name` / `.desc`
- `settings.interactionYesterday.name` / `.desc`
- `interaction.openSettings` — button tooltip / aria-label

## Testing

- Existing `geolocation.test.ts` / `weather.test.ts` unchanged.
- Manual verification in the vault: empty `echo-interaction` block follows toggles; inline `date:` overrides; settings button appears on hover left of the edit button and opens the settings tab.

## Out of scope

- Live re-render of already-open blocks on toggle change.
- Any new day tokens beyond today/yesterday in settings (inline override still accepts raw dates).
- New dependencies.
