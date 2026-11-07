import { Chord, Progression, Note } from "@tonaljs/tonal";
import { clamp } from "./constants";

export interface NoteEvent {
  midi: number;
  name: string;
  timeStart: number;
  duration: number;
  velocity: number;
  /** 0-based index of the source MIDI track this note came from, counting
   *  only non-percussion tracks in file order — a single-track import always
   *  tags its notes 0, and multi-track imports get contiguous 0,1,2,...
   *  regardless of any skipped percussion tracks in between. Undefined for
   *  notes from generateSequence/applyVariationToProgression or notes drawn
   *  directly in the piano roll — only MIDI import ever sets this. */
  trackIndex?: number;
}

export interface ChordEvent {
  name: string;
  timeStart: number;
  duration: number;
}

export interface TrackMetadata {
  index: number;
  name: string;
  /** General MIDI program (0-127), if known. */
  program?: number;
  /** Original MIDI channel (0-15); percussion is not imported. */
  channel?: number;
}

export interface ProgressionData {
  notes: NoteEvent[];
  chords: ChordEvent[];
  totalBars: number;
  /** Original melodic-track headers; generated sessions may omit these. */
  tracks?: TrackMetadata[];
  /** Monotonic per-project allocator; optional for legacy sessions. */
  nextTrackIndex?: number;
}

export const MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11];
export const MINOR_INTERVALS = [0, 2, 3, 5, 7, 8, 10];

/** Pitch classes (0-11) diatonic to `root`/`mode`. Shared by key detection
 *  scoring and the piano roll's scale-highlight overlay. */
export function getScaleChromas(
  root: string,
  mode: "major" | "minor",
): Set<number> {
  const rootChroma = Note.chroma(root) || 0;
  const intervals = mode === "minor" ? MINOR_INTERVALS : MAJOR_INTERVALS;
  return new Set(intervals.map((i) => (rootChroma + i) % 12));
}

export function detectKeyFromProgression(progression: ProgressionData): {
  root: string;
  mode: "major" | "minor";
} {
  const pcDurations: Record<number, number> = {};
  let firstBassPc = "";
  let firstBassTime = Infinity;

  progression.notes.forEach((n) => {
    const chroma = Note.chroma(n.name);
    if (chroma === undefined) return;

    if (!pcDurations[chroma]) pcDurations[chroma] = 0;
    pcDurations[chroma] += n.duration;

    const oct = Note.octave(n.name) || 4;
    if (oct < 4 && n.timeStart < firstBassTime) {
      firstBassTime = n.timeStart;
      firstBassPc = n.name;
    }
  });

  const ROOT_NAMES = [
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
  ];

  let bestScore = -1;
  let bestRoot = "C";
  let bestMode: "major" | "minor" = "major";

  const firstBassChroma = Note.chroma(firstBassPc);

  for (let rootIdx = 0; rootIdx < 12; rootIdx++) {
    const rootName = ROOT_NAMES[rootIdx];

    // Score Major
    let scoreMaj = 0;
    for (const interval of MAJOR_INTERVALS) {
      const c = (rootIdx + interval) % 12;
      scoreMaj += pcDurations[c] || 0;
    }
    if (firstBassChroma === rootIdx) {
      scoreMaj *= 1.2;
    }

    if (scoreMaj > bestScore) {
      bestScore = scoreMaj;
      bestRoot = rootName;
      bestMode = "major";
    }

    // Score Minor
    let scoreMin = 0;
    for (const interval of MINOR_INTERVALS) {
      const c = (rootIdx + interval) % 12;
      scoreMin += pcDurations[c] || 0;
    }
    if (firstBassChroma === rootIdx) {
      scoreMin *= 1.2;
    }

    if (scoreMin > bestScore) {
      bestScore = scoreMin;
      bestRoot = rootName;
      bestMode = "minor";
    }
  }

  return { root: bestRoot, mode: bestMode };
}

