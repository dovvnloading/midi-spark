import * as Tone from "tone";
import { ProgressionData } from "./theory";
import { PRESET_BY_ID, type EffectFamily, type Modulation, type PresetPatch, type SynthType } from "./presets";
import type { TrackMix } from "./tracks";
import {
  normalizeLoopRange,
  quarterTime,
  quartersToTicks,
  sequenceEndQuarters,
  ticksToQuarters,
  type LoopRange,
} from "./timeline";
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

/** Each patch has its own voice architecture; Tone.PolySynth provides the
 * same MIDI note API for distinct voices and caps expensive unison/duo patches.
 * No external samples, network or new runtime dependencies are needed. */
export function createTrackSynth(type: SynthType): Tone.PolySynth {
  const patch: PresetPatch = PRESET_BY_ID[type].patch;
  const oscillator = (wave: string, unison?: {count: number; spread: number}) =>
    unison ? {type: wave, count: unison.count, spread: unison.spread} : {type: wave};
  let synth: Tone.PolySynth;
  switch (patch.engine) {
    case "basic":
      synth = new Tone.PolySynth(Tone.Synth, {
        volume: patch.volume,
        oscillator: oscillator(patch.wave, patch.unison),
        envelope: patch.envelope,
      });
      break;
    case "fm":
      synth = new Tone.PolySynth(Tone.FMSynth, {
        volume: patch.volume,
        harmonicity: patch.harmonicity,
        modulationIndex: patch.modulationIndex,
        oscillator: { type: patch.wave },
        envelope: patch.envelope,
        modulation: { type: patch.modulationWave },
        modulationEnvelope: patch.modulationEnvelope,
      });
      break;
    case "am":
      synth = new Tone.PolySynth(Tone.AMSynth, {
        volume: patch.volume,
        harmonicity: patch.harmonicity,
        oscillator: { type: patch.wave },
        envelope: patch.envelope,
        modulation: { type: patch.modulationWave },
        modulationEnvelope: patch.modulationEnvelope,
      });
      break;
    case "mono":
      synth = new Tone.PolySynth(Tone.MonoSynth, {
        volume: patch.volume,
        oscillator: oscillator(patch.wave, patch.unison),
        filter: { type: "lowpass", Q: patch.q, rolloff: -24 },
        envelope: patch.envelope,
        filterEnvelope: {
          ...patch.filterEnvelope,
          baseFrequency: patch.baseFrequency,
          octaves: patch.octaves,
        },
      });
      break;
    case "duo":
      synth = new Tone.PolySynth(Tone.DuoSynth, {
        volume: patch.volume,
        harmonicity: patch.harmonicity,
        vibratoRate: patch.vibratoRate,
        vibratoAmount: patch.vibratoAmount,
        voice0: {
          volume: -10, oscillator: {type: patch.wave},
          envelope: patch.envelope,
        },
        voice1: {
          volume: -12, oscillator: {type: patch.secondWave},
          envelope: patch.secondEnvelope,
        },
      });
      break;
    case "membrane":
      synth = new Tone.PolySynth(Tone.MembraneSynth, {
        volume: patch.volume,
        pitchDecay: patch.pitchDecay,
        octaves: patch.octaves,
        oscillator: {type: patch.wave},
        envelope: patch.envelope,
      });
      break;
  }
  synth.maxPolyphony = PRESET_BY_ID[type].polyphony ??
    (patch.engine === "duo" ? 8 : patch.engine === "membrane" ? 12 : 16);
  return synth;
}

/** MIDI dynamics belong to each patch: keyboard bark and filter-envelope
 * voices reward stronger attacks while velvety pads remain audible softly.
 * Exact input MIDI velocities are never edited or rewritten. */
