import { describe, expect, it } from "vitest";
import { layoutVelocityStems } from "../src/lib/velocityLayout";
import type { NoteEvent } from "../src/lib/theory";

const note = (timeStart: number, trackIndex = 0, duration = 1): NoteEvent => ({
  midi: 60, name: "C4", velocity: 0.8, timeStart, duration, trackIndex,
});

describe("velocity lane hit areas", () => {
  it("fits concurrent stems before the next attack, including non-quantized imported attacks", () => {
    const notes = [note(2.03125), note(2), note(1.5), note(2), note(2)];
    const stems = layoutVelocityStems(notes, null, 32);
    expect(stems.get(2)).toEqual({ left: 48, width: 16 });
    expect(stems.get(0)).toEqual({ left: 65, width: 18 });
    const chord = [1, 3, 4].map(index => stems.get(index)!);
    expect(chord[0].left).toBe(64);
    chord.forEach((stem, i) => {
      expect(stem.width).toBeGreaterThan(0);
      expect(stem.left + stem.width).toBeCloseTo(chord[i + 1]?.left ?? 65);
    });
  });

  it("only allocates space to visible tracks and keeps a short note inside its duration", () => {
    const notes = [note(0, 0), note(0, 1, 0.125), note(0.0625, 0), note(1, 1)];
    const stems = layoutVelocityStems(notes, 1, 60);
    expect([...stems.keys()]).toEqual([1, 3]);
    expect(stems.get(1)).toEqual({ left: 0, width: 7.5 });
    expect(stems.get(3)).toEqual({ left: 60, width: 18 });
  });
});
