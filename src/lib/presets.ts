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
  { id: "epiano", label: "Electric Piano", category: "Keys", description: "Rounded FM keys with a gentle chorus", character: "Bell-to-bark FM • touch-responsive", color: low(8200), motion: [tremolo(4.4, .28, .25), chorus(.3, .26, .17, 2.3, 110)], velocityCurve: 1.18, fx: "epiano", patch: fm(-4, 3.01, 4, env(.01, 2, .2, 1.5), env(.01, .5, 0, .5), "sine", "triangle") },
  { id: "velvet", label: "Velvet Keys", category: "Keys", description: "Soft, mellow keyboard tone", character: "Warm FM • feather-touch", color: low(3900), motion: [chorus(.34, .28, .22, 2.6, 110)], velocityCurve: 0.7, fx: "epiano", patch: fm(-7, 1.03, 1.3, env(.025, .7, .42, 1.35), env(.015, .4, .1, .45)) },
  { id: "tines", label: "Silver Tines", category: "Keys", description: "Bright electric tines with short shimmer", character: "Inharmonic FM • hard strike", color: high(180), motion: [vibrato(5.1, .05, .12)], velocityCurve: 1.48, fx: "epiano", patch: fm(-9, 4.01, 7.2, env(.003, .85, .08, .85), env(.001, .24, .0, .2)) },
  { id: "organ", label: "Hollow Organ", category: "Keys", description: "Smooth sustained organ-style voice", character: "Harmonic organ • rotary tremolo", color: low(5800), motion: [tremolo(5.1, .38, .42), chorus(4.9, .36, .2, 1.4, 125)], velocityCurve: 0.8, fx: "classic", patch: basic("square", -11, env(.01, .08, .9, .22)) },
  { id: "celeste", label: "Celestial Keys", category: "Keys", description: "Delicate, high shimmering keys", character: "FM bells • stereo drift", color: high(330), motion: [pan(.17, .45, .28)], velocityCurve: 0.95, fx: "dream", patch: fm(-11, 3.01, 2.7, env(.006, 1.6, .05, 1.2), env(.002, .75, .03, 1.0)) },
  { id: "glass", label: "Glass Piano", category: "Keys", description: "Clean glassy mallets with long decay", character: "Inharmonic FM • crystalline", color: high(460), motion: [vibrato(4.3, .05, .14)], velocityCurve: 1.12, fx: "dream", patch: fm(-10, 2.51, 4.7, env(.002, 2.1, .01, 1.75), env(.001, .38, 0, .2)) },

  // ANALOG & RETRO — classic oscillators and synth brass
  { id: "classic", label: "Classic Analog", category: "Analog & Retro", description: "Wide warm sawtooth synth", character: "Detuned analog • envelope filter", motion: [chorus(.26, .22, .16, 3.1, 80)], velocityCurve: 1.08, polyphony: 12, fx: "classic", patch: mono("fatsawtooth", -12, env(.05, .3, .4, 1.2), 200, 4, env(.05, .6, .2, 1.2), 2, {count: 3, spread: 17}) },
  { id: "retro", label: "Retro Poly", category: "Analog & Retro", description: "Soft vintage triangle poly", character: "Soft detuned triangle • vintage", color: low(5600), motion: [chorus(.4, .35, .24, 2.4, 140)], velocityCurve: 0.85, fx: "classic", patch: basic("fattriangle", -11, env(.03, .45, .55, .8), {count: 2, spread: 12}) },
  { id: "pulse", label: "Pulse Machine", category: "Analog & Retro", description: "Focused square wave with a short envelope", character: "Pulse synth • rhythmic filter", motion: [sweep(2.7, .5, .43, 320, 2.3)], velocityCurve: 1.2, fx: "classic", patch: mono("pulse", -11, env(.006, .16, .55, .32), 480, 2, env(.01, .24, .3, .26)) },
  { id: "polysynth", label: "Neon Poly", category: "Analog & Retro", description: "Bright harmonic synth chords", character: "Wide three-voice unison • bright", color: low(8700), motion: [chorus(.58, .47, .32, 3.6, 180)], velocityCurve: 1.2, polyphony: 10, fx: "classic", patch: basic("fatsawtooth", -16, env(.01, .36, .48, .65), {count:3, spread:26}) },
  { id: "brass", label: "Analog Brass", category: "Analog & Retro", description: "Punchy filter-swept brass accents", character: "Analog brass • velocity-driven filter", motion: [vibrato(5.1, .07, .1)], velocityCurve: 1.38, fx: "classic", patch: mono("sawtooth", -9, env(.035, .25, .67, .42), 170, 5, env(.04, .34, .42, .36), 3) },

  // PADS — movement, breadth and ambience
  { id: "pad", label: "Atmospheric Pad", category: "Pads & Atmospheres", description: "Slow airy, wide evolving pad", character: "Dual oscillator • slow filter tide", color: low(8000), motion: [sweep(.09, .55, .4, 280, 3.6), chorus(.18, .48, .25, 3.2, 155)], velocityCurve: 0.76, polyphony: 8, fx: "pad", patch: duo(-16, "sawtooth", "triangle", env(1.1, 2, .7, 3.2), env(1.7, 2.5, .76, 3.6), 1.005, 4.1, .13) },
  { id: "dream", label: "Dreamwave", category: "Pads & Atmospheres", description: "Shimmering FM texture and delay", character: "FM haze • orbiting stereo delay", motion: [pan(.11, .66, .32), chorus(.26, .48, .24, 3.6, 200)], velocityCurve: 0.91, fx: "dream", patch: fm(-8, 2, 2, env(.1, 1, .4, 2.5), env(.1, 1, .4, 2.5), "sine", "sawtooth") },
  { id: "warmPad", label: "Warm Blanket", category: "Pads & Atmospheres", description: "Soft and warm sustained chords", character: "Warm AM • slow spectral breathing", color: low(4800), motion: [sweep(.075, .52, .38, 210, 3)], velocityCurve: 0.67, fx: "pad", patch: am(-11, 1.005, env(.65, 1.3, .85, 2.5), env(.45, 1.4, .6, 2.5), "sine", "triangle") },
  { id: "choir", label: "Vocal Haze", category: "Pads & Atmospheres", description: "Synthetic choir-like overtone bloom", character: "Twin-formant synthetic choir", color: band(2200, .25), motion: [vibrato(4.7, .12, .22), chorus(.22, .33, .18, 4, 110)], velocityCurve: 0.86, polyphony: 8, fx: "pad", patch: duo(-16, "triangle", "sawtooth", env(.62, 1.4, .67, 2.5), env(.9, 1.6, .48, 2.5), 1.005, 4.8, .14) },
  { id: "strings", label: "String Cloud", category: "Pads & Atmospheres", description: "Smooth bowed-string-like ensemble", character: "Detuned string ensemble • vibrato", color: low(5900), motion: [vibrato(5.4, .1, .2), chorus(.21, .5, .29, 4.6, 195)], velocityCurve: 1.1, polyphony: 10, fx: "pad", patch: basic("fatsawtooth", -18, env(.48, 1.4, .65, 2.2), {count:3, spread:22}) },
  { id: "nebula", label: "Nebula Drift", category: "Pads & Atmospheres", description: "Spacious drifting harmonics", character: "AM nebula • phasing stereo orbit", motion: [phaser(.13, .44, 370, 4), pan(.085, .48, .36)], velocityCurve: 0.79, fx: "dream", patch: am(-13, 1.35, env(1.1, 2.2, .72, 4.5), env(.8, 1.6, .45, 3.8), "sine", "sine") },

  // PLUCKS — from dry pizzicato to soft mallets
  { id: "pluck", label: "Modern Pluck", category: "Plucks & Mallets", description: "Dry, snappy square plucks", character: "Tight filter pluck • dry", velocityCurve: 1.35, fx: "dry", patch: mono("square", -5, env(.005, .2, 0, .2), 150, 5, env(.001, .2, 0, .2), 1) },
  { id: "kalimba", label: "Kalimba Glow", category: "Plucks & Mallets", description: "Small resonant thumb-piano tones", character: "Metallic FM • woody attack", color: low(8100), motion: [pan(.15, .24, .14)], velocityCurve: 1.3, fx: "dry", patch: fm(-8, 6.01, 3.7, env(.001, .6, 0, .6), env(.001, .22, 0, .14)) },
  { id: "marimba", label: "Wooden Mallet", category: "Plucks & Mallets", description: "Rounded, short wooden percussion", character: "Pure wooden mallet • dry", color: low(3800), velocityCurve: 1.25, fx: "dry", patch: basic("sine", -5, env(.002, .25, 0, .18)) },
  { id: "harp", label: "Air Harp", category: "Plucks & Mallets", description: "Bright string-like plucks", character: "Detuned pluck • short echo", motion: [chorus(.3, .26, .15, 2.2, 75)], velocityCurve: 1.24, fx: "pluck", patch: basic("fattriangle", -10, env(.001, .58, 0, .55), {count:2, spread:8}) },
  { id: "chime", label: "Northern Chime", category: "Plucks & Mallets", description: "Bell overtones with a sparkling tail", character: "Bell FM • drifting echo", color: high(450), motion: [pan(.14, .36, .25)], velocityCurve: 1.18, fx: "dream", patch: fm(-13, 5.04, 8.0, env(.001, 2.8, .02, 2.1), env(.001, .55, 0, .55)) },
  { id: "mallet", label: "Soft Mallet", category: "Plucks & Mallets", description: "Pillowy felt-like attacks", character: "Muted FM mallet • soft attack", color: low(4500), velocityCurve: 0.85, fx: "dry", patch: fm(-7, 2.5, 1.7, env(.008, .55, 0, .7), env(.002, .27, 0, .35)) },

  // LEADS — bright, focused, expressive
  { id: "lead", label: "Signal Lead", category: "Leads", description: "Clear triangle melodic lead", character: "Filter mono lead • delayed vibrato", motion: [vibrato(5.2, .16, .3)], velocityCurve: 1.22, fx: "dry", patch: mono("triangle", -7, env(.014, .19, .74, .23), 750, 2.5, env(.015, .15, .65, .2)) },
  { id: "sawLead", label: "Saw Runner", category: "Leads", description: "Edgy soaring analog lead", character: "Unison saw • filter pressure", motion: [sweep(.64, .42, .3, 350, 2.4)], velocityCurve: 1.28, polyphony: 10, fx: "classic", patch: mono("fatsawtooth", -17, env(.006, .16, .8, .22), 420, 4.5, env(.01, .29, .55, .26), 2, {count:3,spread:22}) },
  { id: "softLead", label: "Soft Signal", category: "Leads", description: "Gentle mellow melody voice", character: "Warm triangle • human vibrato", color: low(5200), motion: [vibrato(4.8, .12, .25)], velocityCurve: 0.76, fx: "epiano", patch: basic("triangle", -8, env(.04, .32, .66, .46)) },
  { id: "whistle", label: "Wind Tone", category: "Leads", description: "Pure flute-like sine lead", character: "Sine breath tone • pure vibrato", color: high(160), motion: [vibrato(4.9, .17, .31)], velocityCurve: 0.88, fx: "dry", patch: basic("sine", -5, env(.06, .2, .78, .35)) },
  { id: "fmLead", label: "Digital Edge", category: "Leads", description: "Cutting harmonic FM lead", character: "Hard FM bite • moving allpass", motion: [phaser(.52, .29, 430, 3)], velocityCurve: 1.38, fx: "classic", patch: fm(-9, 1.51, 5.8, env(.007, .25, .67, .3), env(.015, .45, .35, .29)) },

  // BASS — deep, rounded, percussive
  { id: "sub", label: "Deep Sub", category: "Bass", description: "Smooth fundamental-only low end", character: "Fundamental sine • unmodulated sub", color: high(24), velocityCurve: 0.9, fx: "dry", patch: basic("sine", -3, env(.006, .25, .82, .22)) },
  { id: "analogBass", label: "Classic Bass", category: "Bass", description: "Rounded filtered analog bass", character: "Filter envelope • dynamic analog", velocityCurve: 1.16, fx: "dry", patch: mono("sawtooth", -8, env(.009, .21, .53, .26), 90, 3.5, env(.01, .25, .22, .19), 1.6) },
  { id: "fmBass", label: "Digital Bass", category: "Bass", description: "Tight metallic low-end punch", character: "Low FM punch • dry transient", velocityCurve: 1.34, fx: "dry", patch: fm(-6, .51, 3.7, env(.003, .28, .47, .25), env(.004, .24, 0, .21)) },
  { id: "rubberBass", label: "Rubber Bass", category: "Bass", description: "Bouncy short bass notes", character: "Bouncy resonant pulse • dry", motion: [tremolo(5.5, .12, .1)], velocityCurve: 1.3, fx: "dry", patch: mono("square", -7, env(.005, .14, .28, .12), 95, 3.8, env(.006, .16, .07, .12), 3) },
  { id: "acid", label: "Acid Line", category: "Bass", description: "Resonant squelchy bass synth", character: "Acid resonance • LFO filter", motion: [sweep(1.5, .7, .65, 120, 4.4)], velocityCurve: 1.42, fx: "dry", patch: mono("sawtooth", -10, env(.005, .1, .4, .16), 135, 5.5, env(.002, .18, .15, .16), 6) },
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
