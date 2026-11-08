import { Note } from "@tonaljs/tonal";
import type { ProgressionData } from "./theory";
import { ensureBarsCoverNotes } from "./transforms";
import { clamp, FREE_SNAP, MAX_MIDI, MAX_VELOCITY, MIN_VELOCITY } from "./constants";

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
  const value = field === "midi" ? clamp(Math.round(rawValue), 0, MAX_MIDI)
    : field === "velocity" ? clamp(Math.round(rawValue * 100) / 100, MIN_VELOCITY, MAX_VELOCITY)
    : field === "duration" ? clamp(rawValue, FREE_SNAP, 1024)
    : clamp(rawValue, 0, 1024);
  let changed = false;
  const notes = progression.notes.map((note, index) => {
    if (!targets.has(index) || note[field] === value) return note;
    changed = true;
    return field === "midi"
      ? { ...note, midi: value, name: Note.fromMidi(value) || note.name }
      : { ...note, [field]: value };
  });
  if (!changed) return progression;
  const updated = { ...progression, notes };
  return field === "timeStart" || field === "duration" ? ensureBarsCoverNotes(updated) : updated;
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
