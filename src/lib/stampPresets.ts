import { Note } from "@tonaljs/tonal";
import { MAX_PROJECT_BEATS, MAX_PROJECT_NOTES } from "./constants";
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
  C("maj7#11", "Major 7 sharp 11", "Extended & altered", "maj7#11", [0, 4, 7, 11, 18], "Lydian major seventh"),
  C("madd4", "Minor add 4/11", "Sixths & added tones", "madd4", [0, 3, 7, 17], "Minor triad with upper fourth/eleventh"),
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
  C("11", "Dominant 11", "Extended & altered", "11", [0, 7, 10, 14, 17], "Dominant eleventh (third omitted)"),
  C("m11", "Minor 11", "Extended & altered", "m11", [0, 3, 7, 10, 14, 17], "Minor eleventh"),
  C("13", "Dominant 13", "Extended & altered", "13", [0, 4, 7, 10, 14, 21], "Dominant thirteenth (eleventh omitted)"),
  C("maj13", "Major 13", "Extended & altered", "maj13", [0, 4, 7, 11, 14, 21], "Major thirteenth (eleventh omitted)"),
  C("m13", "Minor 13", "Extended & altered", "m13", [0, 3, 7, 10, 14, 21], "Minor thirteenth (eleventh omitted)"),
  C("7b5", "Dominant 7 flat 5", "Extended & altered", "7b5", [0, 4, 6, 10], "Flattened fifth"),
  C("7#5", "Dominant 7 sharp 5", "Extended & altered", "7#5", [0, 4, 8, 10], "Raised fifth"),
  C("7b9", "Dominant 7 flat 9", "Extended & altered", "7b9", [0, 4, 7, 10, 13], "Flat ninth tension"),
  C("7#9", "Dominant 7 sharp 9", "Extended & altered", "7#9", [0, 4, 7, 10, 15], "Sharp ninth tension"),
  C("7#11", "Dominant 7 sharp 11", "Extended & altered", "7#11", [0, 4, 7, 10, 18], "Raised eleventh"),
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

/** Major/minor spellings are intentional. In particular minor V is MAJOR,
 * and ♭III / ♭VI / ♭VII never inherit a major-key natural degree. */
