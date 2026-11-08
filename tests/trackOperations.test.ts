import { describe, expect, it } from "vitest";
import type { ProgressionData } from "../src/lib/theory";
import { historyReducer } from "../src/hooks/useHistory";
import { addTrack, deleteTrack, duplicateTrack, renameTrack, MELODIC_CHANNELS } from "../src/lib/trackOperations";
import { listTracks } from "../src/lib/tracks";

const sample: ProgressionData = {
  notes: [
    { name: "C3", midi: 48, timeStart: 0, duration: 1, velocity: 0.7 },
    { name: "E4", midi: 64, timeStart: 1, duration: 1, velocity: 0.8, trackIndex: 1 },
  ],
  chords: [{ name: "C", timeStart: 0, duration: 4 }],
  totalBars: 2,
  tracks: [{ index: 1, name: "Lead", program: 81, channel: 2 }],
};

describe("native track lifecycle", () => {
  it("adds an empty track and materializes implicit generated headers", () => {
    const result = addTrack(sample)!;
    expect(result.index).toBe(2);
    expect(result.progression.notes).toBe(sample.notes);
    expect(listTracks(result.progression).map(track => [track.name, track.noteCount])).toEqual([
      ["Track 1", 1], ["Lead", 1], ["Track 3", 0],
    ]);
    expect(result.progression.tracks?.map(track => track.channel)).toEqual([0, 2, 1]);
    expect(result.progression.nextTrackIndex).toBe(3);
  });

  it("creates a playable track from an empty new project", () => {
    const blank: ProgressionData = { notes: [], chords: [], totalBars: 4 };
    const created = addTrack(blank, "  Melody  ")!;
    expect(created.index).toBe(0);
    expect(created.progression.tracks).toEqual([{ index: 0, name: "Melody", program: 0, channel: 0 }]);
    expect(listTracks(created.progression)[0].noteCount).toBe(0);
  });

  it("renames imported and implicit tracks but rejects blank and unknown names", () => {
    const renamed = renameTrack(sample, 0, "  Rhythm  ");
    expect(renamed.tracks?.find(track => track.index === 0)?.name).toBe("Rhythm");
    expect(renamed.tracks?.find(track => track.index === 1)?.program).toBe(81);
    expect(renameTrack(sample, 1, "   ")).toBe(sample);
    expect(renameTrack(sample, 9, "Missing")).toBe(sample);
  });

  it("duplicates notes without moving sources or collapsing imported metadata", () => {
    const duplicated = duplicateTrack(sample, 1)!;
    expect(duplicated.index).toBe(2);
    expect(duplicated.progression.notes).toHaveLength(3);
    expect(duplicated.progression.notes[2]).toEqual({ ...sample.notes[1], trackIndex: 2 });
    expect(duplicated.progression.tracks?.find(track => track.index === 2)).toEqual({
      index: 2, name: "Lead copy", program: 81, channel: 1,
    });
    expect(sample.notes).toHaveLength(2);
  });

  it("removes header and only that track's notes while retaining historical IDs", () => {
    const created = addTrack(sample)!;
    const deleted = deleteTrack(created.progression, 2);
    expect(deleted.notes).toEqual(sample.notes);
    expect(deleted.tracks?.some(track => track.index === 2)).toBe(false);
    const again = addTrack(deleted)!;
    expect(again.index).toBe(3);
    expect(deleteTrack(sample, 42)).toBe(sample);
  });

  it("is one undoable history step and undo restores original track notes", () => {
    const initial = { past: [] as ProgressionData[], present: sample, future: [] as ProgressionData[] };
    const removed = historyReducer(initial, { type: "commit", updater: deleteTrack(sample, 1) });
    expect(removed.past).toHaveLength(1);
    expect(listTracks(removed.present).map(track => track.index)).toEqual([0]);
    const undone = historyReducer(removed, { type: "undo" });
    expect(undone.present).toBe(sample);
    expect(undone.present.notes).toHaveLength(2);
    expect(historyReducer(undone, { type: "redo" }).present.notes).toHaveLength(1);
  });

  it("never allocates percussion channel 10 and fails explicitly at the melodic limit", () => {
    const full: ProgressionData = {
      notes: [], chords: [], totalBars: 1,
      tracks: MELODIC_CHANNELS.map((channel, index) => ({ index, name: "Track " + index, channel })),
    };
    expect(addTrack(full)).toBeNull();
    expect(duplicateTrack(full, 0)).toBeNull();
    const nearFull = { ...full, tracks: full.tracks!.slice(0, -1) };
    const added = addTrack(nearFull)!;
    expect(added.progression.tracks?.at(-1)?.channel).toBe(15);
    expect(added.progression.tracks?.some(track => track.channel === 9)).toBe(false);
  });
  it("treats copies of generated tracks as independent user-owned parts", () => {
    const source: ProgressionData = {
      notes: [{midi: 48, name: "C3", timeStart: 0, duration: 1, velocity: 0.7, trackIndex: 1}],
      tracks: [
        {index: 0, name: "Melody", channel: 0},
        {index: 1, name: "Generated Bass", channel: 1, generatedRole: "bass", sourceTrackIndex: 0},
      ],
      chords: [], totalBars: 1,
    };
    const duplicated = duplicateTrack(source, 1);
    expect(duplicated).not.toBeNull();
    const meta = duplicated!.progression.tracks?.find(t => t.index === duplicated!.index);
    expect(meta?.generatedRole).toBeUndefined();
    expect(meta?.sourceTrackIndex).toBeUndefined();
    expect(duplicated!.progression.notes.find(n => n.trackIndex === duplicated!.index)?.midi).toBe(48);
  });

});
