import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Note } from "@tonaljs/tonal";
import { Draw, Lock, Unlock } from "./StudioIcons";
import { ensureBarsCoverNotes } from "../lib/transforms";
import { placeStamp, previewStamp } from "../lib/stampPresets";
import { ProgressionData, NoteEvent, getScaleChromas } from "../lib/theory";
import { initAudio, playNote } from "../lib/audio";
import { trackIndexOf, listTracks } from "../lib/tracks";
import { normalizeLoopRange, sequenceEndQuarters, type LoopRange } from "../lib/timeline";
import {
  FREE_SNAP,
  KEYBOARD_WIDTH,
  MAX_MIDI,
  MAX_PROJECT_BEATS,
  MAX_PROJECT_NOTES,
  MAX_ZOOM,
  MIDI_RANGE,
  MIN_ZOOM,
  NOTE_HEIGHT,
  VELOCITY_LANE_HEIGHT,
  clamp,
  getTrackColorClasses,
} from "../lib/constants";
import { crossedThreshold, draggedNotes, drawNote, lassoSelection, placementTick, replaceDraggedNotes, sliceNotes,
  type GridGesture, type GridPoint, type NoteDrag } from "../lib/pianoGestures";
import { layoutVelocityStems } from "../lib/velocityLayout";
import { ToolMode } from "./EditToolbar";
import { NotePrecisionEditor } from "./NotePrecisionEditor";
import { nudgeNoteSelection, type NoteField } from "../lib/noteEditing";

export interface PianoRollProps {
  progression: ProgressionData | null;
  /** null shows all tracks; an index shows one editable track lane. */
  focusedTrack: number | null;
  statusLabel: string;
  fitRequest: number;
  onStartBlank: () => void;
  onGenerate: () => void;
  onLoadFile: (file: File) => void;
  root: string;
  mode: "major" | "minor";
  selectedIndices: Set<number>;
  toolMode: ToolMode;
  stampType: string;
  noteLength: number;
  snapResolution: number;
  zoomX: number;
  isPlaying: boolean;
  currentTick: number;
  followPlayback: boolean;
  isLooping: boolean;
  loopRegion: LoopRange | null;
  onLoopRegionChange: (range: LoopRange | null) => void;
  onToggleChordLock: (index: number) => void;
  /** Bumped by the parent whenever a fresh sequence should re-center the view. */
  scrollAnchorKey: number;
  onSelectionChange: (indices: Set<number>) => void;
  commit: (updater: (prev: ProgressionData | null) => ProgressionData | null) => void;
  onZoomChange: (zoom: number) => void;
  onScrub: (tick: number) => void;
  onScrubStateChange: (isScrubbing: boolean) => void;
  onLivePreview: (preview: ProgressionData | null) => void;
  onAudioPreviewError?: (message: string) => void;
  onStampError?: (message: string) => void;
}

interface LoopDrag {
  mode: "in" | "out" | "new";
  origin: number;
  range: LoopRange;
}

type EditGesture = NoteDrag
  | (GridGesture & { kind: "draw" | "stamp"; midi: number; track: number })
  | (GridGesture & { kind: "lasso" | "slice"; initial: Set<number> });

function isNoteDrag(gesture: EditGesture): gesture is NoteDrag {
  return gesture.kind === "move" || gesture.kind === "resize" || gesture.kind === "velocity";
}

const validPlacement = (note: Pick<NoteEvent, "timeStart" | "duration">) =>
  note.timeStart + note.duration <= MAX_PROJECT_BEATS;

const emptyChanges: ReadonlyMap<number, NoteEvent> = new Map();

const SELECTED_NOTE_COLORS = "bg-[#3b5265] border-[#213646]";
const ACTIVE_NOTE_COLORS = "bg-[#29333c] border-[#182127]";
const BLACK_KEY_CLASSES = [1, 3, 6, 8, 10];
const TOOL_HINTS: Record<ToolMode, string> = {
  draw: "Draw · Tap grid to add; drag for length",
  select: "Select · Tap a note; drag to move or lasso",
  stamp: "Stamp · Choose a preset, then tap a row to place a chord or progression",
  cut: "Slice · Drag across notes to split",
  pan: "Hand · Drag canvas to navigate",
};