export const PROGRESSION_PRESETS: readonly ProgressionStampPreset[] = [
  P("pop-anthem", "Four-chord pop", "Major progressions", "I – V – vi – IV",
    [[0,"Major"],[7,"Major"],[9,"Minor"],[5,"Major"]], "Pop / rock • 4 bars"),
  P("pop-lift", "Pop lift", "Major progressions", "vi – IV – I – V",
    [[9,"Minor"],[5,"Major"],[0,"Major"],[7,"Major"]], "Uplifting pop • 4 bars"),
  P("doo-wop", "Doo-wop turnaround", "Major progressions", "I – vi – IV – V",
    [[0,"Major"],[9,"Minor"],[5,"Major"],[7,"Major"]], "1950s pop • 4 bars"),
  P("classic-rock", "Classic rock", "Major progressions", "I – IV – V – IV",
    [[0,"Major"],[5,"Major"],[7,"Major"],[5,"Major"]], "Guitar rock • 4 bars"),
  P("plagal", "Plagal cadence", "Major progressions", "I – IV – I",
    [[0,"Major"],[5,"Major"],[0,"Major"]], "Amen cadence • 3 bars"),
  P("authentic", "Authentic cadence", "Major progressions", "I – IV – V – I",
    [[0,"Major"],[5,"Major"],[7,"Major"],[0,"Major"]], "Classic tonic resolution • 4 bars"),
  P("royal-road", "Royal road", "Major progressions", "IVmaj7 – V7 – iii7 – vi7",
    [[5,"Maj7"],[7,"Dom7"],[4,"Min7"],[9,"Min7"]], "Japanese pop / R&B • 4 bars"),
  P("canon", "Canon sequence", "Major progressions", "I – V – vi – iii – IV – I – IV – V",
    [[0,"Major"],[7,"Major"],[9,"Minor"],[4,"Minor"],[5,"Major"],[0,"Major"],[5,"Major"],[7,"Major"]], "Classical cycle • 8 bars"),
  P("backdoor", "Backdoor resolution", "Major progressions", "iv7 – ♭VII7 – Imaj7",
    [[5,"Min7"],[10,"Dom7"],[0,"Maj7"]], "Soul / jazz cadence • 3 bars"),
  P("mixolydian", "Mixolydian rock", "Major progressions", "I – ♭VII – IV – I",
    [[0,"Major"],[10,"Major"],[5,"Major"],[0,"Major"]], "Modal rock • 4 bars"),

  P("minor-pop", "Minor pop", "Minor progressions", "i – ♭VI – ♭III – ♭VII",
    [[0,"Minor"],[8,"Major"],[3,"Major"],[10,"Major"]], "Modern minor pop • 4 bars"),
  P("andalusian", "Andalusian cadence", "Minor progressions", "i – ♭VII – ♭VI – V",
    [[0,"Minor"],[10,"Major"],[8,"Major"],[7,"Major"]], "Flamenco / cinematic • 4 bars"),
  P("minor-cadence", "Minor authentic cadence", "Minor progressions", "i – iv – V – i",
    [[0,"Minor"],[5,"Minor"],[7,"Major"],[0,"Minor"]], "Harmonic minor dominant • 4 bars"),
  P("minor-cinema", "Cinematic minor", "Minor progressions", "i – ♭VI – iv – V",
    [[0,"Minor"],[8,"Major"],[5,"Minor"],[7,"Major"]], "Dramatic minor • 4 bars"),
  P("minor-hero", "Minor heroic", "Minor progressions", "i – ♭VI – ♭VII – i",
    [[0,"Minor"],[8,"Major"],[10,"Major"],[0,"Minor"]], "Epic minor cadence • 4 bars"),
  P("minor-lift", "Minor rise", "Minor progressions", "i – ♭III – iv – V",
    [[0,"Minor"],[3,"Major"],[5,"Minor"],[7,"Major"]], "Ascending tension • 4 bars"),
  P("minor-landing", "Minor landing", "Minor progressions", "♭VI – ♭VII – i – i",
    [[8,"Major"],[10,"Major"],[0,"Minor"],[0,"Minor"]], "Aeolian rise • 4 bars"),

  P("two-five-one", "Jazz ii–V–I", "Jazz & blues progressions", "ii7 – V7 – Imaj7",
    [[2,"Min7",2],[7,"Dom7",2],[0,"Maj7",4]], "Jazz cadence • 2 bars"),
  P("jazz-turnaround", "Jazz turnaround", "Jazz & blues progressions", "Imaj7 – vi7 – ii7 – V7",
    [[0,"Maj7"],[9,"Min7"],[2,"Min7"],[7,"Dom7"]], "Jazz / standards • 4 bars"),
  P("jazz-1625", "Jazz 1–6–2–5", "Jazz & blues progressions", "Imaj7 – VI7 – ii7 – V7",
    [[0,"Maj7"],[9,"Dom7"],[2,"Min7"],[7,"Dom7"]], "Secondary dominant • 4 bars"),
  P("jazz-cycle", "Circle of fifths", "Jazz & blues progressions", "iii7 – vi7 – ii7 – V7 – Imaj7",
    [[4,"Min7"],[9,"Min7"],[2,"Min7"],[7,"Dom7"],[0,"Maj7"]], "Functional sequence • 5 bars"),
  P("minor-two-five-one", "Minor ii–V–i", "Jazz & blues progressions", "iiø7 – V7♭9 – i",
    [[2,"m7b5",2],[7,"7b9",2],[0,"Minor",4]], "Minor jazz cadence • 2 bars"),
  P("twelve-bar-blues", "12-bar blues", "Jazz & blues progressions", "I7 ×4 – IV7 ×2 – I7 ×2 – V7 – IV7 – I7 – V7",
    [[0,"Dom7"],[0,"Dom7"],[0,"Dom7"],[0,"Dom7"],[5,"Dom7"],[5,"Dom7"],[0,"Dom7"],[0,"Dom7"],[7,"Dom7"],[5,"Dom7"],[0,"Dom7"],[7,"Dom7"]], "Traditional blues • 12 bars"),
  P("minor-blues", "Minor 12-bar blues", "Jazz & blues progressions", "i7 ×4 – iv7 ×2 – i7 ×2 – ♭VI7 – V7 – i7 – V7",
    [[0,"Min7"],[0,"Min7"],[0,"Min7"],[0,"Min7"],[5,"Min7"],[5,"Min7"],[0,"Min7"],[0,"Min7"],[8,"Dom7"],[7,"Dom7"],[0,"Min7"],[7,"Dom7"]], "Minor blues • 12 bars"),
];

