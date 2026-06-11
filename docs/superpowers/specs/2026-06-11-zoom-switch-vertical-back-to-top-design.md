# 年/月按钮竖向布局 + 回到顶部按钮

## 概述

将右下角悬浮的"月/年"视图切换控件从横向改为竖向排列，并在其正上方新增一个「回到顶部」按钮，当用户滚动超过一屏时滑入，滚回顶部附近时滑出。

---

## 1. 年/月 按钮改为竖向

### 当前状态

`.de-zoom-switch` 使用 `flex-direction: row`，两个按钮左右排列（各 66×36px），高亮 pill 用 `translateX` 水平滑动。

### 修改后

- `flex-direction: column`，两个按钮上下排列
- 按钮尺寸改为 **36×36px**（正方形），保持 `border-radius: 999px`
- `.de-zoom-thumb` 尺寸同步为 36×36px，动画改为 `translateY(calc(var(--de-zoom-index, 0) * 100%))`
- 外框 `border-radius: 999px` 不变（纵向 pill 形状自然成立）

**影响文件：**
- `styles.css`：`.de-zoom-switch`、`.de-zoom-opt`、`.de-zoom-thumb`
- `src/ui/view.ts`：无需改动（CSS 驱动，JS 只设 `--de-zoom-index`）

---

## 2. 回到顶部按钮

### 行为

| 条件 | 动作 |
|------|------|
| `scrollTop > scrollEl.clientHeight` | 按钮滑入（入场动画） |
| `scrollTop <= scrollEl.clientHeight` | 按钮滑出（出场动画） |
| 点击 | 调用现有 smooth scroll，将 `scrollTarget` 设为 `0` 并触发 `animateScroll()` |

### 位置

- `position: absolute`，`right: 16px`
- `bottom` 计算：`.de-zoom-switch` 的 bottom（12px）+ `.de-zoom-switch` 高度（约 82px = 3+36+3+36+3）+ 间距（8px）= **约 102px**
- 实际用 CSS 固定值：`bottom: 106px`（可微调）

### 样式

与 `.de-zoom-switch` 完全一致的外观语言：
- 尺寸：36×36px，`border-radius: 999px`
- 背景：`rgba(255, 248, 247, 0.9)`
- 边框：`1px solid var(--de-rose-soft)`
- 阴影：`var(--de-cloud-shadow)`
- `backdrop-filter: blur(10px)`
- 图标：`chevron-up`（`setIcon` 注入）

### 动画

```
入场：translateX(60px) opacity:0  →  translateX(0) opacity:1
      duration: 200ms, easing: ease-out

出场：translateX(0) opacity:1  →  translateX(60px) opacity:0
      duration: 160ms, easing: ease-in
```

`prefers-reduced-motion: reduce` 时动画时长设为 0。

初始状态通过 CSS class `.is-hidden` 控制（`display: none` 或 `pointer-events: none` + 完全透明），避免页面加载时闪烁。

### 实现细节

**新增字段（`view.ts`）：**
```ts
private backToTopEl: HTMLElement | null = null;
private backToTopVisible = false;  // 防止每帧重复触发动画
```

**`renderZoomSwitch()`**：在创建 `.de-zoom-switch` 之前，先创建 `.de-back-to-top` 并调用 `setIcon`；绑定 click 事件。

**`updateSticky()`**（已在每次 scroll 时调用）：追加回到顶部的显隐逻辑：
```ts
const shouldShow = this.scrollEl.scrollTop > this.scrollEl.clientHeight;
if (shouldShow !== this.backToTopVisible) {
  this.backToTopVisible = shouldShow;
  this.animateBackToTop(shouldShow);
}
```

**`animateBackToTop(show: boolean)`**：用 Web Animations API 驱动入/出场，`prefers-reduced-motion` 时 duration 为 0；出场动画结束后设 `display: none`。

**`onClose()`**：清理 `backToTopEl = null`、`backToTopVisible = false`。

---

## 3. 不涉及的内容

- 不改动滚动逻辑、zoom 逻辑、marker/sticky 逻辑
- 不改动 `interaction-block.ts`、`card-builder.ts`、`diary-modal.ts` 等其他文件
- 不引入新依赖
