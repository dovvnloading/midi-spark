import { describe, expect, it } from "vitest";
import { Note } from "@tonaljs/tonal";
import { resolveMelodyScope } from "../src/lib/melodyScope";
import { generateMotif, type MotifOptions } from "../src/lib/motif";
import { generateFromMelody, type MelodyGenerationOptions } from "../src/lib/adaptive";
import { seededRandom } from "../src/lib/random";
import type { NoteEvent, ProgressionData } from "../src/lib/theory";

const n = (midi: number, timeStart: number, duration = 0.7, trackIndex = 0): NoteEvent =>
  ({ midi, name: Note.fromMidi(midi)!, timeStart, duration, velocity: 0.74, trackIndex });

function score(): ProgressionData {
  return {
    notes: [
      n(60, 0), n(64, 1), n(67, 2), n(72, 3),
      n(65, 4.5), n(69, 5.5), n(72, 6.5), n(74, 7.5),
      n(64, 8), n(67, 9), n(71, 10), n(72, 11),
      n(48, 0, 4, 2), n(43, 4, 4, 2),
    ],
    tracks: [
      {index: 0, name: "User melody", channel: 2, program: 80},
      {index: 2, name: "Other bass", channel: 3, program: 33},
    ],
    chords: [{name: "Custom", timeStart: 0, duration: 4}], totalBars: 3,
  };
}

const motifOptions: MotifOptions = {
  sourceTrackIndex: 0, operation: "continue", root: "C", mode: "major",
  keyStrategy: "manual", creativity: 50, continuationBars: 2,
};
const harmonicOptions: MelodyGenerationOptions = {
  sourceTrackIndex: 0, root: "C", mode: "major",
  tension: 40, harmonicFit: 90, density: "balanced",
  keyStrategy: "manual", harmonicPacing: "bar",
};

function motif(data: ProgressionData, options: MotifOptions, seed = 123) {
  const res = generateMotif(data, options, seededRandom(seed));
  if (!res.ok) throw Error(res.reason);
  return res;
}
function harmonize(data: ProgressionData, options: MelodyGenerationOptions, seed = 123) {
  const res = generateFromMelody(data, options, seededRandom(seed));
  if (!res.ok) throw Error(res.reason);
  return res;
}

