import { Note } from "@tonaljs/tonal";
import type { ChordEvent, NoteEvent, ProgressionData } from "./theory";

/** Every preset is a transposable recipe, not a fixed-key MIDI clip. */
export const STAMP_GROUPS = [
  "Triads & suspended", "Sixths & added tones", "Seventh chords", "Extended & altered",
  "Major progressions", "Minor progressions", "Jazz & blues progressions", "Scales",
] as const;
export type StampGroup = typeof STAMP_GROUPS[number];
interface StampBase {
  id: string;
  label: string;
  group: StampGroup;
  description: string;
}
export interface ChordStampPreset extends StampBase {
  kind: "chord";
  intervals: readonly number[];
  suffix: string;
}
export interface ScaleStampPreset extends StampBase {
  kind: "scale";
  intervals: readonly number[];
}
export type ProgressionStep = readonly [degree: number, chordId: string, quarters?: number];
export interface ProgressionStampPreset extends StampBase {
  kind: "progression";
  formula: string;
  steps: readonly ProgressionStep[];
}
export type StampPreset = ChordStampPreset | ScaleStampPreset | ProgressionStampPreset;

const C = (id: string, label: string, group: StampGroup, suffix: string,
  intervals: number[], description: string): ChordStampPreset =>
  ({ kind: "chord", id, label, group, suffix, intervals, description });
const S = (id: string, label: string, intervals: number[], description: string): ScaleStampPreset =>
  ({ kind: "scale", id, label, group: "Scales", intervals, description });
const P = (id: string, label: string, group: StampGroup, formula: string,
  steps: ProgressionStep[], description: string): ProgressionStampPreset =>
  ({ kind: "progression", id, label, group, formula, steps, description });

/** A deliberately broad standard-chord vocabulary, with explicit pitch intervals. */
export const CHORD_PRESETS: readonly ChordStampPreset[] = [
  C("Major", "Major", "Triads & suspended", "", [0, 4, 7], "Major triad"),
  C("Minor", "Minor", "Triads & suspended", "m", [0, 3, 7], "Minor triad"),
  C("Dim", "Diminished", "Triads & suspended", "dim", [0, 3, 6], "Diminished triad"),
  C("Aug", "Augmented", "Triads & suspended", "aug", [0, 4, 8], "Augmented triad"),
  C("Power", "Power (5)", "Triads & suspended", "5", [0, 7], "Root and fifth"),
  C("Sus2", "Suspended 2", "Triads & suspended", "sus2", [0, 2, 7], "Third replaced by second"),
  C("Sus4", "Suspended 4", "Triads & suspended", "sus4", [0, 5, 7], "Third replaced by fourth"),
  C("6", "Major 6", "Sixths & added tones", "6", [0, 4, 7, 9], "Major sixth"),
  C("m6", "Minor 6", "Sixths & added tones", "m6", [0, 3, 7, 9], "Minor sixth"),
  C("6/9", "6/9", "Sixths & added tones", "69", [0, 4, 7, 9, 14], "Sixth and ninth"),
  C("m6/9", "Minor 6/9", "Sixths & added tones", "m69", [0, 3, 7, 9, 14], "Minor sixth and ninth"),
  C("add9", "Add 9", "Sixths & added tones", "add9", [0, 4, 7, 14], "Major triad with ninth"),
  C("madd9", "Minor add 9", "Sixths & added tones", "madd9", [0, 3, 7, 14], "Minor triad with ninth"),
  C("add11", "Add 11", "Sixths & added tones", "add11", [0, 4, 7, 17], "Major triad with eleventh"),
  C("madd11", "Minor add 11", "Sixths & added tones", "madd11", [0, 3, 7, 17], "Minor triad with eleventh"),
  C("Maj7", "Major 7", "Seventh chords", "maj7", [0, 4, 7, 11], "Major seventh"),
  C("Min7", "Minor 7", "Seventh chords", "m7", [0, 3, 7, 10], "Minor seventh"),
  C("Dom7", "Dominant 7", "Seventh chords", "7", [0, 4, 7, 10], "Dominant seventh"),
  C("dim7", "Diminished 7", "Seventh chords", "dim7", [0, 3, 6, 9], "Fully diminished seventh"),
  C("m7b5", "Half-diminished 7", "Seventh chords", "m7b5", [0, 3, 6, 10], "Minor seven flat five"),
  C("mMaj7", "Minor-major 7", "Seventh chords", "mMaj7", [0, 3, 7, 11], "Minor triad and major seventh"),
  C("aug7", "Augmented 7", "Seventh chords", "aug7", [0, 4, 8, 10], "Dominant with sharp fifth"),
  C("7sus4", "7 suspended 4", "Seventh chords", "7sus4", [0, 5, 7, 10], "Suspended dominant seventh"),
  C("maj9", "Major 9", "Extended & altered", "maj9", [0, 4, 7, 11, 14], "Major ninth"),
  C("m9", "Minor 9", "Extended & altered", "m9", [0, 3, 7, 10, 14], "Minor ninth"),
  C("9", "Dominant 9", "Extended & altered", "9", [0, 4, 7, 10, 14], "Dominant ninth"),
  C("11", "Dominant 11", "Extended & altered", "11", [0, 4, 7, 10, 14, 17], "Dominant eleventh"),
  C("m11", "Minor 11", "Extended & altered", "m11", [0, 3, 7, 10, 14, 17], "Minor eleventh"),
  C("13", "Dominant 13", "Extended & altered", "13", [0, 4, 7, 10, 14, 17, 21], "Dominant thirteenth"),
  C("maj13", "Major 13", "Extended & altered", "maj13", [0, 4, 7, 11, 14, 17, 21], "Major thirteenth"),
  C("m13", "Minor 13", "Extended & altered", "m13", [0, 3, 7, 10, 14, 17, 21], "Minor thirteenth"),
  C("7b5", "Dominant 7 flat 5", "Extended & altered", "7b5", [0, 4, 6, 10], "Flattened fifth"),
  C("7#5", "Dominant 7 sharp 5", "Extended & altered", "7#5", [0, 4, 8, 10], "Raised fifth"),
  C("7b9", "Dominant 7 flat 9", "Extended & altered", "7b9", [0, 4, 7, 10, 13], "Flat ninth tension"),
  C("7#9", "Dominant 7 sharp 9", "Extended & altered", "7#9", [0, 4, 7, 10, 15], "Sharp ninth tension"),
  C("7#11", "Dominant 7 sharp 11", "Extended & altered", "7#11", [0, 4, 7, 10, 14, 18], "Raised eleventh"),
  C("9sus4", "9 suspended 4", "Extended & altered", "9sus4", [0, 5, 7, 10, 14], "Suspended ninth"),
  C("13sus4", "13 suspended 4", "Extended & altered", "13sus4", [0, 5, 7, 10, 14, 21], "Suspended thirteenth"),
];

