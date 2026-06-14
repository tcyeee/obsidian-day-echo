import type { Messages } from "./en";

/** Simplified Chinese message catalog. Typed against the English key set. */
export const zh: Messages = {
  // Settings tab
  "settings.folder.name": "日记文件夹",
  "settings.folder.desc": "扫描日记的文件夹（相对于库的根目录）。",
  "settings.folder.placeholder": "daily",
  "settings.oldestFirst.name": "最早在前",
  "settings.oldestFirst.desc": "默认排序方向。关闭时最新的日记显示在顶部。",
  "settings.diaryNav.name": "显示日记导航",
  "settings.diaryNav.desc": "在打开的日记顶部显示上一篇 / 下一篇导航条。",
  "settings.language.name": "语言",
  "settings.language.desc": "Day Echo 的显示语言。“自动”跟随 Obsidian 的界面语言。",
  "settings.language.auto": "自动",
  "settings.interactionToday.name": "显示今天的卡片",
  "settings.interactionToday.desc":
    "在未指定日期的 echo-interaction 卡片中显示“今天”的评分卡。",
  "settings.interactionYesterday.name": "显示昨天的卡片",
  "settings.interactionYesterday.desc":
    "在未指定日期的 echo-interaction 卡片中显示“昨天”的评分卡。",

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
  "interaction.energy": "精力",
  "interaction.mood": "心情",
  "interaction.today": "今天",
  "interaction.yesterday": "昨天",
  "interaction.saved": "已保存 ✓",
  "interaction.saveFailed": "保存失败: {error}",
  "interaction.insertMenu": "插入互动卡片",
  "interaction.openSettings": "Day Echo 设置",
};
