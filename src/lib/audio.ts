import * as Tone from "tone";
import { ProgressionData } from "./theory";
import { PRESET_BY_ID, type EffectFamily, type PresetPatch, type SynthType } from "./presets";
import type { TrackMix } from "./tracks";
import { trackEffectiveLevel, trackIndexOf } from "./tracks";

export type { SynthType } from "./presets";

// Preserve the original five voices/FX racks, while keeping newly selected
// preview voices lazy. A large sound bank should not create dozens of synths
// and Web Audio oscillators before a sound is ever selected.
let classicSynth: Tone.PolySynth;
let epianoSynth: Tone.PolySynth;
let padSynth: Tone.PolySynth;
let pluckSynth: Tone.PolySynth;
let dreamSynth: Tone.PolySynth;
let activeSynth: Tone.PolySynth | null = null;
let currentPart: Tone.Part | null = null;
let requestedSynthType: SynthType = "classic";

/** All instrument patches use the same PolySynth note API, despite different
 * oscillator engines. The definitions are kept separate from the audio graph. */
export function createTrackSynth(type: SynthType): Tone.PolySynth {
  const patch: PresetPatch = PRESET_BY_ID[type].patch;
  switch (patch.engine) {
    case "basic":
      return new Tone.PolySynth(Tone.Synth, {
        volume: patch.volume,
        oscillator: { type: patch.wave },
        envelope: patch.envelope,
      });
    case "fm":
      return new Tone.PolySynth(Tone.FMSynth, {
        volume: patch.volume,
        harmonicity: patch.harmonicity,
        modulationIndex: patch.modulationIndex,
        oscillator: { type: patch.wave },
        envelope: patch.envelope,
        modulation: { type: patch.modulationWave },
        modulationEnvelope: patch.modulationEnvelope,
      });
    case "am":
      return new Tone.PolySynth(Tone.AMSynth, {
        volume: patch.volume,
        harmonicity: patch.harmonicity,
        oscillator: { type: patch.wave },
        envelope: patch.envelope,
        modulation: { type: patch.modulationWave },
        modulationEnvelope: patch.modulationEnvelope,
      });
    case "mono":
      return new Tone.PolySynth(Tone.MonoSynth, {
        volume: patch.volume,
        oscillator: { type: patch.wave },
        filter: { type: "lowpass", Q: patch.q, rolloff: -24 },
        envelope: patch.envelope,
        filterEnvelope: {
          ...patch.filterEnvelope,
          baseFrequency: patch.baseFrequency,
          octaves: patch.octaves,
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
const effectInputs: Partial<Record<EffectFamily, EffectInput>> = {};
const trackVoices = new Map<number, TrackVoice>();
let trackMixer: TrackMix = {};
let selectedPreview: { type: SynthType; synth: Tone.PolySynth } | null = null;
let auditionVoice: { type: SynthType; synth: Tone.PolySynth } | null = null;

function connectPreset(synth: Tone.PolySynth, type: SynthType): void {
  const rack = effectInputs[PRESET_BY_ID[type].fx];
  if (rack) synth.connect(rack);
  else synth.toDestination();
}

function releaseVoice(voice: Tone.PolySynth): void {
  voice.releaseAll();
  voice.dispose();
}

/** Gain buses take effect immediately during sustained notes. */
export function setTrackMixer(next: TrackMix): void {
  trackMixer = next;
  if (!classicSynth) return;

  for (const [id, voice] of trackVoices) {
    const setting = next[id];
    if (!setting || voice.type !== setting.synthType) {
      releaseVoice(voice.synth);
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
      const rack = effectInputs[PRESET_BY_ID[setting.synthType].fx];
      if (rack) gain.connect(rack);
      else gain.toDestination();
      voice = { type: setting.synthType, synth, gain };
      trackVoices.set(id, voice);
    }
    voice.gain.gain.rampTo(trackEffectiveLevel(id, next), 0.025);
  }
}

export interface PlaybackCallbacks {
  onTick: (timeQuarters: number) => void;
  onEnded: () => void;
}

export async function initAudio(): Promise<void> {
  await Tone.start();
  if (classicSynth) return;

  const destination = Tone.getDestination();

  // Shared effect racks keep even the expanded bank lightweight. Each track
  // has an independent synth/gain and routes into the selected preset family.
  const classicChorus = new Tone.Chorus(2, 3.5, 0.7).start();
  const classicReverb = new Tone.Reverb({ decay: 2.5, preDelay: .1, wet: .2 });
  const epTremolo = new Tone.Tremolo(4, .4).start();
  const epChorus = new Tone.Chorus(1.5, 2, .3).start();
  const epReverb = new Tone.Reverb({ decay: 1.5, preDelay: .05, wet: .15 });
  const padPhaser = new Tone.Phaser({ frequency: .2, octaves: 4, baseFrequency: 300, wet: .4 });
  const padReverb = new Tone.Reverb({ decay: 6, preDelay: .2, wet: .6 });
  const padWidener = new Tone.StereoWidener(.8);
  const pluckDelay = new Tone.PingPongDelay("8n", .4);
  pluckDelay.wet.value = .3;
  const pluckReverb = new Tone.Reverb({ decay: 1.2, wet: .1 });
  const dreamChorus = new Tone.Chorus(.5, 4, 1).start();
  const dreamDelay = new Tone.FeedbackDelay("4n.", .5);
  dreamDelay.wet.value = .4;
  const dreamReverb = new Tone.Reverb({ decay: 8, wet: .5 });

  classicSynth = createTrackSynth("classic");
  classicSynth.chain(classicChorus, classicReverb, destination);
  epianoSynth = createTrackSynth("epiano");
  epianoSynth.chain(epTremolo, epChorus, epReverb, destination);
  padSynth = createTrackSynth("pad");
  padSynth.chain(padPhaser, padWidener, padReverb, destination);
  pluckSynth = createTrackSynth("pluck");
  pluckSynth.chain(pluckDelay, pluckReverb, destination);
  dreamSynth = createTrackSynth("dream");
  dreamSynth.chain(dreamChorus, dreamDelay, dreamReverb, destination);

  effectInputs.classic = classicChorus;
  effectInputs.epiano = epTremolo;
  effectInputs.pad = padPhaser;
  effectInputs.pluck = pluckDelay;
  effectInputs.dream = dreamChorus;
  activeSynth = classicSynth;
  setSynthType(requestedSynthType);
  setTrackMixer(trackMixer);
}

const CORE_TYPES: Partial<Record<SynthType, () => Tone.PolySynth>> = {
  classic: () => classicSynth,
  epiano: () => epianoSynth,
  pad: () => padSynth,
  pluck: () => pluckSynth,
  dream: () => dreamSynth,
};

/** Keep preview selection independent from the track mixer. Only one extra
 * preset voice is retained, even when browsing the entire sound library. */
export function setSynthType(type: SynthType): void {
  requestedSynthType = type;
  if (!classicSynth) return;
  if (activeSynth) activeSynth.releaseAll();
  if (CORE_TYPES[type]) {
    if (selectedPreview) releaseVoice(selectedPreview.synth);
    selectedPreview = null;
    activeSynth = CORE_TYPES[type]();
    return;
  }
  if (selectedPreview?.type !== type) {
    if (selectedPreview) releaseVoice(selectedPreview.synth);
    const synth = createTrackSynth(type);
    connectPreset(synth, type);
    selectedPreview = { type, synth };
  }
  activeSynth = selectedPreview.synth;
}

/** Play a short, original triad or register-appropriate interval while browsing
 * sounds. Auditions do not change MIDI data, the requested instrument, or
 * per-track mute/solo; the listener can hear a new patch before selecting it. */
export async function auditionPreset(type: SynthType): Promise<void> {
  await initAudio();
  if (auditionVoice?.type !== type) {
    if (auditionVoice) releaseVoice(auditionVoice.synth);
    const synth = createTrackSynth(type);
    connectPreset(synth, type);
    auditionVoice = { type, synth };
  }
  auditionVoice.synth.releaseAll();
  const notes = PRESET_BY_ID[type].category === "Bass"
    ? ["C3", "G3"]
    : PRESET_BY_ID[type].category === "Leads"
      ? ["C4", "G4"]
      : ["C4", "E4", "G4"];
  auditionVoice.synth.triggerAttackRelease(notes, 0.42, "+0.02", 0.45);
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
