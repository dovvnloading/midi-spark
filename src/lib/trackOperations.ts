import type { ProgressionData, TrackMetadata } from "./theory";
import { listTracks, trackIndexOf } from "./tracks";

/** Standard MIDI's melodic channels; channel 10 (zero-based 9) is percussion. */
export const MELODIC_CHANNELS = Array.from({ length: 16 }, (_, index) => index).filter(channel => channel !== 9);

function nextUnusedChannel(used: Set<number>): number | null {
  return MELODIC_CHANNELS.find(channel => !used.has(channel)) ?? null;
}

/** Materialize implicit generated track headers without losing import metadata. */
function trackHeaders(data: ProgressionData): TrackMetadata[] {
  const existing = new Map(data.tracks?.map(track => [track.index, track]));
  const used = new Set(data.tracks?.map(track => track.channel).filter((value): value is number => value !== undefined));
  return listTracks(data).map(track => {
    const metadata = existing.get(track.index);
    if (metadata) return { ...metadata };
    const channel = nextUnusedChannel(used);
    if (channel !== null) used.add(channel);
    return {
      index: track.index,
      name: track.name,
      program: 0, // General MIDI Acoustic Grand; browser patch is independent.
      ...(channel === null ? {} : { channel }),
    };
  });
}

function nextTrackIndex(data: ProgressionData): number {
  return Math.max(
    data.nextTrackIndex ?? 0,
    ...listTracks(data).map(track => track.index + 1),
    0,
  );
}

export interface TrackCreation {
  progression: ProgressionData;
  index: number;
}

/** Adds an empty track; null means all melodic MIDI channels are allocated. */
export function addTrack(data: ProgressionData, name?: string): TrackCreation | null {
  const headers = trackHeaders(data);
  const used = new Set(headers.map(track => track.channel).filter((value): value is number => value !== undefined));
  const channel = nextUnusedChannel(used);
  if (channel === null) return null;
  const index = nextTrackIndex(data);
  const title = name?.trim().slice(0, 48) || `Track ${index + 1}`;
  return {
    index,
    progression: {
      ...data,
      tracks: [...headers, { index, name: title, program: 0, channel }],
      nextTrackIndex: index + 1,
    },
  };
}

/** Blank or whitespace-only names do nothing; renaming an implicit track is supported. */
export function renameTrack(data: ProgressionData, index: number, name: string): ProgressionData {
  const title = name.trim().slice(0, 48);
  if (!title || !listTracks(data).some(track => track.index === index)) return data;
  const headers = trackHeaders(data);
  if (headers.find(track => track.index === index)?.name === title && data.tracks) return data;
  return { ...data, tracks: headers.map(track => track.index === index ? { ...track, name: title } : track) };
}

/** Duplicates the notes in place; gives the duplicate its own channel and identity. */
export function duplicateTrack(data: ProgressionData, index: number): TrackCreation | null {
  if (!listTracks(data).some(track => track.index === index)) return null;
  const headers = trackHeaders(data);
  const source = headers.find(track => track.index === index)!;
  const used = new Set(headers.map(track => track.channel).filter((value): value is number => value !== undefined));
  const channel = nextUnusedChannel(used);
  if (channel === null) return null;
  const newIndex = nextTrackIndex(data);
  return {
    index: newIndex,
    progression: {
      ...data,
      notes: [
        ...data.notes,
        ...data.notes.filter(note => trackIndexOf(note) === index).map(note => ({ ...note, trackIndex: newIndex })),
      ],
      tracks: [...headers, {
        ...source, index: newIndex, name: (source.name + " copy").slice(0, 48), channel,
      }],
      nextTrackIndex: newIndex + 1,
    },
  };
}

/** Removes notes and header atomically; leaves IDs available for undo restoration. */
export function deleteTrack(data: ProgressionData, index: number): ProgressionData {
  if (!listTracks(data).some(track => track.index === index)) return data;
  return {
    ...data,
    notes: data.notes.filter(note => trackIndexOf(note) !== index),
    tracks: trackHeaders(data).filter(track => track.index !== index),
    nextTrackIndex: nextTrackIndex(data),
  };
}
