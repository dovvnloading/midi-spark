import type { SynthType } from "./audio";
import type { NoteEvent, ProgressionData } from "./theory";

export interface TrackSettings {
  synthType: SynthType;
  /** Linear gain (0 = silent, 1 = unity). */
  level: number;
  muted: boolean;
  solo: boolean;
}

export type TrackMix = Record<number, TrackSettings>;

export interface TrackDescriptor {
  index: number;
  name: string;
  noteCount: number;
}

export const TRACK_PRESET_TYPES: readonly SynthType[] = [
  "classic", "epiano", "warmPad", "pluck", "sub", "lead", "choir", "tines", "analogBass", "marimba",
];

export function trackIndexOf(note: NoteEvent): number {
  return Number.isInteger(note.trackIndex) && (note.trackIndex ?? -1) >= 0
    ? note.trackIndex!
    : 0;
}

/** Include imported track headers even when a melodic track has no notes. */
export function listTracks(data: ProgressionData | null): TrackDescriptor[] {
  if (!data) return [];
  const counts = new Map<number, number>();
  const names = new Map<number, string>();
  data.tracks?.forEach((track) => {
    if (Number.isInteger(track.index) && track.index >= 0) {
      names.set(track.index, track.name.trim() || "Track " + (track.index + 1));
      counts.set(track.index, 0);
    }
  });
  data.notes.forEach((note) => {
    const id = trackIndexOf(note);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  });
  return [...counts.entries()].sort(([a], [b]) => a - b).map(([index, noteCount]) => ({
    index,
    name: names.get(index) ?? "Track " + (index + 1),
    noteCount,
  }));
}

export function defaultTrackSettings(index: number, synthType: SynthType): TrackSettings {
  return {
    synthType: index === 0 ? synthType : TRACK_PRESET_TYPES[index % TRACK_PRESET_TYPES.length],
    level: 1,
    muted: false,
    solo: false,
  };
}

/** Keep user choices for existing IDs, and clean up IDs removed by import/edit. */
export function reconcileTrackMix(
  data: ProgressionData | null,
  previous: TrackMix,
  synthType: SynthType,
): TrackMix {
  const next: TrackMix = {};
  for (const track of listTracks(data)) {
    next[track.index] = previous[track.index] ?? defaultTrackSettings(track.index, synthType);
  }
  const oldKeys = Object.keys(previous);
  if (
    oldKeys.length === Object.keys(next).length &&
    oldKeys.every((key) => previous[Number(key)] === next[Number(key)])
  ) {
    return previous;
  }
  return next;
}

export function trackIsAudible(index: number, mixer: TrackMix): boolean {
  const setting = mixer[index];
  if (!setting || setting.muted || setting.level <= 0) return false;
  const anySolo = Object.values(mixer).some((entry) => entry.solo);
  return !anySolo || setting.solo;
}

/** The gain is 0 immediately when the track is muted or excluded by solo. */
export function trackEffectiveLevel(index: number, mixer: TrackMix): number {
  return trackIsAudible(index, mixer) ? Math.min(1, Math.max(0, mixer[index].level)) : 0;
}
