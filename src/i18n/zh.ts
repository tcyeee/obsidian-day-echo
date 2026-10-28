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
    "创建今天的日记时，优先使用设备自带的定位服务获取坐标（会弹出定位权限请求），再通过 bigdatacloud.net 反查城市名；仅当定位不可用或被拒绝时，才回退到基于 IP 的 ip-api.com 查询——设备定位不会像 IP 查询那样被 VPN 误导。同时会记录当天天气与温湿度（来自 open-meteo.com），并用实测值回填昨天日记的天气。需要联网。",
  "settings.showLocationCard.name": "在日记中显示位置天气卡片",
  "settings.showLocationCard.desc":
    "创建日记时自动在正文中插入一个 echo-location 卡片，展示已记录的城市与天气，并提供「重新定位」按钮和手动修改城市的入口。关闭后仍会写入 frontmatter，只是不自动插入卡片；随时可以从编辑器右键菜单手动插入。",
  "settings.locationOverride.name": "手动指定城市",
  "settings.locationOverride.desc":
    "填写后将直接作为城市写入日记，不再使用自动识别的结果——适合自动识别始终出错时使用（例如 VPN 环境下设备定位也不可用）。天气仍会使用自动识别到的坐标，不受这里的文本影响。",
  "settings.locationOverride.placeholder": "例如：上海-上海",
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
  "view.writeNote": "写笔记",

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

  // Location & weather card
  "location.title": "位置与天气",
  "location.relocate": "重新定位",
  "location.relocating": "定位中…",
  "location.relocateFailed": "重新定位失败，请检查网络连接或定位权限。",
  "location.editAria": "修改城市",
  "location.noLocation": "尚未记录位置",
  "location.noWeather": "尚未记录天气",
  "location.insertMenu": "插入位置天气卡片",

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
