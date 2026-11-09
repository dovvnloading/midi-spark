import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Note } from "@tonaljs/tonal";
import { Sparkles, Pencil, LockKeyhole, LockOpen } from "lucide-react";
import { ensureBarsCoverNotes } from "../lib/transforms";
import { ProgressionData, NoteEvent, getScaleChromas } from "../lib/theory";
import { initAudio, playNote } from "../lib/audio";
import { trackIndexOf, listTracks } from "../lib/tracks";
import { normalizeLoopRange, sequenceEndQuarters, type LoopRange } from "../lib/timeline";
import {
  CHORD_STAMPS,
  FREE_SNAP,
  KEYBOARD_WIDTH,
  MAX_MIDI,
  MAX_VELOCITY,
  MAX_ZOOM,
  MIDI_RANGE,
  MIN_VELOCITY,
  MIN_ZOOM,
  NOTE_HEIGHT,
  SCALE_STAMPS,
  VELOCITY_LANE_HEIGHT,
  clamp,
  getTrackColorClasses,
} from "../lib/constants";
import { ToolMode } from "./EditToolbar";
import { NotePrecisionEditor } from "./NotePrecisionEditor";
import { editNoteField, type NoteField } from "../lib/noteEditing";

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
}

interface LoopDrag {
  mode: "in" | "out" | "new";
  origin: number;
  range: LoopRange;
}

interface DragState {
  notes: {
    index: number;
    startTick: number;
    startMidi: number;
    startDuration: number;
  }[];
  startX: number;
  startY: number;
  tickDelta: number;
  midiDelta: number;
}

interface DragDrawState {
  startX: number;
  currentX: number;
  startTick: number;
  startMidi: number;
  startDuration: number;
  trackIndex?: number;
}

interface DragResizeState {
  notes: { index: number; startDuration: number }[];
  startX: number;
  durationDelta: number;
}

interface DragVelocityState {
  notes: { index: number; startVelocity: number }[];
  startY: number;
  velocityDelta: number;
}

interface BoxState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