export function PianoRoll({
  progression,
  focusedTrack,
  statusLabel,
  fitRequest,
  onStartBlank,
  onGenerate,
  onLoadFile,
  root,
  mode,
  selectedIndices,
  toolMode,
  stampType,
  noteLength,
  snapResolution,
  zoomX,
  isPlaying,
  currentTick,
  followPlayback,
  isLooping,
  loopRegion,
  onLoopRegionChange,
  onToggleChordLock,
  scrollAnchorKey,
  onSelectionChange,
  commit,
  onZoomChange,
  onScrub,
  onScrubStateChange,
  onLivePreview,
  onAudioPreviewError,
  onStampError,
}: PianoRollProps) {
  const [gesture, setGesture] = useState<EditGesture | null>(null);
  const gestureRef = useRef<EditGesture | null>(null);
  const updateGesture = (next: EditGesture | null) => {
    gestureRef.current = next;
    setGesture(next);
  };
  const [hover, setHover] = useState<{ beat: number; midi: number } | null>(null);
  const [loopPreview, setLoopPreview] = useState<LoopRange | null>(null);
  const [containerWidth, setContainerWidth] = useState(1200);
  const [rowHeight, setRowHeight] = useState(NOTE_HEIGHT);
  // The "All tracks" view does not mean new notes belong to an invisible
  // track zero. Choose the first real track when none is explicitly focused.
  const drawTrackIndex = useMemo(() => focusedTrack ??
    (progression ? listTracks(progression)[0]?.index : undefined) ?? 0,
  [focusedTrack, progression]);

  // Roving tab stop: one grid note is reachable by Tab; arrows move between
  // visible notes, without adding hundreds of tab stops to the page.
  const [keyboardNoteIndex, setKeyboardNoteIndex] = useState<number | null>(null);
  const keyboardNoteOrder = useMemo(() => progression?.notes
    .map((note, index) => ({ note, index }))
    .filter(({ note }) => focusedTrack === null || trackIndexOf(note) === focusedTrack)
    .sort((a, b) => a.note.timeStart - b.note.timeStart || a.note.midi - b.note.midi || a.index - b.index)
    .map(({ index }) => index) ?? [], [progression, focusedTrack]);
  const tabStopIndex = keyboardNoteIndex !== null && keyboardNoteOrder.includes(keyboardNoteIndex)
    ? keyboardNoteIndex : keyboardNoteOrder[0] ?? null;
  const trackNameByIndex = useMemo(() => new Map(
    listTracks(progression).map(track => [track.index, track.name]),
  ), [progression]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const emptyImportRef = useRef<HTMLInputElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const isScrubbingRef = useRef(false);
  const loopDragRef = useRef<LoopDrag | null>(null);
  const activePointer = useRef<number | null>(null);
  const panRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const edgeFrame = useRef<number | null>(null);
  const pointerClient = useRef<GridPoint | null>(null);
  const captureTarget = useRef<HTMLElement | null>(null);
  const beginGesture = (event: React.PointerEvent) => {
    if (!event.isPrimary || activePointer.current !== null) return false;
    event.preventDefault();
    activePointer.current = event.pointerId;
    setHover(null);
    const element = event.currentTarget as HTMLElement;
    captureTarget.current = element;
    element.setPointerCapture(event.pointerId);
    if (element instanceof HTMLButtonElement && element.matches(".loop-handle")) element.focus({ preventScroll: true });
    else scrollRef.current?.focus({ preventScroll: true });
    return true;
  };
  const zoomAnchorRef = useRef<{ tick: number; offsetPx: number } | null>(null);

  const snapTick = snapResolution > 0 ? snapResolution : FREE_SNAP;
  const sequenceEnd = progression ? sequenceEndQuarters(progression) : 16;
  const displayedLoop = normalizeLoopRange(loopPreview ?? loopRegion, sequenceEnd);
  const scaleChromas = useMemo(() => getScaleChromas(root, mode), [root, mode]);
  // Every imported note carries a trackIndex (single-track files are tagged
  // 0), so gating on "any note tagged" would recolor ordinary single-track
  // imports too. Only turn on track coloring once there's more than one
  // distinct track to actually distinguish.
  const hasTrackColors = useMemo(() => {
    if (!progression) return false;
    const indices = new Set(
      progression.notes
        .map((n) => n.trackIndex)
        .filter((idx): idx is number => idx !== undefined),
    );
    return indices.size > 1;
  }, [progression]);

  // ----- Derived layout -----
  const maxNoteEndTick =
    progression?.notes.reduce(
      (max, n) => Math.max(max, n.timeStart + n.duration),
      0,
    ) || 0;
  const contentBars = Math.max(
    progression?.totalBars || 4,
    Math.ceil(maxNoteEndTick / 4) + 1, // One spare bar, not eight screens of empty canvas.
  );
  const visibleBars = Math.ceil(containerWidth / (zoomX * 4));
  const totalDisplayBars = Math.max(contentBars, visibleBars);
  const contentWidth = totalDisplayBars * 4 * zoomX;

  useEffect(() => {
    if (!scrollRef.current) return;
    const ob = new ResizeObserver((entries) => {
      if (entries[0]) {
        setContainerWidth(entries[0].contentRect.width);
      }
    });
    ob.observe(scrollRef.current);
    return () => ob.disconnect();
  }, []);

  // Center vertically on the sequence whenever a new one arrives.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!progression || !el) return;
    const avgMidi = progression.notes.length
      ? progression.notes.reduce((sum, n) => sum + n.midi, 0) /
        progression.notes.length
      : 60;
    const usableHeight = el.clientHeight - VELOCITY_LANE_HEIGHT - (timelineRef.current?.offsetHeight ?? 0);
    el.scrollTop = Math.max(0, (MAX_MIDI - avgMidi + 0.5) * rowHeight - usableHeight / 2);
    el.scrollLeft = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recenter only on new sequences
  }, [scrollAnchorKey]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    // The initial zero is a restored workspace. Only a new Fit request
    // should overwrite the zoom from an autosave or native project.
    if (!el || !progression || fitRequest === 0) return;
    const end = Math.max(4, sequenceEndQuarters(progression));
    onZoomChange(clamp((el.clientWidth - KEYBOARD_WIDTH - 30) / end, MIN_ZOOM, MAX_ZOOM));
    let low = Infinity, high = -Infinity;
    for (const note of progression.notes) {
      if (focusedTrack !== null && trackIndexOf(note) !== focusedTrack) continue;
      low = Math.min(low, note.midi);
      high = Math.max(high, note.midi);
    }
    const center = low <= high ? (low + high) / 2 : 60;
    const pitchSpan = low <= high ? high - low + 7 : 28;
    const usableHeight = el.clientHeight - VELOCITY_LANE_HEIGHT - (timelineRef.current?.offsetHeight ?? 0);
    const fittedHeight = Math.round(clamp(usableHeight / pitchSpan, 10, 24));
    setRowHeight(fittedHeight);
    el.scrollLeft = 0;
    const frame = requestAnimationFrame(() => {
      el.scrollTop = Math.max(0, (MAX_MIDI - center + 0.5) * fittedHeight - usableHeight / 2);
    });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Fit is an explicit action, not a reaction to every edited note.
  }, [fitRequest]);

  const velocityLayout = useMemo(() => layoutVelocityStems(
    progression?.notes ?? [], focusedTrack, zoomX,
  ), [progression, focusedTrack, zoomX]);

  // A first chord opens the chord strip. Preserve the pitch under the cursor
  // as the header grows (and again if undo removes the last chord).
  const hasChords = !!progression?.chords.length;
  const lastRuler = useRef<{ height: number; anchor: number } | null>(null);
  useLayoutEffect(() => {
    const height = timelineRef.current?.offsetHeight;
    const el = scrollRef.current;
    const previous = lastRuler.current;
    if (el && height && previous?.anchor === scrollAnchorKey)
      el.scrollTop += height - previous.height;
    lastRuler.current = height ? { height, anchor: scrollAnchorKey } : null;
  }, [hasChords, scrollAnchorKey]);

  // Follow the playhead.
  useEffect(() => {
    if (isPlaying && followPlayback && activePointer.current === null && !isScrubbingRef.current && !loopDragRef.current && scrollRef.current) {
      const targetScroll =
        currentTick * zoomX - scrollRef.current.clientWidth / 2;
      scrollRef.current.scrollLeft = Math.max(0, targetScroll);
    }
  }, [currentTick, isPlaying, zoomX, followPlayback]);

  // Ctrl+wheel zoom (anchored at the cursor), shift+wheel horizontal scroll.
  const zoomXRef = useRef(zoomX);
  useEffect(() => {
    zoomXRef.current = zoomX;
  }, [zoomX]);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (activePointer.current !== null) { e.preventDefault(); return; }
      if (e.ctrlKey || e.metaKey) {
        setHover(null);
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const pointerOffset = e.clientX - rect.left - KEYBOARD_WIDTH;
        const contentX = el.scrollLeft + pointerOffset;
        const tickAtPointer = contentX / zoomXRef.current;
        const newZoom = clamp(
          zoomXRef.current + e.deltaY * -0.1,
          MIN_ZOOM,
          MAX_ZOOM,
        );
        if (newZoom !== zoomXRef.current) {
          zoomAnchorRef.current = { tick: tickAtPointer, offsetPx: pointerOffset };
          onZoomChange(newZoom);
        }
      } else if (e.shiftKey) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onZoomChange]);

  // Apply the zoom anchor after the new zoom level has been committed.
  useLayoutEffect(() => {
    const anchor = zoomAnchorRef.current;
    if (anchor && scrollRef.current) {
      zoomAnchorRef.current = null;
      scrollRef.current.scrollLeft = Math.max(
        0,
        anchor.tick * zoomX - anchor.offsetPx,
      );
    }
  }, [zoomX]);

  const changes = useMemo(() => gesture && isNoteDrag(gesture)
    ? draggedNotes(gesture, zoomX, rowHeight, snapResolution) : emptyChanges,
  [gesture, zoomX, rowHeight, snapResolution]);
  const drawing = useMemo(() => gesture?.kind === "draw"
    ? drawNote(gesture, gesture.midi, zoomX, snapResolution, noteLength, gesture.track) : null,
  [gesture, zoomX, snapResolution, noteLength]);
  const liveSelection = useMemo(() => {
    if (gesture && isNoteDrag(gesture)) return new Set(gesture.indices);
    if (gesture?.kind === "lasso" && progression)
      return lassoSelection(progression.notes, gesture, gesture.initial, zoomX, rowHeight, focusedTrack);
    return selectedIndices;
  }, [gesture, selectedIndices, progression, zoomX, rowHeight, focusedTrack]);

  useEffect(() => {
    let preview: ProgressionData | null = null;
    if (progression && drawing && validPlacement(drawing) && progression.notes.length < MAX_PROJECT_NOTES)
      preview = ensureBarsCoverNotes({ ...progression, notes: [...progression.notes, drawing] });
    else if (progression && changes.size) preview = replaceDraggedNotes(progression, changes);
    onLivePreview(preview);
  }, [changes, drawing, progression, onLivePreview]);

  // ----- Interaction handlers -----

  const updateScrubPosition = useCallback(
    (clientX: number) => {
      if (!timelineRef.current || !progression) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const tick = clamp(
        (clientX - rect.left) / zoomX,
        0,
        totalDisplayBars * 4,
      );
      onScrub(tick);
    },
    [progression, zoomX, totalDisplayBars, onScrub],
  );

  // Loop range edits are separate from seeking and never write MIDI history.
  // Quarter-note minimum preserves a valid region even at very small zoom.
  const snappedLoopTick = (clientX: number): number => {
    if (!timelineRef.current) return 0;
    const rect = timelineRef.current.getBoundingClientRect();
    const step = snapResolution > 0 ? snapResolution : 0.25;
    return clamp(Math.round(((clientX - rect.left) / zoomX) / step) * step, 0, sequenceEnd);
  };

  const handleLoopHandleDown = (e: React.PointerEvent<HTMLButtonElement>, mode: "in" | "out") => {
    if (e.button !== 0 || !e.isPrimary || !progression) return;
    e.stopPropagation();
    if (!beginGesture(e)) return;
    loopDragRef.current = { mode, origin: mode === "in" ? displayedLoop.start : displayedLoop.end, range: displayedLoop };
  };

  const handleLoopKey = (e: React.KeyboardEvent<HTMLButtonElement>, mode: "in" | "out") => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
    const step = snapResolution > 0 ? snapResolution : 0.25;
    const old = displayedLoop;
    const value = mode === "in" ? old.start : old.end;
    const target = e.key === "Home" ? 0
      : e.key === "End" ? sequenceEnd
      : value + (e.key === "ArrowRight" ? step : -step);
    const changed = mode === "in"
      ? { start: clamp(target, 0, old.end - 1), end: old.end }
      : { start: old.start, end: clamp(target, old.start + 1, sequenceEnd) };
    onLoopRegionChange(normalizeLoopRange(changed, sequenceEnd));
  };

  const handleTimelinePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !e.isPrimary || !progression) return;
    if (!beginGesture(e)) return;
    if (e.shiftKey) {
      const tick = snappedLoopTick(e.clientX);
      const start = Math.min(tick, sequenceEnd - 1);
      const range = { start, end: Math.min(sequenceEnd, start + 1) };
      loopDragRef.current = { mode: "new", origin: start, range };
      setLoopPreview(range);
      return;
    }
    isScrubbingRef.current = true;
    onScrubStateChange(true);
    updateScrubPosition(e.clientX);
  };

  const pointerPoint = (event: { clientX: number; clientY: number }, velocity = false): GridPoint => {
    if (velocity) return { x: event.clientX, y: event.clientY };
    const rect = gridRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const pointerOrigin = (event: React.PointerEvent, velocity = false): GridGesture => {
    const origin = pointerPoint(event, velocity);
    return { origin, point: origin, threshold: event.pointerType === "touch" ? 7 : 4 };
  };
  const pitchAt = (y: number) => clamp(MAX_MIDI - Math.floor(y / rowHeight), 0, MAX_MIDI);
  const audition = (notes: Pick<NoteEvent, "name" | "velocity" | "trackIndex">[]) => {
    if (isPlaying) return;
    void initAudio().then(() => notes.slice(0, 8).forEach(note =>
      playNote(note.name, 0.25, note.velocity, note.trackIndex ?? 0)))
      .catch(() => onAudioPreviewError?.("Audio preview could not start. Use Play to retry after enabling audio."));
  };

  const handleGridPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!progression || (e.button !== 0 && e.button !== 1) || !beginGesture(e)) return;
    if (toolMode === "pan" || e.button === 1) {
      const el = scrollRef.current!;
      panRef.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
      return;
    }
    const base = pointerOrigin(e);
    if (toolMode === "select" || toolMode === "cut") {
      updateGesture({ ...base, kind: toolMode === "cut" ? "slice" : "lasso",
        initial: e.shiftKey ? new Set(selectedIndices) : new Set() });
      return;
    }
    const midi = pitchAt(base.origin.y);
    updateGesture({ ...base, kind: toolMode, midi, track: drawTrackIndex });
    if (toolMode === "draw") audition([{ name: Note.fromMidi(midi) || "C4", velocity: 0.8, trackIndex: drawTrackIndex }]);
  };

  const handleGridHover = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((toolMode !== "draw" && toolMode !== "stamp") || event.pointerType === "touch" || event.buttons || activePointer.current !== null ||
      (event.target as HTMLElement).closest(".roll-note")) {
      setHover(null);
      return;
    }
    const point = pointerPoint(event);
    const midi = pitchAt(point.y);
    const beat = placementTick(point.x, zoomX, snapResolution);
    setHover(prev => prev?.midi === midi && prev.beat === beat ? prev : { midi, beat });
  };

  const handleNoteDown = (e: React.PointerEvent, index: number, kind: NoteDrag["kind"]) => {
    if (e.button === 2) return;
    if (kind !== "velocity" && (toolMode === "cut" || toolMode === "pan" || e.button === 1)) return;
    e.stopPropagation();
    if (!progression || e.button !== 0 || !beginGesture(e)) return;
    const selected = new Set(e.shiftKey || selectedIndices.has(index) ? selectedIndices : []);
    selected.add(index);
    const indices = Array.from(selected).filter(i => {
      const n = progression.notes[i];
      return n && (focusedTrack === null || trackIndexOf(n) === focusedTrack);
    });
    updateGesture({ ...pointerOrigin(e, kind === "velocity"), kind, clicked: index, shift: e.shiftKey,
      indices, notes: indices.map(i => progression.notes[i]) });
    if (kind === "move") audition([progression.notes[index]]);
  };

  const handleNoteDelete = (targetNote: NoteEvent, index: number) => {
    const wasSelected = selectedIndices.has(index);
    const selected = new Set(selectedIndices);
    commit((prev) => {
      if (!prev) return prev;
      if (wasSelected) {
        return {
          ...prev,
          notes: prev.notes.filter((_, i) => !selected.has(i)),
        };
      }
      return { ...prev, notes: prev.notes.filter((n) => n !== targetNote) };
    });
    onSelectionChange(new Set());
  };

  const nudgeFromKey = (event: React.KeyboardEvent, targets: ReadonlySet<number>) => {
    if (event.ctrlKey || event.metaKey || !targets.size) return false;
    let field: Exclude<NoteField, "velocity">;
    let delta: number;
    if (event.key === "[" || event.key === "]") {
      field = "duration";
      delta = event.key === "]" ? snapTick : -snapTick;
    } else if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      field = "midi";
      delta = event.key === "ArrowUp" ? 1 : -1;
    } else if (event.altKey && (event.key === "ArrowRight" || event.key === "ArrowLeft")) {
      field = "timeStart";
      delta = event.key === "ArrowRight" ? snapTick : -snapTick;
    } else {
      return false;
    }
    event.preventDefault();
    event.stopPropagation();
    commit(prev => prev ? nudgeNoteSelection(prev, targets, field, delta) : prev);
    return true;
  };

  const handleNoteKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, index: number) => {
    if (!progression || event.ctrlKey || event.metaKey) return;
    const note = progression.notes[index];
    if (!note) return;
    const targets = selectedIndices.has(index) ? selectedIndices : new Set([index]);
    if (nudgeFromKey(event, targets)) {
      if (targets !== selectedIndices) onSelectionChange(targets);
      return;
    }
    const arrow = ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"].includes(event.key);
    if (arrow) {
      event.preventDefault();
      event.stopPropagation();
      const at = keyboardNoteOrder.indexOf(index);
      const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
      const next = keyboardNoteOrder[(at + direction + keyboardNoteOrder.length) % keyboardNoteOrder.length];
      if (next === undefined) return;
      if (event.shiftKey) onSelectionChange(new Set([...selectedIndices, index, next]));
      setKeyboardNoteIndex(next);
      window.requestAnimationFrame(() => {
        const element = gridRef.current?.querySelector<HTMLElement>('[data-note-index="' + next + '"]');
        element?.focus({ preventScroll: true });
        element?.scrollIntoView({ block: "nearest", inline: "nearest" });
      });
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      const next = new Set(event.shiftKey ? selectedIndices : []);
      if (event.shiftKey && next.has(index)) next.delete(index);
      else next.add(index);
      onSelectionChange(next);
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      event.stopPropagation();
      handleNoteDelete(note, index);
      setKeyboardNoteIndex(null);
    }
  };

  const updateNavigation = (event: PointerEvent) => {
    const drag = loopDragRef.current;
    if (drag) {
      const tick = snappedLoopTick(event.clientX);
      let next: LoopRange;
      if (drag.mode === "in") next = { start: Math.min(tick, drag.range.end - 1), end: drag.range.end };
      else if (drag.mode === "out") next = { start: drag.range.start, end: Math.max(tick, drag.range.start + 1) };
      else if (tick >= drag.origin) next = { start: drag.origin, end: Math.max(drag.origin + 1, tick) };
      else next = { start: Math.min(tick, drag.origin - 1), end: drag.origin };
      drag.range = normalizeLoopRange(next, sequenceEnd);
      setLoopPreview(drag.range);
    } else if (panRef.current && scrollRef.current) {
      const pan = panRef.current;
      scrollRef.current.scrollLeft = pan.left - (event.clientX - pan.x);
      scrollRef.current.scrollTop = pan.top - (event.clientY - pan.y);
    } else if (isScrubbingRef.current) {
      updateScrubPosition(event.clientX);
    }
  };

  const finishEdit = (edit: EditGesture) => {
    if (!progression) return;
    if (isNoteDrag(edit)) {
      const finished = draggedNotes(edit, zoomX, rowHeight, snapResolution);
      if (finished.size) {
        commit(prev => prev === progression ? replaceDraggedNotes(prev, finished) : prev);
        if (edit.kind === "move" && finished.get(edit.clicked)?.midi !== progression.notes[edit.clicked].midi)
          audition(Array.from(finished.values()));
      }
      const selected = new Set(edit.indices);
      if (!crossedThreshold(edit) && edit.shift && selectedIndices.has(edit.clicked)) selected.delete(edit.clicked);
      onSelectionChange(selected);
      setKeyboardNoteIndex(edit.clicked);
    } else if (edit.kind === "draw") {
      const note = drawNote(edit, edit.midi, zoomX, snapResolution, noteLength, edit.track);
      if (progression.notes.length >= MAX_PROJECT_NOTES) {
        onStampError?.("The project already contains 60,000 notes.");
        return;
      }
      if (!validPlacement(note)) {
        onStampError?.("This note extends past bar 512. Choose an earlier beat or a shorter length.");
        return;
      }
      const index = progression.notes.length;
      commit(prev => prev === progression ? ensureBarsCoverNotes({ ...prev, notes: [...prev.notes, note] }) : prev);
      onSelectionChange(new Set([index]));
      setKeyboardNoteIndex(index);
    } else if (edit.kind === "stamp") {
      const tick = placementTick(edit.origin.x, zoomX, snapResolution);
      const result = placeStamp(progression, stampType, edit.midi, tick, noteLength, edit.track);
      if (!result) {
        onStampError?.("This stamp cannot fit here. Try an earlier bar or check the project limits.");
        return;
      }
      commit(prev => prev === progression ? result.progression : prev);
      onSelectionChange(new Set(result.addedNotes.map((_, i) => progression.notes.length + i)));
      setKeyboardNoteIndex(progression.notes.length);
      if (result.addedChords.length)
        audition(result.addedNotes.filter(note => note.timeStart === result.addedChords[0].timeStart));
    } else if (edit.kind === "slice") {
      const notes = sliceNotes(progression.notes, edit, zoomX, snapResolution, focusedTrack, rowHeight);
      if (notes === progression.notes) return;
      if (notes.length > MAX_PROJECT_NOTES) {
        onStampError?.("This cut exceeds the project’s 60,000-note limit.");
        return;
      }
      commit(prev => prev === progression ? { ...prev, notes } : prev);
      onSelectionChange(new Set());
    } else if (edit.kind === "lasso") {
      onSelectionChange(lassoSelection(progression.notes, edit, edit.initial, zoomX, rowHeight, focusedTrack));
    }
  };
  const resetPointer = () => {
    const id = activePointer.current;
    activePointer.current = null;
    if (id !== null && captureTarget.current?.hasPointerCapture(id)) captureTarget.current.releasePointerCapture(id);
    captureTarget.current = null;
    pointerClient.current = null;
    if (edgeFrame.current !== null) cancelAnimationFrame(edgeFrame.current);
    edgeFrame.current = null;
    if (isScrubbingRef.current) onScrubStateChange(false);
    isScrubbingRef.current = false;
    loopDragRef.current = null;
    panRef.current = null;
    setLoopPreview(null);
    updateGesture(null);
    onLivePreview(null);
  };
  const scrollAtEdge = () => {
    edgeFrame.current = null;
    const edit = gestureRef.current;
    const el = scrollRef.current;
    const client = pointerClient.current;
    if (!edit || !el || !client || !crossedThreshold(edit) || edit.kind === "velocity" || edit.kind === "stamp") return;
    const rect = el.getBoundingClientRect();
    const left = rect.left + KEYBOARD_WIDTH;
    const top = rect.top + (timelineRef.current?.offsetHeight ?? 0);
    const right = rect.left + el.clientWidth;
    const bottom = rect.top + el.clientHeight - VELOCITY_LANE_HEIGHT;
    // Keep the activation strip inside the canvas: touch cannot travel past a screen edge.
    const xMargin = Math.min(20, Math.max(0, right - left) / 8);
    const yMargin = Math.min(20, Math.max(0, bottom - top) / 8);
    const dx = client.x < left + xMargin ? client.x - left - xMargin : Math.max(0, client.x - right + xMargin);
    const dy = client.y < top + yMargin ? client.y - top - yMargin : Math.max(0, client.y - bottom + yMargin);
    const beforeX = el.scrollLeft;
    const beforeY = el.scrollTop;
    el.scrollLeft += clamp(Math.round(dx / 2), -18, 18);
    if (edit.kind === "move" || edit.kind === "lasso" || edit.kind === "slice")
      el.scrollTop += clamp(Math.round(dy / 2), -18, 18);
    if (el.scrollLeft !== beforeX || el.scrollTop !== beforeY) {
      updateGesture({ ...edit, point: pointerPoint({ clientX: client.x, clientY: client.y }) });
      edgeFrame.current = requestAnimationFrame(scrollAtEdge);
    }
  };
  const onDragMove = (event: PointerEvent) => {
    if (event.pointerId !== activePointer.current) return;
    const edit = gestureRef.current;
    if (edit) {
      pointerClient.current = { x: event.clientX, y: event.clientY };
      updateGesture({ ...edit, point: pointerPoint(event, edit.kind === "velocity") });
      if (edgeFrame.current === null) edgeFrame.current = requestAnimationFrame(scrollAtEdge);
    } else updateNavigation(event);
  };
  const onDragUp = (event: PointerEvent) => {
    if (event.pointerId !== activePointer.current) return;
    const edit = gestureRef.current;
    if (edit) finishEdit({ ...edit, point: pointerPoint(event, edit.kind === "velocity") });
    else {
      updateNavigation(event);
      if (loopDragRef.current) onLoopRegionChange(loopDragRef.current.range);
    }
    resetPointer();
  };
  // Pointerup can precede React painting the last move. Resolve the final position
  // directly from the release event and the same origin used for the preview.
  const handlersRef = useRef({ onDragMove, onDragUp, resetPointer });
  useLayoutEffect(() => { handlersRef.current = { onDragMove, onDragUp, resetPointer }; });
  useEffect(() => {
    const move = (event: PointerEvent) => handlersRef.current.onDragMove(event);
    const up = (event: PointerEvent) => handlersRef.current.onDragUp(event);
    const cancel = () => { if (activePointer.current !== null) handlersRef.current.resetPointer(); };
    const cancelPointer = (event: PointerEvent) => { if (event.pointerId === activePointer.current) cancel(); };
    const key = (event: KeyboardEvent) => {
      if (activePointer.current === null || event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      cancel();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancelPointer);
    window.addEventListener("lostpointercapture", cancelPointer);
    window.addEventListener("blur", cancel);
    window.addEventListener("keydown", key, true);
    return () => {
      if (edgeFrame.current !== null) cancelAnimationFrame(edgeFrame.current);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancelPointer);
      window.removeEventListener("lostpointercapture", cancelPointer);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("keydown", key, true);
    };
  }, []);
  // Undo, a track switch or a layout/tool change invalidates the gesture's original coordinates.
  useLayoutEffect(() => {
    if (activePointer.current !== null) handlersRef.current.resetPointer();
  }, [progression, focusedTrack, toolMode, zoomX, rowHeight, snapResolution, noteLength, stampType, fitRequest]);

  const hoverNote = hover && toolMode === "draw" && !gesture
    ? { midi: hover.midi, timeStart: hover.beat, duration: noteLength } : null;
  const drawGhost = drawing ?? hoverNote;
  const stampBeat = gesture?.kind === "stamp" ? placementTick(gesture.origin.x, zoomX, snapResolution)
    : toolMode === "stamp" && !gesture ? hover?.beat : undefined;
  const stampMidi = gesture?.kind === "stamp" ? gesture.midi : hover?.midi;
  const stampPreview = useMemo(() => progression && stampBeat !== undefined && stampMidi !== undefined
    ? previewStamp(stampType, stampMidi, stampBeat, noteLength, drawTrackIndex, progression.notes.length) : null,
  [progression, stampType, stampMidi, stampBeat, noteLength, drawTrackIndex]);
  const ghosts = stampPreview?.addedNotes ?? (drawGhost && validPlacement(drawGhost) &&
    (progression?.notes.length ?? 0) < MAX_PROJECT_NOTES ? [drawGhost] : []);
  const activeEdit = gesture && isNoteDrag(gesture) ? changes.get(gesture.clicked) ?? progression?.notes[gesture.clicked] : null;
  const readout = stampPreview && stampMidi !== undefined && stampBeat !== undefined
    ? { midi: stampMidi, timeStart: stampBeat, duration: noteLength }
    : drawGhost ?? activeEdit;
  const unavailable = (stampBeat !== undefined && !stampPreview) || (!!drawGhost && !ghosts.length);
  let readoutText: string | null = null;
  if (unavailable) {
    readoutText = "Placement exceeds project limits";
  } else if (readout) {
    let detail = Number(readout.duration.toFixed(3)) + (readout.duration === 1 ? " beat" : " beats");
    if (stampPreview) detail = stampPreview.addedNotes.length + " notes";
    if (gesture?.kind === "velocity" && activeEdit) detail = Math.round(activeEdit.velocity * 100) + "% velocity";
    const bar = Math.floor(readout.timeStart / 4) + 1;
    const beat = Number((readout.timeStart % 4 + 1).toFixed(3));
    readoutText = (Note.fromMidi(readout.midi) ?? "") + " · Bar " + bar + ", beat " + beat + " · " + detail;
  }
  // ----- Render -----
  return (
    <section aria-label="Piano roll editor" className="piano-editor">
        {progression && <NotePrecisionEditor
          progression={progression} visibleIndices={keyboardNoteOrder} trackNames={trackNameByIndex}
          drawTrackIndex={drawTrackIndex} currentTick={currentTick} noteLength={noteLength} step={snapTick}
          selectedIndices={selectedIndices} onSelectionChange={onSelectionChange} commit={commit} />}
        <p id="piano-note-keyboard-help" className="sr-only">
          Use Tab to focus a note, arrows to navigate notes in the focused track, Enter or Space to select,
          Shift with arrows or Enter to extend selection, Alt with arrows to move pitch or timing,
          left and right brackets to resize, and Delete to remove. Undo and redo use Control or Command Z.
        </p>
        <div className="piano-viewport" ref={scrollRef} tabIndex={0} role="region" aria-label="Piano roll canvas"
          onKeyDown={event => {
            if (event.target === event.currentTarget) nudgeFromKey(event, selectedIndices);
          }}
          onContextMenu={e => e.preventDefault()} onScroll={() => setHover(null)}>
          {!progression ? (
            <div className="pattern-empty">
              <h2>Start with a pattern.</h2>
              <p>Generate an idea, draw notes, or import MIDI.</p>
              <div className="empty-actions">
                <button className="primary-button" onClick={onGenerate}>Generate pattern</button>
                <button className="secondary-button" onClick={onStartBlank}><Draw size={14} />Start blank</button>
              </div>
              <input type="file" ref={emptyImportRef} accept=".mid,.midi" className="hidden" aria-label="Import MIDI into empty project" onChange={event => {
                const file = event.target.files?.[0]; if (file) onLoadFile(file); event.target.value = "";
              }} />
              <button className="text-button empty-hint" onClick={() => emptyImportRef.current?.click()}>Or import your own MIDI</button>
            </div>
          ) : (
            <div className="piano-content" data-has-chords={progression.chords.length > 0}
              style={{ "--beat-width": zoomX + "px", "--row-height": rowHeight + "px" } as CSSProperties}>
              {/* Top Header Row (Sticky) */}
              <div className="flex sticky top-0 z-50">
                <div
                  className="piano-timeline sticky left-0 z-50 border-r border-[var(--border-color)] flex-shrink-0"
                  style={{ width: `${KEYBOARD_WIDTH}px` }}
                />
                <div
                  ref={timelineRef}
                  onPointerDown={handleTimelinePointerDown}
                  onDoubleClick={() => onLoopRegionChange(null)}
                  className="piano-timeline relative cursor-pointer group flex-1"
                  style={{ minWidth: `${contentWidth}px`, touchAction: "none" }}
                  title="Drag to seek · Shift+drag to select a loop · double-click to reset loop"
                >
                  <div className="absolute inset-0 bg-white/0 group-hover:bg-white/5 transition-colors pointer-events-none" />
                  {Array.from({ length: totalDisplayBars }).map((_, i) => (
                    <div
                      key={`bar-${i}`}
                      className="measure-number absolute font-mono pointer-events-none border-l pl-2"
                      style={{ left: `${i * 4 * zoomX}px` }}
                    >
                      {i + 1}
                      {zoomX >= 42 && [1, 2, 3].map(beat => <span key={beat} className="ruler-beat"
                        aria-hidden="true" style={{ left: beat * zoomX }}>{beat + 1}</span>)}
                      {progression.arrangementSections?.find(section => section.startBar === i) &&
                        <span className="song-form-marker">
                          {progression.arrangementSections.find(section => section.startBar === i)?.label}
                        </span>}
                    </div>
                  ))}
                  <div className="ruler-playhead" aria-hidden="true" style={{ left: currentTick * zoomX }} />
                  <div className={"loop-range-band" + (!isLooping ? " inactive" : "")}
                    aria-hidden="true" style={{ left: displayedLoop.start * zoomX, width: (displayedLoop.end - displayedLoop.start) * zoomX }} />
                  {(["in", "out"] as const).map(edge => {
                    const value = edge === "in" ? displayedLoop.start : displayedLoop.end;
                    return <button key={edge} type="button" role="slider"
                      className={"loop-handle " + (edge === "in" ? "loop-in" : "loop-out")}
                      data-testid={"loop-" + edge}
                      aria-label={edge === "in" ? "Loop in" : "Loop out"}
                      aria-valuemin={edge === "in" ? 0 : displayedLoop.start + 1}
                      aria-valuemax={edge === "in" ? displayedLoop.end - 1 : sequenceEnd}
                      aria-valuenow={value}
                      aria-valuetext={"Bar " + (Math.floor(value / 4) + 1) + ", beat " + (Math.floor(value % 4) + 1)}
                      style={{ left: value * zoomX }}
                      title={"Loop " + edge + ": drag or use arrow keys"}
                      onPointerDown={event => handleLoopHandleDown(event, edge)}
                      onKeyDown={event => handleLoopKey(event, edge)}
                      onDoubleClick={event => event.stopPropagation()}
                    ><span aria-hidden="true" /></button>;
                  })}
                  <div className="chord-strip" aria-label="Chord progression">
                    {progression.chords.map((chord, i) => chord.generatedSourceTrackIndex !== undefined
                      ? <button key={i} type="button"
                        className={"chord-chip chord-lock-toggle" + (chord.locked ? " is-locked" : "")}
                        style={{ left: chord.timeStart * zoomX, width: chord.duration * zoomX }}
                        data-testid={"chord-lock-" + i}
                        aria-pressed={!!chord.locked}
                        aria-label={(chord.locked ? "Unlock " : "Lock ") + chord.name +
                          " at bar " + (Math.floor(chord.timeStart / 4) + 1)}
                        title={(chord.locked ? "Unlock" : "Lock") + " chord and its generated accompaniment"}
                        onPointerDown={event => event.stopPropagation()}
                        onDoubleClick={event => event.stopPropagation()}
                        onClick={event => { event.stopPropagation(); onToggleChordLock(i); }}>
                        <span className="chord-dot" aria-hidden="true" />
                        <span className="chord-name">{chord.name}</span>
                        {chord.locked ? <Lock size={11} aria-hidden="true" />
                          : <Unlock size={11} aria-hidden="true" />}
                      </button>
                      : <div key={i} className="chord-chip"
                        style={{ left: chord.timeStart * zoomX, width: chord.duration * zoomX }}>
                        <span className="chord-dot" />{chord.name}</div>)}
                  </div>
                </div>
              </div>

              {/* Body Row */}
              <div className="flex relative">
                {/* Left Sticky Keyboard */}
                <div
                  className="sticky left-0 z-40 bg-[var(--app-bg)] border-r border-[var(--border-strong)] flex-shrink-0"
                  style={{
                    width: `${KEYBOARD_WIDTH}px`,
                    height: `${(MIDI_RANGE * rowHeight)}px`,
                  }}
                >
                  {Array.from({ length: MIDI_RANGE }).map((_, i) => {
                    const midi = MAX_MIDI - i;
                    const noteClass = midi % 12;
                    const isBlack = BLACK_KEY_CLASSES.includes(noteClass);
                    const isC = noteClass === 0;
                    const isInScale = scaleChromas.has(noteClass);
                    return (
                      <div
                        key={`key-${i}`}
                        data-highlighted={readout?.midi === midi}
                        onPointerDown={async (e) => {
                          if (e.button !== 0) return;
                          try {
                            await initAudio();
                          } catch {
                            onAudioPreviewError?.("Audio preview could not start. Notes are still editable; use Play to retry after enabling audio.");
                            return; // Still allow editing when audio is unavailable.
                          }
                          const name = Note.fromMidi(midi);
                          if (name) playNote(name);
                        }}
                        className={`piano-key absolute w-full border-b border-[var(--border-color)] flex items-center justify-end pr-1 text-[8px] font-mono hover:brightness-125 cursor-pointer active:brightness-90
                        ${isBlack ? "piano-key-black" : "piano-key-white"}
                        ${isC ? "octave-key font-bold border-t border-[var(--border-color)]" : ""}
                        ${isInScale ? "shadow-[inset_0_0_0_999px_rgba(71,102,126,0.08)]" : ""}`}
                        style={{
                          top: `${i * rowHeight}px`,
                          height: `${rowHeight}px`,
                        }}
                      >
                        {readout?.midi === midi ? Note.fromMidi(midi) : isC ? `C${Math.floor(midi / 12) - 1}` : !isBlack ? (Note.fromMidi(midi)?.replace(/-?\d+$/, "") ?? "") : ""}
                      </div>
                    );
                  })}
                </div>

                {/* Main Grid Area */}
                <div
                  ref={gridRef}
                  data-testid="piano-grid"
                  data-tool={toolMode}
                  className="piano-grid relative flex-1"
                  style={{
                    minWidth: `${contentWidth}px`,
                    height: `${(MIDI_RANGE * rowHeight)}px`,
                    touchAction: "none",
                    cursor: toolMode === "pan" ? "grab" : toolMode === "select" ? "default" : "crosshair",
                    "--snap-width": snapResolution > 0 && snapResolution < 1 && snapResolution * zoomX >= 6
                      ? snapResolution * zoomX + "px" : "0px",
                  } as CSSProperties}
                  onPointerMove={handleGridHover}
                  onPointerLeave={() => setHover(null)}
                  onPointerDown={handleGridPointerDown}
                >
                  {/* Row Background Tracks (black-key shading + diatonic scale tint) */}
                  {Array.from({ length: MIDI_RANGE }).map((_, i) => {
                    const midi = MAX_MIDI - i;
                    const noteClass = midi % 12;
                    const isBlackRow = BLACK_KEY_CLASSES.includes(noteClass);
                    const isInScale = scaleChromas.has(noteClass);
                    if (!isBlackRow && !isInScale) return null;
                    return (
                      <div
                        key={`h-${i}`}
                        className="absolute left-0 right-0 z-0 pointer-events-none"
                        style={{
                          top: `${i * rowHeight}px`,
                          height: `${rowHeight}px`,
                        }}
                      >
                        {isInScale && (
                          <div className="absolute inset-0 bg-[var(--accent)]/[0.06]" />
                        )}
                        {isBlackRow && (
                          <div className="absolute inset-0 bg-black/[0.065]" />
                        )}
                      </div>
                    );
                  })}

                  {/* Playhead */}
                  {progression && (
                    <div
                      className="absolute top-0 bottom-0 w-0 border-l-[2px] border-[#344b5d] z-30 pointer-events-none"
                      style={{ left: `${currentTick * zoomX}px` }}
                    />
                  )}

                  {ghosts.map((ghost, index) => (
                    <div key={index} className="placement-ghost absolute z-20 pointer-events-none"
                      data-testid="placement-ghost" data-active={!!gesture} aria-hidden="true"
                      style={{ left: ghost.timeStart * zoomX, top: (MAX_MIDI - ghost.midi) * rowHeight,
                        width: Math.max(6, ghost.duration * zoomX), height: rowHeight }} />
                  ))}

                  {gesture?.kind === "lasso" && crossedThreshold(gesture) && (
                    <div className="absolute border border-[#47667e] bg-[#47667e]/20 z-50 pointer-events-none"
                      style={{
                        left: Math.min(gesture.origin.x, gesture.point.x), top: Math.min(gesture.origin.y, gesture.point.y),
                        width: Math.abs(gesture.point.x - gesture.origin.x), height: Math.abs(gesture.point.y - gesture.origin.y),
                      }} />
                  )}

                  {gesture?.kind === "slice" && (
                    <svg className="absolute inset-0 w-full h-full pointer-events-none z-50">
                      <line x1={gesture.origin.x} y1={gesture.origin.y} x2={gesture.point.x} y2={gesture.point.y}
                        stroke="#914c4c" strokeWidth="2" strokeDasharray="4 2" />
                    </svg>
                  )}

                  {/* Notes */}
                  {progression.notes.map((n, i) => {
                    if (focusedTrack !== null && trackIndexOf(n) !== focusedTrack) {
                      return null;
                    }
                    const rendered = changes.get(i) ?? n;
                    const { timeStart: renderTick, midi: renderMidi, duration: renderDuration } = rendered;
                    const isEditing = changes.has(i);
                    const isPlayingNote = isPlaying && currentTick >= renderTick && currentTick < renderTick + renderDuration;
                    const isSelected = liveSelection.has(i);
                    const boxWidth = Math.max(6, renderDuration * zoomX);
                    const handleWidth = Math.min(10, boxWidth / 3);
                    const pitchLabel = Note.fromMidi(renderMidi) ?? n.name;
                    const showLabel = boxWidth >= pitchLabel.length * 6 + 14;

                    return (
                      <div
                        key={i}
                        data-testid="piano-note"
                        data-note-index={i}
                        data-midi={renderMidi}
                        data-start={renderTick}
                        data-duration={renderDuration}
                        data-playing={isPlayingNote}
                        data-editing={isEditing}
                        data-track={trackIndexOf(n)}
                        data-selected={isSelected}
                        role="button"
                        tabIndex={tabStopIndex === i ? 0 : -1}
                        aria-pressed={isSelected}
                        aria-describedby="piano-note-keyboard-help"
                        aria-label={(trackNameByIndex.get(trackIndexOf(n)) ?? "Track " + (trackIndexOf(n) + 1)) +
                          ", " + (Note.fromMidi(n.midi) ?? n.name) + ", bar " + (Math.floor(n.timeStart / 4) + 1) +
                          ", beat " + ((n.timeStart % 4) + 1).toFixed(2) +
                          ", duration " + n.duration + " quarter notes, velocity " + Math.round(n.velocity * 100) + " percent"}
                        onFocus={() => setKeyboardNoteIndex(i)}
                        onKeyDown={event => handleNoteKeyDown(event, i)}
                        onPointerDown={(e) => {
                          if (e.pointerType === "mouse" && e.button === 2 && !e.altKey &&
                            activePointer.current === null && toolMode !== "pan") {
                            e.preventDefault();
                            e.stopPropagation();
                            handleNoteDelete(n, i);
                          }
                        }}
                        onPointerEnter={(e) => {
                          if (e.pointerType === "mouse" && e.buttons === 2 && !e.altKey &&
                            activePointer.current === null && toolMode !== "pan") {
                            e.preventDefault();
                            e.stopPropagation();
                            handleNoteDelete(n, i);
                          }
                        }}
                        className={`roll-note absolute z-10 group transition-none ${toolMode === "stamp" ? "pointer-events-none" : ""}`}
                        style={{
                          left: `${renderTick * zoomX}px`,
                          width: `${boxWidth}px`,
                          top: `${(MAX_MIDI - renderMidi) * rowHeight}px`,
                          height: `${rowHeight}px`,
                          opacity: isPlayingNote || isSelected || isEditing ? 1 : Math.max(0.8, n.velocity),
                        }}
                      >
                        {/* Visual Box */}
                        <div
                          className={`piano-note absolute inset-[1px] rounded-[3px] border transition-colors duration-100 overflow-hidden
                            ${
                              isPlayingNote
                                ? `${ACTIVE_NOTE_COLORS} z-30`
                                : isSelected
                                  ? `piano-note-selected ${SELECTED_NOTE_COLORS} z-20`
                                  : `${getTrackColorClasses(hasTrackColors ? trackIndexOf(n) : 0)} group-hover:brightness-110`
                            }
                          `}
                        >
                          {showLabel && (
                            <span className="piano-note-label pointer-events-none absolute left-1 top-1/2 -translate-y-1/2 select-none font-mono text-[10px] font-semibold">
                              {pitchLabel}
                            </span>
                          )}
                        </div>

                        {/* Hit Areas */}
                        <div className="absolute inset-0 z-30" style={{ touchAction: "none" }}>
                          <div
                            data-testid="note-move"
                            onPointerDown={(e) => handleNoteDown(e, i, "move")}
                            className="absolute left-0 inset-y-0 cursor-move"
                            style={{ right: handleWidth }}
                          />
                          <div
                            data-testid="note-resize"
                            onPointerDown={(e) => handleNoteDown(e, i, "resize")}
                            className="note-resize-hit absolute right-0 inset-y-0 cursor-ew-resize flex items-center justify-center"
                            style={{ width: handleWidth }}
                          >
                            <div className="w-[4px] h-[60%] bg-white/80 rounded-[1px] shadow-sm pointer-events-none" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Velocity Lane */}
              <div className="flex sticky bottom-0 z-40">
                <div
                  className="sticky left-0 z-40 bg-[var(--app-bg)] border-t border-r border-[var(--border-strong)] flex-shrink-0 flex items-center justify-center"
                  style={{
                    width: `${KEYBOARD_WIDTH}px`,
                    height: `${VELOCITY_LANE_HEIGHT}px`,
                  }}
                >
                  <span className="velocity-label">
                    Vel
                  </span>
                </div>
                <div
                  className="velocity-grid relative bg-[var(--piano-black)] border-t border-[var(--border-color)] flex-1"
                  style={{
                    minWidth: `${contentWidth}px`,
                    height: `${VELOCITY_LANE_HEIGHT}px`,
                  }}
                >
                  {progression.notes.map((n, i) => {
                    if (focusedTrack !== null && trackIndexOf(n) !== focusedTrack) {
                      return null;
                    }
                    const stem = velocityLayout.get(i);
                    if (!stem) return null;
                    const renderVelocity = changes.get(i)?.velocity ?? n.velocity;
                    const isVelocityDragging = gesture?.kind === "velocity" && changes.has(i);
                    const isSelected = liveSelection.has(i);
                    const barHeight = Math.max(3, renderVelocity * (VELOCITY_LANE_HEIGHT - 12));

                    return (
                      <button
                        type="button"
                        key={`vel-${i}`}
                        tabIndex={tabStopIndex === i ? 0 : -1}
                        aria-label={"Velocity " + Math.round(n.velocity * 100) + " percent, " +
                          (Note.fromMidi(n.midi) ?? n.name) + ", note " + (i + 1)}
                        aria-pressed={isSelected}
                        onKeyDown={event => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onSelectionChange(new Set([i]));
                          }
                        }}
                        onPointerDown={(e) => handleNoteDown(e, i, "velocity")}
                        className="velocity-hit-target absolute inset-y-0 cursor-ns-resize group"
                        style={{
                          left: stem.left + ((changes.get(i)?.timeStart ?? n.timeStart) - n.timeStart) * zoomX,
                          width: stem.width,
                          touchAction: "none",
                        }}
                      >
                        <div
                          className={`absolute inset-x-[1px] bottom-0 rounded-t-[2px] border-t shadow-sm transition-colors
                            ${
                              isVelocityDragging
                                ? ACTIVE_NOTE_COLORS
                                : isSelected
                                  ? SELECTED_NOTE_COLORS
                                  : `${getTrackColorClasses(hasTrackColors ? trackIndexOf(n) : 0)} group-hover:brightness-110`
                            }
                          `}
                          style={{ height: `${barHeight}px` }}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
        <footer className="editor-footnote">
          {readoutText ? <span className="edit-readout">{readoutText}</span>
            : <span className="editor-active-tool" role="status" aria-live="polite">{TOOL_HINTS[toolMode]}</span>}
          <span>{liveSelection.size
            ? <strong>{liveSelection.size} of {keyboardNoteOrder.length} selected</strong>
            : progression ? keyboardNoteOrder.length + (keyboardNoteOrder.length === 1 ? " note" : " notes") + " · " + statusLabel
            : "No notes yet"}</span>
        </footer>
    </section>
  );
}
