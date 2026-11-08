import { readFileSync } from "node:fs";

const [beforePath, afterPath] = process.argv.slice(2);
if (!beforePath || !afterPath) {
  process.stderr.write("Usage: npm run eval:compare -- path/to/before.json path/to/after.json\n");
  process.exit(2);
}

function readReport(path) {
  const report = JSON.parse(readFileSync(path, "utf8"));
  if (report.benchmark !== "midi-spark-symbolic-quality-v2" ||
    !Array.isArray(report.results) || typeof report.seedsPerFixture !== "number") {
    throw new Error("Unsupported or malformed evaluation report: " + path);
  }
  return report;
}

const before = readReport(beforePath);
const after = readReport(afterPath);
const ids = report => report.results.map(row => row.id).join("|");
if (before.fixtures !== after.fixtures ||
  before.seedsPerFixture !== after.seedsPerFixture ||
  before.runs !== after.runs || ids(before) !== ids(after)) {
  throw new Error("Reports use incompatible fixtures, seed counts or workloads");
}

const descriptors = [
  ["tonicCoverage", "Tonic-only coverage", "pct"],
  ["greedyCoverage", "Greedy triad coverage", "pct"],
  ["barCoverage", "Bar harmony coverage", "pct"],
  ["adaptiveCoverage", "Adaptive harmony coverage", "pct"],
  ["adaptiveChangesPerBar", "Adaptive changes/bar", "scalar"],
  ["harmonyCollision", "Near-lead masking", "pct"],
  ["tailSpill", "Chord-boundary violations", "pct"],
  ["backingPitchEntropy", "Backing pitch-class entropy", "scalar"],
  ["backingScaleToneRate", "Backing scale-tone rate", "pct"],
  ["backingStructuralDiversity", "Backing structural diversity", "pct"],
  ["chordPathUniqueRate", "Chord-path diversity", "pct"],
  ["continuationStructuralDiversity", "Continue structural diversity", "pct"],
  ["variationStructuralDiversity", "Reimagine structural diversity", "pct"],
  ["continuationMeanInterval", "Mean continuation interval", "scalar"],
];
const render = (value, unit) => unit === "pct"
  ? (100 * value).toFixed(1) + "%"
  : value.toFixed(2);
const delta = (value, unit) => unit === "pct"
  ? ((100 * value) >= 0 ? "+" : "") + (100 * value).toFixed(1) + " pp"
  : (value >= 0 ? "+" : "") + value.toFixed(2);

const rows = [];
for (const [key, label, unit] of descriptors) {
  const oldValue = before.aggregate[key];
  const newValue = after.aggregate[key];
  if (!Number.isFinite(oldValue) || !Number.isFinite(newValue)) {
    throw new Error("Missing finite evaluation aggregate: " + key);
  }
  rows.push("| " + label + " | " + render(oldValue, unit) + " | " +
    render(newValue, unit) + " | " + delta(newValue - oldValue, unit) + " |");
}

console.log([
  "# MIDI Spark — paired evaluation comparison",
  "",
  "Before: " + beforePath,
  "After: " + afterPath,
  "Benchmark: " + before.benchmark + "; " + before.fixtures +
    " original synthetic fixtures and " + before.seedsPerFixture + " fixed seeds each.",
  "",
  "**These are descriptive metric changes, not significance tests or proof of musical improvement.**",
  "There is no overall winner score. Larger coverage/entropy/diversity is not always aesthetically preferable.",
  "",
  "| Diagnostic | Before | After | Delta |",
  "|---|---:|---:|---:|",
  ...rows,
  "",
  "## Per-fixture adaptive chord-tone coverage change",
  "",
  "| Fixture | Before | After | Delta |",
  "|---|---:|---:|---:|",
  ...before.results.map((row, i) => {
    const value = after.results[i].adaptiveCoverage;
    return "| " + row.id + " | " + render(row.adaptiveCoverage, "pct") +
      " | " + render(value, "pct") + " | " +
      delta(value - row.adaptiveCoverage, "pct") + " |";
  }),
  "",
  "Runtime omitted: independent CI machines and workloads are not directly comparable.",
  "Do not infer human preferences from the results. Run the documented blind listening study.",
  "",
].join("\n"));
