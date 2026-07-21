// Shared musical + layout constants.

export const MIDI_RANGE = 128;
export const MAX_MIDI = 127;
export const NOTE_HEIGHT = 16;
export const PIANO_ROLL_HEIGHT = MIDI_RANGE * NOTE_HEIGHT;
export const KEYBOARD_WIDTH = 64;

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

export const SYNTH_OPTIONS = [
  { label: "Classic Analog", value: "classic" },
  { label: "Electric Piano", value: "epiano" },
  { label: "Atmospheric Pad", value: "pad" },
  { label: "Modern Pluck", value: "pluck" },
  { label: "Dreamwave", value: "dream" },
] as const;

/** Fallback grid resolution (in quarters) when snap is set to "Line" (free). */
export const FREE_SNAP = 0.015625;

export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
