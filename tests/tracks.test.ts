import { describe, expect, it } from "vitest";
import type { ProgressionData } from "../src/lib/theory";
import {
  defaultTrackSettings,
  listTracks,
  reconcileTrackMix,
  trackEffectiveLevel,
  trackIndexOf,
  trackIsAudible,
} from "../src/lib/tracks";

const data: ProgressionData = {
  notes: [
    { midi: 60, name: "C4", timeStart: 0, duration: 1, velocity: 0.8 },
    { midi: 64, name: "E4", timeStart: 0, duration: 1, velocity: 0.7, trackIndex: 2 },
  ],
  tracks: [
    { index: 0, name: "Bass" },
    { index: 1, name: "Empty piano" },
    { index: 2, name: "Strings" },
  ],
  chords: [],
  totalBars: 1,
};

describe("Track Studio", () => {
  it("treats generated/untagged notes as track zero", () => {
    expect(trackIndexOf(data.notes[0])).toBe(0);
    expect(trackIndexOf(data.notes[1])).toBe(2);
  });

  it("enumerates imported tracks with names, even if empty", () => {
    expect(listTracks(data)).toEqual([
      { index: 0, name: "Bass", noteCount: 1 },
      { index: 1, name: "Empty piano", noteCount: 0 },
      { index: 2, name: "Strings", noteCount: 1 },
    ]);
  });

  it("initializes independent presets and preserves existing track choices", () => {
    const initial = reconcileTrackMix(data, {}, "dream");
    expect(initial[0].synthType).toBe("dream");
    expect(initial[1].synthType).toBe("epiano");
    const custom = { ...initial, 2: { ...initial[2], level: 0.4, muted: true } };
    expect(reconcileTrackMix(data, custom, "classic")).toBe(custom);
    const trimmed = reconcileTrackMix({ ...data, tracks: undefined, notes: [data.notes[0]] }, custom, "classic");
    expect(Object.keys(trimmed)).toEqual(["0"]);
    expect(trimmed[0]).toEqual(initial[0]);
  });

  it("supports mute, solo and real output gain without changing MIDI notes", () => {
    const a = defaultTrackSettings(0, "classic");
    const b = defaultTrackSettings(1, "classic");
    const mix = { 0: a, 1: { ...b, solo: true, level: 0.35 } };
    expect(trackIsAudible(0, mix)).toBe(false);
    expect(trackEffectiveLevel(0, mix)).toBe(0);
    expect(trackEffectiveLevel(1, mix)).toBe(0.35);
    expect(trackEffectiveLevel(1, { ...mix, 1: { ...mix[1], muted: true } })).toBe(0);
    expect(trackEffectiveLevel(1, { ...mix, 1: { ...mix[1], level: 2 } })).toBe(1);
  });
});
