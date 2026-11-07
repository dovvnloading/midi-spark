import { Chord, Note } from "@tonaljs/tonal";
import { describe, expect, it } from "vitest";
import {
  applySwing, applyVariationToProgression, generateSequence,
  swingQuarterPosition, type ProgressionData,
} from "../src/lib/theory";
import { seededRandom } from "../src/lib/random";

function note(midi: number, timeStart: number, trackIndex?: number) {
  return { midi, name: Note.fromMidi(midi)!, timeStart, duration: 1, velocity: 0.7, trackIndex };
}

describe("Music Engine v3: deterministic correctness", () => {
  it("uses repeatable seeded generation without altering single/layered note content", () => {
    const a = generateSequence("Eb", "minor", 8, 72, 88, false, seededRandom(1234));
    const b = generateSequence("Eb", "minor", 8, 72, 88, false, seededRandom(1234));
    const split = generateSequence("Eb", "minor", 8, 72, 88, true, seededRandom(1234));
    expect(a).toEqual(b);
    expect(split.notes.map(({ trackIndex: _index, ...rest }) => rest)).toEqual(a.notes);
    expect(split.chords).toEqual(a.chords);
    for (const chord of a.chords) expect(Chord.get(chord.name).empty).toBe(false);
  });

  it("makes a repeatable variation using a seeded stream", () => {
    const sequence = generateSequence("F#", "minor", 4, 66, 72, true, seededRandom(314));
    const one = applyVariationToProgression(sequence, 91, 80, "F#", "minor", seededRandom(73));
    const two = applyVariationToProgression(sequence, 91, 80, "F#", "minor", seededRandom(73));
    expect(one).toEqual(two);
    expect(one.tracks).toEqual(sequence.tracks);
  });

  it("does not collapse 8ths and neighboring 16ths at full swing", () => {
    const inTimes = [0, 0.25, 0.5, 0.75, 1];
    const outTimes = inTimes.map(time => swingQuarterPosition(time, 100));
    expect(outTimes[0]).toBe(0);
    expect(outTimes[1]).toBeCloseTo(1 / 3, 10);
    expect(outTimes[2]).toBeCloseTo(2 / 3, 10);
    expect(outTimes[3]).toBeCloseTo(5 / 6, 10);
    expect(outTimes[4]).toBe(1);
    for (let i = 1; i < outTimes.length; i++) {
      expect(outTimes[i]).toBeGreaterThan(outTimes[i - 1]);
    }
  });

  it("warps densely spaced, humanized starts monotonically for every swing amount", () => {
    const times = Array.from({ length: 513 }, (_, index) => index / 64);
    for (const strength of [0, 10, 30, 50, 80, 100]) {
      const output = times.map(time => swingQuarterPosition(time, strength));
      for (let i = 1; i < output.length; i++) {
        expect(output[i]).toBeGreaterThan(output[i - 1]);
      }
      for (let beat = 0; beat <= 8; beat++) expect(swingQuarterPosition(beat, strength)).toBe(beat);
    }
    const data: ProgressionData = {
      notes: times.slice(0, 65).map(time => note(60, time)),
      chords: [], totalBars: 4,
    };
    const swung = applySwing(data, 100);
    for (let i = 1; i < swung.notes.length; i++) {
      expect(swung.notes[i].timeStart).toBeGreaterThan(swung.notes[i - 1].timeStart);
    }
    expect(applySwing(data, 0)).toBe(data);
  });

  it("emits valid and name-synchronized grace notes at MIDI 0 and MIDI 127", () => {
    const data: ProgressionData = { notes: [
      note(0, 0), note(127, 2),
    ], chords: [], totalBars: 1 };
    for (const seed of [1, 3, 15, 123, 999]) {
      const result = applyVariationToProgression(data, 100, 100, "C", "major", seededRandom(seed));
      for (const n of result.notes) {
        expect(n.midi).toBeGreaterThanOrEqual(0);
        expect(n.midi).toBeLessThanOrEqual(127);
        expect(n.name).toBe(Note.fromMidi(n.midi));
        expect(n.duration).toBeGreaterThan(0);
        expect(n.timeStart).toBeGreaterThanOrEqual(0);
      }
    }
    // Exercise the grace branch deterministically (0.95 > 0.8).
    const forced = applyVariationToProgression(data, 100, 100, "C", "major", () => 0.95);
    expect(forced.notes).toHaveLength(4);
    expect(forced.notes.every(n => n.midi >= 0 && n.midi <= 127)).toBe(true);
    expect(forced.notes.every(n => n.name === Note.fromMidi(n.midi))).toBe(true);
  });

  it("keeps a late-strummed Bass voice distinct from the earlier upper voices", () => {
    const data: ProgressionData = {
      notes: [note(72, 0.0, 1), note(64, 0.045, 1), note(48, 0.09, 0)].map(n => ({ ...n, duration: 4 })),
      tracks: [{ index: 0, name: "Bass" }, { index: 1, name: "Harmony" }],
      chords: [], totalBars: 1,
    };
    // 0.5 selects syncopated motif among [0, 2, 3].
    const result = applyVariationToProgression(data, 50, 60, "C", "major", () => 0.5);
    expect(result.notes.filter(n => n.trackIndex === 0)).toHaveLength(1);
    expect(result.notes.filter(n => n.trackIndex === 0)[0].midi).toBe(48);
    expect(result.notes.filter(n => n.trackIndex === 1)).toHaveLength(8);
    expect(result.tracks).toEqual(data.tracks);
  });

  it("uses the lowest note as bass when role metadata is absent", () => {
    const data: ProgressionData = {
      notes: [note(76, 0), note(48, 0.04), note(67, 0.07)].map(n => ({ ...n, duration: 4 })),
      chords: [], totalBars: 1,
    };
    const result = applyVariationToProgression(data, 50, 60, "C", "major", () => 0.5);
    const low = result.notes.filter(n => n.midi === 48);
    expect(low).toHaveLength(1);
    expect(result.notes.filter(n => n.midi === 76)).toHaveLength(4);
  });
});
