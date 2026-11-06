import { useState } from "react";
import { ChevronDown, ChevronUp, Grid3X3, Sparkles, WandSparkles } from "lucide-react";
import { CustomDropdown } from "./CustomDropdown";
import { SNAP_OPTIONS } from "../lib/constants";

export interface TransformBarProps {
  noteCount: number;
  selectedCount: number;
  onQuantize: (grid: number, strength: number) => void;
  onTranspose: (semitones: number) => void;
  onHumanize: (amount: number) => void;
}

/** A collapsible, selection-aware toolkit; all actions commit one undo step. */
export function TransformBar({
  noteCount,
  selectedCount,
  onQuantize,
  onTranspose,
  onHumanize,
}: TransformBarProps) {
  const [expanded, setExpanded] = useState(false);
  const [grid, setGrid] = useState(0.25);
  const [strength, setStrength] = useState(100);
  const [humanizeAmount, setHumanizeAmount] = useState(30);
  const disabled = noteCount === 0;

  return (
    <section className="w-full max-w-6xl mx-auto shrink-0 z-20 relative" aria-label="Note Lab">
      <div className="hardware-panel px-4 py-2 flex flex-wrap gap-x-5 gap-y-2 items-center justify-between">
        <button
          type="button"
          className="flex gap-2 items-center font-bold uppercase tracking-widest text-[10px] text-[var(--accent)] hover:text-white"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          aria-controls="note-lab-controls"
          title="Open Note Lab: quantize, transpose, and humanize notes"
        >
          <Sparkles size={16} aria-hidden="true" />
          Note Lab
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <span className="text-[10px] font-mono text-[var(--text-muted)]">
          {selectedCount > 0
            ? String(selectedCount) + " notes selected · edits affect selection"
            : noteCount > 0
              ? String(noteCount) + " notes · edits affect whole pattern"
              : "Generate or import MIDI to transform notes"}
        </span>
      </div>
      {expanded && (
        <div
          id="note-lab-controls"
          className="hardware-panel grid grid-cols-1 xl:grid-cols-3 gap-3 p-3 mt-2"
        >
          <div className="rounded-md bg-[var(--piano-black)]/60 border border-[var(--border-color)] p-3 flex flex-col gap-3">
            <div className="flex gap-2 items-center text-[11px] font-bold text-[var(--text-main)]">
              <Grid3X3 size={15} className="text-[var(--accent)]" />
              Quantize timing
            </div>
            <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
              Grid
              <div className="w-28">
                <CustomDropdown
                  ariaLabel="Quantization grid"
                  options={SNAP_OPTIONS.filter((o) => o.value > 0)}
                  value={grid}
                  onChange={(value) => setGrid(Number(value))}
                />
              </div>
              <label className="flex-1 flex flex-col gap-1">
                <span>Strength {strength}%</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={strength}
                  onChange={(event) => setStrength(Number(event.target.value))}
                  className="w-full accent-[var(--accent)]"
                />
              </label>
            </div>
            <button
              type="button"
              className="hardware-btn px-3 py-2 text-[10px] uppercase tracking-widest"
              onClick={() => onQuantize(grid, strength)}
              disabled={disabled || strength === 0}
              title="Move note starts toward the nearest gridline; durations are preserved"
            >
              Apply quantize
            </button>
          </div>
          <div className="rounded-md bg-[var(--piano-black)]/60 border border-[var(--border-color)] p-3 flex flex-col gap-3">
            <div className="text-[11px] font-bold text-[var(--text-main)]">Transpose pitch</div>
            <p className="text-[10px] text-[var(--text-muted)]">
              Shift by semitones or octaves, within the MIDI 0–127 range.
            </p>
            <div className="grid grid-cols-4 gap-2 mt-auto">
              {[-12, -1, 1, 12].map((semitones) => (
                <button
                  type="button"
                  key={semitones}
                  disabled={disabled}
                  className="hardware-btn py-2 text-[11px] font-mono"
                  onClick={() => onTranspose(semitones)}
                  aria-label={"Transpose " + (semitones > 0 ? "up " : "down ") + Math.abs(semitones) + " semitones"}
                >
                  {semitones > 0 ? "+" : ""}{semitones}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-md bg-[var(--piano-black)]/60 border border-[var(--border-color)] p-3 flex flex-col gap-3">
            <div className="flex gap-2 items-center text-[11px] font-bold text-[var(--text-main)]">
              <WandSparkles size={15} className="text-[var(--accent)]" />
              Humanize groove
            </div>
            <label className="flex flex-col gap-1 text-[10px] text-[var(--text-muted)]">
              Timing + velocity variation · {humanizeAmount}%
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={humanizeAmount}
                onChange={(event) => setHumanizeAmount(Number(event.target.value))}
                className="w-full accent-[var(--accent)]"
              />
            </label>
            <button
              type="button"
              className="hardware-btn px-3 py-2 text-[10px] uppercase tracking-widest mt-auto"
              onClick={() => onHumanize(humanizeAmount)}
              disabled={disabled || humanizeAmount === 0}
              title="Add small randomized note timing and velocity variation"
            >
              Apply humanize
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
