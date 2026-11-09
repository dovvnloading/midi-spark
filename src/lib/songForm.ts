import { Chord, Note } from "@tonaljs/tonal";
import { generateFromMelody, type MelodyGenerationOptions } from "./adaptive";
import { seededRandom } from "./random";
import { trackIndexOf } from "./tracks";
import type { ArrangementSection, ChordEvent, NoteEvent, ProgressionData } from "./theory";

export type SongForm = "AABA" | "ABAB";
export interface SongFormOptions {
  form: SongForm;
  /** 0–100. Higher values add more rhythmic/dynamic development. */
  contrast: number;
  seed: number;
  sourceTrackIndex: number;
  /** If the source already owns generated Bass + Harmony, search for a new
   * progression for the contrasting section using the existing harmonizer. */
  harmonicOptions?: MelodyGenerationOptions;
}
export type SongFormResult =
  | { ok: true; progression: ProgressionData; sections: ArrangementSection[];
      reharmonizedBridge: boolean }
  | { ok: false; reason: string };

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const quarter = (n: number) => Math.round(n * 64) / 64;

/** Expand one original four/eight-bar motif into an A–A′–B–A or A–B–A′–B
 * form with explicit section identity. Section A is the exact original score:
 * all user notes and labels retain their object identity. Subsequent sections
 * are new events, with a thematic callback, a transposed bridge, and a return.
 * This is a structured symbolic planner, not a pretrained style model. */
