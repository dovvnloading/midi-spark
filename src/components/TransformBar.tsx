import { ArrowDown, ArrowUp, CopyPlus, Slice } from "./StudioIcons";
import { useState } from "react";
import { CustomDropdown } from "./CustomDropdown";
import { CustomSlider } from "./CustomSlider";
import { SNAP_OPTIONS, NOTE_LENGTH_OPTIONS } from "../lib/constants";
export interface TransformBarProps {
  noteCount: number; selectedCount: number; scopeLabel: string;
  swingAmount: number; noteLength: number;
  onSwingAmountChange: (value: number) => void; onApplySwing: () => void;
  onNoteLengthChange: (value: number) => void; onChop: () => void; onDuplicateBar: () => void;
  onQuantize: (grid: number, strength: number) => void; onTranspose: (semitones: number) => void; onHumanize: (amount: number) => void;
}
export function TransformBar(p: TransformBarProps) {
  const [grid, setGrid] = useState(0.25);
  const [strength, setStrength] = useState(100);
  const [amount, setAmount] = useState(25);
  const disabled = p.noteCount === 0;

  return <div className="inspector-content transform-panel">
    <header className="tool-panel-intro">
      <span className="eyebrow">NOTE LAB</span>
      <h2>Edit notes.</h2>
    </header>
    <div className="scope-pill"><span className="scope-dot" />
      <strong>{p.scopeLabel}</strong><span>{p.noteCount} notes</span>
    </div>

    <section className="field-section">
      <h3>Quantize timing</h3>
      <div className="field-heading"><label>Grid</label>
        <div className="compact-select">
          <CustomDropdown ariaLabel="Quantization grid" value={grid}
            onChange={v => setGrid(Number(v))}
            options={SNAP_OPTIONS.filter(option => option.value > 0)} />
        </div>
      </div>
      <div className="field-heading"><label>Strength</label>
        <output>{strength}<span>%</span></output>
      </div>
      <CustomSlider min={0} max={100} step={5} value={strength}
        onChange={setStrength} label="Quantize strength" />
      <button type="button" className="secondary-button wide"
        disabled={disabled || strength === 0}
        onClick={() => p.onQuantize(grid, strength)}>Apply quantize</button>
    </section>

    <section className="field-section">
      <h3>Transpose pitch</h3>
      <div className="transpose-grid">
        {[-12, -1, 1, 12].map(semitones =>
          <button type="button" key={semitones} className="secondary-button"
            disabled={disabled} onClick={() => p.onTranspose(semitones)}
            aria-label={"Transpose " + (semitones < 0 ? "down " : "up ") +
              Math.abs(semitones) + " semitones"}>
            {semitones < 0 ? <ArrowDown size={13} /> : <ArrowUp size={13} />}
            {Math.abs(semitones) === 12 ? "Oct" : "1"}
          </button>)}
      </div>
    </section>

    <details className="compose-disclosure transform-more-disclosure">
      <summary><span>More note edits</span><small>Humanize · Swing · Chop</small></summary>
      <div className="compose-disclosure-body">
        <section className="field-section">
          <div className="field-heading"><h3>Humanize</h3><output>{amount}<span>%</span></output></div>
          <CustomSlider min={0} max={100} step={5} value={amount}
            onChange={setAmount} label="Humanization amount" />
          <button type="button" className="secondary-button wide"
            disabled={disabled || amount === 0}
            onClick={() => p.onHumanize(amount)}>Apply humanize</button>
        </section>
        <section className="field-section">
          <div className="field-heading"><h3>Swing</h3>
            <output>{p.swingAmount}<span>%</span></output></div>
          <CustomSlider min={0} max={100} value={p.swingAmount}
            onChange={p.onSwingAmountChange} label="Swing amount" />
          <button type="button" className="secondary-button wide"
            disabled={disabled || p.swingAmount === 0}
            onClick={p.onApplySwing}>Apply swing</button>
        </section>
        <section className="field-section">
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
