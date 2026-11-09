import { Check, Headphones, Shuffle, X } from "lucide-react";

export interface HarmonyTakeView {
  label: string;
  changedRegions: number;
  chordSummary: string;
}

export interface HarmonyTakeLabProps {
  enabled: boolean;
  takes: readonly HarmonyTakeView[];
  previewIndex: number | null;
  onExplore: () => void;
  onSelect: (index: number | null) => void;
  onAccept: () => void;
  onDiscard: () => void;
}

/** Browser audio transport remains the audition control. Candidate selection
 * changes the read-only piano-roll preview but not the saved progression. */
export function HarmonyTakeLab(p: HarmonyTakeLabProps) {
  return <section className="harmony-take-lab" aria-label="Compare harmony takes">
    <div className="field-heading">
      <h4><Headphones size={14} aria-hidden="true" /> Take Lab</h4>
      <span className="field-hint">{p.takes.length ? p.takes.length + " options" : "A / B"}</span>
    </div>
    <p className="generation-hint">Explore alternate harmonizations without replacing
      your current take. Preview in the piano roll and use the main Play button
      to hear each one. Accept only when you're ready.</p>
    <button type="button" className="secondary-button wide take-explore"
      onClick={p.onExplore} disabled={!p.enabled}>
      <Shuffle size={14} aria-hidden="true" />
      {p.takes.length ? "Explore 3 fresh takes" : "Explore 3 takes"}
    </button>
    {!p.enabled && <p className="generation-hint" role="status">
      Harmonize the source melody once to enable Take Lab.
    </p>}
    {p.takes.length > 0 && <>
      <div className="take-choices" role="group" aria-label="Audition harmony takes">
        <button type="button" className="take-choice" aria-pressed={p.previewIndex === null}
          onClick={() => p.onSelect(null)}>
          <strong>Original</strong><small>Current working arrangement</small>
        </button>
        {p.takes.map((take, index) => <button type="button" className="take-choice"
          key={index} aria-pressed={p.previewIndex === index}
          onClick={() => p.onSelect(index)}>
          <strong>{take.label}</strong>
          <small>{take.changedRegions} chord changes · {take.chordSummary}</small>
        </button>)}
      </div>
      <p className="generation-hint" role="status">
        {p.previewIndex === null ? "Original selected. Choose a take to audition." :
          "Preview only: the piano roll is read-only. Nothing replaces your project until Accept."}
      </p>
      <div className="take-actions">
        <button type="button" className="primary-button" disabled={p.previewIndex === null}
          onClick={p.onAccept}><Check size={14} aria-hidden="true" />Accept selected take</button>
        <button type="button" className="text-button" onClick={p.onDiscard}>
          <X size={14} aria-hidden="true" />Clear takes
        </button>
      </div>
    </>}
  </section>;
}
