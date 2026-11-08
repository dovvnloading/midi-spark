import { describe, expect, it } from "vitest";
import { generateFromMelody } from "../src/lib/adaptive";
import { generateMotif } from "../src/lib/motif";
import { seededRandom } from "../src/lib/random";
import { trackIndexOf } from "../src/lib/tracks";
import { EVALUATION_FIXTURES, makeFixtureProgression } from "./musicQualityFixtures";
import {
  baselineGreedyTriads, baselineTonic, chordChangeRate, chordTailSpill, chordPathDiversity,
  chordToneCoverage, fullIdentityPreserved, mean, meanIntervalMagnitude,
  nearLeadCollision, percentile, pitchClassEntropy, scaleToneRate, uniqueRenderRate, structuralTakeDiversity,
  type ChordPath,
} from "./musicQualityMetrics";

interface CaseResult {
  id: string;
  tonicCoverage: number;
  greedyCoverage: number;
  barCoverage: number;
  adaptiveCoverage: number;
  adaptiveChangesPerBar: number;
  harmonyCollision: number;
  tailSpill: number;
  backingPitchEntropy: number;
  backingScaleToneRate: number;
  backingUniqueRenderRate: number;
  backingStructuralDiversity: number;
  chordPathUniqueRate: number;
  continuationUniqueRenderRate: number;
  continuationStructuralDiversity: number;
  variationUniqueRenderRate: number;
  variationStructuralDiversity: number;
  continuationMeanInterval: number;
  seedCount: number;
}

interface SeedSample {
  fixtureId: string;
  seed: number;
  barCoverage: number;
  adaptiveCoverage: number;
  adaptiveChangesPerBar: number;
  nearLeadCollision: number;
  chordTailSpill: number;
  generatedBackingNotes: number;
  generatedContinuationNotes: number;
  generatedVariationNotes: number;
  /** Chord labels are needed for path-level comparisons across commits. */
  chordPath: Array<{ name: string; timeStart: number; duration: number }>;
}

interface QualityReport {
  benchmark: string;
  methodology: string;
  fixtures: number;
  seedsPerFixture: number;
  runs: number;
  results: CaseResult[];
  samples: SeedSample[];
  aggregate: Omit<CaseResult, "id" | "seedCount">;
  runtimeMs: { p50: number; p95: number; max: number };
  limitations: string[];
}

const SEEDS = Array.from({ length: 12 }, (_, i) => 202600 + i * 73);
const pcnt = (n: number) => (100 * n).toFixed(1) + "%";
const fixed = (n: number) => n.toFixed(2);

/** Run against executable production functions; no hardcoded simulated
 * generated results. Differences from actual neural model baselines
 * are NOT measured here. */
