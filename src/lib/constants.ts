// Shared musical + layout constants.

export const MIDI_RANGE = 128;
export const MAX_MIDI = 127;
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

export const CHORD_STAMPS: Record<string, number[]> = {
  Major: [0, 4, 7],
  Minor: [0, 3, 7],
  Maj7: [0, 4, 7, 11],
  Min7: [0, 3, 7, 10],
  Dom7: [0, 4, 7, 10],
  Dim: [0, 3, 6],
  Aug: [0, 4, 8],
  Sus2: [0, 2, 7],
  Sus4: [0, 5, 7],
};

export const SCALE_STAMPS: Record<string, number[]> = {
  "Major Scale": [0, 2, 4, 5, 7, 9, 11],
  "Minor Scale": [0, 2, 3, 5, 7, 8, 10],
  "Harmonic Minor": [0, 2, 3, 5, 7, 8, 11],
  "Melodic Minor": [0, 2, 3, 5, 7, 9, 11],
  "Pentatonic Maj": [0, 2, 4, 7, 9],
  "Pentatonic Min": [0, 3, 5, 7, 10],
  Blues: [0, 3, 5, 6, 7, 10],
};

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

/** Per-track note colors for multi-track MIDI import (cycled by `trackIndex`).
 *  Chosen to stay clear of the selection (violet) and playing (emerald)
 *  highlight colors, which must still visually override these when active. */
export const TRACK_COLORS = [
  { bg: "bg-amber-500", border: "border-amber-400" },
  { bg: "bg-rose-500", border: "border-rose-400" },
  { bg: "bg-cyan-500", border: "border-cyan-400" },
  { bg: "bg-lime-500", border: "border-lime-400" },
  { bg: "bg-orange-500", border: "border-orange-400" },
  { bg: "bg-fuchsia-500", border: "border-fuchsia-400" },
];

export const getTrackColorClasses = (trackIndex: number) => {
  const c = TRACK_COLORS[trackIndex % TRACK_COLORS.length];
  return `${c.bg} ${c.border}`;
};

export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
