import { describe, it, expect } from "vitest";
import { editScope } from "../src/lib/editScope";
import type { NoteEvent } from "../src/lib/theory";
const notes: NoteEvent[] = [
  { midi: 60, name: "C4", timeStart: 0, duration: 1, velocity: .8 },
  { midi: 64, name: "E4", timeStart: 0, duration: 1, velocity: .8, trackIndex: 0 },
  { midi: 36, name: "C2", timeStart: 0, duration: 1, velocity: .7, trackIndex: 1 },
];
describe("visible editing scope", () => {
  it("defaults to the full pattern in the combined view", () => expect([...editScope(notes, new Set(), null)]).toEqual([0, 1, 2]));
  it("restricts transformations to the focused track with no selection", () => expect([...editScope(notes, new Set(), 1)]).toEqual([2]));
  it("treats untagged generated notes as track zero", () => expect([...editScope(notes, new Set(), 0)]).toEqual([0, 1]));
  it("intersects selection with the visible track, ignoring stale indices", () => expect([...editScope(notes, new Set([0, 2, 99]), 1)]).toEqual([2]));
  it("returns an empty set for an empty focused track instead of all notes", () => expect(editScope(notes, new Set(), 2).size).toBe(0));
  it("does not mutate note data or selection", () => {
    const snapshot = JSON.stringify(notes), selection = new Set([0, 2]);
    editScope(notes, selection, 1);
    expect([...selection]).toEqual([0, 2]); expect(JSON.stringify(notes)).toBe(snapshot);
  });
});
