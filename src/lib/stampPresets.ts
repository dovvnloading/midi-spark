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

