import { describe, expect, it } from "vitest";
import { Note } from "@tonaljs/tonal";
import { analyzePhraseStructure, scorePhraseStructure } from "../src/lib/phraseStructure";
import { generateFromMelody, type MelodyGenerationOptions } from "../src/lib/adaptive";
import { seededRandom } from "../src/lib/random";
import type { NoteEvent, ProgressionData } from "../src/lib/theory";

const note = (midi: number, timeStart: number, duration = 1): NoteEvent => ({
  midi, name: Note.fromMidi(midi)!, timeStart, duration, velocity: 0.78, trackIndex: 0,
});

const regions = Array.from({ length: 4 }, (_, i) => ({ timeStart: i * 4, duration: 4 }));
const chords = [
  { rootPc: 0, degree: 0 }, // C
  { rootPc: 7, degree: 4 }, // G
  { rootPc: 2, degree: 1 }, // Dm
  { rootPc: 9, degree: 5 }, // Am
  { rootPc: 5, degree: 3 }, // F
];

const opening = [
  note(72, 0), note(74, 1), note(76, 4), note(79, 6), note(72, 7),
];
const copyAt = (offset: number, transpose = 0) =>
  opening.map(n => note(n.midi + transpose, n.timeStart + offset, n.duration));

describe("phrase-aware harmonic planning", () => {
  it("recognizes a repeat and favors a consistent chord-root arc", () => {
    const melody = [...opening, ...copyAt(8)];
    const form = analyzePhraseStructure(melody, regions, 0, "major");
    expect(form.echoes).toHaveLength(1);
    expect(form.echoes[0].transposition).toBe(0);
    expect(form.echoes[0].regionPairs).toEqual([
      { earlier: 0, later: 2 }, { earlier: 1, later: 3 },
    ]);
    expect(scorePhraseStructure([0, 1, 0, 1], chords, regions, form))
      .toBeGreaterThan(scorePhraseStructure([0, 1, 4, 1], chords, regions, form));
  });

  it("recognizes transposition while rejecting coincidental sparse rhythm", () => {
    const transposed = analyzePhraseStructure([...opening, ...copyAt(8, 2)], regions, 0, "major");
    expect(transposed.echoes).toHaveLength(1);
    expect(transposed.echoes[0].transposition).toBe(2);
    expect(scorePhraseStructure([0, 1, 2, 3], chords, regions, transposed))
      .toBeGreaterThan(scorePhraseStructure([0, 1, 4, 1], chords, regions, transposed));

    const sparse = analyzePhraseStructure([
      note(72, 0), note(72, 4), note(72, 8), note(72, 12),
    ], regions, 0, "major");
    expect(sparse.echoes).toHaveLength(0);
  });

  it("prefers melody-supported cadences but not an arbitrary forced tonic", () => {
    const resolving = analyzePhraseStructure([
      note(76, 0), note(79, 5), note(72, 14.5, 1.5),
    ], regions, 0, "major");
    expect(resolving.endings).toEqual([{ regionIndex: 3, strength: 1 }]);
    const cadence = scorePhraseStructure([0, 4, 1, 0], chords, regions, resolving);
    const openEnd = scorePhraseStructure([0, 4, 1, 4], chords, regions, resolving);
    expect(cadence).toBeGreaterThan(openEnd);

    const unresolved = analyzePhraseStructure([
      note(76, 0), note(79, 5), note(73, 14.5, 1.5),
    ], regions, 0, "major");
    expect(unresolved.endings).toEqual([]);
    expect(scorePhraseStructure([0, 4, 1, 0], chords, regions, unresolved)).toBe(0);
  });

  it("preserves original search at zero and user notes at high coherence", () => {
    const source: ProgressionData = {
      notes: [...opening, ...copyAt(8), ...copyAt(16), ...copyAt(24)],
      chords: [], totalBars: 8,
    };
    const original = JSON.stringify(source);
    const options: MelodyGenerationOptions = {
      sourceTrackIndex: 0, root: "C", mode: "major", tension: 35,
      harmonicFit: 85, density: "balanced", keyStrategy: "manual",
      harmonicPacing: "bar", harmonyExploration: 62,
    };
    const baseline = generateFromMelody(source, options, seededRandom(61));
    const disabled = generateFromMelody(source, { ...options, phraseCoherence: 0 }, seededRandom(61));
    expect(disabled).toEqual(baseline);
    const structured = generateFromMelody(source, { ...options, phraseCoherence: 85 }, seededRandom(61));
    const replay = generateFromMelody(source, { ...options, phraseCoherence: 85 }, seededRandom(61));
    expect(structured).toEqual(replay);
    expect(structured.ok).toBe(true);
    if (!structured.ok) return;
    expect(structured.phraseEchoesConsidered).toBeGreaterThan(0);
    expect(structured.progression.notes.filter(n => n.trackIndex === 0)).toEqual(source.notes);
    expect(JSON.stringify(source)).toBe(original);
    expect(structured.progression.chords).toHaveLength(8);
    expect(structured.progression.notes.every(n =>
      n.midi >= 0 && n.midi <= 127 && n.duration > 0 && n.timeStart >= 0)).toBe(true);

    for (const invalid of [-1, 101, NaN, Infinity]) {
      expect(generateFromMelody(source, { ...options, phraseCoherence: invalid }).ok).toBe(false);
    }
  });
});
