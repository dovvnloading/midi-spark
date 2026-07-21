import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Note } from "@tonaljs/tonal";
import { ProgressionData, NoteEvent, getScaleChromas } from "../lib/theory";
import { initAudio, playNote } from "../lib/audio";
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
  PIANO_ROLL_HEIGHT,
  SCALE_STAMPS,
  VELOCITY_LANE_HEIGHT,
  clamp,
} from "../lib/constants";
import { ToolMode } from "./EditToolbar";

export interface PianoRollProps {
  progression: ProgressionData | null;
  statusLabel: string;
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
  /** Bumped by the parent whenever a fresh sequence should re-center the view. */
  scrollAnchorKey: number;
  onSelectionChange: (indices: Set<number>) => void;
  commit: (updater: (prev: ProgressionData | null) => ProgressionData | null) => void;
  onZoomChange: (zoom: number) => void;
  onScrub: (tick: number) => void;
  onScrubStateChange: (isScrubbing: boolean) => void;
  onLivePreview: (preview: ProgressionData | null) => void;
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

export function PianoRoll({
  progression,
  statusLabel,
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
  scrollAnchorKey,
  onSelectionChange,
  commit,
  onZoomChange,
  onScrub,
  onScrubStateChange,
  onLivePreview,
}: PianoRollProps) {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragDrawState, setDragDrawState] = useState<DragDrawState | null>(null);
  const [dragResizeState, setDragResizeState] = useState<DragResizeState | null>(null);
  const [dragVelocityState, setDragVelocityState] = useState<DragVelocityState | null>(null);
  const [lassoState, setLassoState] = useState<BoxState | null>(null);
  const [sliceState, setSliceState] = useState<BoxState | null>(null);
  const [containerWidth, setContainerWidth] = useState(1200);

  const scrollRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const isScrubbingRef = useRef(false);
  const zoomAnchorRef = useRef<{ tick: number; offsetPx: number } | null>(null);

  const snapTick = snapResolution > 0 ? snapResolution : FREE_SNAP;
  const scaleChromas = useMemo(() => getScaleChromas(root, mode), [root, mode]);

