import * as Tone from "tone";
import { ProgressionData } from "./theory";

let classicSynth: Tone.PolySynth;
let epianoSynth: Tone.PolySynth;
let padSynth: Tone.PolySynth;
let pluckSynth: Tone.PolySynth;
let dreamSynth: Tone.PolySynth;

let activeSynth: Tone.PolySynth;
let currentPart: Tone.Part | null = null;

export type SynthType = "classic" | "epiano" | "pad" | "pluck" | "dream";

export async function initAudio() {
  await Tone.start();

  if (!classicSynth) {
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
    classicSynth.chain(classicChorus, classicReverb, Tone.Destination);

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
    epianoSynth.chain(epTremolo, epChorus, epReverb, Tone.Destination);

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
    padSynth.chain(padPhaser, padWidener, padReverb, Tone.Destination);

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
    pluckSynth.chain(pluckDelay, pluckReverb, Tone.Destination);

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
    dreamSynth.chain(dreamChorus, dreamDelay, dreamReverb, Tone.Destination);

    activeSynth = classicSynth;
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

export function playChord(notes: string[], duration: number) {
  if (!activeSynth) return;
  const time = `+0.05`;
  activeSynth.triggerAttackRelease(notes, duration * (60 / 120), time);
}

export function updateProgressionLive(data: ProgressionData, bpm: number, isLooping?: boolean) {
  if (!activeSynth || !currentPart) return;
  Tone.Transport.bpm.value = bpm;
  const Q = 60 / bpm;
  currentPart.clear();
  data.notes.forEach((note) => {
    currentPart?.add(note.timeStart * Q, { ...note, time: note.timeStart * Q });
  });

  const maxNoteEnd = data.notes.reduce(
    (max, n) => Math.max(max, n.timeStart + n.duration),
    0,
  );
  const playheadMaxTick = Math.max(data.totalBars * 4, maxNoteEnd);
  const totalDurationSec = playheadMaxTick * Q;

  if (isLooping !== undefined) {
    Tone.Transport.loop = isLooping;
  }

  if (Tone.Transport.loop) {
    Tone.Transport.setLoopPoints(0, totalDurationSec);
  } else {
    Tone.Transport.setLoopPoints(0, 0); // Reset or we just rely on logic in playProgression
  }
}

export function playProgression(
  data: ProgressionData,
  bpm: number,
  onTick: (timeQuarters: number) => void,
  startTickQuarters: number = 0,
  isLooping: boolean = false,
) {
  if (!activeSynth) return;

  Tone.Transport.stop();
  Tone.Transport.cancel();
  Tone.Transport.bpm.value = bpm;

  const Q = 60 / bpm; // One quarter note in seconds

  if (currentPart) {
    currentPart.dispose();
  }

  currentPart = new Tone.Part(
    (time, note) => {
      const durationSec = note.duration * Q * 0.9;
      activeSynth?.triggerAttackRelease(
        note.name,
        durationSec,
        time,
        note.velocity,
      );
    },
    data.notes.map((n) => ({ ...n, time: n.timeStart * Q })),
  );

  currentPart.start(0);

  // Repeating schedule to update UI playhead
  Tone.Transport.scheduleRepeat((time) => {
    Tone.Draw.schedule(() => {
      onTick(Tone.Transport.ticks / Tone.Transport.PPQ);
    }, time);
  }, "16n");

  // Loop or Auto-stop at the end of the last note or totalBars, whichever is longer.
  const maxNoteEnd = data.notes.reduce(
    (max, n) => Math.max(max, n.timeStart + n.duration),
    0,
  );
  const playheadMaxTick = Math.max(data.totalBars * 4, maxNoteEnd);

  const totalDurationSec = playheadMaxTick * Q;

  if (isLooping) {
    Tone.Transport.setLoopPoints(0, totalDurationSec);
    Tone.Transport.loop = true;
  } else {
    Tone.Transport.loop = false;
    if (totalDurationSec > 0) {
      Tone.Transport.schedule((time) => {
        Tone.Transport.stop();
        Tone.Draw.schedule(() => {
          onTick(0);
        }, time);
      }, totalDurationSec);
    }
  }

  // Start from offset if provided
  if (startTickQuarters > 0) {
    Tone.Transport.seconds = startTickQuarters * Q;
  }
  Tone.Transport.start();
}

export function seekAudio(tickQuarters: number, bpm: number) {
  const Q = 60 / bpm;
  Tone.Transport.seconds = tickQuarters * Q;
}

export function playNote(
  name: string,
  durationInSeconds: number = 0.5,
  velocity?: number,
) {
  if (!activeSynth) return;
  activeSynth.triggerAttackRelease(name, durationInSeconds, "+0.01", velocity);
}

export function stopAudio() {
  Tone.Transport.stop();
  Tone.Transport.cancel();
  if (activeSynth) activeSynth.releaseAll();
}

export function updatePlaybackNotes(notes: any[], bpm: number) {
  if (!currentPart || Tone.Transport.state !== "started") return;

  const Q = 60 / bpm;
  currentPart.clear();
  notes.forEach((n) => {
    currentPart?.add(n.timeStart * Q, n);
  });
}
