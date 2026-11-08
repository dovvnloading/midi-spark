/** Original procedural instrument patches. No external samples or audio files.
 * The engine, spectral color, modulation and routing define each instrument. */
export type Wave = "sine" | "triangle" | "square" | "sawtooth" |
  "fatsawtooth" | "fattriangle" | "fatsquare" | "pulse" | "pwm";
export type PlainWave = "sine" | "triangle" | "square" | "sawtooth";
export interface Envelope { attack: number; decay: number; sustain: number; release: number }
export type EffectFamily = "classic" | "epiano" | "pad" | "pluck" | "dream" | "dry" | "tape";
export type Modulation =
  | { kind: "chorus"; rate: number; depth: number; wet: number; delay: number; spread: number }
  | { kind: "tremolo"; rate: number; depth: number; wet: number }
  | { kind: "autoFilter"; rate: number; depth: number; wet: number; base: number; octaves: number }
  | { kind: "autoPan"; rate: number; depth: number; wet: number }
  | { kind: "vibrato"; rate: number; depth: number; wet: number }
  | { kind: "phaser"; rate: number; wet: number; base: number; octaves: number };
export interface TimbreColor { type: "lowpass" | "highpass" | "bandpass"; frequency: number; q: number }
export type PresetPatch =
  | { engine: "basic"; wave: Wave; volume: number; envelope: Envelope;
      unison?: { count: number; spread: number } }
  | { engine: "fm"; wave: PlainWave; modulationWave: PlainWave; volume: number;
      harmonicity: number; modulationIndex: number; envelope: Envelope; modulationEnvelope: Envelope }
  | { engine: "am"; wave: PlainWave; modulationWave: PlainWave; volume: number;
      harmonicity: number; envelope: Envelope; modulationEnvelope: Envelope }
  | { engine: "mono"; wave: Wave; volume: number; envelope: Envelope;
      baseFrequency: number; octaves: number; q: number; filterEnvelope: Envelope;
      unison?: { count: number; spread: number } }
  | { engine: "duo"; wave: PlainWave; secondWave: PlainWave; volume: number;
      harmonicity: number; vibratoRate: number; vibratoAmount: number;
      envelope: Envelope; secondEnvelope: Envelope }
  | { engine: "membrane"; wave: PlainWave; volume: number; pitchDecay: number;
      octaves: number; envelope: Envelope };

export const PRESET_CATEGORIES = ["Keys", "Analog & Retro", "Pads & Atmospheres",
  "Plucks & Mallets", "Leads", "Bass", "Motion & Experimental"] as const;
export type PresetCategory = (typeof PRESET_CATEGORIES)[number];
const env = (attack: number, decay: number, sustain: number, release: number): Envelope =>
  ({ attack, decay, sustain, release });
const basic = (wave: Wave, volume: number, envelope: Envelope,
  unison?: {count: number; spread: number}): PresetPatch =>
  ({ engine: "basic", wave, volume, envelope, ...(unison ? {unison} : {}) });
const fm = (volume: number, harmonicity: number, modulationIndex: number,
  envelope: Envelope, modulationEnvelope: Envelope, wave: PlainWave = "sine",
  modulationWave: PlainWave = "sine"): PresetPatch =>
  ({ engine: "fm", wave, modulationWave, volume, harmonicity, modulationIndex, envelope, modulationEnvelope });
const am = (volume: number, harmonicity: number, envelope: Envelope,
  modulationEnvelope: Envelope, wave: PlainWave = "sine", modulationWave: PlainWave = "square"): PresetPatch =>
  ({ engine: "am", wave, modulationWave, volume, harmonicity, envelope, modulationEnvelope });
const mono = (wave: Wave, volume: number, envelope: Envelope, baseFrequency: number,
  octaves: number, filterEnvelope: Envelope, q = 2,
  unison?: {count: number; spread: number}): PresetPatch =>
  ({ engine: "mono", wave, volume, envelope, baseFrequency, octaves,
     filterEnvelope, q, ...(unison ? {unison} : {}) });
