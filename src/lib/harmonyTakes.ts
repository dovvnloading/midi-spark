import { generateFromMelody, type MelodyGenerationOptions } from "./adaptive";
import { seededRandom } from "./random";
import type { ProgressionData } from "./theory";

export interface HarmonyTake {
  seed: number;
  progression: ProgressionData;
  root: string;
  mode: "major" | "minor";
  changedRegions: number;
  chordSummary: string;
}

export type HarmonyTakesResult =
  | { ok: true; takes: HarmonyTake[]; seedsTried: number }
  | { ok: false; reason: string };

/** Compares musical structures, not cosmetic velocity jitter. Includes only
 * owned accompaniment and chord labels, never unrelated user-owned tracks. */
function structuralSignature(data: ProgressionData, sourceIndex: number): string {
  const generated = new Set(data.tracks?.filter(t =>
    t.sourceTrackIndex === sourceIndex &&
    (t.generatedRole === "bass" || t.generatedRole === "harmony"))
    .map(t => t.index) ?? []);
  const chords = data.chords.filter(chord => chord.generatedSourceTrackIndex === sourceIndex)
    .map(chord => [chord.name, Math.round(chord.timeStart * 16),
      Math.round(chord.duration * 16)]);
  const notes = data.notes.filter(note => generated.has(note.trackIndex ?? 0))
    .map(note => [note.trackIndex, note.midi, Math.round(note.timeStart * 16),
      Math.round(note.duration * 16)])
    .sort((a, b) => (Number(a[2]) - Number(b[2])) ||
      (Number(a[0]) - Number(b[0])) || (Number(a[1]) - Number(b[1])));
  return JSON.stringify([chords, notes]);
}

function chordPath(data: ProgressionData, sourceIndex: number): string[] {
  return data.chords.filter(chord => chord.generatedSourceTrackIndex === sourceIndex)
    .sort((a, b) => a.timeStart - b.timeStart)
    .map(chord => chord.name);
}

/** Compute a small batch against one immutable base. The UI can preview a
 * take without committing it; only Accept should add it to undo history.
 * Seeded results are reproducible and structurally duplicate takes are
 * eliminated, with no promise of a fixed number when constraints are tight. */
export function generateHarmonyTakes(
  source: ProgressionData, options: MelodyGenerationOptions,
  seeds: readonly number[], maxTakes = 3,
): HarmonyTakesResult {
  if (!Number.isInteger(maxTakes) || maxTakes < 1 || maxTakes > 5 ||
    seeds.length === 0 || seeds.length > 64 ||
    seeds.some(seed => !Number.isSafeInteger(seed))) {
    return { ok: false, reason: "Choose a valid take count and finite random seeds." };
  }
  const generated = source.tracks?.filter(track =>
    track.sourceTrackIndex === options.sourceTrackIndex &&
    (track.generatedRole === "bass" || track.generatedRole === "harmony")) ?? [];
  if (generated.length !== 2) {
    return { ok: false, reason: "Harmonize the melody once before exploring alternate takes." };
  }

  const signatures = new Set([structuralSignature(source, options.sourceTrackIndex)]);
  const oldPath = chordPath(source, options.sourceTrackIndex);
  const takes: HarmonyTake[] = [];
  let seedsTried = 0;
  for (const seed of seeds) {
    if (takes.length >= maxTakes) break;
    seedsTried++;
    const generatedTake = generateFromMelody(source, options, seededRandom(seed));
    if (!generatedTake.ok) return generatedTake;
    const signature = structuralSignature(generatedTake.progression, options.sourceTrackIndex);
    if (signatures.has(signature)) continue;
    signatures.add(signature);
    const nextPath = chordPath(generatedTake.progression, options.sourceTrackIndex);
    const differences = nextPath.reduce((sum, label, index) =>
      sum + (label === oldPath[index] ? 0 : 1), 0) +
      Math.abs(nextPath.length - oldPath.length);
    takes.push({
      seed, progression: generatedTake.progression,
      root: generatedTake.root, mode: generatedTake.mode,
      changedRegions: differences,
      chordSummary: nextPath.slice(0, 6).join(" · ") + (nextPath.length > 6 ? " …" : ""),
    });
  }
  return takes.length
    ? { ok: true, takes, seedsTried }
    : { ok: false, reason: "No structurally distinct takes under these settings. Increase harmony exploration or loosen chord guides." };
}
