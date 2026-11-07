import { ROOT_NOTES, clamp } from "./constants";
import type { ProgressionData } from "./theory";

export type KeyMode = "major" | "minor";
export interface KeyCandidate {
  root: string;
  mode: KeyMode;
  /** Relative profile match; not a calibrated probability. */
  score: number;
}
export interface KeyAnalysis {
  best: KeyCandidate;
  alternatives: KeyCandidate[];
  /** Relative margin-based signal from 0 to 1, NOT probability of correctness. */
  confidence: number;
  ambiguous: boolean;
  margin: number;
}

/** Krumhansl–Kessler pitch-class probe-tone profiles, C tonic at index 0.
 * See Krumhansl (1990) and Temperley (1999); rotated for all 12 keys. */
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function pearson(a: readonly number[], b: readonly number[]): number {
  const meanA = a.reduce((sum, value) => sum + value, 0) / a.length;
  const meanB = b.reduce((sum, value) => sum + value, 0) / b.length;
  let covariance = 0, varianceA = 0, varianceB = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] - meanA, y = b[i] - meanB;
    covariance += x * y;
    varianceA += x * x;
    varianceB += y * y;
  }
  const denominator = Math.sqrt(varianceA * varianceB);
  return denominator > 0 ? covariance / denominator : 0;
}

function chroma(midi: number): number {
  return ((Math.round(midi) % 12) + 12) % 12;
}

/** Rank 24 tonal centers by distribution, weighted by duration, accent and
 * weak tonic/cadence evidence. Sparse or relative-key ties stay ambiguous. */
export function analyzeKeyFromProgression(progression: ProgressionData): KeyAnalysis {
  const notes = progression.notes.filter(note =>
    Number.isInteger(note.midi) && note.midi >= 0 && note.midi <= 127 &&
    Number.isFinite(note.timeStart) && note.timeStart >= 0 &&
    Number.isFinite(note.duration) && note.duration > 0,
  );
  const counts = Array<number>(12).fill(0);
  for (const note of notes) {
    // Avoid a single sustained pad masking every other voice in a multitrack
    // input, and give structurally accented beats slightly more weight.
    const duration = Math.min(4, note.duration);
    const beat = ((note.timeStart % 4) + 4) % 4;
    const accent = Math.abs(beat) < 0.075 || Math.abs(beat - 4) < 0.075
      ? 1.18 : Math.abs(beat - Math.round(beat)) < 0.075 ? 1.06 : 1;
    const velocity = 0.75 + 0.25 * clamp(note.velocity, 0, 1);
    counts[chroma(note.midi)] += duration * velocity * accent;
  }
  const total = counts.reduce((sum, weight) => sum + weight, 0);
  const earliest = notes.length ? Math.min(...notes.map(note => note.timeStart)) : 0;
  const latest = notes.length ? Math.max(...notes.map(note => note.timeStart)) : 0;
  const bassAt = (time: number) => {
    const simultaneous = notes.filter(note => Math.abs(note.timeStart - time) < 0.115);
    if (simultaneous.length === 0) return null;
    return chroma(simultaneous.reduce((lowest, note) => note.midi < lowest.midi ? note : lowest).midi);
  };
  const firstBass = bassAt(earliest);
  const lastBass = bassAt(latest);

  const candidates: KeyCandidate[] = [];
  for (let tonic = 0; tonic < 12; tonic++) {
    for (const mode of ["major", "minor"] as const) {
      const profile = mode === "major" ? MAJOR_PROFILE : MINOR_PROFILE;
      const shifted = Array.from({ length: 12 }, (_, pitch) => profile[(pitch - tonic + 12) % 12]);
      const distribution = pearson(counts, shifted);
      const tonicShare = total > 0 ? counts[tonic] / total : 0;
      const score = distribution + 0.12 * tonicShare +
        (firstBass === tonic ? 0.045 : 0) +
        (lastBass === tonic ? 0.065 : 0);
      candidates.push({ root: ROOT_NOTES[tonic], mode, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const margin = total > 0 ? best.score - candidates[1].score : 0;
  const activePitchClasses = counts.filter(value => value > 0).length;
  const ambiguous = notes.length < 5 || activePitchClasses < 4 ||
    margin < 0.09 || best.score < 0.35;
  // A good match can still be wrong on non-tonal music. Do not label this
  // heuristic as a probability or hide the next-best tonal center.
  const confidence = ambiguous ? Math.min(0.45, clamp((margin - 0.02) / 0.30, 0, 1)) :
    clamp((margin - 0.02) / 0.30, 0, 1);
  return {
    best, alternatives: candidates.slice(1, 4),
    confidence, ambiguous, margin,
  };
}