export const STAMP_PRESETS: readonly StampPreset[] = [
  ...CHORD_PRESETS, ...PROGRESSION_PRESETS, ...SCALE_PRESETS,
];
const byId = new Map(STAMP_PRESETS.map(preset => [preset.id, preset]));
const chordById = new Map(CHORD_PRESETS.map(preset => [preset.id, preset]));

/** Compatibility for existing imports; this catalog is the single source of truth. */
export const CHORD_STAMPS: Record<string, number[]> = Object.fromEntries(
  CHORD_PRESETS.map(preset => [preset.id, [...preset.intervals]]));
export const SCALE_STAMPS: Record<string, number[]> = Object.fromEntries(
  SCALE_PRESETS.map(preset => [preset.id, [...preset.intervals]]));

export function getStampPreset(id: string): StampPreset | undefined {
  return byId.get(id);
}
export function searchStampPresets(query: string): StampPreset[] {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return [...STAMP_PRESETS];
  return STAMP_PRESETS.filter(preset => {
    const text = [preset.label, preset.id, preset.group, preset.description,
      preset.kind === "progression" ? preset.formula : ""].join(" ").toLocaleLowerCase();
    return terms.every(term => text.includes(term));
  });
}
export function stampDuration(preset: StampPreset, noteLength: number): number {
  if (preset.kind === "scale") return 1 / 64;
  if (preset.kind === "chord") return noteLength;
  return preset.steps.reduce((total, step) => total + (step[2] ?? 4), 0);
}

export interface StampPlacement {
  progression: ProgressionData;
  addedNotes: NoteEvent[];
  addedChords: ChordEvent[];
}

/** Retain every chord tone even when the clicked root is at the MIDI extremes. */
function withinMidi(notes: number[]): number[] {
  let shift = 0;
  const low = Math.min(...notes);
  const high = Math.max(...notes);
  while (low + shift < 0) shift += 12;
  while (high + shift > 127) shift -= 12;
  return notes.map(pitch => pitch + shift);
}

/** The clicked piano row is the tonic; other degree roots stay near its octave. */
function degreeRoot(tonic: number, degree: number): number {
  return tonic + ((degree + 6) % 12 + 12) % 12 - 6;
}

/** Smooth sequential inversions without dropping tones or crossing voices. */
function voiceChord(rootMidi: number, intervals: readonly number[], previous: readonly number[] | null): number[] {
  const rootPosition = withinMidi(intervals.map(interval => rootMidi + interval));
  if (!previous || intervals.length < 3) return rootPosition;
  const pitchClasses = [...new Set(intervals.map(i => ((i % 12) + 12) % 12))].sort((a, b) => a - b);
  if (pitchClasses.length !== intervals.length) return rootPosition;

  let best = rootPosition;
  let bestScore = Number.POSITIVE_INFINITY;
  const reference = [...previous].sort((a, b) => a - b);
  for (let inversion = 0; inversion < pitchClasses.length; inversion++) {
    const rotated = [...pitchClasses.slice(inversion), ...pitchClasses.slice(0, inversion).map(i => i + 12)];
    for (const octave of [-24, -12, 0, 12, 24]) {
      const notes = rotated.map(interval => rootMidi + interval + octave);
      if (notes.some(pitch => pitch < 0 || pitch > 127)) continue;
      const movement = notes.reduce((cost, pitch, index) => {
        const targetIndex = notes.length === 1 ? 0
          : Math.round(index * (reference.length - 1) / (notes.length - 1));
        return cost + Math.abs(pitch - reference[targetIndex]);
      }, 0);
      const registerPenalty = notes.reduce((cost, pitch) => cost + Math.abs(pitch - rootMidi), 0) * 0.08;
      const score = movement + registerPenalty;
      if (score < bestScore) { best = notes; bestScore = score; }
    }
  }
  return best;
}

