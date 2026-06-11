import { App, Component, MarkdownRenderer, Scope, setIcon } from "obsidian";
import type { DiaryEntry } from "../types";
import { stripFrontmatter } from "../core/scanner";
import { t } from "../i18n";

export function openDiaryModal(
  entry: DiaryEntry,
  app: App,
  component: Component
): void {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const overlay = activeDocument.body.createDiv({ cls: "de-modal-overlay" });
  const modal = overlay.createDiv({ cls: "de-modal" });

  // Header
  const header = modal.createDiv({ cls: "de-modal-header" });
  const dateBadge = header.createDiv({
    cls: "de-modal-date",
    text: fullDate(entry.date),
  });
  dateBadge.title = t("card.openNote");
  dateBadge.addEventListener("click", () => {
    void app.workspace.getLeaf(false).openFile(entry.file);
    close();
  });

  const closeBtn = header.createDiv({ cls: "de-modal-close" });
  setIcon(closeBtn, "x");
  closeBtn.addEventListener("click", close);

  // Body
  const body = modal.createDiv({ cls: "de-modal-body" });
  void (async () => {
    const content = await app.vault.cachedRead(entry.file);
    await MarkdownRenderer.render(
      app,
      stripFrontmatter(content),
      body,
      entry.file.path,
      component
    );
  })();

  // Close on overlay click (not inside modal)
  overlay.addEventListener("click", (ev) => {
    if (ev.target === overlay) close();
  });

  // Escape closes the modal. Like the timeline view, route this through
  // Obsidian's Keymap rather than a DOM listener: push a scope so Escape
  // lands here first, and return false to stop Obsidian's default handler.
  const scope = new Scope(app.scope);
  scope.register([], "Escape", () => {
    close();
    return false;
  });
  app.keymap.pushScope(scope);

  // Open animation
  const dur = reduceMotion ? 0 : 220;
  const overlayDur = reduceMotion ? 0 : 160;
  overlay.animate([{ opacity: 0 }, { opacity: 1 }], {
    duration: overlayDur,
    easing: "ease",
    fill: "forwards",
  });
  modal.animate(
    [
      { opacity: 0, transform: "scale(0.92)" },
      { opacity: 1, transform: "scale(1)" },
    ],
    { duration: dur, easing: "ease-out", fill: "forwards" }
  );

  let closed = false;
  function close(): void {
    if (closed) return; // Escape, overlay click and the button all route here.
    closed = true;
    app.keymap.popScope(scope);
    const closeDur = reduceMotion ? 0 : 180;
    const a = modal.animate(
      [
        { opacity: 1, transform: "scale(1)" },
        { opacity: 0, transform: "scale(0.92)" },
      ],
      { duration: closeDur, easing: "ease-in" }
    );
    overlay.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: closeDur,
      easing: "ease",
    });
    void a.finished.then(() => overlay.remove());
  }
}

function fullDate(d: Date): string {
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}
