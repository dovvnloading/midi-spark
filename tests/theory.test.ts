import { describe, it, expect } from "vitest";
import { Chord } from "@tonaljs/tonal";
import {
  generateSequence,
  applyVariationToProgression,
  applySwing,
  detectKeyFromProgression,
  ProgressionData,
  NoteEvent,
} from "../src/lib/theory";

const MODES = ["major", "minor"] as const;
const DISSONANCE_LEVELS = [0, 30, 60, 90];
const COMPLEXITY_LEVELS = [10, 40, 90];

describe("generateSequence", () => {
  it("produces in-range, positive-duration notes for every parameter tier", () => {
    for (const mode of MODES) {
      for (const dissonance of DISSONANCE_LEVELS) {
        for (const complexity of COMPLEXITY_LEVELS) {
          for (let run = 0; run < 5; run++) {
            const seq = generateSequence("C", mode, 4, dissonance, complexity);
            expect(seq.notes.length).toBeGreaterThan(0);
            expect(seq.totalBars).toBe(4);
            expect(seq.chords.length).toBe(4);
            for (const n of seq.notes) {
              expect(n.midi).toBeGreaterThanOrEqual(0);
              expect(n.midi).toBeLessThanOrEqual(127);
              expect(n.duration).toBeGreaterThan(0);
              expect(n.timeStart).toBeGreaterThanOrEqual(0);
              expect(n.velocity).toBeGreaterThan(0);
              expect(n.velocity).toBeLessThanOrEqual(1);
              expect(Number.isFinite(n.midi)).toBe(true);
              expect(n.name).toBeTruthy();
            }
          }
        }
      }
    }
  });

  it("emits only chord symbols that tonal can voice (no silent fallbacks)", () => {
    for (const mode of MODES) {
      for (const dissonance of DISSONANCE_LEVELS) {
        for (let run = 0; run < 10; run++) {
          const seq = generateSequence("C", mode, 4, dissonance, 30);
          for (const chord of seq.chords) {
            const parsed = Chord.get(chord.name);
            expect(
              parsed.empty,
              `chord "${chord.name}" (mode=${mode}, dissonance=${dissonance}) did not parse`,
            ).toBe(false);
            expect(parsed.notes.length).toBeGreaterThanOrEqual(3);
          }
        }
      }
    }
  });

  it("keeps minor degrees minor at low dissonance (regression: tonal ignores roman case)", () => {
    const seen = new Set<string>();
    for (let run = 0; run < 60; run++) {
      const seq = generateSequence("C", "major", 4, 0, 10);
      seq.chords.forEach((c) => seen.add(c.name));
    }
    // vi/ii/iii in C major must never surface as plain A/D/E major triads.
    expect(seen.has("A")).toBe(false);
    expect(seen.has("D")).toBe(false);
    // Diatonic minor spellings should appear across enough runs.
    const minors = [...seen].filter((n) => /m$/.test(n));
    expect(minors.length).toBeGreaterThan(0);
  });

  it("keeps minor-mode flat degrees flat (regression: III resolved to E major in C minor)", () => {
    const seen = new Set<string>();
    for (let run = 0; run < 60; run++) {
      const seq = generateSequence("C", "minor", 4, 30, 10);
      seq.chords.forEach((c) => seen.add(c.name));
    }
    expect(seen.has("Emaj7")).toBe(false);
    expect(seen.has("Amaj7")).toBe(false);
    expect(seen.has("E")).toBe(false);
  });
});

