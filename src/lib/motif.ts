import { Note } from "@tonaljs/tonal";
import type { RandomSource } from "./random";
import { analyzeKeyFromProgression } from "./keyAnalysis";
import { getScaleChromas, type NoteEvent, type ProgressionData } from "./theory";
import { addTrack } from "./trackOperations";
import { trackIndexOf } from "./tracks";
import { isAdaptiveTrack, type MelodyKeyStrategy } from "./adaptive";

/** These operations never alter the source melody or any other user-owned notes. */
export type MotifOperation = "continue" | "variation";
export type ContinuationBars = 1 | 2 | 4 | 8;

export interface MotifOptions {
  sourceTrackIndex: number;
  operation: MotifOperation;
  root: string;
  mode: "major" | "minor";
  keyStrategy: MelodyKeyStrategy;
  creativity: number;
  continuationBars: ContinuationBars;
}

export type MotifResult =
  | { ok: true; progression: ProgressionData; generatedTrackIndex: number;
      root: string; mode: "major" | "minor"; detectedKey: boolean; ambiguousKey: boolean;
      generatedNoteCount: number; sourceEndBar: number }
  | { ok: false; reason: string };

const mod = (v: number, n: number) => ((v % n) + n) % n;
const clamp = (v: number, low: number, high: number) => Math.max(low, Math.min(high, v));

/** Collapse near-simultaneous notes to the highest lead voice. Input notes are untouched. */
function leadLine(notes: readonly NoteEvent[]): NoteEvent[] {
  const ordered = [...notes].sort((a, b) => a.timeStart - b.timeStart || b.midi - a.midi);
  const lead: NoteEvent[] = [];
  for (const note of ordered) {
    const last = lead[lead.length - 1];
    if (last && Math.abs(last.timeStart - note.timeStart) <= 0.0625) {
      if (note.midi > last.midi) lead[lead.length - 1] = note;
    } else lead.push(note);
  }
  return lead;
}

function toScale(target: number, scale: ReadonlySet<number>, minPitch: number, maxPitch: number): number {
  const bounded = clamp(Math.round(target), minPitch, maxPitch);
  let best = bounded, cost = Infinity;
  for (let d = -4; d <= 4; d++) {
    const pitch = bounded + d;
    if (pitch < minPitch || pitch > maxPitch || !scale.has(mod(pitch, 12))) continue;
    const next = Math.abs(pitch - target) + (d > 0 ? 0.025 : 0);
    if (next < cost) { best = pitch; cost = next; }
  }
  return best;
}

function scaleShift(pitch: number, direction: number, scale: ReadonlySet<number>, low: number, high: number): number {
  if (direction === 0) return pitch;
  const stride = Math.abs(direction);
  let next = pitch;
  for (let i = 0; i < stride; i++) {
    let candidate = next + Math.sign(direction);
    while (candidate >= low && candidate <= high && !scale.has(mod(candidate, 12))) {
      candidate += Math.sign(direction);
    }
    if (candidate < low || candidate > high) break;
    next = candidate;
  }
  return next;
}

function pitchWithinRange(pitch: number, previous: number, low: number, high: number): number {
  let next = clamp(Math.round(pitch), low, high);
  // Keep pitches in their melodic register, rather than clipping excursions
  // to MIDI boundaries or jumping several octaves.
  if (next - previous > 12) next = Math.max(low, previous + 12);
  if (previous - next > 12) next = Math.min(high, previous - 12);
  return clamp(next, low, high);
}

/** Select a phrase of up to four recent bars with at least two onset groups. */
function phraseFromTail(lead: readonly NoteEvent[], sourceEndBar: number, desiredBars: number) {
  const range = Math.min(4, Math.max(1, sourceEndBar), desiredBars);
  for (let bars = range; bars <= Math.min(4, sourceEndBar); bars++) {
    const start = (sourceEndBar - bars) * 4;
    const phrase = lead.filter(n => n.timeStart >= start && n.timeStart < sourceEndBar * 4);
    if (phrase.length >= 2) return { bars, start, phrase };
  }
  return { bars: Math.min(4, sourceEndBar), start: (sourceEndBar - Math.min(4, sourceEndBar)) * 4,
    phrase: lead.filter(n => n.timeStart >= (sourceEndBar - Math.min(4, sourceEndBar)) * 4) };
}

function makeEvent(source: NoteEvent, pitch: number, time: number, duration: number, velocity: number, trackIndex: number): NoteEvent {
  return {
    midi: pitch, name: Note.fromMidi(pitch) ?? source.name,
    timeStart: Math.max(0, time), duration: Math.max(1 / 64, duration),
    velocity: clamp(velocity, 0.1, 1), trackIndex,
  };
}

