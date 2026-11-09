import { describe, expect, it } from "vitest";
import { Note } from "@tonaljs/tonal";
import { buildSongForm, type SongFormOptions } from "../src/lib/songForm";
import { generateFromMelody, type MelodyGenerationOptions } from "../src/lib/adaptive";
import { seededRandom } from "../src/lib/random";
import type { NoteEvent, ProgressionData } from "../src/lib/theory";

const note = (midi: number, timeStart: number, trackIndex = 0): NoteEvent => ({
  midi, name: Note.fromMidi(midi)!, timeStart, duration: 0.9, velocity: 0.75, trackIndex,
});
function melody(): ProgressionData {
  const pitches = [72, 76, 79, 76, 74, 77, 81, 77,
    79, 76, 74, 72, 72, 74, 76, 72];
  return {
    notes: [...pitches.map((p, i) => note(p, i)), note(48, 0, 7)],
    chords: [{ name: "C", timeStart: 0, duration: 4 }],
    tracks: [
      { index: 0, name: "Lead", channel: 0 },
      { index: 7, name: "Imported pad", channel: 7 },
    ],
    totalBars: 4,
  };
}
const harmonicOptions: MelodyGenerationOptions = {
  sourceTrackIndex: 0, root: "C", mode: "major", tension: 45,
  harmonicFit: 75, harmonyExploration: 82, phraseCoherence: 65,
  harmonicPacing: "adaptive", density: "balanced", keyStrategy: "manual",
};
const options: SongFormOptions = {
  form: "AABA", seed: 9122026, contrast: 70, sourceTrackIndex: 0,
};

describe("hierarchical AABA / ABAB arrangement builder", () => {
  it("turns a four-bar theme into 16 bars with an unchanged original and a contrasting bridge", () => {
    const original = melody();
    const snapshot = JSON.stringify(original);
    const result = buildSongForm(original, options);
    if (!result.ok) throw Error(result.reason);
    expect(result.progression.totalBars).toBe(16);
    expect(result.reharmonizedBridge).toBe(false);
    expect(result.sections.map(section => [section.label, section.startBar, section.bars])).toEqual([
      ["A", 0, 4], ["A′", 4, 4], ["B", 8, 4], ["A (return)", 12, 4],
    ]);
    expect(result.progression.notes).toHaveLength(original.notes.length * 4);
    expect(result.progression.notes.slice(0, original.notes.length)).toEqual(original.notes);
    for (let i = 0; i < original.notes.length; i++) expect(result.progression.notes[i]).toBe(original.notes[i]);
    expect(result.progression.notes.some(n => n.timeStart >= 32 && n.midi === 77)).toBe(true);
    expect(result.progression.notes.some(n => n.timeStart >= 48 && n.midi === 72)).toBe(true);
    expect(result.progression.tracks).toBe(original.tracks);
    expect(result.progression.chords.find(c => c.timeStart === 32 && c.name === "F")).toBeTruthy();
    expect(result.progression.chords[0]).toBe(original.chords[0]);
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it("produces deterministic A′ developments, B contrast and an ABAB return", () => {
    const original = melody();
    const a = buildSongForm(original, { ...options, form: "ABAB" });
    const b = buildSongForm(original, { ...options, form: "ABAB" });
    expect(a).toEqual(b);
    if (!a.ok) return;
    expect(a.sections.map(section => section.label)).toEqual(["A", "B", "A′", "B (return)"]);
    const firstB = a.progression.notes.filter(n => n.trackIndex === 0 && n.timeStart >= 16 && n.timeStart < 32);
    const finalB = a.progression.notes.filter(n => n.trackIndex === 0 && n.timeStart >= 48);
    expect(firstB.map(n => n.midi)).toEqual(finalB.map(n => n.midi));
    expect(firstB.map(n => n.midi)).not.toEqual(original.notes.filter(n => n.trackIndex === 0).map(n => n.midi));
    expect(a.progression.notes.filter(n => n.trackIndex === 0 && n.timeStart < 16))
      .toEqual(original.notes.filter(n => n.trackIndex === 0));
  });

  it("reharmonizes a bridge with the existing melody-conditioned solver and preserves adjacent sections", () => {
    const initial = melody();
    const harmonized = generateFromMelody(initial, harmonicOptions, seededRandom(44));
    if (!harmonized.ok) throw Error(harmonized.reason);
    const base = harmonized.progression;
    const protectedBase = { ...base, chords: base.chords.map((chord, index) =>
      index === 0 && chord.generatedSourceTrackIndex === 0 ? { ...chord, locked: true } : chord) };
    const result = buildSongForm(protectedBase, {
      ...options, harmonicOptions,
    });
    if (!result.ok) throw Error(result.reason);
    expect(result.reharmonizedBridge).toBe(true);
    const rendered = result.progression;
    expect(rendered.tracks).toEqual(protectedBase.tracks);
    expect(rendered.totalBars).toBe(16);
    expect(rendered.notes.filter(n => n.timeStart < 16)).toEqual(protectedBase.notes);
    expect(rendered.chords.filter(c => c.timeStart < 16)).toEqual(protectedBase.chords);
    const sourceB = rendered.notes.filter(n => n.trackIndex === 0 && n.timeStart >= 32 && n.timeStart < 48);
    expect(sourceB).toHaveLength(initial.notes.filter(n => n.trackIndex === 0).length);
    expect(sourceB[0].midi).toBe(initial.notes[0].midi + 5);
    const ownedB = rendered.chords.filter(c =>
      c.generatedSourceTrackIndex === 0 && c.timeStart >= 32 && c.timeStart < 48);
    expect(ownedB.length).toBeGreaterThanOrEqual(4);
    expect(rendered.notes.some(n => n.timeStart >= 48)).toBe(true);
    expect(buildSongForm(protectedBase, { ...options, harmonicOptions })).toEqual(result);
  });

  it("rejects unsupported pattern lengths, invalid notes, reused arrangements and non-4/4 meter", () => {
    expect(buildSongForm({ ...melody(), totalBars: 12 }, options).ok).toBe(false);
    expect(buildSongForm({ ...melody(), notes: [] }, options).ok).toBe(false);
    expect(buildSongForm({ ...melody(), sourceTimeSignatures: ["3/4"] }, options).ok).toBe(false);
    expect(buildSongForm(melody(), { ...options, contrast: 101 }).ok).toBe(false);
    expect(buildSongForm(melody(), { ...options, sourceTrackIndex: 99 }).ok).toBe(false);
    const high = { ...melody(), notes: [note(125, 0)] };
    const invalid = buildSongForm(high, options);
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.reason).toMatch(/too high/);
    const first = buildSongForm(melody(), options);
    if (first.ok) expect(buildSongForm(first.progression, options).ok).toBe(false);
  });
});
