import { describe, expect, it } from "vitest";
import {
  analyzeKeyFromProgression,
  detectKeyFromProgression,
  type ProgressionData,
} from "../src/lib/theory";
import { ROOT_NOTES } from "../src/lib/constants";

function tonalFixture(root: number, mode: "major" | "minor"): ProgressionData {
  const intervals = mode === "major"
    ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
  const third = mode === "major" ? 4 : 3;
  const note = (semitones: number, timeStart: number, duration: number) => ({
    midi: 48 + root + semitones,
    name: "intentionally-stale", // estimation MUST use MIDI, not note text
    timeStart, duration, velocity: 0.75,
  });
  return {
    notes: [
      note(0, 0, 2), note(third, 0, 1), note(7, 0, 1),
      ...intervals.map((degree, index) => note(degree, 0.5 + index * 0.5, 0.55)),
      note(0, 4, 2), note(third, 4.05, 1), note(7, 4.1, 1),
      note(0, 8, 2), note(third, 8.05, 0.5), note(7, 8.1, 0.5),
    ],
    chords: [], totalBars: 3,
  };
}

describe("Music Engine v3: key analysis and uncertainty", () => {
  it("recognizes strongly centered major and minor fixtures in all twelve roots", () => {
    for (let chroma = 0; chroma < 12; chroma++) {
      for (const mode of ["major", "minor"] as const) {
        const data = tonalFixture(chroma, mode);
        const result = analyzeKeyFromProgression(data);
        expect([result.best.root, result.best.mode]).toEqual([ROOT_NOTES[chroma], mode]);
        expect(result.ambiguous).toBe(false);
        expect(result.confidence).toBeGreaterThan(0);
        expect(detectKeyFromProgression(data)).toEqual({
          root: ROOT_NOTES[chroma], mode,
        });
      }
    }
  });

  it("ranks alternatives and never calls a single note a certain key", () => {
    const sparse: ProgressionData = {
      notes: [{ midi: 60, name: "C4", timeStart: 0, duration: 4, velocity: 0.8 }],
      chords: [], totalBars: 1,
    };
    const result = analyzeKeyFromProgression(sparse);
    expect(result.ambiguous).toBe(true);
    expect(result.confidence).toBeLessThanOrEqual(0.45);
    expect(result.alternatives).toHaveLength(3);
    expect(result.best.score).toBeGreaterThanOrEqual(result.alternatives[0].score);
    expect(result.margin).toBeGreaterThanOrEqual(0);
  });

  it("rejects an empty input as evidence and reports no confidence", () => {
    const data: ProgressionData = { notes: [], chords: [], totalBars: 1 };
    const result = analyzeKeyFromProgression(data);
    expect(result.ambiguous).toBe(true);
    expect(result.confidence).toBe(0);
    expect(result.margin).toBe(0);
  });

  it("uses evidence beyond diatonic membership for relative major/minor", () => {
    // C major and A minor share the same seven pitch classes, but their
    // accent/tonic-triad distributions are different in these fixtures.
    const c = analyzeKeyFromProgression(tonalFixture(0, "major"));
    const a = analyzeKeyFromProgression(tonalFixture(9, "minor"));
    expect(c.best).toMatchObject({ root: "C", mode: "major" });
    expect(a.best).toMatchObject({ root: "A", mode: "minor" });
    expect(c.best.score).toBeGreaterThan(c.alternatives[0].score);
    expect(a.best.score).toBeGreaterThan(a.alternatives[0].score);
  });

  it("keeps a short chromatic fragment explicitly ambiguous", () => {
    const notes = [60, 61, 62, 65].map((midi, index) => ({
      midi, name: "unknown", timeStart: index * 0.5,
      duration: 0.4, velocity: 0.7,
    }));
    const result = analyzeKeyFromProgression({ notes, chords: [], totalBars: 1 });
    expect(result.ambiguous).toBe(true);
    expect(result.confidence).toBeLessThanOrEqual(0.45);
  });
});