export function presetVelocity(type: SynthType, velocity = 0.8): number {
  const curve = PRESET_BY_ID[type].velocityCurve ?? 1;
  const input = Number.isFinite(velocity) ? Math.max(0, Math.min(1, velocity)) : 0.8;
  return Math.max(0.001, Math.min(1, input ** curve));
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
let audioInitialization: Promise<void> | null = null;
let auditionRequestId = 0;

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

export function initAudio(): Promise<void> {
  if (classicSynth) return Promise.resolve();
  if (!audioInitialization) {
    audioInitialization = initializeAudioGraph().catch((error: unknown) => {
      audioInitialization = null;
      throw error;
    });
  }
  return audioInitialization;
}

async function initializeAudioGraph(): Promise<void> {
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
  const requestId = ++auditionRequestId;
  await initAudio();
  if (requestId !== auditionRequestId) return;
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

let endingEventId: number | null = null;
let endingRevision = 0;
let playbackEpoch = 0;
let playbackState: "stopped" | "playing" | "paused" = "stopped";
let playbackCallbacks: PlaybackCallbacks | null = null;
let playbackEndQuarters = 0;
let playbackLooping = false;
let playbackLoopRange: LoopRange = { start: 0, end: 1 };

function releasePlaybackVoices(): void {
  activeSynth?.releaseAll();
  trackVoices.forEach(({ synth }) => synth.releaseAll());
}

function clearEndingEvent(transport: ReturnType<typeof Tone.getTransport>): void {
  // Also invalidate callbacks already queued by Tone before clear().
  ++endingRevision;
  if (endingEventId !== null) {
    transport.clear(endingEventId);
    endingEventId = null;
  }
}

/** The old end callback must never affect a newer playback session. */
function finishPlayback(epoch: number): void {
  if (epoch !== playbackEpoch || playbackState === "stopped") return;
  const ended = playbackCallbacks?.onEnded;
  stopAudio();
  const completedEpoch = playbackEpoch;
  // Do not invoke React callbacks from Tone's ahead-of-time audio scheduler.
  // Draw callbacks can be dropped when a browser tab is hidden.
  setTimeout(() => {
    if (completedEpoch === playbackEpoch) ended?.();
  }, 0);
}

/** Re-arm a single end marker whenever loop mode or sequence length changes. */
function syncTransportBounds(data: ProgressionData, looping: boolean, loopRange: LoopRange | null): void {
  const transport = Tone.getTransport();
  const end = sequenceEndQuarters(data);
  const range = normalizeLoopRange(loopRange, end);
  playbackEndQuarters = end;
  playbackLooping = looping;
  playbackLoopRange = range;
  clearEndingEvent(transport);

  if (looping) {
    transport.setLoopPoints(
      quarterTime(range.start, transport.PPQ),
      quarterTime(range.end, transport.PPQ),
    );
    transport.loop = true;
    const current = ticksToQuarters(transport.ticks, transport.PPQ);
    if (current < range.start || current >= range.end) {
      releasePlaybackVoices();
      transport.ticks = quartersToTicks(range.start, transport.PPQ);
    }
    return;
  }

  transport.loop = false;
  if (ticksToQuarters(transport.ticks, transport.PPQ) >= end) {
    finishPlayback(playbackEpoch);
    return;
  }
  const epoch = playbackEpoch;
  const revision = endingRevision;
  endingEventId = transport.schedule(
    () => { if (revision === endingRevision) finishPlayback(epoch); },
    quarterTime(end, transport.PPQ),
  );
}

/** Keep note starts and durations in transport ticks rather than fixed seconds.
 * Tone converts a tick-based duration to seconds at each scheduled attack,
 * so BPM changes preserve the musical length of subsequent notes. */
function noteDurationTime(note: ProgressionData["notes"][number], ppq: number): string {
  // A note that crosses a custom loop-out must release before the next pass.
  // For full-pattern playback, the default range already contains each note.
  const quarters = playbackLooping
    ? Math.min(note.duration, Math.max(0, playbackLoopRange.end - note.timeStart))
    : note.duration;
  return Math.max(1, quartersToTicks(quarters * 0.9, ppq)) + "i";
}

/** Re-synchronize notes, tempo, and loop/end markers without restarting. */
export function updateProgressionLive(
  data: ProgressionData,
  bpm: number,
  isLooping: boolean,
  loopRange: LoopRange | null = null,
): void {
  if (!activeSynth || !currentPart || playbackState === "stopped") return;
  const transport = Tone.getTransport();
  transport.bpm.value = bpm;
  currentPart.clear();
  data.notes.forEach((note) => {
    currentPart?.add(quarterTime(note.timeStart, transport.PPQ), note);
  });
  syncTransportBounds(data, isLooping, loopRange);
}

export function playProgression(
  data: ProgressionData,
  bpm: number,
  callbacks: PlaybackCallbacks,
  startTickQuarters = 0,
  isLooping = false,
  loopRange: LoopRange | null = null,
): void {
  if (!activeSynth) return;
  const transport = Tone.getTransport();

  // Cancel both old parts and their UI/end callbacks before making a session.
  ++playbackEpoch;
  playbackCallbacks = callbacks;
  transport.stop();
  transport.cancel();
  ++endingRevision;
  endingEventId = null;
  currentPart?.dispose();
  releasePlaybackVoices();
  transport.ticks = 0;
  transport.loop = false;
  transport.bpm.value = bpm;

  const epoch = playbackEpoch;
  currentPart = new Tone.Part(
    (time, note) => {
      if (epoch !== playbackEpoch || playbackState !== "playing") return;
      if (playbackLooping && (note.timeStart < playbackLoopRange.start || note.timeStart >= playbackLoopRange.end)) return;
      const track = trackIndexOf(note);
      const voice = trackVoices.get(track);
      if (voice && trackEffectiveLevel(track, trackMixer) === 0) return;
      (voice?.synth ?? activeSynth)?.triggerAttackRelease(
        note.name,
        noteDurationTime(note, transport.PPQ),
        time,
        note.velocity,
      );
    },
    data.notes.map((note) => ({
      ...note,
      time: quarterTime(note.timeStart, transport.PPQ),
    })),
  );
  currentPart.start(0);

  // Capture the position while Tone calls us, rather than after a Draw delay.
  transport.scheduleRepeat((time) => {
    const quarter = ticksToQuarters(transport.ticks, transport.PPQ);
    Tone.getDraw().schedule(() => {
      if (epoch === playbackEpoch && playbackState === "playing") callbacks.onTick(quarter);
    }, time);
  }, "16n", "0i");

  playbackState = "playing";
  const end = sequenceEndQuarters(data);
  const range = normalizeLoopRange(loopRange, end);
  const start = isLooping
    ? (startTickQuarters >= range.start && startTickQuarters < range.end
      ? startTickQuarters : range.start)
    : (startTickQuarters >= end ? 0 : Math.max(0, startTickQuarters));
  transport.ticks = quartersToTicks(start, transport.PPQ);
  syncTransportBounds(data, isLooping, loopRange);
  transport.start();
}

/** Pause retains the transport's musical cursor and the scheduled Part. */
export function pauseAudio(): void {
  if (playbackState !== "playing") return;
  Tone.getTransport().pause();
  playbackState = "paused";
  releasePlaybackVoices();
}

export function resumeAudio(): void {
  if (playbackState !== "paused") return;
  if (!playbackLooping && ticksToQuarters(Tone.getTransport().ticks, Tone.getTransport().PPQ) >= playbackEndQuarters) {
    finishPlayback(playbackEpoch);
    return;
  }
  playbackState = "playing";
  Tone.getTransport().start();
}

/** Seeking never converts via BPM; that would shift musical positions after a tempo change. */
export function seekAudio(quarter: number): number {
  const transport = Tone.getTransport();
  let position = Math.max(0, Math.min(playbackEndQuarters || quarter, quarter));
  if (playbackLooping && (position < playbackLoopRange.start || position >= playbackLoopRange.end)) {
    position = playbackLoopRange.start;
  }
  releasePlaybackVoices();
  transport.ticks = quartersToTicks(position, transport.PPQ);
  if (!playbackLooping && playbackState === "playing" && position >= playbackEndQuarters) {
    finishPlayback(playbackEpoch);
  }
  return position;
}

export function playNote(
  name: string,
  durationInSeconds = 0.5,
  velocity?: number,
  trackIndex?: number,
): void {
  const synth = trackIndex === undefined
    ? activeSynth
    : trackVoices.get(trackIndex)?.synth ?? activeSynth;
  synth?.triggerAttackRelease(name, durationInSeconds, "+0.01", velocity);
}

export function stopAudio(): void {
  ++playbackEpoch;
  playbackState = "stopped";
  playbackCallbacks = null;
  const transport = Tone.getTransport();
  transport.stop();
  transport.cancel();
  endingEventId = null;
  currentPart?.dispose();
  currentPart = null;
  releasePlaybackVoices();
}
