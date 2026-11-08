import type { KeyboardEvent } from "react";
import { Note } from "@tonaljs/tonal";
import type { ProgressionData } from "../lib/theory";
import { listTracks, trackIndexOf } from "../lib/tracks";
import { clamp } from "../lib/constants";
import { editNoteField, nudgeNoteVelocities, type NoteField } from "../lib/noteEditing";

interface NotePrecisionEditorProps {
  progression: ProgressionData;
  focusedTrack: number | null;
  selectedIndices: Set<number>;
  onSelectionChange: (indices: Set<number>) => void;
  commit: (updater: (prev: ProgressionData | null) => ProgressionData | null) => void;
}

export function NotePrecisionEditor({
  progression, focusedTrack, selectedIndices, onSelectionChange, commit,
}: NotePrecisionEditorProps) {
  const trackNames = new Map(listTracks(progression).map(track => [track.index, track.name]));
  const visible = progression.notes
    .map((note, index) => ({ note, index }))
    .filter(({ note }) => focusedTrack === null || trackIndexOf(note) === focusedTrack)
    .sort((a, b) => a.note.timeStart - b.note.timeStart || a.note.midi - b.note.midi || a.index - b.index);
  const selectedVisible = visible.filter(({ index }) => selectedIndices.has(index)).map(({ index }) => index);
  const activeIndex = selectedVisible[0] ?? null;
  const activeNote = activeIndex === null ? null : progression.notes[activeIndex];

  const apply = (field: NoteField, text: string) => {
    if (activeIndex === null || !text.trim()) return;
    const number = Number(text);
    if (!Number.isFinite(number)) return;
    const indices = field === "velocity" ? selectedVisible : [activeIndex];
    const value = field === "velocity" ? number / 100 : number;
    commit(prev => prev ? editNoteField(prev, indices, field, value) : prev);
  };

  const nudge = (points: number) => {
    commit(prev => prev ? nudgeNoteVelocities(prev, selectedVisible, points) : prev);
  };

  const onFieldKey = (event: KeyboardEvent<HTMLInputElement>, original: number) => {
    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
    } else if (event.key === "Escape") {
      event.stopPropagation();
      event.currentTarget.value = String(original);
      event.currentTarget.blur();
    }
  };

  const velocityKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.shiftKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      const amount = clamp(Number(event.currentTarget.value) +
        (event.key === "ArrowUp" ? 10 : -10), 10, 100);
      event.currentTarget.value = String(amount);
      apply("velocity", String(amount));
    } else {
      onFieldKey(event, Math.round((activeNote?.velocity ?? 0.8) * 100));
    }
  };

  return <details className="note-precision-editor">
    <summary className="note-precision-summary">
      Precise note editing <span>{activeNote
        ? (Note.fromMidi(activeNote.midi) ?? activeNote.name) + " selected · expand to adjust"
        : "Choose a note · keyboard and touch controls"}</span>
    </summary>
    <div className="note-precision-body" role="group" aria-label="Precise note editing">
    <label className="note-precision-picker">Choose note
      <select data-testid="precision-note-select" aria-label="Choose note to edit" value={activeIndex ?? ""}
        onChange={event => onSelectionChange(event.target.value === ""
          ? new Set() : new Set([Number(event.target.value)]))}>
        <option value="">Choose a note…</option>
        {visible.map(({ note, index }) => <option key={index} value={index}>
          {trackNames.get(trackIndexOf(note)) ?? "Track " + (trackIndexOf(note) + 1)} · {Note.fromMidi(note.midi) ?? note.name} ·
          bar {Math.floor(note.timeStart / 4) + 1}, beat {(note.timeStart % 4 + 1).toFixed(2)} · note {index + 1}
        </option>)}
      </select>
    </label>
    {activeNote && <div className="note-precision-fields" key={activeIndex}>
      <label>Pitch (MIDI)
        <input data-testid="precision-note-pitch" aria-label="Selected note MIDI pitch" type="number"
          min={0} max={127} step={1} defaultValue={activeNote.midi}
          onBlur={event => apply("midi", event.currentTarget.value)}
          onKeyDown={event => onFieldKey(event, activeNote.midi)} />
      </label>
      <label>Start (beats)
        <input data-testid="precision-note-start" aria-label="Selected note start in quarter notes" type="number"
          min={0} max={1024} step={0.25} defaultValue={activeNote.timeStart}
          onBlur={event => apply("timeStart", event.currentTarget.value)}
          onKeyDown={event => onFieldKey(event, activeNote.timeStart)} />
      </label>
      <label>Length (beats)
        <input data-testid="precision-note-duration" aria-label="Selected note duration in quarter notes" type="number"
          min={0.015625} max={1024} step={0.25} defaultValue={activeNote.duration}
          onBlur={event => apply("duration", event.currentTarget.value)}
          onKeyDown={event => onFieldKey(event, activeNote.duration)} />
      </label>
      <label>Velocity (%)
        <input data-testid="precision-note-velocity" aria-label="Selected note velocity percent" type="number"
          min={10} max={100} step={1} defaultValue={Math.round(activeNote.velocity * 100)}
          onBlur={event => apply("velocity", event.currentTarget.value)}
          onKeyDown={velocityKey} />
      </label>
      <div className="velocity-nudge-controls" role="group" aria-label="Velocity nudges">
        {([-10, -1, 1, 10] as const).map(points => <button type="button" key={points}
          aria-label={(points > 0 ? "Increase" : "Decrease") + " selected velocity by " + Math.abs(points) + " percentage points"}
          onClick={() => nudge(points)}>{points > 0 ? "+" : "−"}{Math.abs(points)}</button>)}
      </div>
      {selectedVisible.length > 1 && <span className="precision-selection-count">Velocity edits apply to {selectedVisible.length} selected notes</span>}
    </div>}
    {!activeNote && <span className="precision-note-help">Select a note here or on the grid for exact keyboard and touch editing.</span>}
    </div>
  </details>;
}
