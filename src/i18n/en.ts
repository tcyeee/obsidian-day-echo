/**
 * English message catalog. This file is the source of truth for the set of
 * keys; every other locale's catalog is typed against `typeof en`, so a
 * missing or misspelled key is a compile error.
 *
 * `{name}` placeholders are filled by `t(key, params)`.
 */
export const en = {
  // Settings tab
  "settings.dailyNotesRequired":
    "Day Echo requires Obsidian's core \"Daily notes\" plugin. Enable it under Settings → Core plugins, then reopen this tab.",
  "settings.section.general": "General",
  "settings.section.basic": "Basic",
  "settings.section.advanced": "Advanced (Beta)",
  "settings.folder.name": "Daily notes folder",
  "settings.folder.desc": "Folder scanned for daily notes. Synced from the core Daily notes plugin's own folder setting.",
  "settings.timelineTitle.name": "Timeline title",
  "settings.timelineTitle.desc": "Title shown above the timeline. Leave blank to use the default.",
  "settings.timelineSubtitle.name": "Timeline subtitle",
  "settings.timelineSubtitle.desc": "Subtitle shown below the title. Leave blank to use the default.",
  "settings.sortOrder.name": "Timeline sort order",
  "settings.sortOrder.newestFirst": "Newest first",
  "settings.sortOrder.oldestFirst": "Oldest first",
  "settings.diaryNav.name": "Show diary bottom navigation",
  "settings.location.name": "Record location and weather on creation",
  "settings.location.desc":
    "When creating today's note, try your device's own location service first (prompts for a location permission), reverse-geocode it via bigdatacloud.net, and fall back to an IP-based lookup via ip-api.com only if that's unavailable or denied — device location isn't fooled by a VPN the way an IP lookup is. Also records today's weather and temperature/humidity from open-meteo.com, and back-fills yesterday's note with its actual weather. Requires a network connection.",
  "settings.showLocationCard.name": "Show location & weather card in notes",
  "settings.showLocationCard.desc":
    "Automatically add an echo-location card to a note when it's created, showing its recorded city and weather with a button to re-detect and a field to edit the city by hand. Turning this off still records to frontmatter, just without the card; you can always insert one manually from the editor's right-click menu.",
  "settings.locationOverride.name": "Manual city override",
  "settings.locationOverride.desc":
    "When set, this is written as the city instead of the detected one — use it if detection still gets it wrong (e.g. a VPN with no usable device location). Weather still uses the detected coordinates, not this text.",
  "settings.locationOverride.placeholder": "e.g. Shanghai-Shanghai",
  "settings.language.name": "Language",
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
  "view.writeNote": "Write a note",

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

  // Location & weather card
  "location.title": "Location & weather",
  "location.relocate": "Re-detect",
  "location.relocating": "Detecting…",
  "location.relocateFailed": "Re-detect failed — check your connection or location permission.",
  "location.editAria": "Edit city",
  "location.noLocation": "No location recorded yet",
  "location.noWeather": "No weather recorded yet",
  "location.insertMenu": "Insert location & weather card",

  // Interaction block
  "interaction.today": "Today",
  "interaction.yesterday": "Yesterday",
  "interaction.saved": "Saved ✓",
  "interaction.saveFailed": "Save failed: {error}",
  "interaction.insertMenu": "Insert echo interaction",
  "interaction.toggleSettings": "Display settings",
  "interaction.settingsLabel": "Show:",
  "interaction.fieldsLabel": "Fields:",
  "interaction.yes": "Yes",
  "interaction.no": "No",

  // Startup
  "notice.dailyNotesRequired":
    "Day Echo needs the core \"Daily notes\" plugin enabled to start.",

  // Settings tab — data fields
  "settings.dataFields.header": "Data fields",
  "settings.dataFields.desc":
    "Define which pieces of data you track per day, and how each is recorded. They show up as selectable fields in the interaction card.",
  "settings.dataFields.addButton": "Add field",
  "settings.dataFields.labelPlaceholder": "Label",
  "settings.dataFields.keyPlaceholder": "key",
  "settings.dataFields.typeNumber": "Number",
  "settings.dataFields.typeBoolean": "Boolean",
  "settings.dataFields.minPlaceholder": "Min",
  "settings.dataFields.maxPlaceholder": "Max",
  "settings.dataFields.deleteAria": "Delete field",
  "settings.dataFields.invalidKey":
    "Field key must start with a letter or underscore and contain only letters, digits, or underscores.",
  "settings.dataFields.duplicateKey":
    "Field key \"{key}\" is already used by another field.",
  "settings.dataFields.invalidRange":
    "Min and max must be whole numbers with min less than max.",
} as const;

/** The full set of message keys, derived from the English catalog. */
export type MessageKey = keyof typeof en;
/** Shape every locale catalog must satisfy. */
export type Messages = Record<MessageKey, string>;
