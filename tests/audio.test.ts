import { describe, expect, it, vi } from "vitest";
import type { ProgressionData } from "../src/lib/theory";
import {
  initAudio,
  playProgression,
  pauseAudio,
  resumeAudio,
  seekAudio,
  setTrackMixer,
  stopAudio,
  updateProgressionLive,
} from "../src/lib/audio";
import type { TrackMix } from "../src/lib/tracks";

const mockState = vi.hoisted(() => ({
  voices: [] as Array<{ id: number; triggers: unknown[][]; disposed: boolean; engine: string; options: unknown; polyphony: number }>,
  processors: [] as Array<{kind: string; disposed: boolean; options: unknown[]}>,
  parts: [] as Array<{ callback: (time: number, note: unknown) => void; notes: unknown[] }>,
  levels: [] as number[],
  starts: 0,
  startedTransport: 0,
  pausedTransport: 0,
  stopTransport: 0,
  nextId: 0,
  schedules: [] as Array<{ id: number; time: string; callback: () => void }>,
  cleared: [] as number[],
  loopPoints: [] as string[],
  transport: null as null | { ticks: number; loop: boolean; bpm: { value: number }; state: string },
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
  function effect(kind: string) {
    return class extends MockNode {
      private record: {kind: string; disposed: boolean; options: unknown[]};
      constructor(...options: unknown[]) {
        super();
        this.record = {kind, disposed: false, options};
        mockState.processors.push(this.record);
      }
      dispose() { this.record.disposed = true; return this; }
    };
  }
  class MockSynth extends MockNode {
    private record: {
      id: number; triggers: unknown[][]; disposed: boolean;
      engine: string; options: unknown; polyphony: number;
    };
    private _polyphony = 32;
    constructor(engine?: { name?: string }, options?: unknown) {
      super();
      this.record = {
        id: mockState.voices.length, triggers: [], disposed: false,
        engine: engine?.name ?? "Unknown", options, polyphony: 32,
      };
      mockState.voices.push(this.record);
    }
    set maxPolyphony(value: number) { this._polyphony = value; this.record.polyphony = value; }
    get maxPolyphony() { return this._polyphony; }
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
    state: "stopped",
    stop() { mockState.stopTransport++; this.state = "stopped"; this.ticks = 0; },
    pause() { mockState.pausedTransport++; this.state = "paused"; },
    cancel() { mockState.schedules = []; },
    clear(id: number) {
      mockState.cleared.push(id);
      mockState.schedules = mockState.schedules.filter(item => item.id !== id);
    },
    setLoopPoints(start: string, end: string) { mockState.loopPoints = [start, end]; },
    scheduleRepeat() { return ++mockState.nextId; },
    schedule(callback: () => void, time: string) {
      const id = ++mockState.nextId;
      mockState.schedules.push({ id, time, callback });
      return id;
    },
    start() { mockState.startedTransport++; this.state = "started"; },
    loop: false,
    ticks: 0,
    PPQ: 192,
    seconds: 0,
  };
  mockState.transport = transport;
  return {
    PolySynth: MockSynth,
    MonoSynth: class MonoSynth {}, FMSynth: class FMSynth {},
    AMSynth: class AMSynth {}, Synth: class Synth {},
    DuoSynth: class DuoSynth {}, MembraneSynth: class MembraneSynth {},
    Gain: MockGain,
    Chorus: effect("Chorus"), Reverb: effect("Reverb"),
    Tremolo: effect("Tremolo"), Phaser: effect("Phaser"),
    PingPongDelay: effect("PingPongDelay"), FeedbackDelay: effect("FeedbackDelay"),
    StereoWidener: effect("StereoWidener"),
    Filter: effect("Filter"), AutoFilter: effect("AutoFilter"),
    AutoPanner: effect("AutoPanner"), Vibrato: effect("Vibrato"),
    Limiter: effect("Limiter"),
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
    expect(first.triggers).toHaveLength(2);
    expect(first.triggers[0][0]).toEqual(["C4", "E4", "G4"]);
    expect(Number(first.triggers[0][3])).toBeLessThan(Number(first.triggers[1][3]));
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
    expect(sounding[0].triggers[0][0]).toEqual(["C2", "G2"]);
    audio.stopAudio();
  });

  it("cancels a pending audition and disposes active preview voices on Library dismissal", async () => {
    vi.resetModules();
    const audio = await import("../src/lib/audio");
    const before = mockState.voices.length;
    const pending = audio.auditionPreset("organ");
    audio.cancelPresetAudition();
    await pending;
    expect(mockState.voices.slice(before).filter(voice => voice.triggers.length > 0)).toHaveLength(0);

    await audio.auditionPreset("glass");
    const active = mockState.voices[mockState.voices.length - 1];
    expect(active.triggers).toHaveLength(2);
    audio.cancelPresetAudition();
    expect(active.disposed).toBe(true);

    await audio.auditionPreset("sub");
    const fresh = mockState.voices[mockState.voices.length - 1];
    expect(fresh.triggers).toHaveLength(2);
    expect(fresh.disposed).toBe(false);
    audio.cancelPresetAudition();
    expect(fresh.disposed).toBe(true);
  });

  it("constructs each new voice family with distinct sound-defining parameters", async () => {
    vi.resetModules();
    const fresh = await import("../src/lib/audio");
    const { SOUND_PRESETS } = await import("../src/lib/presets");
    const expected = {
      epiano: "FMSynth", classic: "MonoSynth", pad: "DuoSynth",
      warmPad: "AMSynth", unisonStack: "Synth", punchKick: "MembraneSynth",
    };
    for (const [id, engine] of Object.entries(expected)) {
      const before = mockState.voices.length;
      const voice = fresh.createTrackSynth(id as (typeof SOUND_PRESETS)[number]["id"]);
      expect(mockState.voices[before].engine).toBe(engine);
      expect(mockState.voices[before].options).toBeDefined();
      expect(mockState.voices[before].polyphony).toBeLessThanOrEqual(16);
      voice.dispose();
    }
    // Every catalog entry must be constructible by one of our six engines.
    const old = mockState.voices.length;
    for (const preset of SOUND_PRESETS) fresh.createTrackSynth(preset.id);
    const created = mockState.voices.slice(old);
    expect(created).toHaveLength(49);
    expect(new Set(created.map(v => v.engine)).size).toBe(6);
  });

  it("provides measurable soft-to-hard expression curves without editing MIDI", async () => {
    vi.resetModules();
    const audio = await import("../src/lib/audio");
    const { SOUND_PRESETS } = await import("../src/lib/presets");
    for (const preset of SOUND_PRESETS) {
      const low = audio.presetVelocity(preset.id, .2);
      const mid = audio.presetVelocity(preset.id, .6);
      const loud = audio.presetVelocity(preset.id, .95);
      expect(low).toBeGreaterThan(0);
      expect(low).toBeLessThan(mid);
      expect(mid).toBeLessThan(loud);
      expect(loud).toBeLessThanOrEqual(1);
    }
    expect(audio.presetVelocity("tines", .3)).toBeLessThan(
      audio.presetVelocity("velvet", .3));
    expect(audio.presetVelocity("classic", .8)).toBeCloseTo(.8 ** 1.08, 6);
    expect(audio.presetVelocity("epiano", NaN)).toBeGreaterThan(0);
  });

  it("disposes preset-specific filters and LFO processors on audition and mixer changes", async () => {
    vi.resetModules();
    const audio = await import("../src/lib/audio");
    await audio.initAudio();
    let from = mockState.processors.length;
    await audio.auditionPreset("orbit");
    const orbitNodes = mockState.processors.slice(from)
      .filter(p => ["Filter", "Phaser", "AutoPanner"].includes(p.kind));
    expect(orbitNodes.map(p => p.kind)).toEqual(["Filter", "Phaser", "AutoPanner"]);
    expect(orbitNodes.every(p => !p.disposed)).toBe(true);
    from = mockState.processors.length;
    await audio.auditionPreset("hollowClav");
    expect(orbitNodes.every(p => p.disposed)).toBe(true);
    expect(mockState.processors.slice(from).some(p => p.kind === "Filter")).toBe(true);

    audio.setTrackMixer({0: {synthType: "tidalPad", level: .65, muted:false, solo:false}});
    const nodes = mockState.processors.filter(p => !p.disposed).length;
    expect(nodes).toBeGreaterThan(orbitNodes.length);
    audio.setTrackMixer({0: {synthType: "punchKick", level: .65, muted:false, solo:false}});
    expect(mockState.processors.filter(p => !p.disposed).length).toBeLessThan(nodes);
    audio.setTrackMixer({});
    audio.stopAudio();
  });

  it("routes dry bass directly and preserves dynamic velocity on scheduled note events", async () => {
    vi.resetModules();
    const audio = await import("../src/lib/audio");
    await audio.initAudio();
    audio.setTrackMixer({0:{synthType:"punchKick",level:1,muted:false,solo:false}});
    const seq = {
      notes: [
        {name:"C2",midi:36,timeStart:0,duration:.4,velocity:.2,trackIndex:0},
        {name:"C2",midi:36,timeStart:1,duration:.4,velocity:.95,trackIndex:0},
      ], chords:[],totalBars:1,
    };
    audio.playProgression(seq,120,{onTick(){},onEnded(){}},0,false);
    const notes = mockState.parts.at(-1)!.notes as typeof seq.notes;
    const voice = mockState.voices.at(-1)!;
    const first = voice.triggers.length;
    mockState.parts.at(-1)!.callback(0,notes[0]);
    mockState.parts.at(-1)!.callback(.5,notes[1]);
    expect(voice.triggers.length).toBe(first+2);
    expect(Number(voice.triggers.at(-2)?.[3])).toBeLessThan(Number(voice.triggers.at(-1)?.[3]));
    audio.stopAudio();
  });

  it("schedules note starts and lengths in tempo-relative ticks", async () => {
    await initAudio();
    setTrackMixer(mix);
    playProgression(sequence, 120, { onTick() {}, onEnded() {} }, 0, false);

    const part = mockState.parts.at(-1)!;
    const notes = part.notes as Array<ProgressionData["notes"][number] & { time: string }>;
    expect(notes.map(note => note.time)).toEqual(["0i", "192i"]);
    const before = mockState.voices.map(voice => voice.triggers.length);
    part.callback(0, notes[0]);
    const firstVoice = mockState.voices.find((voice, index) => voice.triggers.length > before[index]);
    expect(firstVoice?.triggers.at(-1)?.[1]).toBe("173i");

    updateProgressionLive(sequence, 90, false);
    expect(mockState.transport?.bpm.value).toBe(90);
    expect((part.notes as Array<{ time: string }>).map(note => note.time)).toEqual(["0i", "192i"]);
    part.callback(0.5, notes[0]);
    expect(firstVoice?.triggers.at(-1)?.[1]).toBe("173i");
    stopAudio();
  });

  it("replaces the ending event when live edits or loop mode changes", async () => {
    await initAudio();
    setTrackMixer(mix);
    playProgression(sequence, 120, { onTick() {}, onEnded() {} }, 0, false);
    expect(mockState.schedules.map(event => event.time)).toEqual(["768i"]);
    const initialEvent = mockState.schedules[0].id;

    updateProgressionLive({ ...sequence, totalBars: 2 }, 90, false);
    expect(mockState.cleared).toContain(initialEvent);
    expect(mockState.schedules.map(event => event.time)).toEqual(["1536i"]);

    updateProgressionLive({ ...sequence, totalBars: 2 }, 90, true);
    expect(mockState.schedules).toHaveLength(0);
    expect(mockState.transport?.loop).toBe(true);
    expect(mockState.loopPoints).toEqual(["0i", "1536i"]);

    updateProgressionLive(sequence, 90, false);
    expect(mockState.schedules.map(event => event.time)).toEqual(["768i"]);
    stopAudio();
    expect(mockState.schedules).toHaveLength(0);
  });

  it("supports a custom musical loop and seeks without BPM-based time conversion", async () => {
    await initAudio();
    setTrackMixer(mix);
    playProgression(sequence, 120, { onTick() {}, onEnded() {} }, 0, true, { start: 1, end: 3 });
    expect(mockState.loopPoints).toEqual(["192i", "576i"]);
    expect(mockState.transport?.ticks).toBe(192); // start outside loop clamps to in

    seekAudio(2.5);
    expect(mockState.transport?.ticks).toBe(480);
    updateProgressionLive(sequence, 80, true, { start: 1, end: 3 });
    expect(mockState.transport?.ticks).toBe(480);
    seekAudio(3.5);
    expect(mockState.transport?.ticks).toBe(192);
    stopAudio();
  });

  it("releases long notes before a custom loop-out and ignores off-range events", async () => {
    await initAudio();
    setTrackMixer(mix);
    const loopSequence: ProgressionData = {
      notes: [
        { name: "C4", midi: 60, timeStart: 2.75, duration: 2, velocity: 0.8, trackIndex: 0 },
        { name: "E4", midi: 64, timeStart: 4, duration: 1, velocity: 0.6, trackIndex: 1 },
      ],
      chords: [],
      totalBars: 2,
    };
    playProgression(loopSequence, 120, { onTick() {}, onEnded() {} }, 1, true, { start: 1, end: 3 });
    const part = mockState.parts.at(-1)!;
    const inside = part.notes[0] as ProgressionData["notes"][number];
    const outside = part.notes[1] as ProgressionData["notes"][number];
    const before = mockState.voices.map(voice => voice.triggers.length);
    part.callback(0, inside);
    const sounding = mockState.voices.find((voice, index) => voice.triggers.length > before[index]);
    expect(sounding?.triggers.at(-1)?.[1]).toBe("43i"); // 0.25 beats × 90% × 192 PPQ
    const triggered = mockState.voices.reduce((sum, voice) => sum + voice.triggers.length, 0);
    part.callback(0, outside);
    expect(mockState.voices.reduce((sum, voice) => sum + voice.triggers.length, 0)).toBe(triggered);
    stopAudio();
  });

  it("pauses and resumes at the same cursor; ignores stale end callbacks", async () => {
    await initAudio();
    setTrackMixer(mix);
    let ended = 0;
    playProgression(sequence, 120, { onTick() {}, onEnded() { ended++; } }, 0, false);
    const stale = mockState.schedules[0].callback;

    seekAudio(2.25);
    pauseAudio();
    expect(mockState.transport?.state).toBe("paused");
    expect(mockState.transport?.ticks).toBe(432);
    resumeAudio();
    expect(mockState.transport?.state).toBe("started");
    expect(mockState.transport?.ticks).toBe(432);

    updateProgressionLive(sequence, 100, false);
    stale();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(ended).toBe(0);
    expect(mockState.transport?.state).toBe("started");

    const current = mockState.schedules[0].callback;
    current();
    current(); // the stale second invocation must not deliver a second ending
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(ended).toBe(1);
    expect(mockState.transport?.state).toBe("stopped");
  });

  it("ends cleanly if a live edit shortens a nonlooping pattern behind the cursor", async () => {
    await initAudio();
    setTrackMixer(mix);
    let ended = 0;
    playProgression({ ...sequence, totalBars: 8 }, 120, {
      onTick() {}, onEnded() { ended++; },
    }, 7, false);
    expect(mockState.transport?.ticks).toBe(1344);
    updateProgressionLive(sequence, 120, false);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(ended).toBe(1);
    expect(mockState.schedules).toHaveLength(0);
  });

});