function runEvaluation(): QualityReport {
  const results: CaseResult[] = [];
  const samples: SeedSample[] = [];
  const timings: number[] = [];
  let runs = 0;

  for (const fixture of EVALUATION_FIXTURES) {
    const source = makeFixtureProgression(fixture);
    const sourceSnapshot = JSON.stringify(source);
    const melody = source.notes.filter(note => trackIndexOf(note) === 0);
    const tonicCoverage = chordToneCoverage(melody,
      baselineTonic(fixture.root, fixture.mode, fixture.bars));
    const greedyCoverage = chordToneCoverage(melody,
      baselineGreedyTriads(melody, fixture.root, fixture.mode, fixture.bars));

    const barCoverage: number[] = [];
    const adaptiveCoverage: number[] = [];
    const adaptiveChangesPerBar: number[] = [];
    const collisions: number[] = [];
    const spills: number[] = [];
    const entropies: number[] = [];
    const scaleRates: number[] = [];
    const backingTakes: Array<typeof melody> = [];
    const chordTakes: ChordPath[] = [];
    const continueTakes: Array<typeof melody> = [];
    const reimagineTakes: Array<typeof melody> = [];
    const continuationIntervals: number[] = [];

    for (const seed of SEEDS) {
      const baseOptions = {
        sourceTrackIndex: 0, root: fixture.root, mode: fixture.mode,
        tension: 35, harmonicFit: 85, density: "balanced" as const,
        keyStrategy: "manual" as const,
      };

      const beforeBar = performance.now();
      const bar = generateFromMelody(source, { ...baseOptions, harmonicPacing: "bar" }, seededRandom(seed));
      timings.push(performance.now() - beforeBar);
      runs++;
      expect(bar.ok, fixture.id + ": bar harmonization").toBe(true);
      if (!bar.ok) continue;
      expect(fullIdentityPreserved(source, bar.progression)).toBe(true);
      barCoverage.push(chordToneCoverage(melody, bar.progression.chords));

      const beforeAdaptive = performance.now();
      const adapted = generateFromMelody(source,
        { ...baseOptions, harmonicPacing: "adaptive" }, seededRandom(seed));
      timings.push(performance.now() - beforeAdaptive);
      runs++;
      expect(adapted.ok, fixture.id + ": adaptive harmonization").toBe(true);
      if (!adapted.ok) continue;
      expect(fullIdentityPreserved(source, adapted.progression)).toBe(true);
      const generated = adapted.progression.notes.filter(note => note.trackIndex !== 0);
      const harmony = generated.filter(note => note.trackIndex === adapted.generatedTrackIndices[1]);
      expect(generated.length).toBeGreaterThan(0);
      expect(generated.every(note => note.midi >= 0 && note.midi <= 127 &&
        Number.isInteger(note.midi) && Number.isFinite(note.duration) &&
        note.duration > 0 && note.timeStart >= 0)).toBe(true);
      expect(adapted.progression.tracks?.every(track => track.channel !== 9)).toBe(true);
      const spill = chordTailSpill(generated, adapted.progression.chords);
      expect(spill, fixture.id + ": chord window spill").toBe(0);

      adaptiveCoverage.push(chordToneCoverage(melody, adapted.progression.chords));
      adaptiveChangesPerBar.push(chordChangeRate(adapted.progression.chords, fixture.bars));
      collisions.push(nearLeadCollision(melody, harmony));
      spills.push(spill);
      entropies.push(pitchClassEntropy(generated));
      scaleRates.push(scaleToneRate(generated, fixture.root, fixture.mode));
      backingTakes.push(generated);
      chordTakes.push(adapted.progression.chords);

      for (const [operation, takes] of [
        ["continue", continueTakes],
        ["variation", reimagineTakes],
      ] as const) {
        const beforeMotif = performance.now();
        const motif = generateMotif(source, {
          sourceTrackIndex: 0, operation,
          root: fixture.root, mode: fixture.mode, keyStrategy: "manual",
          creativity: 62, continuationBars: 2,
        }, seededRandom(seed));
        timings.push(performance.now() - beforeMotif);
        runs++;
        expect(motif.ok, fixture.id + ": " + operation).toBe(true);
        if (!motif.ok) continue;
        expect(fullIdentityPreserved(source, motif.progression)).toBe(true);
        const output = motif.progression.notes.filter(note =>
          note.trackIndex === motif.generatedTrackIndex);
        expect(output.length).toBeGreaterThan(0);
        expect(output.every(note =>
          note.midi >= 0 && note.midi <= 127 && note.timeStart >= 0 &&
          note.duration > 0 && note.velocity >= 0.1 && note.velocity <= 1)).toBe(true);
        if (operation === "continue") {
          expect(output.every(note => note.timeStart >= fixture.bars * 4)).toBe(true);
          continuationIntervals.push(meanIntervalMagnitude(output));
        } else {
          const sortedSource = [...melody].sort((a, b) => a.timeStart - b.timeStart || b.midi - a.midi);
          const sortedOutput = [...output].sort((a, b) => a.timeStart - b.timeStart || b.midi - a.midi);
          // This identity anchor is meaningful for monophonic input; in a
          // chord melody, the generator first extracts a distinct lead line.
          if (sortedSource.length === sortedOutput.length) {
            expect(sortedOutput[0].midi).toBe(sortedSource[0].midi);
            expect(sortedOutput.at(-1)?.midi).toBe(sortedSource.at(-1)?.midi);
          }
        }
        takes.push(output);
      }
      samples.push({
        fixtureId: fixture.id, seed,
        barCoverage: barCoverage.at(-1) ?? 0,
        adaptiveCoverage: adaptiveCoverage.at(-1) ?? 0,
        adaptiveChangesPerBar: adaptiveChangesPerBar.at(-1) ?? 0,
        nearLeadCollision: collisions.at(-1) ?? 0,
        chordTailSpill: spills.at(-1) ?? 0,
        generatedBackingNotes: generated.length,
        generatedContinuationNotes: continueTakes.at(-1)?.length ?? 0,
        generatedVariationNotes: reimagineTakes.at(-1)?.length ?? 0,
        chordPath: adapted.progression.chords.map(chord => ({
          name: chord.name, timeStart: chord.timeStart, duration: chord.duration,
        })),
      });
      expect(JSON.stringify(source), fixture.id + ": source mutated").toBe(sourceSnapshot);
    }

    results.push({
      id: fixture.id, tonicCoverage, greedyCoverage,
      barCoverage: mean(barCoverage), adaptiveCoverage: mean(adaptiveCoverage),
      adaptiveChangesPerBar: mean(adaptiveChangesPerBar),
      harmonyCollision: mean(collisions), tailSpill: mean(spills),
      backingPitchEntropy: mean(entropies),
      backingScaleToneRate: mean(scaleRates),
      backingUniqueRenderRate: uniqueRenderRate(backingTakes),
      backingStructuralDiversity: structuralTakeDiversity(backingTakes),
      chordPathUniqueRate: chordPathDiversity(chordTakes),
      continuationUniqueRenderRate: uniqueRenderRate(continueTakes),
      continuationStructuralDiversity: structuralTakeDiversity(continueTakes),
      variationUniqueRenderRate: uniqueRenderRate(reimagineTakes),
      variationStructuralDiversity: structuralTakeDiversity(reimagineTakes),
      continuationMeanInterval: mean(continuationIntervals),
      seedCount: SEEDS.length,
    });
  }

  const fields: Array<keyof Omit<CaseResult, "id" | "seedCount">> = [
    "tonicCoverage", "greedyCoverage", "barCoverage",
    "adaptiveCoverage", "adaptiveChangesPerBar", "harmonyCollision",
    "tailSpill", "backingPitchEntropy", "backingScaleToneRate",
    "backingUniqueRenderRate", "backingStructuralDiversity", "chordPathUniqueRate",
    "continuationUniqueRenderRate", "continuationStructuralDiversity",
    "variationUniqueRenderRate", "variationStructuralDiversity", "continuationMeanInterval",
  ];
  const aggregate = Object.fromEntries(
    fields.map(field => [field, mean(results.map(result => result[field]))]),
  ) as QualityReport["aggregate"];
  const sortedTimings = [...timings].sort((a, b) => a - b);
  return {
    benchmark: "midi-spark-symbolic-quality-v3",
    methodology: "10 original synthetic phrases x 12 fixed seeds x 4 actual engine calls; basic tonic/greedy triad diagnostics",
    fixtures: results.length,
    seedsPerFixture: SEEDS.length,
    runs, results, samples, aggregate,
    runtimeMs: {
      p50: percentile(sortedTimings, 0.5),
      p95: percentile(sortedTimings, 0.95),
      max: sortedTimings.at(-1) ?? 0,
    },
    limitations: [
      "Original synthetic fixtures, not representative of genres, styles, or a held-out human composition corpus.",
      "Tonic and greedy baselines are simplistic 4/4 diatonic triads, not other trained music models.",
      "Chord-tone coverage rewards literal chord membership; legitimate passing notes and extensions can lower it.",
      "Entropy and output diversity are descriptive, not monotonic indicators of musical quality.",
      "Exact event diversity can be inflated by velocity/timing jitter; structural diversity quantizes to sixteenth-note grids and ignores velocity.",
      "Chord-path diversity describes harmonic novelty, not correctness or intentional expressive repetition.",
      "Node runtime varies by hardware and CI load; timing is not a browser audio-latency benchmark.",
      "No subjective listener preferences measured. External-model comparisons require identical paired inputs.",
    ],
  };
}

