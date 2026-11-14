import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Note } from "@tonaljs/tonal";
import type { ProgressionData } from "../lib/theory";
import { trackIndexOf } from "../lib/tracks";
import { clamp, FREE_SNAP, MAX_PROJECT_BEATS, MAX_PROJECT_NOTES } from "../lib/constants";
import { editNoteField, nudgeNoteVelocities, type NoteField } from "../lib/noteEditing";
import { ensureBarsCoverNotes } from "../lib/transforms";
import { Plus, Trash } from "./StudioIcons";

interface NotePrecisionEditorProps {
  progression: ProgressionData;
  visibleIndices: readonly number[];
  trackNames: ReadonlyMap<number, string>;
  drawTrackIndex: number;
  currentTick: number;
  noteLength: number;
  step: number;
  selectedIndices: Set<number>;
  onSelectionChange: (indices: Set<number>) => void;
  commit: (updater: (prev: ProgressionData | null) => ProgressionData | null) => void;
}

interface NumberFieldProps {
  label: string;
  ariaLabel: string;
  testId: string;
  value: number | null;
  min: number;
  max: number;
  step: number;
  onApply: (value: number) => void;
  largeStep?: number;
}

function NumberField({ label, ariaLabel, testId, value, min, max, step, largeStep, onApply }: NumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      // Return to the score value without passing the cancelled draft to blur.
      event.currentTarget.value = value === null ? "" : String(value);
      event.currentTarget.blur();
    } else if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      // Native number steppers use min as their origin. Increment from the
      // actual value so free-timed notes keep their fractional offset.
      event.preventDefault();
      const increment = event.shiftKey && largeStep ? largeStep : step;
      const change = event.key === "ArrowUp" ? increment : -increment;
      const current = event.currentTarget.valueAsNumber;
      if (Number.isFinite(current)) setDraft(String(clamp(current + change, min, max)));
    }
  };
  return <label>{label}
    <input type="number" aria-label={ariaLabel} data-testid={testId} min={min} max={max} step={step}
      value={draft ?? value ?? ""} placeholder={value === null ? "Mixed" : undefined}
      onChange={event => setDraft(event.currentTarget.value)}
      onKeyDown={onKeyDown}
      onBlur={event => {
        const entered = event.currentTarget.valueAsNumber;
        if (draft !== null && Number.isFinite(entered) && entered !== value) onApply(entered);
        setDraft(null);
      }} />
  </label>;
}

