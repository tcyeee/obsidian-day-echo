# Vertical Zoom Switch + Back-to-Top Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change 月/年 segmented control from horizontal to vertical layout, and add a slide-in back-to-top button that appears after scrolling one full viewport.

**Architecture:** Pure CSS for layout/animation definitions; TypeScript in `view.ts` for button creation and show/hide logic. No new files needed — all changes are contained to `styles.css` and `src/ui/view.ts`.

**Tech Stack:** TypeScript, Obsidian Plugin API (setIcon, HTMLElement helpers), Web Animations API (same pattern as existing crossfade in `applyZoom`).

---

## File Map

| File | Change |
|------|--------|
| `styles.css` | Rewrite `.de-zoom-switch` to vertical; add `.de-back-to-top` and `.de-back-to-top.is-hidden` |
| `src/ui/view.ts` | Add 2 fields; update `renderZoomSwitch`; add `animateBackToTop`; update `updateSticky`; update `onClose` |

---

## Task 1: CSS — Vertical zoom switch

**Files:**
- Modify: `styles.css` (lines 34–97, the zoom switch block)

**Background:** The current switch uses `flex-direction: row` with 66×36px buttons and `translateX` for the pill. We change to column with 36×36px buttons and `translateY`.

New height of `.de-zoom-switch`: 4px padding top + 36px btn + 36px btn + 4px padding bottom = **80px**.
This means back-to-top button (Task 2) sits at `bottom: 12 + 80 + 8 = 100px`.

- [ ] **Step 1: Replace the zoom switch CSS block**

In `styles.css`, replace lines 34–97 with:

```css
/* Month/year segmented switch, floating bottom-right, vertical pill */
.de-zoom-switch {
  position: absolute;
  right: 16px;
  bottom: 12px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  padding: 4px;
  border-radius: 999px;
  background: rgba(255, 248, 247, 0.9);
  border: 1px solid var(--de-rose-soft);
  box-shadow: var(--de-cloud-shadow);
  backdrop-filter: blur(10px);
}

/* Scoped under .de-zoom-switch to outrank Obsidian's button:not(.clickable-icon) */
.de-zoom-switch .de-zoom-opt {
  position: relative;
  z-index: 1;
  width: 36px;
  height: 36px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: transparent;
  box-shadow: none;
  color: var(--de-muted);
  font-size: var(--font-ui-medium);
  line-height: 36px;
  cursor: pointer;
  transition: color 120ms ease;
}

.de-zoom-switch .de-zoom-opt:hover {
  background: transparent;
  box-shadow: none;
  color: var(--de-rose);
}

.de-zoom-switch .de-zoom-opt.is-active,
.de-zoom-switch .de-zoom-opt.is-active:hover {
  color: var(--de-rose);
  font-weight: 600;
}

/* The sliding highlight pill; --de-zoom-index is set from the view */
.de-zoom-thumb {
  position: absolute;
  top: 4px;
  left: 4px;
  width: 36px;
  height: 36px;
  border-radius: 999px;
  background: var(--de-rose-soft);
  border: 1px solid rgba(135, 79, 76, 0.12);
  box-shadow: 0 5px 14px rgba(135, 79, 76, 0.12);
  transform: translateY(calc(var(--de-zoom-index, 0) * 100%));
  transition: transform 160ms ease;
}

@media (prefers-reduced-motion: reduce) {
  .de-zoom-thumb {
    transition: none;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add styles.css
git commit -m "style: change zoom switch from horizontal to vertical layout"
```

---

## Task 2: CSS — Back-to-top button styles

**Files:**
- Modify: `styles.css` (add after the zoom switch block, before the `/* Body */` comment)

**Position math:** zoom-switch `bottom: 12px`, height `80px`, gap `8px` → back-to-top `bottom: 100px`. Same `right: 16px`. Size: 36×36px (matches zoom buttons). Appearance matches zoom switch (same token set).

- [ ] **Step 1: Add back-to-top CSS block**

In `styles.css`, insert the following block immediately after the `@media (prefers-reduced-motion: reduce)` zoom-thumb block and before `/* Body: the scrollable timeline */`:

```css
/* Back-to-top FAB — floats above the zoom switch, slides in from the right */
.de-back-to-top {
  position: absolute;
  right: 16px;
  bottom: 100px;
  z-index: 10;
  width: 36px;
  height: 36px;
  border-radius: 999px;
  background: rgba(255, 248, 247, 0.9);
  border: 1px solid var(--de-rose-soft);
  box-shadow: var(--de-cloud-shadow);
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--de-rose);
  padding: 0;
}

.de-back-to-top:hover {
  background: var(--de-rose-soft);
  box-shadow: none;
}

.de-back-to-top.is-hidden {
  display: none;
}
```

- [ ] **Step 2: Commit**

```bash
git add styles.css
git commit -m "style: add back-to-top button styles"
```

---

## Task 3: TypeScript — New fields and button creation

**Files:**
- Modify: `src/ui/view.ts`

