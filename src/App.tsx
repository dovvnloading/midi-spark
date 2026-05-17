import React, { useState, useEffect, useRef } from "react";
import {
  Download,
  Upload,
  Play,
  Square,
  Settings2,
  Sliders,
  Music,
  Volume2,
  Pencil,
  MousePointer2,
  Stamp,
  Magnet,
  Zap,
  AudioLines,
  ZoomIn,
  Scissors,
  Undo2,
  Redo2,
  Repeat,
} from "lucide-react";
import {
  generateSequence,
  ProgressionData,
  applyVariationToProgression,
  detectKeyFromProgression,
} from "./lib/theory";
import {
  initAudio,
  playProgression,
  updateProgressionLive,
  stopAudio,
  setSynthType,
  playNote,
  seekAudio,
  updatePlaybackNotes,
} from "./lib/audio";
import { exportToMidi, parseMidiFile } from "./lib/midiExport";
import { Note } from "@tonaljs/tonal";
import { CustomDropdown } from "./components/CustomDropdown";
import { CustomSlider } from "./components/CustomSlider";
import { DraggableNumberInput } from "./components/DraggableNumberInput";

const MIDI_RANGE = 128;
const MAX_MIDI = 127;
const NOTE_HEIGHT = 16;
const PIANO_ROLL_HEIGHT = MIDI_RANGE * NOTE_HEIGHT;
// removed static QUARTER_WIDTH

const CHORD_STAMPS: Record<string, number[]> = {
  Major: [0, 4, 7],
  Minor: [0, 3, 7],
  Maj7: [0, 4, 7, 11],
  Min7: [0, 3, 7, 10],
  Dom7: [0, 4, 7, 10],
  Dim: [0, 3, 6],
  Aug: [0, 4, 8],
  Sus2: [0, 2, 7],
  Sus4: [0, 5, 7],
};

const SCALE_STAMPS: Record<string, number[]> = {
  "Major Scale": [0, 2, 4, 5, 7, 9, 11],
  "Minor Scale": [0, 2, 3, 5, 7, 8, 10],
  "Harmonic Minor": [0, 2, 3, 5, 7, 8, 11],
  "Melodic Minor": [0, 2, 3, 5, 7, 9, 11],
  "Pentatonic Maj": [0, 2, 4, 7, 9],
  "Pentatonic Min": [0, 3, 5, 7, 10],
  Blues: [0, 3, 5, 6, 7, 10],
};

const NOTE_LENGTH_OPTIONS = [
  { label: "1/1", value: 4 },
  { label: "1/2", value: 2 },
  { label: "1/4", value: 1 },
  { label: "1/8", value: 0.5 },
  { label: "1/16", value: 0.25 },
  { label: "1/32", value: 0.125 },
];

const SNAP_OPTIONS = [
  { label: "Line", value: 0 },
  { label: "1/4", value: 1 },
  { label: "1/8", value: 0.5 },
  { label: "1/16", value: 0.25 },
  { label: "1/32", value: 0.125 },
];

