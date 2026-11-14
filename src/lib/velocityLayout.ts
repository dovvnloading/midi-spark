import type { NoteEvent } from "./theory";
import { trackIndexOf } from "./tracks";

interface VelocityStem {
  left: number;
  width: number;
}

/** Divide a chord's onset among its visible velocity controls, keeping every
 * hit area inside the chord and before the following attack at any zoom. */
export function layoutVelocityStems(
  notes: readonly NoteEvent[], focusedTrack: number | null, zoomX: number,
): Map<number, VelocityStem> {
  const chords = new Map<number, number[]>();
  notes.forEach((note, index) => {
    if (focusedTrack !== null && trackIndexOf(note) !== focusedTrack) return;
    const chord = chords.get(note.timeStart);
    if (chord) chord.push(index);
    else chords.set(note.timeStart, [index]);
  });

  const stems = new Map<number, VelocityStem>();
  const onsets = [...chords.keys()].sort((a, b) => a - b);
  onsets.forEach((onset, i) => {
    const indices = chords.get(onset)!;
    const nextAttack = onsets[i + 1] ?? Infinity;
    const beats = indices.reduce((limit, index) =>
      Math.min(limit, notes[index].duration), Math.min(1, nextAttack - onset));
    const width = Math.min(18, beats * zoomX / indices.length);
    indices.forEach((index, rank) => {
      stems.set(index, { left: onset * zoomX + rank * width, width });
    });
  });
  return stems;
}
