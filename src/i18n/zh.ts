import type { Messages } from "./en";

/** Simplified Chinese message catalog. Typed against the English key set. */
export const zh: Messages = {
  // Settings tab
  "settings.dailyNotesRequired":
    "Day Echo 需要启用 Obsidian 的核心插件「日记」。请在 设置 → 核心插件 中启用后，重新打开此设置页。",
  "settings.section.general": "通用",
  "settings.section.basic": "基础",
  "settings.section.advanced": "高级 (Beta)",
  "settings.folder.name": "日记文件夹",
  "settings.folder.desc": "扫描日记的文件夹，与核心「日记」插件的文件夹设置保持同步。",
  "settings.timelineTitle.name": "时间线标题",
  "settings.timelineTitle.desc": "显示在时间线上方的标题，留空则使用默认标题。",
  "settings.timelineSubtitle.name": "时间线副标题",
  "settings.timelineSubtitle.desc": "显示在标题下方的副标题，留空则使用默认副标题。",
  "settings.sortOrder.name": "时间线排序方式",
  "settings.sortOrder.newestFirst": "时间倒序",
  "settings.sortOrder.oldestFirst": "时间正序",
  "settings.diaryNav.name": "显示日记底部导航",
  "settings.location.name": "创建时记录位置与天气",
  "settings.location.desc":
    "创建今天的日记时，通过 IP 查询你所在的城市与坐标并写入 frontmatter，同时记录当天天气与温湿度，并用实测值回填昨天日记的天气。需要联网，会把你的 IP 发送给 ip-api.com，并向 open-meteo.com 查询天气。",
  "settings.language.name": "语言",
  "settings.language.auto": "自动",

  // Timeline view
  "view.empty": "暂无日记。",
  "view.entryCount": "{count} 篇",
  "view.stats.title": "我的旅程",
  "view.stats.subtitle": "每一份点滴喜悦，永远珍藏。",
  "view.stats.countLabel": "篇日记",
  "view.today": "今天",
  "view.todayCta": "开始今天的日记",
  "view.createFailed": "Day Echo: 创建今日日记失败 — {error}",

  // Zoom switch
  "zoom.month": "月",
  "zoom.year": "年",

  // Cards
  "card.openNote": "打开当天的日记",
  "card.showMore": "显示更多",
  "card.diaryCount": "{count} 篇日记",

  // Diary prev/next nav
  "nav.prev": "前一篇",
  "nav.next": "后一篇",

  // Interaction block
  "interaction.today": "今天",
  "interaction.yesterday": "昨天",
  "interaction.saved": "已保存 ✓",
  "interaction.saveFailed": "保存失败: {error}",
  "interaction.insertMenu": "插入互动卡片",
  "interaction.toggleSettings": "显示设置",
  "interaction.settingsLabel": "显示：",
  "interaction.fieldsLabel": "字段：",
  "interaction.yes": "是",
  "interaction.no": "否",

  // Startup
  "notice.dailyNotesRequired": "Day Echo 需要启用核心「日记」插件才能启动。",

  // Settings tab — data fields
  "settings.dataFields.header": "数据字段",
  "settings.dataFields.desc":
    "定义你每天想记录的数据项，以及每项的数据格式。它们会作为可选字段出现在交互卡片中。",
  "settings.dataFields.addButton": "添加字段",
  "settings.dataFields.labelPlaceholder": "名称",
  "settings.dataFields.keyPlaceholder": "key",
  "settings.dataFields.typeNumber": "数字",
  "settings.dataFields.typeBoolean": "布尔",
  "settings.dataFields.minPlaceholder": "最小值",
  "settings.dataFields.maxPlaceholder": "最大值",
  "settings.dataFields.deleteAria": "删除字段",
  "settings.dataFields.invalidKey":
    "字段 key 必须以字母或下划线开头，且只能包含字母、数字、下划线。",
  "settings.dataFields.duplicateKey": "字段 key \"{key}\" 已被其他字段使用。",
  "settings.dataFields.invalidRange": "最小值和最大值必须是整数，且最小值要小于最大值。",
};