export default function App() {
  const [root, setRoot] = useState("C");
  const [mode, setMode] = useState<"major" | "minor">("major");
  const [dissonance, setDissonance] = useState(30);
  const [complexity, setComplexity] = useState(20);
  const [bars, setBars] = useState(4);
  const [bpm, setBpm] = useState(120);
  const [synthType, setSynthTypeState] = useState<
    "classic" | "epiano" | "pad" | "pluck" | "dream"
  >("classic");

  const [progression, setProgression] = useState<ProgressionData | null>(null);
  const [history, setHistory] = useState<ProgressionData[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const saveToHistory = (newProg: ProgressionData) => {
    setHistory((prev) => {
      const sliced = prev.slice(0, historyIndex + 1);
      const updated = [...sliced, JSON.parse(JSON.stringify(newProg))];
      // Limit history to 50 steps
      if (updated.length > 50) return updated.slice(updated.length - 50);
      return updated;
    });
    setHistoryIndex((prev) => {
      const next = prev + 1;
      return next > 49 ? 49 : next;
    });
  };

  const undo = () => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      setProgression(JSON.parse(JSON.stringify(history[prevIndex])));
      setHistoryIndex(prevIndex);
      setSelectedNoteIndices(new Set());
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      setProgression(JSON.parse(JSON.stringify(history[nextIndex])));
      setHistoryIndex(nextIndex);
      setSelectedNoteIndices(new Set());
    }
  };
  const [followPlayback, setFollowPlayback] = useState(true);
  const [isLooping, setIsLooping] = useState(true);
  const isLoopingRef = useRef(true);

  const toggleLooping = () => {
    setIsLooping(!isLooping);
    isLoopingRef.current = !isLooping;
  };

  const [currentTick, setCurrentTick] = useState(0); // in quarters
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (isPlaying && progression) {
      updatePlaybackNotes(progression.notes, bpm);
    }
  }, [progression, bpm, isPlaying]);

  const [snapResolution, setSnapResolution] = useState<number>(0.25);
  const [noteLength, setNoteLength] = useState<number>(0.25);
  const [toolMode, setToolMode] = useState<"draw" | "select" | "stamp" | "cut">(
    "draw",
  );
  const [stampType, setStampType] = useState<string>("Major");
  const [selectedNoteIndices, setSelectedNoteIndices] = useState<Set<number>>(
    new Set(),
  );
  const [zoomX, setZoomX] = useState<number>(60);

  const [dragState, setDragState] = useState<{
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
  } | null>(null);

  const [dragDrawState, setDragDrawState] = useState<{
    startX: number;
    startY: number;
    startTick: number;
    startMidi: number;
    currentX: number;
    startDuration: number;
  } | null>(null);

  const [dragResizeState, setDragResizeState] = useState<{
    notes: { index: number; startDuration: number }[];
    startX: number;
    durationDelta: number;
  } | null>(null);

  const [lassoState, setLassoState] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);

  const [sliceState, setSliceState] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const isScrubbingRef = useRef(false);
  const isPlayingRef = useRef(false);
  const hasAutoScrolled = useRef(false);

  useEffect(() => {
    initAudio();
  }, []);

  useEffect(() => {
    if (progression && scrollRef.current && !hasAutoScrolled.current) {
      if (progression.notes.length > 0) {
        const avgMidi =
          progression.notes.reduce((sum, n) => sum + n.midi, 0) /
          progression.notes.length;
        scrollRef.current.scrollTop = Math.max(
          0,
          (MAX_MIDI - avgMidi) * NOTE_HEIGHT -
            scrollRef.current.clientHeight / 2,
        );
      } else {
        scrollRef.current.scrollTop = Math.max(
          0,
          (MAX_MIDI - 64) * NOTE_HEIGHT - scrollRef.current.clientHeight / 2,
        );
      }
      hasAutoScrolled.current = true;
    }
  }, [progression]);

  // Auto-scroll piano roll loosely
  useEffect(() => {
    if (isPlaying && followPlayback && scrollRef.current) {
      // Center the playhead
      const targetScroll =
        currentTick * zoomX - scrollRef.current.clientWidth / 2;
      scrollRef.current.scrollLeft = Math.max(0, targetScroll);
    }
  }, [currentTick, isPlaying, zoomX, followPlayback]);

  // Zoom with Wheel
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const preventZoom = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY * -0.1;
        setZoomX((z) => Math.max(10, Math.min(200, z + delta)));
      } else if (e.shiftKey) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener("wheel", preventZoom, { passive: false });
    return () => el.removeEventListener("wheel", preventZoom);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedNoteIndices.size > 0) {
          setProgression((prev) => {
            if (!prev) return prev;
            const next = {
              ...prev,
              notes: prev.notes.filter((_, i) => !selectedNoteIndices.has(i)),
            };
            saveToHistory(next);
            return next;
          });
          setSelectedNoteIndices(new Set());
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        if (document.activeElement?.tagName === "INPUT") return;
        e.preventDefault();
        setProgression((prev) => {
          if (prev) {
            setSelectedNoteIndices(new Set(prev.notes.map((_, i) => i)));
          }
          return prev;
        });
      }

      if (e.altKey && e.key.toLowerCase() === "u") {
        e.preventDefault();
        handleChopSelected();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedNoteIndices, noteLength]);

  // Keep playback engine in sync with progression or bpm changes, INCLUDING live drag edits
  useEffect(() => {
    if (isPlaying && progression) {
      let previewProgression = progression;

      // If we are currently dragging/editing, calculate the real-time preview
      if (dragState) {
        const newNotes = [...progression.notes];
        dragState.notes.forEach((dn) => {
          const newTick = Math.max(0, dn.startTick + dragState.tickDelta);
          const newMidi = Math.max(
            0,
            Math.min(127, dn.startMidi + dragState.midiDelta),
          );
          newNotes[dn.index] = {
            ...newNotes[dn.index],
            timeStart: newTick,
            midi: newMidi,
            name: Note.fromMidi(newMidi) || newNotes[dn.index].name,
          };
        });
        previewProgression = { ...progression, notes: newNotes };
      } else if (dragResizeState) {
        const newNotes = [...progression.notes];
        const snapTick = snapResolution > 0 ? snapResolution : 0.125;
        dragResizeState.notes.forEach((dn) => {
          newNotes[dn.index] = {
            ...newNotes[dn.index],
            duration: Math.max(
              snapTick,
              dn.startDuration + dragResizeState.durationDelta,
            ),
          };
        });
        previewProgression = { ...progression, notes: newNotes };
      } else if (dragDrawState) {
        const dx = Math.max(0, dragDrawState.currentX - dragDrawState.startX);
        const snapTick = snapResolution > 0 ? snapResolution : 0.015625;
        let tickDelta = dragDrawState.startDuration;

        if (Math.abs(dx) > 5) {
          const minTick = snapTick > 0 ? snapTick : 0.125;
          tickDelta = Math.max(
            minTick,
            Math.round(dx / (zoomX * snapTick)) * snapTick,
          );
        }

        const noteName = Note.fromMidi(dragDrawState.startMidi) || "C4";
        const newNotes = [
          ...progression.notes,
          {
            midi: dragDrawState.startMidi,
            name: noteName,
            timeStart: dragDrawState.startTick,
            duration: tickDelta,
            velocity: 0.8,
          },
        ];
        previewProgression = { ...progression, notes: newNotes };
      }

      updateProgressionLive(previewProgression, bpm, isLoopingRef.current);
    }
  }, [
    progression,
    bpm,
    isPlaying,
    dragState,
    dragResizeState,
    dragDrawState,
    snapResolution,
    zoomX,
    isLooping,
  ]);

  const handleChopSelected = () => {
    setProgression((prev) => {
      if (!prev) return prev;

      const newNotes: any[] = [];
      const chopLen = noteLength;

      prev.notes.forEach((n, i) => {
        const shouldChop =
          selectedNoteIndices.size === 0 || selectedNoteIndices.has(i);

        if (shouldChop && n.duration > chopLen + 0.001) {
          let t = n.timeStart;
          const end = n.timeStart + n.duration;
          while (t < end - 0.001) {
            const pieceLen = Math.min(chopLen, end - t);
            if (pieceLen < 0.01) break;
            newNotes.push({
              ...n,
              timeStart: t,
              duration: pieceLen,
            });
            t += pieceLen;
          }
        } else {
          newNotes.push(n);
        }
      });

      return {
        ...prev,
        notes: newNotes,
      };
    });
    setProgression((p) => {
      if (p) saveToHistory(p);
      return p;
    });
    setSelectedNoteIndices(new Set());
  };

  const handleGenerate = async () => {
    await initAudio();
    const seq = generateSequence(root, mode, bars, dissonance, complexity);
    setProgression(seq);
    saveToHistory(seq);
    setCurrentTick(0);
    hasAutoScrolled.current = false;
  };

  const handlePlay = async () => {
    if (!progression) return;
    await initAudio();
    let startTick = currentTick;
    const maxNoteEnd = progression.notes.reduce(
      (max, n) => Math.max(max, n.timeStart + n.duration),
      0,
    );
    const playheadMaxTick = Math.max(progression.totalBars * 4, maxNoteEnd);
    if (startTick >= playheadMaxTick) {
      startTick = 0;
      setCurrentTick(0);
    }
    setIsPlaying(true);
    isPlayingRef.current = true;
    playProgression(
      progression,
      bpm,
      (tick) => {
        if (!isScrubbingRef.current) {
          let displayTick = tick;
          if (isLoopingRef.current) {
            displayTick = tick % playheadMaxTick;
          }
          setCurrentTick(displayTick);
        }
        if (tick === 0 && !isLoopingRef.current) {
          setIsPlaying(false);
          isPlayingRef.current = false;
        }
      },
      startTick,
      isLoopingRef.current,
    );
  };

  const handleStop = () => {
    setIsPlaying(false);
    isPlayingRef.current = false;
    setCurrentTick(0);
    stopAudio();
  };

  const handleDownload = () => {
    if (!progression) return;
    const dataUri = exportToMidi(progression, bpm);
    const link = document.createElement("a");
    link.href = dataUri;
    link.download = `progression_${root}_${mode}.mid`;
    link.click();
  };

  const handleSynthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value as any;
    setSynthTypeState(val);
    setSynthType(val);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const parsed = await parseMidiFile(file);
      const detected = detectKeyFromProgression(parsed);
      setRoot(detected.root);
      setMode(detected.mode);
      setProgression(parsed);
      saveToHistory(parsed);
      setCurrentTick(0);
    } catch (err) {
      console.error(err);
      alert("Failed to parse MIDI file");
    }
  };

  const [isDraggingMidi, setIsDraggingMidi] = useState(false);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes("Files")) {
      setIsDraggingMidi(true);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes("Files")) {
      e.dataTransfer.dropEffect = "copy";
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDraggingMidi(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingMidi(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (
      !(
        file.name.toLowerCase().endsWith(".mid") ||
        file.name.toLowerCase().endsWith(".midi")
      )
    ) {
      return;
    }

    try {
      const parsed = await parseMidiFile(file);
      const detected = detectKeyFromProgression(parsed);
      setRoot(detected.root);
      setMode(detected.mode);
      setProgression(parsed);
      saveToHistory(parsed);
      setCurrentTick(0);
    } catch (err) {
      console.error(err);
      alert("Failed to parse MIDI file");
    }
  };

  const handleGenerateVariations = async () => {
    if (!progression) return;
    await initAudio();

    const varComplexity = Math.min(100, complexity + 20);
    const varDissonance = Math.min(100, dissonance + 15);

    const seq = applyVariationToProgression(
      progression,
      varDissonance,
      varComplexity,
      root,
      mode,
    );
    setProgression(seq);
    saveToHistory(seq);
    setCurrentTick(0);
    hasAutoScrolled.current = false;
  };

  const [containerWidth, setContainerWidth] = useState(1200);

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
  const totalDisplayBars = Math.max(contentBars, visibleBars + 4); // Always fill screen + some buffer
  const contentWidth = totalDisplayBars * 4 * zoomX;

  const updateScrubPosition = (clientX: number) => {
    if (!timelineRef.current || !progression) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    let tick = x / zoomX;
    tick = Math.max(0, Math.min(totalDisplayBars * 4, tick));

    setCurrentTick(tick);

    if (isPlayingRef.current) {
      seekAudio(tick, bpm);
    }
  };

  const handleTimelineMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !progression) return;
    isScrubbingRef.current = true;
    updateScrubPosition(e.clientX);
  };

  // Grid interaction handlers
  const handleGridMouseDown = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (!progression) return;

    // If clicking empty space and not holding shift, clear selection
    if (!e.shiftKey && toolMode !== "select") {
      setSelectedNoteIndices(new Set());
    }

    const scrollLeft = scrollRef.current?.scrollLeft || 0;
    const scrollTop = scrollRef.current?.scrollTop || 0;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const snapTick = snapResolution > 0 ? snapResolution : 0.015625;
    const tick =
      snapResolution > 0
        ? Math.round(x / (zoomX * snapTick)) * snapTick
        : x / zoomX;
    const midi = Math.max(
      0,
      Math.min(127, MAX_MIDI - Math.floor(y / NOTE_HEIGHT)),
    );

    if (toolMode === "select") {
      setLassoState({
        startX: x,
        startY: y,
        currentX: x,
        currentY: y,
      });
      if (!e.shiftKey) setSelectedNoteIndices(new Set());
      return;
    }

    if (toolMode === "cut") {
      setSliceState({
        startX: e.clientX,
        startY: e.clientY,
        currentX: e.clientX,
        currentY: e.clientY,
      });
      return;
    }

    await initAudio();

    if (toolMode === "stamp") {
      const isScale = !!SCALE_STAMPS[stampType];
      const intervals = CHORD_STAMPS[stampType] || SCALE_STAMPS[stampType];
      const newNotes = intervals.map((interval) => {
        const chordMidi = midi + interval;
        const name = Note.fromMidi(chordMidi) || "C4";
        if (!isScale) playNote(name, 0.5, 0.8);
        return {
          midi: chordMidi,
          name,
          timeStart: tick,
          duration: isScale ? 0.015625 : noteLength, // scales place tiny guides
          velocity: isScale ? 0.1 : 0.8, // less velocity so it looks like a guide
        };
      });
      setProgression((prev) => {
        if (!prev) return prev;
        const next = { ...prev, notes: [...prev.notes, ...newNotes] };
        saveToHistory(next);
        return next;
      });
      return;
    }

    // Default: draw single note
    const name = Note.fromMidi(midi) || "C4";
    playNote(name, noteLength, 0.8);
    setDragDrawState({
      startTick: tick,
      startMidi: midi,
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      startDuration: noteLength,
    });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (dragState && progression) {
        const dx = e.clientX - dragState.startX;
        const dy = e.clientY - dragState.startY;

        const snapTick = snapResolution > 0 ? snapResolution : 0.015625;
        const tickDelta = Math.round(dx / (zoomX * snapTick)) * snapTick;
        const midiDelta = -Math.round(dy / NOTE_HEIGHT);

        setDragState((prev) =>
          prev ? { ...prev, tickDelta, midiDelta } : null,
        );
      } else if (dragResizeState && progression) {
        const dx = e.clientX - dragResizeState.startX;
        const snapTick = snapResolution > 0 ? snapResolution : 0.015625;
        const durationDelta = Math.round(dx / (zoomX * snapTick)) * snapTick;

        setDragResizeState((prev) =>
          prev ? { ...prev, durationDelta } : null,
        );
      } else if (dragDrawState) {
        setDragDrawState((prev) =>
          prev ? { ...prev, currentX: e.clientX } : null,
        );
      } else if (sliceState && timelineRef.current) {
        setSliceState((prev) =>
          prev
            ? {
                ...prev,
                currentX: e.clientX,
                currentY: e.clientY,
              }
            : null,
        );
      } else if (lassoState && timelineRef.current) {
        const gridContainer = scrollRef.current?.querySelector(
          '.relative[style*="width:"]',
        );
        if (gridContainer) {
          const rect = gridContainer.getBoundingClientRect();
          setLassoState((prev) =>
            prev
              ? {
                  ...prev,
                  currentX: e.clientX - rect.left,
                  currentY: e.clientY - rect.top,
                }
              : null,
          );
        }
      } else if (isScrubbingRef.current) {
        updateScrubPosition(e.clientX);
      }
    };

    const handleMouseUp = async (e: MouseEvent) => {
      if (isScrubbingRef.current) {
        isScrubbingRef.current = false;
        updateScrubPosition(e.clientX);
      }

      if (dragState && progression) {
        await initAudio();

        setProgression((prev) => {
          if (!prev) return prev;
          const newNotes = [...prev.notes];
          dragState.notes.forEach((dn) => {
            const newTick = Math.max(0, dn.startTick + dragState.tickDelta);
            const newMidi = Math.max(
              0,
              Math.min(127, dn.startMidi + dragState.midiDelta),
            );
            newNotes[dn.index] = {
              ...newNotes[dn.index],
              timeStart: newTick,
              midi: newMidi,
              name: Note.fromMidi(newMidi) || newNotes[dn.index].name,
            };
          });
          const next = { ...prev, notes: newNotes };
          saveToHistory(next);
          return next;
        });

        dragState.notes.forEach((dn) => {
          // We play from the preview state, though it's quick
          const name = Note.fromMidi(
            Math.max(0, Math.min(127, dn.startMidi + dragState.midiDelta)),
          );
          if (name) playNote(name, 0.25, 0.6);
        });
        setDragState(null);
      }

      if (dragResizeState) {
        setProgression((prev) => {
          if (!prev) return prev;
          const newNotes = [...prev.notes];
          const snapTick = snapResolution > 0 ? snapResolution : 0.125;
          dragResizeState.notes.forEach((dn) => {
            newNotes[dn.index] = {
              ...newNotes[dn.index],
              duration: Math.max(
                snapTick,
                dn.startDuration + dragResizeState.durationDelta,
              ),
            };
          });
          const next = { ...prev, notes: newNotes };
          saveToHistory(next);
          return next;
        });
        setDragResizeState(null);
      }

      if (sliceState && progression) {
        const gridContainer = scrollRef.current?.querySelector(
          '.relative[style*="width:"]',
        );
        if (gridContainer) {
          const rect = gridContainer.getBoundingClientRect();

          // x in pixels
          const lineStartX = sliceState.startX - rect.left;
          const lineEndX = sliceState.currentX - rect.left;

          const minLineX = Math.min(lineStartX, lineEndX);
          const maxLineX = Math.max(lineStartX, lineEndX);
          const minLineY = Math.min(
            sliceState.startY - rect.top,
            sliceState.currentY - rect.top,
          );
          const maxLineY = Math.max(
            sliceState.startY - rect.top,
            sliceState.currentY - rect.top,
          );

          setProgression((prev) => {
            if (!prev) return prev;
            const newNotes: any[] = [];

            prev.notes.forEach((n) => {
              const nx = n.timeStart * zoomX;
              const ny = (MAX_MIDI - n.midi) * NOTE_HEIGHT;
              const nw = n.duration * zoomX;
              const nh = NOTE_HEIGHT;

              const isVerticalCut = Math.abs(lineEndX - lineStartX) < 10;
              const hitX = isVerticalCut
                ? lineStartX
                : lineStartX +
                  ((lineEndX - lineStartX) * (ny + nh / 2 - minLineY)) /
                    (maxLineY - minLineY + 0.001);
              const intersectX = isVerticalCut ? lineStartX : hitX;

              const horizontallyOverlap =
                intersectX >= nx && intersectX <= nx + nw;
              const verticallyOverlap = maxLineY >= ny && minLineY <= ny + nh;

              if (horizontallyOverlap && verticallyOverlap) {
                const snapTick = snapResolution > 0 ? snapResolution : 0.015625;
                const intersectTickRaw = Math.max(0, intersectX / zoomX);
                const roundedSplit =
                  Math.round((intersectTickRaw - n.timeStart) / snapTick) *
                  snapTick;

                const p1Dur = Math.max(0.015625, roundedSplit);
                const p2Dur = Math.max(0.015625, n.duration - p1Dur);

                if (
                  p1Dur > 0 &&
                  p2Dur > 0 &&
                  n.timeStart + p1Dur < n.timeStart + n.duration - 0.001
                ) {
                  newNotes.push({ ...n, duration: p1Dur });
                  newNotes.push({
                    ...n,
                    timeStart: n.timeStart + p1Dur,
                    duration: p2Dur,
                  });
                } else {
                  newNotes.push(n);
                }
              } else {
                newNotes.push(n);
              }
            });

            const next = { ...prev, notes: newNotes };
            saveToHistory(next);
            return next;
          });
        }
        setSliceState(null);
      }

      if (lassoState && progression) {
        const leftP = Math.min(lassoState.startX, lassoState.currentX);
        const rightP = Math.max(lassoState.startX, lassoState.currentX);
        const topP = Math.min(lassoState.startY, lassoState.currentY);
        const bottomP = Math.max(lassoState.startY, lassoState.currentY);

        const newSelected = new Set(e.shiftKey ? selectedNoteIndices : []);

        progression.notes.forEach((n, i) => {
          const nx = n.timeStart * zoomX;
          const ny = (MAX_MIDI - n.midi) * NOTE_HEIGHT;
          const nw = n.duration * zoomX;
          const nh = NOTE_HEIGHT;

          if (
            nx < rightP &&
            nx + nw > leftP &&
            ny < bottomP &&
            ny + nh > topP
          ) {
            newSelected.add(i);
          }
        });

        setSelectedNoteIndices(newSelected);
        setLassoState(null);
      }

      if (dragDrawState && progression) {
        const dx = Math.max(0, dragDrawState.currentX - dragDrawState.startX);
        const snapTick = snapResolution > 0 ? snapResolution : 0.015625;
        let tickDelta = dragDrawState.startDuration;

        if (Math.abs(dx) > 5) {
          // If dragged to resize
          const minTick = snapTick > 0 ? snapTick : 0.125;
          tickDelta = Math.max(
            minTick,
            Math.round(dx / (zoomX * snapTick)) * snapTick,
          );
        }

        const noteName = Note.fromMidi(dragDrawState.startMidi) || "C4";
        setProgression((prev) => {
          if (!prev) return prev;
          const next = {
            ...prev,
            notes: [
              ...prev.notes,
              {
                midi: dragDrawState.startMidi,
                name: noteName,
                timeStart: dragDrawState.startTick,
                duration: tickDelta,
                velocity: 0.8,
              },
            ],
          };
          saveToHistory(next);
          return next;
        });
        setDragDrawState(null);
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragState, dragDrawState, dragResizeState, progression]);

  const handleNoteMouseDown = (e: React.MouseEvent, index: number) => {
    if (toolMode === "cut") return;
    e.stopPropagation();
    if (e.button !== 0) return;
    if (!progression) return;

    let targets: number[] = [index];
    if (selectedNoteIndices.has(index)) {
      targets = Array.from<number>(selectedNoteIndices);
    } else {
      if (e.shiftKey) {
        const newSel = new Set<number>(selectedNoteIndices);
        newSel.add(index);
        setSelectedNoteIndices(newSel);
        targets = Array.from<number>(newSel);
      } else {
        setSelectedNoteIndices(new Set<number>([index]));
      }
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
    if (selectedNoteIndices.has(index)) {
      targets = Array.from<number>(selectedNoteIndices);
    } else {
      setSelectedNoteIndices(new Set<number>([index]));
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

  const handleNoteDelete = (targetNote: any, index: number) => {
    setProgression((prev) => {
      if (!prev) return prev;

      const isSelected = selectedNoteIndices.has(index);
      let next;

      if (isSelected) {
        const notesToDelete = new Set(
          progression!.notes.filter((_, i) => selectedNoteIndices.has(i)),
        );
        next = {
          ...prev,
          notes: prev.notes.filter((n) => !notesToDelete.has(n)),
        };
      } else {
        next = {
          ...prev,
          notes: prev.notes.filter((n) => n !== targetNote),
        };
      }
      saveToHistory(next);
      return next;
    });

    setSelectedNoteIndices(new Set());
  };

  return (
    <div
      className="h-screen w-full flex overflow-hidden font-sans relative"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDraggingMidi && (
        <div className="absolute inset-0 z-[100] bg-[var(--piano-black)]/80 backdrop-blur-sm flex items-center justify-center border-4 border-dashed border-[var(--accent)] font-bold text-2xl text-[var(--accent)] pointer-events-none">
          <div className="flex flex-col items-center gap-4">
            <Upload size={48} className="animate-bounce" />
            <span>Drop MIDI file to load</span>
          </div>
        </div>
      )}
      {/* Sidebar Controls */}
      <div className="w-[320px] min-w-[320px] p-6 flex flex-col gap-6 overflow-y-auto hardware-panel relative z-40 m-6 mr-0">
        <div className="flex items-center gap-3 mb-6 mt-2">
          <div className="relative w-10 h-10 rounded-xl bg-gradient-to-b from-[var(--surface-bg-hover)] to-[var(--piano-black)] flex items-center justify-center border border-[var(--border-color)] shadow-[0_0_15px_rgba(77,124,255,0.15)] overflow-hidden">
            <div className="absolute inset-0 bg-[var(--accent)] opacity-10 mix-blend-overlay"></div>
            <AudioLines
              className="text-[var(--accent)] drop-shadow-[0_0_8px_rgba(77,124,255,0.8)] relative z-10"
              size={24}
              strokeWidth={2}
            />
          </div>
          <h1 className="text-2xl font-black tracking-tighter flex items-center">
            <span className="text-white drop-shadow-sm">MIDI</span>
            <span className="text-[var(--accent)] drop-shadow-[0_0_10px_rgba(77,124,255,0.3)] ml-1">
              SPARK
            </span>
          </h1>
        </div>

        <div className="flex flex-col gap-4">
          <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1 block">
            Key & Scale
          </label>
          <div className="flex gap-4">
            <CustomDropdown
              options={[
                "C",
                "C#",
                "D",
                "Eb",
                "E",
                "F",
                "F#",
                "G",
                "Ab",
                "A",
                "Bb",
                "B",
              ].map((k) => ({ label: k, value: k }))}
              value={root}
              onChange={(v) => setRoot(v)}
            />

            <CustomDropdown
              options={[
                { label: "Major", value: "major" },
                { label: "Minor", value: "minor" },
              ]}
              value={mode}
              onChange={(v) => setMode(v)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] block">
                Chord Tension
              </label>
              <span className="text-[10px] font-mono text-[var(--text-main)] opacity-80">
                {dissonance}%
              </span>
            </div>
            <CustomSlider
              className="mt-1"
              min={0}
              max={100}
              value={dissonance}
              onChange={(val) => setDissonance(val)}
            />
            <div className="flex justify-between mt-2 text-[9px] font-mono text-[var(--text-muted)]">
              <span>Low</span>
              <span>High</span>
            </div>
          </div>

          <div className="mt-2">
            <div className="flex justify-between mb-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] block">
                Groove Complexity
              </label>
              <span className="text-[10px] font-mono text-[var(--text-main)] opacity-80">
                {complexity}%
              </span>
            </div>
            <CustomSlider
              className="mt-1"
              min={0}
              max={100}
              value={complexity}
              onChange={(val) => setComplexity(val)}
            />
          </div>

          <div className="mt-2">
            <div className="flex justify-between mb-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] block">
                Loop Length
              </label>
              <span className="text-[10px] font-mono text-[var(--text-main)] opacity-80">
                {bars} Bars
              </span>
            </div>
            <CustomSlider
              className="mt-1"
              min={4}
              max={16}
              step={4}
              value={bars}
              onChange={(val) => setBars(val)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 mt-4">
          <button
            onClick={handleGenerate}
            className="hardware-btn hardware-btn-primary h-12 w-full uppercase tracking-widest text-[10px] gap-2 font-bold"
          >
            Generate Chord Progression
          </button>

          <button
            onClick={handleGenerateVariations}
            disabled={!progression}
            className="hardware-btn h-10 w-full text-[10px] uppercase tracking-widest gap-2 font-bold"
          >
            Add Rhythmic Variation
          </button>
        </div>
      </div>

      {/* Main Area */}
      <div className="flex-1 flex flex-col p-6 gap-6 overflow-hidden">
        {/* Top Control Bar */}
        <div className="w-full max-w-6xl mx-auto overflow-x-auto scrollbar-hide hardware-panel z-30 relative shrink-0">
          <div className="min-w-max h-16 px-4 sm:px-6 flex justify-between items-center gap-4">
            <div className="flex items-center gap-3 sm:gap-4">
              {isPlaying ? (
                <button
                  onClick={handleStop}
                  className="hardware-btn w-10 h-10 rounded-full text-[var(--accent)] hover:text-red-400 shrink-0"
                >
                  <Square fill="currentColor" size={12} />
                </button>
              ) : (
                <button
                  onClick={handlePlay}
                  className="hardware-btn w-10 h-10 rounded-full text-[var(--accent)] hover:text-emerald-400 shrink-0"
                  disabled={!progression}
                >
                  <Play fill="currentColor" size={16} />
                </button>
              )}

              <div className="h-6 w-px bg-[var(--border-color)] mx-1 sm:mx-2 shrink-0"></div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={undo}
                  disabled={historyIndex <= 0}
                  className="hardware-btn w-10 h-10 rounded-full disabled:opacity-30 shrink-0"
                  title="Undo (Ctrl+Z)"
                >
                  <Undo2 size={16} />
                </button>
                <button
                  onClick={redo}
                  disabled={historyIndex >= history.length - 1}
                  className="hardware-btn w-10 h-10 rounded-full disabled:opacity-30 shrink-0"
                  title="Redo (Ctrl+Y)"
                >
                  <Redo2 size={16} />
                </button>
              </div>

              <div className="h-6 w-px bg-[var(--border-color)] mx-1 sm:mx-2 shrink-0"></div>

              <button
                onClick={() => setFollowPlayback(!followPlayback)}
                className={`hardware-btn px-3 h-10 rounded-full flex items-center gap-2 transition-all shrink-0 ${followPlayback ? "text-[var(--accent)] border-[var(--accent)]/30" : "text-[var(--text-muted)] opacity-50"}`}
                title="Toggle Follow Playback (Auto-scroll)"
              >
                <div
                  className={`w-1.5 h-1.5 rounded-full ${followPlayback ? "bg-[var(--accent)] animate-pulse shadow-[0_0_8px_var(--accent)]" : "bg-gray-600"}`}
                ></div>
                <span className="text-[10px] font-bold uppercase tracking-tight">
                  Follow
                </span>
              </button>

              <button
                onClick={toggleLooping}
                className={`hardware-btn px-3 h-10 rounded-full flex items-center gap-2 transition-all shrink-0 ${isLooping ? "text-emerald-400 border-emerald-400/30 font-bold" : "text-[var(--text-muted)] opacity-50"}`}
                title="Toggle Loop Playback"
              >
                <div
                  className={`w-1.5 h-1.5 rounded-full ${isLooping ? "bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" : "bg-gray-600"}`}
                ></div>
                <Repeat size={14} />
                <span className="text-[10px] font-bold uppercase tracking-tight">
                  Loop
                </span>
              </button>

              <div className="h-6 w-px bg-[var(--border-color)] mx-1 sm:mx-2 shrink-0"></div>

              <div className="flex items-center gap-2 shrink-0">
                <DraggableNumberInput
                  label="BPM"
                  className="w-20 p-2"
                  value={bpm}
                  min={20}
                  max={300}
                  step={1}
                  onChange={(v) => setBpm(v)}
                />
              </div>

              <div className="flex items-center space-x-2 px-4 h-10 hardware-display rounded-full sm:ml-2 shrink-0">
                <span className="text-xs font-semibold uppercase opacity-60">
                  Instrument:
                </span>
                <div className="w-44 -mr-2 shrink-0">
                  <CustomDropdown
                    options={[
                      { label: "Classic Analog", value: "classic" },
                      { label: "Electric Piano", value: "epiano" },
                      { label: "Atmospheric Pad", value: "pad" },
                      { label: "Modern Pluck", value: "pluck" },
                      { label: "Dreamwave", value: "dream" },
                    ]}
                    value={synthType}
                    onChange={(v) => {
                      handleSynthChange({ target: { value: v } } as any);
                    }}
                    className="bg-transparent border-none mt-[-2px]"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-4 shrink-0">
              <input
                type="file"
                accept=".mid,.midi"
                className="hidden"
                ref={fileInputRef}
                onChange={handleFileUpload}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="hardware-btn h-10 px-4 sm:px-6 text-[10px] uppercase tracking-widest flex gap-2 font-bold items-center shrink-0"
              >
                Load MIDI
              </button>
              <button
                onClick={handleDownload}
                disabled={!progression}
                className={`hardware-btn hardware-btn-primary h-10 px-4 sm:px-6 text-[10px] uppercase tracking-widest flex gap-2 font-bold items-center shrink-0`}
              >
                Export MIDI
              </button>
            </div>
          </div>
        </div>

        {/* Secondary Toolbar: Snap & Tools */}
        <div className="w-full max-w-6xl mx-auto overflow-x-auto scrollbar-hide z-20 relative shrink-0 mb-[-12px]">
          <div className="min-w-max flex items-center justify-between px-4 sm:px-6 pb-2 sm:pb-0 gap-4">
            <div className="flex hardware-display p-1 shrink-0">
              <button
                onClick={() => setToolMode("draw")}
                className={`p-2 rounded-md transition-all ${toolMode === "draw" ? "bg-[var(--surface-bg-hover)] text-[var(--accent)] shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"}`}
                title="Draw (Pencil)"
              >
                <Pencil size={18} />
              </button>
              <button
                onClick={() => setToolMode("select")}
                className={`p-2 rounded-md transition-all ${toolMode === "select" ? "bg-[var(--surface-bg-hover)] text-[var(--accent)] shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"}`}
                title="Select (Lasso)"
              >
                <MousePointer2 size={18} />
              </button>
              <button
                onClick={() => setToolMode("stamp")}
                className={`p-2 rounded-md flex items-center gap-2 transition-all ${toolMode === "stamp" ? "bg-[var(--surface-bg-hover)] text-[var(--accent)] shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"}`}
                title="Chord Stamp"
              >
                <Stamp size={18} />
              </button>
              <button
                onClick={() => setToolMode("cut")}
                className={`p-2 rounded-md flex items-center gap-2 transition-all ${toolMode === "cut" ? "bg-red-500/20 text-red-400 shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"}`}
                title="Slice Tool (Drag to cut notes)"
              >
                <Scissors size={18} />
              </button>
              {toolMode === "stamp" && (
                <div className="pl-2 border-l border-[var(--border-color)] ml-2 flex items-center w-36">
                  <CustomDropdown
                    options={[
                      {
                        groupLabel: "Chords",
                        options: Object.keys(CHORD_STAMPS).map((k) => ({
                          label: k,
                          value: k,
                        })),
                      },
                      {
                        groupLabel: "Scales",
                        options: Object.keys(SCALE_STAMPS).map((k) => ({
                          label: k,
                          value: k,
                        })),
                      },
                    ]}
                    value={stampType}
                    onChange={(v) => setStampType(v)}
                    className="border-none bg-transparent"
                  />
                </div>
              )}
            </div>

            <div className="flex gap-4 shrink-0">
              <button
                onClick={handleChopSelected}
                className="hardware-btn px-4 py-1.5 h-10 rounded text-[10px] font-bold uppercase tracking-widest text-[var(--accent)] hover:bg-[var(--surface-bg-hover)] flex items-center gap-2 border border-[var(--border-color)] bg-[var(--piano-black)] shrink-0"
                title="Chop notes into 'Length' segments (Alt+U). Applies to selected notes, or all notes if none selected."
              >
                <Zap size={14} />
                CHOP
              </button>
              <div className="flex items-center gap-2 hardware-display p-1 px-3 shrink-0">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                  Length
                </span>
                <div className="w-24 ml-1">
                  <CustomDropdown
                    options={NOTE_LENGTH_OPTIONS.map((o) => ({
                      label: o.label,
                      value: o.value,
                    }))}
                    value={noteLength}
                    onChange={(v) => setNoteLength(Number(v))}
                    className="border-none bg-transparent mt-1"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 hardware-display p-1 px-3 shrink-0">
                <Magnet size={16} className="text-[var(--text-muted)]" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                  Snap
                </span>
                <div className="w-24 ml-1">
                  <CustomDropdown
                    options={SNAP_OPTIONS}
                    value={snapResolution}
                    onChange={(v) => setSnapResolution(Number(v))}
                    className="border-none bg-transparent mt-1"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 hardware-display p-1 px-3 w-32 shrink-0">
                <ZoomIn
                  size={16}
                  className="text-[var(--text-muted)] shrink-0"
                />
                <CustomSlider
                  min={10}
                  max={200}
                  step={1}
                  value={zoomX}
                  onChange={(v) => setZoomX(v)}
                  className="h-6"
                  fillColor="linear-gradient(90deg, #3b5bdb 0%, #5e7cf6 100%)"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Visualizer - The Piano Roll */}
        <div className="flex-1 hardware-panel p-8 z-10 relative w-full max-w-6xl mx-auto flex flex-col overflow-hidden">
          <div className="flex justify-between items-start mb-6 shrink-0">
            <h2 className="text-sm font-bold uppercase tracking-widest">
              Piano Roll Sequencer
            </h2>
            <div className="text-[10px] font-mono px-3 py-1.5 hardware-display rounded uppercase text-[var(--text-muted)]">
              {progression
                ? `${progression.totalBars} Bars | Root: ${root}-${mode}`
                : "Waiting for Pattern..."}
            </div>
          </div>

          <div className="flex-1 hardware-display relative border border-[var(--border-color)] bg-[var(--piano-black)] overflow-hidden flex flex-col">
            {/* Playhead and Scrollable Area */}
            <div
              className="overflow-auto w-full h-full custom-scrollbar relative"
              ref={scrollRef}
              onContextMenu={(e) => e.preventDefault()}
            >
              {!progression ? (
                <div className="absolute inset-0 flex items-center justify-center opacity-40 font-bold text-xs uppercase tracking-widest pointer-events-none">
                  No Sequence Data
                </div>
              ) : (
                <div className="flex flex-col relative transition-all duration-1000 min-w-full w-max pb-6 pr-12">
                  {/* Top Header Row (Sticky) */}
                  <div className="flex sticky top-0 z-50">
                    <div className="w-[64px] h-[40px] sticky left-0 z-50 bg-[#16181d] border-b border-r border-[var(--border-color)] flex-shrink-0" />
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
                      className="w-[64px] sticky left-0 z-40 bg-[#16181d] shadow-[2px_0_5px_rgba(0,0,0,0.5)] border-r border-[var(--border-color)] flex-shrink-0"
                      style={{ height: `${PIANO_ROLL_HEIGHT}px` }}
                    >
                      {Array.from({ length: MIDI_RANGE }).map((_, i) => {
                        const midi = MAX_MIDI - i;
                        const noteClass = midi % 12;
                        const isBlack = [1, 3, 6, 8, 10].includes(noteClass);
                        const isC = noteClass === 0;
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
                            ${isC ? "font-bold text-[var(--accent)] border-t border-[var(--border-color)]" : ""}`}
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
                      {/* Black Key Background Tracks */}
                      {Array.from({ length: MIDI_RANGE }).map((_, i) => {
                        const midi = MAX_MIDI - i;
                        const isBlack = [1, 3, 6, 8, 10].includes(midi % 12);
                        if (!isBlack) return null;
                        return (
                          <div
                            key={`h-${i}`}
                            className="absolute left-0 right-0 z-0 bg-black/[0.15] pointer-events-none"
                            style={{
                              top: `${i * NOTE_HEIGHT}px`,
                              height: `${NOTE_HEIGHT}px`,
                            }}
                          />
                        );
                      })}

                      {/* Context Chords Markers */}
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
                            width: `${Math.max(dragDrawState.startDuration * zoomX, Math.round((dragDrawState.currentX - dragDrawState.startX) / (zoomX * (snapResolution || 0.015625))) * (zoomX * (snapResolution || 0.015625)))}px`,
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
                            left: Math.min(
                              lassoState.startX,
                              lassoState.currentX,
                            ),
                            top: Math.min(
                              lassoState.startY,
                              lassoState.currentY,
                            ),
                            width: Math.abs(
                              lassoState.currentX - lassoState.startX,
                            ),
                            height: Math.abs(
                              lassoState.currentY - lassoState.startY,
                            ),
                          }}
                        />
                      )}

                      {/* Slice Line */}
                      {sliceState && (
                        <svg className="absolute inset-0 w-full h-full pointer-events-none z-50">
                          <line
                            x1={
                              sliceState.startX -
                              (scrollRef.current
                                ?.querySelector('.relative[style*="width:"]')
                                ?.getBoundingClientRect().left || 0)
                            }
                            y1={
                              sliceState.startY -
                              (scrollRef.current
                                ?.querySelector('.relative[style*="width:"]')
                                ?.getBoundingClientRect().top || 0)
                            }
                            x2={
                              sliceState.currentX -
                              (scrollRef.current
                                ?.querySelector('.relative[style*="width:"]')
                                ?.getBoundingClientRect().left || 0)
                            }
                            y2={
                              sliceState.currentY -
                              (scrollRef.current
                                ?.querySelector('.relative[style*="width:"]')
                                ?.getBoundingClientRect().top || 0)
                            }
                            stroke="#ef4444"
                            strokeWidth="2"
                            strokeDasharray="4 2"
                          />
                        </svg>
                      )}

                      {/* Notes */}
                      {progression.notes.map((n, i) => {
                        const isDragging =
                          dragState &&
                          dragState.notes.some((dn) => dn.index === i);
                        const isResizing =
                          dragResizeState &&
                          dragResizeState.notes.some((dn) => dn.index === i);

                        let renderTick = n.timeStart;
                        let renderMidi = n.midi;
                        let renderDuration = n.duration;

                        if (isDragging) {
                          renderTick = Math.max(
                            0,
                            n.timeStart + dragState!.tickDelta,
                          );
                          renderMidi = Math.max(
                            0,
                            Math.min(127, n.midi + dragState!.midiDelta),
                          );
                        } else if (isResizing) {
                          renderDuration = Math.max(
                            snapResolution > 0 ? snapResolution : 0.125,
                            n.duration + dragResizeState!.durationDelta,
                          );
                        }

                        const isPlayingNote =
                          isPlaying &&
                          currentTick >= renderTick &&
                          currentTick <= renderTick + renderDuration;
                        const isSelected = selectedNoteIndices.has(i);

                        const displayDuration = renderDuration;
                        const boxWidth = Math.max(
                          zoomX / 4,
                          displayDuration * zoomX,
                        );
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
                              opacity: isPlayingNote
                                ? 1
                                : Math.max(0.4, n.velocity),
                            }}
                          >
                            {/* Visual Box */}
                            <div
                              className={`absolute inset-[1px] rounded-[3px] border shadow-sm transition-colors duration-100
                                ${
                                  isPlayingNote
                                    ? "bg-emerald-400 border-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.5)] z-30"
                                    : isSelected
                                      ? "bg-violet-500 border-violet-400 shadow-[0_0_4px_rgba(139,92,246,0.5)] z-20"
                                      : "bg-[var(--accent)] border-blue-400 group-hover:brightness-110"
                                }
                              `}
                            />

                            {/* Hit Areas Container */}
                            <div className="absolute inset-0 z-30">
                              {/* Drag Hit Area (covers everything except the right edge) */}
                              <div
                                onMouseDown={(e) => handleNoteMouseDown(e, i)}
                                className="absolute left-0 top-0 bottom-0 right-[8px] sm:right-[10px] cursor-move"
                                style={{ minWidth: "4px" }}
                              />

                              {/* Resize Hit Area (anchored to the right edge, slightly overflowing) */}
                              <div
                                onMouseDown={(e) =>
                                  handleNoteResizeMouseDown(e, i)
                                }
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
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
