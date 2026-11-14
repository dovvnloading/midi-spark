import { SaveTake, Check, Headphones, Play, Shuffle, Trash, Close, ChevronLeft, ChevronRight } from "./StudioIcons";
import type { HarmonyTakeDifference } from "../lib/harmonyTakes";

export interface HarmonyTakeView {
  label: string;
  chordSummary: string;
  savedId: string | null;
  comparison: HarmonyTakeDifference;
}

export interface HarmonyTakeLabProps {
  enabled: boolean;
  takes: readonly HarmonyTakeView[];
  previewIndex: number | null;
  onExplore: () => void;
  onSelect: (index: number | null) => void;
  onAudition: (index: number | null) => void;
  onAccept: () => void;
  onSave: () => void;
  onRemoveSaved: (id: string) => void;
  onDiscard: () => void;
}

/** Two independent actions: Select inspects read-only MIDI, while Listen
 * directly starts the common transport at the same loop anchor for every
 * comparison. A favorite survives reload only with its unchanged base. */
export function HarmonyTakeLab(p: HarmonyTakeLabProps) {
  const selected = p.previewIndex === null ? null : p.takes[p.previewIndex];
  const freshCount = p.takes.filter(take => !take.savedId).length;
  const savedCount = p.takes.length - freshCount;
  const previous = p.previewIndex === null ? p.takes.length - 1 :
    p.previewIndex === 0 ? null : p.previewIndex - 1;
  const next = p.previewIndex === null ? 0 :
    p.previewIndex + 1 < p.takes.length ? p.previewIndex + 1 : null;
  const signed = (value: number) => value > 0 ? "+" + value : String(value);

  return <section className="harmony-take-lab" aria-label="Compare harmony takes">
    <div className="field-heading">
      <h4><Headphones size={14} aria-hidden="true" /> Take Lab</h4>
      <span className="field-hint">{p.takes.length ? p.takes.length + " options" : "A / B"}</span>
    </div>
    <p className="generation-hint">Compare the original with new harmony takes.
      Select to inspect; Listen restarts each take at the same loop start.
      Save up to four favorites for this arrangement, then Accept one undoable edit.</p>
    <button type="button" className="secondary-button wide take-explore"
      onClick={p.onExplore} disabled={!p.enabled}>
      <Shuffle size={14} aria-hidden="true" />
      {p.takes.length ? "Explore 3 fresh takes" : "Explore 3 takes"}
    </button>
    {!p.enabled && <p className="generation-hint" role="status">
      Harmonize the source melody once to enable Take Lab.
    </p>}
    {p.takes.length > 0 && <>
      <div className="take-switcher" role="group" aria-label="Quick A/B listening">
        <button type="button" className="text-button" onClick={() => p.onAudition(previous)}>
          <ChevronLeft size={12} aria-hidden="true" /> Previous
        </button>
        <span className="field-hint">{selected ? selected.label : "Original"}</span>
        <button type="button" className="text-button" onClick={() => p.onAudition(next)}>
          Next <ChevronRight size={12} aria-hidden="true" />
        </button>
      </div>
      <div className="take-choices" role="group" aria-label="Audition harmony takes">
        <div className="take-option">
          <button type="button" className="take-choice" aria-pressed={p.previewIndex === null}
            onClick={() => p.onSelect(null)}>
            <strong>Original</strong><small>Current working arrangement</small>
          </button>
          <button type="button" className="take-listen" aria-label="Play reference"
            onClick={() => p.onAudition(null)}><Play size={12} aria-hidden="true" />Listen</button>
        </div>
        {p.takes.map((take, index) => <div className="take-option" key={take.savedId ?? "new-" + index}>
          <button type="button" className="take-choice"
            aria-pressed={p.previewIndex === index}
            onClick={() => p.onSelect(index)}>
            <strong>{take.label}{take.savedId ? " · Saved" : ""}</strong>
            <small>{take.comparison.changedBars} of {take.comparison.totalBars} bars changed
              {" · "}Bass {signed(take.comparison.bassNoteDelta)}
              {" · "}Harmony {signed(take.comparison.harmonyNoteDelta)}</small>
          </button>
          <button type="button" className="take-listen"
            aria-label={"Play option " + (index + 1)}
            onClick={() => p.onAudition(index)}><Play size={12} aria-hidden="true" />Listen</button>
          <details className="take-diff">
            <summary>What changed?</summary>
            <p>{take.chordSummary || "No chord label changes"}</p>
            <p>Chord transitions: {signed(take.comparison.chordChangeDelta)} versus original.</p>
            {take.comparison.examples.length > 0
              ? <ul>{take.comparison.examples.map(line => <li key={line}>{line}</li>)}</ul>
              : <p>Same chord path; accompaniment texture and voicing may differ.</p>}
          </details>
          {take.savedId && <button type="button" className="text-button take-remove"
            aria-label={"Remove favorite " + (index + 1)}
            onClick={() => p.onRemoveSaved(take.savedId!)}>
            <Trash size={12} aria-hidden="true" /> Remove saved
          </button>}
        </div>)}
      </div>
      <p className="generation-hint" role="status">
        {p.previewIndex === null ? "Original selected. Choose a take to inspect or listen." :
          "Preview only: piano roll is read-only. The current project and exported MIDI stay unchanged."}
      </p>
      <div className="take-actions">
        <button type="button" className="primary-button" disabled={p.previewIndex === null}
          onClick={p.onAccept}><Check size={14} aria-hidden="true" />Accept selected take</button>
        <button type="button" className="secondary-button"
          disabled={p.previewIndex === null || !!selected?.savedId || savedCount >= 4}
          onClick={p.onSave}><SaveTake size={14} aria-hidden="true" />Save favorite</button>
        <button type="button" className="text-button" onClick={p.onDiscard}
          disabled={freshCount === 0}>
          <Close size={14} aria-hidden="true" />Clear takes
        </button>
      </div>
      <p className="generation-hint">
        {savedCount} of 4 favorites stored in browser autosave. They remain available
        after reload while the underlying arrangement is unchanged.
      </p>
    </>}
  </section>;
}
