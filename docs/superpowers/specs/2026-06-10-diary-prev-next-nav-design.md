# Diary Prev/Next Navigation — Design

Date: 2026-06-10
Status: Approved

## Goal

When a daily note (a file in the configured daily folder named `YYYY-MM-DD.md`) is open in a Markdown view, show a navigation bar at the top of the note with two buttons:

- `← <date>` — jumps to the previous *existing* diary (the nearest older entry, skipping calendar gaps).
- `<date> →` — jumps to the next *existing* diary (the nearest newer entry).

No `.md` file content is ever modified; the bar is rendered dynamically by the Day Echo plugin.

## Decisions (confirmed with user)

- Plugin-rendered injection, not text written into files.
- Bar placed at the top of the note.
- Button labels show the target diary's date (e.g. `← 2024-03-15`).

## Architecture

New module `src/diary-nav.ts` exporting a `DiaryNav` manager owned by `DayEchoPlugin`:

- **Triggers:** listens to `workspace.on("file-open")` and `workspace.on("layout-change")`; also re-renders from the existing debounced vault-change handler in `main.ts` (create/modify/delete/rename inside the daily folder).
- **Injection target:** for every Markdown leaf whose file qualifies, insert a `.day-echo-diary-nav` element as the first child of the view's `.view-content`, above `.markdown-source-view` / `.markdown-reading-view`, so it is visible in both editing and reading modes. One bar per leaf; idempotent re-render (remove old bar before inserting).
- **Prev/next computation:** list Markdown files in the daily folder whose basename matches `^\d{4}-\d{2}-\d{2}$`, sort by basename (lexicographic == chronological for this format), and pick the neighbors of the current file. Non-date files in the folder are ignored.
- **Ends:** at the oldest entry the prev button is hidden; at the newest the next button is hidden. If the bar would have no buttons (sole entry), it is not rendered.
- **Click:** opens the target file in the same leaf via `leaf.openFile`; the subsequent `file-open` event refreshes the bar.
- **Cleanup:** `DiaryNav.detachAll()` removes every injected bar; called on plugin unload and when the setting is turned off.

## Settings

New boolean `showDiaryNav` (default `true`) in `DayEchoSettings`, with a toggle "Show diary navigation" in the settings tab. Turning it off detaches all bars immediately; turning it on re-renders.

## Styling

`styles.css` gains `.day-echo-diary-nav` rules: flex row with space-between, theme variables (`--text-muted`, `--text-accent`, `--background-modifier-hover`), subtle bottom border, small font. No `!important`, 6-digit hex avoided in favor of theme vars.

## Out of scope

- Navigation for non-daily notes or notes dated via frontmatter only.
- Keyboard shortcuts / commands for prev-next (can be added later if wanted).
