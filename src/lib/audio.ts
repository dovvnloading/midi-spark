import * as Tone from "tone";
import { ProgressionData } from "./theory";
import type { TrackMix } from "./tracks";
import { trackEffectiveLevel, trackIndexOf } from "./tracks";

let classicSynth: Tone.PolySynth;
let epianoSynth: Tone.PolySynth;
let padSynth: Tone.PolySynth;
let pluckSynth: Tone.PolySynth;
let dreamSynth: Tone.PolySynth;

let activeSynth: Tone.PolySynth | null = null;
let currentPart: Tone.Part | null = null;

export type SynthType = "classic" | "epiano" | "pad" | "pluck" | "dream";

// Per-track synths mirror the five existing preset definitions.
function createTrackSynth(type: SynthType): Tone.PolySynth {
  switch (type) {
    case "classic":
      return new Tone.PolySynth(Tone.MonoSynth, {
      volume: -6,
      oscillator: { type: "sawtooth" },
      filter: { Q: 2, type: "lowpass", rolloff: -24 },
      envelope: { attack: 0.05, decay: 0.3, sustain: 0.4, release: 1.2 },
      filterEnvelope: {
        attack: 0.05,
        decay: 0.6,
        sustain: 0.2,
        release: 1.2,
        baseFrequency: 200,
        octaves: 4,
      },
    });
    case "epiano":
      return new Tone.PolySynth(Tone.FMSynth, {
      volume: -4,
      harmonicity: 3.01, // Slight detune for warmth
      modulationIndex: 4,
      oscillator: { type: "sine" },
      envelope: { attack: 0.01, decay: 2.0, sustain: 0.2, release: 1.5 },
      modulation: { type: "triangle" },
      modulationEnvelope: {
        attack: 0.01,
        decay: 0.5,
        sustain: 0.0,
        release: 0.5,
      },
    });
    case "pad":
      return new Tone.PolySynth(Tone.AMSynth, {
      volume: -6,
      harmonicity: 1.01, // slow beating
      oscillator: { type: "sine" },
      envelope: { attack: 1.5, decay: 2.0, sustain: 0.8, release: 4.0 },
      modulation: { type: "square" },
      modulationEnvelope: {
        attack: 1.5,
        decay: 2.0,
        sustain: 0.8,
        release: 4.0,
      },
    });
    case "pluck":
      return new Tone.PolySynth(Tone.MonoSynth, {
      volume: -5,
      oscillator: { type: "square" }, // Hollow, woody character
      filter: { Q: 1, type: "lowpass", rolloff: -24 },
      envelope: { attack: 0.005, decay: 0.2, sustain: 0.0, release: 0.2 },
      filterEnvelope: {
        attack: 0.001,
        decay: 0.2,
        sustain: 0.0,
        release: 0.2,
        baseFrequency: 150,
        octaves: 5,
      },
    });
    case "dream":
      return new Tone.PolySynth(Tone.FMSynth, {
      volume: -8,
      harmonicity: 2,
      modulationIndex: 2,
      oscillator: { type: "sine" },
      envelope: { attack: 0.1, decay: 1.0, sustain: 0.4, release: 2.5 },
      modulation: { type: "sawtooth" },
      modulationEnvelope: {
        attack: 0.1,
        decay: 1.0,
        sustain: 0.4,
        release: 2.5,
      },
    });
  }
}

type EffectInput = Tone.Chorus | Tone.Tremolo | Tone.Phaser | Tone.PingPongDelay | Tone.FeedbackDelay;
interface TrackVoice {
  type: SynthType;
  synth: Tone.PolySynth;
  gain: Tone.Gain;
}
const effectInputs: Partial<Record<SynthType, EffectInput>> = {};
const trackVoices = new Map<number, TrackVoice>();
let trackMixer: TrackMix = {};

/** Gain buses take effect immediately, even during an already playing note. */
export function setTrackMixer(next: TrackMix) {
  trackMixer = next;
  if (!classicSynth) return;

  for (const [id, voice] of trackVoices) {
    const setting = next[id];
    if (!setting || voice.type !== setting.synthType) {
      voice.synth.releaseAll();
      voice.synth.dispose();
      voice.gain.dispose();
      trackVoices.delete(id);
    }
  }

  for (const [key, setting] of Object.entries(next)) {
    const id = Number(key);
    if (!Number.isInteger(id) || id < 0) continue;
    let voice = trackVoices.get(id);
    if (!voice) {
      const gain = new Tone.Gain(0);
      const synth = createTrackSynth(setting.synthType);
      synth.connect(gain);
      const input = effectInputs[setting.synthType];
      if (input) gain.connect(input);
      else gain.toDestination();
      voice = { type: setting.synthType, synth, gain };
      trackVoices.set(id, voice);
    }
    voice.gain.gain.rampTo(trackEffectiveLevel(id, next), 0.025);
  }
}

