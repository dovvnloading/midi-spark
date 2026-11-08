import { Chord, Note, Scale } from "@tonaljs/tonal";
import { MAJOR_INTERVALS, MINOR_INTERVALS, type NoteEvent, type ProgressionData, type TrackMetadata } from "./theory";
import { analyzeKeyFromProgression } from "./keyAnalysis";
import { addTrack } from "./trackOperations";
import { trackIndexOf } from "./tracks";
import type { RandomSource } from "./random";

export type AccompanimentDensity = "sparse" | "balanced" | "active";
export type MelodyKeyStrategy = "manual" | "detect";

export interface MelodyGenerationOptions {
  sourceTrackIndex: number;
  root: string;
  mode: "major" | "minor";
  tension: number;
  /** How strictly accompaniment chords should fit important melody tones. */
  harmonicFit: number;
  density: AccompanimentDensity;
  keyStrategy: MelodyKeyStrategy;
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

const positiveMod = (x: number, n: number) => ((x % n) + n) % n;
const pc = (pitch: number) => positiveMod(pitch, 12);
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const toName = (midi: number) => Note.fromMidi(midi) ?? "C4";

export function isAdaptiveTrack(track: TrackMetadata): boolean {
  return (track.generatedRole === "bass" || track.generatedRole === "harmony") &&
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
      name: chord.symbol || name, rootPc: pc(Note.chroma(chord.tonic) ?? 0),
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

function melodyWindows(notes: readonly NoteEvent[], bars: number): WeightedNote[][] {
  const sorted = [...notes].sort((a, b) => a.timeStart - b.timeStart || a.midi - b.midi);
  const result: WeightedNote[][] = Array.from({ length: bars }, () => []);
  for (let i = 0; i < sorted.length; i++) {
    const note = sorted[i];
    const startBar = Math.floor(note.timeStart / 4);
    const endBar = Math.ceil((note.timeStart + note.duration) / 4);
    const prev = sorted[i - 1], next = sorted[i + 1];
    // Brief, stepwise passing notes are allowed to be non-chord tones.
    const passing = note.duration <= 0.5 && prev !== undefined && next !== undefined &&
      Math.abs(prev.midi - note.midi) <= 2 &&
      Math.abs(next.midi - note.midi) <= 2 &&
      (note.midi - prev.midi) * (next.midi - note.midi) > 0;
    const beat = positiveMod(note.timeStart, 4);
    const strong = Math.abs(beat) < 0.08 ? 1.45 :
      Math.abs(beat - 2) < 0.08 ? 1.22 :
      Math.abs(beat - Math.round(beat)) < 0.08 ? 1.08 : 1;
    for (let bar = Math.max(0, startBar); bar < Math.min(bars, endBar); bar++) {
      const overlap = Math.min(note.timeStart + note.duration, (bar + 1) * 4) -
        Math.max(note.timeStart, bar * 4);
      if (overlap <= 0) continue;
      result[bar].push({
        midi: note.midi,
        weight: clamp(overlap, 0.05, 4) * strong *
          (passing ? 0.32 : 1) * (0.75 + clamp(note.velocity, 0, 1) * 0.25),
      });
    }
  }
  return result;
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

/** Dynamic-programming search over whole-chord paths, rather than per-bar guesses. */
function chooseHarmony(
  candidates: readonly ChordCandidate[], windows: readonly WeightedNote[][],
  fit: number, tension: number, random: RandomSource,
): ChordCandidate[] {
  const rows: {score: number; prev: number}[][] = [];
  const freedom = (1 - clamp(fit, 0, 100) / 100) * 0.46 + 0.035;
  for (let bar = 0; bar < windows.length; bar++) {
    const row: {score: number; prev: number}[] = [];
    for (let j = 0; j < candidates.length; j++) {
      const chord = candidates[j];
      const evidence = chordFit(chord, windows[bar], fit, tension);
      const explore = (random() - 0.5) * freedom;
      const cadence = bar === windows.length - 1 && chord.degree === 0 ? 0.24 : 0;
      if (bar === 0) {
        row.push({score: evidence + explore + (chord.degree === 0 ? 0.28 : 0), prev: -1});
      } else {
        let bestScore = -Infinity, previous = 0;
        for (let k = 0; k < candidates.length; k++) {
          const trial = rows[bar - 1][k].score + transition(candidates[k], chord, windows[bar].length > 0);
          if (trial > bestScore) { bestScore = trial; previous = k; }
        }
        row.push({score: bestScore + evidence + cadence + explore, prev: previous});
      }
    }
    rows.push(row);
  }
  let index = rows.at(-1)!.reduce((best, v, i, arr) => v.score > arr[best].score ? i : best, 0);
  const result: ChordCandidate[] = [];
  for (let bar = windows.length - 1; bar >= 0; bar--) {
    result.push(candidates[index]);
    index = rows[bar][index].prev;
  }
  return result.reverse();
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 67;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function notesAtBar(notes: readonly NoteEvent[], bar: number): NoteEvent[] {
  return notes.filter(note => note.timeStart < (bar + 1) * 4 &&
    note.timeStart + note.duration > bar * 4);
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
  chords: readonly ChordCandidate[],
  bassIndex: number, harmonyIndex: number, density: AccompanimentDensity,
): NoteEvent[] {
  const out: NoteEvent[] = [];
  const globalCenter = median(source.map(n => n.midi));
  let previousVoicing: number[] = [];
  for (let bar = 0; bar < chords.length; bar++) {
    const start = bar * 4;
    const notes = notesAtBar(source, bar);
    const center = notes.length ? median(notes.map(n => n.midi)) : globalCenter;
    const activeOnsets = notes.filter(note => note.timeStart >= start && note.timeStart < start + 4).length;
    const busyMelody = activeOnsets >= 6;
    const chord = chords[bar];
    const voicing = voiceChord(chord, center, previousVoicing);
    previousVoicing = voicing;
    const bassTop = Math.min(52, Math.floor(center - 10));
    let bass = 36 + chord.rootPc;
    while (bass > bassTop && bass - 12 >= 28) bass -= 12;
    while (bass + 12 <= Math.min(48, bassTop)) bass += 12;
    bass = clamp(bass, 28, 52);

    const effectiveDensity = busyMelody && density === "active" ? "balanced"
      : busyMelody && density === "balanced" ? "sparse" : density;
    const bassHits = effectiveDensity === "sparse" ? [0]
      : effectiveDensity === "balanced" ? [0, 2] : [0, 1.5, 2.5];
    for (let i = 0; i < bassHits.length; i++) {
      const onset = bassHits[i];
      const maxDuration = (bassHits[i + 1] ?? 4) - onset;
      out.push(makeNote(bass, start + onset, Math.max(0.125, maxDuration * 0.88),
        i === 0 ? 0.77 : 0.64, bassIndex));
    }

    if (effectiveDensity === "sparse") {
      for (const pitch of voicing) out.push(makeNote(pitch, start, 3.8, 0.48, harmonyIndex));
    } else if (effectiveDensity === "balanced") {
      for (const onset of [0, 2]) {
        for (const pitch of voicing) out.push(makeNote(pitch, start + onset, 1.7,
          onset === 0 ? 0.54 : 0.43, harmonyIndex));
      }
    } else {
      // Coherent arpeggio across the bar; the melody remains the foreground.
      const offsets = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5];
      for (let i = 0; i < offsets.length; i++) {
        out.push(makeNote(voicing[i % voicing.length], start + offsets[i], 0.43,
          i % 4 === 0 ? 0.55 : 0.40, harmonyIndex));
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
  const source = input.notes.filter(note => trackIndexOf(note) === trackIndex);
  if (source.length === 0) return {ok: false, reason: "Draw or import notes on the melody track first."};
  if (source.some(note => !Number.isInteger(note.midi) || note.midi < 0 || note.midi > 127 ||
    !Number.isFinite(note.timeStart) || note.timeStart < 0 ||
    !Number.isFinite(note.duration) || note.duration <= 0)) {
    return {ok: false, reason: "The melody contains invalid pitches or timing."};
  }
  if (source.length > 4096) return {ok: false, reason: "Choose a melody with 4,096 notes or fewer."};
  const last = source.reduce((max, n) => Math.max(max, n.timeStart + n.duration), 0);
  const bars = Math.max(1, input.totalBars, Math.ceil(last / 4));
  if (bars > 64) return {ok: false, reason: "Harmonization currently supports up to 64 bars. Shorten the pattern first."};
  if (!["sparse", "balanced", "active"].includes(options.density)) {
    return {ok: false, reason: "Choose a valid accompaniment density."};
  }
  const sourceMeta = input.tracks?.find(track => track.index === trackIndex);
  if (sourceMeta && isAdaptiveTrack(sourceMeta)) {
    return {ok: false, reason: "Choose an original melody track, not a generated accompaniment."};
  }

  const analysis = analyzeKeyFromProgression({...input, notes: source});
  const detected = options.keyStrategy === "detect" && !analysis.ambiguous;
  const root = detected ? analysis.best.root : options.root;
  const mode = detected ? analysis.best.mode : options.mode;
  const candidates = chordCandidates(root, mode, options.tension);
  if (candidates.length === 0) return {ok: false, reason: "Select a valid key and scale in Compose."};
  const windows = melodyWindows(source, bars);
  const harmony = chooseHarmony(candidates, windows, options.harmonicFit, options.tension, random);

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
  const accompaniment = makeAccompaniment(source, harmony, bassIndex, harmonyIndex, options.density);
  const chords = harmony.map((chord, bar) => ({
    name: chord.name, timeStart: bar * 4, duration: 4, generatedSourceTrackIndex: trackIndex,
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
