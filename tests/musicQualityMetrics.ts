import { Chord, Note, Scale } from "@tonaljs/tonal";
import type { ChordEvent, NoteEvent, ProgressionData } from "../src/lib/theory";
import { getScaleChromas } from "../src/lib/theory";
import { trackIndexOf } from "../src/lib/tracks";

export type ChordPath = Pick<ChordEvent, "name" | "timeStart" | "duration">[];

const pc = (midi: number): number => ((midi % 12) + 12) % 12;
const overlap = (a: number, b: number, c: number, d: number): number =>
  Math.max(0, Math.min(b, d) - Math.max(a, c));
const beatAccent = (start: number): number => {
  const beat = ((start % 4) + 4) % 4;
  return beat < 0.0625 ? 1.35 : Math.abs(beat - 2) < 0.0625 ? 1.15 : 1;
};

/** Duration/attack-weighted fraction of melody pitch-time matching chord tones.
 * This measures literal note membership, NOT suspension quality or musicality. */
export function chordToneCoverage(
  melody: readonly NoteEvent[], chords: readonly ChordPath[number][],
): number {
  const total = melody.reduce((sum, note) =>
    sum + note.duration * beatAccent(note.timeStart) *
      (0.7 + 0.3 * note.velocity), 0);
  if (total <= 0) return 0;
  let supported = 0;
  for (const note of melody) {
    const weight = beatAccent(note.timeStart) * (0.7 + 0.3 * note.velocity);
    for (const chord of chords) {
      const chordNotes = Chord.get(chord.name).notes;
      if (!chordNotes.some(name => Note.chroma(name) === pc(note.midi))) continue;
      const duration = overlap(note.timeStart, note.timeStart + note.duration,
        chord.timeStart, chord.timeStart + chord.duration);
      supported += duration * weight;
    }
  }
  return Math.min(1, supported / total);
}

/** A note counts as a register clash when it plays within two semitones
 * of the lead in the same timeframe. This is a masking diagnostic, not
 * proof that close intervals are musically wrong. */
export function nearLeadCollision(
  lead: readonly NoteEvent[], backing: readonly NoteEvent[],
): number {
  const duration = backing.reduce((sum, note) => sum + note.duration, 0);
  if (duration <= 0) return 0;
  let collision = 0;
  for (const note of backing) {
    let max = 0;
    for (const source of lead) {
      if (Math.abs(source.midi - note.midi) > 2) continue;
      max = Math.max(max, overlap(note.timeStart, note.timeStart + note.duration,
        source.timeStart, source.timeStart + source.duration));
    }
    collision += max;
  }
  return Math.min(1, collision / duration);
}

/** The frequency of generated events sustaining beyond their assigned chord
 * window, expressed as a fraction of all generated notes. */
export function chordTailSpill(
  generated: readonly NoteEvent[], chordPath: readonly ChordPath[number][],
): number {
  if (!generated.length) return 0;
  let spills = 0;
  for (const note of generated) {
    const current = chordPath.find(chord =>
      note.timeStart >= chord.timeStart - 1e-8 &&
      note.timeStart < chord.timeStart + chord.duration - 1e-8);
    if (!current || note.timeStart + note.duration > current.timeStart + current.duration + 1e-7) {
      spills += 1;
    }
  }
  return spills / generated.length;
}

export function pitchClassEntropy(notes: readonly NoteEvent[]): number {
  if (!notes.length) return 0;
  const bins = new Array<number>(12).fill(0);
  for (const note of notes) bins[pc(note.midi)] += 1;
  return -bins.filter(value => value > 0)
    .reduce((sum, count) => {
      const p = count / notes.length;
      return sum + p * Math.log2(p);
    }, 0);
}

export function scaleToneRate(notes: readonly NoteEvent[], root: string, mode: "major" | "minor"): number {
  if (!notes.length) return 0;
  const scale = getScaleChromas(root, mode);
  return notes.filter(note => scale.has(pc(note.midi))).length / notes.length;
}