function markdownReport(report: QualityReport): string {
  const a = report.aggregate;
  const lines = [
    "# MIDI Spark — Symbolic quality benchmark",
    "",
    "This is a **reproducible diagnostic**, not a SOTA leaderboard or human listening score.",
    "",
    "- Scenario corpus: " + report.fixtures + " original, synthetic four-bar MIDI melodies; no copyrighted works.",
    "- Fixed seeds: " + report.seedsPerFixture + " per fixture.",
    "- Engine calls: " + report.runs + " (bar harmonization, adaptive harmonization, Continue, Reimagine).",
    "- Machine JSON includes " + report.samples.length + " scenario/seed records with chord paths.",
    "- Chord baselines: tonic-only and local greedy diatonic triads. **No external pretrained model was executed.**",
    "",
    "## Aggregate across fixtures (equal scenario weight)",
    "",
    "| Diagnostic | Value | Reading |",
    "|---|---:|---|",
    "| Tonic-only chord-tone coverage | " + pcnt(a.tonicCoverage) + " | Negative-control reference |",
    "| Greedy triad chord-tone coverage | " + pcnt(a.greedyCoverage) + " | Independent bar fit, no sequence awareness |",
    "| MIDI Spark: one chord/bar coverage | " + pcnt(a.barCoverage) + " | Globally optimized progression |",
    "| MIDI Spark: adaptive coverage | " + pcnt(a.adaptiveCoverage) + " | Harmonic pacing may split bars |",
    "| Adaptive chord changes per bar | " + fixed(a.adaptiveChangesPerBar) + " | Descriptive harmonic activity |",
    "| Near-lead register collision | " + pcnt(a.harmonyCollision) + " | Close overlapping pitches / backing duration |",
    "| Accompaniment crossing chord boundary | " + pcnt(a.tailSpill) + " | Correctness diagnostic: should be 0 |",
    "| Backing scale-tone rate | " + pcnt(a.backingScaleToneRate) + " | Chromatic chords may lower this intentionally |",
    "| Backing pitch-class entropy | " + fixed(a.backingPitchEntropy) + " bits | Diversity of notes, not aesthetic quality |",
    "| Unique accompaniment takes (exact events) | " + pcnt(a.backingUniqueRenderRate) + " | Includes small timing/velocity changes |",
    "| Unique accompaniment structures | " + pcnt(a.backingStructuralDiversity) + " | Sixteenth-grid notes, no velocity |",
    "| Unique chord paths | " + pcnt(a.chordPathUniqueRate) + " | Changes in chord identity or chord onset/duration |",
    "| Unique Continue takes (exact events) | " + pcnt(a.continuationUniqueRenderRate) + " | Reproducible seeded continuations |",
    "| Unique Continue structures | " + pcnt(a.continuationStructuralDiversity) + " | Velocity-excluded melodic variation |",
    "| Unique Reimagine takes (exact events) | " + pcnt(a.variationUniqueRenderRate) + " | Reproducible seeded variations |",
    "| Unique Reimagine structures | " + pcnt(a.variationStructuralDiversity) + " | Velocity-excluded melodic variation |",
    "| Mean generated continuation interval | " + fixed(a.continuationMeanInterval) + " semitones | Describes melodic motion |",
    "",
    "## Fixture-by-fixture chord-tone coverage",
    "",
    "| Original scenario | Tonic | Greedy | MIDI Spark: bar | MIDI Spark: adaptive | Adaptive changes/bar |",
    "|---|---:|---:|---:|---:|---:|",
    ...report.results.map(x => [
      "| " + x.id, pcnt(x.tonicCoverage), pcnt(x.greedyCoverage),
      pcnt(x.barCoverage), pcnt(x.adaptiveCoverage), fixed(x.adaptiveChangesPerBar) + " |",
    ].join(" | ")),
    "",
    "## Runtime (Node/Vitest, all operations combined)",
    "",
    "p50: " + fixed(report.runtimeMs.p50) + " ms; p95: " + fixed(report.runtimeMs.p95) +
      " ms; maximum: " + fixed(report.runtimeMs.max) + " ms.",
    "",
    "## Limits on interpretation",
    "",
    ...report.limitations.map(item => "- " + item),
    "",
    "## Reproduction",
    "",
    "Run: npm run eval:music. CI also publishes a machine-readable JSON summary and this Markdown report.",
    "Source: tests/musicQualityFixtures.ts, tests/musicQualityMetrics.ts and tests/musicQualityBenchmark.test.ts.",
    "",
  ];
  return lines.join("\n");
}

