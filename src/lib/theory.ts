import { Key, Chord, Progression, Note } from "@tonaljs/tonal";

export interface NoteEvent {
  midi: number;
  name: string;
  timeStart: number;
  duration: number;
  velocity: number;
}

export interface ChordEvent {
  name: string;
  timeStart: number;
  duration: number;
}

export interface ProgressionData {
  notes: NoteEvent[];
  chords: ChordEvent[];
  totalBars: number;
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
  const MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11];
  const MINOR_INTERVALS = [0, 2, 3, 5, 7, 8, 10];

  let bestScore = -1;
  let bestRoot = "C";
  let bestMode: "major" | "minor" = "major";

  const firstBassChroma = Note.chroma(firstBassPc);

  for (let rootIdx = 0; rootIdx < 12; rootIdx++) {
    const rootName = ROOT_NAMES[rootIdx];

    // Score Major
    let scoreMaj = 0;
    for (let interval of MAJOR_INTERVALS) {
      let c = (rootIdx + interval) % 12;
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
    for (let interval of MINOR_INTERVALS) {
      let c = (rootIdx + interval) % 12;
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
  if (level < 20) return roman;
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

export function generateSequence(
  root: string,
  mode: "major" | "minor",
  bars: number,
  dissonance: number, // 0-100
  complexity: number, // 0-100
): ProgressionData {
  let notesOut: NoteEvent[] = [];
  let chordsOut: ChordEvent[] = [];
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
      const minorMap: Record<string, string> = {
        I: "i",
        ii: "iidim",
        iii: "III",
        IV: "iv",
        V: "V",
        vi: "VI",
        vii: "vii",
      };
      roman = minorMap[baseRoman] || baseRoman;
    }

    const modifiedRoman = applyDissonance(roman, dissonance);

    let chordNames = Progression.fromRomanNumerals(root, [modifiedRoman]);
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
      let stepSize = complexity > 80 ? 0.25 : 0.5; // 16th notes vs 8th notes
      let numSteps = patternDuration / stepSize;

      let arpPattern = Math.random();
      const upperPitches = chordPitches.slice(1);

      for (let s = 0; s < numSteps; s++) {
        const isDownbeat = s % (1.0 / stepSize) === 0;

        // Add bass note on strong beats
        if (isDownbeat) {
          let bassStr = chordPitches[0];
          notesOut.push({
            name: bassStr,
            midi: Note.midi(bassStr) || 48,
            timeStart: humanizeTime(t),
            duration: 1.0,
            velocity: humanizeVelocity(0.75),
          });
        }

        let noteIndex = 0;
        let pLen = upperPitches.length;

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
            Note.fromMidi((Note.midi(pitchStr) || 60) + octaveShift) ||
            pitchStr;
        }

        notesOut.push({
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

  return { notes: notesOut, chords: chordsOut, totalBars: bars };
}

export function applyVariationToProgression(
  prog: ProgressionData,
  dissonance: number,
  complexity: number,
  root: string = "C",
  mode: "major" | "minor" = "major",
): ProgressionData {
  let newNotes: NoteEvent[] = [];

  const humanizeTime = (t: number) =>
    Math.max(0, t + (Math.random() * 0.02 - 0.01));
  const humanizeVel = (v: number) =>
    Math.max(0.1, Math.min(1.0, v + (Math.random() * 0.1 - 0.05)));

  const MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11];
  const MINOR_INTERVALS = [0, 2, 3, 5, 7, 8, 10];
  const intervals = mode === "minor" ? MINOR_INTERVALS : MAJOR_INTERVALS;
  const rootChroma = Note.chroma(root) || 0;

  const scaleChromas = new Set(intervals.map((i) => (rootChroma + i) % 12));

  const snapToScale = (midi: number) => {
    if (dissonance > 85) return midi; // let high dissonance notes remain out of scale
    let chroma = midi % 12;
    if (scaleChromas.has(chroma)) return midi;
    if (scaleChromas.has((chroma + 1) % 12)) return midi + 1;
    if (scaleChromas.has((chroma + 11) % 12)) return midi - 1;
    return midi + 1;
  };

  // 1. Group notes by timeStart
  const eps = 0.05;
  let groups: NoteEvent[][] = [];
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
           newMidi += Math.random() > 0.5 ? 12 : -12;
         }
         
         // grace note
         if (complexity > 70 && dissonance > 50 && Math.random() > 0.8) {
            let graceMidi = snapToScale(newMidi - Math.floor(Math.random() * 2 + 1));
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
      let sortedGroup = [...group];
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