export interface PlaybackCallbacks {
  /** Fired roughly every 16th note with the transport position in quarters. */
  onTick: (timeQuarters: number) => void;
  /** Fired once when a non-looping run reaches the end of the sequence. */
  onEnded: () => void;
}

export async function initAudio() {
  await Tone.start();

  if (!classicSynth) {
    const destination = Tone.getDestination();

    // === FX RACKS === //

    // 1. Classic Analog FX (Warm, fat, wide)
    const classicChorus = new Tone.Chorus(2, 3.5, 0.7).start();
    const classicReverb = new Tone.Reverb({
      decay: 2.5,
      preDelay: 0.1,
      wet: 0.2,
    });

    // 2. EPiano FX (Tremolo, subtle chorus, room reverb)
    const epTremolo = new Tone.Tremolo(4, 0.4).start();
    const epChorus = new Tone.Chorus(1.5, 2, 0.3).start();
    const epReverb = new Tone.Reverb({ decay: 1.5, preDelay: 0.05, wet: 0.15 });

    // 3. Pad FX (Phaser, massive verb, stereo spread)
    const padPhaser = new Tone.Phaser({
      frequency: 0.2,
      octaves: 4,
      baseFrequency: 300,
      wet: 0.4,
    });
    const padReverb = new Tone.Reverb({ decay: 6, preDelay: 0.2, wet: 0.6 });
    const padWidener = new Tone.StereoWidener(0.8);

    // 4. Pluck FX (Ping-pong delay, tight room)
    const pluckDelay = new Tone.PingPongDelay("8n", 0.4);
    pluckDelay.wet.value = 0.3;
    const pluckReverb = new Tone.Reverb({ decay: 1.2, wet: 0.1 });

    // 5. Dream FX (Shimmering delay, ethereal verb)
    const dreamChorus = new Tone.Chorus(0.5, 4, 1.0).start();
    const dreamDelay = new Tone.FeedbackDelay("4n.", 0.5);
    dreamDelay.wet.value = 0.4;
    const dreamReverb = new Tone.Reverb({ decay: 8, wet: 0.5 });

    // === SYNTHESIZERS === //

    // 1. Classic Analog (Juno-style Brass/String)
    classicSynth = new Tone.PolySynth(Tone.MonoSynth, {
      volume: -6,
      oscillator: { type: "sawtooth" },
      filter: { Q: 2, type: "lowpass", rolloff: -24 },
      envelope: { attack: 0.05, decay: 0.3, sustain: 0.4, release: 1.2 },
      filterEnvelope: {
        attack: 0.05,
        decay: 0.6,
        sustain: 0.2,
        release: 1.2,
        baseFrequency: 200,
        octaves: 4,
      },
    });
    classicSynth.chain(classicChorus, classicReverb, destination);

    // 2. Electric Piano (Velvety FM)
    epianoSynth = new Tone.PolySynth(Tone.FMSynth, {
      volume: -4,
      harmonicity: 3.01, // Slight detune for warmth
      modulationIndex: 4,
      oscillator: { type: "sine" },
      envelope: { attack: 0.01, decay: 2.0, sustain: 0.2, release: 1.5 },
      modulation: { type: "triangle" },
      modulationEnvelope: {
        attack: 0.01,
        decay: 0.5,
        sustain: 0.0,
        release: 0.5,
      },
    });
    epianoSynth.chain(epTremolo, epChorus, epReverb, destination);

    // 3. Atmospheric Pad (Ethereal, slow-building)
    padSynth = new Tone.PolySynth(Tone.AMSynth, {
      volume: -6,
      harmonicity: 1.01, // slow beating
      oscillator: { type: "sine" },
      envelope: { attack: 1.5, decay: 2.0, sustain: 0.8, release: 4.0 },
      modulation: { type: "square" },
      modulationEnvelope: {
        attack: 1.5,
        decay: 2.0,
        sustain: 0.8,
        release: 4.0,
      },
    });
    padSynth.chain(padPhaser, padWidener, padReverb, destination);

    // 4. Modern Pluck (Tight, snappy)
    pluckSynth = new Tone.PolySynth(Tone.MonoSynth, {
      volume: -5,
      oscillator: { type: "square" }, // Hollow, woody character
      filter: { Q: 1, type: "lowpass", rolloff: -24 },
      envelope: { attack: 0.005, decay: 0.2, sustain: 0.0, release: 0.2 },
      filterEnvelope: {
        attack: 0.001,
        decay: 0.2,
        sustain: 0.0,
        release: 0.2,
        baseFrequency: 150,
        octaves: 5,
      },
    });
    pluckSynth.chain(pluckDelay, pluckReverb, destination);

    // 5. Dreamwave (Sparkly, glass-like)
    dreamSynth = new Tone.PolySynth(Tone.FMSynth, {
      volume: -8,
      harmonicity: 2,
      modulationIndex: 2,
      oscillator: { type: "sine" },
      envelope: { attack: 0.1, decay: 1.0, sustain: 0.4, release: 2.5 },
      modulation: { type: "sawtooth" },
      modulationEnvelope: {
        attack: 0.1,
        decay: 1.0,
        sustain: 0.4,
        release: 2.5,
      },
    });
    dreamSynth.chain(dreamChorus, dreamDelay, dreamReverb, destination);

    activeSynth = classicSynth;
    effectInputs.classic = classicChorus;
    effectInputs.epiano = epTremolo;
    effectInputs.pad = padPhaser;
    effectInputs.pluck = pluckDelay;
    effectInputs.dream = dreamChorus;
    setTrackMixer(trackMixer);
  }
}

