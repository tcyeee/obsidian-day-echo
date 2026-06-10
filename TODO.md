# Day Echo 开发日志

## Timeline 布局优化（轴侧标签 + 双列瀑布流 + 卡片式折叠）

### 目标
1. 滚动时间轴时，左侧始终能明显看到当前所在的年份/月份（按缩放级别显示对应粒度）。
2. 两列卡片不再按"行"对齐，高度不一致时不再产生大块空隙。
3. "+N more" 折叠占位变成一张真正的日记卡片：展示第 N+1 篇日记的内容，上面盖半透明蒙版和展开图标，占据两列中的一个位置。

### 已确认的实现路径（2026-06-10）
- 双列布局：JS 估高分配。连续卡片分进左右两个独立纵向列，每张新卡放进当前估算高度较矮的列。卡片高度可预估（缩略图固定 96×72、文字最多 2 行）。
- 日期处理：全部移入卡片内部（复用 de-card-date），轴上只保留分组节点的大圆点。
- 左侧标签：分组标签移到轴左侧并 sticky 吸顶；日视图也按月分组（标签"2026.06"），年视图标签"2026"。
- 折叠卡片：用 hidden[0] 构建正常预览卡片 + 蒙版（+N、展开图标），点击去掉蒙版并把其余 hidden 卡片继续按估高分配进双列。

### 结果：已完成（2026-06-10）
- `aggregate.ts`：`buildItems` 三个缩放级别统一走分组（日/月视图按月、年视图按年），`pairCards` 替换为 `collectRuns`（连续卡片合并成 run，fold 挂在所属 run 上）。`RenderItem` 去掉 `year` kind，`PairedItem` 改为 `LayoutItem`。
- `view.ts`：每个分组渲染成 `de-section`（sticky 的 `de-sec-head` 标签吸顶 + 固定在分组起点的 `de-sec-dot`）；run 内用估高贪心分配到左右两个独立 `de-col`；日期全部移入卡片内（`de-card-date`）；折叠卡 = hidden[0] 的正常预览卡 + `de-fold-mask` 蒙版（chevrons-down 图标 + `+N`），点击去蒙版并把其余 hidden 继续按估高分配进列。
- 测试：aggregate 测试改写为 16 个全部通过，`npm run build` 通过。

**坑 1**：分组圆点最初放在 sticky 的 head 里
sticky 吸顶时圆点会跟着标签沿轴滑动，看起来像"游标"。
→ 圆点改为 `de-section` 的直接子元素、绝对定位在分组起点，标签单独 sticky。

**坑 2**：所有视图改为按月分段后，同一年出现多个相同 `data-year` 的 section
缩放锚点 `restoreAnchor` 用 `querySelector("[data-year=...]")` 只命中第一个，跨级缩放会跳到该年第一个月。
→ section 增加精确 `data-key`（"2026-06"/"2026"），锚点优先按 key 匹配，跨年级缩放再退回 data-year。

**经验**：折叠卡的蒙版点击要 `stopPropagation()`，否则会触发底下卡片自身的展开监听；蒙版 `position:absolute; inset:0` 覆盖整卡，天然拦截所有点击。

## 缩放切换闪烁修复（2026-06-10）

### 问题
修饰键+滚轮缩放时视图闪烁、没有任何过渡动画；一次手势还会连跳两档（day→month→year）。

### 根因
1. 旧实现 `addClass("is-swapping")` 后在下一个 `requestAnimationFrame` 里同步重建 DOM——rAF 回调在浏览器绘制**之前**执行，淡出帧永远画不出来，新内容以全不透明度瞬间替换，150ms transition 两个方向都没播过。
2. spec 要求的滚轮 delta 阈值没实现，只有 250ms 冷却；触控板一次手势持续超过 250ms，会连跳两档、两次瞬间重绘。

### 修复（view.ts）
- 改用 Web Animations API 两段式过渡：`animate()` 淡出+缩放（120ms）→ `await finished` 确保真正画完 → 不可见时重绘+恢复光标锚点 → 淡入+缩放（180ms）。缩放方向跟随档位（变粗=收缩、变细=放大），`transform-origin` 设在光标 Y，与滚动锚点同一支点。
- 滚轮 delta 累积阈值（80）替代纯冷却：鼠标一格直接触发，触控板需累积；手势停顿 200ms 或反向时清零；动画播放期间（`swapping` 锁）忽略滚轮。
- 修饰键增加 ALT（`ev.altKey`），并支持 `prefers-reduced-motion`（动画时长归零）。
- 删除 styles.css 里废弃的 `.is-swapping` 规则。

**经验**：想播"先淡出→换内容→再淡入"，不能靠加 class 后在 rAF 里换 DOM——rAF 在 paint 前执行，淡出帧根本不会被画出来。要么等 `transitionend`，要么用 WAAPI `await animation.finished`。`fill: "forwards"` 的淡出动画在换完内容后要 `cancel()`，否则它的 forwards 填充（opacity 0）会在淡入结束后重新生效。
