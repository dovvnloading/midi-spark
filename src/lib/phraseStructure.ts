import type { NoteEvent } from "./theory";

/**
 * Phrase-scale cues for the harmony sampler. A repeated *melodic* idea can
 * carry a related chord-root trajectory, even when it returns transposed.
 * This is a soft preference, never a hard constraint on the user's melody.
 *
 * Timing is in the editor's current 4/4 quarter-note units. We deliberately
 * avoid probabilistic "key confidence" claims: these are observable cues.
 */
export interface FormRegion {
  timeStart: number;
  duration: number;
}
export interface FormChord {
  rootPc: number;
  degree: number;
}
export interface PhraseEcho {
  earlierStart: number;
  laterStart: number;
  transposition: number;
  confidence: number;
  /** Pre-aligned region indices; computed once so candidate scoring stays cheap. */
  regionPairs: Array<{ earlier: number; later: number }>;
}
export interface PhraseEnding {
  regionIndex: number;
  strength: number;
}
export interface PhraseStructure {
  echoes: PhraseEcho[];
  endings: PhraseEnding[];
}

const pc = (n: number) => ((n % 12) + 12) % 12;

/** At coincident attacks, the upper note is a reasonable melodic proxy.
 * Quantization is used for comparison only; source notes are never changed. */
function attacksInCell(source: readonly NoteEvent[], start: number): Map<number, number> {
  const attacks = new Map<number, number>();
  for (const note of source) {
    if (note.timeStart < start || note.timeStart >= start + 8) continue;
    const onset = Math.round((note.timeStart - start) * 4) / 4;
    const earlier = attacks.get(onset);
    if (earlier === undefined || note.midi > earlier) attacks.set(onset, note.midi);
  }
  return attacks;
}

function compareCells(a: Map<number, number>, b: Map<number, number>):
  { transposition: number; confidence: number } | null {
  if (a.size < 3 || b.size < 3) return null;
  const differences: number[] = [];
  for (const [onset, pitch] of a) {
    const other = b.get(onset);
    if (other !== undefined) differences.push(pc(other - pitch));
  }
  const overlap = differences.length / Math.max(a.size, b.size);
  if (differences.length < 3 || overlap < 0.72) return null;
  const histogram = new Array<number>(12).fill(0);
  for (const delta of differences) histogram[delta]++;
  const transposition = histogram.indexOf(Math.max(...histogram));
  const pitchAgreement = histogram[transposition] / differences.length;
  if (pitchAgreement < 0.75) return null;
  return { transposition, confidence: overlap * pitchAgreement };
}

/** Find the nearest earlier 2-bar echo for each phrase, plus tonal breath
 * points at 4-bar boundaries / the end of the requested region. Echoes are
 * transposition aware and require several aligned attacks: matching silence
 * or one repeated note is not enough to infer a thematic relationship. */
export function analyzePhraseStructure(
  source: readonly NoteEvent[], regions: readonly FormRegion[],
  tonicPc: number, mode: "major" | "minor",
): PhraseStructure {
  if (!regions.length || !source.length) return { echoes: [], endings: [] };
  const start = regions[0].timeStart;
  const end = regions[regions.length - 1].timeStart + regions[regions.length - 1].duration;
  const cells: Array<{ start: number; attacks: Map<number, number> }> = [];
  for (let tick = Math.ceil(start / 8) * 8; tick + 8 <= end + 1e-8; tick += 8) {
    cells.push({ start: tick, attacks: attacksInCell(source, tick) });
  }
  const echoes: PhraseEcho[] = [];
  for (let j = 1; j < cells.length; j++) {
    let strongest: PhraseEcho | null = null;
    for (let i = 0; i < j; i++) {
      const match = compareCells(cells[i].attacks, cells[j].attacks);
      if (!match) continue;
      const candidate = {
        earlierStart: cells[i].start, laterStart: cells[j].start,
        transposition: match.transposition, confidence: match.confidence,
      };
      if (!strongest || candidate.confidence >= strongest.confidence) strongest = candidate;
    }
    if (strongest) {
      const regionPairs: PhraseEcho["regionPairs"] = [];
      for (let later = 0; later < regions.length; later++) {
        const region = regions[later];
        if (region.timeStart < strongest.laterStart ||
          region.timeStart >= strongest.laterStart + 8) continue;
        const earlierTick = strongest.earlierStart +
          region.timeStart - strongest.laterStart + region.duration / 2;
        const earlier = regions.findIndex(other =>
          other.timeStart <= earlierTick + 1e-8 &&
          other.timeStart + other.duration > earlierTick + 1e-8);
        if (earlier >= 0) regionPairs.push({ earlier, later });
      }
      if (regionPairs.length) echoes.push({ ...strongest, regionPairs });
    }
  }

  const tonicThird = mode === "major" ? 4 : 3;
  const tonicTones = new Set([pc(tonicPc), pc(tonicPc + tonicThird), pc(tonicPc + 7)]);
  const boundaries = new Set<number>([end]);
  for (let tick = Math.ceil((start + 1e-8) / 16) * 16; tick < end; tick += 16) {
    if (tick > start + 1e-8) boundaries.add(tick);
  }
  const endings: PhraseEnding[] = [];
  for (const boundary of boundaries) {
    const index = regions.findIndex(region =>
      Math.abs(region.timeStart + region.duration - boundary) < 1e-8);
    if (index < 0) continue;
    const tail = source.filter(note =>
      note.timeStart >= boundary - 2 && note.timeStart < boundary)
      .sort((a, b) => b.timeStart - a.timeStart || b.midi - a.midi)[0];
    if (!tail || !tonicTones.has(pc(tail.midi))) continue;
    const trailingRest = boundary - Math.min(boundary, tail.timeStart + tail.duration);
    if (tail.duration < 0.75 && trailingRest < 0.5) continue;
    endings.push({ regionIndex: index, strength: tail.duration >= 1.5 ? 1 : 0.75 });
  }
  return { echoes, endings };
}

/**
 * Bounded structural preference, separate from the original chord-fit and
 * Viterbi scores. It rewards transposition-consistent callbacks and tonic
 * arrivals supported by the melody; it does not make either mandatory.
 * Search still gates candidates by the original score and melody coverage.
 */
export function scorePhraseStructure(
  indices: readonly number[], candidates: readonly FormChord[],
  regions: readonly FormRegion[], structure: PhraseStructure,
): number {
  if (indices.length !== regions.length) return 0;
  let echoScore = 0, echoWeight = 0;
  for (const echo of structure.echoes) {
    let score = 0, count = 0;
    for (const { earlier, later } of echo.regionPairs) {
      const previous = candidates[indices[earlier]];
      const current = candidates[indices[later]];
      if (!previous || !current) continue;
      score += current.rootPc === pc(previous.rootPc + echo.transposition) ? 1 : -0.2;
      count++;
    }
    if (count) {
      echoScore += echo.confidence * score / count;
      echoWeight += echo.confidence;
    }
  }

  let cadenceScore = 0, cadenceWeight = 0;
  for (const ending of structure.endings) {
    const chord = candidates[indices[ending.regionIndex]];
    if (!chord) continue;
    if (chord.degree === 0) {
      const prior = ending.regionIndex > 0
        ? candidates[indices[ending.regionIndex - 1]] : null;
      cadenceScore += ending.strength * (0.65 + (prior?.degree === 4 ? 0.35 : 0));
    }
    cadenceWeight += ending.strength;
  }
  return 1.2 * (echoWeight ? echoScore / echoWeight : 0) +
    0.75 * (cadenceWeight ? cadenceScore / cadenceWeight : 0);
}