const BLACK_KEY_CLASSES = [1, 3, 6, 8, 10];
const TOOL_HINTS: Record<ToolMode, string> = {
  draw: "Draw · Tap grid to add; drag for length",
  select: "Select · Tap a note; drag to move or lasso",
  stamp: "Stamp · Tap grid to place chord/scale",
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
}: PianoRollProps) {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragDrawState, setDragDrawState] = useState<DragDrawState | null>(null);
  const [dragResizeState, setDragResizeState] = useState<DragResizeState | null>(null);
  const [dragVelocityState, setDragVelocityState] = useState<DragVelocityState | null>(null);
  const [lassoState, setLassoState] = useState<BoxState | null>(null);
  const [sliceState, setSliceState] = useState<BoxState | null>(null);
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
  const beginGesture = (event: React.PointerEvent) => {
    event.preventDefault();
    activePointer.current = event.pointerId;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    scrollRef.current?.focus({ preventScroll: true });
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
  useEffect(() => {
    if (!progression || !scrollRef.current) return;
    const avgMidi = progression.notes.length
      ? progression.notes.reduce((sum, n) => sum + n.midi, 0) /
        progression.notes.length
      : 64;
    scrollRef.current.scrollTop = Math.max(
      0,
      (MAX_MIDI - avgMidi) * rowHeight - scrollRef.current.clientHeight / 2,
    );
    scrollRef.current.scrollLeft = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recenter only on new sequences
  }, [scrollAnchorKey]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !progression) return;
    const end = Math.max(progression.totalBars * 4, ...progression.notes.map(n => n.timeStart + n.duration), 4);
    onZoomChange(clamp((el.clientWidth - KEYBOARD_WIDTH - 30) / end, MIN_ZOOM, MAX_ZOOM));
    const visibleNotes = progression.notes.filter(n => focusedTrack === null || trackIndexOf(n) === focusedTrack);
    const center = visibleNotes.length ? (Math.min(...visibleNotes.map(n => n.midi)) + Math.max(...visibleNotes.map(n => n.midi))) / 2 : 60;
    const pitchSpan = visibleNotes.length ? Math.max(...visibleNotes.map(n => n.midi)) - Math.min(...visibleNotes.map(n => n.midi)) + 7 : 28;
    const usableHeight = el.clientHeight - VELOCITY_LANE_HEIGHT - 64;
    const fittedHeight = Math.round(clamp(usableHeight / pitchSpan, 10, 24));
    setRowHeight(fittedHeight);
    el.scrollLeft = 0;
    const frame = requestAnimationFrame(() => {
      el.scrollTop = Math.max(0, (MAX_MIDI - center + 0.5) * fittedHeight - usableHeight / 2);
    });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Fit is an explicit action, not a reaction to every edited note.
  }, [fitRequest]);

  // Separate stems that share a quantized onset so chord velocities remain individually reachable.
  const velocityOffsets = useMemo(() => {
    const counts = new Map<number, number>();
    return progression?.notes.map(note => {
      const tick = Math.round(note.timeStart * 16);
      const rank = counts.get(tick) ?? 0;
      counts.set(tick, rank + 1);
      return rank * 17;
    }) ?? [];
  }, [progression]);

  // Follow the playhead.
  useEffect(() => {
    if (isPlaying && followPlayback && !isScrubbingRef.current && !loopDragRef.current && scrollRef.current) {
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
      if (e.ctrlKey || e.metaKey) {
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

  // Report the in-progress edit so audio can preview it live.
  useEffect(() => {
    if (!progression) {
      onLivePreview(null);
      return;
    }
    let preview: ProgressionData | null = null;

    if (dragState) {
      const newNotes = [...progression.notes];
      dragState.notes.forEach((dn) => {
        const newTick = Math.max(0, dn.startTick + dragState.tickDelta);
        const newMidi = clamp(dn.startMidi + dragState.midiDelta, 0, MAX_MIDI);
        newNotes[dn.index] = {
          ...newNotes[dn.index],
          timeStart: newTick,
          midi: newMidi,
          name: Note.fromMidi(newMidi) || newNotes[dn.index].name,
        };
      });
      preview = { ...progression, notes: newNotes };
    } else if (dragResizeState) {
      const newNotes = [...progression.notes];
      dragResizeState.notes.forEach((dn) => {
        newNotes[dn.index] = {
          ...newNotes[dn.index],
          duration: Math.max(
            snapTick,
            dn.startDuration + dragResizeState.durationDelta,
          ),
        };
      });
      preview = { ...progression, notes: newNotes };
    } else if (dragDrawState) {
      preview = {
        ...progression,
        notes: [...progression.notes, drawnNote(dragDrawState, snapTick, zoomX)],
      };
    } else if (dragVelocityState) {
      const newNotes = [...progression.notes];
      dragVelocityState.notes.forEach((dn) => {
        newNotes[dn.index] = {
          ...newNotes[dn.index],
          velocity: clamp(
            dn.startVelocity + dragVelocityState.velocityDelta,
            MIN_VELOCITY,
            MAX_VELOCITY,
          ),
        };
      });
      preview = { ...progression, notes: newNotes };
    }

    onLivePreview(preview);
  }, [
    dragState,
    dragResizeState,
    dragDrawState,
    dragVelocityState,
    progression,
    snapTick,
    zoomX,
    onLivePreview,
  ]);

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
    beginGesture(e);
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
    beginGesture(e);
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

  const handleGridPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.button !== 0 && e.button !== 1) || !e.isPrimary) return;
    if (!progression) return;
    beginGesture(e);
    if ((toolMode === "pan" || e.button === 1) && scrollRef.current) {
      panRef.current = { x: e.clientX, y: e.clientY, left: scrollRef.current.scrollLeft, top: scrollRef.current.scrollTop };
      return;
    }

    if (!e.shiftKey && toolMode !== "select") {
      onSelectionChange(new Set());
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const tick =
      snapResolution > 0
        ? Math.round(x / (zoomX * snapTick)) * snapTick
        : x / zoomX;
    const midi = clamp(MAX_MIDI - Math.floor(y / rowHeight), 0, MAX_MIDI);

    if (toolMode === "select") {
      setLassoState({ startX: x, startY: y, currentX: x, currentY: y });
      if (!e.shiftKey) onSelectionChange(new Set());
      return;
    }

    if (toolMode === "cut") {
      setSliceState({ startX: x, startY: y, currentX: x, currentY: y });
      return;
    }

    if (toolMode === "stamp") {
      const isScale = !!SCALE_STAMPS[stampType];
      const intervals = CHORD_STAMPS[stampType] || SCALE_STAMPS[stampType];
      if (!intervals) return;
      const newNotes = intervals
        .map((interval) => midi + interval)
        .filter((m) => m <= MAX_MIDI)
        .map((chordMidi) => {
          const name = Note.fromMidi(chordMidi) || "C4";
          return {
            midi: chordMidi,
            name,
            timeStart: tick,
            duration: isScale ? FREE_SNAP : noteLength, // scales place tiny guides
            velocity: isScale ? 0.1 : 0.8, // low velocity so guides render faint
            trackIndex: drawTrackIndex,
          };
        });
      commit((prev) => prev ? ensureBarsCoverNotes({ ...prev, notes: [...prev.notes, ...newNotes] }) : prev);
      if (!isScale) void initAudio().then(() => newNotes.forEach(n => playNote(n.name, 0.5, n.velocity, drawTrackIndex)))
        .catch(() => onAudioPreviewError?.("Audio preview could not start. Notes are still editable; use Play to retry after enabling audio."));
      return;
    }

    // Default: draw a single note.
    const name = Note.fromMidi(midi) || "C4";
    void initAudio().then(() => playNote(name, 0.25, 0.8, drawTrackIndex))
      .catch(() => onAudioPreviewError?.("Audio preview could not start. Notes are still editable; use Play to retry after enabling audio."));
    setDragDrawState({
      startTick: tick,
      startMidi: midi,
      startX: e.clientX,
      currentX: e.clientX,
      startDuration: noteLength,
      trackIndex: drawTrackIndex,
    });
  };

  const handleNotePointerDown = (e: React.PointerEvent, index: number) => {
    if (toolMode === "cut" || toolMode === "pan" || e.button === 1) return;
    e.stopPropagation();
    if (e.button !== 0) return;
    if (!progression) return;
    beginGesture(e);

    let targets: number[] = [index];
    if (selectedIndices.has(index)) {
      targets = Array.from(selectedIndices);
    } else if (e.shiftKey) {
      const newSel = new Set(selectedIndices);
      newSel.add(index);
      onSelectionChange(newSel);
      targets = Array.from(newSel);
    } else {
      onSelectionChange(new Set([index]));
    }

    setDragState({
      notes: targets.map((idx) => ({
        index: idx,
        startTick: progression.notes[idx].timeStart,
        startMidi: progression.notes[idx].midi,
        startDuration: progression.notes[idx].duration,
      })),
      startX: e.clientX,
      startY: e.clientY,
      tickDelta: 0,
      midiDelta: 0,
    });
  };

  const handleNoteResizePointerDown = (e: React.PointerEvent, index: number) => {
    if (toolMode === "cut" || toolMode === "pan" || e.button === 1) return;
    e.stopPropagation();
    if (e.button !== 0) return;
    if (!progression) return;
    beginGesture(e);

    let targets: number[] = [index];
    if (selectedIndices.has(index)) {
      targets = Array.from(selectedIndices);
    } else {
      onSelectionChange(new Set([index]));
    }

    setDragResizeState({
      notes: targets.map((idx) => ({
        index: idx,
        startDuration: progression.notes[idx].duration,
      })),
      startX: e.clientX,
      durationDelta: 0,
    });
  };

  const handleVelocityBarPointerDown = (e: React.PointerEvent, index: number) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    if (!progression) return;
    beginGesture(e);

    let targets: number[] = [index];
    if (selectedIndices.has(index)) {
      targets = Array.from(selectedIndices);
    } else if (e.shiftKey) {
      const newSel = new Set(selectedIndices);
      newSel.add(index);
      onSelectionChange(newSel);
      targets = Array.from(newSel);
    } else {
      onSelectionChange(new Set([index]));
    }

    setDragVelocityState({
      notes: targets.map((idx) => ({
        index: idx,
        startVelocity: progression.notes[idx].velocity,
      })),
      startY: e.clientY,
      velocityDelta: 0,
    });
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

  const handleNoteKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, index: number) => {
    if (!progression || event.ctrlKey || event.metaKey) return;
    const note = progression.notes[index];
    if (!note) return;
    const arrow = ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"].includes(event.key);
    if (arrow && event.altKey || event.key === "[" || event.key === "]") {
      event.preventDefault();
      event.stopPropagation();
      let field: NoteField;
      let value: number;
      if (event.key === "[" || event.key === "]") {
        field = "duration"; value = note.duration + (event.key === "]" ? snapTick : -snapTick);
      } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        field = "midi"; value = note.midi + (event.key === "ArrowUp" ? 1 : -1);
      } else {
        field = "timeStart"; value = note.timeStart + (event.key === "ArrowRight" ? snapTick : -snapTick);
      }
      commit(prev => prev ? editNoteField(prev, [index], field, value) : prev);
      onSelectionChange(new Set([index]));
      return;
    }
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

  // ----- Window-level drag handling -----
  // The handlers live in a ref so the single mount-time listener always sees
  // fresh state (no stale-closure bugs, no listener churn per drag frame).
  const dragHandlersRef = useRef({
    onMove: (_e: PointerEvent) => {},
    onUp: (_e: PointerEvent) => {},
  });

  const onDragMove = (e: PointerEvent) => {
    if (e.pointerId !== activePointer.current) return;
    if (loopDragRef.current) {
      const drag = loopDragRef.current;
      const tick = snappedLoopTick(e.clientX);
      let next: LoopRange;
      if (drag.mode === "in") {
        next = { start: Math.min(tick, drag.range.end - 1), end: drag.range.end };
      } else if (drag.mode === "out") {
        next = { start: drag.range.start, end: Math.max(tick, drag.range.start + 1) };
      } else if (tick >= drag.origin) {
        next = { start: drag.origin, end: Math.max(drag.origin + 1, tick) };
      } else {
        next = { start: Math.min(tick, drag.origin - 1), end: drag.origin };
      }
      drag.range = normalizeLoopRange(next, sequenceEnd);
      setLoopPreview(drag.range);
      return;
    }
    if (panRef.current && scrollRef.current) {
      scrollRef.current.scrollLeft = panRef.current.left - (e.clientX - panRef.current.x);
      scrollRef.current.scrollTop = panRef.current.top - (e.clientY - panRef.current.y);
      return;
    }
    if (dragState) {
      const dx = e.clientX - dragState.startX;
      const dy = e.clientY - dragState.startY;
      const tickDelta = Math.round(dx / (zoomX * snapTick)) * snapTick;
      const midiDelta = -Math.round(dy / rowHeight);
      setDragState((prev) => (prev ? { ...prev, tickDelta, midiDelta } : null));
    } else if (dragResizeState) {
      const dx = e.clientX - dragResizeState.startX;
      const durationDelta = Math.round(dx / (zoomX * snapTick)) * snapTick;
      setDragResizeState((prev) => (prev ? { ...prev, durationDelta } : null));
    } else if (dragDrawState) {
      setDragDrawState((prev) =>
        prev ? { ...prev, currentX: e.clientX } : null,
      );
    } else if (dragVelocityState) {
      const dy = dragVelocityState.startY - e.clientY;
      const velocityDelta = dy / VELOCITY_LANE_HEIGHT;
      setDragVelocityState((prev) => (prev ? { ...prev, velocityDelta } : null));
    } else if (sliceState || lassoState) {
      const gridRect = gridRef.current?.getBoundingClientRect();
      if (!gridRect) return;
      const x = e.clientX - gridRect.left;
      const y = e.clientY - gridRect.top;
      if (sliceState) {
        setSliceState((prev) => (prev ? { ...prev, currentX: x, currentY: y } : null));
      } else {
        setLassoState((prev) => (prev ? { ...prev, currentX: x, currentY: y } : null));
      }
    } else if (isScrubbingRef.current) {
      updateScrubPosition(e.clientX);
    }
  };

  const onDragUp = (e: PointerEvent) => {
    if (e.pointerId !== activePointer.current) return;
    activePointer.current = null;
    panRef.current = null;
    if (loopDragRef.current) {
      onLoopRegionChange(loopDragRef.current.range);
      loopDragRef.current = null;
      setLoopPreview(null);
      return;
    }
    if (isScrubbingRef.current) {
      isScrubbingRef.current = false;
      onScrubStateChange(false);
      updateScrubPosition(e.clientX);
    }

    if (dragState) {
      const finished = dragState;
      commit((prev) => {
        if (!prev || (finished.tickDelta === 0 && finished.midiDelta === 0)) return prev;
        const newNotes = [...prev.notes];
        finished.notes.forEach((dn) => {
          const newTick = Math.max(0, dn.startTick + finished.tickDelta);
          const newMidi = clamp(dn.startMidi + finished.midiDelta, 0, MAX_MIDI);
          newNotes[dn.index] = {
            ...newNotes[dn.index],
            timeStart: newTick,
            midi: newMidi,
            name: Note.fromMidi(newMidi) || newNotes[dn.index].name,
          };
        });
        return ensureBarsCoverNotes({ ...prev, notes: newNotes });
      });
      if (finished.tickDelta !== 0 || finished.midiDelta !== 0) {
        finished.notes.slice(0, 8).forEach((dn) => {
          const name = Note.fromMidi(
            clamp(dn.startMidi + finished.midiDelta, 0, MAX_MIDI),
          );
          if (name) playNote(name, 0.25, 0.6);
        });
      }
      setDragState(null);
    }

    if (dragResizeState) {
      const finished = dragResizeState;
      commit((prev) => {
        if (!prev || finished.durationDelta === 0) return prev;
        const newNotes = [...prev.notes];
        finished.notes.forEach((dn) => {
          newNotes[dn.index] = {
            ...newNotes[dn.index],
            duration: Math.max(snapTick, dn.startDuration + finished.durationDelta),
          };
        });
        return ensureBarsCoverNotes({ ...prev, notes: newNotes });
      });
      setDragResizeState(null);
    }

    if (dragVelocityState) {
      const finished = dragVelocityState;
      commit((prev) => {
        if (!prev || finished.velocityDelta === 0) return prev;
        const newNotes = [...prev.notes];
        finished.notes.forEach((dn) => {
          newNotes[dn.index] = {
            ...newNotes[dn.index],
            velocity: clamp(
              dn.startVelocity + finished.velocityDelta,
              MIN_VELOCITY,
              MAX_VELOCITY,
            ),
          };
        });
        return ensureBarsCoverNotes({ ...prev, notes: newNotes });
      });
      setDragVelocityState(null);
    }

    if (sliceState) {
      const finished = sliceState;
      commit((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          notes: sliceNotes(prev.notes, finished, zoomX, snapTick, focusedTrack, rowHeight),
        };
      });
      setSliceState(null);
      onSelectionChange(new Set());
    }

    if (lassoState) {
      const leftP = Math.min(lassoState.startX, lassoState.currentX);
      const rightP = Math.max(lassoState.startX, lassoState.currentX);
      const topP = Math.min(lassoState.startY, lassoState.currentY);
      const bottomP = Math.max(lassoState.startY, lassoState.currentY);

      const newSelected = new Set<number>(e.shiftKey ? selectedIndices : []);
      progression?.notes.forEach((n, i) => {
        if (focusedTrack !== null && trackIndexOf(n) !== focusedTrack) return;
        const nx = n.timeStart * zoomX;
        const ny = (MAX_MIDI - n.midi) * rowHeight;
        const nw = n.duration * zoomX;
        if (nx < rightP && nx + nw > leftP && ny < bottomP && ny + rowHeight > topP) {
          newSelected.add(i);
        }
      });
      onSelectionChange(newSelected);
      setLassoState(null);
    }

    if (dragDrawState) {
      const finished = dragDrawState;
      commit((prev) =>
        prev
          ? ensureBarsCoverNotes({ ...prev, notes: [...prev.notes, drawnNote(finished, snapTick, zoomX)] })
          : prev,
      );
      setDragDrawState(null);
    }
  };

  // Re-point the stable listeners at this render's handlers.
  useEffect(() => {
    dragHandlersRef.current.onMove = onDragMove;
    dragHandlersRef.current.onUp = onDragUp;
  });

  useEffect(() => {
    const onMove = (e: PointerEvent) => dragHandlersRef.current.onMove(e);
    const onUp = (e: PointerEvent) => dragHandlersRef.current.onUp(e);
    const cancel = () => {
      activePointer.current = null; panRef.current = null; isScrubbingRef.current = false;
      loopDragRef.current = null; setLoopPreview(null);
      setDragState(null); setDragDrawState(null); setDragResizeState(null); setDragVelocityState(null); setLassoState(null); setSliceState(null);
      onScrubStateChange(false);
      onLivePreview(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
    };
  }, [onScrubStateChange, onLivePreview]);

  // ----- Render -----
  return (
    <section aria-label="Piano roll editor" className="piano-editor">
        {progression && progression.notes.length > 0 && <NotePrecisionEditor
          progression={progression} focusedTrack={focusedTrack}
          selectedIndices={selectedIndices} onSelectionChange={onSelectionChange} commit={commit} />}
        <p id="piano-note-keyboard-help" className="sr-only">
          Use Tab to focus a note, arrows to navigate notes in the focused track, Enter or Space to select,
          Shift with arrows or Enter to extend selection, Alt with arrows to move pitch or timing,
          left and right brackets to resize, and Delete to remove. Undo and redo use Control or Command Z.
        </p>
        <div className="piano-viewport" ref={scrollRef} tabIndex={0} role="region" aria-label="Piano roll canvas"
          onContextMenu={e => e.preventDefault()}>
          {!progression ? (
            <div className="pattern-empty">
              <div className="empty-motif" aria-hidden="true"><span /><span /><span /><span /><span /></div>
              <span className="eyebrow">FROM A SPARK TO A SEQUENCE</span>
              <h2>Your next idea starts here.</h2>
              <p>Generate a progression, draw something new,<br />or drop a MIDI file to make it your own.</p>
              <div className="empty-actions">
                <button className="primary-button" onClick={onGenerate}><Sparkles size={15} />Generate pattern</button>
                <button className="secondary-button" onClick={onStartBlank}><Pencil size={14} />Start blank</button>
              </div>
              <input type="file" ref={emptyImportRef} accept=".mid,.midi" className="hidden" aria-label="Import MIDI into empty project" onChange={event => {
                const file = event.target.files?.[0]; if (file) onLoadFile(file); event.target.value = "";
              }} />
              <button className="text-button empty-hint" onClick={() => emptyImportRef.current?.click()}>Or import your own MIDI</button>
            </div>
          ) : (
            <div className="piano-content">
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
                    </div>
                  ))}
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
                        {chord.locked ? <LockKeyhole size={11} aria-hidden="true" />
                          : <LockOpen size={11} aria-hidden="true" />}
                      </button>
                      : <div key={i} className="chord-chip"
                        style={{ left: chord.timeStart * zoomX, width: chord.duration * zoomX }}>
                        <span className="chord-dot" />{chord.name}</div>)}
                    {progression.chords.length === 0 && <span className="chord-chip" style={{ left: 0 }}>MIDI pattern</span>}
                  </div>
                </div>
              </div>

              {/* Body Row */}
              <div className="flex relative">
                {/* Left Sticky Keyboard */}
                <div
                  className="sticky left-0 z-40 bg-[#26312c] border-r border-[var(--border-strong)] flex-shrink-0"
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
                        ${isBlack ? "bg-[#19211f] text-[var(--text-muted)]" : "bg-[var(--piano-white)] text-[var(--text-main)]"}
                        ${isC ? "octave-key font-bold text-[var(--accent)] border-t border-[var(--border-color)]" : ""}
                        ${isInScale ? "shadow-[inset_0_0_0_999px_rgba(94,124,246,0.08)]" : ""}`}
                        style={{
                          top: `${i * rowHeight}px`,
                          height: `${rowHeight}px`,
                        }}
                      >
                        {isC ? `C${Math.floor(midi / 12) - 1}` : !isBlack ? (Note.fromMidi(midi)?.replace(/-?\d+$/, "") ?? "") : ""}
                      </div>
                    );
                  })}
                </div>

                {/* Main Grid Area */}
                <div
                  ref={gridRef}
                  data-testid="piano-grid"
                  className="piano-grid relative flex-1"
                  style={{
                    minWidth: `${contentWidth}px`,
                    height: `${(MIDI_RANGE * rowHeight)}px`,
                    touchAction: "none",
                    cursor: toolMode === "pan" ? "grab" : toolMode === "select" ? "default" : "crosshair",
                    backgroundImage: `
                      linear-gradient(to bottom, rgba(163,185,169,0.08) 1px, transparent 1px),
                      linear-gradient(to right, var(--border-strong) 1px, transparent 1px),
                      linear-gradient(to right, rgba(163,185,169,0.05) 1px, transparent 1px)
                    `,
                    backgroundSize: `100% ${rowHeight}px, ${zoomX * 4}px 100%, ${zoomX}px 100%`,
                    backgroundPosition: "0 0, 0 0, 0 0",
                  }}
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
                          <div className="absolute inset-0 bg-black/[0.15]" />
                        )}
                      </div>
                    );
                  })}

                  {/* Playhead */}
                  {progression && (
                    <div
                      className="absolute top-0 bottom-0 w-0 border-l-[2px] border-[#dde2b0] z-30 pointer-events-none"
                      style={{ left: `${currentTick * zoomX}px` }}
                    >
                      <div className="absolute top-0 left-[-6px] w-[13px] h-[13px] bg-[#dde2b0] rounded-b-sm"></div>
                    </div>
                  )}

                  {/* Drag Drawing Note Ghost Box */}
                  {dragDrawState && (
                    <div
                      className="absolute z-20 pointer-events-none"
                      style={{
                        left: `${dragDrawState.startTick * zoomX}px`,
                        top: `${(MAX_MIDI - dragDrawState.startMidi) * rowHeight}px`,
                        width: `${drawnNote(dragDrawState, snapTick, zoomX).duration * zoomX}px`,
                        height: `${rowHeight}px`,
                      }}
                    >
                      <div className="absolute inset-[1px] bg-emerald-400/80 border border-emerald-300 shadow-sm rounded-[3px]" />
                    </div>
                  )}

                  {/* Lasso Box */}
                  {lassoState && (
                    <div
                      className="absolute border border-blue-500 bg-blue-500/20 z-50 pointer-events-none transition-none"
                      style={{
                        left: Math.min(lassoState.startX, lassoState.currentX),
                        top: Math.min(lassoState.startY, lassoState.currentY),
                        width: Math.abs(lassoState.currentX - lassoState.startX),
                        height: Math.abs(lassoState.currentY - lassoState.startY),
                      }}
                    />
                  )}

                  {/* Slice Line */}
                  {sliceState && (
                    <svg className="absolute inset-0 w-full h-full pointer-events-none z-50">
                      <line
                        x1={sliceState.startX}
                        y1={sliceState.startY}
                        x2={sliceState.currentX}
                        y2={sliceState.currentY}
                        stroke="#ef4444"
                        strokeWidth="2"
                        strokeDasharray="4 2"
                      />
                    </svg>
                  )}

                  {/* Notes */}
                  {progression.notes.map((n, i) => {
                    if (focusedTrack !== null && trackIndexOf(n) !== focusedTrack) {
                      return null;
                    }
                    const isDragging =
                      dragState && dragState.notes.some((dn) => dn.index === i);
                    const isResizing =
                      dragResizeState &&
                      dragResizeState.notes.some((dn) => dn.index === i);

                    let renderTick = n.timeStart;
                    let renderMidi = n.midi;
                    let renderDuration = n.duration;

                    if (isDragging && dragState) {
                      renderTick = Math.max(0, n.timeStart + dragState.tickDelta);
                      renderMidi = clamp(n.midi + dragState.midiDelta, 0, MAX_MIDI);
                    } else if (isResizing && dragResizeState) {
                      renderDuration = Math.max(
                        snapTick,
                        n.duration + dragResizeState.durationDelta,
                      );
                    }

                    const isPlayingNote =
                      isPlaying &&
                      currentTick >= renderTick &&
                      currentTick <= renderTick + renderDuration;
                    const isSelected = selectedIndices.has(i);
                    const boxWidth = Math.max(6, renderDuration * zoomX);
                    const showLabel = boxWidth >= 34 && !isPlayingNote;

                    return (
                      <div
                        key={i}
                        data-testid="piano-note"
                        data-note-index={i}
                        data-midi={n.midi}
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
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleNoteDelete(n, i);
                        }}
                        onMouseEnter={(e) => {
                          if (e.buttons === 2) {
                            e.preventDefault();
                            e.stopPropagation();
                            handleNoteDelete(n, i);
                          }
                        }}
                        className={`absolute z-10 group transition-none ${isDragging ? "opacity-80" : "opacity-100"}`}
                        style={{
                          left: `${renderTick * zoomX}px`,
                          width: `${boxWidth}px`,
                          top: `${(MAX_MIDI - renderMidi) * rowHeight}px`,
                          height: `${rowHeight}px`,
                          opacity: isPlayingNote ? 1 : Math.max(0.65, n.velocity),
                        }}
                      >
                        {/* Visual Box */}
                        <div
                          className={`piano-note absolute inset-[1px] rounded-[3px] border transition-colors duration-100 overflow-hidden
                            ${
                              isPlayingNote
                                ? "bg-[#d3e8a0] border-[#f0f7d4] z-30"
                                : isSelected
                                  ? "piano-note-selected bg-[#8d8eb9] border-[#c1c2e2] z-20"
                                  : hasTrackColors && n.trackIndex !== undefined
                                    ? `${getTrackColorClasses(n.trackIndex)} group-hover:brightness-110`
                                    : "bg-[#9bc496] border-[#bdd8ac] group-hover:brightness-110"
                            }
                          `}
                        >
                          {showLabel && (
                            <span className={
                              "piano-note-label pointer-events-none absolute left-1 top-1/2 -translate-y-1/2 select-none font-mono text-[10px] font-semibold " +
                              (isSelected ? "text-white" : "text-[#172237]")
                            }>
                              {Note.fromMidi(renderMidi) || ""}
                            </span>
                          )}
                        </div>

                        {/* Hit Areas */}
                        <div className="absolute inset-0 z-30" style={{ touchAction: "none" }}>
                          <div
                            data-testid="note-move"
                            onPointerDown={(e) => handleNotePointerDown(e, i)}
                            className="absolute left-0 top-0 bottom-0 right-[8px] sm:right-[10px] cursor-move"
                            style={{ minWidth: "4px" }}
                          />
                          <div
                            data-testid="note-resize"
                            onPointerDown={(e) => handleNoteResizePointerDown(e, i)}
                            className="absolute right-[-6px] w-[14px] sm:w-[16px] top-0 bottom-0 cursor-ew-resize flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
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
                  className="sticky left-0 z-40 bg-[#26312c] border-t border-r border-[var(--border-strong)] flex-shrink-0 flex items-center justify-center"
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
                  className="relative bg-[var(--piano-black)] border-t border-[var(--border-color)] flex-1"
                  style={{
                    minWidth: `${contentWidth}px`,
                    height: `${VELOCITY_LANE_HEIGHT}px`,
                  }}
                >
                  {progression.notes.map((n, i) => {
                    if (focusedTrack !== null && trackIndexOf(n) !== focusedTrack) {
                      return null;
                    }
                    const isVelocityDragging =
                      dragVelocityState &&
                      dragVelocityState.notes.some((dn) => dn.index === i);

                    let renderVelocity = n.velocity;
                    if (isVelocityDragging && dragVelocityState) {
                      const dn = dragVelocityState.notes.find(
                        (d) => d.index === i,
                      );
                      if (dn) {
                        renderVelocity = clamp(
                          dn.startVelocity + dragVelocityState.velocityDelta,
                          MIN_VELOCITY,
                          MAX_VELOCITY,
                        );
                      }
                    }

                    const isSelected = selectedIndices.has(i);
                    const barWidth = 18;
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
                        onPointerDown={(e) => handleVelocityBarPointerDown(e, i)}
                        className="velocity-hit-target absolute inset-y-0 cursor-ns-resize group"
                        style={{
                          left: `${n.timeStart * zoomX + velocityOffsets[i]}px`,
                          width: `${barWidth}px`,
                          touchAction: "none",
                        }}
                      >
                        <div
                          className={`absolute inset-x-[1px] bottom-0 rounded-t-[2px] border-t shadow-sm transition-colors
                            ${
                              isVelocityDragging
                                ? "bg-emerald-400 border-emerald-300"
                                : isSelected
                                  ? "bg-violet-500 border-violet-400"
                                  : hasTrackColors && n.trackIndex !== undefined
                                    ? `${getTrackColorClasses(n.trackIndex)} group-hover:brightness-110`
                                    : "bg-[#9bc496] border-[#bdd8ac] group-hover:brightness-110"
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
        <footer className="editor-footnote"><span className="editor-active-tool" role="status" aria-live="polite">{TOOL_HINTS[toolMode]}</span><span>{selectedIndices.size > 0 ? <strong>{selectedIndices.size} selected</strong> : progression ? progression.notes.length + " notes" : "No notes yet"} · {statusLabel}</span></footer>
    </section>
  );
}

