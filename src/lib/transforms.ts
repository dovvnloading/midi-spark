import { Note } from "@tonaljs/tonal";
import { clamp, MAX_VELOCITY, MIN_VELOCITY, ROOT_NOTES } from "./constants";
import type { NoteEvent, ProgressionData } from "./theory";

/** A nonempty selection limits an operation to those indices; otherwise edit all notes. */
function targets(index: number, selection?: ReadonlySet<number>): boolean {
  return !selection || selection.size === 0 || selection.has(index);
}

function mapNotes(
  data: ProgressionData,
  selection: ReadonlySet<number> | undefined,
  edit: (note: NoteEvent) => NoteEvent,
): ProgressionData {
  let changed = false;
  const notes = data.notes.map((note, i) => {
    if (!targets(i, selection)) return note;
    const next = edit(note);
    if (next !== note) changed = true;
    return next;
  });
  return changed ? ensureBarsCoverNotes({ ...data, notes }) : data;
}

/** Grow the canvas when editing extends past the last bar; never shorten it. */
export function ensureBarsCoverNotes(data: ProgressionData): ProgressionData {
  const noteEnd = data.notes.reduce(
    (end, note) => Math.max(end, note.timeStart + Math.max(0, note.duration)),
    0,
  );
  const bars = Math.max(1, data.totalBars, Math.ceil(noteEnd / 4));
  return bars === data.totalBars ? data : { ...data, totalBars: bars };
}

function transposeChordLabel(label: string, semitones: number): string {
  const match = /^([A-G](?:#|b)?)(.*)$/.exec(label);
  if (!match) return label;
  const chroma = Note.chroma(match[1]);
  if (chroma === undefined) return label;
  const next = ((chroma + semitones) % 12 + 12) % 12;
  return ROOT_NOTES[next] + match[2];
}

/** Shift pitches (not their timing) without allowing MIDI overflow. */
export function transposeNotes(
  data: ProgressionData,
  semitones: number,
  selection?: ReadonlySet<number>,
): ProgressionData {
  if (!Number.isInteger(semitones) || semitones === 0) return data;
  const updated = mapNotes(data, selection, (note) => {
    const midi = note.midi + semitones;
    if (midi < 0 || midi > 127) return note;
    return { ...note, midi, name: Note.fromMidi(midi) || note.name };
  });
  if (updated === data) return data;
  // When every note is transposed, chord labels should follow the new harmony.
  const allNotesTargeted =
    !selection || selection.size === 0 ||
    data.notes.every((_, i) => selection.has(i));
  return allNotesTargeted
    ? {
        ...updated,
        chords: updated.chords.map((chord) => ({
          ...chord,
          name: transposeChordLabel(chord.name, semitones),
        })),
      }
    : updated;
}

/** Strength controls how far each note start moves toward the nearest gridline. */
export function quantizeNotes(
  data: ProgressionData,
  grid: number,
  strength: number = 100,
  selection?: ReadonlySet<number>,
): ProgressionData {
  if (!Number.isFinite(grid) || grid <= 0 || !Number.isFinite(strength)) return data;
  const fraction = clamp(strength, 0, 100) / 100;
  if (fraction === 0) return data;
  return mapNotes(data, selection, (note) => {
    const target = Math.round(note.timeStart / grid) * grid;
    const start = Math.max(
      0,
      Math.round((note.timeStart + (target - note.timeStart) * fraction) * 1e6) / 1e6,
    );
    return Math.abs(start - note.timeStart) < 1e-7
      ? note
      : { ...note, timeStart: start };
  });
}

/** Stable pseudo-random stream: seed outside a history dispatch, recreate inside it.
 *  React StrictMode can call a reducer twice, so transforms must be repeatable. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** At 100%, jitter starts up to ±0.16 quarter notes and velocity up to ±0.2. */
export function humanizeNotes(
  data: ProgressionData,
  amount: number,
  selection?: ReadonlySet<number>,
  random: () => number = Math.random,
): ProgressionData {
  if (!Number.isFinite(amount)) return data;
  const fraction = clamp(amount, 0, 100) / 100;
  if (fraction === 0) return data;

  return mapNotes(data, selection, (note) => {
    const start = Math.round(
      Math.max(0, note.timeStart + (random() * 2 - 1) * 0.16 * fraction) * 1e6,
    ) / 1e6;
    const velocity = Math.round(
      clamp(
        note.velocity + (random() * 2 - 1) * 0.2 * fraction,
        MIN_VELOCITY,
        MAX_VELOCITY,
      ) * 1e4,
    ) / 1e4;
    return start === note.timeStart && velocity === note.velocity
      ? note
      : { ...note, timeStart: start, velocity };
  });
}