/** Preserve rhythm and recognisable contour while varying key-legal pitches. */
function varyExisting(
  lead: readonly NoteEvent[], trackIndex: number, scale: ReadonlySet<number>,
  creativity: number, random: RandomSource,
): NoteEvent[] {
  const amount = clamp(creativity, 0, 100) / 100;
  const pitchValues = lead.map(n => n.midi);
  const low = clamp(Math.min(...pitchValues) - 7, 0, 120);
  const high = clamp(Math.max(...pitchValues) + 7, low + 1, 127);
  const events: NoteEvent[] = [];
  for (let i = 0; i < lead.length; i++) {
    const original = lead[i];
    let pitch = original.midi;
    if (i > 0 && i < lead.length - 1 && random() < amount * 0.82) {
      // A diatonic neighbour is a controlled melodic substitution.
      const direction = random() < 0.5 ? -1 : 1;
      pitch = toScale(original.midi, scale, low, high);
      pitch = scaleShift(pitch, direction * (amount >= 0.8 && random() > 0.8 ? 2 : 1), scale, low, high);
    }
    // Preserve phrase opening and cadence, especially at low creativity.
    if (i === lead.length - 1 && amount > 0.85 && random() > 0.8) {
      pitch = toScale(pitch, scale, low, high);
    }
    const previous = events.at(-1);
    if (previous && amount > 0) pitch = pitchWithinRange(pitch, previous.midi, low, high);
    let time = original.timeStart;
    if (i > 0 && i < lead.length - 1 && random() < amount * 0.38) {
      const move = random() < 0.5 ? -0.125 : 0.125;
      const priorStart = events.at(-1)?.timeStart ?? 0;
      const nextStart = lead[i + 1].timeStart;
      time = clamp(time + move, priorStart + 0.0625, nextStart - 0.0625);
    }
    const duration = i + 1 < lead.length
      ? Math.min(original.duration, Math.max(1 / 64, lead[i + 1].timeStart - time - 0.015625))
      : original.duration;
    events.push(makeEvent(original, pitch, time, duration,
      original.velocity + (random() - 0.5) * amount * 0.14, trackIndex));
  }
  return events;
}

/** Repeat/transform a recent rhythmic-interval motif as a call-and-response. */
function extendPhrase(
  lead: readonly NoteEvent[], sourceEndBar: number, continuationBars: number,
  trackIndex: number, scale: ReadonlySet<number>, tonicPc: number,
  creativity: number, random: RandomSource,
): NoteEvent[] {
  const amount = clamp(creativity, 0, 100) / 100;
  const motif = phraseFromTail(lead, sourceEndBar, continuationBars);
  const noteValues = lead.map(n => n.midi);
  const low = clamp(Math.min(...noteValues) - 9, 0, 118);
  const high = clamp(Math.max(...noteValues) + 9, low + 1, 127);
  const duration = continuationBars * 4;
  const start = sourceEndBar * 4;
  const motifLength = motif.bars * 4;
  const result: NoteEvent[] = [];
  let previousPitch = lead[lead.length - 1].midi;
  const anchor = motif.phrase[0].midi;
  if (motif.phrase.length === 0) return result;

  for (let offset = 0; offset < duration; offset += motifLength) {
    const invert = amount >= 0.7 && random() < (amount - 0.65) * 0.55;
    const anchorShift = amount >= 0.25
      ? Math.floor(random() * 3) - 1 : 0; // neighbouring scale degree
    let targetAnchor = toScale(previousPitch, scale, low, high);
    if (anchorShift !== 0) targetAnchor = scaleShift(targetAnchor, anchorShift, scale, low, high);
    for (const sample of motif.phrase) {
      const relativeTime = sample.timeStart - motif.start;
      const onset = start + offset + relativeTime;
      if (onset >= start + duration) break;
      const interval = sample.midi - anchor;
      let pitch = targetAnchor + (invert ? -interval : interval);
      if (amount >= 0.08 && random() < 0.28 + amount * 0.55) {
        pitch = toScale(pitch, scale, low, high);
      }
      if (amount > 0.4 && random() < amount * 0.26) {
        const direction = random() < 0.5 ? -1 : 1;
        pitch = scaleShift(toScale(pitch, scale, low, high), direction, scale, low, high);
      }
      pitch = pitchWithinRange(pitch, previousPitch, low, high);
      const gap = Math.min(motifLength - relativeTime, start + duration - onset);
      const noteDuration = Math.max(1 / 64, Math.min(sample.duration, gap - 0.015625));
      result.push(makeEvent(sample, pitch, onset, noteDuration,
        sample.velocity + (random() - 0.5) * amount * 0.13, trackIndex));
      previousPitch = pitch;
    }
  }

  if (result.length > 0 && continuationBars >= 2 && amount > 0.2) {
    // Prefer a nearby scale tonic at the end of a completed response, but
    // never force a huge artificial melodic jump.
    const last = result[result.length - 1];
    const candidates = Array.from({length: 17}, (_, i) => last.midi + i - 8)
      .filter(n => n >= low && n <= high && scale.has(mod(n, 12)));
    const tonicClass = mod(tonicPc, 12);
    const tonicCandidates = candidates.filter(n => mod(n, 12) === tonicClass);
    const closest = tonicCandidates.sort((a, b) => Math.abs(a - last.midi) - Math.abs(b - last.midi))[0];
    if (closest !== undefined && Math.abs(closest - last.midi) <= 4) {
      result[result.length - 1] = {...last, midi: closest, name: Note.fromMidi(closest) ?? last.name};
    }
  }
  return result;
}