describe("reproducible symbolic-music diagnostic benchmark", () => {
  it("measures four real generation paths without compromising source MIDI", () => {
    const report = runEvaluation();
    expect(report.fixtures).toBe(10);
    expect(report.runs).toBe(report.fixtures * report.seedsPerFixture * 4);
    expect(report.samples).toHaveLength(report.fixtures * report.seedsPerFixture);
    expect(new Set(report.samples.map(s => s.fixtureId + ":" + s.seed)).size)
      .toBe(report.samples.length);
    expect(report.aggregate.tailSpill).toBe(0);
    expect(report.aggregate.adaptiveCoverage).toBeGreaterThan(0);
    expect(report.aggregate.backingStructuralDiversity).toBeLessThanOrEqual(
      report.aggregate.backingUniqueRenderRate + 1e-10);
    expect(report.results.every(item => Number.isFinite(item.barCoverage) &&
      Number.isFinite(item.adaptiveCoverage) &&
      Number.isFinite(item.backingPitchEntropy))).toBe(true);

    const markdown = markdownReport(report);
    // Node's filesystem is deliberately owned by the independent JS CLI,
    // not by TypeScript test code or production browser bundles.
    console.log("\n@@MIDI_SPARK_MARKDOWN_BEGIN@@\n" + markdown +
      "\n@@MIDI_SPARK_MARKDOWN_END@@");
    console.log("\n@@MIDI_SPARK_JSON_BEGIN@@\n" + JSON.stringify(report, null, 2) +
      "\n@@MIDI_SPARK_JSON_END@@");
  });
});
