import { describe, it, expect } from "vitest";
import type { ProgressionData } from "../src/lib/theory";
import { editNoteField, nudgeNoteSelection, nudgeNoteVelocities } from "../src/lib/noteEditing";
import { MAX_PROJECT_BEATS } from "../src/lib/constants";

const score: ProgressionData = {
  notes: [
    { name: "C4", midi: 60, timeStart: 0, duration: 1, velocity: 0.8, trackIndex: 0 },
    { name: "E4", midi: 64, timeStart: 0, duration: 1, velocity: 0.5, trackIndex: 0 },
    { name: "G3", midi: 55, timeStart: 0, duration: 2, velocity: 0.75, trackIndex: 1 },
  ],
  chords: [],
  totalBars: 1,
};

describe("precise note edits", () => {
  it("edits only an explicitly selected note among identical onsets", () => {
    const next = editNoteField(score, [1], "midi", 65);
    expect(next.notes.map(note => note.midi)).toEqual([60, 65, 55]);
    expect(next.notes[1].name).toBe("F4");
    expect(next.notes[0]).toBe(score.notes[0]);
    expect(next.notes[2]).toBe(score.notes[2]);
    expect(score.notes[1].midi).toBe(64);
  });

  it("edits timing and duration while extending bars without touching other tracks", () => {
    const moved = editNoteField(score, [0], "timeStart", 7);
    expect(moved.totalBars).toBeGreaterThanOrEqual(2);
    expect(moved.notes[0].timeStart).toBe(7);
    expect(moved.notes.slice(1)).toEqual(score.notes.slice(1));
    const resized = editNoteField(moved, [0], "duration", 2);
    expect(resized.notes[0].duration).toBe(2);
    expect(resized.totalBars).toBeGreaterThanOrEqual(3);
  });

  it("supports exact percentages and independent 1/10-point velocity nudges", () => {
    const changed = editNoteField(score, [0, 1], "velocity", 0.62);
    expect(changed.notes.map(note => note.velocity)).toEqual([0.62, 0.62, 0.75]);
    const plusOne = nudgeNoteVelocities(changed, [0], 1);
    expect(plusOne.notes.map(note => note.velocity)).toEqual([0.63, 0.62, 0.75]);
    const plusTen = nudgeNoteVelocities(plusOne, [0, 1], 10);
    expect(plusTen.notes.map(note => note.velocity)).toEqual([0.73, 0.72, 0.75]);
  });

  it("clamps invalid values and keeps no-op changes out of history", () => {
    expect(editNoteField(score, [0], "midi", NaN)).toBe(score);
    expect(editNoteField(score, [], "velocity", 0.4)).toBe(score);
    expect(editNoteField(score, [0], "velocity", 0.8)).toBe(score);
    expect(editNoteField(score, [0], "duration", -4).notes[0].duration).toBeGreaterThan(0);
    expect(nudgeNoteVelocities(editNoteField(score, [0], "velocity", 1), [0], 10).notes[0].velocity).toBe(1);
  });

  it("allows precise entry beyond bar 256 and keeps the full note inside the project", () => {
    const moved = editNoteField(score, [0], "timeStart", 1500);
    expect(moved.notes[0].timeStart).toBe(1500);
    const last = editNoteField(moved, [0], "timeStart", MAX_PROJECT_BEATS);
    expect(last.notes[0].timeStart).toBe(MAX_PROJECT_BEATS - 1);
    expect(editNoteField(last, [0], "duration", 5)).toBe(last);
  });

  it("nudges the entire selection without overwriting its voicing or off-grid timing", () => {
    const group = new Set([0, 1]);
    const offset = editNoteField(score, [1], "timeStart", 0.14);
    const moved = nudgeNoteSelection(offset, group, "timeStart", 0.5);
    expect(moved.notes.map(note => note.timeStart)).toEqual([0.5, 0.64, 0]);
    const pitched = nudgeNoteSelection(moved, group, "midi", 1);
    expect(pitched.notes.map(note => note.midi)).toEqual([61, 65, 55]);
    expect(pitched.notes[2]).toBe(score.notes[2]);
    const short = editNoteField(pitched, [0], "duration", 0.125);
    expect(nudgeNoteSelection(short, group, "duration", -0.5)).toBe(short);
  });
});
