import { describe, expect, it } from "vitest";
import { Note } from "@tonaljs/tonal";
import { generateFromMelody, type MelodyGenerationOptions } from "../src/lib/adaptive";
import { toggleChordRegionLock, unlockChordRegions } from "../src/lib/chordLocks";
import { seededRandom } from "../src/lib/random";
import type { NoteEvent, ProgressionData } from "../src/lib/theory";

const note = (midi: number, timeStart: number, duration = 1, trackIndex = 0): NoteEvent => ({
  midi, name: Note.fromMidi(midi)!, timeStart, duration, velocity: 0.72, trackIndex,
});
function melody(): ProgressionData {
  return {
    notes: [
      note(72, 0), note(76, 1), note(79, 2), note(76, 3),
      note(74, 4), note(77, 5), note(81, 6), note(77, 7),
      note(79, 8), note(76, 9), note(74, 10), note(72, 11),
      note(72, 12), note(74, 13), note(76, 14), note(72, 15),
    ],
    chords: [], totalBars: 4,
    tracks: [
      { index: 0, name: "Original melody", channel: 1 },
      { index: 4, name: "User pad", channel: 4 },
    ],
  };
}
const options: MelodyGenerationOptions = {
  sourceTrackIndex: 0, root: "C", mode: "major",
  tension: 40, harmonicFit: 80, density: "balanced",
  keyStrategy: "manual", harmonicPacing: "bar",
  harmonyExploration: 62, phraseCoherence: 75,
};
function generate(source: ProgressionData, settings: MelodyGenerationOptions = options, seed = 7) {
  const result = generateFromMelody(source, settings, seededRandom(seed));
  if (!result.ok) throw Error(result.reason);
  return result;
}
const inRegion = (note: NoteEvent, from: number, to: number) =>
  note.timeStart >= from && note.timeStart < to;
const accompaniment = (data: ProgressionData, indices: readonly number[]) =>
  data.notes.filter(note => indices.includes(note.trackIndex ?? 0));

