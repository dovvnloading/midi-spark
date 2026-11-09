import { describe, expect, it } from "vitest";
import { Note } from "@tonaljs/tonal";
import { describeHarmonyDifference, harmonyStructureSignature, type HarmonyTake } from "../src/lib/harmonyTakes";
import { isCompatibleTakeBank, removeHarmonyFavorite, restoreHarmonyFavorite,
  saveHarmonyFavorite, takeBaseFingerprint } from "../src/lib/takeLibrary";
import type { NoteEvent, ProgressionData } from "../src/lib/theory";

const note = (midi: number, timeStart: number, trackIndex: number): NoteEvent => ({
  midi, name: Note.fromMidi(midi)!, timeStart, duration: 1,
  velocity: 0.75, trackIndex,
});
function base(): ProgressionData {
  return {
    notes: [note(72, 0, 0), note(74, 4, 0), note(90, 3, 9),
      note(48, 0, 1), note(52, 4, 1), note(60, 0, 2), note(64, 4, 2)],
    chords: [
      { name: "annotation", timeStart: 0, duration: 4 },
      { name: "C", timeStart: 0, duration: 4, generatedSourceTrackIndex: 0 },
      { name: "F", timeStart: 4, duration: 4, generatedSourceTrackIndex: 0 },
    ],
    totalBars: 2,
    harmonyConstraints: [{ sourceTrackIndex: 0, bar: 0, kind: "require", chord: "C" }],
    tracks: [
      { index: 0, name: "Original", channel: 0 },
      { index: 9, name: "User pad", channel: 8 },
      { index: 1, name: "Generated Bass", channel: 1, generatedRole: "bass", sourceTrackIndex: 0 },
      { index: 2, name: "Generated Harmony", channel: 2, generatedRole: "harmony", sourceTrackIndex: 0 },
    ],
  };
}
function variation(original: ProgressionData, n = 1): HarmonyTake {
  const changes = {
    ...original,
    notes: [...original.notes.filter(note => note.trackIndex !== 1 && note.trackIndex !== 2),
      note(48, 0, 1), note(48 + n, 4, 1),
      note(60, 0, 2), note(62 + n, 4, 2), note(67 + n, 5, 2)],
    chords: [...original.chords.filter(chord => chord.generatedSourceTrackIndex !== 0),
      { name: "C", timeStart: 0, duration: 4, generatedSourceTrackIndex: 0 },
      { name: n % 2 ? "G" : "Am", timeStart: 4, duration: 4, generatedSourceTrackIndex: 0 }],
  };
  return { seed: 700 + n, progression: changes, root: "C",
    mode: "major", changedRegions: 1, chordSummary: "C · G" };
}

describe("Take Lab saved favorites", () => {
  it("stores just generated backing and restores it against the untouched base", () => {
    const original = base(), proposal = variation(original);
    const snapshot = JSON.stringify(original);
    const saved = saveHarmonyFavorite(original, 0, proposal);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.bank.favorites).toHaveLength(1);
    expect(saved.bank.favorites[0].notes).toHaveLength(5);
    expect(saved.bank.favorites[0].notes.some(note => note.trackIndex === 0 || note.trackIndex === 9)).toBe(false);
    expect(saved.bank.favorites[0].chords).toHaveLength(2);
    expect(saved.bank.baseFingerprint).toBe(takeBaseFingerprint(original));

    // Browser round-trip reconstructs candidate from today's immutable source.
    const restoredBase = JSON.parse(JSON.stringify(original)) as ProgressionData;
    const loadedBank = JSON.parse(JSON.stringify(saved.bank)) as typeof saved.bank;
    expect(isCompatibleTakeBank(restoredBase, 0, loadedBank)).toBe(true);
    const restored = restoreHarmonyFavorite(restoredBase, loadedBank, loadedBank.favorites[0]);
    expect(restored?.progression).toEqual(proposal.progression);
    expect(restored?.progression.notes[0]).toBe(restoredBase.notes[0]);
    expect(restored?.progression.notes[2]).toBe(restoredBase.notes[2]);
    expect(restored?.progression.tracks).toBe(restoredBase.tracks);
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it("deduplicates musical structures, limits favorites, and removes precisely one", () => {
    const original = base();
    const first = saveHarmonyFavorite(original, 0, variation(original, 1));
    if (!first.ok) throw Error(first.reason);
    const again = saveHarmonyFavorite(original, 0, variation(original, 1), first.bank);
    expect(again).toMatchObject({ ok: true, alreadySaved: true });
    if (!again.ok) return;
    expect(again.bank).toBe(first.bank);

    let bank = first.bank;
    for (const value of [2, 3, 4]) {
      const saved = saveHarmonyFavorite(original, 0, variation(original, value), bank);
      if (!saved.ok) throw Error(saved.reason);
      bank = saved.bank;
    }
    expect(bank.favorites).toHaveLength(4);
    const fifth = saveHarmonyFavorite(original, 0, variation(original, 5), bank);
    expect(fifth.ok).toBe(false);
    const removed = removeHarmonyFavorite(bank, bank.favorites[1].id);
    expect(removed.favorites).toHaveLength(3);
    expect(removed.favorites[0]).toBe(bank.favorites[0]);
    expect(removeHarmonyFavorite(bank, "missing")).toBe(bank);
  });

  it("fails closed for unrelated or edited scores rather than resurrecting stale takes", () => {
    const original = base();
    const saved = saveHarmonyFavorite(original, 0, variation(original));
    if (!saved.ok) throw Error(saved.reason);
    const edited = { ...original, notes: original.notes.map((n, i) =>
      i === 0 ? { ...n, midi: 73 } : n) };
    expect(isCompatibleTakeBank(edited, 0, saved.bank)).toBe(false);
    expect(restoreHarmonyFavorite(edited, saved.bank, saved.bank.favorites[0])).toBeNull();
    expect(isCompatibleTakeBank(original, 9, saved.bank)).toBe(false);
    const reset = saveHarmonyFavorite(edited, 0, variation(edited), saved.bank);
    expect(reset.ok).toBe(true);
    if (reset.ok) expect(reset.bank.favorites).toHaveLength(1);
    const mismatch = { ...variation(original),
      progression: { ...variation(original).progression,
        tracks: original.tracks!.filter(track => track.generatedRole !== "harmony") } };
    expect(saveHarmonyFavorite(original, 0, mismatch).ok).toBe(false);
  });

  it("describes changed bars and accompaniment density without claiming a quality score", () => {
    const original = base(), changed = variation(original);
    const result = describeHarmonyDifference(original, changed.progression, 0);
    expect(result).toMatchObject({
      changedBars: 1, totalBars: 2, bassNoteDelta: 0,
      harmonyNoteDelta: 1, chordChangeDelta: 0,
    });
    expect(result.examples).toEqual(["Bar 2: F → G"]);
    expect(harmonyStructureSignature(original, 0))
      .not.toBe(harmonyStructureSignature(changed.progression, 0));
    expect(describeHarmonyDifference(original, original, 0).changedBars).toBe(0);
  });
});
