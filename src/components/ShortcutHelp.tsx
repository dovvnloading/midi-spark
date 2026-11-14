import { useEffect, useRef } from "react";
import { Close, Keyboard } from "./StudioIcons";
const GROUPS = [
  { title: "Playback & generation", items: [
    ["Space", "Play / pause"], ["Ctrl / ⌘ G", "Generate or regenerate"],
    ["Ctrl / ⌘ Z", "Undo"], ["Ctrl / ⌘ Shift Z", "Redo"],
  ] },
  { title: "Editor tools", items: [
    ["B / V / S / C / H", "Draw / Select / Stamp / Slice / Hand"],
    ["F", "Fit pattern to view"], ["Alt + U", "Chop selected notes"],
    ["Drag note edge", "Resize a note"], ["Drag velocity bar", "Adjust note velocity"],
  ] },
  { title: "Timeline & loop", items: [
    ["Shift + drag ruler", "Set a loop range with a pointer + keyboard"],
    ["Drag loop handles", "Adjust loop start or end (also on touch)"],
    ["Arrow keys on loop handle", "Fine-adjust an active loop edge"],
    ["Double-click ruler", "Reset to the full loop"],
    ["Ctrl / ⌘ + wheel", "Zoom near the pointer"],
    ["Shift + wheel", "Scroll timeline horizontally"],
  ] },
  { title: "Selection & editing", items: [
    ["Ctrl / ⌘ A", "Select notes on the active track"],
    ["Ctrl / ⌘ C / V", "Copy / paste selected notes"],
    ["Delete", "Remove selection"],
    ["Escape", "Clear selection or dismiss an open panel"],
  ] },
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
    <div className="dialog-content"><header><Keyboard size={20} /><h2 id="shortcut-heading">Shortcuts & gestures</h2><button className="icon-button" aria-label="Close shortcuts" onClick={onClose}><Close size={18} /></button></header>
      <p>Shortcuts work in the editor. Text fields keep their own keyboard behavior.</p>
      {GROUPS.map(group => <section key={group.title}><h3>{group.title}</h3><dl>{group.items.map(([keys, action]) => <div key={keys}><dt>{action}</dt><dd><kbd>{keys}</kbd></dd></div>)}</dl></section>)}
      <footer>On touch screens, choose Hand to pan. For melody loop selection, use
        Follow melody → Loop range → From/Through bar, or drag the loop handles directly.</footer>
    </div>
  </dialog>;
}
