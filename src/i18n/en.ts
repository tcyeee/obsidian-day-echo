/**
 * English message catalog. This file is the source of truth for the set of
 * keys; every other locale's catalog is typed against `typeof en`, so a
 * missing or misspelled key is a compile error.
 *
 * `{name}` placeholders are filled by `t(key, params)`.
 */
export const en = {
  // Settings tab
  "settings.folder.name": "Daily notes folder",
  "settings.folder.desc": "Folder scanned for daily notes (relative to the vault root).",
  "settings.folder.placeholder": "daily",
  "settings.oldestFirst.name": "Oldest first",
  "settings.oldestFirst.desc": "Default sort direction. Off shows the newest entries at the top.",
  "settings.diaryNav.name": "Show diary navigation",
  "settings.diaryNav.desc": "Show a prev/next bar on top of open daily notes.",
  "settings.language.name": "Language",
  "settings.language.desc": "Display language for Day Echo. Auto follows Obsidian's language.",
  "settings.language.auto": "Auto",

  // Timeline view
  "view.empty": "No diary entries.",
  "view.entryCount": "{count} entries",
  "view.stats.title": "My Journey",
  "view.stats.subtitle": "Every sprinkle of joy recorded forever.",
  "view.stats.countLabel": "entries",
  "view.today": "Today",
  "view.todayCta": "Start today's diary",
  "view.createFailed": "Day Echo: failed to create today's note — {error}",

  // Zoom switch (fixed 36px circular pill — single glyph only)
  "zoom.month": "M",
  "zoom.year": "Y",

  // Cards
  "card.openNote": "Open this day's note",
  "card.showMore": "Show more",
  "card.diaryCount": "{count} entries",

  // Diary prev/next nav
  "nav.prev": "Previous",
  "nav.next": "Next",

  // Interaction block
  "interaction.energy": "Energy",
  "interaction.mood": "Mood",
  "interaction.save": "Save",
  "interaction.rateFirst": "Please finish rating first",
  "interaction.saved": "Saved ✓",
  "interaction.saveFailed": "Save failed: {error}",
} as const;

/** The full set of message keys, derived from the English catalog. */
export type MessageKey = keyof typeof en;
/** Shape every locale catalog must satisfy. */
export type Messages = Record<MessageKey, string>;
