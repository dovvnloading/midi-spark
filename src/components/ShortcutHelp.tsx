import { useEffect, useRef } from "react";
import { Keyboard, X } from "lucide-react";

const GROUPS = [
  {
    title: "Transport",
    items: [
      ["Space", "Play / stop"],
      ["Ctrl/⌘ + Z", "Undo"],
      ["Ctrl/⌘ + Shift + Z", "Redo"],
      ["Ctrl/⌘ + Y", "Redo"],
    ],
  },
  {
    title: "Editing",
    items: [
      ["Ctrl/⌘ + A", "Select all visible notes"],
      ["Ctrl/⌘ + C", "Copy selection"],
      ["Ctrl/⌘ + V", "Paste at playhead"],
      ["Delete / Backspace", "Remove selected notes"],
      ["Alt + U", "Chop selected notes"],
      ["Shift + click", "Add to note selection"],
    ],
  },
  {
    title: "Navigation",
    items: [
      ["Ctrl/⌘ + wheel", "Zoom the piano roll"],
      ["Shift + wheel", "Scroll timeline horizontally"],
      ["?", "Show keyboard shortcuts"],
      ["Esc", "Close help / clear selection"],
    ],
  },
] as const;

export function ShortcutHelp({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    closeRef.current?.focus();
    return () => previouslyFocused.current?.focus();
  }, [open]);

  if (!open) return null;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
    if (event.key === "Tab") {
      const focusables = Array.from(
        event.currentTarget.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled])',
        ),
      );
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-[110] bg-[#07090f]/80 backdrop-blur-sm flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcut-help-title"
        className="hardware-panel w-full max-w-xl max-h-[min(85dvh,700px)] overflow-y-auto bg-[#222633] p-5 sm:p-6"
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <div className="flex items-center gap-2">
              <Keyboard size={20} className="text-[var(--accent)]" aria-hidden="true" />
              <h2 id="shortcut-help-title" className="text-lg font-bold">Keyboard shortcuts</h2>
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-2">
              Use these while the piano-roll workspace has focus, not while typing in a field.
            </p>
          </div>
          <button
            type="button"
            ref={closeRef}
            onClick={onClose}
            aria-label="Close shortcuts"
            className="hardware-btn w-9 h-9 shrink-0"
          >
            <X size={17} />
          </button>
        </div>
        <div className="grid sm:grid-cols-2 gap-5">
          {GROUPS.map((group) => (
            <section key={group.title}>
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-[var(--accent)] mb-2">
                {group.title}
              </h3>
              <dl className="space-y-2">
                {group.items.map(([key, description]) => (
                  <div className="flex items-center justify-between gap-3" key={key}>
                    <dt className="text-xs text-[var(--text-main)]">{description}</dt>
                    <dd className="shrink-0 rounded bg-[#11151f] px-2 py-1 text-[10px] font-mono text-[#c5d0ee] border border-[#3b4457]">
                      {key}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
        <div className="mt-5 pt-4 border-t border-[var(--border-color)] text-xs text-[var(--text-muted)]">
          Tip: Select a track lane in Track Studio to limit piano-roll editing to that track.
        </div>
      </div>
    </div>
  );
}
