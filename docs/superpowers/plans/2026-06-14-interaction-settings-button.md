# echo-interaction Settings Button + Day Toggles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a gear button beside the native "Edit this block" button that opens the plugin settings, and drive the interaction card's day selection from two settings toggles (with the inline `date:` config kept as an optional override).

**Architecture:** Pure day-resolution logic is extracted into an obsidian-free module (`src/core/interaction-days.ts`) so it is unit-testable without mocking. The settings tab gains two toggles. The interaction block reads those toggles when no inline `date:` is present, and injects a settings button next to Obsidian's asynchronously-added `.edit-block-button` via a `MutationObserver`.

**Tech Stack:** TypeScript (strictNullChecks), Obsidian plugin API, vitest. Build via `pnpm build`; tests via `pnpm test`.

---

## File Structure

- **Create** `src/core/interaction-days.ts` — pure token-resolution logic (`BlockConfig`, `parseDates`, `resolveTokens`). No runtime obsidian import.
- **Create** `src/core/interaction-days.test.ts` — unit tests for the above.
- **Modify** `src/i18n/en.ts` — new message keys (source-of-truth catalog).
- **Modify** `src/i18n/zh.ts` — matching Chinese keys.
- **Modify** `src/settings.ts` — two new boolean settings + two toggles in `buildUI()`.
- **Modify** `src/ui/interaction-block.ts` — use `resolveTokens`; inject the settings button.
- **Modify** `styles.css` — `.ei-settings-btn` styling.

Notes on the test environment: existing passing tests (`weather.test.ts`, `geolocation.test.ts`) use `vi.mock("obsidian", …)`. Two checked-in test files (`diary-nav.test.ts`, `i18n.test.ts`) currently fail to load because they import modules that `import` obsidian at runtime without mocking it — that is a **pre-existing** failure, unrelated to this work. The new `interaction-days.ts` module deliberately imports nothing from obsidian, so `interaction-days.test.ts` runs cleanly with no mock.

---

## Task 1: i18n keys

**Files:**
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/zh.ts`

- [ ] **Step 1: Add English keys**

In `src/i18n/en.ts`, inside the `en` object. Add to the "Settings tab" group (after the `settings.language.auto` line):

```ts
  "settings.interactionToday.name": "Show today's card",
  "settings.interactionToday.desc":
    "Show the today rating card in echo-interaction blocks that don't specify their own dates.",
  "settings.interactionYesterday.name": "Show yesterday's card",
  "settings.interactionYesterday.desc":
    "Show the yesterday rating card in echo-interaction blocks that don't specify their own dates.",
```

And add to the "Interaction block" group (after the `interaction.insertMenu` line):

```ts
  "interaction.openSettings": "Day Echo settings",
```

- [ ] **Step 2: Add Chinese keys**

In `src/i18n/zh.ts`, inside the `zh` object. Add to the "Settings tab" group (after the `settings.language.auto` line):

```ts
  "settings.interactionToday.name": "显示今天的卡片",
  "settings.interactionToday.desc":
    "在未指定日期的 echo-interaction 卡片中显示“今天”的评分卡。",
  "settings.interactionYesterday.name": "显示昨天的卡片",
  "settings.interactionYesterday.desc":
    "在未指定日期的 echo-interaction 卡片中显示“昨天”的评分卡。",
```

And add to the "Interaction block" group (after the `interaction.insertMenu` line):

```ts
  "interaction.openSettings": "Day Echo 设置",
```

- [ ] **Step 3: Type-check**

Run: `npx tsc -noEmit -skipLibCheck`
Expected: no errors. (`zh` is typed as `Messages`, so a missing/extra key here is a compile error.)

- [ ] **Step 4: Commit**

```bash
git add src/i18n/en.ts src/i18n/zh.ts
git commit -m "feat(i18n): add interaction toggle and settings-button strings"
```

---

## Task 2: Settings fields + toggles

**Files:**
- Modify: `src/settings.ts`

- [ ] **Step 1: Add fields to the settings interface**

In `src/settings.ts`, add to the `DayEchoSettings` interface (after the `recordLocation` field, before `language`):

```ts
  /** Show today's card in echo-interaction blocks without an explicit date. */
  interactionToday: boolean;
  /** Show yesterday's card in echo-interaction blocks without an explicit date. */
  interactionYesterday: boolean;
