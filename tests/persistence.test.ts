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

  it("rejects corrupt mixer preferences rather than restoring invalid audio gain", () => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
      ...sampleSession,
      trackMix: { 0: { synthType: "unknown", level: -8, muted: "no", solo: false } },
    }));
    expect(loadSession()).toBeNull();
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
