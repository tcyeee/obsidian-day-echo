# Changelog

## 0.1.8

- Fixed the diary folder lookup to normalize the path read from the core Daily Notes plugin's settings, so a leading slash (e.g. "/daily") no longer silently breaks the bottom day navigation and timeline scan. 修复日记文件夹路径的读取逻辑，现在会对核心 Daily Notes 插件配置中的路径做归一化处理，避免路径开头带斜杠（如 "/daily"）时静默导致底部日期导航和时间轴扫描失效。

## 0.1.7

- Fixed several more Obsidian submission-bot lint warnings: a direct inline-style assignment in the interaction block's collapse animation (and the `!important` it required to win), unsafe `any` access when writing location/weather data into frontmatter, async settings callbacks passed where a void return was expected, an unnecessary type assertion, and an untyped frontmatter field read. 修复了更多 Obsidian 提交审核机器人告警：互动块收起动画中的直接内联样式赋值（以及因此需要的 `!important`）、向 frontmatter 写入位置/天气数据时对 `any` 值的不安全访问、在期望 void 返回值处传入了 async 设置回调、一处多余的类型断言，以及一处未标注类型的 frontmatter 字段读取。

## 0.1.6

- Added user-editable data fields: define custom number or yes/no fields (beyond the built-in day selection) in settings, with validation for keys and ranges, and they now render as interaction chips in the echo-interaction block. 新增用户自定义数据字段：可在设置中定义自定义的数值或是/否字段（不再局限于内置的日期选择），并对键名和取值范围做校验，这些字段会以互动卡片的形式显示在回声互动块中。
- The interaction block now fades out as a whole once every card is dismissed, instead of the border and settings button disappearing abruptly the instant the last card's own animation finishes. 互动块评完全部卡片后，整个区块会先淡出再折叠，不再是边框和设置按钮在最后一张卡片动画结束的瞬间直接消失。
- Settings tab now uses Obsidian's native declarative setting groups and sub-page instead of hand-rolled collapsible sections. 设置页改用 Obsidian 原生的声明式设置分组与子页面，不再使用手写的可折叠区块。
- Refined the overlaid prev/next diary nav pills' alignment and removed a remaining `!important` from the card-dismiss collapse animation. 优化悬浮上/下篇日记导航胶囊按钮的对齐方式，并移除卡片收起折叠动画中残留的 `!important`。

## 0.1.5

- Fixed several Obsidian submission-bot lint warnings: popout-window-unsafe timers and type checks, a direct inline-style assignment, a release workflow that always published as a draft, a build-provenance attestation missing manifest.json, and gaps in the version-compatibility history. 修复多项 Obsidian 提交审核机器人告警：不兼容弹出窗口的定时器与类型判断、直接内联样式赋值、发布流程始终停留在草稿状态、构建溯源认证缺少 manifest.json，以及版本兼容性历史记录中的缺口。

## 0.1.4

- Added an echo-interaction block you can insert from the editor menu: one card per day (today/yesterday by default, or a custom date list), rating auto-saves on click, and finished cards animate out and collapse the block once every day is rated. 新增可从编辑器菜单插入的回声互动块：默认显示今天/昨天（或自定义日期列表），点击评分即自动保存，评完的卡片会播放动画退出并在全部完成后折叠整个区块。
- Added a settings button beside the interaction block's edit button, letting you toggle which days show inline without leaving the note. 在互动块的编辑按钮旁新增设置按钮，无需离开笔记即可就地切换显示哪些日期。
- Added optional geolocation and weather recording, writing city, coordinates, and daily weather into diary frontmatter; both can be turned off in settings. 新增可选的地理位置与天气记录，将城市、坐标与当日天气写入日记 frontmatter，均可在设置中关闭。
- Diary entries that are effectively empty are now hidden from the timeline. 时间轴现在会自动隐藏内容为空的日记条目。
- Improved the today CTA at month zoom level and refined year label styling. 优化月视图缩放层级下的"今天"入口，并改进年份标签样式。
- Daily notes folder now follows Obsidian's core Daily notes plugin instead of a free-text field (the core plugin must be enabled), and the settings tab was reorganized into collapsible sections with a segmented newest/oldest sort control. 日记文件夹现在跟随 Obsidian 核心 Daily notes 插件的设置，不再是自由文本字段（需启用该核心插件），设置页也重新整理为可折叠分组，并将排序方向改为分段控件。
- Replaced the full-width prev/next diary bar with small rounded pills overlaid at the note's left text margin, aligned identically in reading and editing mode. 将全宽的上/下篇日记导航条替换为悬浮在笔记左侧文字边距处的小圆角胶囊按钮，在阅读和编辑模式下对齐方式保持一致。

## 0.1.3

- Read the app language through Obsidian's official getLanguage() API instead of localStorage, raising the minimum required version to 1.8.7. 改用 Obsidian 官方的 getLanguage() API 读取界面语言，不再访问 localStorage，并将所需最低版本提升至 1.8.7。
- Scanned diaries only within the configured diary folder instead of enumerating the whole vault, which is also faster on large vaults. 仅在配置的日记文件夹内扫描日记，不再遍历整个仓库，在大型仓库上也更快。

## 0.1.2

- Fixed the settings panel so switching language refreshes it without invoking Obsidian's deprecated display() method. 修复设置面板，切换语言时不再调用 Obsidian 已弃用的 display() 方法来刷新。

## 0.1.1

- Renamed the "Open Day Echo timeline" command to "Open timeline", since Obsidian already shows the plugin name alongside it. 将命令"Open Day Echo timeline"重命名为"Open timeline"，因为 Obsidian 已在旁边显示插件名。
- Raised the minimum required Obsidian version to 1.7.2 and fixed the warnings reported by the plugin review checks. 将所需的最低 Obsidian 版本提升至 1.7.2，并修复插件审核检查报告的告警。

## 0.1.0

- Added a vertical timeline view that gathers all daily notes from your diary folder, with a year-marked axis and chronologically ordered cards. 新增竖向时间轴视图，将日记文件夹内的所有日记按时间汇聚到一个页面，左侧轴线以年份为节点排列卡片。
- Added card previews with text snippets and lazy-loaded image thumbnails; click a card to open the full day's note in a modal popup. 新增卡片预览，显示文字摘要与懒加载图片缩略图；点击卡片以弹窗形式查看当天日记全文。
- Added top-bar keyword search, tag filtering, and sort-direction toggle, plus a year ruler on the right to jump to any year. 新增顶部关键词搜索、标签筛选与排序方向切换，以及右侧年份尺一键跳转到任意年份。
- Added timeline zoom and a back-to-top button that appears after scrolling one full screen. 新增时间轴缩放，以及滚动超过一屏后出现的回到顶部按钮。
- Added settings for the diary folder path and default sort direction. 新增日记文件夹路径与默认排序方向的设置项。
