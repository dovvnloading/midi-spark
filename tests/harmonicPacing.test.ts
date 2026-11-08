import { describe, expect, it } from "vitest";
import { Note } from "@tonaljs/tonal";
import { generateFromMelody, type HarmonicPacing, type MelodyGenerationOptions } from "../src/lib/adaptive";
import { seededRandom } from "../src/lib/random";
import type { ProgressionData, NoteEvent } from "../src/lib/theory";

const event = (midi: number, timeStart: number, duration = 0.75, trackIndex = 0): NoteEvent => ({
  name: Note.fromMidi(midi)!, midi, timeStart, duration, velocity: 0.8, trackIndex,
});

const prefs: MelodyGenerationOptions = {
  sourceTrackIndex: 0, root: "C", mode: "major", tension: 15,
  harmonicFit: 100, density: "balanced", keyStrategy: "manual",
};

function contrasting(): ProgressionData {
  return {
    notes: [
      // Two different chord implications within one bar.
      event(72, 0, 0.8), event(76, 0.5, 0.8), event(79, 1, 0.8), // C E G
      event(74, 2, 0.8), event(77, 2.5, 0.8), event(81, 3, 0.8), // D F A
    ],
    chords: [], totalBars: 1,
    tracks: [{index: 0, name: "Melody", channel: 1, program: 80}],
  };
}

function generate(input: ProgressionData, pacing: HarmonicPacing, seed = 123) {
  const result = generateFromMelody(input, {...prefs, harmonicPacing: pacing}, seededRandom(seed));
  if (!result.ok) throw new Error(result.reason);
  return result;
}

describe("melody-aware harmonic pacing", () => {
  it("keeps one-chord-per-bar behavior for callers using the legacy default", () => {
    const phrase = contrasting();
    const result = generateFromMelody(phrase, prefs, seededRandom(4));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.progression.chords).toEqual([{
      name: result.progression.chords[0].name, timeStart: 0, duration: 4,
      generatedSourceTrackIndex: 0,
    }]);
    expect(result.progression.notes.slice(0, phrase.notes.length)).toEqual(phrase.notes);
  });

  it("identifies a genuine mid-bar change from two independently supported harmonies", () => {
    const phrase = contrasting();
    const result = generate(phrase, "adaptive");
    expect(result.progression.chords.map(chord => [chord.timeStart, chord.duration]))
      .toEqual([[0, 2], [2, 2]]);
    expect(result.progression.notes.slice(0, phrase.notes.length)).toEqual(phrase.notes);
    expect(phrase.chords).toEqual([]);
  });

  it("does not manufacture a mid-bar chord when the melody implies one harmony", () => {
    const phrase: ProgressionData = {
      notes: [
        event(72, 0, 0.75), event(76, 0.5, 0.75), event(79, 1, 0.75),
        event(72, 2, 0.75), event(76, 2.5, 0.75), event(79, 3, 0.75),
      ], chords: [], totalBars: 1,
    };
    const result = generate(phrase, "adaptive");
    expect(result.progression.chords).toHaveLength(1);
    expect(result.progression.chords[0].duration).toBe(4);
  });

  it("preserves slow pacing on sparse or sustained phrases", () => {
    const phrase: ProgressionData = {
      notes: [event(72, 0, 4)], chords: [], totalBars: 2,
    };
    const result = generate(phrase, "adaptive");
    expect(result.progression.chords.map(chord => [chord.timeStart, chord.duration]))
      .toEqual([[0, 4], [4, 4]]);
    expect(result.progression.notes[0]).toBe(phrase.notes[0]);
  });

  it("respects forced two-per-bar pacing, with notes safely ending inside each segment", () => {
    const phrase = contrasting();
    const result = generate(phrase, "half-bar");
    const generated = result.progression.notes.filter(note => note.trackIndex !== 0);
    expect(result.progression.chords).toHaveLength(2);
    expect(result.progression.chords.map(chord => [chord.timeStart, chord.duration]))
      .toEqual([[0, 2], [2, 2]]);
    for (const note of generated) {
      const segmentStart = Math.floor(note.timeStart / 2) * 2;
      expect(note.timeStart + note.duration).toBeLessThanOrEqual(segmentStart + 2 + 1e-8);
      expect(note.duration).toBeGreaterThan(0);
      expect(note.midi).toBeGreaterThanOrEqual(0);
      expect(note.midi).toBeLessThanOrEqual(127);
    }
  });

  it("supports changes in pacing without duplicating generated tracks", () => {
    const original = contrasting();
    const first = generate(original, "bar");
    const second = generate(first.progression, "half-bar");
    const third = generate(second.progression, "adaptive");
    expect(second.generatedTrackIndices).toEqual(first.generatedTrackIndices);
    expect(third.generatedTrackIndices).toEqual(first.generatedTrackIndices);
    expect(third.progression.tracks).toEqual(first.progression.tracks);
    for (const result of [first, second, third]) {
      expect(result.progression.notes.filter(note => note.trackIndex === 0)).toEqual(original.notes);
    }
  });

  it("gives deterministic, legal chord paths and accompaniment for every mode", () => {
    const source = contrasting();
    for (const pacing of ["bar", "adaptive", "half-bar"] as const) {
      const a = generate(source, pacing, 4);
      const b = generate(source, pacing, 4);
      expect(a).toEqual(b);
      for (const chord of a.progression.chords) {
        expect(chord.duration).toBeGreaterThan(0);
        expect(chord.timeStart).toBeGreaterThanOrEqual(0);
      }
      const total = a.progression.chords.reduce((sum, chord) => sum + chord.duration, 0);
      expect(total).toBeCloseTo(4, 8);
    }
  });

  it("refuses an invalid harmonic pacing instead of producing silent corruption", () => {
    const rejected = generateFromMelody(contrasting(), {
      ...prefs, harmonicPacing: "too-fast" as HarmonicPacing,
    }, seededRandom(1));
    expect(rejected).toEqual({ok: false, reason:"Choose a valid harmonic pacing."});
  });

  it("uses the original melody, not a generated continuation, for automatic key inference", () => {
    const source = contrasting();
    const original = generateFromMelody(source, {...prefs, keyStrategy:"detect"}, seededRandom(12));
    expect(original.ok).toBe(true);
    const withContinuation: ProgressionData = {
      ...source,
      notes: [...source.notes, event(66, 4, 1, 9), event(70, 5, 1, 9),
        event(73, 6, 1, 9), event(78, 7, 1, 9)],
      tracks: [...source.tracks!, {
        index:9, name:"Melody Continuation", channel:2,
        generatedRole:"continuation", sourceTrackIndex:0,
      }],
      totalBars: 2,
    };
    const extended = generateFromMelody(withContinuation,
      {...prefs, keyStrategy:"detect", harmonicPacing:"adaptive"}, seededRandom(12));
    expect(extended.ok).toBe(true);
    if (original.ok && extended.ok) {
      expect([extended.root,extended.mode,extended.usedDetectedKey])
        .toEqual([original.root,original.mode,original.usedDetectedKey]);
      expect(extended.progression.notes.filter(note => note.trackIndex === 9))
        .toEqual(withContinuation.notes.filter(note => note.trackIndex === 9));
    }
  });
});
