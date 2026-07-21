import { useCallback, useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
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
  seekAudio,
  SynthType,
} from "./lib/audio";
import { exportToMidiBlob, parseMidiFile } from "./lib/midi";
import { MAX_BPM, MIN_BPM, clamp } from "./lib/constants";
import { useHistory } from "./hooks/useHistory";
import { Sidebar } from "./components/Sidebar";
import { TransportBar } from "./components/TransportBar";
import { EditToolbar, ToolMode } from "./components/EditToolbar";
import { PianoRoll } from "./components/PianoRoll";

function sequenceEnd(progression: ProgressionData): number {
  const maxNoteEnd = progression.notes.reduce(
    (max, n) => Math.max(max, n.timeStart + n.duration),
    0,
  );
  return Math.max(progression.totalBars * 4, maxNoteEnd);
}

export default function App() {
  // Generation parameters
  const [root, setRoot] = useState("C");
  const [mode, setMode] = useState<"major" | "minor">("major");
  const [dissonance, setDissonance] = useState(30);
  const [complexity, setComplexity] = useState(20);
  const [bars, setBars] = useState(4);

  // Transport / sound
  const [bpm, setBpm] = useState(120);
  const [synthType, setSynthTypeState] = useState<SynthType>("classic");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTick, setCurrentTick] = useState(0);
  const [isLooping, setIsLooping] = useState(true);
  const [followPlayback, setFollowPlayback] = useState(true);

  // Sequence + undo/redo
  const {
    value: progression,
    canUndo,
    canRedo,
    commit,
    undo: undoHistory,
    redo: redoHistory,
  } = useHistory<ProgressionData | null>(null);
  const [selectedNoteIndices, setSelectedNoteIndices] = useState<Set<number>>(
    new Set(),
  );

  // Editing tools
  const [toolMode, setToolMode] = useState<ToolMode>("draw");
  const [stampType, setStampType] = useState("Major");
  const [noteLength, setNoteLength] = useState(0.25);
  const [snapResolution, setSnapResolution] = useState(0.25);
  const [zoomX, setZoomX] = useState(60);

  // Bumped when a new sequence should re-center the piano roll.
  const [scrollAnchorKey, setScrollAnchorKey] = useState(0);

  const [livePreview, setLivePreview] = useState<ProgressionData | null>(null);
  const [isDraggingMidi, setIsDraggingMidi] = useState(false);

  const isPlayingRef = useRef(false);
  const isLoopingRef = useRef(true);
  const isScrubbingRef = useRef(false);

  const undo = useCallback(() => {
    undoHistory();
    setSelectedNoteIndices(new Set());
  }, [undoHistory]);

  const redo = useCallback(() => {
    redoHistory();
    setSelectedNoteIndices(new Set());
  }, [redoHistory]);

  useEffect(() => {
    initAudio();
  }, []);

  // Keep the audio engine in sync with edits (including live drag previews),
  // BPM changes, and loop toggles while the transport is running.
  useEffect(() => {
    if (isPlaying && progression) {
      updateProgressionLive(livePreview ?? progression, bpm, isLooping);
    }
  }, [progression, livePreview, bpm, isPlaying, isLooping]);

  // ----- Transport -----

  const handlePlay = useCallback(async () => {
    if (!progression) return;
    await initAudio();
    const endTick = sequenceEnd(progression);
    let startTick = currentTick;
    if (startTick >= endTick) {
      startTick = 0;
      setCurrentTick(0);
    }
    setIsPlaying(true);
    isPlayingRef.current = true;
    playProgression(
      progression,
      bpm,
      {
        onTick: (tick) => {
          if (!isScrubbingRef.current) {
            setCurrentTick(isLoopingRef.current ? tick % endTick : tick);
          }
        },
        onEnded: () => {
          setIsPlaying(false);
          isPlayingRef.current = false;
          setCurrentTick(0);
        },
      },
      startTick,
      isLoopingRef.current,
    );
  }, [progression, bpm, currentTick]);

  const handleStop = useCallback(() => {
    setIsPlaying(false);
    isPlayingRef.current = false;
    setCurrentTick(0);
    stopAudio();
  }, []);

  const toggleLooping = useCallback(() => {
    setIsLooping((prev) => {
      isLoopingRef.current = !prev;
      return !prev;
    });
  }, []);

  const handleScrub = useCallback(
    (tick: number) => {
      setCurrentTick(tick);
      if (isPlayingRef.current) {
        seekAudio(tick, bpm);
      }
    },
    [bpm],
  );

  const handleScrubStateChange = useCallback((scrubbing: boolean) => {
    isScrubbingRef.current = scrubbing;
  }, []);

  const handleSynthChange = useCallback((type: SynthType) => {
    setSynthTypeState(type);
    setSynthType(type);
  }, []);

  // ----- Generation -----

  const handleGenerate = useCallback(async () => {
    await initAudio();
    const seq = generateSequence(root, mode, bars, dissonance, complexity);
    commit(seq);
    setSelectedNoteIndices(new Set());
    setCurrentTick(0);
    setScrollAnchorKey((k) => k + 1);
  }, [root, mode, bars, dissonance, complexity, commit]);

  const handleGenerateVariations = useCallback(async () => {
    if (!progression) return;
    await initAudio();
    const seq = applyVariationToProgression(
      progression,
      Math.min(100, dissonance + 15),
      Math.min(100, complexity + 20),
      root,
      mode,
    );
    commit(seq);
    setSelectedNoteIndices(new Set());
    setCurrentTick(0);
  }, [progression, dissonance, complexity, root, mode, commit]);

  // ----- MIDI file I/O -----

  const handleExport = useCallback(() => {
    if (!progression) return;
    const blob = exportToMidiBlob(progression, bpm);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `midi-spark_${root}_${mode}.mid`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [progression, bpm, root, mode]);

  const loadMidiFile = useCallback(
    async (file: File) => {
      try {
        const { progression: parsed, bpm: fileBpm } = await parseMidiFile(file);
        if (parsed.notes.length === 0) {
          alert("No notes found in that MIDI file.");
          return;
        }
        const detected = detectKeyFromProgression(parsed);
        setRoot(detected.root);
        setMode(detected.mode);
        if (fileBpm) {
          setBpm(clamp(Math.round(fileBpm), MIN_BPM, MAX_BPM));
        }
        commit(parsed);
        setSelectedNoteIndices(new Set());
        setCurrentTick(0);
        setScrollAnchorKey((k) => k + 1);
      } catch (err) {
        console.error(err);
        alert("Failed to parse MIDI file");
      }
    },
    [commit],
  );

  // ----- Editing -----

  const handleChopSelected = useCallback(() => {
    const selected = selectedNoteIndices;
    commit((prev) => {
      if (!prev) return prev;
      const chopLen = noteLength;
      const newNotes: typeof prev.notes = [];
      prev.notes.forEach((n, i) => {
        const shouldChop = selected.size === 0 || selected.has(i);
        if (shouldChop && n.duration > chopLen + 0.001) {
          let t = n.timeStart;
          const end = n.timeStart + n.duration;
          while (t < end - 0.001) {
            const pieceLen = Math.min(chopLen, end - t);
            if (pieceLen < 0.01) break;
            newNotes.push({ ...n, timeStart: t, duration: pieceLen });
            t += pieceLen;
          }
        } else {
          newNotes.push(n);
        }
      });
      return { ...prev, notes: newNotes };
    });
    setSelectedNoteIndices(new Set());
  }, [selectedNoteIndices, noteLength, commit]);

  const deleteSelected = useCallback(() => {
    const selected = selectedNoteIndices;
    if (selected.size === 0) return;
    commit((prev) =>
      prev
        ? { ...prev, notes: prev.notes.filter((_, i) => !selected.has(i)) }
        : prev,
    );
    setSelectedNoteIndices(new Set());
  }, [selectedNoteIndices, commit]);

  const selectAll = useCallback(() => {
    if (progression) {
      setSelectedNoteIndices(new Set(progression.notes.map((_, i) => i)));
    }
  }, [progression]);

  // ----- Keyboard shortcuts -----
  // The handler lives in a ref so a single window listener always sees fresh
  // state; the old effect-with-deps version acted on stale history.
  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {});
  const onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable)
    ) {
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
      e.preventDefault();
      redo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
      e.preventDefault();
      selectAll();
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      deleteSelected();
      return;
    }
    if (e.code === "Space") {
      e.preventDefault();
      if (isPlayingRef.current) handleStop();
      else handlePlay();
      return;
    }
    if (e.altKey && e.key.toLowerCase() === "u") {
      e.preventDefault();
      handleChopSelected();
    }
  };

  // Re-point the stable listener at this render's handler.
  useEffect(() => {
    keyHandlerRef.current = onKeyDown;
  });

  useEffect(() => {
    const listener = (e: KeyboardEvent) => keyHandlerRef.current(e);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  // ----- MIDI drag & drop -----

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
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".mid") && !lower.endsWith(".midi")) return;
    await loadMidiFile(file);
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

      <Sidebar
        root={root}
        mode={mode}
        dissonance={dissonance}
        complexity={complexity}
        bars={bars}
        canVary={!!progression}
        onRootChange={setRoot}
        onModeChange={setMode}
        onDissonanceChange={setDissonance}
        onComplexityChange={setComplexity}
        onBarsChange={setBars}
        onGenerate={handleGenerate}
        onAddVariation={handleGenerateVariations}
      />

      <div className="flex-1 flex flex-col p-6 gap-6 overflow-hidden">
        <TransportBar
          isPlaying={isPlaying}
          canPlay={!!progression}
          canUndo={canUndo}
          canRedo={canRedo}
          followPlayback={followPlayback}
          isLooping={isLooping}
          bpm={bpm}
          synthType={synthType}
          onPlay={handlePlay}
          onStop={handleStop}
          onUndo={undo}
          onRedo={redo}
          onToggleFollow={() => setFollowPlayback((f) => !f)}
          onToggleLoop={toggleLooping}
          onBpmChange={setBpm}
          onSynthChange={handleSynthChange}
          onLoadFile={loadMidiFile}
          onExport={handleExport}
        />

        <EditToolbar
          toolMode={toolMode}
          stampType={stampType}
          noteLength={noteLength}
          snapResolution={snapResolution}
          zoomX={zoomX}
          onToolModeChange={setToolMode}
          onStampTypeChange={setStampType}
          onNoteLengthChange={setNoteLength}
          onSnapResolutionChange={setSnapResolution}
          onZoomChange={setZoomX}
          onChop={handleChopSelected}
        />

        <PianoRoll
          progression={progression}
          statusLabel={
            progression
              ? `${progression.totalBars} Bars | Root: ${root}-${mode}`
              : "Waiting for Pattern..."
          }
          selectedIndices={selectedNoteIndices}
          toolMode={toolMode}
          stampType={stampType}
          noteLength={noteLength}
          snapResolution={snapResolution}
          zoomX={zoomX}
          isPlaying={isPlaying}
          currentTick={currentTick}
          followPlayback={followPlayback}
          scrollAnchorKey={scrollAnchorKey}
          onSelectionChange={setSelectedNoteIndices}
          commit={commit}
          onZoomChange={setZoomX}
          onScrub={handleScrub}
          onScrubStateChange={handleScrubStateChange}
          onLivePreview={setLivePreview}
        />
      </div>
    </div>
  );
}
