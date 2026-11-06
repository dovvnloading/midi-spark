import { trackIndexOf } from "./tracks";
import type { NoteEvent } from "./theory";
/** An empty target set means NO notes, not all notes. Callers of legacy
 * transforms must guard size=0 before passing a selection to them. */
export function editScope(notes: NoteEvent[], selection: ReadonlySet<number>, track: number | null): Set<number> {
  const visible = notes.map((note, index) => ({ note, index })).filter(({ note }) => track === null || trackIndexOf(note) === track);
  return new Set(visible.filter(({ index }) => selection.size === 0 || selection.has(index)).map(({ index }) => index));
}