export function generateMotif(
  input: ProgressionData, options: MotifOptions, random: RandomSource = Math.random,
): MotifResult {
  const idx = options.sourceTrackIndex;
  if (!Number.isInteger(idx) || idx < 0) return {ok: false, reason: "Choose a valid melody track."};
  const sourceMeta = input.tracks?.find(t => t.index === idx);
  if (sourceMeta && isAdaptiveTrack(sourceMeta)) {
    return {ok: false, reason: "Choose a user melody track, not another generated part."};
  }
  const source = input.notes.filter(n => trackIndexOf(n) === idx);
  if (source.length < 2) return {ok: false, reason: "Draw at least two melody notes to establish a motif."};
  if (source.length > 4096) return {ok: false, reason: "Select a source with 4,096 notes or fewer."};
  if (source.some(n => !Number.isInteger(n.midi) || n.midi < 0 || n.midi > 127 ||
      !Number.isFinite(n.timeStart) || n.timeStart < 0 ||
      !Number.isFinite(n.duration) || n.duration <= 0 ||
      !Number.isFinite(n.velocity))) {
    return {ok: false, reason: "Melody pitch, time, or velocity is invalid."};
  }
  if (options.operation !== "continue" && options.operation !== "variation") {
    return {ok: false, reason: "Choose Continue or Reimagine."};
  }
  if (!Number.isFinite(options.creativity) || options.creativity < 0 || options.creativity > 100) {
    return {ok: false, reason: "Creative distance must be between 0 and 100."};
  }
  if (![1, 2, 4, 8].includes(options.continuationBars)) {
    return {ok: false, reason: "Choose 1, 2, 4 or 8 bars for continuation."};
  }
  const sourceEnd = Math.ceil(source.reduce((end, n) => Math.max(end, n.timeStart + n.duration), 0) / 4);
  const targetBars = options.operation === "continue" ? options.continuationBars : 0;
  if (sourceEnd + targetBars > 64) return {ok: false, reason: "The melody and continuation must fit within 64 bars."};
  const lead = leadLine(source);
  if (lead.length < 2) return {ok: false, reason: "Add at least two distinct melodic onsets."};
  const analysis = analyzeKeyFromProgression({...input, notes: source});
  const detectedKey = options.keyStrategy === "detect" && !analysis.ambiguous;
  const root = detectedKey ? analysis.best.root : options.root;
  const mode = detectedKey ? analysis.best.mode : options.mode;
  const chromas = getScaleChromas(root, mode);
  if (Note.chroma(root) === null) return {ok: false, reason: "Choose a valid Compose root note."};

  const generatedRole = options.operation === "continue" ? "continuation" : "variation";
  const existing = input.tracks?.find(t => t.generatedRole === generatedRole && t.sourceTrackIndex === idx);
  let working = input, outputTrack = existing?.index;
  if (outputTrack === undefined) {
    const added = addTrack(input, generatedRole === "continuation" ? "Melody Continuation" : "Melody Variation");
    if (!added) return {ok: false, reason: "No free melodic MIDI channel; remove a track to create this part."};
    outputTrack = added.index;
    working = {...added.progression, tracks: added.progression.tracks?.map(t =>
      t.index === outputTrack ? {
        ...t, program: sourceMeta?.program ?? 0, generatedRole, sourceTrackIndex: idx,
      } : t)};
  }
  const generated = options.operation === "continue"
    ? extendPhrase(lead, sourceEnd, options.continuationBars, outputTrack, chromas, Note.chroma(root) ?? 0, options.creativity, random)
    : varyExisting(lead, outputTrack, chromas, options.creativity, random);
  if (generated.length === 0) return {ok: false, reason: "Not enough notes to generate a melodic phrase."};
  return {
    ok: true,
    progression: {
      ...working,
      totalBars: Math.max(working.totalBars, sourceEnd + targetBars),
      notes: [...working.notes.filter(n => trackIndexOf(n) !== outputTrack), ...generated],
    },
    generatedTrackIndex: outputTrack, root, mode, detectedKey,
    ambiguousKey: analysis.ambiguous, sourceEndBar: sourceEnd, generatedNoteCount: generated.length,
  };
}
