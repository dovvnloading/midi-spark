import { useState } from "react";
import { CustomDropdown } from "./CustomDropdown";
import type { HarmonyConstraint } from "../lib/theory";
import type { MelodyKeyStrategy } from "../lib/adaptive";

export interface HarmonyGuideEditorProps {
  sourceTrackIndex: number | null;
  totalBars: number | null;
  availableChords: readonly string[];
  keyStrategy: MelodyKeyStrategy;
  guides: readonly { index: number; guide: HarmonyConstraint }[];
  onAddGuide: (bar: number, chord: string, kind: HarmonyConstraint["kind"]) => void;
  onRemoveGuide: (index: number) => void;
}

/** A small, keyboard-accessible editor for composer-authored constraints.
 * It never changes existing MIDI: edits enter the normal undo history,
 * and the next harmonization runs the actual hard-constrained search. */
export function HarmonyGuideEditor(p: HarmonyGuideEditorProps) {
  const [bar, setBar] = useState(0);
  const [chord, setChord] = useState("");
  const count = Math.max(0, Math.min(64, p.totalBars ?? 0));
  const currentBar = Math.max(0, Math.min(count - 1, bar));
  const currentChord = p.availableChords.includes(chord) ? chord : p.availableChords[0] ?? "";
  const enabled = p.sourceTrackIndex !== null && count > 0 && !!currentChord;

  return <section className="harmony-guide-editor" aria-label="Chord guide">
    <div className="field-heading">
      <h4>Chord guide</h4>
      <span className="field-hint">{p.guides.length} guides</span>
    </div>
    <p className="generation-hint">Pin a chord for an entire bar, or exclude it
      from that bar. This guides the next harmonization without freezing the
      bass/harmony notes. Use a chord padlock in the piano roll to protect
      existing notes as well.</p>
    {enabled ? <>
      <div className="field-pair labeled-field-pair">
        <label className="field-control">
          <span>Guide bar</span>
          <CustomDropdown ariaLabel="Guide bar" value={currentBar + 1}
            options={Array.from({ length: count }, (_, i) => ({
              label: "Bar " + (i + 1), value: i + 1,
            }))} onChange={value => setBar(Number(value) - 1)} />
        </label>
        <label className="field-control">
          <span>Chord</span>
          <CustomDropdown ariaLabel="Guide chord" value={currentChord}
            options={[...p.availableChords]} onChange={value => setChord(String(value))} />
        </label>
      </div>
      <div className="harmony-guide-actions">
        <button className="secondary-button" type="button"
          onClick={() => p.onAddGuide(currentBar, currentChord, "require")}>
          Pin chord
        </button>
        <button className="secondary-button" type="button"
          onClick={() => p.onAddGuide(currentBar, currentChord, "avoid")}>
          Avoid chord
        </button>
      </div>
      {p.keyStrategy === "detect" && <p className="generation-hint" role="status">
        Choices use the Compose key. If melody key detection chooses a different key,
        an incompatible guide will be reported rather than silently changed.
        Use Compose key for predictable chord guides.
      </p>}
    </> : <p className="generation-hint" role="status">
      Choose a melody source track and a valid key to add chord guides.
    </p>}
    {p.guides.length > 0 && <ul className="harmony-guide-list" aria-label="Current chord guides">
      {p.guides.map(({ index, guide }) => <li key={index} className="harmony-guide-item">
        <span><strong>Bar {guide.bar + 1}</strong> · {guide.kind === "require" ? "Pin" : "Avoid"} {guide.chord}</span>
        <button type="button" className="text-button"
          aria-label={"Remove " + (guide.kind === "require" ? "pinned " : "excluded ") +
            guide.chord + " from bar " + (guide.bar + 1)}
          onClick={() => p.onRemoveGuide(index)}>Remove</button>
      </li>)}
    </ul>}
  </section>;
}
