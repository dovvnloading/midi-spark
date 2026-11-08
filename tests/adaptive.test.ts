import { describe, expect, it } from "vitest";
import { Note } from "@tonaljs/tonal";
import { generateFromMelody, isAdaptiveTrack, type MelodyGenerationOptions } from "../src/lib/adaptive";
import { seededRandom } from "../src/lib/random";
import type { NoteEvent, ProgressionData } from "../src/lib/theory";
import { MELODIC_CHANNELS } from "../src/lib/trackOperations";

const note = (midi: number, timeStart: number, duration = 1, trackIndex = 0): NoteEvent =>
  ({midi, name: Note.fromMidi(midi)!, timeStart, duration, velocity: 0.76, trackIndex});

const options: MelodyGenerationOptions = {
  sourceTrackIndex: 0, root: "C", mode: "major", tension: 30,
  harmonicFit: 90, density: "balanced", keyStrategy: "manual",
};

function melody(): ProgressionData {
  return {
    notes: [
      note(72, 0, 1), note(74, 1, 0.5), note(76, 1.5, 1.5), note(79, 3, 1),
      note(77, 4, 1), note(76, 5, 1), note(74, 6, 1), note(72, 7, 1),
    ],
    tracks: [{index: 0, name: "My melody", program: 80, channel: 3}],
    chords: [], totalBars: 2,
  };
}

function succeed(data: ProgressionData, settings = options, seed = 35) {
  const generated = generateFromMelody(data, settings, seededRandom(seed));
  if (!generated.ok) throw new Error(generated.reason);
  return generated;
}

