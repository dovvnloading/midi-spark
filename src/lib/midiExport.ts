import MidiWriter from "midi-writer-js";
import { ProgressionData, NoteEvent } from "./theory";
import { Midi } from "@tonejs/midi";
import { Note } from "@tonaljs/tonal";

export function exportToMidi(data: ProgressionData, bpm: number): string {
  const track = new MidiWriter.Track();
  track.setTempo(bpm);
  
  data.notes.forEach((note) => {
    const durationTicks = Math.round(note.duration * 128);
    const startTick = Math.round(note.timeStart * 128);
    
    const event = new MidiWriter.NoteEvent({
      pitch: [note.name],
      duration: `T${durationTicks}`,
      tick: startTick,
      velocity: Math.round(note.velocity * 100)
    });
    track.addEvent(event, (event as any).map);
  });

  const write = new MidiWriter.Writer(track);
  return write.dataUri();
}

export async function parseMidiFile(file: File): Promise<ProgressionData> {
  const buffer = await file.arrayBuffer();
  const midi = new Midi(buffer);
  
  let mainTrack = midi.tracks[0];
  for (const track of midi.tracks) {
    if (track.notes.length > mainTrack.notes.length) {
      mainTrack = track;
    }
  }

  if (!mainTrack) return { notes: [], chords: [], totalBars: 0 };

  const notesOut: NoteEvent[] = mainTrack.notes.map(n => ({
    name: Note.fromMidi(n.midi),
    midi: n.midi,
    timeStart: n.ticks / 128, // simplistic mapping assuming 128 ticks per quarter
    duration: n.durationTicks / 128,
    velocity: n.velocity
  }));

  // Find max time for total bounds
  const maxTime = Math.max(...notesOut.map(n => n.timeStart + n.duration));
  const totalBars = Math.ceil(maxTime / 4);

  return {
    notes: notesOut,
    chords: [{ name: "Analyzed MIDI", timeStart: 0, duration: maxTime }],
    totalBars
  };
}
