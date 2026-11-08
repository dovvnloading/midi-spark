import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";

/** Vitest runs executable TypeScript; this Node-only wrapper owns artifacts.
 * The production browser app and TS compiler do not need @types/node.
 * Both the JSON and Markdown derive from the exact same scored fixture runs. */
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const run = spawnSync(npm, ["run", "eval:music:raw"], {
  encoding: "utf8",
  shell: process.platform === "win32",
  maxBuffer: 16 * 1024 * 1024,
  env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
});

const stdout = run.stdout ?? "";
const stderr = run.stderr ?? "";
if (run.error || run.status !== 0) {
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  if (run.error) process.stderr.write(String(run.error) + "\n");
  process.exitCode = run.status || 1;
} else {
  function content(label) {
    const begin = "@@MIDI_SPARK_" + label + "_BEGIN@@";
    const end = "@@MIDI_SPARK_" + label + "_END@@";
    const start = stdout.indexOf(begin);
    const finish = stdout.indexOf(end, start + begin.length);
    if (start < 0 || finish < 0) throw new Error("Evaluation output missing " + label + " block");
    return stdout.slice(start + begin.length, finish).trim() + "\n";
  }
  try {
    const markdown = content("MARKDOWN");
    const json = content("JSON");
    const parsed = JSON.parse(json);
    if (parsed.benchmark !== "midi-spark-symbolic-quality-v2" ||
      !Array.isArray(parsed.results) || parsed.results.length !== 10) {
      throw new Error("Evaluation output schema failed basic validation");
    }
    const path = process.env.MIDI_SPARK_EVAL_OUTPUT || "music-evaluation";
    writeFileSync(path + ".md", markdown, "utf8");
    writeFileSync(path + ".json", json, "utf8");
    process.stdout.write(markdown);
    process.stdout.write("\nMachine-readable results: " + path + ".json\n");
  } catch (error) {
    process.stdout.write(stdout);
    process.stderr.write(String(error) + "\n");
    process.exitCode = 1;
  }
}
