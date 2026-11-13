import { Chord, Note } from "@tonaljs/tonal";
import { describe, expect, it } from "vitest";
import type { ProgressionData } from "../src/lib/theory";
import {
  CHORD_PRESETS, CHORD_STAMPS, getStampPreset, placeStamp,
  PROGRESSION_PRESETS, SCALE_PRESETS, SCALE_STAMPS,
  searchStampPresets, STAMP_GROUPS, STAMP_PRESETS, stampDuration,
} from "../src/lib/stampPresets";

function empty(totalBars = 1): ProgressionData {
  return { notes: [], chords: [], totalBars };
}
function placed(id: string, root = 60, start = 0, length = 1,
  data = empty(), track = 0) {
  const result = placeStamp(data, id, root, start, length, track);
  expect(result, "Could not place " + id).not.toBeNull();
  return result!;
}
function pitchClasses(midi: number[]): number[] {
  return [...new Set(midi.map(p => p % 12))].sort((a, b) => a - b);
}

describe("stamp catalog", () => {
  it("has a stable, searchable, comprehensive vocabulary without duplicate keys", () => {
    expect(CHORD_PRESETS.length).toBeGreaterThanOrEqual(35);
    expect(SCALE_PRESETS.length).toBeGreaterThanOrEqual(12);
    expect(PROGRESSION_PRESETS.length).toBeGreaterThanOrEqual(20);
    expect(STAMP_PRESETS.length).toBe(CHORD_PRESETS.length + SCALE_PRESETS.length + PROGRESSION_PRESETS.length);
    expect(new Set(STAMP_PRESETS.map(p => p.id)).size).toBe(STAMP_PRESETS.length);
    for (const preset of STAMP_PRESETS) {
      expect(getStampPreset(preset.id)).toBe(preset);
      expect(STAMP_GROUPS).toContain(preset.group);
      expect(preset.label).not.toBe("");
      expect(preset.description).not.toBe("");
    }
    expect(getStampPreset("unknown")).toBeUndefined();
    expect(searchStampPresets("jazz")).toContainEqual(expect.objectContaining({ id: "two-five-one" }));
    expect(searchStampPresets("minor   cadence")).toContainEqual(expect.objectContaining({ id: "minor-cadence" }));
    expect(searchStampPresets("flat 9")).toContainEqual(expect.objectContaining({ id: "7b9" }));
    expect(searchStampPresets("gibberish")).toEqual([]);
    expect(searchStampPresets(" ").length).toBe(STAMP_PRESETS.length);
  });

  it("backs the legacy interval maps with the same chord and scale recipes", () => {
    for (const preset of CHORD_PRESETS) expect(CHORD_STAMPS[preset.id]).toEqual(preset.intervals);
    for (const preset of SCALE_PRESETS) expect(SCALE_STAMPS[preset.id]).toEqual(preset.intervals);
  });

  it("references only real chords and gives every progression a positive duration", () => {
    const qualities = new Map(CHORD_PRESETS.map(p => [p.id, p]));
    for (const p of PROGRESSION_PRESETS) {
      expect(p.steps.length).toBeGreaterThanOrEqual(3);
      expect(stampDuration(p, 0.25)).toBeGreaterThan(0);
      expect(stampDuration(p, 0.25) % 2).toBe(0);
      for (const [degree, id, duration = 4] of p.steps) {
        expect(Number.isInteger(degree)).toBe(true);
        expect(degree).toBeGreaterThanOrEqual(0);
        expect(degree).toBeLessThan(12);
        expect(qualities.has(id), p.id + " references " + id).toBe(true);
        expect(duration).toBeGreaterThan(0);
      }
    }
  });

  it("defines conventional tonal symbols for all pitched chord stamps", () => {
    for (const quality of CHORD_PRESETS) {
      const label = "C" + quality.suffix;
      const parsed = Chord.get(label);
      expect(parsed.empty, label + " should parse").toBe(false);
      const degrees = pitchClasses(quality.intervals);
      const normalized = pitchClasses(parsed.notes.map(name => Note.chroma(name) ?? -1));
      expect(normalized, label + " should use the documented pitch classes").toEqual(degrees);
    }
  });
});