export function NotePrecisionEditor({
  progression, visibleIndices, trackNames, drawTrackIndex, currentTick, noteLength, step,
  selectedIndices, onSelectionChange, commit,
}: NotePrecisionEditorProps) {
  const [open, setOpen] = useState(false);
  const addButton = useRef<HTMLButtonElement>(null);
  const selected = useMemo(() => visibleIndices.filter(index => selectedIndices.has(index)), [visibleIndices, selectedIndices]);
  const activeIndex = selected[0];
  const active = progression.notes[activeIndex];
  const velocity = active ? Math.round(active.velocity * 100) : null;
  const mixedVelocity = selected.some(index => Math.round(progression.notes[index].velocity * 100) !== velocity);
  const pitch = active?.midi ?? 60;
  const pitchName = Note.fromMidi(pitch) || "C4";
  const start = Math.max(0, currentTick);
  const insertHint = progression.notes.length >= MAX_PROJECT_NOTES ? "The project has reached its note limit"
    : start + noteLength > MAX_PROJECT_BEATS ? "Move the playhead earlier to fit the chosen length"
    : null;

  const addNote = () => {
    if (insertHint) return;
    const note = { midi: pitch, name: pitchName, timeStart: start, duration: noteLength, velocity: 0.8, trackIndex: drawTrackIndex };
    commit(prev => prev ? ensureBarsCoverNotes({ ...prev, notes: [...prev.notes, note] }) : prev);
    onSelectionChange(new Set([progression.notes.length]));
  };

  const apply = (field: NoteField, value: number) => {
    const indices = field === "velocity" ? selected : [activeIndex];
    commit(prev => prev ? editNoteField(prev, indices, field, field === "velocity" ? value / 100 : value) : prev);
  };

  return <details className="note-precision-editor" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="note-precision-summary">
      Precise note editing <span>{selected.length > 1 ? selected.length + " notes selected"
        : active ? pitchName + " · bar " + (Math.floor(active.timeStart / 4) + 1) +
          ", beat " + (1 + active.timeStart % 4).toFixed(2)
        : "Add or choose a note"}</span>
    </summary>
    {open && <div className="note-precision-body" role="group" aria-label="Precise note editing">
      {visibleIndices.length > 0 && <label className="note-precision-picker">Choose note
        <select data-testid="precision-note-select" aria-label="Choose note to edit" value={activeIndex ?? ""}
          onChange={event => onSelectionChange(event.target.value === ""
            ? new Set() : new Set([Number(event.target.value)]))}>
          <option value="">Choose a note…</option>
          {visibleIndices.map(index => {
            const note = progression.notes[index];
            return <option key={index} value={index}>
              {trackNames.get(trackIndexOf(note)) ?? "Track " + (trackIndexOf(note) + 1)} · {Note.fromMidi(note.midi) ?? note.name} ·
              bar {Math.floor(note.timeStart / 4) + 1}, beat {(note.timeStart % 4 + 1).toFixed(2)} · note {index + 1}
            </option>;
          })}
        </select>
      </label>}
      <button type="button" className="precision-note-add" ref={addButton} disabled={!!insertHint} onClick={addNote}
        title={insertHint ?? "Insert " + pitchName + " at the playhead using the Draw length"}>
        <Plus size={14} aria-hidden="true" />Add note at playhead
      </button>
      {active && <div className="note-precision-fields" key={activeIndex}>
        <NumberField label="Pitch (MIDI)" ariaLabel="Selected note MIDI pitch" testId="precision-note-pitch"
          min={0} max={127} step={1} value={active.midi} onApply={value => apply("midi", value)} />
        <NumberField label="Start (beats)" ariaLabel="Selected note start in quarter notes" testId="precision-note-start"
          min={0} max={Math.max(active.timeStart, MAX_PROJECT_BEATS - active.duration)} step={step}
          value={active.timeStart} onApply={value => apply("timeStart", value)} />
        <NumberField label="Length (beats)" ariaLabel="Selected note duration in quarter notes" testId="precision-note-duration"
          min={Math.min(FREE_SNAP, active.duration)} max={Math.max(active.duration, MAX_PROJECT_BEATS - active.timeStart)}
          step={step} value={active.duration} onApply={value => apply("duration", value)} />
        <NumberField label="Velocity (%)" ariaLabel="Selected note velocity percent" testId="precision-note-velocity"
          min={10} max={100} step={1} largeStep={10} value={mixedVelocity ? null : velocity}
          onApply={value => apply("velocity", value)} />
        <div className="velocity-nudge-controls" role="group" aria-label="Velocity nudges">
          {([-10, -1, 1, 10] as const).map(points => <button type="button" key={points}
            aria-label={(points > 0 ? "Increase" : "Decrease") + " selected velocity by " + Math.abs(points) + " percentage points"}
            onClick={() => commit(prev => prev ? nudgeNoteVelocities(prev, selected, points) : prev)}>
            {points > 0 ? "+" : "−"}{Math.abs(points)}
          </button>)}
        </div>
        <button type="button" className="precision-note-delete"
          onClick={() => {
            commit(prev => prev ? { ...prev, notes: prev.notes.filter((_, i) => !selectedIndices.has(i)) } : prev);
            onSelectionChange(new Set());
            addButton.current?.focus();
          }}><Trash size={14} aria-hidden="true" />{selected.length > 1 ? "Delete " + selected.length + " notes" : "Delete note"}</button>
        {selected.length > 1 && <span className="precision-selection-count">
          Pitch and timing edit {pitchName}. Velocity edits apply to all {selected.length} selected notes.
        </span>}
      </div>}
    </div>}
  </details>;
}
