import { describe, expect, it } from "vitest";
import { Note } from "@tonaljs/tonal";
import { generateMotif, type MotifOptions } from "../src/lib/motif";
import { generateFromMelody } from "../src/lib/adaptive";
import { seededRandom } from "../src/lib/random";
import { MELODIC_CHANNELS, deleteTrack, duplicateTrack } from "../src/lib/trackOperations";
import type { ProgressionData, NoteEvent } from "../src/lib/theory";

const n = (midi: number, timeStart: number, duration = 0.75, trackIndex = 4): NoteEvent => ({
  midi, name: Note.fromMidi(midi)!, timeStart, duration, velocity: 0.8, trackIndex,
});

const options: MotifOptions = {
  sourceTrackIndex: 4, operation: "continue", root: "C", mode: "major",
  keyStrategy: "manual", creativity: 65, continuationBars: 4,
};

function seed(): ProgressionData {
  return {
    notes: [
      n(72, 0, 0.75), n(74, 1, 0.5), n(76, 2, 0.75), n(79, 3, 0.75),
      n(77, 4, 0.75), n(76, 5, 0.5), n(74, 6, 0.5), n(72, 7, 0.75),
      n(48, 0, 4, 2),
    ],
    tracks: [
      {index: 2, name: "Other bass", channel: 2, program: 33},
      {index: 4, name: "User lead", channel: 3, program: 80},
    ],
    chords: [{name: "C", timeStart: 0, duration: 4}],
    totalBars: 2,
  };
}

function success(data: ProgressionData, prefs = options, randomSeed = 812) {
  const result = generateMotif(data, prefs, seededRandom(randomSeed));
  if (!result.ok) throw Error(result.reason);
  return result;
}