describe("adaptive melody harmonization", () => {
  it("preserves every source note and its MIDI metadata exactly", () => {
    const source = melody();
    const saved = structuredClone(source);
    const generated = succeed(source);
    expect(source).toEqual(saved);
    expect(generated.progression.notes.filter(n => n.trackIndex === 0)).toEqual(source.notes);
    expect(generated.progression.notes.filter(n => n.trackIndex === 0)[0]).toBe(source.notes[0]);
    expect(generated.progression.tracks?.find(t => t.index === 0)).toEqual(source.tracks?.[0]);
    expect(generated.progression.notes.length).toBeGreaterThan(source.notes.length);
    expect(generated.progression.chords).toHaveLength(2);
  });

  it("keeps generated bass and harmony isolated and reuses their track IDs", () => {
    const first = succeed(melody());
    expect(first.generatedTrackIndices).toHaveLength(2);
    expect(new Set(first.generatedTrackIndices).size).toBe(2);
    const [bassIndex, harmonyIndex] = first.generatedTrackIndices;
    const bass = first.progression.tracks?.find(t => t.index === bassIndex);
    const harmony = first.progression.tracks?.find(t => t.index === harmonyIndex);
    expect(bass?.generatedRole).toBe("bass");
    expect(harmony?.generatedRole).toBe("harmony");
    expect(bass?.sourceTrackIndex).toBe(0);
    expect(bass?.channel).not.toBe(9);
    expect(harmony?.channel).not.toBe(9);
    expect(isAdaptiveTrack(bass!)).toBe(true);
    const second = succeed(first.progression, {...options, density: "active"}, 99);
    expect(second.generatedTrackIndices).toEqual(first.generatedTrackIndices);
    expect(second.progression.tracks).toEqual(first.progression.tracks);
    expect(second.progression.notes.filter(n => n.trackIndex === 0)).toEqual(melody().notes);
    expect(second.progression.notes.filter(n => n.trackIndex === harmonyIndex).length)
      .toBeGreaterThan(first.progression.notes.filter(n => n.trackIndex === harmonyIndex).length);
  });

  it("uses seeded repeatable decisions, with an undo-friendly immutable output", () => {
    const source = melody();
    const a = succeed(source, options, 730);
    const b = succeed(source, options, 730);
    expect(a).toEqual(b);
    expect(a.progression).not.toBe(source);
    expect(a.progression.notes).not.toBe(source.notes);
  });

  it("can explore distinct accompaniment variants with the same immutable melody", () => {
    const source = melody();
    const generated = Array.from({length: 12}, (_, i) => succeed(source,
      {...options, density: "active", harmonicFit: 85}, i + 1));
    const arrangements = new Set(generated.map(result =>
      result.progression.notes.filter(n => n.trackIndex !== 0)
        .map(n => [n.midi, n.timeStart, n.duration]).join(";")));
    expect(arrangements.size).toBeGreaterThan(1);
    for (const result of generated) {
      expect(result.progression.notes.filter(n => n.trackIndex === 0)).toEqual(source.notes);
    }
  });

  it("preserves unrelated imported tracks and their program, channel and notes", () => {
    const source = melody();
    const extra = note(48, 0.5, 3.5, 4);
    const imported = {
      ...source, notes: [...source.notes, extra],
      tracks: [...source.tracks!, {index: 4, name: "Original pad", program: 89, channel: 5}],
    };
    const result = succeed(imported);
    expect(result.progression.notes.find(n => n.trackIndex === 4)).toBe(extra);
    expect(result.progression.tracks?.find(t => t.index === 4)).toEqual(imported.tracks[1]);
    expect(result.generatedTrackIndices.every(n => n !== 4)).toBe(true);
  });

  it("can select a nonzero track from multi-track MIDI input", () => {
    const source = melody();
    const alternate = source.notes.map(n => ({...n, trackIndex: 7}));
    const input: ProgressionData = {
      notes: [note(36, 0, 4, 0), ...alternate],
      tracks: [
        {index: 0, name: "Bass", channel: 0},
        {index: 7, name: "Lead", channel: 2},
      ],
      chords: [], totalBars: 2,
    };
    const generated = succeed(input, {...options, sourceTrackIndex: 7});
    expect(generated.progression.notes.find(n => n.trackIndex === 0)).toBe(input.notes[0]);
    expect(generated.progression.notes.filter(n => n.trackIndex === 7)).toEqual(alternate);
    expect(generated.progression.tracks?.filter(t => t.sourceTrackIndex === 7)).toHaveLength(2);
  });

  it("preserves earlier annotations that do not belong to this generated source", () => {
    const source = melody();
    source.chords.push({name: "Custom", timeStart: 0, duration: 4});
    const first = succeed(source);
    const second = succeed(first.progression);
    expect(second.progression.chords.filter(c => c.name === "Custom")).toHaveLength(1);
    expect(second.progression.chords.filter(c => c.generatedSourceTrackIndex === 0)).toHaveLength(2);
  });

  it("scores stepwise passing notes without requiring a chord change at every onset", () => {
    const phrase: ProgressionData = {
      notes: [note(72, 0, 1.5), note(74, 1.5, 0.25), note(76, 1.75, 1.25),
        note(79, 3, 1)], chords: [], totalBars: 1,
    };
    const result = succeed(phrase, {...options, harmonicFit: 100});
    expect(result.progression.chords).toHaveLength(1);
    const chord = result.progression.chords[0];
    expect(chord.name).toMatch(/^C/);
    expect(result.progression.notes.filter(n => (n.trackIndex ?? 0) === 0)).toEqual(phrase.notes);
  });

  it("uses manually specified key if short melody key detection is ambiguous", () => {
    const sparse: ProgressionData = {notes: [note(62, 0, 1), note(65, 1, 1)], chords: [], totalBars: 1};
    const result = succeed(sparse, {...options, root: "D", mode: "minor", keyStrategy: "detect"});
    expect(result.keyWasAmbiguous).toBe(true);
    expect(result.usedDetectedKey).toBe(false);
    expect(result.root).toBe("D");
    expect(result.mode).toBe("minor");
  });

  it("supports melody pitches at MIDI extremes without invalid generated notes", () => {
    const extreme: ProgressionData = {
      notes: [note(0, 0, 0.5), note(127, 0.5, 1), note(60, 1.5, 2.5)],
      totalBars: 1, chords: [],
    };
    const result = succeed(extreme, {...options, density: "active"}, 77);
    for (const event of result.progression.notes) {
      expect(event.midi).toBeGreaterThanOrEqual(0);
      expect(event.midi).toBeLessThanOrEqual(127);
      expect(event.name).toBe(Note.fromMidi(event.midi));
      expect(event.duration).toBeGreaterThan(0);
      expect(event.timeStart).toBeGreaterThanOrEqual(0);
    }
  });

  it("clamps generated note timing within its target phrase", () => {
    const result = succeed(melody(), {...options, density: "active"});
    for (const event of result.progression.notes.filter(n => n.trackIndex !== 0)) {
      expect(event.timeStart + event.duration).toBeLessThanOrEqual(8.001);
      expect(event.duration).toBeGreaterThan(0);
    }
  });

  it("refuses a generated track as its own source", () => {
    const first = succeed(melody());
    const second = generateFromMelody(first.progression, {
      ...options, sourceTrackIndex: first.generatedTrackIndices[0],
    });
    expect(second).toEqual({ok: false, reason: "Choose an original melody track, not a generated accompaniment."});
  });

  it("avoids partial mutations when only one melodic channel remains", () => {
    const source = melody();
    const busy: ProgressionData = {
      ...source,
      tracks: MELODIC_CHANNELS.slice(0, 14).map((channel, index) => ({
        index, name: index === 0 ? "My melody" : "Occupied " + index, channel,
      })),
    };
    const saved = structuredClone(busy);
    const result = generateFromMelody(busy, options, seededRandom(4));
    expect(result.ok).toBe(false);
    expect(busy).toEqual(saved);
  });

  it("reports empty, invalid and overly long inputs explicitly", () => {
    expect(generateFromMelody({notes: [], chords: [], totalBars: 4}, options).ok).toBe(false);
    const invalid = {notes: [note(140, 0, 1)], chords: [], totalBars: 1};
    expect(generateFromMelody(invalid, options).ok).toBe(false);
    const tooLong = {notes: [note(60, 0, 1)], chords: [], totalBars: 65};
    expect(generateFromMelody(tooLong, options).ok).toBe(false);
    const tooDense = {notes: Array.from({length: 4097}, (_, i) => note(60, i / 256, 0.1)),
      chords: [], totalBars: 16};
    expect(generateFromMelody(tooDense, options).ok).toBe(false);
  });
});
