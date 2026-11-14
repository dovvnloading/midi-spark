import { describe, expect, it } from "vitest";
import { FREE_SNAP, MAX_PROJECT_BEATS } from "../src/lib/constants";
import { constrainNoteDelta, draggedNotes, drawNote, lassoSelection, placementTick, replaceDraggedNotes,
  sliceNotes, type GridGesture, type NoteDrag } from "../src/lib/pianoGestures";
import type { NoteEvent, ProgressionData } from "../src/lib/theory";

const zoom = 100;
const height = 20;
const row = (midi: number) => (127 - midi + 0.5) * height;
const stroke = (x: number, endX: number, y = row(60), endY = y): GridGesture =>
  ({ origin: { x, y }, point: { x: endX, y: endY }, threshold: 4 });
const note = (midi: number, timeStart: number, duration: number, trackIndex = 0): NoteEvent =>
  ({ name: "C4", midi, timeStart, duration, velocity: 0.8, trackIndex });
const score: ProgressionData = { notes: [note(60, 0.25, 0.125), note(67, 1.125, 1.5)], chords: [], totalBars: 1 };
const drag = (kind: NoteDrag["kind"], dx: number, dy = 0): NoteDrag => ({
  ...stroke(20, 20 + dx, 0, dy), kind, indices: [0, 1], notes: score.notes, clicked: 0, shift: false,
});

describe("piano grid placement and group gestures", () => {
  it("uses the containing cell through its last pixel and keeps snap-off coordinates continuous", () => {
    expect(placementTick(149.9, zoom, 0.5)).toBe(1);
    expect(placementTick(150, zoom, 0.5)).toBe(1.5);
    expect(placementTick(-4, zoom, 0.5)).toBe(0);
    expect(placementTick(149.9, zoom, 0)).toBe(1.499);
  });

  it("tap jitter keeps the chosen short length, while a held draw can extend in either direction", () => {
    const draw = (x: number, endX: number) => drawNote(stroke(x, endX), 61, zoom, 0.5, 0.125, 3);
    expect(draw(150, 153)).toMatchObject({ timeStart: 1.5, duration: 0.125, trackIndex: 3, midi: 61 });
    expect(draw(152, 301)).toMatchObject({ timeStart: 1.5, duration: 1.5 });
    expect(draw(303, 102)).toMatchObject({ timeStart: 1, duration: 2 });
    expect(draw(303, -32)).toMatchObject({ timeStart: 0, duration: 3 });
  });

  it("preserves imported off-grid timings, chord intervals and note lengths against shared boundaries", () => {
    const moved = draggedNotes(drag("move", -300, -2000), zoom, height, 0.5);
    expect([...moved.values()].map(n => [n.timeStart, n.midi, n.duration]))
      .toEqual([[0, 120, 0.125], [0.875, 127, 1.5]]);
    const resized = draggedNotes(drag("resize", -50), zoom, height, 0.5);
    expect(resized.size).toBe(0); // First note is already shorter than the selected grid.
    const single = draggedNotes({ ...drag("resize", -200), indices: [1], notes: [score.notes[1]] }, zoom, height, 0.5);
    expect(single.get(1)?.duration).toBe(0.5);
    const freeResize = draggedNotes(drag("resize", -50), zoom, height, 0);
    expect(freeResize.get(0)?.duration).toBe(FREE_SNAP);
    expect(freeResize.get(1)?.duration).toBe(1.5 - 0.125 + FREE_SNAP);
    const beforeEnd = [note(70, MAX_PROJECT_BEATS - 2, 1)];
    expect(constrainNoteDelta(beforeEnd, "duration", 5)).toBe(1);
    expect(constrainNoteDelta(beforeEnd, "timeStart", 5)).toBe(1);
  });

  it("retains sub-minimum imports and preserves the history object on a click or a fully clamped edit", () => {
    const tiny = [note(60, 0, 0.004)];
    expect(constrainNoteDelta(tiny, "duration", -1)).toBe(0);
    for (const gesture of [drag("resize", 2), { ...drag("move", -60), notes: tiny, indices: [0] }]) {
      const changes = draggedNotes(gesture, zoom, height, 0.5);
      expect(replaceDraggedNotes(score, changes)).toBe(score);
    }
    const free = draggedNotes(drag("move", 11.5), zoom, height, 0);
    expect(free.get(0)?.timeStart).toBeCloseTo(0.365);
  });

  it("a reverse lasso extends from the starting selection only within the visible track", () => {
    const notes = [...score.notes, note(60, 0.25, 0.125, 1)];
    const box = stroke(45, 20, row(60) + 3, row(60) - 3);
    expect([...lassoSelection(notes, box, new Set([1]), zoom, height, 0)]).toEqual([1, 0]);
    expect([...lassoSelection(notes, stroke(0, 1), new Set(), zoom, height, null)]).toEqual([]);
  });

  it("splits diagonals symmetrically, conserves duration, and makes boundary or focused-track misses no-ops", () => {
    const notes = [note(60, 0, 4), note(61, 0, 4), note(60, 0, 4, 1)];
    const forward = stroke(100, 300, row(60), row(61));
    const backward = { ...forward, origin: forward.point, point: forward.origin };
    const split = sliceNotes(notes, forward, zoom, 0.5, 0, height);
    expect(sliceNotes(notes, backward, zoom, 0.5, 0, height)).toEqual(split);
    expect(split.map(n => [n.midi, n.timeStart, n.duration])).toEqual([
      [60, 0, 1.5], [60, 1.5, 2.5], [61, 0, 2.5], [61, 2.5, 1.5], [60, 0, 4],
    ]);
    expect(sliceNotes(notes, stroke(0, 0), zoom, 0.5, 0, height)).toBe(notes);
    expect(sliceNotes(notes, stroke(399.9, 399.9), zoom, 0, 0, height)).toBe(notes);
    expect(sliceNotes(notes, stroke(120, 120), zoom, 0.5, 3, height)).toBe(notes);
  });
});