export function buildSongForm(
  input: ProgressionData, options: SongFormOptions,
): SongFormResult {
  const { form, contrast, seed, sourceTrackIndex } = options;
  if (form !== "AABA" && form !== "ABAB") {
    return { ok: false, reason: "Select a supported AABA or ABAB song form." };
  }
  if (!Number.isFinite(contrast) || contrast < 0 || contrast > 100 ||
    !Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff ||
    !Number.isInteger(sourceTrackIndex) || sourceTrackIndex < 0) {
    return { ok: false, reason: "Choose valid contrast, seed, and source melody track." };
  }
  if (input.totalBars !== 4 && input.totalBars !== 8) {
    return { ok: false, reason: "Start with a four- or eight-bar musical idea before building a song form." };
  }
  if (input.arrangementSections?.length) {
    return { ok: false, reason: "This score already has a song form. Undo or create a new short idea to arrange again." };
  }
  if (input.sourceTimeSignatures?.some(meter => meter !== "4/4")) {
    return { ok: false, reason: "Song forms currently use the 4/4 editor grid; source meter requires conversion first." };
  }
  const seedQuarters = input.totalBars * 4;
  if (!input.notes.some(note => trackIndexOf(note) === sourceTrackIndex)) {
    return { ok: false, reason: "Choose a source track containing notes in the original idea." };
  }
  if (input.notes.length > 4096 || input.chords.length > 512 ||
    input.notes.some(note =>
      !Number.isInteger(note.midi) || note.midi < 0 || note.midi > 127 ||
      !Number.isFinite(note.timeStart) || note.timeStart < 0 ||
      !Number.isFinite(note.duration) || note.duration <= 0 ||
      note.timeStart + note.duration > seedQuarters + 1e-8 ||
      !Number.isFinite(note.velocity) || note.velocity < 0 || note.velocity > 1) ||
    input.chords.some(chord => !Number.isFinite(chord.timeStart) ||
      !Number.isFinite(chord.duration) || chord.timeStart < 0 ||
      chord.duration <= 0 || chord.timeStart + chord.duration > seedQuarters + 1e-8)) {
    return { ok: false, reason: "The original idea must fit its bars and contain valid MIDI notes/chords." };
  }
  const rng = seededRandom(seed);
  const sequence: { label: ArrangementSection["label"]; role: ArrangementSection["role"] }[] =
    form === "AABA" ? [
      { label: "A", role: "theme" },
      { label: "A′", role: "variation" },
      { label: "B", role: "contrast" },
      { label: "A (return)", role: "reprise" },
    ] : [
      { label: "A", role: "theme" },
      { label: "B", role: "contrast" },
      { label: "A′", role: "variation" },
      { label: "B (return)", role: "reprise" },
    ];
  const sections: ArrangementSection[] = sequence.map((part, index) => ({
    ...part, startBar: index * input.totalBars, bars: input.totalBars,
  }));
  const bridgeShift = 5; // A complete modulation by perfect fourth, no pitch-class drift.
  if (input.notes.some(note => (note.midi + bridgeShift > 127))) {
    return { ok: false, reason: "A note is too high for the contrasting section's fourth-up motif. Transpose the original lower." };
  }

  const notes: NoteEvent[] = [...input.notes]; // original events, exact identities
  const chords: ChordEvent[] = [...input.chords];
  const copyNote = (note: NoteEvent, position: number, role: ArrangementSection["role"]) => {
    const offset = position * seedQuarters;
    const localBar = Math.floor(note.timeStart / 4);
    const sourceMelody = trackIndexOf(note) === sourceTrackIndex;
    const bridge = role === "contrast" ||
      (form === "ABAB" && role === "reprise");
    const midi = note.midi + (bridge ? bridgeShift : 0);
    const anticipation = role === "variation" && sourceMelody &&
      localBar === input.totalBars - 1 && note.timeStart % 4 >= 0.5 &&
      rng() < 0.18 + contrast / 160
      ? 0.125 : 0;
    const amount = role === "variation" ? 0.9 + contrast / 450 :
      role === "contrast" ? 0.98 + contrast / 280 :
      role === "reprise" ? 1.04 : 1;
    return {
      ...note, midi,
      name: bridge ? (Note.fromMidi(midi) ?? note.name) : note.name,
      timeStart: quarter(note.timeStart + offset - anticipation),
      velocity: clamp(quarter(note.velocity * amount), 0.01, 1),
    };
  };
  const copyChord = (chord: ChordEvent, position: number, role: ArrangementSection["role"]) => {
    const bridge = role === "contrast" || (form === "ABAB" && role === "reprise");
    const newName = bridge && !Chord.get(chord.name).empty
      ? Chord.transpose(chord.name, "4P") || chord.name : chord.name;
    return {
      ...chord, name: newName,
      timeStart: chord.timeStart + position * seedQuarters,
      // A lock protects the *original* section, not every thematic repetition.
      ...(chord.locked === undefined ? {} : { locked: false }),
    };
  };
  for (let position = 1; position < sequence.length; position++) {
    const role = sequence[position].role;
    for (const note of input.notes) notes.push(copyNote(note, position, role));
    for (const chord of input.chords) chords.push(copyChord(chord, position, role));
  }

  let arrangement: ProgressionData = {
    ...input, notes, chords,
    totalBars: input.totalBars * sequence.length,
    arrangementSections: sections,
  };
  let reharmonizedBridge = false;
  const linked = input.tracks?.filter(track => track.sourceTrackIndex === sourceTrackIndex &&
    (track.generatedRole === "bass" || track.generatedRole === "harmony")) ?? [];
  if (linked.length === 2 && options.harmonicOptions) {
    if (options.harmonicOptions.sourceTrackIndex !== sourceTrackIndex) {
      return { ok: false, reason: "The selected source and harmonic generator source do not match." };
    }
    const bridge = sections.find(section => section.role === "contrast")!;
    const from = bridge.startBar * 4, to = (bridge.startBar + bridge.bars) * 4;
    const transposedRoot = Note.transpose(options.harmonicOptions.root, "4P");
    if (!transposedRoot) {
      return { ok: false, reason: "Choose a valid key for the contrasting section." };
    }
    const generated = generateFromMelody(arrangement, {
      ...options.harmonicOptions,
      root: transposedRoot, keyStrategy: "manual",
      sourceScope: "loop", sourceLoopRange: { start: from, end: to },
      sourceNoteIndices: [],
    }, seededRandom((seed ^ 0x9e3779b9) >>> 0));
    if (!generated.ok) return generated;
    arrangement = { ...generated.progression, arrangementSections: sections };
    reharmonizedBridge = true;
  }
  return { ok: true, progression: arrangement, sections, reharmonizedBridge };
}
