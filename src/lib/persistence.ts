import { ProgressionData, NoteEvent, ChordEvent, TrackMetadata, HarmonyConstraint } from "./theory";
import type { TrackMix } from "./tracks";
import type { LoopRange } from "./timeline";
import type { SynthType } from "./audio";
import { PRESET_IDS } from "./presets";
import type { AccompanimentDensity, MelodyKeyStrategy, HarmonicPacing } from "./adaptive";
import type { ContinuationBars } from "./motif";
import type { MelodySourceScope } from "./melodyScope";
import type { SavedHarmonyTakeBank, SavedHarmonyFavorite } from "./takeLibrary";

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
  /** Saved preference only; actual note selection is ephemeral. */
  melodyPhraseScope?: MelodySourceScope;
  harmonicFit?: number;
  harmonyExploration?: number;
  phraseCoherence?: number;
  accompanimentDensity?: AccompanimentDensity;
  harmonicPacing?: HarmonicPacing;
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
  /** Explicitly saved Take Lab favorites; previews are never autosaved. */
  savedHarmonyTakes?: SavedHarmonyTakeBank;
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
    (c.generatedSourceTrackIndex === undefined || (Number.isInteger(c.generatedSourceTrackIndex) && (c.generatedSourceTrackIndex as number) >= 0)) &&
    (c.locked === undefined || (typeof c.locked === "boolean" && c.generatedSourceTrackIndex !== undefined))
  );
}

function isHarmonyConstraint(v: unknown): v is HarmonyConstraint {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const c = v as Record<string, unknown>;
  return Number.isInteger(c.sourceTrackIndex) && (c.sourceTrackIndex as number) >= 0 &&
    Number.isInteger(c.bar) && (c.bar as number) >= 0 && (c.bar as number) < 64 &&
    (c.kind === "require" || c.kind === "avoid") &&
    typeof c.chord === "string" && c.chord.length > 0 && c.chord.length <= 64;
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
    (t.generatedRole === undefined || (typeof t.generatedRole === "string" && ["bass", "harmony", "continuation", "variation"].includes(t.generatedRole))) &&
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
    (p.harmonyConstraints === undefined ||
      (Array.isArray(p.harmonyConstraints) && p.harmonyConstraints.length <= 512 &&
        p.harmonyConstraints.every(isHarmonyConstraint))) &&
    isFiniteNumber(p.totalBars) &&
    (p.nextTrackIndex === undefined || (Number.isInteger(p.nextTrackIndex) && (p.nextTrackIndex as number) >= 0)) &&
    (p.tracks === undefined || (Array.isArray(p.tracks) && p.tracks.every(isTrackMetadata))) &&
    (p.sourceTimeSignatures === undefined || (Array.isArray(p.sourceTimeSignatures) &&
      p.sourceTimeSignatures.every(signature => typeof signature === "string" && /^[1-9]\d*\/[1-9]\d*$/.test(signature))))
  );
}

function isSavedFavorite(v: unknown, sourceTrackIndex: number): v is SavedHarmonyFavorite {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const t = v as Record<string, unknown>;
  return typeof t.id === "string" && /^[a-zA-Z0-9-]{1,64}$/.test(t.id) &&
    Number.isSafeInteger(t.seed) && (t.seed as number) >= 0 && (t.seed as number) < 0x100000000 &&
    typeof t.root === "string" && t.root.length > 0 && t.root.length <= 8 &&
    (t.mode === "major" || t.mode === "minor") &&
    Number.isInteger(t.totalBars) && (t.totalBars as number) > 0 && (t.totalBars as number) <= 64 &&
    Array.isArray(t.notes) && t.notes.length <= 10000 &&
    t.notes.every(note => isNoteEvent(note) &&
      Number.isInteger(note.midi) && note.midi >= 0 && note.midi <= 127 &&
      note.timeStart >= 0 && note.duration > 0 && note.velocity >= 0 && note.velocity <= 1 &&
      Number.isInteger(note.trackIndex) && (note.trackIndex ?? -1) >= 0) &&
    Array.isArray(t.chords) && t.chords.length > 0 && t.chords.length <= 128 &&
    t.chords.every(chord => isChordEvent(chord) &&
      chord.generatedSourceTrackIndex === sourceTrackIndex &&
      chord.timeStart >= 0 && chord.duration > 0 &&
      chord.timeStart + chord.duration <= (t.totalBars as number) * 4 + 1e-8);
}
function isSavedHarmonyTakeBank(v: unknown): v is SavedHarmonyTakeBank {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const bank = v as Record<string, unknown>;
  if (typeof bank.baseFingerprint !== "string" ||
    !/^[0-9a-f]{8}:[0-9a-f]{8}:[0-9]+$/.test(bank.baseFingerprint) ||
    !Number.isInteger(bank.sourceTrackIndex) || (bank.sourceTrackIndex as number) < 0 ||
    !Array.isArray(bank.favorites) || bank.favorites.length > 4) return false;
  const sourceTrackIndex = bank.sourceTrackIndex as number;
  return bank.favorites.every(take => isSavedFavorite(take, sourceTrackIndex)) &&
    new Set(bank.favorites.map(take => (take as SavedHarmonyFavorite).id)).size === bank.favorites.length;
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
    (s.melodyPhraseScope === undefined || s.melodyPhraseScope === "track" ||
      s.melodyPhraseScope === "selected" || s.melodyPhraseScope === "loop") &&
    (s.harmonicFit === undefined || (isFiniteNumber(s.harmonicFit) && s.harmonicFit >= 0 && s.harmonicFit <= 100)) &&
    (s.harmonyExploration === undefined || (isFiniteNumber(s.harmonyExploration) &&
      s.harmonyExploration >= 0 && s.harmonyExploration <= 100)) &&
    (s.phraseCoherence === undefined || (isFiniteNumber(s.phraseCoherence) &&
      s.phraseCoherence >= 0 && s.phraseCoherence <= 100)) &&
    (s.accompanimentDensity === undefined || ["sparse", "balanced", "active"].includes(String(s.accompanimentDensity))) &&
    (s.harmonicPacing === undefined || s.harmonicPacing === "bar" ||
      s.harmonicPacing === "adaptive" || s.harmonicPacing === "half-bar") &&
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
    (s.loopRegion === undefined || s.loopRegion === null || isLoopRange(s.loopRegion)) &&
    (s.savedHarmonyTakes === undefined || isSavedHarmonyTakeBank(s.savedHarmonyTakes))
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
    if (isValidSession(parsed)) return parsed;
    // A malformed optional favorite must never discard an otherwise valid
    // original composition. Strip only that optional library and try again;
    // corruption in the actual MIDI/session still fails closed as before.
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) &&
      "savedHarmonyTakes" in parsed) {
      const withoutFavorites: Record<string, unknown> = { ...parsed };
      delete withoutFavorites.savedHarmonyTakes;
      if (isValidSession(withoutFavorites)) return withoutFavorites;
    }
    return null;
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