describe("applyVariationToProgression", () => {
  it("returns in-range notes and preserves overall shape", () => {
    for (let run = 0; run < 10; run++) {
      const base = generateSequence("C", "major", 4, 40, 30);
      const varied = applyVariationToProgression(base, 60, 60, "C", "major");
      expect(varied.notes.length).toBeGreaterThan(0);
      expect(varied.totalBars).toBe(base.totalBars);
      for (const n of varied.notes) {
        expect(n.midi).toBeGreaterThanOrEqual(0);
        expect(n.midi).toBeLessThanOrEqual(127);
        expect(n.duration).toBeGreaterThan(0);
        expect(n.timeStart).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("applySwing", () => {
  const makeProgression = (times: number[]): ProgressionData => ({
    notes: times.map((t, i) => ({
      midi: 60 + i,
      name: "C4",
      timeStart: t,
      duration: 0.4,
      velocity: 0.8,
    })),
    chords: [],
    totalBars: 2,
  });

  it("is a no-op at 0% swing (identical output)", () => {
    const prog = makeProgression([0, 0.5, 1, 1.5, 2, 0.25]);
    const result = applySwing(prog, 0);
    expect(result).toBe(prog);
    result.notes.forEach((n, i) => {
      expect(n.timeStart).toBe(prog.notes[i].timeStart);
    });
  });

  it("never moves downbeat notes, at any swing amount", () => {
    const prog = makeProgression([0, 1, 2, 3]);
    for (const amount of [10, 50, 90, 100]) {
      const result = applySwing(prog, amount);
      result.notes.forEach((n: NoteEvent, i: number) => {
        expect(n.timeStart).toBe(prog.notes[i].timeStart);
      });
    }
  });

  it("delays only odd-8th ('and of the beat') notes, monotonically with swing, without crossing into the next beat", () => {
    // index 0/2: downbeats, 1/3: off-beat 8ths ("and"), 4: off-8th-grid 16th
    const prog = makeProgression([0, 0.5, 1, 1.5, 0.25]);
    let prevDelayAt0_5 = 0;
    let prevDelayAt1_5 = 0;
    for (const amount of [10, 30, 60, 100]) {
      const result = applySwing(prog, amount);

      expect(result.notes[0].timeStart).toBe(0);
      expect(result.notes[2].timeStart).toBe(1);
      expect(result.notes[4].timeStart).toBe(0.25);

      const delayAt0_5 = result.notes[1].timeStart - 0.5;
      const delayAt1_5 = result.notes[3].timeStart - 1.5;
      expect(delayAt0_5).toBeGreaterThan(0);
      expect(delayAt1_5).toBeGreaterThan(0);
      expect(delayAt0_5).toBeGreaterThan(prevDelayAt0_5);
      expect(delayAt1_5).toBeGreaterThan(prevDelayAt1_5);
      // Never crosses into the following beat's territory.
      expect(result.notes[1].timeStart).toBeLessThan(1);
      expect(result.notes[3].timeStart).toBeLessThan(2);

      prevDelayAt0_5 = delayAt0_5;
      prevDelayAt1_5 = delayAt1_5;
    }
  });
});

describe("detectKeyFromProgression", () => {
  const makeProgression = (
    notes: { midi: number; timeStart: number; duration: number }[],
  ): ProgressionData => ({
    notes: notes.map((n) => ({
      ...n,
      name: noteName(n.midi),
      velocity: 0.8,
    })),
    chords: [],
    totalBars: 4,
  });

  function noteName(midi: number): string {
    const names = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
    return `${names[midi % 12]}${Math.floor(midi / 12) - 1}`;
  }

  it("detects C major from a C major scale with C bass", () => {
    const scale = [48, 60, 62, 64, 65, 67, 69, 71, 72].map((midi, i) => ({
      midi,
      timeStart: i * 0.5,
      duration: 0.5,
    }));
    const detected = detectKeyFromProgression(makeProgression(scale));
    expect(detected.root).toBe("C");
    expect(detected.mode).toBe("major");
  });

  it("detects A minor from an A natural-minor scale with A bass", () => {
    const scale = [45, 57, 59, 60, 62, 64, 65, 67, 69].map((midi, i) => ({
      midi,
      timeStart: i * 0.5,
      duration: 0.5,
    }));
    const detected = detectKeyFromProgression(makeProgression(scale));
    expect(detected.root).toBe("A");
    expect(detected.mode).toBe("minor");
  });
});
