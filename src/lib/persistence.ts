import { ProgressionData, NoteEvent, ChordEvent } from "./theory";
import type { SynthType } from "./audio";

/** Versioned so an incompatible future shape change can invalidate old saves
 *  cleanly (loadSession just won't find this key) instead of crashing on a
 *  saved shape it no longer understands. */
export const SESSION_STORAGE_KEY = "midi-spark:session:v1";

export interface SavedSession {
  progression: ProgressionData | null;
  root: string;
  mode: "major" | "minor";
  bpm: number;
  dissonance: number;
  complexity: number;
  bars: number;
  synthType: SynthType;
  snapResolution: number;
  noteLength: number;
  zoomX: number;
}

const SYNTH_TYPES: ReadonlySet<string> = new Set([
  "classic",
  "epiano",
  "pad",
  "pluck",
  "dream",
]);

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isNoteEvent(v: unknown): v is NoteEvent {
  if (typeof v !== "object" || v === null) return false;
  const n = v as Record<string, unknown>;
  return (
    isFiniteNumber(n.midi) &&
    typeof n.name === "string" &&
    isFiniteNumber(n.timeStart) &&
    isFiniteNumber(n.duration) &&
    isFiniteNumber(n.velocity) &&
    (n.trackIndex === undefined || isFiniteNumber(n.trackIndex))
  );
}

function isChordEvent(v: unknown): v is ChordEvent {
  if (typeof v !== "object" || v === null) return false;
  const c = v as Record<string, unknown>;
  return (
    typeof c.name === "string" &&
    isFiniteNumber(c.timeStart) &&
    isFiniteNumber(c.duration)
  );
}

function isProgressionData(v: unknown): v is ProgressionData {
  if (typeof v !== "object" || v === null) return false;
  const p = v as Record<string, unknown>;
  return (
    Array.isArray(p.notes) &&
    p.notes.every(isNoteEvent) &&
    Array.isArray(p.chords) &&
    p.chords.every(isChordEvent) &&
    isFiniteNumber(p.totalBars)
  );
}

function isValidSession(v: unknown): v is SavedSession {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Record<string, unknown>;
  return (
    (s.progression === null || isProgressionData(s.progression)) &&
    typeof s.root === "string" &&
    (s.mode === "major" || s.mode === "minor") &&
    isFiniteNumber(s.bpm) &&
    isFiniteNumber(s.dissonance) &&
    isFiniteNumber(s.complexity) &&
    isFiniteNumber(s.bars) &&
    typeof s.synthType === "string" &&
    SYNTH_TYPES.has(s.synthType) &&
    isFiniteNumber(s.snapResolution) &&
    isFiniteNumber(s.noteLength) &&
    isFiniteNumber(s.zoomX)
  );
}

/** Best-effort autosave. Swallows quota errors and environments where
 *  localStorage is unavailable entirely (private browsing, SSR, tests). */
export function saveSession(session: SavedSession): void {
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Autosave is best-effort only.
  }
}

/** Never throws: missing, corrupt, or schema-mismatched data is treated as
 *  "no saved session" rather than a partial/corrupt restore. */
export function loadSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isValidSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // ignore
  }
}
