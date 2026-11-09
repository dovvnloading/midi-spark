import { isValidSession, type SavedSession } from "./persistence";

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

/** An explicit native archive, not a standard MIDI file. It captures generated
 * track ownership, locks, chord guides, song sections, mixer, form controls,
 * and favorites as an ordinary inspectable JSON document. */
export function serializeNativeProject(session: SavedSession): string {
  if (!isValidSession(session)) throw new Error("This session has invalid project data.");
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
  if (!isValidSession(envelope.session))
    return { ok: false, reason: "Project data is incomplete or invalid. The open composition is unchanged." };
  return { ok: true, session: envelope.session };
}

export async function parseNativeProjectFile(file: File): Promise<ProjectParseResult> {
  if (file.size > MAX_PROJECT_BYTES)
    return { ok: false, reason: "Project is larger than the 16 MB limit." };
  try { return parseNativeProjectText(await file.text()); }
  catch { return { ok: false, reason: "Could not read the project file." }; }
}