```

- [ ] **Step 2: Add defaults**

In `DEFAULT_SETTINGS`, add (after `recordLocation: true,`):

```ts
  interactionToday: true,
  interactionYesterday: true,
```

- [ ] **Step 3: Add the two toggles to the UI**

In `buildUI()`, after the existing location `Setting` block (the one ending at the `recordLocation` toggle), append:

```ts
    new Setting(containerEl)
      .setName(t("settings.interactionToday.name"))
      .setDesc(t("settings.interactionToday.desc"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.interactionToday)
          .onChange(async (value) => {
            this.plugin.settings.interactionToday = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t("settings.interactionYesterday.name"))
      .setDesc(t("settings.interactionYesterday.desc"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.interactionYesterday)
          .onChange(async (value) => {
            this.plugin.settings.interactionYesterday = value;
            await this.plugin.saveSettings();
          })
      );
```

- [ ] **Step 4: Type-check**

Run: `npx tsc -noEmit -skipLibCheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/settings.ts
git commit -m "feat(settings): add today/yesterday interaction card toggles"
```

---

## Task 3: Extract day-resolution logic (TDD)

**Files:**
- Create: `src/core/interaction-days.ts`
- Test: `src/core/interaction-days.test.ts`
- Modify: `src/ui/interaction-block.ts`

- [ ] **Step 1: Write the failing test**

Create `src/core/interaction-days.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { parseDates, resolveTokens } from "./interaction-days";

const enabled = (today: boolean, yesterday: boolean) => ({ today, yesterday });

describe("parseDates", () => {
  test("defaults to today + yesterday when empty", () => {
    expect(parseDates(undefined)).toEqual(["today", "yesterday"]);
    expect(parseDates("")).toEqual(["today", "yesterday"]);
  });

  test("splits a comma-separated string and trims", () => {
    expect(parseDates("today, 2026-06-10")).toEqual(["today", "2026-06-10"]);
  });

  test("accepts an array and drops duplicates", () => {
    expect(parseDates(["today", "today", "yesterday"])).toEqual([
      "today",
      "yesterday",
    ]);
  });
});

describe("resolveTokens", () => {
  test("inline string date overrides settings", () => {
    expect(resolveTokens({ date: "2026-06-10" }, enabled(false, false))).toEqual([
      "2026-06-10",
    ]);
  });

  test("inline array date overrides settings", () => {
    expect(
      resolveTokens({ date: ["today", "yesterday"] }, enabled(false, false))
    ).toEqual(["today", "yesterday"]);
  });

  test("no inline date: both toggles on -> today + yesterday", () => {
    expect(resolveTokens({}, enabled(true, true))).toEqual([
      "today",
      "yesterday",
    ]);
  });

  test("no inline date: only today", () => {
    expect(resolveTokens({}, enabled(true, false))).toEqual(["today"]);
  });

  test("no inline date: both off -> empty", () => {
    expect(resolveTokens({}, enabled(false, false))).toEqual([]);
  });

  test("empty `date:` (null) falls back to settings", () => {
    expect(
      resolveTokens({ date: null as unknown as string }, enabled(true, false))
    ).toEqual(["today"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/core/interaction-days.test.ts`
Expected: FAIL — cannot find module `./interaction-days`.

- [ ] **Step 3: Create the module**

Create `src/core/interaction-days.ts`:

```ts
/**
 * Pure day-token resolution for the echo-interaction block. Kept free of any
 * runtime `obsidian` import so it can be unit-tested without mocking.
 */

export interface BlockConfig {
  date?: string | string[];
}

/** Which built-in days to show when a block has no explicit `date:`. */
export interface EnabledDays {
  today: boolean;
  yesterday: boolean;
}

/**
 * Normalize the `date` config into an ordered list of tokens. Accepts a YAML
 * array (`[today, yesterday]`), a comma-separated string (`today, yesterday`),
 * or a single token. Defaults to today + yesterday. Duplicates are dropped.
 */
export function parseDates(date: string | string[] | undefined): string[] {
  let tokens: string[];
  if (Array.isArray(date)) {
    tokens = date.map((d) => String(d).trim());
  } else if (typeof date === "string" && date.trim()) {
    tokens = date.split(",").map((d) => d.trim());
  } else {
    tokens = ["today", "yesterday"];
  }
  tokens = tokens.filter(Boolean);
  if (tokens.length === 0) tokens = ["today", "yesterday"];
  return [...new Set(tokens)];
}

/**
 * Resolve the day tokens a block should render. An inline `date:` always wins
 * (override). Otherwise the list is built from the user's settings toggles,
 * which may be empty (block renders nothing).
 */
export function resolveTokens(config: BlockConfig, enabled: EnabledDays): string[] {
  if (config.date != null) {
    return parseDates(config.date);
  }
  const tokens: string[] = [];
  if (enabled.today) tokens.push("today");
  if (enabled.yesterday) tokens.push("yesterday");
  return tokens;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/core/interaction-days.test.ts`
Expected: PASS (all assertions green).

- [ ] **Step 5: Wire the module into the interaction block**

In `src/ui/interaction-block.ts`:

Replace the obsidian import line (line 1):

```ts
import { Notice, TFile, normalizePath, parseYaml, setIcon } from "obsidian";
```

Add an import below the existing `formatDate` import:

```ts
import { BlockConfig, parseDates, resolveTokens } from "../core/interaction-days";
```

Delete the local `BlockConfig` interface (the `interface BlockConfig { date?: string | string[]; }` block near the top).

Delete the local `parseDates` function (the whole `function parseDates(...) { ... }` block, including its doc comment).

In `renderBlock`, replace:

```ts
  const config = parseConfig(source);
  const tokens = parseDates(config.date);
```

with:

```ts
  const config = parseConfig(source);
  const tokens = resolveTokens(config, {
    today: plugin.settings.interactionToday,
    yesterday: plugin.settings.interactionYesterday,
  });
```

- [ ] **Step 6: Type-check and run all tests**

Run: `npx tsc -noEmit -skipLibCheck && npx vitest run src/core/interaction-days.test.ts`
Expected: no type errors; tests PASS. (`parseConfig` still returns `BlockConfig`, now imported.)

- [ ] **Step 7: Commit**

```bash
git add src/core/interaction-days.ts src/core/interaction-days.test.ts src/ui/interaction-block.ts
git commit -m "feat(interaction): drive day selection from settings with inline override"
```

---

## Task 4: Settings button beside the edit-block button

**Files:**
- Modify: `src/ui/interaction-block.ts`
- Modify: `styles.css`

This task uses the **dom-inject** skill for the injection mechanics. Invoke it before writing the injection code.

- [ ] **Step 1: Add the injection function**

In `src/ui/interaction-block.ts`, add this function (place it near `renderBlock`):

```ts
/**
 * Add a gear button immediately to the left of Obsidian's native
 * "Edit this block" button. That button is appended asynchronously as a
 * sibling of our rendered element, so we look for it now and, failing that,
 * watch the parent until it appears. No-ops gracefully if it never does.
 */
function injectSettingsButton(plugin: DayEchoPlugin, el: HTMLElement): void {
  const tryInject = (): boolean => {
    const parent = el.parentElement;
    const editBtn =
      parent?.querySelector(":scope > .edit-block-button") ??
      el.querySelector(":scope > .edit-block-button");
    if (!(editBtn instanceof HTMLElement)) return false;
    // Don't double-inject if this element gets reprocessed.
    if (
      editBtn.previousElementSibling instanceof HTMLElement &&
      editBtn.previousElementSibling.hasClass("ei-settings-btn")
    ) {
      return true;
    }
    const btn = createEl("button", { cls: "ei-settings-btn clickable-icon" });
    setIcon(btn, "settings");
    btn.setAttribute("aria-label", t("interaction.openSettings"));
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      // `app.setting` is outside the public API.
      const setting = (plugin.app as unknown as {
        setting: { open(): void; openTabById(id: string): void };
      }).setting;
      setting.open();
      setting.openTabById(plugin.manifest.id);
    });
    editBtn.parentElement?.insertBefore(btn, editBtn);
    return true;
  };

  if (tryInject()) return;

  const parent = el.parentElement;
  if (!parent) return;
  const observer = new MutationObserver(() => {
    if (tryInject()) observer.disconnect();
  });
  observer.observe(parent, { childList: true });
  // Safety valve: stop watching after a few seconds.
  window.setTimeout(() => observer.disconnect(), 5000);
}
```

- [ ] **Step 2: Call it from `renderBlock`**

In `renderBlock`, after `el.addClass("ei-block");`, add:

```ts
  injectSettingsButton(plugin, el);
```

(Place it right after `el.addClass("ei-block");` so the button is injected whenever the block has content to show.)

- [ ] **Step 3: Add CSS**

Append to `styles.css`:

```css
.ei-settings-btn.clickable-icon {
  position: absolute;
  top: var(--size-4-2, 8px);
  /* Sit just left of the native edit-block button. */
  right: calc(var(--size-4-2, 8px) + var(--size-4-9, 36px));
  opacity: 0;
  transition: opacity 0.15s ease;
  cursor: pointer;
  z-index: var(--layer-popover, 30);
}

.markdown-reading-view .markdown-preview-section:hover > div:hover .ei-settings-btn.clickable-icon,
.edit-block-button:hover + .ei-settings-btn.clickable-icon,
.ei-settings-btn.clickable-icon:hover {
  opacity: 1;
}
```

- [ ] **Step 4: Type-check and build**

Run: `pnpm build`
Expected: `tsc` passes and esbuild produces `main.js`.

- [ ] **Step 5: Deploy to the vault and verify manually**

Deploy per the user's global instructions:

```bash
pnpm build
PLUGIN_DIR="/Users/tcyeee/Library/Mobile Documents/iCloud~md~obsidian/Documents/Lucas/.obsidian/plugins/day-echo"
mkdir -p "$PLUGIN_DIR"
cp main.js manifest.json styles.css "$PLUGIN_DIR/"
```

Then in Obsidian (hot-reload picks up the change), verify against these acceptance criteria:

1. An empty `​```echo-interaction```​` block renders today + yesterday cards (both toggles default on).
2. Turning off "Show yesterday's card" in settings, then reopening/re-rendering the note, shows only today.
3. A block with an explicit `date: 2026-06-10` still renders that date regardless of the toggles (override).
4. Hovering the block reveals a gear button immediately to the **left** of the native pencil "Edit this block" button.
5. Clicking the gear opens the Day Echo settings tab.

If the gear's position or hover-reveal needs adjusting (offset, the reveal selector in Step 3), tune the CSS using the **dom-inject** skill's technique of inspecting the live DOM, then re-deploy. Acceptance is criteria 1–5 all passing.

- [ ] **Step 6: Commit**

```bash
git add src/ui/interaction-block.ts styles.css
git commit -m "feat(interaction): add settings button beside the edit-block button"
```

---

## Task 5: Final verification

- [ ] **Step 1: Full type-check, tests, and build**

Run: `npx tsc -noEmit -skipLibCheck && pnpm test && pnpm build`
Expected: no type errors; `interaction-days.test.ts`, `weather.test.ts`, `geolocation.test.ts` pass (the pre-existing `diary-nav.test.ts` / `i18n.test.ts` load failures are unchanged by this work); build succeeds.

- [ ] **Step 2: Confirm deployment**

Confirm `main.js`, `manifest.json`, `styles.css` are present in the vault plugin dir and all five acceptance criteria from Task 4 Step 5 hold.

---

## Self-Review

- **Spec coverage:** settings fields + toggles (Task 2), day selection w/ inline override (Task 3), settings button beside edit button (Task 4), i18n keys (Task 1), manual testing (Task 4 Step 5 / Task 5). Live re-render explicitly out of scope per spec — not planned. ✓
- **Type consistency:** `resolveTokens(config: BlockConfig, enabled: EnabledDays)` used identically in module, test, and `renderBlock` call. `parseDates` signature unchanged from the original. Settings keys `interactionToday` / `interactionYesterday` consistent across interface, defaults, UI, and `renderBlock`. ✓
- **No placeholders:** all steps contain concrete code/commands. The Task 4 CSS reveal selector is a documented best-guess with an explicit vault-tuning step and pass/fail acceptance criteria, not a vague TODO. ✓
