import { Chord } from "@tonaljs/tonal";
import type { HarmonyConstraint, ProgressionData } from "./theory";

export type HarmonyGuideEditResult =
  | { ok: true; progression: ProgressionData }
  | { ok: false; reason: string };

/** A bar guide is a hard musical intention but not a note lock. A required
 * chord may change the arrangement in that bar; existing padlocks preserve
 * both the chord and the actual MIDI attacks. */
export function addHarmonyGuide(
  input: ProgressionData, guide: HarmonyConstraint,
): HarmonyGuideEditResult {
  const totalBars = Math.max(input.totalBars,
    ...input.notes.map(note => Math.ceil((note.timeStart + note.duration) / 4)), 1);
  if (!Number.isInteger(guide.sourceTrackIndex) || guide.sourceTrackIndex < 0 ||
    !Number.isInteger(guide.bar) || guide.bar < 0 || guide.bar >= totalBars || guide.bar >= 64 ||
    (guide.kind !== "require" && guide.kind !== "avoid") ||
    typeof guide.chord !== "string" || !guide.chord.trim() || guide.chord.length > 64 ||
    Chord.get(guide.chord).empty) {
    return { ok: false, reason: "Choose a valid source track, bar and chord for the guide." };
  }

  const inBar = (bar: number) => bar === guide.bar;
  const current = input.harmonyConstraints ?? [];
  if (guide.kind === "require" && current.some(item =>
    item.sourceTrackIndex === guide.sourceTrackIndex && inBar(item.bar) &&
    item.kind === "avoid" && item.chord === guide.chord)) {
    return { ok: false, reason: "That chord is already excluded in this bar. Remove the exclusion first." };
  }
  if (guide.kind === "avoid" && current.some(item =>
    item.sourceTrackIndex === guide.sourceTrackIndex && inBar(item.bar) &&
    item.kind === "require" && item.chord === guide.chord)) {
    return { ok: false, reason: "That chord is pinned in this bar. Remove the pin first." };
  }

  const locked = input.chords.filter(chord =>
    chord.locked && chord.generatedSourceTrackIndex === guide.sourceTrackIndex &&
    chord.timeStart < (guide.bar + 1) * 4 && chord.timeStart + chord.duration > guide.bar * 4);
  if (guide.kind === "require" && locked.some(chord =>
    chord.name !== guide.chord || chord.timeStart !== guide.bar * 4 || chord.duration !== 4)) {
    return { ok: false, reason: "This bar contains a conflicting locked chord region. Unlock it before pinning a full-bar chord." };
  }
  if (guide.kind === "avoid" && locked.some(chord => chord.name === guide.chord)) {
    return { ok: false, reason: "That chord is locked in this bar. Unlock it before excluding it." };
  }

  if (current.some(item => item.sourceTrackIndex === guide.sourceTrackIndex &&
    item.bar === guide.bar && item.kind === guide.kind && item.chord === guide.chord)) {
    return { ok: true, progression: input };
  }
  // A new required chord replaces the previous pin in this bar, but never
  // rewrites any exclusions or another melody source's guides.
  const remaining = guide.kind === "require"
    ? current.filter(item => item.sourceTrackIndex !== guide.sourceTrackIndex ||
      item.bar !== guide.bar || item.kind !== "require")
    : current;
  if (remaining.length >= 512) {
    return { ok: false, reason: "This project already has the maximum of 512 chord guides." };
  }
  const constraints = [...remaining, { ...guide }].sort((a, b) =>
    a.sourceTrackIndex - b.sourceTrackIndex || a.bar - b.bar ||
    (a.kind === "require" ? -1 : 1) - (b.kind === "require" ? -1 : 1) ||
    a.chord.localeCompare(b.chord));
  return { ok: true, progression: { ...input, harmonyConstraints: constraints } };
}

/** Remove one visible guide by its native project index. Undo restores it. */
export function removeHarmonyGuide(input: ProgressionData, index: number): ProgressionData {
  const guides = input.harmonyConstraints;
  if (!guides || !Number.isInteger(index) || index < 0 || index >= guides.length) return input;
  return { ...input, harmonyConstraints: guides.filter((_, i) => i !== index) };
}
