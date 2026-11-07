import type { ProgressionData } from "./theory";

/** Timeline positions and ranges are always in quarter-note beats, never seconds. */
export interface LoopRange {
  start: number;
  end: number;
}

/** Includes notes extending past the nominal bar count. */
export function sequenceEndQuarters(data: ProgressionData): number {
  const lastNoteEnd = data.notes.reduce(
    (end, note) => Math.max(end, note.timeStart + note.duration),
    0,
  );
  return Math.max(1, data.totalBars * 4, lastNoteEnd);
}

/** Tone's transport operates at integer PPQ ticks. Round only at its boundary. */
export function quartersToTicks(quarters: number, ppq: number): number {
  return Number.isFinite(quarters) && quarters > 0
    ? Math.max(0, Math.round(quarters * ppq))
    : 0;
}

export function ticksToQuarters(ticks: number, ppq: number): number {
  return ticks / ppq;
}

/** A tick expression stays tempo-relative; a numeric Tone time is seconds. */
export function quarterTime(quarters: number, ppq: number): string {
  return `${quartersToTicks(quarters, ppq)}i`;
}

/** A null region means the complete sequence (including newly extended notes). */
export function normalizeLoopRange(
  range: LoopRange | null,
  sequenceEnd: number,
): LoopRange {
  const end = Number.isFinite(sequenceEnd) ? Math.max(1, sequenceEnd) : 1;
  if (!range) return { start: 0, end };
  const start = Number.isFinite(range.start)
    ? Math.max(0, Math.min(end - 1, range.start))
    : 0;
  const out = Number.isFinite(range.end) ? range.end : end;
  return { start, end: Math.max(start + 1, Math.min(end, out)) };
}