describe("timeline stamp placement", () => {
  it("places root-position chord notes with exact pitch, duration, velocity and track ownership", () => {
    const result = placed("Maj7", 60, 1.25, 2, empty(2), 7);
    expect(result.addedNotes.map(n => n.midi)).toEqual([60, 64, 67, 71]);
    expect(result.addedChords).toEqual([{ name: "Cmaj7", timeStart: 1.25, duration: 2 }]);
    expect(result.addedNotes.every(n => n.trackIndex === 7 && n.velocity === 0.8 &&
      n.duration === 2 && n.timeStart === 1.25 && n.name === Note.fromMidi(n.midi))).toBe(true);
    expect(result.progression.notes).toEqual(result.addedNotes);
    expect(result.progression.chords).toEqual(result.addedChords);
    expect(stampDuration(getStampPreset("Maj7")!, 2)).toBe(2);
  });

  it("spells traditional major and minor progressions, including minor-key leading tone", () => {
    const pop = placed("pop-anthem");
    expect(pop.addedChords.map(chord => chord.name)).toEqual(["C", "G", "Am", "F"]);
    expect(pop.addedChords.map(chord => chord.timeStart)).toEqual([0, 4, 8, 12]);
    expect(pop.progression.totalBars).toBe(4);
    const minor = placed("andalusian");
    expect(minor.addedChords.map(chord => pitchClasses(
      minor.addedNotes.filter(note => note.timeStart === chord.timeStart).map(note => note.midi),
    ))).toEqual([
      [0, 3, 7], [2, 5, 10], [0, 3, 8], [2, 7, 11],
    ]);
    // Dominant in C minor must contain B natural, not the B-flat of natural minor.
    expect(minor.addedChords.at(-1)?.name).toBe("G");
  });

  it("places simultaneous half-bar jazz chords and correctly grows the canvas", () => {
    const result = placed("two-five-one", 60, 6);
    expect(result.addedChords.map(c => [c.name, c.timeStart, c.duration])).toEqual([
      ["Dm7", 6, 2], ["G7", 8, 2], ["Cmaj7", 10, 4],
    ]);
    expect(result.progression.totalBars).toBe(4);
    expect(result.addedNotes.every(n => n.timeStart + n.duration <= 16)).toBe(true);
  });

  it("places a complete 12-bar progression in one atomic edit", () => {
    const result = placed("twelve-bar-blues", 60, 4, 0.25, empty(1), 2);
    expect(result.addedChords.length).toBe(12);
    expect(result.addedChords.map(chord => chord.timeStart)).toEqual(
      Array.from({ length: 12 }, (_, i) => 4 + i * 4));
    expect(result.addedChords.every(chord => chord.duration === 4)).toBe(true);
    expect(result.addedNotes.every(note => note.trackIndex === 2)).toBe(true);
    expect(result.progression.totalBars).toBe(13);
    expect(stampDuration(getStampPreset("twelve-bar-blues")!, 0.25)).toBe(48);
  });

  it("keeps manual chord labels clipped to the uncovered region, never overwriting generated locks", () => {
    const data: ProgressionData = {
      totalBars: 8, notes: [{ midi: 48, name: "C3", timeStart: 1, duration: 1, velocity: 0.6, trackIndex: 3 }],
      chords: [
        { name: "D", timeStart: 0, duration: 24 },
        { name: "G", timeStart: 5, duration: 4, generatedSourceTrackIndex: 3, locked: true },
        { name: "F", timeStart: 28, duration: 4 },
      ],
    };
    const original = structuredClone(data);
    const result = placed("pop-anthem", 60, 4, 0.25, data, 9);
    expect(data).toEqual(original);
    expect(result.progression.notes[0]).toEqual(data.notes[0]);
    expect(result.progression.chords).toContainEqual({ name: "D", timeStart: 0, duration: 4 });
    expect(result.progression.chords).toContainEqual({ name: "D", timeStart: 20, duration: 4 });
    expect(result.progression.chords).toContainEqual({ name: "G", timeStart: 5, duration: 4,
      generatedSourceTrackIndex: 3, locked: true });
    expect(result.progression.chords).toContainEqual({ name: "F", timeStart: 28, duration: 4 });
    expect(result.addedChords.map(c => c.timeStart)).toEqual([4, 8, 12, 16]);
  });

  it("retains scale stamps as short quiet note guides without labeling chords", () => {
    const result = placed("Dorian", 62, 0.25, 4);
    expect(result.addedNotes.map(n => n.midi)).toEqual([62, 64, 65, 67, 69, 71, 72]);
    expect(result.addedNotes.every(n => n.velocity === 0.1 && n.duration === 1 / 64)).toBe(true);
    expect(result.addedChords).toEqual([]);
    expect(result.progression.chords).toEqual([]);
  });

  it("preserves every chord tone at both MIDI boundaries across the entire catalog", () => {
    for (const preset of STAMP_PRESETS) {
      for (const root of [0, 127]) {
        const result = placed(preset.id, root);
        const expected = preset.kind === "progression"
          ? preset.steps.reduce((total, [, chord]) => total + CHORD_STAMPS[chord].length, 0)
          : preset.intervals.length;
        expect(result.addedNotes.length, preset.id + " at " + root).toBe(expected);
        expect(result.addedNotes.every(n => Number.isInteger(n.midi) && n.midi >= 0 && n.midi <= 127 &&
          n.timeStart >= 0 && n.duration > 0 && n.timeStart + n.duration <= result.progression.totalBars * 4),
          preset.id + " at " + root).toBe(true);
      }
    }
  });

  it("rejects invalid times, pitches, track indices, missing IDs and project overflow", () => {
    expect(placeStamp(empty(), "unknown", 60, 0, 1, 0)).toBeNull();
    expect(placeStamp(empty(), "Major", NaN, 0, 1, 0)).toBeNull();
    expect(placeStamp(empty(), "Major", 128, 0, 1, 0)).toBeNull();
    expect(placeStamp(empty(), "Major", 60, -1, 1, 0)).toBeNull();
    expect(placeStamp(empty(), "Major", 60, Infinity, 1, 0)).toBeNull();
    expect(placeStamp(empty(), "Major", 60, 0, 0, 0)).toBeNull();
    expect(placeStamp(empty(), "Major", 60, 0, 17, 0)).toBeNull();
    expect(placeStamp(empty(), "Major", 60, 0, 1, -1)).toBeNull();
    expect(placeStamp(empty(), "twelve-bar-blues", 60, 2040, 1, 0)).toBeNull();
    expect(empty()).toEqual({ notes: [], chords: [], totalBars: 1 });
  });
});
