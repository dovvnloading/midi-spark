import { isValidSession, type SavedSession } from "./persistence";
import { MAX_BPM, MAX_ZOOM, MIN_BPM, MIN_ZOOM, ROOT_NOTES } from "./constants";

export const PROJECT_EXTENSION = ".midispark";
export const PROJECT_FORMAT = "midi-spark-project";
export const PROJECT_VERSION = 1;
export const MAX_PROJECT_BYTES = 16 * 1024 * 1024;

interface NativeProjectEnvelope {
  format: typeof PROJECT_FORMAT;
  version: typeof PROJECT_VERSION;
  session: SavedSession;
}

export type ProjectParseResult =
  | { ok: true; session: SavedSession }
  | { ok: false; reason: string };

/** Reject otherwise well-shaped but musically unsafe native files before
 * feeding pitches/transport values to the audio engine and piano roll. */
function safeNativeSession(session: SavedSession): boolean {
  const validPercent = (value: number) => Number.isFinite(value) && value >= 0 && value <= 100;
  if (!ROOT_NOTES.some(root => root === session.root) ||
    session.bpm < MIN_BPM || session.bpm > MAX_BPM ||
    !validPercent(session.dissonance) || !validPercent(session.complexity) ||
    !Number.isInteger(session.bars) || session.bars < 1 || session.bars > 64 ||
    session.zoomX < MIN_ZOOM || session.zoomX > MAX_ZOOM ||
    session.noteLength <= 0 || session.noteLength > 16 ||
    session.snapResolution < 0 || session.snapResolution > 4) return false;
  const p = session.progression;
  if (!p) return true;
  if (!Number.isInteger(p.totalBars) || p.totalBars < 1 || p.totalBars > 512 ||
    p.notes.length > 60000 || p.chords.length > 8192 || (p.tracks?.length ?? 0) > 128)
    return false;
  const end = p.totalBars * 4;
  if (p.notes.some(note => !Number.isInteger(note.midi) ||
    note.midi < 0 || note.midi > 127 ||
    note.name.length < 1 || note.name.length > 32 ||
    note.timeStart < 0 || note.timeStart > end ||
    note.duration <= 0 || note.timeStart + note.duration > end + 1 / 64 ||
    note.velocity < 0 || note.velocity > 1 ||
    (note.trackIndex !== undefined &&
      (!Number.isInteger(note.trackIndex) || note.trackIndex < 0)))) return false;
  if (p.chords.some(chord => chord.name.length < 1 || chord.name.length > 64 ||
    chord.timeStart < 0 || chord.duration <= 0 ||
    chord.timeStart + chord.duration > end + 1 / 64)) return false;
  return true;
}

/** An explicit native archive, not a standard MIDI file. It captures generated
 * track ownership, locks, chord guides, song sections, mixer, form controls,
 * and favorites as an ordinary inspectable JSON document. */
export function serializeNativeProject(session: SavedSession): string {
  if (!isValidSession(session) || !safeNativeSession(session))
    throw new Error("This session has invalid project data.");
  const file: NativeProjectEnvelope = {
    format: PROJECT_FORMAT, version: PROJECT_VERSION, session,
  };
  const json = JSON.stringify(file, null, 2);
  if (new Blob([json]).size > MAX_PROJECT_BYTES)
    throw new Error("Project exceeds the 16 MB native archive limit.");
  return json;
}

/** Parse untrusted files fully before replacing any open project. No schema
 * coercion, partial restore or silent conversion from unrelated JSON files. */
export function parseNativeProjectText(text: string): ProjectParseResult {
  if (new Blob([text]).size > MAX_PROJECT_BYTES)
    return { ok: false, reason: "Project is larger than the 16 MB limit." };
  let data: unknown;
  try { data = JSON.parse(text); }
  catch { return { ok: false, reason: "Not a valid MIDI Spark project JSON file." }; }
  if (typeof data !== "object" || data === null || Array.isArray(data))
    return { ok: false, reason: "This file is not a MIDI Spark project." };
  const envelope = data as Record<string, unknown>;
  if (envelope.format !== PROJECT_FORMAT)
    return { ok: false, reason: "This file is not a MIDI Spark project." };
  if (envelope.version !== PROJECT_VERSION)
    return { ok: false, reason: "Unsupported project version. Use a compatible MIDI Spark release." };
  if (!isValidSession(envelope.session) || !safeNativeSession(envelope.session))
    return { ok: false, reason: "Project data is incomplete or invalid. The open composition is unchanged." };
  return { ok: true, session: envelope.session };
}

export async function parseNativeProjectFile(file: File): Promise<ProjectParseResult> {
  if (file.size > MAX_PROJECT_BYTES)
    return { ok: false, reason: "Project is larger than the 16 MB limit." };
  try { return parseNativeProjectText(await file.text()); }
  catch { return { ok: false, reason: "Could not read the project file." }; }
}
