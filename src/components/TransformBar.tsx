import { ArrowDown, ArrowUp, CopyPlus, Scissors } from "lucide-react";
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
  const [grid, setGrid] = useState(0.25), [strength, setStrength] = useState(100), [amount, setAmount] = useState(25);
  const disabled = p.noteCount === 0;
  return <div className="inspector-content transform-panel">
    <div className="panel-intro"><span className="eyebrow">NOTE LAB</span><h2>Make it your own.</h2><p>Every change is undoable.</p></div>
    <div className="scope-pill"><span className="scope-dot" /><strong>{p.scopeLabel}</strong><span>{p.noteCount} notes</span></div>
    <section className="field-section"><h3>Quantize timing</h3><p className="field-description">Tighten the groove, keep the feel.</p>
      <div className="field-heading"><label>Grid</label><div className="compact-select"><CustomDropdown ariaLabel="Quantization grid" value={grid} onChange={v => setGrid(Number(v))} options={SNAP_OPTIONS.filter(o => o.value > 0)} /></div></div>
      <div className="field-heading"><label>Strength</label><output>{strength}<span>%</span></output></div>
      <CustomSlider min={0} max={100} step={5} value={strength} onChange={setStrength} label="Quantize strength" />
      <button className="secondary-button wide" disabled={disabled || strength === 0} onClick={() => p.onQuantize(grid, strength)}>Apply quantize</button>
    </section>
    <section className="field-section"><h3>Transpose pitch</h3><div className="transpose-grid">
      {[-12, -1, 1, 12].map(n => <button key={n} className="secondary-button" disabled={disabled} onClick={() => p.onTranspose(n)}
        aria-label={"Transpose " + (n < 0 ? "down " : "up ") + Math.abs(n) + " semitones"}>
        {n < 0 ? <ArrowDown size={13} /> : <ArrowUp size={13} />}{Math.abs(n) === 12 ? "Oct" : "1"}</button>)}
    </div></section>
    <section className="field-section"><div className="field-heading"><h3>Humanize</h3><output>{amount}<span>%</span></output></div>
      <p className="field-description">Subtle timing and velocity variation.</p>
      <CustomSlider min={0} max={100} step={5} value={amount} onChange={setAmount} label="Humanization amount" />
      <button className="secondary-button wide" disabled={disabled || amount === 0} onClick={() => p.onHumanize(amount)}>Apply humanize</button>
    </section>
    <section className="field-section"><div className="field-heading"><h3>Swing</h3><output>{p.swingAmount}<span>%</span></output></div>
      <CustomSlider min={0} max={100} value={p.swingAmount} onChange={p.onSwingAmountChange} label="Swing amount" />
      <button className="secondary-button wide" disabled={disabled || p.swingAmount === 0} onClick={p.onApplySwing}>Apply swing</button>
    </section>
    <section className="field-section"><h3>Reshape</h3><div className="field-pair"><CustomDropdown ariaLabel="Chop length" value={p.noteLength} onChange={v => p.onNoteLengthChange(Number(v))} options={NOTE_LENGTH_OPTIONS} />
      <button className="secondary-button" disabled={disabled} onClick={p.onChop}><Scissors size={14} />Chop</button></div>
      <button className="text-button wide" disabled={disabled} onClick={p.onDuplicateBar}><CopyPlus size={14} />Duplicate playhead bar</button>
    </section>
  </div>;
}
