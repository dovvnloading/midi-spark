import { describe, it, expect } from "vitest";
import { Midi } from "@tonejs/midi";
import { exportToMidiBlob, parseMidiBuffer } from "../src/lib/midi";
import { ProgressionData } from "../src/lib/theory";

const testProgression: ProgressionData = {
  notes: [
    { name: "C2", midi: 36, timeStart: 0, duration: 4, velocity: 0.7 },
    { name: "E4", midi: 64, timeStart: 0, duration: 2, velocity: 0.8 },
    { name: "G4", midi: 67, timeStart: 2, duration: 2, velocity: 0.9 },
    { name: "B4", midi: 71, timeStart: 4.5, duration: 0.25, velocity: 0.5 },
    { name: "C5", midi: 72, timeStart: 7.75, duration: 0.25, velocity: 1.0 },
  ],
  chords: [],
  totalBars: 2,
};

async function roundTrip(data: ProgressionData, bpm: number) {
  const blob = exportToMidiBlob(data, bpm);
  const buffer = await blob.arrayBuffer();
  return parseMidiBuffer(buffer);
}

describe("MIDI export/import round-trip", () => {
  it("preserves pitch, timing, and duration", async () => {
    const { progression, bpm } = await roundTrip(testProgression, 120);
    expect(bpm).not.toBeNull();
    expect(Math.round(bpm!)).toBe(120);
    expect(progression.notes.length).toBe(testProgression.notes.length);

    const sortedIn = [...testProgression.notes].sort(
      (a, b) => a.timeStart - b.timeStart || a.midi - b.midi,
    );
    progression.notes.forEach((out, i) => {
      expect(out.midi).toBe(sortedIn[i].midi);
      expect(out.timeStart).toBeCloseTo(sortedIn[i].timeStart, 2);
      expect(out.duration).toBeCloseTo(sortedIn[i].duration, 2);
      expect(out.velocity).toBeCloseTo(sortedIn[i].velocity, 1);
    });
    expect(progression.totalBars).toBe(2);
  });

  it("preserves distinct source tracks on export instead of flattening them", async () => {
    const multi: ProgressionData = {
      notes: [
        { midi: 60, name: "C4", timeStart: 0, duration: 1, velocity: 0.8, trackIndex: 0 },
        { midi: 64, name: "E4", timeStart: 1, duration: 1, velocity: 0.6, trackIndex: 1 },
        { midi: 67, name: "G4", timeStart: 2, duration: 1, velocity: 0.7, trackIndex: 1 },
      ],
      chords: [],
      totalBars: 1,
    };
    const buffer = await exportToMidiBlob(multi, 120).arrayBuffer();
    const exported = new Midi(buffer);
    expect(exported.tracks).toHaveLength(2);
    expect(exported.tracks[0].notes.map((n) => n.midi)).toEqual([60]);
    expect(exported.tracks[1].notes.map((n) => n.midi)).toEqual([64, 67]);

    const imported = parseMidiBuffer(buffer);
    expect(imported.progression.notes.map((n) => n.trackIndex)).toEqual([0, 1, 1]);
  });

  it("keeps generated and untagged notes on a single track", async () => {
    const buffer = await exportToMidiBlob(testProgression, 120).arrayBuffer();
    const exported = new Midi(buffer);
    expect(exported.tracks).toHaveLength(1);
    expect(exported.tracks[0].name).toBe("Midi Spark");
  });

  it("preserves the exported tempo", async () => {
    const { bpm } = await roundTrip(testProgression, 87);
    expect(Math.round(bpm!)).toBe(87);
  });
});