  // ----- Derived layout -----
  const maxNoteEndTick =
    progression?.notes.reduce(
      (max, n) => Math.max(max, n.timeStart + n.duration),
      0,
    ) || 0;
  const contentBars = Math.max(
    progression?.totalBars || 4,
    Math.ceil(maxNoteEndTick / 4) + 8, // 8 bars padding
  );
  const visibleBars = Math.ceil(containerWidth / (zoomX * 4));
  const totalDisplayBars = Math.max(contentBars, visibleBars + 4);
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
      (MAX_MIDI - avgMidi) * NOTE_HEIGHT - scrollRef.current.clientHeight / 2,
    );
    scrollRef.current.scrollLeft = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recenter only on new sequences
  }, [scrollAnchorKey]);

  // Follow the playhead.
  useEffect(() => {
    if (isPlaying && followPlayback && scrollRef.current) {
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

  const handleTimelineMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !progression) return;
    isScrubbingRef.current = true;
    onScrubStateChange(true);
    updateScrubPosition(e.clientX);
  };

  const handleGridMouseDown = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (!progression) return;

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
    const midi = clamp(MAX_MIDI - Math.floor(y / NOTE_HEIGHT), 0, MAX_MIDI);

    if (toolMode === "select") {
      setLassoState({ startX: x, startY: y, currentX: x, currentY: y });
      if (!e.shiftKey) onSelectionChange(new Set());
      return;
    }

    if (toolMode === "cut") {
      setSliceState({ startX: x, startY: y, currentX: x, currentY: y });
      return;
    }

    await initAudio();

    if (toolMode === "stamp") {
      const isScale = !!SCALE_STAMPS[stampType];
      const intervals = CHORD_STAMPS[stampType] || SCALE_STAMPS[stampType];
      if (!intervals) return;
      const newNotes = intervals
        .map((interval) => midi + interval)
        .filter((m) => m <= MAX_MIDI)
        .map((chordMidi) => {
          const name = Note.fromMidi(chordMidi) || "C4";
          if (!isScale) playNote(name, 0.5, 0.8);
          return {
            midi: chordMidi,
            name,
            timeStart: tick,
            duration: isScale ? FREE_SNAP : noteLength, // scales place tiny guides
            velocity: isScale ? 0.1 : 0.8, // low velocity so guides render faint
          };
        });
      commit((prev) =>
        prev ? { ...prev, notes: [...prev.notes, ...newNotes] } : prev,
      );
      return;
    }

    // Default: draw a single note.
    const name = Note.fromMidi(midi) || "C4";
    playNote(name, noteLength, 0.8);
    setDragDrawState({
      startTick: tick,
      startMidi: midi,
      startX: e.clientX,
      currentX: e.clientX,
      startDuration: noteLength,
    });
  };

  const handleNoteMouseDown = (e: React.MouseEvent, index: number) => {
    if (toolMode === "cut") return;
    e.stopPropagation();
    if (e.button !== 0) return;
    if (!progression) return;

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

  const handleNoteResizeMouseDown = (e: React.MouseEvent, index: number) => {
    if (toolMode === "cut") return;
    e.stopPropagation();
    if (e.button !== 0) return;
    if (!progression) return;

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

  const handleVelocityBarMouseDown = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    if (!progression) return;

    let targets: number[] = [index];
    if (selectedIndices.has(index)) {
      targets = Array.from(selectedIndices);
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

  // ----- Window-level drag handling -----
  // The handlers live in a ref so the single mount-time listener always sees
  // fresh state (no stale-closure bugs, no listener churn per drag frame).
  const dragHandlersRef = useRef({
    onMove: (_e: MouseEvent) => {},
    onUp: (_e: MouseEvent) => {},
  });

  const onDragMove = (e: MouseEvent) => {
    if (dragState) {
      const dx = e.clientX - dragState.startX;
      const dy = e.clientY - dragState.startY;
      const tickDelta = Math.round(dx / (zoomX * snapTick)) * snapTick;
      const midiDelta = -Math.round(dy / NOTE_HEIGHT);
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

  const onDragUp = (e: MouseEvent) => {
    if (isScrubbingRef.current) {
      isScrubbingRef.current = false;
      onScrubStateChange(false);
      updateScrubPosition(e.clientX);
    }

    if (dragState) {
      const finished = dragState;
      commit((prev) => {
        if (!prev) return prev;
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
        return { ...prev, notes: newNotes };
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
        if (!prev) return prev;
        const newNotes = [...prev.notes];
        finished.notes.forEach((dn) => {
          newNotes[dn.index] = {
            ...newNotes[dn.index],
            duration: Math.max(snapTick, dn.startDuration + finished.durationDelta),
          };
        });
        return { ...prev, notes: newNotes };
      });
      setDragResizeState(null);
    }

    if (dragVelocityState) {
      const finished = dragVelocityState;
      commit((prev) => {
        if (!prev) return prev;
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
        return { ...prev, notes: newNotes };
      });
      setDragVelocityState(null);
    }

    if (sliceState) {
      const finished = sliceState;
      commit((prev) => {
        if (!prev) return prev;
        return { ...prev, notes: sliceNotes(prev.notes, finished, zoomX, snapTick) };
      });
      setSliceState(null);
    }

    if (lassoState) {
      const leftP = Math.min(lassoState.startX, lassoState.currentX);
      const rightP = Math.max(lassoState.startX, lassoState.currentX);
      const topP = Math.min(lassoState.startY, lassoState.currentY);
      const bottomP = Math.max(lassoState.startY, lassoState.currentY);

      const newSelected = new Set<number>(e.shiftKey ? selectedIndices : []);
      progression?.notes.forEach((n, i) => {
        const nx = n.timeStart * zoomX;
        const ny = (MAX_MIDI - n.midi) * NOTE_HEIGHT;
        const nw = n.duration * zoomX;
        if (nx < rightP && nx + nw > leftP && ny < bottomP && ny + NOTE_HEIGHT > topP) {
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
          ? { ...prev, notes: [...prev.notes, drawnNote(finished, snapTick, zoomX)] }
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
    const onMove = (e: MouseEvent) => dragHandlersRef.current.onMove(e);
    const onUp = (e: MouseEvent) => dragHandlersRef.current.onUp(e);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  // ----- Render -----
  return (
    <div className="flex-1 hardware-panel p-8 z-10 relative w-full max-w-6xl mx-auto flex flex-col overflow-hidden">
      <div className="flex justify-between items-start mb-6 shrink-0">
        <h2 className="text-sm font-bold uppercase tracking-widest">
          Piano Roll Sequencer
        </h2>
        <div className="text-[10px] font-mono px-3 py-1.5 hardware-display rounded uppercase text-[var(--text-muted)]">
          {statusLabel}
        </div>
      </div>

      <div className="flex-1 hardware-display relative border border-[var(--border-color)] bg-[var(--piano-black)] overflow-hidden flex flex-col">
        <div
          className="overflow-auto w-full h-full relative"
          ref={scrollRef}
          onContextMenu={(e) => e.preventDefault()}
        >
          {!progression ? (
            <div className="absolute inset-0 flex items-center justify-center opacity-40 font-bold text-xs uppercase tracking-widest pointer-events-none">
              No Sequence Data
            </div>
          ) : (
            <div className="flex flex-col relative min-w-full w-max pb-6 pr-12">
              {/* Top Header Row (Sticky) */}
              <div className="flex sticky top-0 z-50">
                <div
                  className="h-[40px] sticky left-0 z-50 bg-[#16181d] border-b border-r border-[var(--border-color)] flex-shrink-0"
                  style={{ width: `${KEYBOARD_WIDTH}px` }}
                />
                <div
                  ref={timelineRef}
                  onMouseDown={handleTimelineMouseDown}
                  className="h-[40px] bg-[#16181d]/90 backdrop-blur-sm border-b border-[var(--border-color)] relative cursor-pointer group flex-1"
                  style={{ minWidth: `${contentWidth}px` }}
                  title="Click or drag to scrub playback"
                >
                  <div className="absolute inset-0 bg-white/0 group-hover:bg-white/5 transition-colors pointer-events-none" />
                  {Array.from({ length: totalDisplayBars }).map((_, i) => (
                    <div
                      key={`bar-${i}`}
                      className="absolute text-[10px] font-bold text-[var(--text-muted)] font-mono top-3 pointer-events-none border-l-2 border-white/20 pl-1 h-full"
                      style={{ left: `${i * 4 * zoomX}px` }}
                    >
                      {i + 1}
                    </div>
                  ))}
                </div>
              </div>

              {/* Body Row */}
              <div className="flex relative">
                {/* Left Sticky Keyboard */}
                <div
                  className="sticky left-0 z-40 bg-[#16181d] shadow-[2px_0_5px_rgba(0,0,0,0.5)] border-r border-[var(--border-color)] flex-shrink-0"
                  style={{
                    width: `${KEYBOARD_WIDTH}px`,
                    height: `${PIANO_ROLL_HEIGHT}px`,
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
                        onMouseDown={async (e) => {
                          if (e.button !== 0) return;
                          await initAudio();
                          const name = Note.fromMidi(midi);
                          if (name) playNote(name);
                        }}
                        className={`absolute w-full border-b border-[var(--border-color)] flex items-center justify-end pr-1 text-[8px] font-mono hover:brightness-125 cursor-pointer active:brightness-90
                        ${isBlack ? "bg-[#111216] text-[var(--text-muted)]" : "bg-[var(--piano-white)] text-[var(--text-main)]"}
                        ${isC ? "font-bold text-[var(--accent)] border-t border-[var(--border-color)]" : ""}
                        ${isInScale ? "shadow-[inset_0_0_0_999px_rgba(94,124,246,0.08)]" : ""}`}
                        style={{
                          top: `${i * NOTE_HEIGHT}px`,
                          height: `${NOTE_HEIGHT}px`,
                        }}
                      >
                        {isC ? `C${Math.floor(midi / 12) - 1}` : ""}
                      </div>
                    );
                  })}
                </div>

                {/* Main Grid Area */}
                <div
                  ref={gridRef}
                  className="relative flex-1"
                  style={{
                    minWidth: `${contentWidth}px`,
                    height: `${PIANO_ROLL_HEIGHT}px`,
                    backgroundImage: `
                      linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px),
                      linear-gradient(to right, var(--border-color) 1px, transparent 1px),
                      linear-gradient(to right, rgba(255,255,255,0.02) 1px, transparent 1px)
                    `,
                    backgroundSize: `100% ${NOTE_HEIGHT}px, ${zoomX * 4}px 100%, ${zoomX}px 100%`,
                    backgroundPosition: "0 0, 0 0, 0 0",
                  }}
                  onMouseDown={handleGridMouseDown}
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
                          top: `${i * NOTE_HEIGHT}px`,
                          height: `${NOTE_HEIGHT}px`,
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

                  {/* Chord Markers */}
                  {progression.chords.map((c, i) => (
                    <div
                      key={`c-${i}`}
                      className="absolute text-[10px] font-mono font-bold text-white bg-[var(--accent)]/50 border border-[var(--accent)]/30 px-1.5 py-0.5 rounded shadow-sm z-20 backdrop-blur-sm uppercase pointer-events-none"
                      style={{
                        left: `${c.timeStart * zoomX + 4}px`,
                        top: "4px",
                      }}
                    >
                      {c.name}
                    </div>
                  ))}

                  {/* Playhead */}
                  {isPlaying && (
                    <div
                      className="absolute top-0 bottom-0 w-0 border-l-[2px] border-[#fc3c3c] shadow-[0_0_12px_rgba(252,60,60,0.8)] z-30 pointer-events-none"
                      style={{ left: `${currentTick * zoomX}px` }}
                    >
                      <div className="absolute top-0 left-[-6px] w-[13px] h-[13px] bg-[#fc3c3c] rounded-b-sm shadow-[0_2px_4px_rgba(0,0,0,0.5)]"></div>
                    </div>
                  )}

                  {/* Drag Drawing Note Ghost Box */}
                  {dragDrawState && (
                    <div
                      className="absolute z-20 pointer-events-none"
                      style={{
                        left: `${dragDrawState.startTick * zoomX}px`,
                        top: `${(MAX_MIDI - dragDrawState.startMidi) * NOTE_HEIGHT}px`,
                        width: `${drawnNote(dragDrawState, snapTick, zoomX).duration * zoomX}px`,
                        height: `${NOTE_HEIGHT}px`,
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
                    const boxWidth = Math.max(zoomX / 4, renderDuration * zoomX);
                    const showLabel = boxWidth >= 34 && !isPlayingNote;

                    return (
                      <div
                        key={i}
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
                          top: `${(MAX_MIDI - renderMidi) * NOTE_HEIGHT}px`,
                          height: `${NOTE_HEIGHT}px`,
                          opacity: isPlayingNote ? 1 : Math.max(0.4, n.velocity),
                        }}
                      >
                        {/* Visual Box */}
                        <div
                          className={`absolute inset-[1px] rounded-[3px] border shadow-sm transition-colors duration-100 overflow-hidden
                            ${
                              isPlayingNote
                                ? "bg-emerald-400 border-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.5)] z-30"
                                : isSelected
                                  ? "bg-violet-500 border-violet-400 shadow-[0_0_4px_rgba(139,92,246,0.5)] z-20"
                                  : "bg-[var(--accent)] border-blue-400 group-hover:brightness-110"
                            }
                          `}
                        >
                          {showLabel && (
                            <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[8px] font-mono font-bold text-white/70 pointer-events-none select-none">
                              {Note.fromMidi(renderMidi) || ""}
                            </span>
                          )}
                        </div>

                        {/* Hit Areas */}
                        <div className="absolute inset-0 z-30">
                          <div
                            onMouseDown={(e) => handleNoteMouseDown(e, i)}
                            className="absolute left-0 top-0 bottom-0 right-[8px] sm:right-[10px] cursor-move"
                            style={{ minWidth: "4px" }}
                          />
                          <div
                            onMouseDown={(e) => handleNoteResizeMouseDown(e, i)}
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
                  className="sticky left-0 z-40 bg-[#16181d] border-t border-r border-[var(--border-color)] flex-shrink-0 flex items-center justify-center"
                  style={{
                    width: `${KEYBOARD_WIDTH}px`,
                    height: `${VELOCITY_LANE_HEIGHT}px`,
                  }}
                >
                  <span className="text-[8px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
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
                    const barWidth = Math.max(zoomX / 4, n.duration * zoomX);
                    const barHeight = renderVelocity * VELOCITY_LANE_HEIGHT;

                    return (
                      <div
                        key={`vel-${i}`}
                        onMouseDown={(e) => handleVelocityBarMouseDown(e, i)}
                        className="absolute inset-y-0 cursor-ns-resize group"
                        style={{
                          left: `${n.timeStart * zoomX}px`,
                          width: `${barWidth}px`,
                        }}
                      >
                        <div
                          className={`absolute inset-x-[1px] bottom-0 rounded-t-[2px] border-t shadow-sm transition-colors
                            ${
                              isVelocityDragging
                                ? "bg-emerald-400 border-emerald-300"
                                : isSelected
                                  ? "bg-violet-500 border-violet-400"
                                  : "bg-[var(--accent)] border-blue-400 group-hover:brightness-110"
                            }
                          `}
                          style={{ height: `${barHeight}px` }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
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
  };
}

/** Split every note intersected by the slice line into two pieces. */
function sliceNotes(
  notes: NoteEvent[],
  slice: BoxState,
  zoomX: number,
  snapTick: number,
): NoteEvent[] {
  const minLineX = Math.min(slice.startX, slice.currentX);
  const maxLineX = Math.max(slice.startX, slice.currentX);
  const minLineY = Math.min(slice.startY, slice.currentY);
  const maxLineY = Math.max(slice.startY, slice.currentY);

  const result: NoteEvent[] = [];
  for (const n of notes) {
    const nx = n.timeStart * zoomX;
    const ny = (MAX_MIDI - n.midi) * NOTE_HEIGHT;
    const nw = n.duration * zoomX;
    const nh = NOTE_HEIGHT;

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
