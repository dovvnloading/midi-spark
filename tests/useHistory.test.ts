import { describe, it, expect } from "vitest";
import { historyReducer } from "../src/hooks/useHistory";

type S = { past: number[]; present: number; future: number[] };
const init: S = { past: [], present: 0, future: [] };

describe("historyReducer", () => {
  it("commit pushes the previous state and clears the redo stack", () => {
    let s = historyReducer(init, { type: "commit", updater: 1 });
    s = historyReducer(s, { type: "commit", updater: 2 });
    expect(s).toEqual({ past: [0, 1], present: 2, future: [] });
  });

  it("undo/redo walk the stacks", () => {
    let s = historyReducer(init, { type: "commit", updater: 1 });
    s = historyReducer(s, { type: "commit", updater: 2 });
    s = historyReducer(s, { type: "undo" });
    expect(s.present).toBe(1);
    s = historyReducer(s, { type: "undo" });
    expect(s.present).toBe(0);
    expect(historyReducer(s, { type: "undo" })).toBe(s); // no-op at bottom
    s = historyReducer(s, { type: "redo" });
    s = historyReducer(s, { type: "redo" });
    expect(s.present).toBe(2);
    expect(historyReducer(s, { type: "redo" })).toBe(s); // no-op at top
  });

  it("a commit after undo discards the redo branch", () => {
    let s = historyReducer(init, { type: "commit", updater: 1 });
    s = historyReducer(s, { type: "commit", updater: 2 });
    s = historyReducer(s, { type: "undo" });
    s = historyReducer(s, { type: "commit", updater: 99 });
    expect(s).toEqual({ past: [0, 1], present: 99, future: [] });
  });

  it("supports functional updaters", () => {
    const s = historyReducer(init, {
      type: "commit",
      updater: (prev: number) => prev + 41,
    });
    expect(s.present).toBe(41);
  });

  it("replace changes the value without an undo step", () => {
    const s = historyReducer(init, { type: "replace", updater: 5 });
    expect(s).toEqual({ past: [], present: 5, future: [] });
  });

  it("is pure: double invocation (StrictMode) cannot duplicate history", () => {
    const action = { type: "commit" as const, updater: (p: number) => p + 1 };
    const once = historyReducer(init, action);
    const twice = historyReducer(init, action); // same input state, re-invoked
    expect(twice).toEqual(once);
    expect(once.past).toEqual([0]); // exactly one history entry
  });

  it("caps history at 50 entries", () => {
    let s = init;
    for (let i = 1; i <= 60; i++) {
      s = historyReducer(s, { type: "commit", updater: i });
    }
    expect(s.past.length).toBe(50);
    expect(s.present).toBe(60);
    expect(s.past[0]).toBe(10); // oldest entries dropped
  });
});
