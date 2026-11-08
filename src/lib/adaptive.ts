import { Chord, Note, Scale } from "@tonaljs/tonal";
import { MAJOR_INTERVALS, MINOR_INTERVALS, type NoteEvent, type ProgressionData, type TrackMetadata } from "./theory";
import { analyzeKeyFromProgression } from "./keyAnalysis";
import { addTrack } from "./trackOperations";
import { trackIndexOf } from "./tracks";
import type { RandomSource } from "./random";

export type AccompanimentDensity = "sparse" | "balanced" | "active";
export type MelodyKeyStrategy = "manual" | "detect";
/** Harmonic pacing uses existing 4/4 quarter-note timing. */
export type HarmonicPacing = "bar" | "adaptive" | "half-bar";

export interface MelodyGenerationOptions {
  sourceTrackIndex: number;
  root: string;
  mode: "major" | "minor";
  tension: number;
  /** How strictly accompaniment chords should fit important melody tones. */
  harmonicFit: number;
  density: AccompanimentDensity;
  keyStrategy: MelodyKeyStrategy;
  /** Optional for backwards compatibility with existing callers. */
  harmonicPacing?: HarmonicPacing;
}

export type MelodyGenerationResult =
  | { ok: true; progression: ProgressionData; root: string; mode: "major" | "minor";
      keyWasAmbiguous: boolean; usedDetectedKey: boolean; generatedTrackIndices: number[] }
  | { ok: false; reason: string };

interface ChordCandidate {
  name: string;
  rootPc: number;
  pitchClasses: number[];
  degree: number;
  borrowed: boolean;
  seventh: boolean;
}

interface WeightedNote {
  midi: number;
  weight: number;
}

interface HarmonicRegion {
  timeStart: number;
  duration: number;
  notes: WeightedNote[];
}

const positiveMod = (x: number, n: number) => ((x % n) + n) % n;
const pc = (pitch: number) => positiveMod(pitch, 12);
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const toName = (midi: number) => Note.fromMidi(midi) ?? "C4";

export function isAdaptiveTrack(track: TrackMetadata): boolean {
  return (track.generatedRole === "bass" || track.generatedRole === "harmony" ||
    track.generatedRole === "continuation" || track.generatedRole === "variation") &&
    Number.isInteger(track.sourceTrackIndex) && (track.sourceTrackIndex ?? -1) >= 0;
}

function chordCandidates(root: string, mode: "major" | "minor", tension: number): ChordCandidate[] {
  const tonic = Note.chroma(root);
  if (tonic === undefined || tonic === null) return [];
  const intervals = mode === "major" ? MAJOR_INTERVALS : MINOR_INTERVALS;
  const scale = intervals.map(interval => positiveMod(tonic + interval, 12));
  const spelled = Scale.get(root + " " + mode).notes;
  const names = scale.map((pitchClass, i) => spelled[i] || toName(60 + pitchClass).replace(/[0-9]/g, ""));
  const candidates: ChordCandidate[] = [];
  const seen = new Set<string>();

  const add = (name: string, degree: number, borrowed = false, seventh = false) => {
    const chord = Chord.get(name);
    if (chord.empty || seen.has(chord.symbol)) return;
    const pitchClasses = [...new Set(chord.notes.map(note => Note.chroma(note)).filter((n): n is number => n !== null && n !== undefined))];
    if (pitchClasses.length < 3) return;
    seen.add(chord.symbol);
    candidates.push({
      name: chord.symbol || name, rootPc: pc(chord.tonic ? (Note.chroma(chord.tonic) ?? 0) : 0),
      pitchClasses, degree, borrowed, seventh,
    });
  };

  for (let i = 0; i < 7; i++) {
    const third = positiveMod(scale[(i + 2) % 7] - scale[i], 12);
    const fifth = positiveMod(scale[(i + 4) % 7] - scale[i], 12);
    const seventh = positiveMod(scale[(i + 6) % 7] - scale[i], 12);
    const quality = third === 3 && fifth === 6 ? "dim"
      : third === 3 ? "m" : third === 4 && fifth === 8 ? "aug" : "";
    add(names[i] + quality, i);
    if (tension >= 20) {
      const suffix = quality === "dim" && seventh === 10 ? "m7b5"
        : quality === "dim" && seventh === 9 ? "dim7"
        : quality === "m" && seventh === 10 ? "m7"
        : quality === "m" && seventh === 11 ? "mMaj7"
        : quality === "" && seventh === 11 ? "maj7"
        : quality === "" && seventh === 10 ? "7" : "";
      if (suffix) add(names[i] + suffix, i, false, true);
    }
  }

  // Minor V is a genuine functional dominant, not just the natural-minor v.
  if (mode === "minor") {
    add(names[4], 4, true);
    if (tension >= 20) add(names[4] + "7", 4, true, true);
  }
  // Modal mixture is a possibility, never a forced replacement for melody fit.
  if (tension >= 65 && mode === "major") {
    add(names[3] + "m", 3, true);
    const flatSeven = toName(60 + pc(tonic + 10)).replace(/[0-9]/g, "");
    add(flatSeven, 6, true);
  }
  return candidates;
}

