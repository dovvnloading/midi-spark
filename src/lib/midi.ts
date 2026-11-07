import { Midi } from "@tonejs/midi";
import { Note } from "@tonaljs/tonal";
import { ProgressionData, NoteEvent, TrackMetadata } from "./theory";

export interface ImportedMidi {
  progression: ProgressionData;
  /** Tempo from the file header, if present. */
  bpm: number | null;
}

/** Serialize a progression at 480 PPQ with track separation and known General
 *  MIDI program/channel metadata. Untagged notes belong to track 0. Browser
 *  synth patches remain independent from General MIDI programs. */
export function exportToMidiBlob(data: ProgressionData, bpm: number): Blob {
  const midi = new Midi();
  midi.header.setTempo(bpm);
  const ppq = midi.header.ppq;
  const groups = new Map<number, NoteEvent[]>();

  for (const note of data.notes) {
    if (note.duration <= 0) continue;
    const index = note.trackIndex === undefined ? 0 : Math.max(0, Math.trunc(note.trackIndex));
    if (!groups.has(index)) groups.set(index, []);
    groups.get(index)?.push(note);
  }

  // Imported empty melodic tracks still carry names, programs and channels.
  data.tracks?.forEach((track) => {
    if (Number.isInteger(track.index) && track.index >= 0 && !groups.has(track.index)) {
      groups.set(track.index, []);
    }
  });
  if (groups.size === 0) groups.set(0, []);
  const sortedGroups = [...groups.entries()].sort(([a], [b]) => a - b);
  for (const [sourceIndex, notes] of sortedGroups) {
    const track = midi.addTrack();
    const meta = data.tracks?.find((item) => item.index === sourceIndex);
    track.name = meta?.name || (sortedGroups.length === 1
      ? "Midi Spark"
      : "Midi Spark - Track " + (sourceIndex + 1));
    if (meta?.program !== undefined && Number.isInteger(meta.program) &&
        meta.program >= 0 && meta.program <= 127) {
      track.instrument.number = meta.program;
    }
    if (meta?.channel !== undefined && Number.isInteger(meta.channel) &&
        meta.channel >= 0 && meta.channel <= 15 && meta.channel !== 9) {
      track.channel = meta.channel;
    }
    for (const note of notes) {
      track.addNote({
        midi: note.midi,
        ticks: Math.max(0, Math.round(note.timeStart * ppq)),
        durationTicks: Math.max(1, Math.round(note.duration * ppq)),
        velocity: Math.min(1, Math.max(0, note.velocity)),
      });
    }
  }

  return new Blob([midi.toArray()], { type: "audio/midi" });
}

/**
 * Parse a MIDI file into a progression. Times are converted to quarter notes
 * using the file's own PPQ (not an assumed constant), all melodic tracks are
 * merged, and channel-10 percussion is skipped.
 */
export function parseMidiBuffer(buffer: ArrayBuffer): ImportedMidi {
  const midi = new Midi(buffer);
  const ppq = midi.header.ppq || 480;

  const notes: NoteEvent[] = [];
  const tracks: TrackMetadata[] = [];
  let trackIndex = 0;
  for (const track of midi.tracks) {
    if (track.channel === 9) continue; // General MIDI percussion
    tracks.push({
      index: trackIndex,
      name: track.name || "Track " + (trackIndex + 1),
      program: track.instrument.number,
      channel: track.channel,
    });
    for (const n of track.notes) {
      notes.push({
        name: n.name || Note.fromMidi(n.midi) || "C4",
        midi: n.midi,
        timeStart: n.ticks / ppq,
        duration: Math.max(1 / 64, n.durationTicks / ppq),
        velocity: n.velocity,
        trackIndex,
      });
    }
    trackIndex++;
  }
  notes.sort((a, b) => a.timeStart - b.timeStart || a.midi - b.midi);

  const maxTime = notes.reduce((m, n) => Math.max(m, n.timeStart + n.duration), 0);
  const totalBars = Math.max(1, Math.ceil(maxTime / 4));

  const firstTempo = midi.header.tempos[0];
  return {
    progression: { notes, chords: [], totalBars, tracks },
    bpm: firstTempo ? firstTempo.bpm : null,
  };
}

export async function parseMidiFile(file: File): Promise<ImportedMidi> {
  return parseMidiBuffer(await file.arrayBuffer());
}
