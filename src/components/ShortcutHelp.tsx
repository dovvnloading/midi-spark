import { useEffect, useRef } from "react";
import { X, Keyboard } from "lucide-react";
const GROUPS = [
  { title: "Playback & ideas", items: [["Space", "Play / stop"], ["Ctrl / ⌘ G", "Generate a pattern"], ["Ctrl / ⌘ Z", "Undo"], ["Ctrl / ⌘ Shift Z", "Redo"]] },
  { title: "Tools & view", items: [["B / V / S / C / H", "Draw / Select / Stamp / Slice / Hand"], ["F", "Fit pattern to view"], ["Ctrl / ⌘ + wheel", "Zoom at cursor"], ["Shift + wheel", "Scroll timeline"]] },
  { title: "Selection", items: [["Ctrl / ⌘ A", "Select visible notes"], ["Ctrl / ⌘ C / V", "Copy / paste notes"], ["Delete", "Remove selection"], ["Escape", "Clear selection / close panel"]] },
];
export function ShortcutHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement;
    const dialog = ref.current;
    dialog?.showModal();
    return () => { dialog?.close(); previous?.focus(); };
  }, [open]);
  return <dialog ref={ref} className="shortcut-dialog" onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}
    onKeyDown={event => {
      if (event.key !== "Tab") return;
      const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, a[href], [tabindex="0"]'));
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }} aria-labelledby="shortcut-heading">
    <div className="dialog-content"><header><Keyboard size={20} /><h2 id="shortcut-heading">A faster way to create.</h2><button className="icon-button" aria-label="Close shortcuts" onClick={onClose}><X size={18} /></button></header>
      <p>Shortcuts work in the editor. Text fields keep their own keyboard behavior.</p>
      {GROUPS.map(group => <section key={group.title}><h3>{group.title}</h3><dl>{group.items.map(([keys, action]) => <div key={keys}><dt>{action}</dt><dd><kbd>{keys}</kbd></dd></div>)}</dl></section>)}
      <footer>On touch screens, choose Hand to pan the canvas. Choose a tool to edit.</footer>
    </div>
  </dialog>;
}
