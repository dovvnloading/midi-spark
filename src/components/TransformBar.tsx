import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Grid3X3,
  MoveUpRight,
  SlidersHorizontal,
  WandSparkles,
} from "lucide-react";
import { CustomDropdown } from "./CustomDropdown";
import { SNAP_OPTIONS } from "../lib/constants";

export interface TransformBarProps {
  noteCount: number;
  selectedCount: number;
  onQuantize: (grid: number, strength: number) => void;
  onTranspose: (semitones: number) => void;
  onHumanize: (amount: number) => void;
}

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
    <section className="relative z-20 mx-auto w-full max-w-6xl shrink-0" aria-label="Note Lab">
      <div className="hardware-panel flex min-h-12 flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-4">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls="note-lab-controls"
          onClick={() => setExpanded((open) => !open)}
          title="Expand note editing transforms"
          className="flex items-center gap-2.5 rounded-lg p-1 text-left hover:text-white"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#293954] text-[var(--accent)]">
            <SlidersHorizontal size={15} aria-hidden="true" />
          </div>
          <div>
            <span className="block text-[12px] font-bold leading-4 text-[var(--text-main)]">Note Lab</span>
            <span className="block text-[10px] leading-4 text-[var(--text-subtle)]">
              Timing · pitch · feel
            </span>
          </div>
          {expanded
            ? <ChevronUp size={14} className="ml-1 text-[var(--text-muted)]" aria-hidden="true" />
            : <ChevronDown size={14} className="ml-1 text-[var(--text-muted)]" aria-hidden="true" />}
        </button>
        <p className="text-[11px] text-[var(--text-muted)]">
          {selectedCount > 0
            ? selectedCount + " selected · affects selection"
            : noteCount > 0
              ? noteCount + " notes · affects all"
              : "Generate or import MIDI to edit"}
        </p>
      </div>

      {expanded && (
        <div id="note-lab-controls" className="hardware-panel mt-2 grid gap-3 p-3 lg:grid-cols-3">
          <div className="studio-group flex flex-col gap-3 p-4">
            <div className="flex items-center gap-2">
              <Grid3X3 size={16} className="text-[var(--accent)]" aria-hidden="true" />
              <h3 className="studio-heading">Quantize</h3>
            </div>
            <p className="studio-meta">
              Pull note starts toward the grid without flattening their timing.
            </p>
            <div className="flex items-center gap-3">
              <div className="w-24 shrink-0">
                <label className="studio-field-label mb-1.5 block">Grid</label>
                <CustomDropdown
                  ariaLabel="Quantization grid"
                  options={SNAP_OPTIONS.filter((option) => option.value > 0)}
                  value={grid}
                  onChange={(value) => setGrid(Number(value))}
                />
              </div>
              <label className="min-w-0 flex-1">
                <span className="studio-field-label mb-2 flex items-center justify-between gap-2">
                  <span>Strength</span>
                  <span className="font-mono text-[11px] font-normal normal-case tracking-normal text-[var(--text-main)]">
                    {strength}%
                  </span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={strength}
                  aria-label="Quantize strength"
                  onChange={(event) => setStrength(Number(event.target.value))}
                  className="h-8 w-full cursor-pointer"
                />
              </label>
            </div>
            <button
              type="button"
              onClick={() => onQuantize(grid, strength)}
              disabled={disabled || strength === 0}
              title="Quantize note starts, keeping note lengths unchanged"
              className="hardware-btn mt-auto h-9 w-full text-xs"
            >
              Apply quantize
            </button>
          </div>

          <div className="studio-group flex flex-col gap-3 p-4">
            <div className="flex items-center gap-2">
              <MoveUpRight size={16} className="text-[var(--accent)]" aria-hidden="true" />
              <h3 className="studio-heading">Transpose</h3>
            </div>
            <p className="studio-meta">
              Shift selected pitches in semitones or octaves.
            </p>
            <div className="mt-auto grid grid-cols-4 gap-1.5">
              {[-12, -1, 1, 12].map((semitones) => (
                <button
                  type="button"
                  key={semitones}
                  disabled={disabled}
                  onClick={() => onTranspose(semitones)}
                  aria-label={"Transpose " + (semitones > 0 ? "up " : "down ") + Math.abs(semitones) + " semitones"}
                  title={Math.abs(semitones) === 12 ? "One octave" : "One semitone"}
                  className="hardware-btn h-9 font-mono text-xs"
                >
                  {semitones > 0 ? "+" : ""}{semitones}
                </button>
              ))}
            </div>
            <p className="text-[10px] leading-4 text-[var(--text-subtle)]">
              Pitches outside the MIDI range are unchanged.
            </p>
          </div>

          <div className="studio-group flex flex-col gap-3 p-4">
            <div className="flex items-center gap-2">
              <WandSparkles size={16} className="text-[var(--accent)]" aria-hidden="true" />
              <h3 className="studio-heading">Humanize</h3>
            </div>
            <p className="studio-meta">
              Add a little variation to timing and velocity.
            </p>
            <label className="mt-auto">
              <span className="studio-field-label mb-1 flex items-center justify-between">
                <span>Amount</span>
                <span className="font-mono text-[11px] font-normal normal-case tracking-normal text-[var(--text-main)]">
                  {humanizeAmount}%
                </span>
              </span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={humanizeAmount}
                aria-label="Humanization amount"
                onChange={(event) => setHumanizeAmount(Number(event.target.value))}
                className="h-8 w-full cursor-pointer"
              />
            </label>
            <button
              type="button"
              onClick={() => onHumanize(humanizeAmount)}
              disabled={disabled || humanizeAmount === 0}
              title="Apply timing and velocity variation"
              className="hardware-btn h-9 w-full text-xs"
            >
              Apply humanize
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