/** Weight notes independently within each harmonic window. Sustains contribute
 * to both adjacent windows; only local passing tones are down-weighted. */
function melodyWindows(notes: readonly NoteEvent[], bars: number, divisions: 1 | 2 = 1): WeightedNote[][] {
  const windowDuration = 4 / divisions;
  const sorted = [...notes].sort((a, b) => a.timeStart - b.timeStart || a.midi - b.midi);
  const result: WeightedNote[][] = Array.from({ length: bars * divisions }, () => []);
  for (let i = 0; i < sorted.length; i++) {
    const note = sorted[i];
    const first = Math.floor(note.timeStart / windowDuration);
    const last = Math.ceil((note.timeStart + note.duration) / windowDuration);
    const prev = sorted[i - 1], next = sorted[i + 1];
    // Passing-note detection requires sequential stepwise motion, not merely
    // three adjacent pitch classes in a simultaneous chord.
    const passing = note.duration <= 0.5 && prev !== undefined && next !== undefined &&
      prev.timeStart < note.timeStart && note.timeStart < next.timeStart &&
      Math.abs(prev.midi - note.midi) <= 2 && Math.abs(next.midi - note.midi) <= 2 &&
      (note.midi - prev.midi) * (next.midi - note.midi) > 0;
    const beat = positiveMod(note.timeStart, 4);
    const accent = Math.abs(beat) < 0.08 ? 1.45 :
      Math.abs(beat - 2) < 0.08 ? 1.22 :
      Math.abs(beat - Math.round(beat)) < 0.08 ? 1.08 : 1;
    for (let window = Math.max(0, first); window < Math.min(result.length, last); window++) {
      const overlap = Math.min(note.timeStart + note.duration, (window + 1) * windowDuration) -
        Math.max(note.timeStart, window * windowDuration);
      if (overlap <= 0) continue;
      result[window].push({
        midi: note.midi,
        weight: clamp(overlap, 0.05, windowDuration) * accent *
          (passing ? 0.32 : 1) * (0.75 + clamp(note.velocity, 0, 1) * 0.25),
      });
    }
  }
  return result;
}

/** Mid-bar chord changes require independent evidence in both halves, not
 * mere note density. Uncertain bars stay harmonically spacious. */