describe("parseMidiBuffer", () => {
  it("converts ticks using the file's own PPQ (regression: 128 was hardcoded)", () => {
    // Build a file through @tonejs/midi's own writer (PPQ 480 by default):
    // one quarter note at beat 1. Under the old hardcoded /128 conversion this
    // note would have imported at timeStart 3.75 instead of 1.
    const midi = new Midi();
    midi.header.setTempo(100);
    const track = midi.addTrack();
    track.addNote({
      midi: 60,
      ticks: midi.header.ppq, // exactly one quarter in
      durationTicks: midi.header.ppq,
      velocity: 0.8,
    });
    const { progression, bpm } = parseMidiBuffer(midi.toArray().buffer as ArrayBuffer);
    expect(progression.notes.length).toBe(1);
    expect(progression.notes[0].timeStart).toBeCloseTo(1, 5);
    expect(progression.notes[0].duration).toBeCloseTo(1, 5);
    expect(Math.round(bpm!)).toBe(100);
  });

  it("merges melodic tracks and skips channel-10 percussion", () => {
    const midi = new Midi();
    const melodic1 = midi.addTrack();
    melodic1.addNote({ midi: 60, ticks: 0, durationTicks: 480, velocity: 0.8 });
    const melodic2 = midi.addTrack();
    melodic2.addNote({ midi: 64, ticks: 480, durationTicks: 480, velocity: 0.8 });
    const drums = midi.addTrack();
    drums.channel = 9;
    drums.addNote({ midi: 36, ticks: 0, durationTicks: 120, velocity: 1 });

    const { progression } = parseMidiBuffer(midi.toArray().buffer as ArrayBuffer);
    expect(progression.notes.length).toBe(2);
    expect(progression.notes.map((n) => n.midi).sort()).toEqual([60, 64]);
  });

  it("tags each melodic track with its own contiguous trackIndex, skipping percussion", () => {
    // Percussion track placed FIRST to prove it doesn't consume an index slot.
    const midi = new Midi();
    const drums = midi.addTrack();
    drums.channel = 9;
    drums.addNote({ midi: 36, ticks: 0, durationTicks: 120, velocity: 1 });
    const melodic1 = midi.addTrack();
    melodic1.addNote({ midi: 60, ticks: 0, durationTicks: 480, velocity: 0.8 });
    const melodic2 = midi.addTrack();
    melodic2.addNote({ midi: 64, ticks: 480, durationTicks: 480, velocity: 0.8 });
    melodic2.addNote({ midi: 67, ticks: 960, durationTicks: 480, velocity: 0.8 });

    const { progression } = parseMidiBuffer(midi.toArray().buffer as ArrayBuffer);
    const trackIndexByMidi = new Map(
      progression.notes.map((n) => [n.midi, n.trackIndex]),
    );
    expect(trackIndexByMidi.get(60)).toBe(0);
    expect(trackIndexByMidi.get(64)).toBe(1);
    expect(trackIndexByMidi.get(67)).toBe(1);
    expect(new Set(progression.notes.map((n) => n.trackIndex))).toEqual(
      new Set([0, 1]),
    );
  });

  it("preserves imported track names, programs, and channels through export", async () => {
    const midi = new Midi();
    const bass = midi.addTrack();
    bass.name = "Bass";
    bass.instrument.number = 33;
    bass.channel = 2;
    bass.addNote({ midi: 43, ticks: 0, durationTicks: 480, velocity: 0.8 });
    const lead = midi.addTrack();
    lead.name = "Lead";
    lead.instrument.number = 81;
    lead.channel = 3;
    lead.addNote({ midi: 76, ticks: 480, durationTicks: 480, velocity: 0.6 });

    const input = parseMidiBuffer(midi.toArray().buffer as ArrayBuffer);
    expect(input.progression.tracks).toEqual([
      { index: 0, name: "Bass", program: 33, channel: 2 },
      { index: 1, name: "Lead", program: 81, channel: 3 },
    ]);

    const exported = new Midi(await exportToMidiBlob(input.progression, 120).arrayBuffer());
    expect(exported.tracks.map((t) => [t.name, t.instrument.number, t.channel])).toEqual([
      ["Bass", 33, 2],
      ["Lead", 81, 3],
    ]);
  });

  it("keeps empty imported melodic tracks on export", async () => {
    const midi = new Midi();
    const empty = midi.addTrack();
    empty.name = "Empty pad";
    empty.instrument.number = 89;
    empty.channel = 4;
    const bass = midi.addTrack();
    bass.name = "Bass";
    bass.addNote({ midi: 43, ticks: 0, durationTicks: 480, velocity: 0.8 });

    const imported = parseMidiBuffer(midi.toArray().buffer as ArrayBuffer);
    expect(imported.progression.tracks?.map((track) => track.name)).toEqual([
      "Empty pad", "Bass",
    ]);
    const exported = new Midi(await exportToMidiBlob(imported.progression, 120).arrayBuffer());
    expect(exported.tracks.map((track) => track.name)).toEqual(["Empty pad", "Bass"]);
    expect(exported.tracks[0].instrument.number).toBe(89);
    expect(exported.tracks[0].notes).toHaveLength(0);
  });

  it("tags single-track imports with trackIndex 0 consistently", () => {
    const midi = new Midi();
    const track = midi.addTrack();
    track.addNote({ midi: 60, ticks: 0, durationTicks: 480, velocity: 0.8 });
    track.addNote({ midi: 62, ticks: 480, durationTicks: 480, velocity: 0.8 });

    const { progression } = parseMidiBuffer(midi.toArray().buffer as ArrayBuffer);
    expect(progression.notes.every((n) => n.trackIndex === 0)).toBe(true);
  });

  it("handles an empty file without NaN/-Infinity bars", () => {
    const midi = new Midi();
    const { progression } = parseMidiBuffer(midi.toArray().buffer as ArrayBuffer);
    expect(progression.notes).toEqual([]);
    expect(progression.totalBars).toBe(1);
    expect(Number.isFinite(progression.totalBars)).toBe(true);
  });

  it("skips zero/negative-duration notes on export rather than corrupting the file", async () => {
    const withBad: ProgressionData = {
      notes: [
        { name: "C4", midi: 60, timeStart: 0, duration: 1, velocity: 0.8 },
        { name: "D4", midi: 62, timeStart: 1, duration: 0, velocity: 0.8 },
      ],
      chords: [],
      totalBars: 1,
    };
    const { progression } = await roundTrip(withBad, 120);
    expect(progression.notes.length).toBe(1);
    expect(progression.notes[0].midi).toBe(60);
  });
});
