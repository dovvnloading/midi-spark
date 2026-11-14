import { Note } from "@tonaljs/tonal";
import { clamp, FREE_SNAP, MAX_MIDI, MAX_PROJECT_BEATS, MAX_VELOCITY, MIN_VELOCITY, VELOCITY_LANE_HEIGHT } from "./constants";
import type { NoteEvent, ProgressionData } from "./theory";
import { trackIndexOf } from "./tracks";
import { ensureBarsCoverNotes } from "./transforms";

export interface GridPoint { x: number; y: number }

export function placementTick(x: number, zoom: number, snap: number) {
  const beat = Math.max(0, x / zoom);
  return snap > 0 ? Math.floor(beat / snap) * snap : beat;
}

function snapDelta(beats: number, snap: number) {
  return snap > 0 ? Math.round(beats / snap) * snap : beats;
}

/** Clamp the whole gesture once, so boundaries preserve timing and voicing. */
export function constrainNoteDelta(
  notes: readonly NoteEvent[], field: "timeStart" | "midi" | "duration", delta: number,
  minimumDuration = FREE_SNAP,
) {
  let low = -Infinity;
  let high = Infinity;
  for (const note of notes) {
    switch (field) {
      case "midi":
        low = Math.max(low, -note.midi);
        high = Math.min(high, MAX_MIDI - note.midi);
        break;
      case "duration":
        // A valid imported short note should never lengthen from a click.
        low = Math.max(low, Math.min(note.duration, minimumDuration) - note.duration);
        high = Math.min(high, Math.max(0, MAX_PROJECT_BEATS - note.timeStart - note.duration));
        break;
      case "timeStart":
        low = Math.max(low, -note.timeStart);
        high = Math.min(high, Math.max(0, MAX_PROJECT_BEATS - note.timeStart - note.duration));
    }
  }
  return clamp(delta, low, high);
}

export interface GridGesture {
  origin: GridPoint;
  point: GridPoint;
  threshold: number;
}

export function crossedThreshold({ origin, point, threshold }: GridGesture) {
  return Math.max(Math.abs(point.x - origin.x), Math.abs(point.y - origin.y)) >= threshold;
}

export function drawNote(
  gesture: GridGesture, midi: number, zoom: number, snap: number, length: number, trackIndex: number,
): NoteEvent {
  const anchor = placementTick(gesture.origin.x, zoom, snap);
  let start = anchor;
  let duration = length;
  if (Math.abs(gesture.point.x - gesture.origin.x) >= gesture.threshold) {
    const end = Math.max(0, snapDelta(gesture.point.x / zoom, snap));
    start = Math.min(anchor, end);
    duration = Math.max(snap || FREE_SNAP, Math.abs(end - anchor));
  }
  return { midi, name: Note.fromMidi(midi) || "C4", timeStart: start, duration, velocity: 0.8, trackIndex };
}

export interface NoteDrag extends GridGesture {
  kind: "move" | "resize" | "velocity";
  indices: number[];
  notes: NoteEvent[];
  clicked: number;
  shift: boolean;
}

export function draggedNotes(gesture: NoteDrag, zoom: number, rowHeight: number, snap: number) {
  const changes = new Map<number, NoteEvent>();
  if (!crossedThreshold(gesture)) return changes;
  const dx = gesture.point.x - gesture.origin.x;
  const dy = gesture.point.y - gesture.origin.y;
  const { kind, notes, indices } = gesture;
  const beats = snapDelta(dx / zoom, snap);
  const time = kind === "move" ? constrainNoteDelta(notes, "timeStart", beats) : 0;
  const pitch = kind === "move" ? constrainNoteDelta(notes, "midi", -Math.round(dy / rowHeight)) : 0;
  const duration = kind === "resize" ? constrainNoteDelta(notes, "duration", beats, snap || FREE_SNAP) : 0;
  for (const [offset, note] of notes.entries()) {
    const index = indices[offset];
    if (time || pitch) {
      const midi = note.midi + pitch;
      changes.set(index, { ...note, timeStart: note.timeStart + time, midi,
        name: pitch ? Note.fromMidi(midi) || note.name : note.name });
    } else if (duration) {
      changes.set(index, { ...note, duration: note.duration + duration });
    } else if (kind === "velocity" && dy) {
      const velocity = clamp(note.velocity - dy / VELOCITY_LANE_HEIGHT, MIN_VELOCITY, MAX_VELOCITY);
      if (velocity !== note.velocity) changes.set(index, { ...note, velocity });
    }
  }
  return changes;
}

export function replaceDraggedNotes(progression: ProgressionData, changes: ReadonlyMap<number, NoteEvent>) {
  if (!changes.size) return progression;
  const notes = [...progression.notes];
  changes.forEach((note, index) => { notes[index] = note; });
  return ensureBarsCoverNotes({ ...progression, notes });
}

export function lassoSelection(
  notes: readonly NoteEvent[], gesture: GridGesture, initial: ReadonlySet<number>,
  zoom: number, rowHeight: number, track: number | null,
) {
  const selected = new Set(initial);
  if (!crossedThreshold(gesture)) return selected;
  const left = Math.min(gesture.origin.x, gesture.point.x) / zoom;
  const right = Math.max(gesture.origin.x, gesture.point.x) / zoom;
  const top = Math.min(gesture.origin.y, gesture.point.y);
  const bottom = Math.max(gesture.origin.y, gesture.point.y);
  notes.forEach((note, index) => {
    if (track !== null && trackIndexOf(note) !== track) return;
    const row = (MAX_MIDI - note.midi) * rowHeight;
    if (row < bottom && row + rowHeight > top && note.timeStart < right && note.timeStart + note.duration > left) {
      selected.add(index);
    }
  });
  return selected;
}

/** A click cuts at the pointer. For a stroke, cut where it crosses each pitch row. */
export function sliceNotes(
  notes: NoteEvent[], { origin, point }: GridGesture, zoom: number, snap: number,
  track: number | null, rowHeight: number,
) {
  const result: NoteEvent[] = [];
  for (const note of notes) {
    const top = (MAX_MIDI - note.midi) * rowHeight;
    const bottom = top + rowHeight;
    if ((track !== null && trackIndexOf(note) !== track) ||
      Math.max(origin.y, point.y) < top || Math.min(origin.y, point.y) >= bottom) {
      result.push(note);
      continue;
    }
    const dy = point.y - origin.y;
    // Clip the stroke to the pitch row. A horizontal stroke cuts at its
    // midpoint within the note; a diagonal stroke uses the same rule in either direction.
    const a = dy ? clamp((top - origin.y) / dy, 0, 1) : 0;
    const b = dy ? clamp((bottom - origin.y) / dy, 0, 1) : 1;
    const x1 = (origin.x + a * (point.x - origin.x)) / zoom;
    const x2 = (origin.x + b * (point.x - origin.x)) / zoom;
    const end = note.timeStart + note.duration;
    const left = Math.max(note.timeStart, Math.min(x1, x2));
    const right = Math.min(end, Math.max(x1, x2));
    const split = snapDelta((left + right) / 2, snap);
    if (left <= right && split - note.timeStart >= FREE_SNAP && end - split >= FREE_SNAP) {
      result.push({ ...note, duration: split - note.timeStart }, { ...note, timeStart: split, duration: end - split });
    } else {
      result.push(note);
    }
  }
  return result.length === notes.length ? notes : result;
}