export function chordChangeRate(chords: readonly ChordPath[number][], bars: number): number {
  if (!chords.length || bars <= 0) return 0;
  const sorted = [...chords].sort((a, b) => a.timeStart - b.timeStart);
  const count = sorted.slice(1).filter((chord, i) => chord.name !== sorted[i].name).length;
  return count / bars;
}

export function fullIdentityPreserved(
  input: ProgressionData, output: ProgressionData, trackIndex = 0,
): boolean {
  const source = input.notes.filter(note => trackIndexOf(note) === trackIndex);
  const emitted = output.notes.filter(note => trackIndexOf(note) === trackIndex);
  return source.length === emitted.length &&
    source.every((note, i) => JSON.stringify(note) === JSON.stringify(emitted[i]));
}

/** Normalized variety of accompaniment outputs, not melodic quality. */
export function uniqueRenderRate(outputs: readonly NoteEvent[][]): number {
  if (outputs.length === 0) return 0;
  return new Set(outputs.map(notes => notes.map(note =>
    [note.midi, note.timeStart, note.duration, note.velocity, trackIndexOf(note)].join(":")).join(";"))).size /
    outputs.length;
}

export function meanIntervalMagnitude(notes: readonly NoteEvent[]): number {
  if (notes.length < 2) return 0;
  const ordered = [...notes].sort((a, b) => a.timeStart - b.timeStart || b.midi - a.midi);
  let total = 0;
  for (let i = 1; i < ordered.length; i++) total += Math.abs(ordered[i].midi - ordered[i - 1].midi);
  return total / (ordered.length - 1);
}

/** Deliberately weak, transparent, original-code baselines. Both use only
 * diatonic triads; comparing them with a broader chord vocabulary is
 * descriptive rather than a statistically controlled model bake-off. */
export function baselineTonic(root: string, mode: "major" | "minor", bars: number): ChordPath {
  const name = root + (mode === "minor" ? "m" : "");
  return Array.from({ length: bars }, (_, bar) =>
    ({ name, timeStart: bar * 4, duration: 4 }));
}

export function baselineGreedyTriads(
  melody: readonly NoteEvent[], root: string, mode: "major" | "minor", bars: number,
): ChordPath {
  const notes = Scale.get(root + " " + mode).notes;
  const colors = notes.map((tonic, degree) => {
    const base = Note.chroma(tonic) ?? 0;
    const third = ((Note.chroma(notes[(degree + 2) % 7]) ?? 0) - base + 12) % 12;
    const fifth = ((Note.chroma(notes[(degree + 4) % 7]) ?? 0) - base + 12) % 12;
    const suffix = third === 3 && fifth === 6 ? "dim"
      : third === 3 ? "m" : third === 4 && fifth === 8 ? "aug" : "";
    return tonic + suffix;
  });
  return Array.from({ length: bars }, (_, bar) => {
    const start = bar * 4;
    const window = melody.flatMap(note => {
      const duration = overlap(note.timeStart, note.timeStart + note.duration, start, start + 4);
      return duration > 0 ? [{ ...note, timeStart: Math.max(start, note.timeStart), duration }] : [];
    });
    let best = colors[0], bestScore = -Infinity;
    for (const name of colors) {
      const trial = chordToneCoverage(window, [{ name, timeStart: start, duration: 4 }]);
      if (trial > bestScore) { best = name; bestScore = trial; }
    }
    return { name: best, timeStart: start, duration: 4 };
  });
}

export function percentile(sorted: readonly number[], pct: number): number {
  if (!sorted.length) return 0;
  const p = Math.min(1, Math.max(0, pct)) * (sorted.length - 1);
  const i = Math.floor(p);
  return sorted[i] + (sorted[Math.min(i + 1, sorted.length - 1)] - sorted[i]) * (p - i);
}

export function mean(values: readonly number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}
