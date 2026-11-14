import { useEffect, useRef } from "react";
import { Warning, ArrowRight, Close } from "./StudioIcons";

export interface ReplaceProjectDialogProps {
  operation: "import" | "generate" | "project";
  existingNotes: number;
  existingTracks: number;
  incomingSummary: string;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Confirm replacements before changing the score or non-undoable mixer state.
 * Native showModal gives real focus containment and Escape semantics. */
export function ReplaceProjectDialog({
  operation, existingNotes, existingTracks, incomingSummary, onCancel, onConfirm,
}: ReplaceProjectDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    cancelRef.current?.focus();
    return () => {
      if (dialog?.open) dialog.close();
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  const importing = operation === "import";
  const opening = operation === "project";
  return <dialog ref={dialogRef} className="replace-project-dialog"
    aria-labelledby="replace-project-heading" aria-describedby="replace-project-description"
    onCancel={event => { event.preventDefault(); onCancel(); }}>
    <div className="replace-project-heading">
      <span className="replace-project-warning"><Warning size={19} aria-hidden="true" /></span>
      <h2 id="replace-project-heading">{importing ? "Replace current composition?" : opening ? "Open native project?" : "Start a new pattern?"}</h2>
      <button className="icon-button" aria-label="Cancel replacement" onClick={onCancel}><Close size={17} /></button>
    </div>
    <p id="replace-project-description">
      {importing ? "The imported MIDI will replace your current composition." :
        opening ? "The project file will replace your current notes, instruments, locks, guides, saved takes, and studio settings." :
        "Generating from scratch will replace your current composition."}
    </p>
    <div className="replace-project-comparison">
      <div><small>CURRENT WORK</small><strong>{existingNotes} notes · {existingTracks} tracks</strong></div>
      <ArrowRight size={18} aria-hidden="true" />
      <div><small>NEW WORK</small><strong>{incomingSummary}</strong></div>
    </div>
    <p className="replace-project-caution">
      Notes can be restored with Undo, but track sound/mixer settings and the current
      loop may not be restored. Save a native .midispark project backup first if you
      need to preserve your full workspace.
    </p>
    <div className="replace-project-actions">
      <button ref={cancelRef} type="button" className="secondary-button" onClick={onCancel}>
        Keep current work
      </button>
      <button type="button" className="danger-action" onClick={onConfirm}>
        {importing ? "Import and replace" : opening ? "Open and replace" : "Generate and replace"}
      </button>
    </div>
  </dialog>;
}
