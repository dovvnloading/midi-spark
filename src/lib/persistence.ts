import { ProgressionData, NoteEvent, ChordEvent, TrackMetadata } from "./theory";
import type { TrackMix } from "./tracks";
import type { LoopRange } from "./timeline";
import type { SynthType } from "./audio";
import { PRESET_IDS } from "./presets";
import type { AccompanimentDensity, MelodyKeyStrategy } from "./adaptive";
import type { ContinuationBars } from "./motif";

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
  /** Optional so browser sessions saved before layered composition remain valid. */
  generationMode?: "single" | "layers";
  /** Optional v1 extensions: old sessions continue to load unchanged. */
  melodySourceMode?: "scratch" | "follow";
  melodySourceTrackIndex?: number | null;
  harmonicFit?: number;
  accompanimentDensity?: AccompanimentDensity;
  melodyKeyStrategy?: MelodyKeyStrategy;
  melodyTask?: "harmonize" | "continue" | "reimagine";
  motifCreativity?: number;
  continuationBars?: ContinuationBars;
  synthType: SynthType;
  snapResolution: number;
  noteLength: number;
  zoomX: number;
  /** Optional to keep backwards compatibility with older v1 local saves. */
  trackMix?: TrackMix;
  /** Optional transport preferences; older v1 saves remain valid. */
  isLooping?: boolean;
  loopRegion?: LoopRange | null;
}

const SYNTH_TYPES: ReadonlySet<string> = PRESET_IDS;

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
    isFiniteNumber(c.duration) &&
    (c.generatedSourceTrackIndex === undefined || (Number.isInteger(c.generatedSourceTrackIndex) && (c.generatedSourceTrackIndex as number) >= 0))
  );
}

function isTrackMetadata(v: unknown): v is TrackMetadata {
  if (typeof v !== "object" || v === null) return false;
  const t = v as Record<string, unknown>;
  return (
    Number.isInteger(t.index) &&
    (t.index as number) >= 0 &&
    typeof t.name === "string" &&
    (t.program === undefined || (Number.isInteger(t.program) && (t.program as number) >= 0 && (t.program as number) <= 127)) &&
    (t.channel === undefined || (Number.isInteger(t.channel) && (t.channel as number) >= 0 && (t.channel as number) <= 15)) &&
    (t.generatedRole === undefined || ["bass", "harmony", "continuation", "variation"].includes(t.generatedRole)) &&
    (t.sourceTrackIndex === undefined || (Number.isInteger(t.sourceTrackIndex) && (t.sourceTrackIndex as number) >= 0)) &&
    (t.generatedRole === undefined || t.sourceTrackIndex !== undefined)
  );
}

function isTrackMix(v: unknown): v is TrackMix {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  return Object.entries(v).every(([key, value]) => {
    if (!/^\d+$/.test(key) || typeof value !== "object" || value === null) return false;
    const setting = value as Record<string, unknown>;
    return (
      typeof setting.synthType === "string" &&
      SYNTH_TYPES.has(setting.synthType) &&
      isFiniteNumber(setting.level) &&
      setting.level >= 0 && setting.level <= 1 &&
      typeof setting.muted === "boolean" &&
      typeof setting.solo === "boolean"
    );
  });
}

function isLoopRange(v: unknown): v is LoopRange {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const range = v as Record<string, unknown>;
  return isFiniteNumber(range.start) && isFiniteNumber(range.end) &&
    range.start >= 0 && range.end >= range.start + 1;
}

function isProgressionData(v: unknown): v is ProgressionData {
  if (typeof v !== "object" || v === null) return false;
  const p = v as Record<string, unknown>;
  return (
    Array.isArray(p.notes) &&
    p.notes.every(isNoteEvent) &&
    Array.isArray(p.chords) &&
    p.chords.every(isChordEvent) &&
    isFiniteNumber(p.totalBars) &&
    (p.nextTrackIndex === undefined || (Number.isInteger(p.nextTrackIndex) && (p.nextTrackIndex as number) >= 0)) &&
    (p.tracks === undefined || (Array.isArray(p.tracks) && p.tracks.every(isTrackMetadata)))
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
    (s.generationMode === undefined || s.generationMode === "single" || s.generationMode === "layers") &&
    (s.melodySourceMode === undefined || s.melodySourceMode === "scratch" || s.melodySourceMode === "follow") &&
    (s.melodySourceTrackIndex === undefined || s.melodySourceTrackIndex === null ||
      (Number.isInteger(s.melodySourceTrackIndex) && (s.melodySourceTrackIndex as number) >= 0)) &&
    (s.harmonicFit === undefined || (isFiniteNumber(s.harmonicFit) && s.harmonicFit >= 0 && s.harmonicFit <= 100)) &&
    (s.accompanimentDensity === undefined || ["sparse", "balanced", "active"].includes(String(s.accompanimentDensity))) &&
    (s.melodyKeyStrategy === undefined || s.melodyKeyStrategy === "manual" || s.melodyKeyStrategy === "detect") &&
    (s.melodyTask === undefined || s.melodyTask === "harmonize" || s.melodyTask === "continue" || s.melodyTask === "reimagine") &&
    (s.motifCreativity === undefined || (isFiniteNumber(s.motifCreativity) && s.motifCreativity >= 0 && s.motifCreativity <= 100)) &&
    (s.continuationBars === undefined || s.continuationBars === 1 || s.continuationBars === 2 || s.continuationBars === 4 || s.continuationBars === 8) &&
    typeof s.synthType === "string" &&
    SYNTH_TYPES.has(s.synthType) &&
    isFiniteNumber(s.snapResolution) &&
    isFiniteNumber(s.noteLength) &&
    isFiniteNumber(s.zoomX) &&
    (s.trackMix === undefined || isTrackMix(s.trackMix)) &&
    (s.isLooping === undefined || typeof s.isLooping === "boolean") &&
    (s.loopRegion === undefined || s.loopRegion === null || isLoopRange(s.loopRegion))
  );
}

/** Best-effort autosave. Swallows quota errors and environments where
 *  localStorage is unavailable entirely (private browsing, SSR, tests). */
export function saveSession(session: SavedSession): boolean {
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    return true;
  } catch {
    // No console.warn: private-browsing/quota errors fire on every autosave
    // tick in that mode, which would spam the console on ordinary use.
    return false;
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
    // Callers don't wrap this in try/catch; a storage error here must not
    // propagate and break the "Clear saved session" button.
  }
}
