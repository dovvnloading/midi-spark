import { describe, it, expect, beforeEach } from "vitest";
import {
  saveSession,
  loadSession,
  clearSession,
  SESSION_STORAGE_KEY,
  SavedSession,
} from "../src/lib/persistence";
import { ProgressionData } from "../src/lib/theory";

// The Vitest environment is 'node' (see vitest.config.ts) so there is no
// global localStorage; polyfill an in-memory Storage for this file only,
// rather than weakening the global test environment for everything else.
function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  const storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
  return storage as unknown as Storage;
}

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", {
    value: createMemoryStorage(),
    configurable: true,
    writable: true,
  });
});

const sampleProgression: ProgressionData = {
  notes: [
    { midi: 60, name: "C4", timeStart: 0, duration: 1, velocity: 0.8 },
    {
      midi: 64,
      name: "E4",
      timeStart: 1,
      duration: 1,
      velocity: 0.7,
      trackIndex: 1,
    },
  ],
  chords: [{ name: "Cmaj7", timeStart: 0, duration: 4 }],
  totalBars: 4,
};

const sampleSession: SavedSession = {
  progression: sampleProgression,
  root: "D",
  mode: "minor",
  bpm: 96,
  dissonance: 45,
  complexity: 60,
  bars: 8,
  synthType: "pad",
  snapResolution: 0.5,
  noteLength: 0.25,
  zoomX: 80,
};

