/** Upper-voice movement is optimized separately from harmonic function.
 * A beam search evaluates chord-tone orderings and octave placements while
 * preventing crossings and excessively wide spacing. */
const LOW = 55;  // G3
const HIGH = 84; // C6
const BEAM = 32;

/** Select ascending MIDI pitches for non-bass chord tones.
 * Each requested pitch class appears exactly once, in any inversion. */
export function chooseUpperVoicing(
  pitchClasses: readonly number[],
  previous: readonly number[] = [],
): number[] {
  if (pitchClasses.length === 0) return [];
  const normalized = pitchClasses.map(pc => ((Math.round(pc) % 12) + 12) % 12);
  const target = (index: number, count: number): number => {
    if (previous.length === 0) {
      return count === 1 ? 67 : 59 + (18 * index) / (count - 1);
    }
    const previousIndex = count === 1 ? Math.floor((previous.length - 1) / 2) :
      Math.round(index * (previous.length - 1) / (count - 1));
    return previous[previousIndex];
  };
  const options = (chroma: number) =>
    Array.from({ length: HIGH - LOW + 1 }, (_, index) => LOW + index)
      .filter(midi => midi % 12 === chroma);

  type Candidate = { pitches: number[]; cost: number };
  let best: Candidate | null = null;

  // Rotations are different inversions; do not permute harmonic voices at
  // random. Every candidate must include all requested chord-tone classes.
  for (let rotation = 0; rotation < normalized.length; rotation++) {
    const ordered = normalized.slice(rotation).concat(normalized.slice(0, rotation));
    let states: Candidate[] = [{ pitches: [], cost: 0 }];
    for (let index = 0; index < ordered.length; index++) {
      const next: Candidate[] = [];
      for (const state of states) {
        const prior = state.pitches.at(-1);
        for (const midi of options(ordered[index])) {
          if (prior !== undefined && midi < prior + 2) continue;
          const displacement = Math.abs(midi - target(index, ordered.length));
          const gap = prior === undefined ? 0 : midi - prior;
          const cost = state.cost +
            (previous.length ? displacement + Math.max(0, displacement - 7) * 0.75 : displacement * 0.42) +
            (gap > 12 ? (gap - 12) * 0.55 : 0) +
            (gap > 0 && gap < 3 ? 0.5 : 0) +
            0.03 * Math.abs(midi - 67);
          next.push({ pitches: [...state.pitches, midi], cost });
        }
      }
      next.sort((a, b) => a.cost - b.cost ||
        a.pitches.join(",").localeCompare(b.pitches.join(",")));
      states = next.slice(0, BEAM);
      if (states.length === 0) break;
    }
    for (const state of states) {
      const span = state.pitches.at(-1)! - state.pitches[0];
      const total = state.cost + Math.max(0, span - 22) * 0.3;
      if (!best || total < best.cost) best = { pitches: state.pitches, cost: total };
    }
  }

  // Chord with more distinct pitch classes than can fit in the playable
  // range: retain valid ascending MIDI notes instead of returning NaN.
  if (!best) {
    return normalized.map((pc, index) => {
      const candidates = options(pc);
      return candidates[0] ?? Math.min(HIGH, LOW + index);
    }).sort((a, b) => a - b);
  }
  return best.pitches;
}
