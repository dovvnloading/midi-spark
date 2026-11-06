import { describe, expect, it } from "vitest";
import type { ProgressionData } from "../src/lib/theory";
import {
  ensureBarsCoverNotes,
  humanizeNotes,
  quantizeNotes,
  seededRandom,
  transposeNotes,
} from "../src/lib/transforms";

const progression: ProgressionData = {
  notes: [
    { midi: 60, name: "C4", timeStart: 0.12, duration: 0.5, velocity: 0.8 },
    { midi: 64, name: "E4", timeStart: 1.38, duration: 0.5, velocity: 0.6, trackIndex: 1 },
    { midi: 67, name: "G4", timeStart: 3.8, duration: 0.5, velocity: 0.7 },
  ],
  chords: [{ name: "Cmaj7", timeStart: 0, duration: 4 }],
  totalBars: 2,
};

describe("Note Lab transforms", () => {
  it("transposes every note and chord label, keeping MIDI names in sync", () => {
    const result = transposeNotes(progression, 2);
    expect(result.notes.map((n) => [n.midi, n.name])).toEqual([
      [62, "D4"], [66, "Gb4"], [69, "A4"],
    ]);
    expect(result.chords[0].name).toBe("Dmaj7");
    expect(result.notes[1].trackIndex).toBe(1);
    expect(progression.notes[0].midi).toBe(60);
  });

  it("only transposes the selection, leaving chord labels and other notes untouched", () => {
    const result = transposeNotes(progression, -1, new Set([1]));
    expect(result.notes[0]).toBe(progression.notes[0]);
    expect(result.notes[1].midi).toBe(63);
    expect(result.notes[2]).toBe(progression.notes[2]);
    expect(result.chords).toBe(progression.chords);
  });

  it("skips impossible pitches instead of clipping them to 0 or 127", () => {
    const edge: ProgressionData = {
      notes: [{ midi: 127, name: "G9", timeStart: 0, duration: 1, velocity: 0.8 }],
      chords: [],
      totalBars: 1,
    };
    expect(transposeNotes(edge, 1)).toBe(edge);
    expect(transposeNotes(edge, 0)).toBe(edge);
  });

  it("quantizes starts at partial strength, retaining duration and selection", () => {
    const result = quantizeNotes(progression, 0.25, 50, new Set([0]));
    expect(result.notes[0].timeStart).toBe(0.06);
    expect(result.notes[0].duration).toBe(0.5);
    expect(result.notes[1]).toBe(progression.notes[1]);
    expect(result.notes[2]).toBe(progression.notes[2]);
  });

  it("returns the original progression for no-op quantization", () => {
    expect(quantizeNotes(progression, 0, 100)).toBe(progression);
    expect(quantizeNotes(progression, 0.25, 0)).toBe(progression);
    expect(quantizeNotes(progression, 0.25, 100, new Set([999]))).toBe(progression);
  });

  it("humanizes reproducibly without altering untouched notes or metadata", () => {
    const selection = new Set([1]);
    const first = humanizeNotes(progression, 75, selection, seededRandom(42));
    const second = humanizeNotes(progression, 75, selection, seededRandom(42));
    expect(first).toEqual(second);
    expect(first.notes[0]).toBe(progression.notes[0]);
    expect(first.notes[2]).toBe(progression.notes[2]);
    expect(first.notes[1].trackIndex).toBe(1);
    expect(first.chords).toBe(progression.chords);
    expect(first.notes[1].timeStart).toBeGreaterThanOrEqual(0);
    expect(first.notes[1].velocity).toBeGreaterThanOrEqual(0.1);
    expect(first.notes[1].velocity).toBeLessThanOrEqual(1);
  });

  it("honors zero humanization and clamps timing/velocity at valid bounds", () => {
    expect(humanizeNotes(progression, 0)).toBe(progression);
    const edge: ProgressionData = {
      notes: [{ midi: 60, name: "C4", timeStart: 0, duration: 1, velocity: 1 }],
      chords: [], totalBars: 1,
    };
    const result = humanizeNotes(edge, 100, undefined, () => 0);
    expect(result.notes[0].timeStart).toBe(0);
    expect(result.notes[0].velocity).toBe(0.8);
  });

  it("extends bar count when an edit would run off the canvas", () => {
    const longer = ensureBarsCoverNotes({
      ...progression,
      notes: [{ ...progression.notes[0], timeStart: 8, duration: 2 }],
    });
    expect(longer.totalBars).toBe(3);
    expect(ensureBarsCoverNotes(progression)).toBe(progression);
  });
});