describe("melody-guided motif composition", () => {
  it("continues a source after its last completed bar without mutating any original notes", () => {
    const input = seed(), saved = structuredClone(input);
    const result = success(input);
    expect(input).toEqual(saved);
    expect(result.sourceEndBar).toBe(2);
    expect(result.progression.totalBars).toBe(6);
    expect(result.progression.notes.filter(v => v.trackIndex === 4)).toEqual(input.notes.filter(v => v.trackIndex === 4));
    expect(result.progression.notes.find(v => v.trackIndex === 2)).toBe(input.notes.at(-1));
    const tail = result.progression.notes.filter(v => v.trackIndex === result.generatedTrackIndex);
    expect(tail.length).toBeGreaterThan(0);
    expect(tail.every(v => v.timeStart >= 8 && v.timeStart + v.duration <= 24)).toBe(true);
    expect(result.progression.chords).toEqual(input.chords);
    expect(result.progression.tracks?.find(v => v.index === result.generatedTrackIndex)).toEqual({
      index: result.generatedTrackIndex, name: "Melody Continuation",
      channel: 0, program: 80, generatedRole: "continuation", sourceTrackIndex: 4,
    });
  });

  it("reuses continuation track and MIDI channel during regeneration", () => {
    const original = seed();
    const a = success(original, options, 1);
    const b = success(a.progression, {...options, creativity: 85}, 100);
    expect(b.generatedTrackIndex).toBe(a.generatedTrackIndex);
    expect(b.progression.tracks).toEqual(a.progression.tracks);
    expect(b.progression.notes.filter(v => v.trackIndex === 4)).toEqual(original.notes.filter(v => v.trackIndex === 4));
    expect(b.progression.notes.filter(v => v.trackIndex === b.generatedTrackIndex).length)
      .toBe(a.progression.notes.filter(v => v.trackIndex === a.generatedTrackIndex).length);
    expect(b.progression.notes).not.toEqual(a.progression.notes);
  });

  it("returns deterministic motifs for the same seed and settings", () => {
    const a = success(seed(), options, 441);
    const b = success(seed(), options, 441);
    expect(a).toEqual(b);
    const variations = Array.from({length: 8}, (_, i) => success(seed(), options, i));
    const rendered = new Set(variations.map(v => v.progression.notes.filter(n => n.trackIndex === v.generatedTrackIndex)
      .map(n => n.midi).join(",")));
    expect(rendered.size).toBeGreaterThan(1);
  });

  it("reimagines a recognizable alternative on its own track, without rewriting the lead", () => {
    const input = seed();
    const a = success(input, {...options, operation: "variation", creativity: 92}, 38);
    const alt = a.progression.notes.filter(v => v.trackIndex === a.generatedTrackIndex);
    expect(alt.length).toBe(8);
    expect(alt[0].midi).toBe(72);
    expect(alt.at(-1)?.midi).toBe(72);
    expect(a.progression.notes.filter(v => v.trackIndex === 4)).toEqual(input.notes.filter(v => v.trackIndex === 4));
    expect(a.progression.totalBars).toBe(2);
    expect(a.progression.tracks?.find(v => v.index === a.generatedTrackIndex)?.generatedRole).toBe("variation");
    const b = success(a.progression, {...options, operation: "variation", creativity: 92}, 392);
    expect(b.generatedTrackIndex).toBe(a.generatedTrackIndex);
    expect(b.progression.tracks).toEqual(a.progression.tracks);
  });

  it("at zero creative distance preserves the monophonic notes as a faithful separate alternative", () => {
    const lead = seed().notes.filter(x => x.trackIndex === 4);
    const copy = success(seed(), {...options, operation: "variation", creativity: 0});
    const generated = copy.progression.notes.filter(x => x.trackIndex === copy.generatedTrackIndex);
    expect(generated.map(x => [x.midi, x.timeStart, x.velocity]))
      .toEqual(lead.map(x => [x.midi, x.timeStart, x.velocity]));
  });

  it("collapses polyphonic notes to lead contour for a monophonic response", () => {
    const input = seed();
    input.notes.push(n(60, 0, 1), n(64, 1, 0.6));
    const result = success(input, {...options, operation: "variation"});
    expect(result.progression.notes.filter(x => x.trackIndex === 4)).toHaveLength(10);
    expect(result.generatedNoteCount).toBe(8);
  });

  it("keeps MIDI pitches, intervals, timings and velocities bounded at register extremes", () => {
    const input: ProgressionData = {
      notes: [n(0, 0, 1), n(127, 1, 1), n(2, 2, 0.5), n(126, 3, 1)],
      chords: [], totalBars: 1,
    };
    for (const operation of ["continue", "variation"] as const) {
      for (const creativity of [0, 50, 100]) {
        const result = success(input, {...options, operation, creativity, continuationBars: 2}, 199);
        const generated = result.progression.notes.filter(x => x.trackIndex === result.generatedTrackIndex);
        expect(generated.length).toBeGreaterThan(0);
        for (const note of generated) {
          expect(Number.isInteger(note.midi)).toBe(true);
          expect(note.midi).toBeGreaterThanOrEqual(0);
          expect(note.midi).toBeLessThanOrEqual(127);
          expect(note.name).toBe(Note.fromMidi(note.midi));
          expect(note.timeStart).toBeGreaterThanOrEqual(0);
          expect(note.duration).toBeGreaterThan(0);
          expect(note.velocity).toBeGreaterThanOrEqual(0.1);
          expect(note.velocity).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("supports sparse, off-grid rhythms and short one-bar continuations", () => {
    const input: ProgressionData = {
      notes: [n(68, 0.125, 0.25), n(70, 1.625, 0.125), n(73, 3.125, 0.25)],
      chords: [], totalBars: 1,
    };
    const result = success(input, {...options, root: "Ab", mode: "major", continuationBars: 1}, 5);
    const output = result.progression.notes.filter(v => v.trackIndex === result.generatedTrackIndex);
    expect(output[0].timeStart).toBeCloseTo(4.125);
    expect(output.at(-1)!.timeStart + output.at(-1)!.duration).toBeLessThanOrEqual(8);
  });

  it("uses Compose as fallback when automatic key inference is ambiguous", () => {
    const data: ProgressionData = {
      notes: [n(62, 0, 1), n(65, 2, 1)],
      chords: [], totalBars: 1,
    };
    const result = success(data, {...options, keyStrategy: "detect", root: "D", mode: "minor"});
    expect(result.ambiguousKey).toBe(true);
    expect(result.detectedKey).toBe(false);
    expect(result.root).toBe("D");
    expect(result.mode).toBe("minor");
  });

  it("allows harmonization to follow both the original phrase and a generated continuation", () => {
    const first = success(seed(), options);
    const arrangement = generateFromMelody(first.progression, {
      sourceTrackIndex: 4, root: "C", mode: "major", tension: 32,
      harmonicFit: 90, density: "sparse", keyStrategy: "manual",
    }, seededRandom(4));
    expect(arrangement.ok).toBe(true);
    if (!arrangement.ok) return;
    expect(arrangement.progression.chords.filter(chord => chord.generatedSourceTrackIndex === 4))
      .toHaveLength(6);
    expect(arrangement.progression.chords.filter(chord => chord.generatedSourceTrackIndex === undefined))
      .toEqual(seed().chords);
    expect(arrangement.progression.notes.filter(n => n.trackIndex === first.generatedTrackIndex))
      .toEqual(first.progression.notes.filter(n => n.trackIndex === first.generatedTrackIndex));
    expect(arrangement.progression.notes.filter(n => n.trackIndex === 4))
      .toEqual(seed().notes.filter(n => n.trackIndex === 4));
  });

  it("refuses generated tracks as source and copies remain user-owned", () => {
    const first = success(seed());
    expect(generateMotif(first.progression, {...options, sourceTrackIndex: first.generatedTrackIndex}).ok).toBe(false);
    const copied = duplicateTrack(first.progression, first.generatedTrackIndex)!;
    expect(copied.progression.tracks?.find(v => v.index === copied.index)?.generatedRole).toBeUndefined();
    const deleted = deleteTrack(first.progression, 4);
    expect(deleted.tracks?.find(v => v.index === first.generatedTrackIndex)?.generatedRole).toBeUndefined();
  });

  it("fails atomically when all melodic channels are allocated", () => {
    const original = seed();
    const crowded = {
      ...original,
      tracks: MELODIC_CHANNELS.map((channel, i) => ({
        index: i, name: "Track " + i, channel, program: 0,
      })),
    };
    const saved = structuredClone(crowded);
    expect(generateMotif(crowded, options).ok).toBe(false);
    expect(crowded).toEqual(saved);
  });

  it("rejects invalid bounds, empty source, unsupported operations, and phrases beyond 64 bars", () => {
    const data = seed();
    expect(generateMotif(data, {...options, sourceTrackIndex: -1}).ok).toBe(false);
    expect(generateMotif(data, {...options, creativity: 120}).ok).toBe(false);
    expect(generateMotif(data, {...options, continuationBars: 3 as 4}).ok).toBe(false);
    expect(generateMotif({...data, notes: []}, options).ok).toBe(false);
    expect(generateMotif({...data, notes: [n(60, 0)]}, options).ok).toBe(false);
    expect(generateMotif({...data, notes: [n(60, 0), n(63, 0)]}, options).ok).toBe(false);
    expect(generateMotif({...data, notes: [n(60, 252), n(62, 254)], totalBars: 64},
      {...options, continuationBars: 4}).ok).toBe(false);
    expect(generateMotif({...data, notes: [n(140, 0), n(60, 1)]}, options).ok).toBe(false);
  });
});
