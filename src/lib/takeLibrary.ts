import type { ChordEvent, NoteEvent, ProgressionData } from "./theory";
import { harmonyStructureSignature, type HarmonyTake } from "./harmonyTakes";

/** Favorites store only the generated accompaniment, never copies of the
 * user's source melody or unrelated tracks. A fingerprint binds them to the
 * exact working arrangement. Standard MIDI does not store these snapshots. */
export interface SavedHarmonyFavorite {
  id: string;
  seed: number;
  root: string;
  mode: "major" | "minor";
  totalBars: number;
  notes: NoteEvent[];
  chords: ChordEvent[];
}
export interface SavedHarmonyTakeBank {
  baseFingerprint: string;
  sourceTrackIndex: number;
  favorites: SavedHarmonyFavorite[];
}
export const MAX_HARMONY_FAVORITES = 4;

function generatedTrackIds(data: ProgressionData, sourceTrackIndex: number): number[] {
  return data.tracks?.filter(track => track.sourceTrackIndex === sourceTrackIndex &&
    (track.generatedRole === "bass" || track.generatedRole === "harmony"))
    .map(track => track.index) ?? [];
}

/** Cheap deterministic stale-state check; not intended as a cryptographic
 * signature. Including the byte length reduces accidental collisions, and
 * the saved favorite payload is also validated before restoring. */
export function takeBaseFingerprint(data: ProgressionData): string {
  const serialized = JSON.stringify(data);
  let first = 0x811c9dc5, second = 0x9e3779b9;
  for (let i = 0; i < serialized.length; i++) {
    const code = serialized.charCodeAt(i);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return [first >>> 0, second >>> 0].map(x => x.toString(16).padStart(8, "0")).join(":") +
    ":" + serialized.length;
}

export function isCompatibleTakeBank(
  base: ProgressionData | null, sourceTrackIndex: number | null,
  bank: SavedHarmonyTakeBank | null | undefined,
): bank is SavedHarmonyTakeBank {
  return !!base && !!bank && Number.isInteger(sourceTrackIndex) &&
    sourceTrackIndex === bank.sourceTrackIndex &&
    bank.baseFingerprint === takeBaseFingerprint(base) &&
    generatedTrackIds(base, bank.sourceTrackIndex).length === 2;
}

/** Rebuild a proposal from the *current* base's user-owned notes and track
 * metadata. Never trust a persisted copy of the melody to overwrite it. */
export function restoreHarmonyFavorite(
  base: ProgressionData, bank: SavedHarmonyTakeBank,
  favorite: SavedHarmonyFavorite,
): HarmonyTake | null {
  if (!isCompatibleTakeBank(base, bank.sourceTrackIndex, bank)) return null;
  const generated = new Set(generatedTrackIds(base, bank.sourceTrackIndex));
  if (favorite.notes.some(note => !generated.has(note.trackIndex ?? -1)) ||
    favorite.chords.some(chord => chord.generatedSourceTrackIndex !== bank.sourceTrackIndex) ||
    favorite.totalBars < base.totalBars || favorite.totalBars > 64) return null;
  const progression: ProgressionData = {
    ...base,
    totalBars: favorite.totalBars,
    notes: [...base.notes.filter(note => !generated.has(note.trackIndex ?? 0)), ...favorite.notes],
    chords: [...base.chords.filter(chord =>
      chord.generatedSourceTrackIndex !== bank.sourceTrackIndex), ...favorite.chords]
      .sort((a, b) => a.timeStart - b.timeStart),
  };
  return {
    seed: favorite.seed,
    root: favorite.root,
    mode: favorite.mode,
    progression,
    changedRegions: 0,
    chordSummary: favorite.chords.slice(0, 6).map(chord => chord.name).join(" · ") +
      (favorite.chords.length > 6 ? " …" : ""),
  };
}

export type FavoriteSaveResult =
  | { ok: true; bank: SavedHarmonyTakeBank; id: string; alreadySaved: boolean }
  | { ok: false; reason: string };

export function saveHarmonyFavorite(
  base: ProgressionData, sourceTrackIndex: number, take: HarmonyTake,
  previous?: SavedHarmonyTakeBank | null,
): FavoriteSaveResult {
  const ids = generatedTrackIds(base, sourceTrackIndex);
  if (ids.length !== 2 ||
    generatedTrackIds(take.progression, sourceTrackIndex).join(",") !== ids.join(",")) {
    return { ok: false, reason: "The take no longer matches the source's generated tracks." };
  }
  const generated = new Set(ids);
  const notes = take.progression.notes.filter(note => generated.has(note.trackIndex ?? -1));
  const chords = take.progression.chords.filter(chord =>
    chord.generatedSourceTrackIndex === sourceTrackIndex);
  if (!chords.length || notes.length > 10_000) {
    return { ok: false, reason: "This take is too large or incomplete to save." };
  }
  const fingerprint = takeBaseFingerprint(base);
  const bank: SavedHarmonyTakeBank = isCompatibleTakeBank(base, sourceTrackIndex, previous)
    ? previous : { baseFingerprint: fingerprint, sourceTrackIndex, favorites: [] };
  const signature = harmonyStructureSignature(take.progression, sourceTrackIndex);
  for (const favorite of bank.favorites) {
    const restored = restoreHarmonyFavorite(base, bank, favorite);
    if (restored && harmonyStructureSignature(restored.progression, sourceTrackIndex) === signature) {
      return { ok: true, bank, id: favorite.id, alreadySaved: true };
    }
  }
  if (bank.favorites.length >= MAX_HARMONY_FAVORITES) {
    return { ok: false, reason: "Four favorites are saved for this arrangement. Remove one before saving another." };
  }
  const id = "take-" + take.seed + "-" + bank.favorites.length;
  return {
    ok: true, alreadySaved: false, id,
    bank: { ...bank, favorites: [...bank.favorites, {
      id, seed: take.seed, root: take.root, mode: take.mode,
      totalBars: take.progression.totalBars,
      notes, chords,
    }] },
  };
}

export function removeHarmonyFavorite(
  bank: SavedHarmonyTakeBank, favoriteId: string,
): SavedHarmonyTakeBank {
  if (!bank.favorites.some(favorite => favorite.id === favoriteId)) return bank;
  return { ...bank, favorites: bank.favorites.filter(favorite => favorite.id !== favoriteId) };
}
