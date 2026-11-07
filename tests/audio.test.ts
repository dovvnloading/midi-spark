import { describe, expect, it, vi } from "vitest";
import type { ProgressionData } from "../src/lib/theory";
import {
  initAudio,
  playProgression,
  setTrackMixer,
  stopAudio,
} from "../src/lib/audio";
import type { TrackMix } from "../src/lib/tracks";

const mockState = vi.hoisted(() => ({
  voices: [] as Array<{ id: number; triggers: unknown[][]; disposed: boolean }>,
  parts: [] as Array<{ callback: (time: number, note: unknown) => void; notes: unknown[] }>,
  levels: [] as number[],
  starts: 0,
}));

// Tiny deterministic Tone surface: exercises the real MIDI-to-synth dispatch
// without needing an AudioContext inside Vitest's Node test environment.
vi.mock("tone", () => {
  class MockNode {
    wet = { value: 0 };
    connect() { return this; }
    chain() { return this; }
    toDestination() { return this; }
    start() { return this; }
    dispose() { return this; }
  }
  class MockSynth extends MockNode {
    private record: { id: number; triggers: unknown[][]; disposed: boolean };
    constructor() {
      super();
      this.record = { id: mockState.voices.length, triggers: [], disposed: false };
      mockState.voices.push(this.record);
    }
    triggerAttackRelease(...args: unknown[]) { this.record.triggers.push(args); }
    releaseAll() {}
    dispose() { this.record.disposed = true; return this; }
  }
  class MockGain extends MockNode {
    gain = {
      rampTo: (value: number) => { mockState.levels.push(value); },
    };
  }
  class MockPart {
    private entry: { callback: (time: number, note: unknown) => void; notes: unknown[] };
    constructor(callback: (time: number, note: unknown) => void, notes: unknown[]) {
      this.entry = { callback, notes };
      mockState.parts.push(this.entry);
    }
    start() { return this; }
    dispose() {}
    clear() { this.entry.notes.length = 0; }
    add(time: number, note: unknown) { this.entry.notes.push({ ...(note as object), time }); }
  }
  const transport = {
    bpm: { value: 120 },
    stop() {},
    cancel() {},
    setLoopPoints() {},
    scheduleRepeat() {},
    schedule() {},
    start() {},
    loop: false,
    ticks: 0,
    PPQ: 192,
    seconds: 0,
  };
  return {
    PolySynth: MockSynth,
    MonoSynth: class {}, FMSynth: class {}, AMSynth: class {}, Synth: class {},
    Gain: MockGain,
    Chorus: MockNode, Reverb: MockNode, Tremolo: MockNode,
    Phaser: MockNode, PingPongDelay: MockNode, FeedbackDelay: MockNode,
    StereoWidener: MockNode,
    getTransport: () => transport,
    getDestination: () => new MockNode(),
    getDraw: () => ({ schedule() {} }),
    start: async () => { mockState.starts++; },
    Part: MockPart,
  };
});

const sequence: ProgressionData = {
  notes: [
    { name: "C4", midi: 60, timeStart: 0, duration: 1, velocity: 0.8, trackIndex: 0 },
    { name: "E4", midi: 64, timeStart: 1, duration: 1, velocity: 0.6, trackIndex: 1 },
  ],
  chords: [],
  totalBars: 1,
};

const mix: TrackMix = {
  0: { synthType: "classic", level: 1, muted: false, solo: false },
  1: { synthType: "epiano", level: 0.5, muted: false, solo: false },
};

describe("multitrack audio routing", () => {
  it("sends track notes to distinct voices and honors live mute/solo", async () => {
    await initAudio();
    setTrackMixer(mix);
    playProgression(sequence, 120, { onTick() {}, onEnded() {} }, 0, true);
    const part = mockState.parts[mockState.parts.length - 1];
    const a = part.notes[0] as ProgressionData["notes"][number];
    const b = part.notes[1] as ProgressionData["notes"][number];

    const initial = mockState.voices.length;
    part.callback(0, a);
    part.callback(0.5, b);
    expect(mockState.voices.length).toBe(initial);
    expect(mockState.voices[5].triggers).toHaveLength(1);
    expect(mockState.voices[6].triggers).toHaveLength(1);
    expect(mockState.voices[5].triggers[0][0]).toBe("C4");
    expect(mockState.voices[6].triggers[0][0]).toBe("E4");

    setTrackMixer({ ...mix, 1: { ...mix[1], muted: true } });
    expect(mockState.levels[mockState.levels.length - 1]).toBe(0);
    part.callback(1, b);
    expect(mockState.voices[6].triggers).toHaveLength(1);

    setTrackMixer({ ...mix, 1: { ...mix[1], solo: true } });
    part.callback(1.25, a);
    expect(mockState.voices[5].triggers).toHaveLength(1);
    part.callback(1.5, b);
    expect(mockState.voices[6].triggers).toHaveLength(2);
    stopAudio();
  });

  it("previews new preset engines lazily without altering MIDI playback selection", async () => {
    vi.resetModules();
    const freshAudio = await import("../src/lib/audio");
    const before = mockState.voices.length;
    await freshAudio.initAudio();
    expect(mockState.voices.length).toBe(before + 5);
    await freshAudio.auditionPreset("kalimba");
    const first = mockState.voices[before + 5];
    expect(first.triggers).toHaveLength(1);
    expect(first.triggers[0][0]).toEqual(["C4", "E4", "G4"]);
    await freshAudio.auditionPreset("warmPad");
    expect(first.disposed).toBe(true);
    expect(mockState.voices.length).toBe(before + 7);
    freshAudio.setSynthType("sub");
    freshAudio.playNote("C2");
    expect(mockState.voices[before + 7].triggers[0][0]).toBe("C2");
    await freshAudio.auditionPreset("sub");
    expect(mockState.voices[before + 7].triggers).toHaveLength(1);
    freshAudio.stopAudio();
  });

  it("applies a preset chosen before Web Audio starts", async () => {
    // A restored session selects its preset on mount, while AudioContext is
    // initialized only after a user gesture (Play / piano audition).
    vi.resetModules();
    const freshAudio = await import("../src/lib/audio");
    const beforeVoices = mockState.voices.length;
    freshAudio.setSynthType("dream");
    await freshAudio.initAudio();
    freshAudio.playNote("G4");
    expect(mockState.voices[beforeVoices + 4].triggers.map((t) => t[0])).toEqual(["G4"]);
    freshAudio.stopAudio();
  });

  it("deduplicates startup and auditions only the last rapid sound request", async () => {
    vi.resetModules();
    const audio = await import("../src/lib/audio");
    const starts = mockState.starts;
    const voices = mockState.voices.length;
    await Promise.all([
      audio.auditionPreset("organ"),
      audio.auditionPreset("glass"),
      audio.auditionPreset("fmBass"),
    ]);
    expect(mockState.starts - starts).toBe(1);
    const sounding = mockState.voices.slice(voices).filter(voice => voice.triggers.length > 0);
    expect(sounding).toHaveLength(1);
    expect(sounding[0].triggers[0][0]).toEqual(["C3", "G3"]);
    audio.stopAudio();
  });
});
