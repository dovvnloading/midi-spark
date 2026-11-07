import { describe, expect, it } from "vitest";
import type { ProgressionData } from "../src/lib/theory";
import {
  normalizeLoopRange,
  quartersToTicks,
  quarterTime,
  sequenceEndQuarters,
  ticksToQuarters,
} from "../src/lib/timeline";

const data: ProgressionData = {
  totalBars: 4,
  chords: [],
  notes: [
    { name: "C4", midi: 60, timeStart: 0, duration: 1, velocity: 0.8 },
    { name: "E4", midi: 64, timeStart: 16, duration: 2, velocity: 0.8 },
  ],
};

describe("musical-time timeline helpers", () => {
  it("includes tail notes beyond the declared bar count", () => {
    expect(sequenceEndQuarters(data)).toBe(18);
    expect(sequenceEndQuarters({ ...data, notes: [] })).toBe(16);
    expect(sequenceEndQuarters({ totalBars: 0, notes: [], chords: [] })).toBe(1);
  });

  it("converts musical quarters to transport ticks without baking in the BPM", () => {
    expect(quartersToTicks(2.5, 192)).toBe(480);
    expect(quarterTime(2.5, 192)).toBe("480i");
    expect(ticksToQuarters(480, 192)).toBe(2.5);
    expect(quartersToTicks(-1, 192)).toBe(0);
    expect(quartersToTicks(Number.NaN, 192)).toBe(0);
  });

  it("defaults to the whole pattern and grows as the sequence grows", () => {
    expect(normalizeLoopRange(null, 16)).toEqual({ start: 0, end: 16 });
    expect(normalizeLoopRange(null, 18)).toEqual({ start: 0, end: 18 });
  });

  it("retains a custom range but clips it to a shortened sequence", () => {
    expect(normalizeLoopRange({ start: 4, end: 12 }, 16)).toEqual({ start: 4, end: 12 });
    expect(normalizeLoopRange({ start: 14, end: 20 }, 16)).toEqual({ start: 14, end: 16 });
    expect(normalizeLoopRange({ start: 14, end: 20 }, 8)).toEqual({ start: 7, end: 8 });
    expect(normalizeLoopRange({ start: -5, end: 0.1 }, 4)).toEqual({ start: 0, end: 1 });
  });
});
