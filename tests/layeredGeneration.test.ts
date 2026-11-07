import { describe, expect, it, vi } from "vitest";
import { applyVariationToProgression, generateSequence } from "../src/lib/theory";

function generated(seed: number, complexity: number, split: boolean) {
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const spy = vi.spyOn(Math, "random").mockImplementation(random);
  try {
    return generateSequence("C", "minor", 4, 48, complexity, split);
  } finally {
    spy.mockRestore();
  }
}

describe("layered generation", () => {
  for (const complexity of [0, 30, 55, 75, 95]) {
    it(`preserves musical note data for single versus layered complexity ${complexity}`, () => {
      const single = generated(1337, complexity, false);
      const layers = generated(1337, complexity, true);
      expect(layers.notes.length).toBe(single.notes.length);
      expect(layers.chords).toEqual(single.chords);
      expect(layers.totalBars).toBe(single.totalBars);
      expect(layers.notes.map(({ trackIndex: _trackIndex, ...rest }) => rest)).toEqual(single.notes);
      expect(new Set(layers.notes.map(note => note.trackIndex))).toEqual(new Set([0, 1]));
      expect(layers.tracks).toEqual([
        { index: 0, name: "Bass", program: 33, channel: 0 },
        { index: 1, name: "Harmony", program: 0, channel: 1 },
      ]);
      expect(single.tracks).toBeUndefined();
      expect(single.notes.every(note => note.trackIndex === undefined)).toBe(true);
    });
  }

  it("assigns bass vs harmony by generator voice role, not arbitrary pitch threshold", () => {
    const split = generated(2026, 0, true);
    for (let bar = 0; bar < split.totalBars; bar++) {
      // Humanization may place a nominal downbeat fractionally before its bar.
      const bass = split.notes.filter(note => note.trackIndex === 0 && Math.abs(note.timeStart - bar * 4) < 0.05);
      expect(bass).toHaveLength(1);
      expect(split.notes.some(note => note.trackIndex === 1 && Math.abs(note.timeStart - bar * 4) < 4.05)).toBe(true);
    }
  });

  it("variation preserves each track assignment and header structure", () => {
    const split = generated(42, 75, true);
    const spy = vi.spyOn(Math, "random").mockReturnValue(0.41);
    try {
      const variation = applyVariationToProgression(split, 40, 50, "C", "minor");
      expect(variation.tracks).toEqual(split.tracks);
      expect(variation.nextTrackIndex).toBe(2);
      expect(variation.notes.every(note => note.trackIndex === 0 || note.trackIndex === 1)).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });
});