export const SCALE_PRESETS: readonly ScaleStampPreset[] = [
  S("Major Scale", "Major scale", [0, 2, 4, 5, 7, 9, 11], "Ionian"),
  S("Minor Scale", "Natural minor", [0, 2, 3, 5, 7, 8, 10], "Aeolian"),
  S("Harmonic Minor", "Harmonic minor", [0, 2, 3, 5, 7, 8, 11], "Raised seventh"),
  S("Melodic Minor", "Melodic minor", [0, 2, 3, 5, 7, 9, 11], "Ascending melodic minor"),
  S("Pentatonic Maj", "Major pentatonic", [0, 2, 4, 7, 9], "Five-note major"),
  S("Pentatonic Min", "Minor pentatonic", [0, 3, 5, 7, 10], "Five-note minor"),
  S("Blues", "Minor blues", [0, 3, 5, 6, 7, 10], "Minor pentatonic with blue note"),
  S("Dorian", "Dorian", [0, 2, 3, 5, 7, 9, 10], "Minor with natural sixth"),
  S("Phrygian", "Phrygian", [0, 1, 3, 5, 7, 8, 10], "Minor with flat second"),
  S("Lydian", "Lydian", [0, 2, 4, 6, 7, 9, 11], "Major with sharp fourth"),
  S("Mixolydian", "Mixolydian", [0, 2, 4, 5, 7, 9, 10], "Major with flat seventh"),
  S("Locrian", "Locrian", [0, 1, 3, 5, 6, 8, 10], "Half-diminished mode"),
  S("Whole Tone", "Whole tone", [0, 2, 4, 6, 8, 10], "Symmetric six-note scale"),
  S("Diminished Scale", "Octatonic", [0, 2, 3, 5, 6, 8, 9, 11], "Whole-half diminished"),
];