**What to add:**
1. Two new private fields after `zoomSwitchEl`
2. Update `renderZoomSwitch` to create the button before the zoom switch
3. Add `animateBackToTop` method
4. Update `onClose` cleanup

- [ ] **Step 1: Add two fields to the class**

In `src/ui/view.ts`, after line 50 (`private zoomSwitchEl: HTMLElement | null = null;`), add:

```typescript
  private backToTopEl: HTMLElement | null = null;
  /** Tracks whether the button is currently visible; prevents redundant animations. */
  private backToTopVisible = false;
```

- [ ] **Step 2: Update `renderZoomSwitch` to create the back-to-top button**

Replace the current `renderZoomSwitch` method (lines 162–174) with:

```typescript
  private renderZoomSwitch(root: HTMLElement): void {
    const btt = root.createEl("button", { cls: "de-back-to-top is-hidden" });
    setIcon(btt, "chevron-up");
    btt.addEventListener("click", () => {
      if (!this.scrollEl) return;
      this.scrollTarget = 0;
      this.animateScroll();
    });
    this.backToTopEl = btt;

    const wrap = root.createDiv({ cls: "de-zoom-switch" });
    wrap.createDiv({ cls: "de-zoom-thumb" });
    for (const level of ZOOM_ORDER) {
      const btn = wrap.createEl("button", {
        cls: "de-zoom-opt",
        text: ZOOM_LABELS[level],
      });
      btn.addEventListener("click", () => void this.applyZoom(level, null));
    }
    this.zoomSwitchEl = wrap;
    this.updateZoomSwitch();
  }
```

- [ ] **Step 3: Add `animateBackToTop` method**

Add the following method immediately after `updateZoomSwitch` (after line 184):

```typescript
  /** Slide the back-to-top button in (show=true) or out (show=false). */
  private animateBackToTop(show: boolean): void {
    const el = this.backToTopEl;
    if (!el) return;
    const reduced = this.reduceMotion.matches;
    if (show) {
      el.removeClass("is-hidden");
      el.animate(
        { opacity: [0, 1], transform: ["translateX(60px)", "translateX(0)"] },
        { duration: reduced ? 0 : 200, easing: "ease-out" }
      );
    } else {
      const anim = el.animate(
        { opacity: [1, 0], transform: ["translateX(0)", "translateX(60px)"] },
        { duration: reduced ? 0 : 160, easing: "ease-in", fill: "forwards" }
      );
      anim.finished
        .then(() => {
          el.addClass("is-hidden");
          anim.cancel();
        })
        .catch(() => {});
    }
  }
```

- [ ] **Step 4: Update `onClose` to clean up the new fields**

In `onClose` (lines 90–105), after `this.zoomSwitchEl = null;`, add:

```typescript
    this.backToTopEl = null;
    this.backToTopVisible = false;
```

- [ ] **Step 5: Commit**

```bash
git add src/ui/view.ts
git commit -m "feat: add back-to-top button with slide animation"
```

---

## Task 4: TypeScript — Show/hide logic on scroll

**Files:**
- Modify: `src/ui/view.ts`

**Where:** `updateSticky` is already called on every scroll event. Append the visibility check there — no new event listener needed.

- [ ] **Step 1: Append visibility check to `updateSticky`**

In `updateSticky` (currently ends around line 571), add the following lines at the very end of the method body, after the sticky label update block:

```typescript
    // Show back-to-top once the user has scrolled past one full viewport height.
    const shouldShow = this.scrollEl.scrollTop > this.scrollEl.clientHeight;
    if (shouldShow !== this.backToTopVisible) {
      this.backToTopVisible = shouldShow;
      this.animateBackToTop(shouldShow);
    }
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/view.ts
git commit -m "feat: show back-to-top button after scrolling one full screen"
```

---

## Task 5: Build and deploy

**Files:** none modified

- [ ] **Step 1: Build**

```bash
pnpm build
```

Expected: no TypeScript errors, `main.js` produced.

- [ ] **Step 2: Deploy to local vault**

```bash
PLUGIN_ID=$(node -e "console.log(require('./manifest.json').id)")
VAULT_PLUGINS="/Users/tcyeee/Library/Mobile Documents/iCloud~md~obsidian/Documents/Lucas/.obsidian/plugins"
mkdir -p "$VAULT_PLUGINS/$PLUGIN_ID"
cp main.js manifest.json styles.css "$VAULT_PLUGINS/$PLUGIN_ID/"
```

- [ ] **Step 3: Verify in Obsidian**

1. Hot-reload picks up the change automatically (plugin already enabled).
2. Check: 月/年 buttons are now stacked **vertically**, pill slides up/down.
3. Scroll down past one full viewport height — the ↑ button slides in from the right.
4. Scroll back to near the top — the ↑ button slides out to the right.
5. Click the ↑ button while scrolled down — timeline glides smoothly to top.
6. Switch between 月/年 — pill animation still works correctly.