const duo = (volume: number, wave: PlainWave, secondWave: PlainWave,
  envelope: Envelope, secondEnvelope: Envelope,
  harmonicity = 1.006, vibratoRate = 5, vibratoAmount = 0.18): PresetPatch =>
  ({ engine: "duo", volume, wave, secondWave, envelope, secondEnvelope,
    harmonicity, vibratoRate, vibratoAmount });
const membrane = (volume: number, pitchDecay: number, octaves: number,
  envelope: Envelope, wave: PlainWave = "sine"): PresetPatch =>
  ({ engine: "membrane", wave, volume, pitchDecay, octaves, envelope });
const chorus = (rate: number, depth: number, wet: number, delay = 3, spread = 180): Modulation =>
  ({ kind: "chorus", rate, depth, wet, delay, spread });
const tremolo = (rate: number, depth: number, wet: number): Modulation =>
  ({ kind: "tremolo", rate, depth, wet });
const sweep = (rate: number, depth: number, wet: number, base: number, octaves: number): Modulation =>
  ({ kind: "autoFilter", rate, depth, wet, base, octaves });
const pan = (rate: number, depth: number, wet: number): Modulation =>
  ({ kind: "autoPan", rate, depth, wet });
const vibrato = (rate: number, depth: number, wet: number): Modulation =>
  ({ kind: "vibrato", rate, depth, wet });
const phaser = (rate: number, wet: number, base: number, octaves: number): Modulation =>
  ({ kind: "phaser", rate, wet, base, octaves });
const low = (frequency: number, q = .5): TimbreColor => ({type: "lowpass", frequency, q});
const high = (frequency: number, q = .5): TimbreColor => ({type: "highpass", frequency, q});
const band = (frequency: number, q = .5): TimbreColor => ({type: "bandpass", frequency, q});

export interface PresetDefinition {
  id: string;
  label: string;
  category: PresetCategory;
  description: string;
  /** Credible synthesis descriptors for the picker, not genre-based hype. */
  character: string;
  fx: EffectFamily;
  patch: PresetPatch;
  color?: TimbreColor;
  motion?: readonly Modulation[];
  /** Soft < 1, punchy > 1. Must retain useful MIDI low-velocity dynamics. */
  velocityCurve?: number;
  /** Polyphony cap for expensive unison/dual-oscillator voices. */
  polyphony?: number;
}