describe("chord lock operations", () => {
  it("toggles only generated chord labels, immutably", () => {
    const generated = generate(melody());
    const source = {
      ...generated.progression,
      chords: [
        { name: "Custom", timeStart: 0, duration: 4 },
        ...generated.progression.chords,
      ],
    };
    expect(toggleChordRegionLock(source, 0)).toBe(source);
    const locked = toggleChordRegionLock(source, 2);
    expect(locked).not.toBe(source);
    expect(locked.chords[2].locked).toBe(true);
    expect(source.chords[2].locked).toBeUndefined();
    expect(locked.notes).toBe(source.notes);
    const unlocked = toggleChordRegionLock(locked, 2);
    expect(unlocked.chords[2].locked).toBe(false);
    expect(unlocked.chords[0]).toBe(source.chords[0]);
  });

  it("preserves locked chord label, timing and exact bass/harmony MIDI when regenerating", () => {
    const source = melody();
    source.notes.push(note(55, 2.5, 2, 4)); // non-source original MIDI
    const first = generate(source);
    const locked = toggleChordRegionLock(first.progression, 1); // bar 2
    const originalLock = locked.chords[1];
    const previousNotes = accompaniment(locked, first.generatedTrackIndices).filter(n =>
      inRegion(n, originalLock.timeStart, originalLock.timeStart + originalLock.duration));
    const newTake = generate(locked, { ...options, density: "active" }, 4242);
    const keptLock = newTake.progression.chords.find(chord =>
      chord.timeStart === originalLock.timeStart && chord.generatedSourceTrackIndex === 0);
    expect(keptLock).toEqual(originalLock);
    const nextNotes = accompaniment(newTake.progression, first.generatedTrackIndices).filter(n =>
      inRegion(n, originalLock.timeStart, originalLock.timeStart + originalLock.duration));
    expect(nextNotes).toEqual(previousNotes);
    for (let i = 0; i < nextNotes.length; i++) expect(nextNotes[i]).toBe(previousNotes[i]);
    expect(newTake.progression.notes.filter(n => n.trackIndex === 0))
      .toEqual(source.notes.filter(n => n.trackIndex === 0));
    expect(newTake.progression.notes.find(n => n.trackIndex === 4))
      .toBe(source.notes.find(n => n.trackIndex === 4));
    expect(newTake.progression.tracks).toEqual(first.progression.tracks);
    expect(newTake.progression.notes.filter(n => n.trackIndex !== 0 &&
      n.trackIndex !== 4 && !inRegion(n, 4, 8)))
      .not.toEqual(first.progression.notes.filter(n => n.trackIndex !== 0 &&
        n.trackIndex !== 4 && !inRegion(n, 4, 8)));
  });

  it("enforces locks even with legacy zero-exploration search", () => {
    const first = generate(melody(), { ...options, harmonyExploration: 0 }, 19);
    const locked = toggleChordRegionLock(first.progression, 0);
    const after = generate(locked,
      { ...options, harmonyExploration: 0, density: "sparse" }, 999);
    expect(after.progression.chords[0]).toEqual(locked.chords[0]);
    expect(accompaniment(after.progression, first.generatedTrackIndices).filter(n => inRegion(n, 0, 4)))
      .toEqual(accompaniment(locked, first.generatedTrackIndices).filter(n => inRegion(n, 0, 4)));
  });

  it("maintains half-bar locks after changing generation pacing to one chord per bar", () => {
    const first = generate(melody(), { ...options, harmonicPacing: "half-bar" }, 47);
    expect(first.progression.chords).toHaveLength(8);
    const locked = toggleChordRegionLock(first.progression, 1); // beat 3 in bar 1
    const old = locked.chords[1];
    const beforeNotes = accompaniment(locked, first.generatedTrackIndices).filter(n =>
      inRegion(n, old.timeStart, old.timeStart + old.duration));
    const after = generate(locked, { ...options, harmonicPacing: "bar" }, 83);
    expect(after.progression.chords.find(c => c.timeStart === 2 &&
      c.generatedSourceTrackIndex === 0)).toEqual(old);
    expect(after.progression.chords.filter(c => c.timeStart < 4)).toHaveLength(2);
    expect(accompaniment(after.progression, first.generatedTrackIndices).filter(n =>
      inRegion(n, old.timeStart, old.timeStart + old.duration))).toEqual(beforeNotes);
  });

  it("scoped regeneration respects protected regions and untouched outside sections", () => {
    const first = generate(melody());
    const locked = toggleChordRegionLock(first.progression, 1);
    const outsideChords = locked.chords.filter(c => c.timeStart < 4 || c.timeStart >= 12);
    const outsideNotes = accompaniment(locked, first.generatedTrackIndices)
      .filter(n => n.timeStart < 4 || n.timeStart >= 12);
    const after = generate(locked, {
      ...options, sourceScope: "loop", sourceLoopRange: { start: 4, end: 12 },
      density: "active",
    }, 107);
    expect(after.progression.chords.filter(c => c.timeStart < 4 || c.timeStart >= 12)).toEqual(outsideChords);
    expect(accompaniment(after.progression, first.generatedTrackIndices)
      .filter(n => n.timeStart < 4 || n.timeStart >= 12)).toEqual(outsideNotes);
    expect(after.progression.chords.find(c => c.timeStart === 4)).toEqual(locked.chords[1]);
  });

  it("refuses unavailable, conflicting, or malformed locked constraints atomically", () => {
    const src = melody();
    src.chords = [{ name: "Cmaj7", timeStart: 0, duration: 4,
      generatedSourceTrackIndex: 0, locked: true }];
    const original = JSON.stringify(src);
    const notInPalette = generateFromMelody(src,
      { ...options, tension: 0 }, seededRandom(10));
    expect(notInPalette.ok).toBe(false);
    if (!notInPalette.ok) expect(notInPalette.reason).toMatch(/Locked chord Cmaj7/);
    expect(JSON.stringify(src)).toBe(original);

    const overlap = {
      ...src,
      chords: [...src.chords,
        { name: "G", timeStart: 2, duration: 2, generatedSourceTrackIndex: 0, locked: true }],
    };
    const incompatible = generateFromMelody(overlap, options, seededRandom(10));
    expect(incompatible.ok).toBe(false);
    if (!incompatible.ok) expect(incompatible.reason).toMatch(/conflict|overlap/i);
    const broken = {
      ...src,
      chords: [{ ...src.chords[0], timeStart: 0.5 }],
    };
    const invalid = generateFromMelody(broken, options, seededRandom(10));
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.reason).toMatch(/unsupported timing/i);
  });

  it("unlocks only the selected source's regions, keeping the rest unchanged", () => {
    const generated = generate(melody()).progression;
    const input: ProgressionData = {
      ...generated, chords: [
        { ...generated.chords[0], locked: true },
        { ...generated.chords[1], locked: true },
        { name: "F", timeStart: 0, duration: 4, generatedSourceTrackIndex: 9, locked: true },
        { name: "User chord", timeStart: 12, duration: 4 },
      ],
    };
    const unlocked = unlockChordRegions(input, 0);
    expect(unlocked.chords.map(c => c.locked)).toEqual([false, false, true, undefined]);
    expect(unlocked.chords[2]).toBe(input.chords[2]);
    expect(unlocked.notes).toBe(input.notes);
    expect(unlockChordRegions(unlocked, 0)).toBe(unlocked);
  });
});
