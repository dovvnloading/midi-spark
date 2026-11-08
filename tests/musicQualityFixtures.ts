import { Note } from "@tonaljs/tonal";
import type { NoteEvent, ProgressionData } from "../src/lib/theory";

export interface EvaluationFixture {
  id: string;
  /** Curated, original synthetic phrase — not copied from any song/corpus. */
  description: string;
  root: string;
  mode: "major" | "minor";
  bars: number;
  notes: NoteEvent[];
}

const n = (midi: number, timeStart: number, duration = 0.78, velocity = 0.78): NoteEvent => ({
  midi, name: Note.fromMidi(midi) ?? "C4", timeStart, duration, velocity, trackIndex: 0,
});

const phrases: EvaluationFixture[] = [
  {
    id: "pop-arch",
    description: "Four-bar major pop arch with contrasting melodic goals",
    root: "C", mode: "major", bars: 4,
    notes: [
      n(72, 0), n(76, 1), n(79, 2), n(76, 3),
      n(74, 4), n(77, 5), n(79, 6), n(77, 7),
      n(76, 8), n(72, 9), n(69, 10), n(72, 11),
      n(71, 12), n(74, 13), n(72, 14, 1.8),
    ],
  },
  {
    id: "minor-cadence",
    description: "Minor-key phrase with harmonic dominant and clear ending",
    root: "A", mode: "minor", bars: 4,
    notes: [
      n(69, 0, 1.5), n(72, 2), n(76, 3),
      n(74, 4), n(71, 5), n(68, 6), n(71, 7),
      n(69, 8), n(72, 9), n(74, 10, 1.75),
      n(68, 12), n(71, 13), n(69, 14, 1.8),
    ],
  },
  {
    id: "syncopated-major",
    description: "Offbeat melody attacks favoring syncopated backing",
    root: "G", mode: "major", bars: 4,
    notes: [
      n(74, 0.5, 0.35), n(79, 1.5, 0.38), n(78, 2.5, 0.4), n(74, 3.5, 0.35),
      n(76, 4.5, 0.34), n(79, 5.5, 0.38), n(81, 6.5, 0.35), n(79, 7.5, 0.33),
      n(78, 8.5, 0.36), n(76, 9.5, 0.4), n(74, 10.5, 0.36), n(72, 11.5, 0.3),
      n(71, 12.5, 0.35), n(74, 13.5, 0.35), n(79, 14.5, 0.5),
    ],
  },
  {
    id: "sparse-sustains",
    description: "Sparse melody with long sustains crossing harmonic boundaries",
    root: "F", mode: "major", bars: 4,
    notes: [
      n(65, 0, 3.8, 0.54), n(69, 4, 5.5, 0.56),
      n(72, 9.5, 2.1, 0.59), n(65, 12, 3.9, 0.52),
    ],
  },
  {
    id: "chromatic-neighbors",
    description: "D-minor melody with short chromatic passing and neighbor tones",
    root: "D", mode: "minor", bars: 4,
    notes: [
      n(62, 0, 1.6), n(63, 1.6, 0.2), n(65, 2, 0.75), n(69, 3, 0.75),
      n(67, 4), n(66, 5, 0.25), n(65, 5.5), n(62, 6.5, 1.25),
      n(65, 8), n(69, 9), n(72, 10), n(71, 11, 0.7),
      n(69, 12), n(65, 13), n(62, 14, 1.8),
    ],
  },
  {
    id: "half-bar-pivot",
    description: "Two independent chord implications within each bar",
    root: "C", mode: "major", bars: 4,
    notes: Array.from({ length: 4 }, (_, bar) => [
      n(72, bar * 4, 0.5), n(76, bar * 4 + 0.5, 0.5), n(79, bar * 4 + 1, 0.75),
      n(74, bar * 4 + 2, 0.5), n(77, bar * 4 + 2.5, 0.5), n(81, bar * 4 + 3, 0.75),
    ]).flat(),
  },
  {
    id: "low-register",
    description: "Low melody tests accompaniment separation and register choice",
    root: "E", mode: "minor", bars: 4,
    notes: [
      n(52, 0), n(55, 1), n(59, 2), n(55, 3),
      n(57, 4), n(52, 5), n(50, 6), n(52, 7),
      n(55, 8), n(59, 9), n(62, 10), n(59, 11),
      n(57, 12), n(55, 13), n(52, 14, 1.75),
    ],
  },
  {
    id: "polyphonic-lead",
    description: "Simultaneous note onsets test lead-weighting and polyphony",
    root: "Bb", mode: "major", bars: 4,
    notes: [
      n(58, 0, 1.7), n(62, 0, 1.6), n(65, 0, 1.7), n(70, 0, 1.7),
      n(60, 2, 1.7), n(65, 2, 1.6), n(69, 2, 1.7),
      n(63, 4, 1.8), n(67, 4, 1.7), n(72, 4, 1.6),
      n(65, 6, 1.7), n(69, 6, 1.7), n(74, 6, 1.6),
      n(62, 8, 1.8), n(65, 8, 1.6), n(70, 8, 1.7),
      n(60, 10, 1.8), n(63, 10, 1.6), n(67, 10, 1.7),
      n(58, 12, 3.6), n(62, 12, 3.4), n(65, 12, 3.5),
    ],
  },
  {
    id: "motivic-repetition",
    description: "Repeated four-note motif tests continuity and controlled variation",
    root: "D", mode: "major", bars: 4,
    notes: Array.from({ length: 4 }, (_, bar) => [
      n(74, bar * 4), n(76, bar * 4 + 1), n(78, bar * 4 + 2), n(76, bar * 4 + 3),
    ]).flat(),
  },
  {
    id: "quiet-phrasing",
    description: "Quiet phrase tests backing dynamics and no source mutation",
    root: "Eb", mode: "major", bars: 4,
    notes: [
      n(67, 0, 0.65, 0.2), n(70, 1.5, 0.9, 0.22), n(72, 3, 0.7, 0.18),
      n(75, 4.5, 1.3, 0.25), n(74, 6.5, 1.1, 0.15),
      n(72, 8, 1.8, 0.23), n(70, 10, 1.4, 0.2),
      n(67, 12, 3.6, 0.2),
    ],
  },
];

export const EVALUATION_FIXTURES: readonly EvaluationFixture[] = phrases;

/** Always return a separate, editable input; tests must not share mutable notes. */
export function makeFixtureProgression(fixture: EvaluationFixture): ProgressionData {
  return {
    notes: fixture.notes.map(note => ({ ...note })),
    tracks: [{ index: 0, name: "Original melody", program: 80, channel: 0 }],
    chords: [],
    totalBars: fixture.bars,
  };
}
