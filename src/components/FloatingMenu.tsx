import { useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

interface FloatingMenuProps {
  /** The visible <details> trigger remains in its original keyboard/tab order. */
  anchorRef: RefObject<HTMLElement | null>;
  className: string;
  id: string;
  label: string;
  onDismiss: () => void;
  children: ReactNode;
}

/** Render a non-modal menu outside all editor/header stacking contexts.
 *
 * A z-index on an absolutely positioned child cannot overcome its parent's
 * stacking context; the editor also clips overflow. Both Project and View use
 * this body-level layer rather than competing with the inspector or piano-roll
 * ruler. Positioning flips/clamps to the viewport and follows scroll/resize.
 */
export function FloatingMenu({
  anchorRef, className, id, label, onDismiss, children,
}: FloatingMenuProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const dismissRef = useRef(onDismiss);
  // Keep current callbacks without reading or mutating React refs during render.
  useLayoutEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const position = () => {
      const anchor = anchorRef.current;
      if (!anchor || !anchor.isConnected) {
        dismissRef.current();
        return;
      }
      const rect = anchor.getBoundingClientRect();
      // Do not leave a disconnected floating menu over the music after its
      // trigger moves out of view or a navigation unmount.
      if (rect.bottom < 0 || rect.top > window.innerHeight) {
        dismissRef.current();
        return;
      }

      const margin = 8, gap = 6;
      const widthLimit = Math.max(1, window.innerWidth - margin * 2);
      panel.style.width = "";
      panel.style.minWidth = "0px";
      panel.style.maxWidth = widthLimit + "px";
      panel.style.maxHeight = "none";
      const width = Math.min(panel.offsetWidth, widthLimit);
      panel.style.width = width + "px";

      const height = panel.scrollHeight;
      const below = Math.max(0, window.innerHeight - rect.bottom - margin - gap);
      const above = Math.max(0, rect.top - margin - gap);
      const openAbove = height > below && above > below;
      const capacity = openAbove ? above : below;
      const maxHeight = Math.max(1, Math.min(capacity, window.innerHeight - margin * 2));
      const visibleHeight = Math.min(height, maxHeight);
      const top = Math.min(
        Math.max(margin, openAbove ? rect.top - gap - visibleHeight : rect.bottom + gap),
        window.innerHeight - margin - visibleHeight,
      );
      const left = Math.max(
        margin, Math.min(rect.right - width, window.innerWidth - margin - width),
      );
      panel.style.left = left + "px";
      panel.style.top = top + "px";
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      panel.style.maxHeight = maxHeight + "px";
      panel.style.visibility = "visible";
    };

    position();
    panel.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });

    const outside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panel.contains(target) || anchorRef.current?.contains(target)) return;
      dismissRef.current();
    };
    const focusOutside = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panel.contains(target) || anchorRef.current?.contains(target)) return;
      dismissRef.current();
    };

    const onScroll = (event: Event) => {
      // Scrolling the menu itself must not reset its scrollTop by temporarily
      // removing max-height during positioning.
      if (event.target instanceof Node && (event.target === panel ||
        panel.contains(event.target))) return;
      position();
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("focusin", focusOutside);
    window.addEventListener("resize", position);
    // Capture scrolling in the piano roll and nested side panels, not only
    // the document-level scroll event.
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("focusin", focusOutside);
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [anchorRef]);

  return createPortal(
    <div ref={panelRef} id={id} className={"floating-menu-panel " + className}
      role="group" aria-label={label} style={{ visibility: "hidden" }}
      onKeyDown={event => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          dismissRef.current();
          anchorRef.current?.querySelector("summary")?.focus();
        }
      }}>
      {children}
    </div>,
    document.body,
  );
}