// Simple templates of roman numeral progressions
const PROGRESSIONS = [
  ["I", "V", "vi", "IV"],
  ["ii", "V", "I", "vi"],
  ["I", "vi", "ii", "V"],
  ["I", "IV", "V", "I"],
  ["vi", "IV", "I", "V"],
  ["ii", "vi", "IV", "V"],
  ["I", "iii", "IV", "V"],
  ["IV", "V", "iii", "vi"], // Modern pop / R&B
  ["I", "I7", "IV", "iv"], // Classic pop turnaround
  ["vi", "V", "IV", "III"], // Andalusian cadence
];

function applyDissonance(roman: string, level: number): string {
  // Tonal's roman-numeral parser derives quality ONLY from an explicit chord
  // suffix, never from case — bare "vi" resolves to A MAJOR in C. So minor
  // degrees must always carry a quality marker.
  const isMinorDegree = roman === roman.toLowerCase();
  // Degrees that already carry a quality (e.g. "I7", "im7", "iim7b5") would
  // get a second suffix stacked on ("I7maj7" -> unparseable). Leave them.
  if (/[^IViv b#]/.test(roman)) {
    return roman;
  }
  if (level < 20) {
    return isMinorDegree ? roman + "m" : roman;
  }
  if (level < 40) {
    if (roman.toUpperCase() === "V") return roman + "7";
    if (roman === roman.toLowerCase()) return roman + "m7";
    return roman + "maj7";
  }
  if (level < 70) {
    if (roman.toUpperCase() === "V") return roman + "9";
    if (roman === roman.toLowerCase()) return roman + "m9";
    return roman + "maj9";
  }
  if (level < 85) {
    if (roman.toUpperCase() === "V")
      return Math.random() > 0.5 ? "subV7" : roman + "13";
    if (roman === roman.toLowerCase()) return roman + "m11";
    return roman + "maj13";
  }
  if (roman.toUpperCase() === "V")
    return Math.random() > 0.5 ? "subV7" : roman + "7alt";
  if (roman === roman.toLowerCase()) return roman + "m11";
  return roman + "maj13#11";
}

/** Keep octave-displaced notes inside a musically useful MIDI window so the
 *  name/midi pair never falls back out of sync at the range edges. */
function shiftOctaveClamped(midi: number, shift: number): number {
  const shifted = midi + shift;
  if (shifted < 21 || shifted > 108) return midi;
  return shifted;
}

export function generateSequence(
  root: string,
  mode: "major" | "minor",
  bars: number,
  dissonance: number, // 0-100
  complexity: number, // 0-100
  splitTracks = false,
): ProgressionData {
  const notesOut: NoteEvent[] = [];
  const chordsOut: ChordEvent[] = [];
  let currentTime = 0; // in quarters

  const template =
    PROGRESSIONS[Math.floor(Math.random() * PROGRESSIONS.length)];

  const humanizeTime = (t: number) =>
    Math.max(0, t + (Math.random() * 0.04 - 0.02));
  const humanizeVelocity = (v: number) =>
    Math.max(0.1, Math.min(1.0, v + (Math.random() * 0.15 - 0.075)));

  let prevUpperMidiCenter = 64; // roughly E4 for voice leading

  for (let bar = 0; bar < bars; bar++) {
    const baseRoman = template[bar % template.length];

    let roman = baseRoman;
    if (mode === "minor") {
      // Natural-minor degrees. Flat prefixes matter: tonal resolves plain
      // uppercase romans against the MAJOR scale of the tonic, so "III" in
      // C minor would come out E major instead of Eb. "iim7b5" is spelled out
      // because the parser rejects "iidim" entirely.
      const minorMap: Record<string, string> = {
        I: "i",
        I7: "im7",
        ii: "iim7b5",
        iii: "bIII",
        III: "bIII",
        IV: "iv",
        V: "V",
        vi: "bVI",
        vii: "bVII",
      };
      roman = minorMap[baseRoman] || baseRoman;
    }

    const modifiedRoman = applyDissonance(roman, dissonance);

    const chordNames = Progression.fromRomanNumerals(root, [modifiedRoman]);
    let chordName = chordNames[0] || root + (mode === "major" ? "M" : "m");

    if (modifiedRoman.includes("subV")) {
      const vRoot = Note.transpose(root, "P5");
      const tritoneRoot = Note.transpose(vRoot, "d5");
      chordName = tritoneRoot + "7";
    }

    const chordObj = Chord.get(chordName);

    // Voicing strategy: root in bass, others voiced near previous chord (voice leading)
    let chordPitches: string[] = [];
    if (chordObj.notes.length > 0) {
      chordPitches.push(chordObj.notes[0] + "2"); // Low bass note

      const upperNotes = chordObj.notes.slice(1);
      if (upperNotes.length === 0) upperNotes.push(chordObj.notes[0]);

      upperNotes.forEach((n) => {
        let midi = Note.midi(n + "4") || 60;
        // Shift octave to minimize distance to previous center
        if (midi > prevUpperMidiCenter + 6) midi -= 12;
        if (midi < prevUpperMidiCenter - 6) midi += 12;
        chordPitches.push(Note.fromMidi(midi) || n + "4");
      });

      // Update center of mass for next bar
      const upperMidis = chordPitches.slice(1).map((n) => Note.midi(n) || 60);
      prevUpperMidiCenter =
        upperMidis.reduce((a, b) => a + b, 0) / upperMidis.length;
    } else {
      chordPitches = [root + "2", root + "4"];
    }

    const patternDuration = 4; // 4 quarters per bar

    chordsOut.push({
      name: chordName,
      timeStart: currentTime,
      duration: patternDuration,
    });

    // Pattern generation based on rhythmic complexity
    if (complexity < 20) {
      // Sustained Block Chords with a natural strum
      chordPitches.forEach((n, i) => {
        const isTop = i === chordPitches.length - 1;
        const strumOffset = i * 0.015;
        notesOut.push({
          ...(splitTracks ? { trackIndex: i === 0 ? 0 : 1 } : {}),
          name: n,
          midi: Note.midi(n) || 60,
          timeStart: humanizeTime(currentTime + strumOffset),
          duration: patternDuration - strumOffset - 0.1, // slight release gap
          velocity: humanizeVelocity(
            0.55 + (isTop ? 0.15 : 0) - (i === 0 ? -0.1 : 0),
          ),
        });
      });
    } else if (complexity < 60) {
      // Syncopated Block Chords & Rhythms
      let t = currentTime;
      let hits = [4];

      if (complexity > 20) {
        const rand = Math.random();
        if (rand > 0.8)
          hits = [1.5, 1.5, 1]; // Tresillo
        else if (rand > 0.6)
          hits = [2.5, 1.5]; // Offbeat anticipation
        else if (rand > 0.4)
          hits = [1, 2, 1]; // Syncopation
        else hits = [2, 2]; // Half notes
      }
      if (complexity > 45) {
        const rand = Math.random();
        if (rand > 0.8)
          hits = [0.75, 0.75, 1.5, 1]; // Bouncy
        else if (rand > 0.6) hits = [1.5, 0.75, 0.75, 1];
        else if (rand > 0.4) hits = [0.5, 1, 1.5, 1];
        else hits = [0.5, 0.5, 1, 0.5, 1.5];
      }

      hits.forEach((duration, hitIdx) => {
        chordPitches.forEach((n, idx) => {
          const strumOffset = Math.random() * 0.02;
          const isTop = idx === chordPitches.length - 1;
          const isBass = idx === 0;

          // Drop bass on offbeats occasionally for lighter, modern feel
          if (isBass && hitIdx > 0 && Math.random() > 0.5) return;

          notesOut.push({
            ...(splitTracks ? { trackIndex: isBass ? 0 : 1 } : {}),
            name: n,
            midi: Note.midi(n) || 60,
            timeStart: humanizeTime(t + strumOffset),
            duration: duration * 0.85,
            velocity: humanizeVelocity(
              0.6 + (hitIdx === 0 ? 0.1 : -0.1) + (isTop ? 0.1 : 0),
            ),
          });
        });
        t += duration;
      });
    } else {
      // Arpeggios and ostinatos
      let t = currentTime;
      const stepSize = complexity > 80 ? 0.25 : 0.5; // 16th notes vs 8th notes
      const numSteps = patternDuration / stepSize;

      const arpPattern = Math.random();
      const upperPitches = chordPitches.slice(1);

      for (let s = 0; s < numSteps; s++) {
        const isDownbeat = s % (1.0 / stepSize) === 0;

        // Add bass note on strong beats
        if (isDownbeat) {
          const bassStr = chordPitches[0];
          notesOut.push({
            ...(splitTracks ? { trackIndex: 0 } : {}),
            name: bassStr,
            midi: Note.midi(bassStr) || 48,
            timeStart: humanizeTime(t),
            duration: 1.0,
            velocity: humanizeVelocity(0.75),
          });
        }

        let noteIndex: number;
        const pLen = upperPitches.length;

        // Use musical melodic shapes
        if (arpPattern < 0.3) {
          // Up and down
          noteIndex = s % (pLen * 2 - 2);
          if (noteIndex >= pLen) noteIndex = 2 * pLen - 2 - noteIndex;
        } else if (arpPattern < 0.6) {
          // Alberti-ish (Low, High, Mid, High)
          const alberti = [0, pLen - 1, 1 % pLen, pLen - 1];
          noteIndex = alberti[s % 4] % pLen;
        } else {
          // Rolling up
          noteIndex = s % pLen;
        }

        let pitchStr = upperPitches[noteIndex] || upperPitches[0];

        // Random octave displacement if high dissonance
        if (dissonance > 60 && Math.random() > 0.85) {
          const octaveShift = Math.random() > 0.5 ? 12 : -12;
          pitchStr =
            Note.fromMidi(
              shiftOctaveClamped(Note.midi(pitchStr) || 60, octaveShift),
            ) || pitchStr;
        }

        notesOut.push({
          ...(splitTracks ? { trackIndex: 1 } : {}),
          name: pitchStr,
          midi: Note.midi(pitchStr) || 60,
          timeStart: humanizeTime(t),
          duration: stepSize * 0.9,
          velocity: humanizeVelocity(0.55 + (isDownbeat ? 0.1 : 0)),
        });

        t += stepSize;
      }
    }

    currentTime += patternDuration;
  }

  return {
    notes: notesOut, chords: chordsOut, totalBars: bars,
    ...(splitTracks ? {
      tracks: [
        { index: 0, name: "Bass", program: 33, channel: 0 },
        { index: 1, name: "Harmony", program: 0, channel: 1 },
      ],
      nextTrackIndex: 2,
    } : {}),
  };
}

export function applyVariationToProgression(
  prog: ProgressionData,
  dissonance: number,
  complexity: number,
  root: string = "C",
  mode: "major" | "minor" = "major",
): ProgressionData {
  const newNotes: NoteEvent[] = [];

  const humanizeTime = (t: number) =>
    Math.max(0, t + (Math.random() * 0.02 - 0.01));
  const humanizeVel = (v: number) =>
    Math.max(0.1, Math.min(1.0, v + (Math.random() * 0.1 - 0.05)));

  const scaleChromas = getScaleChromas(root, mode);

  const snapToScale = (midi: number) => {
    if (dissonance > 85) return midi; // let high dissonance notes remain out of scale
    const chroma = midi % 12;
    if (scaleChromas.has(chroma)) return midi;
    if (scaleChromas.has((chroma + 1) % 12)) return midi + 1;
    if (scaleChromas.has((chroma + 11) % 12)) return midi - 1;
    return midi + 1;
  };

  // 1. Group notes by timeStart
  const eps = 0.05;
  const groups: NoteEvent[][] = [];
  const sortedNotes = [...prog.notes].sort((a, b) => a.timeStart - b.timeStart || a.midi - b.midi);

  let currentGroup: NoteEvent[] = [];
  for (const n of sortedNotes) {
    if (currentGroup.length === 0) {
      currentGroup.push(n);
    } else {
      if (Math.abs(n.timeStart - currentGroup[0].timeStart) < eps) {
        currentGroup.push(n);
      } else {
        groups.push(currentGroup);
        currentGroup = [n];
      }
    }
  }
  if (currentGroup.length > 0) groups.push(currentGroup);

  // Pick a global rhythmic motif based on random so the whole progression has a cohesive feel
  // 0: Pulse/Repeats, 1: Arpeggio, 2: Syncopated Stabs, 3: Alternating (Oom-pah)
  const motifTypes = complexity > 70 ? [1, 2, 3] : complexity > 30 ? [0, 2, 3] : [-1];
  const globalMotif = motifTypes[Math.floor(Math.random() * motifTypes.length)];

  groups.forEach((group, groupIdx) => {
    // Determine chord duration (distance to next group, or max duration in group)
    let chordDur = Math.max(...group.map(n => n.duration));
    if (groupIdx < groups.length - 1) {
       const nextTime = groups[groupIdx + 1][0].timeStart;
       chordDur = Math.min(chordDur, Math.max(0.25, nextTime - group[0].timeStart));
    }

    if (group.length === 1 || globalMotif === -1) {
      // Just humanize and maybe add grace note
      group.forEach(n => {
         let newMidi = n.midi;
         // random octave jump
         if (dissonance > 80 && Math.random() > 0.9) {
           newMidi = shiftOctaveClamped(newMidi, Math.random() > 0.5 ? 12 : -12);
         }
         
         // grace note
         if (complexity > 70 && dissonance > 50 && Math.random() > 0.8) {
            const graceMidi = snapToScale(newMidi - Math.floor(Math.random() * 2 + 1));
            newNotes.push({
              ...n, midi: graceMidi, name: Note.fromMidi(graceMidi) || n.name,
              timeStart: humanizeTime(Math.max(0, n.timeStart - 0.125)),
              duration: 0.125, velocity: humanizeVel(n.velocity * 0.6)
            });
         }

         newNotes.push({
            ...n, midi: newMidi, name: Note.fromMidi(newMidi) || n.name,
            timeStart: humanizeTime(n.timeStart), velocity: humanizeVel(n.velocity)
         });
      });
      return;
    }

    const tStart = group[0].timeStart;

    if (globalMotif === 0) {
      // Pulse (e.g. 8th notes or quarter notes depending on duration)
      const step = chordDur >= 2 ? 1 : 0.5;
      const repeats = Math.floor(chordDur / step);
      for(let i=0; i<Math.max(1, repeats); i++) {
        group.forEach(n => {
           newNotes.push({
              ...n,
              timeStart: humanizeTime(tStart + i*step),
              duration: step * 0.8,
              velocity: humanizeVel(n.velocity * (i===0 ? 1.0 : 0.8))
           });
        });
      }
    } else if (globalMotif === 1) {
      // Arpeggio
      const step = chordDur / group.length;
      const dir = Math.random();
      const sortedGroup = [...group];
      if (dir < 0.3) sortedGroup.reverse();
      else if (dir < 0.6) sortedGroup.sort(() => Math.random() - 0.5);

      sortedGroup.forEach((n, i) => {
         newNotes.push({
            ...n,
            timeStart: humanizeTime(tStart + i*step),
            duration: Math.min(step * 0.9, n.duration),
            velocity: humanizeVel(n.velocity)
         });
      });
    } else if (globalMotif === 2) {
      // Syncopated
      // Bass on 1, chord stabs on offbeats
      const bass = group[0];
      const rest = group.slice(1);
      
      newNotes.push({
         ...bass, timeStart: humanizeTime(tStart), duration: chordDur, velocity: humanizeVel(bass.velocity)
      });

      // offbeats
      const offsets = [0.5, 1.5, 2.5, 3.5].filter(o => o < chordDur);
      if (offsets.length === 0) offsets.push(0); // fallback

      offsets.forEach(off => {
         rest.forEach(n => {
            newNotes.push({
               ...n,
               timeStart: humanizeTime(tStart + off),
               duration: Math.min(0.25, chordDur - off), // short stab
               velocity: humanizeVel(n.velocity * 0.9)
            });
         });
      });
    } else if (globalMotif === 3) {
      // Alternating / Oom-pah
      const bass = group[0];
      const rest = group.slice(1);
      
      const step = 0.5;
      const repeats = Math.floor(chordDur / step);
      for(let i=0; i<Math.max(1, repeats); i++) {
        if (i%2 === 0) { // bass
           newNotes.push({
              ...bass, timeStart: humanizeTime(tStart + i*step), duration: step*0.8, velocity: humanizeVel(bass.velocity)
           });
        } else { // chords
           rest.forEach(n => {
              newNotes.push({
                 ...n, timeStart: humanizeTime(tStart + i*step), duration: step*0.6, velocity: humanizeVel(n.velocity * 0.8)
              });
           });
        }
      }
    }
  });

  return {
    ...prog,
    notes: newNotes
  };
}

/** Grid spacing (in quarters) of an 8th note and a 16th note — the two
 *  subdivisions swing can be applied to. */
const EIGHTH = 0.5;
const SIXTEENTH = 0.25;
/** Tolerance (in quarters) for treating a note as aligned to a grid line
 *  despite generation/humanize jitter (up to +/-0.02 quarters). */
const SWING_GRID_EPS = 0.08;
/** Max delay (in quarters) applied at 100% swing to an off-beat 8th note
 *  (the "and" of the beat). Kept under `EIGHTH` so it can never reach — let
 *  alone cross — the following beat. */
const MAX_SWING_DELAY_EIGHTH = 0.45;
/** Max delay for an off-beat 16th note (the "e"/"a" of the beat). Kept under
 *  `SIXTEENTH` so it can never reach the following 8th-note position. */
const MAX_SWING_DELAY_SIXTEENTH = 0.2;

/** True if `timeStart` sits on an odd multiple of `grid` (i.e. an off-beat
 *  position at that subdivision), within humanize-jitter tolerance. */
function isOffBeatOnGrid(timeStart: number, grid: number): boolean {
  const gridPos = timeStart / grid;
  const nearest = Math.round(gridPos);
  const onGrid = Math.abs(gridPos - nearest) < SWING_GRID_EPS / grid;
  return onGrid && nearest % 2 !== 0;
}

/**
 * Destructive swing/humanize post-processor (applied explicitly, like CHOP,
 * rather than as a live playback transform — see OVERHAUL_PLAN.md 7.4).
 * Delays every off-beat 8th note (the "and") and every off-beat 16th note
 * (the "e"/"a") by an amount proportional to `swingAmount`; downbeats, and
 * any note not aligned to either grid, are left completely unchanged.
 * `swingAmount` 0 is a guaranteed no-op (same object returned).
 */
export function applySwing(
  progression: ProgressionData,
  swingAmount: number, // 0-100
): ProgressionData {
  const amount = clamp(swingAmount, 0, 100) / 100;
  if (amount === 0) return progression;

  const eighthDelay = amount * MAX_SWING_DELAY_EIGHTH;
  const sixteenthDelay = amount * MAX_SWING_DELAY_SIXTEENTH;

  const notes = progression.notes.map((n) => {
    if (isOffBeatOnGrid(n.timeStart, EIGHTH)) {
      return { ...n, timeStart: n.timeStart + eighthDelay };
    }
    if (isOffBeatOnGrid(n.timeStart, SIXTEENTH)) {
      return { ...n, timeStart: n.timeStart + sixteenthDelay };
    }
    return n;
  });

  return { ...progression, notes };
}
