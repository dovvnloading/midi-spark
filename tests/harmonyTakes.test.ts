import { describe, expect, it } from "vitest";
import { Note } from "@tonaljs/tonal";
import { generateFromMelody, type MelodyGenerationOptions } from "../src/lib/adaptive";
import { generateHarmonyTakes } from "../src/lib/harmonyTakes";
import { toggleChordRegionLock } from "../src/lib/chordLocks";
import { historyReducer } from "../src/hooks/useHistory";
import { seededRandom } from "../src/lib/random";
import type { NoteEvent, ProgressionData } from "../src/lib/theory";

const note = (midi: number, timeStart: number, trackIndex = 0): NoteEvent => ({
  midi, name: Note.fromMidi(midi)!, timeStart, duration: 0.9, velocity: 0.76, trackIndex,
});
const options: MelodyGenerationOptions = {
  sourceTrackIndex: 0, root: "C", mode: "major",
  tension: 50, harmonicFit: 70, keyStrategy: "manual",
  harmonicPacing: "adaptive", harmonyExploration: 90, phraseCoherence: 45,
  density: "balanced",
};
function source(): ProgressionData {
  const motif = [72, 74, 76, 79, 77, 76, 74, 72];
  const notes = Array.from({ length: 4 }, (_, group) =>
    motif.map((midi, index) => note(midi + (group % 2 ? 2 : 0), group * 8 + index)))
    .flat();
  return {
    notes: [...notes, note(49, 2, 8)], chords: [], totalBars: 8,
    tracks: [{ index: 0, name: "Original melody", channel: 0 },
      { index: 8, name: "User pad", channel: 8 }],
  };
}
function arranged(): ProgressionData {
  const r = generateFromMelody(source(), options, seededRandom(123));
  if (!r.ok) throw Error(r.reason);
  return r.progression;
}
const seeds = Array.from({ length: 18 }, (_, i) => i * 137 + 202607);

describe("non-destructive harmony take batches", () => {
  it("requires previously generated backing and validates the request", () => {
    expect(generateHarmonyTakes(source(), options, seeds)).toMatchObject({
      ok: false, reason: expect.stringMatching(/Harmonize the melody once/),
    });
    expect(generateHarmonyTakes(arranged(), options, [], 3).ok).toBe(false);
    expect(generateHarmonyTakes(arranged(), options, [NaN], 3).ok).toBe(false);
    expect(generateHarmonyTakes(arranged(), options, seeds, 0).ok).toBe(false);
  });

  it("generates reproducible, structurally distinct options without changing the base", () => {
    const base = arranged();
    const snapshot = JSON.stringify(base);
    const a = generateHarmonyTakes(base, options, seeds, 3);
    const b = generateHarmonyTakes(base, options, seeds, 3);
    expect(a.ok).toBe(true);
    expect(a).toEqual(b);
    expect(JSON.stringify(base)).toBe(snapshot);
    if (!a.ok) return;
    expect(a.takes.length).toBeGreaterThan(0);
    expect(a.takes.length).toBeLessThanOrEqual(3);
    const views = a.takes.map(take => JSON.stringify(take.progression.chords) +
      JSON.stringify(take.progression.notes.filter(note => note.trackIndex !== 0 && note.trackIndex !== 8)
        .map(n => [n.trackIndex, n.midi, n.timeStart, n.duration])));
    expect(new Set(views).size).toBe(a.takes.length);
    for (const take of a.takes) {
      expect(take.progression.notes.filter(n => n.trackIndex === 0))
        .toEqual(base.notes.filter(n => n.trackIndex === 0));
      expect(take.progression.notes.find(n => n.trackIndex === 8))
        .toBe(base.notes.find(n => n.trackIndex === 8));
      expect(take.progression.tracks).toEqual(base.tracks);
      expect(take.changedRegions).toBeGreaterThanOrEqual(0);
      expect(take.chordSummary.length).toBeGreaterThan(0);
    }
  });

  it("reports when locks leave no meaningful alternative, not invented novelty", () => {
    const base = arranged();
    let protectedProject = base;
    for (let i = 0; i < base.chords.length; i++) {
      if (base.chords[i].generatedSourceTrackIndex === 0) {
        protectedProject = toggleChordRegionLock(protectedProject, i);
      }
    }
    const result = generateHarmonyTakes(protectedProject, options, seeds);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/No structurally distinct takes/);
  });

  it("accepts a chosen candidate in one undoable step, retaining the original until then", () => {
    const base = arranged();
    const result = generateHarmonyTakes(base, options, seeds, 3);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const selected = result.takes[0].progression;
    const before = { past: [] as ProgressionData[], present: base, future: [] as ProgressionData[] };
    expect(before.present).toBe(base);
    const accepted = historyReducer(before, { type: "commit", updater: selected });
    expect(accepted.present).toBe(selected);
    expect(accepted.past).toEqual([base]);
    expect(historyReducer(accepted, { type: "undo" }).present).toBe(base);
  });
});
