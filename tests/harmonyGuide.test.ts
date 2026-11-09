import { describe, expect, it } from "vitest";
import { Note } from "@tonaljs/tonal";
import { availableHarmonyChords, generateFromMelody, type MelodyGenerationOptions } from "../src/lib/adaptive";
import { addHarmonyGuide, removeHarmonyGuide } from "../src/lib/harmonyGuide";
import { toggleChordRegionLock } from "../src/lib/chordLocks";
import { seededRandom } from "../src/lib/random";
import type { HarmonyConstraint, NoteEvent, ProgressionData } from "../src/lib/theory";

const note = (midi: number, timeStart: number, trackIndex = 0): NoteEvent => ({
  midi, name: Note.fromMidi(midi)!, timeStart, duration: 0.9,
  velocity: 0.74, trackIndex,
});
const melody = (): ProgressionData => ({
  totalBars: 4, chords: [], notes: [
    note(72, 0), note(76, 1), note(79, 2), note(76, 3),
    note(74, 4), note(77, 5), note(79, 6), note(77, 7),
    note(76, 8), note(79, 9), note(72, 10), note(74, 11),
    note(72, 12), note(74, 13), note(76, 14), note(72, 15),
    note(55, 2, 7),
  ],
  tracks: [
    { index: 0, name: "Lead", channel: 0 },
    { index: 7, name: "Imported pad", channel: 7 },
  ],
});
const settings: MelodyGenerationOptions = {
  sourceTrackIndex: 0, root: "C", mode: "major", tension: 35,
  harmonicFit: 85, density: "balanced", keyStrategy: "manual",
  harmonicPacing: "adaptive", harmonyExploration: 62, phraseCoherence: 65,
};
const requireChord = (bar: number, chord: string, sourceTrackIndex = 0): HarmonyConstraint =>
  ({ sourceTrackIndex, bar, kind: "require", chord });
const avoidChord = (bar: number, chord: string, sourceTrackIndex = 0): HarmonyConstraint =>
  ({ sourceTrackIndex, bar, kind: "avoid", chord });
function add(data: ProgressionData, constraint: HarmonyConstraint) {
  const edit = addHarmonyGuide(data, constraint);
  if (!edit.ok) throw Error(edit.reason);
  return edit.progression;
}
function harmonize(data: ProgressionData, options = settings, seed = 89) {
  const result = generateFromMelody(data, options, seededRandom(seed));
  if (!result.ok) throw Error(result.reason);
  return result;
}