function planHarmonicRegions(
  source: readonly NoteEvent[], bars: number, pacing: HarmonicPacing,
  candidates: readonly ChordCandidate[], fit: number, tension: number,
): HarmonicRegion[] {
  const whole = melodyWindows(source, bars);
  if (pacing === "bar") {
    return whole.map((notes, bar) => ({ timeStart: bar * 4, duration: 4, notes }));
  }
  const halves = melodyWindows(source, bars, 2);
  const regions: HarmonicRegion[] = [];
  for (let bar = 0; bar < bars; bar++) {
    const start = bar * 4;
    const left = halves[2 * bar], right = halves[2 * bar + 1];
    let split = pacing === "half-bar";
    if (pacing === "adaptive") {
      const hasLeftOnset = source.some(note => note.timeStart >= start && note.timeStart < start + 2);
      const hasRightOnset = source.some(note => note.timeStart >= start + 2 && note.timeStart < start + 4);
      if (hasLeftOnset && hasRightOnset && left.length && right.length) {
        const bestFor = (notes: readonly WeightedNote[]) => {
          let bestScore = -Infinity, bestIndex = 0;
          for (let i = 0; i < candidates.length; i++) {
            const score = chordFit(candidates[i], notes, fit, tension);
            if (score > bestScore) { bestScore = score; bestIndex = i; }
          }
          return { bestScore, bestIndex };
        };
        const a = bestFor(left), b = bestFor(right), full = bestFor(whole[bar]);
        // Average local improvement must overcome an additional chord change,
        // and each section must imply a genuinely different chord.
        split = a.bestIndex !== b.bestIndex &&
          (a.bestScore + b.bestScore) / 2 - full.bestScore >= 0.48;
      }
    }
    if (split) {
      regions.push({ timeStart: start, duration: 2, notes: left });
      regions.push({ timeStart: start + 2, duration: 2, notes: right });
    } else {
      regions.push({ timeStart: start, duration: 4, notes: whole[bar] });
    }
  }
  return regions;
}

function chordFit(chord: ChordCandidate, notes: readonly WeightedNote[], fit: number, tension: number): number {
  if (notes.length === 0) return 0;
  const total = notes.reduce((sum, note) => sum + note.weight, 0);
  if (total <= 0) return 0;
  const strictness = 0.8 + clamp(fit, 0, 100) / 100 * 1.7;
  let score = 0;
  for (const note of notes) {
    const pitch = pc(note.midi);
    const match = chord.pitchClasses.includes(pitch);
    const nearest = Math.min(...chord.pitchClasses.map(chordPc =>
      Math.min(pc(pitch - chordPc), pc(chordPc - pitch))));
    score += note.weight * (match ? 2.0 : -(nearest === 1 ? 0.88 : 1.75) * strictness);
  }
  score /= total;
  if (chord.borrowed) score -= 0.35 * (1 - clamp(tension, 0, 100) / 130);
  if (chord.seventh) score -= 0.18 * (1 - clamp(tension, 0, 100) / 100);
  return score;
}

function transition(previous: ChordCandidate, next: ChordCandidate, hasMelody: boolean): number {
  if (previous.name === next.name) return hasMelody ? 0.17 : 0.7;
  if (!hasMelody) return -1.6;
  const rootMotion = pc(next.rootPc - previous.rootPc);
  let score = -0.16;
  if (rootMotion === 5 || rootMotion === 7) score += 0.40;
  // Functional cadence: dominant -> tonic and predominant -> dominant.
  if (previous.degree === 4 && next.degree === 0) score += 0.96;
  if ((previous.degree === 1 || previous.degree === 3) && next.degree === 4) score += 0.52;
  if (previous.degree === 0 && next.degree === 4) score += 0.24;
  const common = previous.pitchClasses.filter(p => next.pitchClasses.includes(p)).length;
  score += 0.11 * common;
  return score;
}

/** Globally optimize a phrase's harmonic path, retaining a strong prior
 * against gratuitous changes on weak half-bar boundaries. */
