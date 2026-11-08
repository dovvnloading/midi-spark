import type { NoteEvent, ProgressionData } from "./theory";
import { trackIndexOf } from "./tracks";

/** Scope controls which user notes guide the generator, never what it may edit. */
export type MelodySourceScope = "track" | "selected" | "loop";

export interface MelodyScopeOptions {
  sourceScope?: MelodySourceScope;
  /** Indices into ProgressionData.notes, not positions within the melody track. */
  sourceNoteIndices?: readonly number[];
  /** In quarter-note units, captured from the piano-roll timeline selection. */
  sourceLoopRange?: { start: number; end: number } | null;
}

export type ResolvedMelody =
  | { ok: true; notes: NoteEvent[]; entireTrack: NoteEvent[];
      /** Exact input phrase bounds. Harmonization may round these to bars. */
      phraseStart: number; phraseEnd: number; scope: MelodySourceScope }
  | { ok: false; reason: string };

export function resolveMelodyScope(
  data: ProgressionData, trackIndex: number, opts: MelodyScopeOptions = {},
): ResolvedMelody {
  if (!Number.isInteger(trackIndex) || trackIndex < 0) {
    return { ok: false, reason: "Choose a valid source melody track." };
  }
  const entireTrack = data.notes.filter(note => trackIndexOf(note) === trackIndex);
  if (!entireTrack.length) return { ok: false, reason: "Draw or import notes on the source track first." };
  const scope = opts.sourceScope ?? "track";
  if (!["track", "selected", "loop"].includes(scope)) {
    return { ok: false, reason: "Choose a valid source phrase scope." };
  }

  let notes: NoteEvent[];
  let phraseStart: number;
  let phraseEnd: number;
  if (scope === "selected") {
    const indices = opts.sourceNoteIndices ?? [];
    if (indices.length === 0) {
      return { ok: false, reason: "Select melody notes in the piano roll before generating." };
    }
    const distinct = new Set(indices);
    if (distinct.size !== indices.length || indices.some(index =>
      !Number.isInteger(index) || index < 0 || index >= data.notes.length ||
      trackIndexOf(data.notes[index]) !== trackIndex)) {
      return { ok: false, reason: "The selection must contain only notes from the chosen melody track." };
    }
    notes = indices.map(index => data.notes[index]).sort((a, b) =>
      a.timeStart - b.timeStart || b.midi - a.midi);
    phraseStart = Math.min(...notes.map(note => note.timeStart));
    phraseEnd = Math.max(...notes.map(note => note.timeStart + note.duration));
  } else if (scope === "loop") {
    const range = opts.sourceLoopRange;
    if (!range || !Number.isFinite(range.start) || !Number.isFinite(range.end) ||
      range.start < 0 || range.end <= range.start ||
      range.end > Math.max(4, data.totalBars * 4) + 1 / 64) {
      return { ok: false, reason: "Set a valid loop range on the timeline (Shift-drag the ruler) first." };
    }
    phraseStart = range.start;
    phraseEnd = range.end;
    // Follow notes whose attacks occur in the explicit loop. Crossing notes
    // are left intact in the source; generators clamp any new note tails.
    notes = entireTrack.filter(note => note.timeStart >= phraseStart && note.timeStart < phraseEnd);
    if (!notes.length) {
      return { ok: false, reason: "The loop contains no note attacks on the chosen melody track." };
    }
  } else {
    notes = entireTrack;
    phraseStart = Math.min(...notes.map(note => note.timeStart));
    phraseEnd = Math.max(...notes.map(note => note.timeStart + note.duration));
  }
  if (!Number.isFinite(phraseStart) || !Number.isFinite(phraseEnd) ||
    phraseStart < 0 || phraseEnd <= phraseStart) {
    return { ok: false, reason: "The source melody has invalid note timing." };
  }
  return { ok: true, notes, entireTrack, phraseStart, phraseEnd, scope };
}
