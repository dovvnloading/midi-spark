import { Chord, Note } from "@tonaljs/tonal";
import { describe, expect, it } from "vitest";
import { generateSequence } from "../src/lib/theory";
import { seededRandom } from "../src/lib/random";
import { chooseUpperVoicing } from "../src/lib/voicing";

describe("bounded voice-leading", () => {
  it("uses each chord tone once without crossing, even across inversions", () => {
    let previous: number[] = [];
    for (const pitchClasses of [
      [4, 7, 11], // Cmaj7 upper voices
      [9, 0, 4],  // Fmaj7
      [11, 2, 5], // G7
      [4, 7, 11], // Cmaj7
    ]) {
      const voiced = chooseUpperVoicing(pitchClasses, previous);
      expect(voiced).toHaveLength(pitchClasses.length);
      expect([...voiced].sort((a, b) => a - b)).toEqual(voiced);
      expect(voiced.every(midi => midi >= 55 && midi <= 84)).toBe(true);
      expect(voiced.map(midi => midi % 12).sort((a, b) => a - b))
        .toEqual([...pitchClasses].sort((a, b) => a - b));
      if (previous.length) {
        const movement = voiced.reduce((sum, midi, i) => sum + Math.abs(midi - previous[i]), 0);
        expect(movement).toBeLessThanOrEqual(19);
      }
      previous = voiced;
    }
  });

  it("preserves a single upper chord tone and supports added/removed extensions", () => {
    const single = chooseUpperVoicing([7]);
    expect(single).toHaveLength(1);
    expect(single[0] % 12).toBe(7);
    const extended = chooseUpperVoicing([4, 7, 11, 2, 9], single);
    expect(extended).toHaveLength(5);
    expect(extended.every((midi, i) => i === 0 || midi > extended[i - 1])).toBe(true);
    const contracted = chooseUpperVoicing([4, 7, 11], extended);
    expect(contracted).toHaveLength(3);
  });
});

describe("minor harmony and rhythmic calibration", () => {
  const roots = ["C","C#","D","Eb","E","F","F#","G","Ab","A","Bb","B"];

  it("resolves explicit minor functions in all keys without Tonal parser fallback", () => {
    let encounteredDominant = false;
    let encounteredFlatDegree = false;
    for (const root of roots) {
      for (const tension of [0, 30, 60, 90]) {
        for (const seed of [11, 31, 53, 79]) {
          const result = generateSequence(root, "minor", 4, tension, 10, false, seededRandom(seed));
          for (const chord of result.chords) {
            const parsed = Chord.get(chord.name);
            expect(parsed.empty, `${root}/${tension}: unparseable ${chord.name}`).toBe(false);
            expect(parsed.notes.length).toBeGreaterThanOrEqual(3);
            for (const note of result.notes) {
              expect(note.midi).toBeGreaterThanOrEqual(0);
              expect(note.midi).toBeLessThanOrEqual(127);
              expect(Note.midi(note.name)).toBe(note.midi);
            }
            // Named flats are validated by the pitch-class, not enharmonic spelling.
            if (chord.name.startsWith("G") && root === "C") encounteredDominant = true;
            if (chord.name.startsWith("Ab") && root === "C") encounteredFlatDegree = true;
          }
        }
      }
    }
    expect(encounteredDominant).toBe(true);
    expect(encounteredFlatDegree).toBe(true);
  });

  it("increases distinct rhythmic subdivisions across complexity tiers", () => {
    // Count anchored onsets, not simultaneous chord tones: a richer arpeggio
    // can contain fewer MIDI notes but *more rhythmic events* than a block stab.
    const onsets = (complexity: number) => {
      const result = generateSequence("C", "major", 4, 40, complexity, false, seededRandom(253));
      return new Set(result.notes
        .filter(note => note.timeStart < 4)
        .map(note => Math.round(note.timeStart * 4) / 4)).size;
    };
    expect(onsets(60)).toBeGreaterThan(onsets(55));
    expect(onsets(95)).toBeGreaterThan(onsets(60));
  });

  it("remains reproducible across layered and non-layered voicing paths", () => {
    const plain = generateSequence("G", "minor", 4, 70, 64, false, seededRandom(900));
    const layered = generateSequence("G", "minor", 4, 70, 64, true, seededRandom(900));
    expect(layered.notes.map(({ trackIndex: _index, ...note }) => note)).toEqual(plain.notes);
    expect(layered.chords).toEqual(plain.chords);
    expect(new Set(layered.notes.map(note => note.trackIndex))).toEqual(new Set([0, 1]));
  });
});
