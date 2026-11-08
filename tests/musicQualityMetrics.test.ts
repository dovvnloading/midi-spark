import { describe, expect, it } from "vitest";
import { Note } from "@tonaljs/tonal";
import type { NoteEvent } from "../src/lib/theory";
import {
  baselineGreedyTriads, baselineTonic, chordPathDiversity,
  chordTailSpill, chordToneCoverage, nearLeadCollision,
  pitchClassEntropy, structuralTakeDiversity, uniqueRenderRate,
} from "./musicQualityMetrics";

const note = (midi: number, timeStart: number, duration = 1, velocity = 0.8): NoteEvent => ({
  midi, name: Note.fromMidi(midi)!, timeStart, duration, velocity, trackIndex: 0,
});

describe("diagnostic metric definitions and negative controls", () => {
  it("measures literal chord-tone coverage without treating non-chord notes as matching", () => {
    const melody = [note(60, 0), note(61, 1)];
    const c = [{ name: "C", timeStart: 0, duration: 2 }];
    expect(chordToneCoverage([melody[0]], c)).toBe(1);
    expect(chordToneCoverage([melody[1]], c)).toBe(0);
    const partial = chordToneCoverage(melody, c);
    expect(partial).toBeGreaterThan(0);
    expect(partial).toBeLessThan(1);
  });

  it("gives a transparent bar-wise greedy triad baseline for a D-minor arpeggio", () => {
    const melody = [note(62, 0), note(65, 1), note(69, 2), note(65, 3)];
    const tonic = baselineTonic("C", "major", 1);
    const greedy = baselineGreedyTriads(melody, "C", "major", 1);
    expect(chordToneCoverage(melody, tonic)).toBeLessThan(0.5);
    expect(chordToneCoverage(melody, greedy)).toBe(1);
    expect(greedy[0].name).toBe("Dm");
  });

  it("separates musically structural diversity from velocity-only event differences", () => {
    const a = [note(60, 0, 0.75, 0.4), note(64, 1)];
    const b = [{ ...a[0], velocity: 0.55 }, { ...a[1], velocity: 0.9 }];
    const c = [note(60, 0), note(65, 1)];
    expect(uniqueRenderRate([a, b])).toBe(1);
    expect(structuralTakeDiversity([a, b])).toBe(0.5);
    expect(structuralTakeDiversity([a, b, c])).toBeCloseTo(2 / 3);
    expect(chordPathDiversity([
      [{ name: "C", timeStart: 0, duration: 4 }],
      [{ name: "C", timeStart: 0, duration: 4 }],
      [{ name: "G", timeStart: 0, duration: 4 }],
    ])).toBeCloseTo(2 / 3);
  });

  it("identifies near-lead register masking and notes exceeding a chord's time span", () => {
    const lead = [note(60, 0, 1)];
    const close = [note(62, 0.25, 0.75)];
    const far = [note(72, 0.25, 0.75)];
    expect(nearLeadCollision(lead, close)).toBe(1);
    expect(nearLeadCollision(lead, far)).toBe(0);
    expect(chordTailSpill([note(60, 0, 3)], [
      { name: "C", timeStart: 0, duration: 2 },
    ])).toBe(1);
    expect(chordTailSpill([note(60, 0, 1.5)], [
      { name: "C", timeStart: 0, duration: 2 },
    ])).toBe(0);
  });

  it("reports pitch-class entropy without pretending a wider distribution is better", () => {
    expect(pitchClassEntropy([note(60, 0), note(72, 1)])).toBe(0);
    expect(pitchClassEntropy([note(60, 0), note(62, 1)])).toBe(1);
  });
});