describe("composer-authored harmonic constraints", () => {
  it("offers exact chord candidates and stores source-specific, undoable constraints", () => {
    const chords = availableHarmonyChords("C", "major", 35);
    expect(chords).toContain("C");
    expect(chords).toContain("G");
    expect(chords.length).toBeGreaterThan(8);
    const initial = melody();
    const first = add(initial, requireChord(1, "G"));
    expect(initial.harmonyConstraints).toBeUndefined();
    expect(first.harmonyConstraints).toEqual([requireChord(1, "G")]);
    expect(first.notes).toBe(initial.notes);
    expect(add(first, requireChord(1, "G"))).toBe(first);
    const replaced = add(first, requireChord(1, "C"));
    expect(replaced.harmonyConstraints).toEqual([requireChord(1, "C")]);
    const avoided = add(replaced, avoidChord(1, "G", 7));
    expect(avoided.harmonyConstraints).toHaveLength(2);
    expect(removeHarmonyGuide(avoided, 1).harmonyConstraints).toEqual([requireChord(1, "C")]);
    expect(removeHarmonyGuide(avoided, 8)).toBe(avoided);
  });

  it("refuses impossible edits without touching data or locked MIDI", () => {
    const first = add(melody(), avoidChord(2, "F"));
    const conflicting = addHarmonyGuide(first, requireChord(2, "F"));
    expect(conflicting).toMatchObject({ ok: false });
    expect(addHarmonyGuide(first, requireChord(99, "C")).ok).toBe(false);
    expect(addHarmonyGuide(first, avoidChord(0, "not-a-chord")).ok).toBe(false);
    const pinned = add(first, requireChord(0, "C"));
    expect(addHarmonyGuide(pinned, avoidChord(0, "C")).ok).toBe(false);

    const generated = harmonize(melody(), { ...settings, harmonicPacing: "half-bar" });
    const locked = toggleChordRegionLock(generated.progression, 1);
    const before = JSON.stringify(locked);
    const halfBarPin = addHarmonyGuide(locked, requireChord(0, locked.chords[1].name));
    expect(halfBarPin.ok).toBe(false);
    expect(JSON.stringify(locked)).toBe(before);
    expect(addHarmonyGuide(locked, avoidChord(0, locked.chords[1].name)).ok).toBe(false);
  });

  it.each([0, 62])("requires a whole-bar chord and excludes another in %i%% exploration", (exploration) => {
    const start = melody();
    const original = JSON.stringify(start);
    const guided = add(add(start, requireChord(1, "G")), avoidChord(0, "C"));
    const generated = harmonize(guided, { ...settings,
      harmonicPacing: "half-bar", harmonyExploration: exploration }, 2026);
    const chords = generated.progression.chords.filter(chord => chord.generatedSourceTrackIndex === 0);
    expect(chords.filter(chord => chord.timeStart >= 4 && chord.timeStart < 8))
      .toEqual([{ name: "G", timeStart: 4, duration: 4, generatedSourceTrackIndex: 0 }]);
    expect(chords.filter(chord => chord.timeStart < 4).every(chord => chord.name !== "C")).toBe(true);
    expect(generated.progression.harmonyConstraints).toEqual(guided.harmonyConstraints);
    expect(generated.progression.notes.filter(n => n.trackIndex === 0))
      .toEqual(start.notes.filter(n => n.trackIndex === 0));
    expect(generated.progression.notes.find(n => n.trackIndex === 7))
      .toBe(start.notes.find(n => n.trackIndex === 7));
    expect(JSON.stringify(start)).toBe(original);
    expect(generated.progression.tracks?.find(t => t.index === 7)).toEqual(start.tracks?.[1]);
    expect(harmonize(guided, { ...settings,
      harmonicPacing: "half-bar", harmonyExploration: exploration }, 2026)).toEqual(generated);
  });

  it("preserves locked regions and neighboring original backing while infilling a guided selection", () => {
    const first = harmonize(melody(), { ...settings, harmonicPacing: "bar" });
    const locked = toggleChordRegionLock(first.progression, 0);
    const withGuide = add(add(locked, requireChord(1, "G")), avoidChord(2, "C"));
    const beforeLocked = withGuide.notes.filter(n =>
      first.generatedTrackIndices.includes(n.trackIndex ?? -1) && n.timeStart < 4);
    const outsideChords = withGuide.chords.filter(c => c.timeStart < 4 || c.timeStart >= 12);
    const result = harmonize(withGuide, { ...settings, sourceScope: "loop",
      sourceLoopRange: { start: 4, end: 12 }, density: "active" }, 919);
    expect(result.progression.chords.find(c => c.timeStart === 4)?.name).toBe("G");
    expect(result.progression.chords.filter(c => c.timeStart < 4 || c.timeStart >= 12))
      .toEqual(outsideChords);
    expect(result.progression.notes.filter(n =>
      first.generatedTrackIndices.includes(n.trackIndex ?? -1) && n.timeStart < 4))
      .toEqual(beforeLocked);
    expect(result.progression.harmonyConstraints).toEqual(withGuide.harmonyConstraints);
  });

  it("rejects out-of-vocabulary and contradictory constraints before generating", () => {
    const withGuide = add(melody(), requireChord(0, "C"));
    const wrongKey = generateFromMelody(withGuide, { ...settings, root: "D" }, seededRandom(1));
    expect(wrongKey.ok).toBe(false);
    if (!wrongKey.ok) expect(wrongKey.reason).toMatch(/Pinned chord C.*not available/);

    const vocabulary = availableHarmonyChords("C", "major", settings.tension);
    const excluded: ProgressionData = {
      ...melody(), harmonyConstraints: vocabulary.map(chord => avoidChord(2, chord)),
    };
    const impossible = generateFromMelody(excluded, settings, seededRandom(1));
    expect(impossible.ok).toBe(false);
    if (!impossible.ok) expect(impossible.reason).toMatch(/Every available chord is excluded/);

    const contradictory: ProgressionData = {
      ...melody(), harmonyConstraints: [requireChord(1, "G"), avoidChord(1, "G")],
    };
    const conflict = generateFromMelody(contradictory, settings, seededRandom(1));
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) expect(conflict.reason).toMatch(/requires and excludes/);
    expect(contradictory.notes).toEqual(melody().notes);
  });

  it("does not change the old generated chord sequence when guides are absent", () => {
    const source = melody();
    const plain = harmonize(source);
    const empty = harmonize({ ...source, harmonyConstraints: [] });
    expect(empty.progression.chords).toEqual(plain.progression.chords);
    expect(empty.progression.notes).toEqual(plain.progression.notes);
  });
});
