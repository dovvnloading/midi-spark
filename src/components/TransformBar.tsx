import { useMemo, useState } from "react";
import { ArrowRight, CopyPlus, Locate, Slice } from "./StudioIcons";
import { CustomDropdown } from "./CustomDropdown";
import { CustomSlider } from "./CustomSlider";
import { SNAP_OPTIONS, NOTE_LENGTH_OPTIONS } from "../lib/constants";
import { quantizedStart } from "../lib/transforms";

export interface TransformBarProps {
  noteStarts: number[]; scopeLabel: string;
  swingAmount: number; noteLength: number;
  onSwingAmountChange: (value: number) => void; onApplySwing: () => void;
  onNoteLengthChange: (value: number) => void; onChop: () => void; onDuplicateBar: () => void;
  onQuantize: (grid: number, strength: number) => void; onTranspose: (semitones: number) => void; onHumanize: (amount: number) => void;
}

function TimingPreview({ starts, grid, strength }: { starts: number[]; grid: number; strength: number }) {
  const { barStart, attacks } = useMemo(() => {
    const first = starts.reduce((earliest, start) => Math.min(earliest, start), Infinity);
    const barStart = 4 * Math.floor(first / 4);
    const attacks = [...new Set(starts.filter(start => start < barStart + 4))];
    return { barStart, attacks };
  }, [starts]);

  if (!attacks.length) return <p className="timing-empty">Draw or select notes to preview their timing.</p>;

  // Coincident chord onsets share a tick. Rasterize to the preview's coordinate
  // grid so dense imported patterns never generate a DOM node per note.
  const ticks = (times: number[], top: number) => [...new Set(times.map(time =>
    Math.round((time - barStart) * 50)))].map(x => `M${x + 1} ${top}v7`).join(" ");
  const divisions = Math.round(4 / grid);
  return <figure className="timing-preview">
    <figcaption><span>Timing preview</span><span>Bar {barStart / 4 + 1}</span></figcaption>
    <div className="timing-display">
      <div className="timing-axis" aria-hidden="true"><span>Before</span><span>After</span></div>
      <svg viewBox="0 0 202 36" preserveAspectRatio="none" role="img"
        aria-label={`Note starts before and after ${strength}% quantization in bar ${barStart / 4 + 1}`}>
        {Array.from({ length: divisions + 1 }, (_, step) => {
          const x = 1 + step * 200 / divisions;
          return <line key={step} x1={x} x2={x} y1={0} y2={36}
            className={Number.isInteger(step * grid) ? "timing-beat" : "timing-step"} />;
        })}
        <path className="timing-before" d={ticks(attacks, 5)} />
        <path className="timing-after" d={ticks(attacks.map(start =>
          quantizedStart(start, grid, strength / 100)), 23)} />
      </svg>
    </div>
  </figure>;
}

export function TransformBar(p: TransformBarProps) {
  const [grid, setGrid] = useState(0.25);
  const [strength, setStrength] = useState(100);
  const [amount, setAmount] = useState(25);
  const disabled = p.noteStarts.length === 0;

  return <div className="inspector-content transform-panel">
    <header className="rack-tool-header"><h2>Note tools</h2></header>
    <div className="edit-scope">
      <Locate size={16} />
      <div><span>Edit scope</span><strong>{p.scopeLabel}</strong></div>
      <span>{p.noteStarts.length} {p.noteStarts.length === 1 ? "note" : "notes"}</span>
    </div>

    <section className="note-tool-section">
      <h3>Quantize</h3>
      <TimingPreview starts={p.noteStarts} grid={grid} strength={strength} />
      <div className="note-tool-row"><span>Grid</span>
        <CustomDropdown ariaLabel="Quantization grid" value={grid}
          onChange={v => setGrid(Number(v))}
          options={SNAP_OPTIONS.filter(option => option.value > 0)} />
      </div>
      <div className="note-tool-row"><span>Strength</span><output>{strength}%</output></div>
      <CustomSlider min={0} max={100} step={5} value={strength}
        onChange={setStrength} label="Quantize strength" />
      <button type="button" className="secondary-button wide note-tool-apply"
        disabled={disabled || strength === 0}
        onClick={() => p.onQuantize(grid, strength)}>Apply quantize <ArrowRight size={14} /></button>
    </section>

    <section className="note-tool-section">
      <div className="note-tool-title"><h3>Transpose</h3><span>Semitones</span></div>
      <div className="transpose-steps" role="group" aria-label="Transpose pitch">
        {[-12, -1, 1, 12].map(semitones =>
          <button type="button" key={semitones} disabled={disabled} onClick={() => p.onTranspose(semitones)}
            aria-label={"Transpose " + (semitones < 0 ? "down " : "up ") + Math.abs(semitones) + " semitones"}>
            {semitones < 0 ? "−" : "+"}{Math.abs(semitones)}
          </button>)}
      </div>
    </section>

    <details className="compose-disclosure transform-more-disclosure">
      <summary><span>More note edits</span><small>Humanize, swing, chop</small></summary>
      <div className="compose-disclosure-body">
        <section className="note-tool-section">
          <div className="note-tool-title"><h3>Humanize</h3><output>{amount}%</output></div>
          <CustomSlider min={0} max={100} step={5} value={amount}
            onChange={setAmount} label="Humanization amount" />
          <button type="button" className="secondary-button wide note-tool-apply"
            disabled={disabled || amount === 0}
            onClick={() => p.onHumanize(amount)}>Apply humanize <ArrowRight size={14} /></button>
        </section>
        <section className="note-tool-section">
          <div className="note-tool-title"><h3>Swing</h3><output>{p.swingAmount}%</output></div>
          <CustomSlider min={0} max={100} value={p.swingAmount}
            onChange={p.onSwingAmountChange} label="Swing amount" />
          <button type="button" className="secondary-button wide note-tool-apply"
            disabled={disabled || p.swingAmount === 0}
            onClick={p.onApplySwing}>Apply swing <ArrowRight size={14} /></button>
        </section>
        <section className="note-tool-section">
          <h3>Reshape</h3>
          <div className="field-pair">
            <CustomDropdown ariaLabel="Chop length" value={p.noteLength}
              onChange={v => p.onNoteLengthChange(Number(v))}
              options={NOTE_LENGTH_OPTIONS} />
            <button type="button" className="secondary-button" disabled={disabled}
              onClick={p.onChop}><Slice size={14} />Chop</button>
          </div>
          <button type="button" className="text-button wide" disabled={disabled}
            onClick={p.onDuplicateBar}>
            <CopyPlus size={14} />Duplicate playhead bar
          </button>
        </section>
      </div>
    </details>
  </div>;
}
