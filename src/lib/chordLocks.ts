import type { ChordEvent, ProgressionData } from "./theory";

function isGeneratedChord(chord: ChordEvent): boolean {
  return Number.isInteger(chord.generatedSourceTrackIndex) &&
    (chord.generatedSourceTrackIndex ?? -1) >= 0;
}

/** Toggle ownership-aware chord/region protection as a single undoable edit.
 * The source notes and generated notes are not touched by this action. */
export function toggleChordRegionLock(
  progression: ProgressionData, chordIndex: number,
): ProgressionData {
  const chord = progression.chords[chordIndex];
  if (!Number.isInteger(chordIndex) || !chord || !isGeneratedChord(chord)) return progression;
  return {
    ...progression,
    chords: progression.chords.map((item, index) =>
      index === chordIndex ? { ...item, locked: !item.locked } : item),
  };
}

/** Unlock only a given melody source's owned regions, never another track's
 * chords or user-authored labels. Reversibility is delegated to the editor's
 * standard history store. */
export function unlockChordRegions(
  progression: ProgressionData, sourceTrackIndex: number,
): ProgressionData {
  if (!progression.chords.some(chord =>
    chord.generatedSourceTrackIndex === sourceTrackIndex && chord.locked)) return progression;
  return {
    ...progression,
    chords: progression.chords.map(chord =>
      chord.generatedSourceTrackIndex === sourceTrackIndex && chord.locked
        ? { ...chord, locked: false } : chord),
  };
}