/** Resolve the note produced by a draw-drag (click = default length, drag = snapped width). */
function drawnNote(
  draw: DragDrawState,
  snapTick: number,
  zoomX: number,
): NoteEvent {
  const dx = Math.max(0, draw.currentX - draw.startX);
  let duration = draw.startDuration;
  if (Math.abs(dx) > 5) {
    duration = Math.max(snapTick, Math.round(dx / (zoomX * snapTick)) * snapTick);
  }
  return {
    midi: draw.startMidi,
    name: Note.fromMidi(draw.startMidi) || "C4",
    timeStart: draw.startTick,
    duration,
    velocity: 0.8,
    trackIndex: draw.trackIndex,
  };
}

/** Split every note intersected by the slice line into two pieces. */
function sliceNotes(
  notes: NoteEvent[],
  slice: BoxState,
  zoomX: number,
  snapTick: number,
  focusedTrack: number | null = null,
  rowHeight: number = NOTE_HEIGHT,
): NoteEvent[] {
  const minLineX = Math.min(slice.startX, slice.currentX);
  const maxLineX = Math.max(slice.startX, slice.currentX);
  const minLineY = Math.min(slice.startY, slice.currentY);
  const maxLineY = Math.max(slice.startY, slice.currentY);

  const result: NoteEvent[] = [];
  for (const n of notes) {
    if (focusedTrack !== null && trackIndexOf(n) !== focusedTrack) {
      result.push(n);
      continue;
    }
    const nx = n.timeStart * zoomX;
    const ny = (MAX_MIDI - n.midi) * rowHeight;
    const nw = n.duration * zoomX;
    const nh = rowHeight;

    const isVerticalCut = Math.abs(maxLineX - minLineX) < 10;
    // Interpolate the line's x at this note's row for diagonal cuts.
    const intersectX = isVerticalCut
      ? slice.startX
      : slice.startX +
        ((slice.currentX - slice.startX) * (ny + nh / 2 - minLineY)) /
          (maxLineY - minLineY + 0.001);

    const horizontallyOverlap = intersectX >= nx && intersectX <= nx + nw;
    const verticallyOverlap = maxLineY >= ny && minLineY <= ny + nh;

    if (horizontallyOverlap && verticallyOverlap) {
      const intersectTickRaw = Math.max(0, intersectX / zoomX);
      const roundedSplit =
        Math.round((intersectTickRaw - n.timeStart) / snapTick) * snapTick;

      const p1Dur = Math.max(FREE_SNAP, roundedSplit);
      const p2Dur = Math.max(FREE_SNAP, n.duration - p1Dur);

      if (p1Dur > 0 && p2Dur > 0 && p1Dur < n.duration - 0.001) {
        result.push({ ...n, duration: p1Dur });
        result.push({ ...n, timeStart: n.timeStart + p1Dur, duration: p2Dur });
      } else {
        result.push(n);
      }
    } else {
      result.push(n);
    }
  }
  return result;
}