function chooseHarmony(
  candidates: readonly ChordCandidate[], regions: readonly HarmonicRegion[],
  fit: number, tension: number, random: RandomSource,
  previousChords: readonly { name: string; timeStart: number }[] = [],
): ChordCandidate[] {
  const rows: { score: number; prev: number }[][] = [];
  const freedom = (1 - clamp(fit, 0, 100) / 100) * 0.46 + 0.035;
  for (let segment = 0; segment < regions.length; segment++) {
    const region = regions[segment];
    const row: { score: number; prev: number }[] = [];
    const lastAtStart = previousChords.find(chord => Math.abs(chord.timeStart - region.timeStart) < 1 / 64);
    for (let j = 0; j < candidates.length; j++) {
      const chord = candidates[j];
      const evidence = chordFit(chord, region.notes, fit, tension) * (region.duration === 2 ? 0.82 : 1);
      const explore = (random() - 0.5) * freedom;
      const repeatPenalty = lastAtStart?.name === chord.name ? 0.24 : 0;
      const cadence = segment === regions.length - 1 && chord.degree === 0 ? 0.24 : 0;
      if (segment === 0) {
        row.push({ score: evidence + explore - repeatPenalty +
          (chord.degree === 0 ? 0.28 : 0), prev: -1 });
      } else {
        let bestScore = -Infinity, previous = 0;
        for (let k = 0; k < candidates.length; k++) {
          const changingOnHalfBar = region.timeStart % 4 === 2 && candidates[k].name !== chord.name;
          const penalty = changingOnHalfBar ? 0.28 : 0;
          const trial = rows[segment - 1][k].score +
            transition(candidates[k], chord, region.notes.length > 0) - penalty;
          if (trial > bestScore) { bestScore = trial; previous = k; }
        }
        row.push({ score: bestScore + evidence + cadence + explore - repeatPenalty, prev: previous });
      }
    }
    rows.push(row);
  }
  let index = rows.at(-1)!.reduce((best, value, i, arr) => value.score > arr[best].score ? i : best, 0);
  const result: ChordCandidate[] = [];
  for (let segment = regions.length - 1; segment >= 0; segment--) {
    result.push(candidates[index]);
    index = rows[segment][index].prev;
  }
  return result.reverse();
}

/** A split proposed from local evidence may still resolve to one sustained
 * harmony after the global progression is optimized. Avoid needless chord
 * restrikes when both halves end up using exactly the same chord. */