describe("saveSession / loadSession", () => {
  it("round-trips a representative session exactly", () => {
    saveSession(sampleSession);
    expect(loadSession()).toEqual(sampleSession);
  });

  it("round-trips source-owned bar pins/exclusions and rejects malformed guides", () => {
    const session: SavedSession = {
      ...sampleSession,
      progression: {
        ...sampleProgression,
        harmonyConstraints: [
          { sourceTrackIndex: 0, bar: 0, kind: "require", chord: "Cmaj7" },
          { sourceTrackIndex: 0, bar: 2, kind: "avoid", chord: "F" },
          { sourceTrackIndex: 1, bar: 1, kind: "require", chord: "Am" },
        ],
      },
    };
    saveSession(session);
    expect(loadSession()).toEqual(session);
    for (const malformed of [
      { sourceTrackIndex: 0, bar: -1, kind: "avoid", chord: "F" },
      { sourceTrackIndex: 0, bar: 64, kind: "require", chord: "C" },
      { sourceTrackIndex: 0, bar: 0, kind: "random", chord: "C" },
      { sourceTrackIndex: 0, bar: 0, kind: "avoid", chord: "" },
      { sourceTrackIndex: "0", bar: 0, kind: "require", chord: "C" },
    ]) {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
        ...session, progression: {
          ...session.progression, harmonyConstraints: [malformed],
        },
      }));
      expect(loadSession()).toBeNull();
    }
    saveSession(sampleSession);
    expect(loadSession()).toEqual(sampleSession);
  });

  it("round-trips generated chord-region locks and rejects malformed lock ownership", () => {
    const withLock: SavedSession = {
      ...sampleSession,
      progression: {
        ...sampleProgression,
        chords: [
          { name: "Cmaj7", timeStart: 0, duration: 4,
            generatedSourceTrackIndex: 0, locked: true },
          { name: "User label", timeStart: 4, duration: 4 },
        ],
      },
    };
    saveSession(withLock);
    expect(loadSession()).toEqual(withLock);

    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
      ...withLock, progression: {
        ...withLock.progression,
        chords: [{ name: "User label", timeStart: 0, duration: 4, locked: true }],
      },
    }));
    expect(loadSession()).toBeNull();
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
      ...withLock, progression: {
        ...withLock.progression,
        chords: [{ name: "Cmaj7", timeStart: 0, duration: 4,
          generatedSourceTrackIndex: 0, locked: "yes" }],
      },
    }));
    expect(loadSession()).toBeNull();
    saveSession(sampleSession);
    expect(loadSession()).toEqual(sampleSession);
  });

  it("saves validated Take Lab favorites without requiring them in legacy sessions", () => {
    const favorites = {
      baseFingerprint: "89abcdef:12345678:218",
      sourceTrackIndex: 0,
      favorites: [{
        id: "take-100-0", seed: 100, root: "C", mode: "major",
        totalBars: 4,
        notes: [{ midi: 48, name: "C3", timeStart: 0, duration: 2,
          velocity: 0.8, trackIndex: 1 }],
        chords: [{ name: "C", timeStart: 0, duration: 4,
          generatedSourceTrackIndex: 0 }],
      }],
    } as const;
    const session: SavedSession = {
      ...sampleSession, savedHarmonyTakes: JSON.parse(JSON.stringify(favorites)),
    };
    saveSession(session);
    expect(loadSession()).toEqual(session);
    const invalidCases = [
      { ...favorites, baseFingerprint: "not-a-fingerprint" },
      { ...favorites, favorites: [{ ...favorites.favorites[0], seed: -1 }] },
      { ...favorites, favorites: [{ ...favorites.favorites[0], notes: [
        { ...favorites.favorites[0].notes[0], midi: 144 },
      ] }] },
      { ...favorites, favorites: [{ ...favorites.favorites[0], chords: [
        { ...favorites.favorites[0].chords[0], generatedSourceTrackIndex: 9 },
      ] }] },
      { ...favorites, favorites: Array(5).fill(favorites.favorites[0]) },
    ];
    for (const item of invalidCases) {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
        ...sampleSession, savedHarmonyTakes: item,
      }));
      // Losing a damaged optional take library must not discard the user's
      // valid original MIDI composition or settings.
      expect(loadSession()).toEqual(sampleSession);
    }
    // v1 sessions saved before Take Lab remain fully compatible.
    saveSession(sampleSession);
    expect(loadSession()).toEqual(sampleSession);
  });

  it("round-trips imported track metadata and custom mixer settings", () => {
    const session: SavedSession = {
      ...sampleSession,
      progression: {
        ...sampleProgression,
        tracks: [
          { index: 0, name: "Bass", program: 33, channel: 2 },
          { index: 1, name: "Lead", program: 81, channel: 3 },
        ],
      },
      trackMix: {
        0: { synthType: "classic", muted: false, solo: false, level: 0.5 },
        1: { synthType: "pluck", muted: true, solo: false, level: 0.8 },
      },
    };
    saveSession(session);
    expect(loadSession()).toEqual(session);
  });

  it("persists expanded preset choices without invalidating older session data", () => {
    const session: SavedSession = {
      ...sampleSession,
      synthType: "nebula",
      trackMix: {
        0: { synthType: "kalimba", level: 0.65, solo: false, muted: false },
        1: { synthType: "acid", level: 0.82, solo: false, muted: false },
      },
    };
    saveSession(session);
    expect(loadSession()).toEqual(session);
    saveSession(sampleSession);
    expect(loadSession()).toEqual(sampleSession);
  });

  it("rejects invalid phrase coherence without invalidating older sessions", () => {
    for (const invalid of [-1, 101, "high", null]) {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
        ...sampleSession, harmonyExploration: 62, phraseCoherence: invalid,
      }));
      expect(loadSession()).toBeNull();
    }
    saveSession(sampleSession);
    expect(loadSession()).toEqual(sampleSession);
  });

  it("rejects corrupt mixer preferences rather than restoring invalid audio gain", () => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
      ...sampleSession,
      trackMix: { 0: { synthType: "unknown", level: -8, muted: "no", solo: false } },
    }));
    expect(loadSession()).toBeNull();
  });

  it("round-trips optional loop preferences while retaining older saved sessions", () => {
    const customized: SavedSession = {
      ...sampleSession,
      isLooping: false,
      loopRegion: { start: 4, end: 12 },
    };
    saveSession(customized);
    expect(loadSession()).toEqual(customized);
    saveSession(sampleSession);
    expect(loadSession()).toEqual(sampleSession);
  });

  it("rejects invalid loop bounds rather than restoring a broken transport", () => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
      ...sampleSession,
      isLooping: true,
      loopRegion: { start: 8, end: 7 },
    }));
    expect(loadSession()).toBeNull();
  });

  it("round-trips layered generation preferences and monotonic track identities", () => {
    const layered: SavedSession = {
      ...sampleSession,
      generationMode: "layers",
      progression: {
        ...sampleProgression,
        tracks: [
          { index: 0, name: "Bass", program: 33, channel: 0 },
          { index: 1, name: "Harmony", program: 0, channel: 1 },
        ],
        nextTrackIndex: 5,
      },
    };
    saveSession(layered);
    expect(loadSession()).toEqual(layered);
    // Older v1 sessions without either field remain loadable.
    saveSession(sampleSession);
    expect(loadSession()).toEqual(sampleSession);
  });

  it("rejects malformed generation preferences and invalid track allocator state", () => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
      ...sampleSession, generationMode: "unknown",
    }));
    expect(loadSession()).toBeNull();
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
      ...sampleSession, progression: { ...sampleProgression, nextTrackIndex: -2 },
    }));
    expect(loadSession()).toBeNull();
  });

  it("round-trips melody-generation choices and track ownership without breaking v1 sessions", () => {
    const session: SavedSession = {
      ...sampleSession,
      melodySourceMode: "follow",
      melodySourceTrackIndex: 1,
      harmonicFit: 83,
      harmonyExploration: 62,
      phraseCoherence: 73,
      accompanimentDensity: "active",
      melodyKeyStrategy: "detect",
      progression: {
        ...sampleProgression,
        tracks: [
          {index: 0, name: "Melody", channel: 1},
          {index: 1, name: "Generated Bass", channel: 2, generatedRole: "bass", sourceTrackIndex: 0},
        ],
        chords: [{name: "C", timeStart: 0, duration: 4, generatedSourceTrackIndex: 0}],
      },
    };
    saveSession(session);
    expect(loadSession()).toEqual(session);
    saveSession(sampleSession);
    expect(loadSession()).toEqual(sampleSession);
  });

  it("rejects unsupported melody preferences and invalid ownership markers", () => {
    for (const changed of [
      {harmonicFit: 128},
      {accompanimentDensity: "storm"},
      {melodySourceTrackIndex: -1},
      {melodyKeyStrategy: "oracle"},
      {progression: {...sampleProgression,
        tracks: [{index: 0, name: "Generated Bass", generatedRole: "bass", sourceTrackIndex: -1}]}},
    ]) {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({...sampleSession, ...changed}));
      expect(loadSession()).toBeNull();
    }
  });

  it("persists motif preferences and continuation/variation ownership within v1 sessions", () => {
    const updated: SavedSession = {
      ...sampleSession,
      melodyTask: "continue",
      motifCreativity: 84,
      continuationBars: 8,
      progression: {
        ...sampleProgression,
        tracks: [
          {index: 0, name: "Lead", channel: 0},
          {index: 3, name: "Melody Continuation", channel: 1,
            generatedRole: "continuation", sourceTrackIndex: 0},
          {index: 4, name: "Melody Variation", channel: 2,
            generatedRole: "variation", sourceTrackIndex: 0},
        ],
      },
    };
    saveSession(updated);
    expect(loadSession()).toEqual(updated);
    saveSession(sampleSession);
    expect(loadSession()).toEqual(sampleSession);
  });

  it("rejects malformed motif preferences and unsupported source role", () => {
    for (const update of [
      {melodyTask: "compose"},
      {motifCreativity: -0.1},
      {motifCreativity: 101},
      {continuationBars: 3},
      {progression: {...sampleProgression,
        tracks: [{index: 3, name: "Unsupported", generatedRole: "oracle", sourceTrackIndex: 0}]}},
    ]) {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({...sampleSession, ...update}));
      expect(loadSession()).toBeNull();
    }
  });

  it("round-trips an adaptive harmonic pacing setting without breaking older v1 saves", () => {
    for (const harmonicPacing of ["bar", "adaptive", "half-bar"] as const) {
      const updated: SavedSession = {...sampleSession, harmonicPacing};
      saveSession(updated);
      expect(loadSession()).toEqual(updated);
    }
    saveSession(sampleSession);
    expect(loadSession()).toEqual(sampleSession);
  });

  it("rejects unsupported harmonic pacing in saved composer settings", () => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
      ...sampleSession, harmonicPacing: "rapid-fire",
    }));
    expect(loadSession()).toBeNull();
  });

  it("retains phrase scope choice while keeping actual note selection ephemeral", () => {
    for (const melodyPhraseScope of ["track", "selected", "loop"] as const) {
      const updated: SavedSession = {...sampleSession, melodyPhraseScope};
      saveSession(updated);
      expect(loadSession()).toEqual(updated);
    }
    // Existing v1 saves have no phrase scope field and remain compatible.
    saveSession(sampleSession);
    expect(loadSession()).toEqual(sampleSession);
  });

  it("refuses malformed persisted phrase scope instead of silently changing behavior", () => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
      ...sampleSession, melodyPhraseScope: "other-track",
    }));
    expect(loadSession()).toBeNull();
  });

  it("round-trips exploration from 0 to 100 without invalidating prior v1 saves", () => {
    for (const harmonyExploration of [0, 62, 100]) {
      const session: SavedSession = {...sampleSession, harmonyExploration};
      saveSession(session);
      expect(loadSession()).toEqual(session);
    }
    saveSession(sampleSession);
    expect(loadSession()).toEqual(sampleSession);
  });

  it("rejects invalid persisted harmony exploration values", () => {
    for (const harmonyExploration of [-1, 101, "cosmic", null]) {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
        ...sampleSession, harmonyExploration,
      }));
      expect(loadSession()).toBeNull();
    }
  });

  it("round-trips a null progression (no sequence generated yet)", () => {
    const session: SavedSession = { ...sampleSession, progression: null };
    saveSession(session);
    expect(loadSession()).toEqual(session);
  });

  it("returns null when nothing has been saved", () => {
    expect(loadSession()).toBeNull();
  });

  it("returns null on corrupt JSON without throwing", () => {
    localStorage.setItem(SESSION_STORAGE_KEY, "{not valid json");
    expect(() => loadSession()).not.toThrow();
    expect(loadSession()).toBeNull();
  });

  it("treats structurally invalid saved data as no session", () => {
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ root: "C" /* missing every other field */ }),
    );
    expect(loadSession()).toBeNull();
  });

  it("treats a progression with a malformed note as no session", () => {
    const bad = {
      ...sampleSession,
      progression: {
        ...sampleProgression,
        notes: [{ midi: "sixty", name: "C4" }],
      },
    };
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(bad));
    expect(loadSession()).toBeNull();
  });

  it("clearSession removes the saved session", () => {
    saveSession(sampleSession);
    expect(loadSession()).not.toBeNull();
    clearSession();
    expect(loadSession()).toBeNull();
  });

  it("saveSession does not throw when the underlying store throws", () => {
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        ...createMemoryStorage(),
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
      },
      configurable: true,
      writable: true,
    });
    expect(() => saveSession(sampleSession)).not.toThrow();
  });
});
