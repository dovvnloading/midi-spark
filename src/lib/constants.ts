// Shared musical + layout constants.

export const MIDI_RANGE = 128;
export const MAX_MIDI = 127;
export const MAX_PROJECT_BARS = 512;
export const MAX_PROJECT_BEATS = MAX_PROJECT_BARS * 4;
export const MAX_PROJECT_NOTES = 60_000;
export const NOTE_HEIGHT = 20;
export const PIANO_ROLL_HEIGHT = MIDI_RANGE * NOTE_HEIGHT;
export const KEYBOARD_WIDTH = 52;
export const VELOCITY_LANE_HEIGHT = 76;
export const MIN_VELOCITY = 0.1;
export const MAX_VELOCITY = 1.0;

export const MIN_ZOOM = 10;
export const MAX_ZOOM = 200;

export const MIN_BPM = 20;
export const MAX_BPM = 300;

export const ROOT_NOTES = [
  "C",
  "C#",
  "D",
  "Eb",
  "E",
  "F",
  "F#",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
] as const;

// Canonical preset definitions and legacy interval maps share one source.
export { CHORD_STAMPS, SCALE_STAMPS } from "./stampPresets";

export const NOTE_LENGTH_OPTIONS = [
  { label: "1/1", value: 4 },
  { label: "1/2", value: 2 },
  { label: "1/4", value: 1 },
  { label: "1/8", value: 0.5 },
  { label: "1/16", value: 0.25 },
  { label: "1/32", value: 0.125 },
];

export const SNAP_OPTIONS = [
  { label: "Line", value: 0 },
  { label: "1/4", value: 1 },
  { label: "1/8", value: 0.5 },
  { label: "1/16", value: 0.25 },
  { label: "1/32", value: 0.125 },
];

export { SYNTH_OPTIONS } from "./presets";

/** Fallback grid resolution (in quarters) when snap is set to "Line" (free). */
export const FREE_SNAP = 0.015625;

/** Track identifiers shared by piano-roll notes, velocity bars, and mixer swatches. */
const TRACK_COLORS = [
  "bg-[#a0b2bf] border-[#566a79]",
  "bg-[#c8c5b7] border-[#706b5c]",
  "bg-[#a7b4ad] border-[#56685e]",
  "bg-[#b5aab8] border-[#6a5e6f]",
  "bg-[#989fa6] border-[#535b63]",
  "bg-[#bc9f9a] border-[#765b56]",
];

export const getTrackColorClasses = (trackIndex: number) =>
  TRACK_COLORS[trackIndex % TRACK_COLORS.length];

export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