function symbol(rootMidi: number, suffix: string): string {
  const tonic = Note.fromMidi(((rootMidi % 12) + 12) % 12 + 60);
  return (tonic?.replace(/-?\d+$/, "") ?? "C") + suffix;
}

/** Voice just the incoming notes and labels. A pointer preview does not copy the open score. */
export function previewStamp(
  id: string, midi: number, timeStart: number, noteLength: number, trackIndex: number, existingNoteCount: number,
) {
  const preset = getStampPreset(id);
  if (!preset || !Number.isInteger(midi) || midi < 0 || midi > 127 ||
      !Number.isFinite(timeStart) || timeStart < 0 ||
      !Number.isFinite(noteLength) || noteLength <= 0 || noteLength > 16 ||
      !Number.isInteger(trackIndex) || trackIndex < 0) return null;
  const duration = stampDuration(preset, noteLength);
  if (duration <= 0 || timeStart + duration > MAX_PROJECT_BEATS + 1e-8) return null;

  const addedNotes: NoteEvent[] = [];
  const addedChords: ChordEvent[] = [];
  const append = (rootMidi: number, quality: ChordStampPreset, start: number,
    quarters: number, previous: readonly number[] | null): number[] => {
    const pitches = voiceChord(rootMidi, quality.intervals, previous);
    for (const pitch of pitches) {
      addedNotes.push({
        midi: pitch, name: Note.fromMidi(pitch) || "C4", timeStart: start,
        duration: quarters, velocity: 0.8, trackIndex,
      });
    }
    addedChords.push({ name: symbol(rootMidi, quality.suffix), timeStart: start, duration: quarters });
    return pitches;
  };

  if (preset.kind === "chord") {
    append(midi, preset, timeStart, noteLength, null);
  } else if (preset.kind === "scale") {
    const pitches = withinMidi(preset.intervals.map(interval => midi + interval));
    for (const pitch of pitches) {
      addedNotes.push({
        midi: pitch, name: Note.fromMidi(pitch) || "C4", timeStart,
        duration: 1 / 64, velocity: 0.1, trackIndex,
      });
    }
  } else {
    let start = timeStart;
    let previous: number[] | null = null;
    for (const [degree, qualityId, quarters = 4] of preset.steps) {
      const quality = chordById.get(qualityId);
      if (!quality || !Number.isFinite(quarters) || quarters <= 0) return null;
      previous = append(degreeRoot(midi, degree), quality, start, quarters, previous);
      start += quarters;
    }
  }
  if (!addedNotes.length || existingNoteCount + addedNotes.length > MAX_PROJECT_NOTES) return null;
  return { addedNotes, addedChords, end: timeStart + duration };
}

/** One undoable, non-destructive edit. New chord labels replace overlapping
 * user-authored labels only; generated/locked regions and notes are preserved.
 * Hard bounds match project-file limits and prevent corrupt MIDI or autosaves. */
export function placeStamp(
  data: ProgressionData, id: string, midi: number, timeStart: number,
  noteLength: number, trackIndex: number,
): StampPlacement | null {
  const preview = previewStamp(id, midi, timeStart, noteLength, trackIndex, data.notes.length);
  if (!preview) return null;
  const { addedNotes, addedChords, end } = preview;
  const survivingChords = data.chords.flatMap(chord => {
    if (!addedChords.length || chord.generatedSourceTrackIndex !== undefined ||
        chord.timeStart >= end || chord.timeStart + chord.duration <= timeStart) return [chord];
    const pieces: ChordEvent[] = [];
    if (chord.timeStart < timeStart) pieces.push({ ...chord, duration: timeStart - chord.timeStart });
    const priorEnd = chord.timeStart + chord.duration;
    if (priorEnd > end) pieces.push({ ...chord, timeStart: end, duration: priorEnd - end });
    return pieces;
  });
  const chords = [...survivingChords, ...addedChords].sort(
    (a, b) => a.timeStart - b.timeStart || a.duration - b.duration);
  if (chords.length > 8192) return null;

  return {
    progression: {
      ...data, notes: [...data.notes, ...addedNotes], chords,
      totalBars: Math.max(data.totalBars, Math.ceil(end / 4), 1),
    },
    addedNotes, addedChords,
  };
}
