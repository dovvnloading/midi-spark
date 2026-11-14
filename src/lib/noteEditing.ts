import { Note } from "@tonaljs/tonal";
import type { ProgressionData } from "./theory";
import { ensureBarsCoverNotes } from "./transforms";
import { clamp, FREE_SNAP, MAX_MIDI, MAX_PROJECT_BEATS, MAX_VELOCITY, MIN_VELOCITY } from "./constants";
import { constrainNoteDelta } from "./pianoGestures";

export type NoteField = "midi" | "timeStart" | "duration" | "velocity";

/** Immutable, undoable edit by stable note indices, including notes with identical onsets. */
export function editNoteField(
  progression: ProgressionData,
  indices: readonly number[],
  field: NoteField,
  rawValue: number,
): ProgressionData {
  if (!Number.isFinite(rawValue)) return progression;
  const targets = new Set(indices);
  if (!targets.size) return progression;
  let changed = false;
  const notes = progression.notes.map((note, index) => {
    if (!targets.has(index) || note[field] === rawValue) return note;
    const value = field === "midi" ? clamp(Math.round(rawValue), 0, MAX_MIDI)
      : field === "velocity" ? clamp(Math.round(rawValue * 100) / 100, MIN_VELOCITY, MAX_VELOCITY)
      : field === "duration" ? clamp(rawValue, Math.min(FREE_SNAP, note.duration), Math.max(note.duration, MAX_PROJECT_BEATS - note.timeStart))
      : clamp(rawValue, 0, Math.max(note.timeStart, MAX_PROJECT_BEATS - note.duration));
    if (value === note[field]) return note;
    changed = true;
    return field === "midi"
      ? { ...note, midi: value, name: Note.fromMidi(value) || note.name }
      : { ...note, [field]: value };
  });
  if (!changed) return progression;
  const updated = { ...progression, notes };
  return field === "timeStart" || field === "duration" ? ensureBarsCoverNotes(updated) : updated;
}

/** Keyboard nudges use the same group limits as moving or resizing with a pointer. */
export function nudgeNoteSelection(
  progression: ProgressionData, indices: ReadonlySet<number>,
  field: Exclude<NoteField, "velocity">, amount: number,
): ProgressionData {
  if (!indices.size || !Number.isFinite(amount)) return progression;
  const selected = progression.notes.filter((_, index) => indices.has(index));
  if (!selected.length) return progression;
  const delta = constrainNoteDelta(selected, field, field === "midi" ? Math.round(amount) : amount,
    field === "duration" ? Math.abs(amount) : FREE_SNAP);
  if (!delta) return progression;
  const notes = progression.notes.map((note, index) => {
    if (!indices.has(index)) return note;
    const value = note[field] + delta;
    return field === "midi" ? { ...note, midi: value, name: Note.fromMidi(value) || note.name }
      : { ...note, [field]: value };
  });
  return ensureBarsCoverNotes({ ...progression, notes });
}

/** One or ten percentage-point velocity changes on selected notes, independently clamped. */
export function nudgeNoteVelocities(
  progression: ProgressionData,
  indices: readonly number[],
  points: number,
): ProgressionData {
  if (!Number.isFinite(points)) return progression;
  const targets = new Set(indices);
  let changed = false;
  const notes = progression.notes.map((note, index) => {
    if (!targets.has(index)) return note;
    const velocity = clamp(Math.round(note.velocity * 100 + points) / 100, MIN_VELOCITY, MAX_VELOCITY);
    if (velocity === note.velocity) return note;
    changed = true;
    return { ...note, velocity };
  });
  return changed ? { ...progression, notes } : progression;
}