describe("explicit source-phrase selection", () => {
  it("keeps the legacy whole-track default and never mutates source notes", () => {
    const data = score(), before = structuredClone(data);
    const resolved = resolveMelodyScope(data, 0);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.scope).toBe("track");
    expect(resolved.notes).toEqual(data.notes.slice(0, 12));
    expect(resolved.entireTrack).toEqual(data.notes.slice(0, 12));
    expect(data).toEqual(before);
  });

  it("chooses only selected global note indices, not offsets within the track", () => {
    const data = score();
    const resolved = resolveMelodyScope(data, 2,
      {sourceScope: "selected", sourceNoteIndices: [13, 12]});
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.notes.map(note => note.midi)).toEqual([48, 43]);
    expect(resolved.notes[0]).toBe(data.notes[12]);
    expect(resolved.phraseStart).toBe(0);
    expect(resolved.phraseEnd).toBe(8);
  });

  it("loop source respects attacks and intentional leading rests", () => {
    const data = score();
    const chosen = resolveMelodyScope(data, 0, {
      sourceScope: "loop", sourceLoopRange: {start: 4, end: 8},
    });
    expect(chosen.ok).toBe(true);
    if (!chosen.ok) return;
    expect(chosen.notes.map(note => note.timeStart)).toEqual([4.5, 5.5, 6.5, 7.5]);
    expect([chosen.phraseStart, chosen.phraseEnd]).toEqual([4, 8]);
    expect(chosen.notes.every(note => note.trackIndex === 0)).toBe(true);
  });

  it("returns clear errors for stale, empty, invalid or cross-track selections", () => {
    const data = score();
    const invalid = [
      {sourceScope: "selected" as const, sourceNoteIndices: []},
      {sourceScope: "selected" as const, sourceNoteIndices: [0, 12]},
      {sourceScope: "selected" as const, sourceNoteIndices: [0, 0]},
      {sourceScope: "selected" as const, sourceNoteIndices: [-1]},
      {sourceScope: "selected" as const, sourceNoteIndices: [12345]},
      {sourceScope: "loop" as const, sourceLoopRange: null},
      {sourceScope: "loop" as const, sourceLoopRange: {start: 0, end: 0}},
      {sourceScope: "loop" as const, sourceLoopRange: {start: 12, end: 16}},
      {sourceScope: "loop" as const, sourceLoopRange: {start: 40, end: 44}},
    ];
    for (const option of invalid) expect(resolveMelodyScope(data, 0, option).ok).toBe(false);
    expect(resolveMelodyScope(data, -1).ok).toBe(false);
    expect(resolveMelodyScope(data, 6).ok).toBe(false);
  });

  it("continues from an earlier selection but starts after the entire original melody", () => {
    const source = score();
    const selected = [1, 2, 3];
    const result = motif(source, {
      ...motifOptions, sourceScope: "selected", sourceNoteIndices: selected,
    });
    const output = result.progression.notes.filter(note => note.trackIndex === result.generatedTrackIndex);
    expect(result.sourceEndBar).toBe(3);
    expect(output.length).toBeGreaterThan(0);
    expect(output.every(note => note.timeStart >= 12 && note.timeStart + note.duration <= 20)).toBe(true);
    expect(output[0].timeStart).toBe(12); // selection starts at its first attack
    expect(result.progression.notes.slice(0, source.notes.length)).toEqual(source.notes);
  });

  it("preserves selected loop rhythm with its initial rest when continuing", () => {
    const source = score();
    const result = motif(source, {
      ...motifOptions, sourceScope: "loop", sourceLoopRange: {start: 4, end: 8},
    });
    const output = result.progression.notes.filter(note => note.trackIndex === result.generatedTrackIndex);
    expect(output[0].timeStart).toBeCloseTo(12.5, 6);
    expect(output[1].timeStart).toBeCloseTo(13.5, 6);
    expect(source.notes).toHaveLength(14);
  });

  it("reimagines only chosen original notes, preserving everything else", () => {
    const source = score();
    const result = motif(source, {
      ...motifOptions, operation: "variation", sourceScope: "selected",
      sourceNoteIndices: [5, 6, 7], creativity: 70,
    });
    const newNotes = result.progression.notes.filter(note =>
      note.trackIndex === result.generatedTrackIndex);
    expect(newNotes).toHaveLength(3);
    expect(newNotes.map(note => note.timeStart)).toEqual([5.5, 6.5, 7.5]);
    expect(result.progression.notes.slice(0, 14)).toEqual(source.notes);
  });

  it("never uses notes from a different track even when the editor contains a multitrack selection", () => {
    const invalid = generateMotif(score(), {
      ...motifOptions, sourceScope: "selected", sourceNoteIndices: [5, 12],
    });
    expect(invalid.ok).toBe(false);
  });

  it("selected-note harmonization generates only covered bars and leaves other owned backing unchanged", () => {
    const source = score();
    const full = harmonize(source, harmonicOptions, 5);
    const bassTrack = full.generatedTrackIndices[0];
    const harmonyTrack = full.generatedTrackIndices[1];
    const outside = full.progression.notes.filter(note =>
      [bassTrack, harmonyTrack].includes(note.trackIndex ?? -1) && note.timeStart < 4);
    const insideBefore = full.progression.notes.filter(note =>
      [bassTrack, harmonyTrack].includes(note.trackIndex ?? -1) && note.timeStart >= 4 && note.timeStart < 8);
    const updated = harmonize(full.progression, {
      ...harmonicOptions, sourceScope: "selected", sourceNoteIndices: [4, 5, 6, 7],
      harmonicPacing: "half-bar", density: "active",
    }, 7);
    expect(updated.generatedTrackIndices).toEqual(full.generatedTrackIndices);
    expect(updated.progression.tracks).toEqual(full.progression.tracks);
    const generatedAfter = updated.progression.notes.filter(note =>
      [bassTrack, harmonyTrack].includes(note.trackIndex ?? -1));
    expect(generatedAfter.filter(note => note.timeStart < 4)).toEqual(outside);
    expect(generatedAfter.filter(note => note.timeStart >= 4 && note.timeStart < 8)).not.toEqual(insideBefore);
    expect(updated.progression.notes.filter(note => note.trackIndex === 0))
      .toEqual(source.notes.filter(note => note.trackIndex === 0));
    expect(updated.progression.notes.filter(note => note.trackIndex === 2))
      .toEqual(source.notes.filter(note => note.trackIndex === 2));
    expect(updated.progression.chords.filter(chord => chord.generatedSourceTrackIndex === 0)
      .filter(chord => chord.timeStart < 4)).toEqual(
        full.progression.chords.filter(chord =>
          chord.generatedSourceTrackIndex === 0 && chord.timeStart < 4));
    expect(updated.progression.chords.filter(chord =>
      chord.generatedSourceTrackIndex === 0 && chord.timeStart >= 4 && chord.timeStart < 8)).toHaveLength(2);
    expect(updated.progression.chords.filter(chord => chord.name === "Custom")).toHaveLength(1);
  });

  it("loop harmonization is bar-aligned and scoped to the chosen phrase", () => {
    const data = score();
    const result = harmonize(data, {
      ...harmonicOptions, sourceScope: "loop",
      sourceLoopRange: {start: 4.5, end: 7.2},
    }, 8);
    expect(result.progression.chords.filter(chord =>
      chord.generatedSourceTrackIndex === 0).map(chord => [chord.timeStart, chord.duration]))
      .toEqual([[4, 4]]);
    expect(result.progression.notes.filter(note => note.trackIndex === 0))
      .toEqual(data.notes.filter(note => note.trackIndex === 0));
  });

  it("restores predictable generation from the same selected phrase and random seed", () => {
    const a = motif(score(), {
      ...motifOptions, sourceScope: "selected", sourceNoteIndices: [2, 3, 4],
    }, 714);
    const b = motif(score(), {
      ...motifOptions, sourceScope: "selected", sourceNoteIndices: [2, 3, 4],
    }, 714);
    expect(a).toEqual(b);
  });
});