function mergeRedundantHalfBars(
  regions: readonly HarmonicRegion[], chords: readonly ChordCandidate[],
  pacing: HarmonicPacing,
): { regions: HarmonicRegion[]; chords: ChordCandidate[] } {
  if (pacing !== "adaptive") return { regions: [...regions], chords: [...chords] };
  const mergedRegions: HarmonicRegion[] = [];
  const mergedChords: ChordCandidate[] = [];
  for (let i = 0; i < regions.length; i++) {
    const current = regions[i];
    const previous = mergedRegions.at(-1);
    const previousChord = mergedChords.at(-1);
    if (previous && previousChord?.name === chords[i].name &&
      previous.duration === 2 && current.duration === 2 &&
      current.timeStart % 4 === 2 && current.timeStart === previous.timeStart + 2) {
      mergedRegions[mergedRegions.length - 1] = {
        ...previous, duration: 4, notes: [...previous.notes, ...current.notes],
      };
      continue;
    }
    mergedRegions.push(current);
    mergedChords.push(chords[i]);
  }
  return { regions: mergedRegions, chords: mergedChords };
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 67;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function notesAtRegion(notes: readonly NoteEvent[], start: number, duration: number): NoteEvent[] {
  return notes.filter(note => note.timeStart < start + duration &&
    note.timeStart + note.duration > start);
}

/** Register-aware inversions keep chord tones away from the melody's center. */
function voiceChord(chord: ChordCandidate, melodyCenter: number, previous: readonly number[]): number[] {
  const below = melodyCenter >= 58;
  const low = below ? clamp(Math.floor(melodyCenter - 22), 40, 58) : clamp(Math.ceil(melodyCenter + 7), 54, 74);
  const high = below ? clamp(Math.floor(melodyCenter - 4), low + 12, 78) : Math.min(90, low + 20);
  // Root already exists in the bass; favor the third and fifth up top.
  const ordered = chord.pitchClasses.length > 3
    ? chord.pitchClasses.slice(1, 4)
    : chord.pitchClasses;
  const options = ordered.map(pitchClass => {
    const found: number[] = [];
    for (let midi = low; midi <= high; midi++) if (pc(midi) === pitchClass) found.push(midi);
    return found.length > 0 ? found : [low + pc(pitchClass - low)];
  });
  let winner: number[] = [], best = Infinity;
  const visit = (position: number, placed: number[]) => {
    if (position < options.length) {
      for (const midi of options[position]) visit(position + 1, [...placed, midi]);
      return;
    }
    const pitches = placed.sort((a, b) => a - b);
    if (pitches.some((midi, i) => i > 0 && midi - pitches[i - 1] < 3)) return;
    const span = pitches.at(-1)! - pitches[0];
    if (span > 24) return;
    const registerTarget = below ? melodyCenter - 13 : melodyCenter + 14;
    const registerCost = pitches.reduce((sum, n) => sum + Math.abs(n - registerTarget), 0) * 0.10;
    const movement = previous.length === pitches.length
      ? pitches.reduce((sum, n, i) => sum + Math.abs(n - previous[i]), 0) * 0.42 : 0;
    const crowding = pitches.reduce((sum, n) =>
      sum + (Math.abs(n - melodyCenter) <= 2 ? 4 : 0), 0);
    const score = registerCost + movement + crowding + Math.abs(span - 11) * 0.10;
    if (score < best) { best = score; winner = pitches.slice(); }
  };
  visit(0, []);
  return winner.length > 0 ? winner : options.map(part => part[0]).sort((a, b) => a - b);
}

function makeNote(midi: number, timeStart: number, duration: number, velocity: number, trackIndex: number): NoteEvent {
  return { midi, name: toName(midi), timeStart, duration, velocity, trackIndex };
}

function makeAccompaniment(
  source: readonly NoteEvent[],
  regions: readonly HarmonicRegion[], chords: readonly ChordCandidate[],
  bassIndex: number, harmonyIndex: number, density: AccompanimentDensity,
  random: RandomSource,
): NoteEvent[] {
  const out: NoteEvent[] = [];
  // Follow clear straight/offbeat emphasis, rather than inventing a groove.
  // Count simultaneous chord onsets once, so polyphony doesn't skew the feel.
  const onsetVelocities = new Map<number, number>();
  for (const note of source) {
    const onset = Math.round(note.timeStart * 8) / 8;
    onsetVelocities.set(onset, Math.max(onsetVelocities.get(onset) ?? 0, note.velocity));
  }
  let totalAccent = 0, offbeatAccent = 0;
  for (const [onset, velocity] of onsetVelocities) {
    totalAccent += velocity;
    if (Math.abs(onset - Math.round(onset)) >= 0.24) offbeatAccent += velocity;
  }
  const offbeatShare = totalAccent > 0 ? offbeatAccent / totalAccent : 0.5;
  const pushedGroove = offbeatShare > 0.48 ? true :
    offbeatShare < 0.18 ? false : random() > 0.5;
  const fallbackArpDirection = random() > 0.5;
  // The phrase determines the broad contour; the seed still chooses which
  // inversion tone the arpeggio starts from, keeping alternatives audible.
  const arpOffset = random() > 0.5 ? 1 : 0;
  const globalCenter = median(source.map(note => note.midi));
  let previousVoicing: number[] = [];
  for (let i = 0; i < chords.length; i++) {
    const { timeStart: start, duration } = regions[i];
    const notes = notesAtRegion(source, start, duration);
    const center = notes.length ? median(notes.map(note => note.midi)) : globalCenter;
    const attacks = notes.filter(note =>
      note.timeStart >= start && note.timeStart < start + duration);
    const activeOnsets = attacks.length;
    const busyMelody = activeOnsets >= duration * 1.5;
    const meanVelocity = attacks.length > 0
      ? attacks.reduce((sum, note) => sum + note.velocity, 0) / attacks.length
      : notes.length > 0
        ? notes.reduce((sum, note) => sum + note.velocity, 0) / notes.length : 0.5;
    // Quiet, carefully drawn phrases should not be masked by fixed loud bass
    // and chord velocities. Preserve the musical dynamic arc per region.
    const expressiveGain = clamp(0.60 + 0.48 * meanVelocity, 0.6, 1.08);
    const chord = chords[i];
    const voicing = voiceChord(chord, center, previousVoicing);
    previousVoicing = voicing;
    const bassTop = Math.min(52, Math.floor(center - 10));
    let bass = 36 + chord.rootPc;
    while (bass > bassTop && bass - 12 >= 28) bass -= 12;
    while (bass + 12 <= Math.min(48, bassTop)) bass += 12;
    bass = clamp(bass, 28, 52);

    const leadOnsets = new Map<number, number>();
    for (const note of notes) {
      if (note.timeStart < start || note.timeStart >= start + duration) continue;
      const onset = Math.round(note.timeStart * 16) / 16;
      leadOnsets.set(onset, Math.max(note.midi, leadOnsets.get(onset) ?? -1));
    }
    const leadLine = [...leadOnsets.entries()].sort(([a], [b]) => a - b);
    const contour = leadLine.length >= 2
      ? leadLine[leadLine.length - 1][1] - leadLine[0][1] : 0;
    // Opposite-direction arpeggios make space for a rising/falling melody.
    const descendingArp = contour >= 3 ? true : contour <= -3 ? false : fallbackArpDirection;
    const effectiveDensity = busyMelody && density === "active" ? "balanced"
      : busyMelody && density === "balanced" ? "sparse" : density;
    const bassHits = effectiveDensity === "sparse" ? [0]
      : effectiveDensity === "balanced" ? duration === 2 ? [0] :
        [0, pushedGroove ? 2.5 : 2]
        : duration === 2 ? [0, 1] :
          pushedGroove ? [0, 1.5, 2.5] : [0, 2, 3.5];
    for (let hit = 0; hit < bassHits.length; hit++) {
      const onset = bassHits[hit];
      const next = bassHits[hit + 1] ?? duration;
      out.push(makeNote(bass, start + onset, Math.max(0.125, (next - onset) * 0.88),
        (hit === 0 ? 0.77 : 0.64) * expressiveGain, bassIndex));
    }

    if (effectiveDensity === "sparse") {
      for (const pitch of voicing) out.push(makeNote(pitch, start,
        Math.max(0.125, duration - 0.2), 0.48 * expressiveGain, harmonyIndex));
    } else if (effectiveDensity === "balanced") {
      const hits = duration === 2 ? [0] : [0, pushedGroove ? 2.5 : 2];
      for (const onset of hits) {
        for (const pitch of voicing) out.push(makeNote(pitch, start + onset,
          Math.max(0.125, Math.min(1.7, duration - onset - 0.1)),
          (onset === 0 ? 0.54 : 0.43) * expressiveGain, harmonyIndex));
      }
    } else {
      for (let step = 0; step < duration / 0.5; step++) {
        const index = descendingArp ? voicing.length - 1 - ((step + arpOffset) % voicing.length) :
          (step + arpOffset) % voicing.length;
        out.push(makeNote(voicing[index], start + step * 0.5, 0.43,
          (step % 4 === 0 ? 0.55 : 0.40) * expressiveGain, harmonyIndex));
      }
    }
  }
  return out;
}

/**
 * Harmonize a selected source track without modifying its notes, other user
 * tracks, or metadata. Existing adaptive Bass/Harmony tracks for this source
 * are reused, so repeated generation never accumulates duplicate parts.
 */
export function generateFromMelody(
  input: ProgressionData,
  options: MelodyGenerationOptions,
  random: RandomSource = Math.random,
): MelodyGenerationResult {
  const trackIndex = options.sourceTrackIndex;
  if (!Number.isInteger(trackIndex) || trackIndex < 0) {
    return {ok: false, reason: "Choose a valid melody track."};
  }
  if (!Number.isInteger(input.totalBars) || input.totalBars < 1) {
    return {ok: false, reason: "The sequence has an invalid bar length."};
  }
  if (!Number.isFinite(options.tension) || options.tension < 0 || options.tension > 100 ||
    !Number.isFinite(options.harmonicFit) || options.harmonicFit < 0 || options.harmonicFit > 100) {
    return {ok: false, reason: "Chord tension and harmonic fit must be from 0 to 100."};
  }
  if (!["manual", "detect"].includes(options.keyStrategy) ||
      !["major", "minor"].includes(options.mode)) {
    return {ok: false, reason: "Choose a valid key strategy and scale."};
  }
  const originalMelody = input.notes.filter(note => trackIndexOf(note) === trackIndex);
  if (originalMelody.length === 0) return {ok: false, reason: "Draw or import notes on the melody track first."};
  // A linked continuation supplies harmonic evidence after the original phrase.
  // Its own notes remain on a separately generated, safely replaceable track.
  const continuation = input.tracks?.find(track =>
    track.generatedRole === "continuation" && track.sourceTrackIndex === trackIndex);
  const source = continuation === undefined ? originalMelody :
    [...originalMelody, ...input.notes.filter(note => trackIndexOf(note) === continuation.index)];
  if (source.some(note => !Number.isInteger(note.midi) || note.midi < 0 || note.midi > 127 ||
    !Number.isFinite(note.timeStart) || note.timeStart < 0 ||
    !Number.isFinite(note.duration) || note.duration <= 0 ||
    !Number.isFinite(note.velocity) || note.velocity < 0 || note.velocity > 1)) {
    return {ok: false, reason: "The melody contains invalid pitches or timing."};
  }
  if (source.length > 4096) return {ok: false, reason: "Choose a melody with 4,096 notes or fewer."};
  const last = source.reduce((max, n) => Math.max(max, n.timeStart + n.duration), 0);
  const bars = Math.max(1, input.totalBars, Math.ceil(last / 4));
  if (bars > 64) return {ok: false, reason: "Harmonization currently supports up to 64 bars. Shorten the pattern first."};
  const pacing = options.harmonicPacing ?? "bar";
  if (!["bar", "adaptive", "half-bar"].includes(pacing)) {
    return {ok: false, reason: "Choose a valid harmonic pacing."};
  }
  if (!["sparse", "balanced", "active"].includes(options.density)) {
    return {ok: false, reason: "Choose a valid accompaniment density."};
  }
  const sourceMeta = input.tracks?.find(track => track.index === trackIndex);
  if (sourceMeta && isAdaptiveTrack(sourceMeta)) {
    return {ok: false, reason: "Choose an original melody track, not a generated accompaniment."};
  }

  const analysis = analyzeKeyFromProgression({...input, notes: originalMelody});
  const detected = options.keyStrategy === "detect" && !analysis.ambiguous;
  const root = detected ? analysis.best.root : options.root;
  const mode = detected ? analysis.best.mode : options.mode;
  const candidates = chordCandidates(root, mode, options.tension);
  if (candidates.length === 0) return {ok: false, reason: "Select a valid key and scale in Compose."};
  const regions = planHarmonicRegions(source, bars, pacing, candidates, options.harmonicFit, options.tension);
  const previousChords = input.chords.filter(chord => chord.generatedSourceTrackIndex === trackIndex);
  const selectedHarmony = chooseHarmony(candidates, regions, options.harmonicFit, options.tension, random, previousChords);
  const refined = mergeRedundantHalfBars(regions, selectedHarmony, pacing);

  let working = input;
  const selectedTracks: number[] = [];
  for (const role of ["bass", "harmony"] as const) {
    const existing = working.tracks?.find(track =>
      track.generatedRole === role && track.sourceTrackIndex === trackIndex);
    if (existing) {
      selectedTracks.push(existing.index);
      continue;
    }
    const created = addTrack(working, role === "bass" ? "Generated Bass" : "Generated Harmony");
    if (!created) return {ok: false, reason: "Not enough free melodic MIDI channels for two accompaniment tracks."};
    working = {...created.progression, tracks: created.progression.tracks?.map(track =>
      track.index === created.index ? {...track, generatedRole: role, sourceTrackIndex: trackIndex} : track)};
    selectedTracks.push(created.index);
  }
  const [bassIndex, harmonyIndex] = selectedTracks;
  const generated = new Set(selectedTracks);
  const accompaniment = makeAccompaniment(source, refined.regions, refined.chords, bassIndex, harmonyIndex, options.density, random);
  const chords = refined.chords.map((chord, index) => ({
    name: chord.name, timeStart: refined.regions[index].timeStart, duration: refined.regions[index].duration,
    generatedSourceTrackIndex: trackIndex,
  }));

  return {
    ok: true,
    progression: {
      ...working,
      totalBars: Math.max(working.totalBars, bars),
      notes: [...working.notes.filter(note => !generated.has(trackIndexOf(note))), ...accompaniment],
      chords: [...working.chords.filter(chord => chord.generatedSourceTrackIndex !== trackIndex), ...chords]
        .sort((a, b) => a.timeStart - b.timeStart),
    },
    root, mode, keyWasAmbiguous: analysis.ambiguous, usedDetectedKey: detected,
    generatedTrackIndices: selectedTracks,
  };
}
