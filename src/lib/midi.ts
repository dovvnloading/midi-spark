import { Midi } from "@tonejs/midi";
import { Note } from "@tonaljs/tonal";
import { ProgressionData, NoteEvent } from "./theory";

export interface ImportedMidi {
  progression: ProgressionData;
  /** Tempo from the file header, if present. */
  bpm: number | null;
}

/** Serialize a progression to a standard MIDI file (format 1, 480 PPQ). */
export function exportToMidiBlob(data: ProgressionData, bpm: number): Blob {
  const midi = new Midi();
  midi.header.setTempo(bpm);
  const ppq = midi.header.ppq;

  const track = midi.addTrack();
  track.name = "Midi Spark";

  for (const note of data.notes) {
    if (note.duration <= 0) continue;
    track.addNote({
      midi: note.midi,
      ticks: Math.max(0, Math.round(note.timeStart * ppq)),
      durationTicks: Math.max(1, Math.round(note.duration * ppq)),
      velocity: Math.min(1, Math.max(0, note.velocity)),
    });
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
  for (const track of midi.tracks) {
    if (track.channel === 9) continue; // General MIDI percussion
    for (const n of track.notes) {
      notes.push({
        name: n.name || Note.fromMidi(n.midi) || "C4",
        midi: n.midi,
        timeStart: n.ticks / ppq,
        duration: Math.max(1 / 64, n.durationTicks / ppq),
        velocity: n.velocity,
      });
    }
  }
  notes.sort((a, b) => a.timeStart - b.timeStart || a.midi - b.midi);

  const maxTime = notes.reduce((m, n) => Math.max(m, n.timeStart + n.duration), 0);
  const totalBars = Math.max(1, Math.ceil(maxTime / 4));

  const firstTempo = midi.header.tempos[0];
  return {
    progression: { notes, chords: [], totalBars },
    bpm: firstTempo ? firstTempo.bpm : null,
  };
}

export async function parseMidiFile(file: File): Promise<ImportedMidi> {
  return parseMidiBuffer(await file.arrayBuffer());
}