/** Keep original IDs intact for previously saved sessions and imported mixes. */
export const SOUND_PRESETS = [
  // KEYS — warm, struck, crystalline, and sustained keyboard timbres
  { id: "epiano", label: "Electric Piano", category: "Keys", description: "Rounded FM keys with a gentle chorus", fx: "epiano", patch: fm(-4, 3.01, 4, env(.01, 2, .2, 1.5), env(.01, .5, 0, .5), "sine", "triangle") },
  { id: "velvet", label: "Velvet Keys", category: "Keys", description: "Soft, mellow keyboard tone", fx: "epiano", patch: fm(-7, 1.03, 1.3, env(.025, .7, .42, 1.35), env(.015, .4, .1, .45)) },
  { id: "tines", label: "Silver Tines", category: "Keys", description: "Bright electric tines with short shimmer", fx: "epiano", patch: fm(-9, 4.01, 7.2, env(.003, .85, .08, .85), env(.001, .24, .0, .2)) },
  { id: "organ", label: "Hollow Organ", category: "Keys", description: "Smooth sustained organ-style voice", fx: "classic", patch: basic("square", -11, env(.01, .08, .9, .22)) },
  { id: "celeste", label: "Celestial Keys", category: "Keys", description: "Delicate, high shimmering keys", fx: "dream", patch: fm(-11, 3.01, 2.7, env(.006, 1.6, .05, 1.2), env(.002, .75, .03, 1.0)) },
  { id: "glass", label: "Glass Piano", category: "Keys", description: "Clean glassy mallets with long decay", fx: "dream", patch: fm(-10, 2.51, 4.7, env(.002, 2.1, .01, 1.75), env(.001, .38, 0, .2)) },

  // ANALOG & RETRO — classic oscillators and synth brass
  { id: "classic", label: "Classic Analog", category: "Analog & Retro", description: "Wide warm sawtooth synth", fx: "classic", patch: mono("sawtooth", -6, env(.05, .3, .4, 1.2), 200, 4, env(.05, .6, .2, 1.2)) },
  { id: "retro", label: "Retro Poly", category: "Analog & Retro", description: "Soft vintage triangle poly", fx: "classic", patch: basic("triangle", -8, env(.03, .45, .55, .8)) },
  { id: "pulse", label: "Pulse Machine", category: "Analog & Retro", description: "Focused square wave with a short envelope", fx: "classic", patch: mono("square", -9, env(.006, .16, .55, .32), 480, 2, env(.01, .24, .3, .26)) },
  { id: "polysynth", label: "Neon Poly", category: "Analog & Retro", description: "Bright harmonic synth chords", fx: "classic", patch: basic("sawtooth", -12, env(.01, .36, .48, .65)) },
  { id: "brass", label: "Analog Brass", category: "Analog & Retro", description: "Punchy filter-swept brass accents", fx: "classic", patch: mono("sawtooth", -9, env(.035, .25, .67, .42), 170, 5, env(.04, .34, .42, .36), 3) },

  // PADS — movement, breadth and ambience
  { id: "pad", label: "Atmospheric Pad", category: "Pads & Atmospheres", description: "Slow airy, wide evolving pad", fx: "pad", patch: am(-6, 1.01, env(1.5, 2, .8, 4), env(1.5, 2, .8, 4)) },
  { id: "dream", label: "Dreamwave", category: "Pads & Atmospheres", description: "Shimmering FM texture and delay", fx: "dream", patch: fm(-8, 2, 2, env(.1, 1, .4, 2.5), env(.1, 1, .4, 2.5), "sine", "sawtooth") },
  { id: "warmPad", label: "Warm Blanket", category: "Pads & Atmospheres", description: "Soft and warm sustained chords", fx: "pad", patch: am(-11, 1.005, env(.65, 1.3, .85, 2.5), env(.45, 1.4, .6, 2.5), "sine", "triangle") },
  { id: "choir", label: "Vocal Haze", category: "Pads & Atmospheres", description: "Synthetic choir-like overtone bloom", fx: "pad", patch: fm(-10, 2.02, 1.65, env(.75, 1.4, .72, 2.5), env(.45, 1.8, .32, 1.9)) },
  { id: "strings", label: "String Cloud", category: "Pads & Atmospheres", description: "Smooth bowed-string-like ensemble", fx: "pad", patch: basic("sawtooth", -14, env(.48, 1.4, .65, 2.2)) },
  { id: "nebula", label: "Nebula Drift", category: "Pads & Atmospheres", description: "Spacious drifting harmonics", fx: "dream", patch: am(-13, 1.35, env(1.1, 2.2, .72, 4.5), env(.8, 1.6, .45, 3.8), "sine", "sine") },

  // PLUCKS — from dry pizzicato to soft mallets
  { id: "pluck", label: "Modern Pluck", category: "Plucks & Mallets", description: "Dry, snappy square plucks", fx: "pluck", patch: mono("square", -5, env(.005, .2, 0, .2), 150, 5, env(.001, .2, 0, .2), 1) },
  { id: "kalimba", label: "Kalimba Glow", category: "Plucks & Mallets", description: "Small resonant thumb-piano tones", fx: "pluck", patch: fm(-8, 6.01, 3.7, env(.001, .6, 0, .6), env(.001, .22, 0, .14)) },
  { id: "marimba", label: "Wooden Mallet", category: "Plucks & Mallets", description: "Rounded, short wooden percussion", fx: "pluck", patch: basic("sine", -5, env(.002, .25, 0, .18)) },
  { id: "harp", label: "Air Harp", category: "Plucks & Mallets", description: "Bright string-like plucks", fx: "pluck", patch: basic("triangle", -6, env(.001, .58, 0, .55)) },
  { id: "chime", label: "Northern Chime", category: "Plucks & Mallets", description: "Bell overtones with a sparkling tail", fx: "dream", patch: fm(-13, 5.04, 8.0, env(.001, 2.8, .02, 2.1), env(.001, .55, 0, .55)) },
  { id: "mallet", label: "Soft Mallet", category: "Plucks & Mallets", description: "Pillowy felt-like attacks", fx: "epiano", patch: fm(-7, 2.5, 1.7, env(.008, .55, 0, .7), env(.002, .27, 0, .35)) },

  // LEADS — bright, focused, expressive
  { id: "lead", label: "Signal Lead", category: "Leads", description: "Clear triangle melodic lead", fx: "classic", patch: mono("triangle", -7, env(.014, .19, .74, .23), 750, 2.5, env(.015, .15, .65, .2)) },
  { id: "sawLead", label: "Saw Runner", category: "Leads", description: "Edgy soaring analog lead", fx: "classic", patch: mono("sawtooth", -11, env(.006, .16, .8, .22), 420, 4.5, env(.01, .29, .55, .26)) },
  { id: "softLead", label: "Soft Signal", category: "Leads", description: "Gentle mellow melody voice", fx: "epiano", patch: basic("triangle", -8, env(.04, .32, .66, .46)) },
  { id: "whistle", label: "Wind Tone", category: "Leads", description: "Pure flute-like sine lead", fx: "epiano", patch: basic("sine", -5, env(.06, .2, .78, .35)) },
  { id: "fmLead", label: "Digital Edge", category: "Leads", description: "Cutting harmonic FM lead", fx: "dream", patch: fm(-9, 1.51, 5.8, env(.007, .25, .67, .3), env(.015, .45, .35, .29)) },

  // BASS — deep, rounded, percussive
  { id: "sub", label: "Deep Sub", category: "Bass", description: "Smooth fundamental-only low end", fx: "epiano", patch: basic("sine", -3, env(.006, .25, .82, .22)) },
  { id: "analogBass", label: "Classic Bass", category: "Bass", description: "Rounded filtered analog bass", fx: "classic", patch: mono("sawtooth", -8, env(.009, .21, .53, .26), 90, 3.5, env(.01, .25, .22, .19), 1.6) },
  { id: "fmBass", label: "Digital Bass", category: "Bass", description: "Tight metallic low-end punch", fx: "epiano", patch: fm(-6, .51, 3.7, env(.003, .28, .47, .25), env(.004, .24, 0, .21)) },
  { id: "rubberBass", label: "Rubber Bass", category: "Bass", description: "Bouncy short bass notes", fx: "pluck", patch: mono("square", -7, env(.005, .14, .28, .12), 95, 3.8, env(.006, .16, .07, .12), 3) },
  { id: "acid", label: "Acid Line", category: "Bass", description: "Resonant squelchy bass synth", fx: "pluck", patch: mono("sawtooth", -10, env(.005, .1, .4, .16), 135, 5.5, env(.002, .18, .15, .16), 6) },
] as const satisfies readonly PresetDefinition[];

export type SynthType = (typeof SOUND_PRESETS)[number]["id"];

export const SYNTH_OPTIONS: { label: string; value: SynthType }[] = SOUND_PRESETS.map(({ label, id }) => ({ label, value: id }));
export const PRESET_GROUP_OPTIONS = PRESET_CATEGORIES.map((groupLabel) => ({
  groupLabel,
  options: SOUND_PRESETS.filter((preset) => preset.category === groupLabel).map(({ label, id }) => ({ label, value: id })),
}));

export const PRESET_IDS: ReadonlySet<string> = new Set(SOUND_PRESETS.map(({ id }) => id));
export const PRESET_BY_ID: Record<SynthType, (typeof SOUND_PRESETS)[number]> = Object.fromEntries(
  SOUND_PRESETS.map((preset) => [preset.id, preset]),
) as Record<SynthType, (typeof SOUND_PRESETS)[number]>;