export function setSynthType(type: SynthType) {
  if (!classicSynth) return;

  if (activeSynth) activeSynth.releaseAll();

  switch (type) {
    case "classic":
      activeSynth = classicSynth;
      break;
    case "epiano":
      activeSynth = epianoSynth;
      break;
    case "pad":
      activeSynth = padSynth;
      break;
    case "pluck":
      activeSynth = pluckSynth;
      break;
    case "dream":
      activeSynth = dreamSynth;
      break;
  }
}

function sequenceEndQuarters(data: ProgressionData): number {
  const maxNoteEnd = data.notes.reduce(
    (max, n) => Math.max(max, n.timeStart + n.duration),
    0,
  );
  return Math.max(data.totalBars * 4, maxNoteEnd);
}

/**
 * Re-sync the scheduled part with the current progression while the transport
 * is running (live edits, BPM changes, loop toggles).
 */
export function updateProgressionLive(
  data: ProgressionData,
  bpm: number,
  isLooping: boolean,
) {
  if (!activeSynth || !currentPart) return;
  const transport = Tone.getTransport();
  transport.bpm.value = bpm;
  const quarterSec = 60 / bpm;

  currentPart.clear();
  data.notes.forEach((note) => {
    currentPart?.add(note.timeStart * quarterSec, note);
  });

  const totalDurationSec = sequenceEndQuarters(data) * quarterSec;
  transport.loop = isLooping;
  if (isLooping) {
    transport.setLoopPoints(0, totalDurationSec);
  }
}

export function playProgression(
  data: ProgressionData,
  bpm: number,
  callbacks: PlaybackCallbacks,
  startTickQuarters: number = 0,
  isLooping: boolean = false,
) {
  if (!activeSynth) return;

  const transport = Tone.getTransport();
  transport.stop();
  transport.cancel();
  transport.bpm.value = bpm;

  const quarterSec = 60 / bpm;

  if (currentPart) {
    currentPart.dispose();
  }

  currentPart = new Tone.Part(
    (time, note) => {
      const durationSec = note.duration * quarterSec * 0.9;
      const track = trackIndexOf(note);
      const voice = trackVoices.get(track);
      if (voice && trackEffectiveLevel(track, trackMixer) === 0) return;
      (voice?.synth ?? activeSynth)?.triggerAttackRelease(
        note.name,
        durationSec,
        time,
        note.velocity,
      );
    },
    data.notes.map((n) => ({ ...n, time: n.timeStart * quarterSec })),
  );

  currentPart.start(0);

  // Repeating schedule to update the UI playhead.
  transport.scheduleRepeat((time) => {
    Tone.getDraw().schedule(() => {
      callbacks.onTick(transport.ticks / transport.PPQ);
    }, time);
  }, "16n");

  const totalDurationSec = sequenceEndQuarters(data) * quarterSec;

  if (isLooping) {
    transport.setLoopPoints(0, totalDurationSec);
    transport.loop = true;
  } else {
    transport.loop = false;
    if (totalDurationSec > 0) {
      transport.schedule(() => {
        transport.stop();
        // Deliberately NOT delivered via Draw: Draw events expire (and rAF is
        // paused) while the tab is hidden, which would leave the UI stuck in
        // the playing state when a sequence ends in a background tab.
        setTimeout(() => callbacks.onEnded(), 0);
      }, totalDurationSec);
    }
  }

  if (startTickQuarters > 0) {
    transport.seconds = startTickQuarters * quarterSec;
  }
  transport.start();
}

export function seekAudio(tickQuarters: number, bpm: number) {
  Tone.getTransport().seconds = tickQuarters * (60 / bpm);
}

export function playNote(
  name: string,
  durationInSeconds: number = 0.5,
  velocity?: number,
  trackIndex?: number,
) {
  const synth = trackIndex === undefined
    ? activeSynth
    : trackVoices.get(trackIndex)?.synth ?? activeSynth;
  synth?.triggerAttackRelease(name, durationInSeconds, "+0.01", velocity);
}

export function stopAudio() {
  const transport = Tone.getTransport();
  transport.stop();
  transport.cancel();
  if (activeSynth) activeSynth.releaseAll();
  trackVoices.forEach(({ synth }) => synth.releaseAll());
}
