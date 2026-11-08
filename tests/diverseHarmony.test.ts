import { describe, expect, it } from "vitest";
import { generateFromMelody, type MelodyGenerationOptions } from "../src/lib/adaptive";
import { seededRandom } from "../src/lib/random";
import { trackIndexOf } from "../src/lib/tracks";
import { EVALUATION_FIXTURES, makeFixtureProgression } from "./musicQualityFixtures";
import { chordPathDiversity, chordTailSpill, chordToneCoverage, structuralTakeDiversity } from "./musicQualityMetrics";

const basic: MelodyGenerationOptions = {
  sourceTrackIndex: 0, root: "C", mode: "major", tension: 35,
  harmonicFit: 85, density: "balanced", keyStrategy: "manual",
  harmonicPacing: "adaptive",
};

function succeed(
  input: ReturnType<typeof makeFixtureProgression>,
  options: MelodyGenerationOptions, seed = 2026,
) {
  const result = generateFromMelody(input, options, seededRandom(seed));
  if (!result.ok) throw Error(result.reason);
  return result;
}

describe("quality-bounded diverse global chord search", () => {
  it("preserves the original deterministic Viterbi path at exploration zero", () => {
    const data = makeFixtureProgression(EVALUATION_FIXTURES[0]);
    const a = succeed(data, {...basic}, 10);
    const b = succeed(data, {...basic, harmonyExploration: 0}, 10);
    expect(a).toEqual(b);
    expect(a.alternativesConsidered).toBeUndefined();
    expect(data.notes).toEqual(makeFixtureProgression(EVALUATION_FIXTURES[0]).notes);
  });

  it("generates globally distinct alternatives while preserving literal source MIDI", () => {
    const fixture = EVALUATION_FIXTURES.find(f => f.id === "half-bar-pivot")!;
    const source = makeFixtureProgression(fixture);
    const snapshot = structuredClone(source);
    const paths = [];
    for (let i = 0; i < 12; i++) {
      const result = succeed(source, {...basic, harmonyExploration: 82}, 6000 + i * 41);
      expect(result.alternativesConsidered).toBeGreaterThanOrEqual(1);
      expect(result.chordFitRetained).toBeGreaterThanOrEqual(0);
      expect(result.chordFitRetained).toBeLessThanOrEqual(1);
      expect(result.progression.notes.filter(n => trackIndexOf(n) === 0)).toEqual(source.notes);
      expect(result.progression.tracks?.find(t => t.index === 0)).toEqual(source.tracks?.[0]);
      const generated = result.progression.notes.filter(n => trackIndexOf(n) !== 0);
      expect(chordTailSpill(generated, result.progression.chords)).toBe(0);
      paths.push(result.progression.chords);
    }
    expect(source).toEqual(snapshot);
    expect(chordPathDiversity(paths)).toBeGreaterThan(0.15);
  });

  it("keeps chord-tone fit close to the original melody-conditioned path", () => {
    for (const fixture of EVALUATION_FIXTURES) {
      const source = makeFixtureProgression(fixture);
      const options = {...basic, root: fixture.root, mode: fixture.mode};
      const legacy = succeed(source, {...options, harmonyExploration: 0}, 100);
      const oldFit = chordToneCoverage(source.notes, legacy.progression.chords);
      for (let i = 0; i < 5; i++) {
        const next = succeed(source, {...options, harmonyExploration: 62}, 100 + i * 19);
        const fit = chordToneCoverage(source.notes, next.progression.chords);
        expect(fit, fixture.id + ": chord fit lost too much").toBeGreaterThanOrEqual(
          oldFit - 0.07);
        expect(next.progression.notes.filter(n => trackIndexOf(n) === 0)).toEqual(source.notes);
      }
    }
  });

  it("does not accumulate generated tracks, replaces previous chord paths coherently", () => {
    const data = makeFixtureProgression(EVALUATION_FIXTURES[0]);
    const first = succeed(data, {...basic, harmonyExploration: 70}, 10);
    const second = succeed(first.progression, {...basic, harmonyExploration: 70}, 12);
    expect(second.generatedTrackIndices).toEqual(first.generatedTrackIndices);
    expect(second.progression.tracks).toEqual(first.progression.tracks);
    expect(second.progression.notes.filter(n => trackIndexOf(n) === 0)).toEqual(data.notes);
    expect(second.progression.chords.every(c => c.generatedSourceTrackIndex === 0)).toBe(true);
    expect(second.progression.chords.filter(c => c.timeStart === 0).length).toBe(1);
    if ((second.alternativesConsidered ?? 0) > 1) expect(second.changedChordRegions).toBeGreaterThan(0);
  });

  it("preserves user tracks and generated notes outside a selected phrase", () => {
    const data = makeFixtureProgression(EVALUATION_FIXTURES[0]);
    const previous = succeed(data, {...basic, harmonyExploration: 55}, 1);
    const originals = previous.progression.notes.filter(n => trackIndexOf(n) === 0);
    const owned = new Set(previous.generatedTrackIndices);
    const untouched = previous.progression.notes.filter(n =>
      owned.has(trackIndexOf(n)) && n.timeStart < 4);
    const updated = succeed(previous.progression, {
      ...basic, harmonyExploration: 92, sourceScope: "selected",
      sourceNoteIndices: [4, 5, 6],
    }, 89);
    expect(updated.progression.notes.filter(n =>
      owned.has(trackIndexOf(n)) && n.timeStart < 4)).toEqual(untouched);
    expect(updated.progression.notes.filter(n => trackIndexOf(n) === 0)).toEqual(originals);
    expect(updated.generatedTrackIndices).toEqual(previous.generatedTrackIndices);
  });

  it("regeneration prefers a meaningfully different chord path whenever safe options exist", () => {
    let eligible = 0, changed = 0;
    for (const fixture of EVALUATION_FIXTURES) {
      const data = makeFixtureProgression(fixture);
      const options = {...basic, root: fixture.root, mode: fixture.mode, harmonyExploration: 75};
      for (let seed = 0; seed < 4; seed++) {
        const first = succeed(data, options, 300 + seed);
        const alt = succeed(first.progression, options, 400 + seed);
        expect(alt.progression.tracks).toEqual(first.progression.tracks);
        expect(alt.progression.notes.filter(n => trackIndexOf(n) === 0)).toEqual(data.notes);
        expect(alt.changedChordRegions).toBeGreaterThanOrEqual(0);
        if ((alt.alternativesConsidered ?? 0) > 1) {
          eligible++;
          if ((alt.changedChordRegions ?? 0) > 0) changed++;
        }
      }
    }
    expect(eligible).toBeGreaterThan(10);
    expect(changed).toBe(eligible);
  });

  it("produces reproducible choices and meaningful structural backing variety", () => {
    const f = EVALUATION_FIXTURES.find(f => f.id === "pop-arch")!;
    const data = makeFixtureProgression(f);
    const variants = [];
    for (let seed = 0; seed < 10; seed++) {
      const next = succeed(data, {...basic, harmonyExploration: 80}, seed + 500);
      const repeat = succeed(data, {...basic, harmonyExploration: 80}, seed + 500);
      expect(next).toEqual(repeat);
      variants.push(next.progression.notes.filter(n => trackIndexOf(n) !== 0));
    }
    expect(structuralTakeDiversity(variants)).toBeGreaterThan(0.1);
  });

  it("rejects invalid exploration inputs instead of silently producing unstable search", () => {
    const data = makeFixtureProgression(EVALUATION_FIXTURES[0]);
    for (const value of [Number.NaN, Infinity, -1, 101]) {
      const result = generateFromMelody(data, {...basic, harmonyExploration: value});
      expect(result).toEqual({ok: false, reason: "Harmony exploration must be between 0 and 100."});
    }
  });
});
