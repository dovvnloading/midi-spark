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
    ["Drag note body", "Move notes in time or pitch"],
    ["Drag right edge", "Resize notes"], ["Drag velocity bar", "Adjust note velocity"],
  ] },
  { title: "Timeline & loop", items: [
    ["Click or drag ruler", "Set the playhead"],
    ["Shift + drag ruler", "Set a loop range"],
    ["Drag loop handles", "Adjust loop start or end (also on touch)"],
    ["Arrow keys on loop handle", "Fine-adjust an active loop edge"],
    ["Double-click ruler", "Reset to the full loop"],
    ["Ctrl / ⌘ + wheel", "Zoom near the pointer"],
    ["Shift + wheel", "Scroll timeline horizontally"],
  ] },
  { title: "With a grid note focused", items: [
    ["Arrows", "Focus the previous or next note"],
    ["Enter / Space", "Select the focused note"],
    ["Shift + arrows", "Extend the selection"],
    ["Alt + ← / →", "Nudge timing by one grid step"],
    ["Alt + ↑ / ↓", "Transpose by a semitone"],
    ["[ / ]", "Shorten or lengthen by one grid step"],
  ] },
  { title: "Selection & editing", items: [
    ["Ctrl / ⌘ A", "Select notes on the active track"],
    ["Ctrl / ⌘ C / V", "Copy / paste selected notes"],
    ["Delete", "Remove selection"],
    ["Escape", "Cancel a drag, clear selection, or close a panel"],
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
      <footer>To place a note with the keyboard, open <strong>Precise note editing</strong> and choose <strong>Add note at playhead</strong>. Adjust its pitch, start, length, and velocity in the fields. On touch screens, choose Hand to pan or drag the ruler handles to set a loop.</footer>
    </div>
  </dialog>;
}
