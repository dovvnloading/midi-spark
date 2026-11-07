import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Upload, Check, HardDrive, Music2 } from "lucide-react";
import {
  generateSequence,
  ProgressionData,
  NoteEvent,
  applyVariationToProgression,
  applySwing,
  detectKeyFromProgression,
} from "./lib/theory";
import {
  initAudio,
  pauseAudio,
  resumeAudio,
  playProgression,
  updateProgressionLive,
  stopAudio,
  setSynthType,
  setTrackMixer,
  seekAudio,
  SynthType,
} from "./lib/audio";
import { exportToMidiBlob, parseMidiFile } from "./lib/midi";
import { MAX_BPM, MIN_BPM, clamp } from "./lib/constants";
import { normalizeLoopRange, sequenceEndQuarters, type LoopRange } from "./lib/timeline";
import {
  ensureBarsCoverNotes,
  humanizeNotes,
  quantizeNotes,
  seededRandom,
  transposeNotes,
} from "./lib/transforms";
import {
  loadSession,
  saveSession,
  clearSession,
  SavedSession,
} from "./lib/persistence";
import { useHistory } from "./hooks/useHistory";
import {
  defaultTrackSettings,
  listTracks,
  reconcileTrackMix,
  trackIndexOf,
  type TrackMix,
  type TrackSettings,
} from "./lib/tracks";
import { addTrack, deleteTrack, duplicateTrack, renameTrack } from "./lib/trackOperations";
import { Sidebar } from "./components/Sidebar";
import { Inspector, type InspectorTab } from "./components/Inspector";
import { editScope } from "./lib/editScope";
import { TransportBar } from "./components/TransportBar";
import { EditToolbar, ToolMode } from "./components/EditToolbar";
import { TransformBar } from "./components/TransformBar";
import { TrackStudio } from "./components/TrackStudio";
import { PianoRoll } from "./components/PianoRoll";
import { ShortcutHelp } from "./components/ShortcutHelp";
import { StatusToast, type Notice, type NoticeKind } from "./components/StatusToast";

export default function App() {
  // Attempted once on mount; a missing/corrupt/schema-mismatched save comes
  // back as null and every field below falls back to its hard-coded default.
  const [savedSession] = useState<SavedSession | null>(() => loadSession());

  // Generation parameters
  const [root, setRoot] = useState(savedSession?.root ?? "C");
  const [mode, setMode] = useState<"major" | "minor">(
    savedSession?.mode ?? "major",
  );
  const [dissonance, setDissonance] = useState(savedSession?.dissonance ?? 30);
  const [complexity, setComplexity] = useState(
    savedSession?.complexity ?? 20,
  );
  const [bars, setBars] = useState(savedSession?.bars ?? 4);
  const [generationMode, setGenerationMode] = useState<"single" | "layers">(savedSession?.generationMode ?? "single");

  // Transport / sound
  const [bpm, setBpm] = useState(savedSession?.bpm ?? 120);
  const [synthType, setSynthTypeState] = useState<SynthType>(
    savedSession?.synthType ?? "classic",
  );
  const [playbackState, setPlaybackState] = useState<"stopped" | "playing" | "paused">("stopped");
  const isPlaying = playbackState === "playing";
  const [currentTick, setCurrentTick] = useState(0);
  const [isLooping, setIsLooping] = useState(savedSession?.isLooping ?? true);
  const [loopRegion, setLoopRegion] = useState<LoopRange | null>(savedSession?.loopRegion ?? null);
  const [followPlayback, setFollowPlayback] = useState(true);

  // Sequence + undo/redo
  const {
    value: progression,
    canUndo,
    canRedo,
    commit,
    undo: undoHistory,
    redo: redoHistory,
  } = useHistory<ProgressionData | null>(savedSession?.progression ?? null);
  const [selectedNoteIndices, setSelectedNoteIndices] = useState<Set<number>>(
    new Set(),
  );
  const [focusedTrack, setFocusedTrack] = useState<number | null>(null);
  const [trackOverrides, setTrackOverrides] = useState<TrackMix>(
    savedSession?.trackMix ?? {},
  );
  const tracks = useMemo(() => listTracks(progression), [progression]);
  const visibleFocusedTrack =
    focusedTrack !== null && tracks.some((track) => track.index === focusedTrack)
      ? focusedTrack
      : null;
  const trackMix = useMemo(
    () => reconcileTrackMix(progression, trackOverrides, synthType),
    [progression, trackOverrides, synthType],
  );

  // Editing tools
  const [toolMode, setToolMode] = useState<ToolMode>("draw");
  const [stampType, setStampType] = useState("Major");
  const [noteLength, setNoteLength] = useState(savedSession?.noteLength ?? 0.25);
  const [snapResolution, setSnapResolution] = useState(
    savedSession?.snapResolution ?? 0.25,
  );
  const [zoomX, setZoomX] = useState(savedSession?.zoomX ?? 60);
  const [swingAmount, setSwingAmount] = useState(0);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("compose");
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
  const [desktopInspectorOpen, setDesktopInspectorOpen] = useState(true);
  const [fitRequest, setFitRequest] = useState(0);
  const [saveState, setSaveState] = useState<"saving" | "saved" | "unavailable" | "cleared">("saved");
  const editTargets = useMemo(() => editScope(progression?.notes ?? [], selectedNoteIndices, visibleFocusedTrack), [progression, selectedNoteIndices, visibleFocusedTrack]);
  const scopeLabel = selectedNoteIndices.size > 0 ? "Selected notes" : visibleFocusedTrack !== null ? (tracks.find(t => t.index === visibleFocusedTrack)?.name ?? "Focused track") : "Entire pattern";
  const toggleInspector = () => {
    if (window.matchMedia("(max-width: 760px)").matches) setMobileInspectorOpen(open => !open);
    else setDesktopInspectorOpen(open => !open);
  };
  const openTracks = () => { setInspectorTab("tracks"); setDesktopInspectorOpen(true); setMobileInspectorOpen(true); };

  // Bumped when a new sequence should re-center the piano roll.
  const [scrollAnchorKey, setScrollAnchorKey] = useState(0);

  const [livePreview, setLivePreview] = useState<ProgressionData | null>(null);
  const [isDraggingMidi, setIsDraggingMidi] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const noticeSequence = useRef(0);

  const notify = useCallback((message: string, kind: NoticeKind = "info") => {
    setNotice({ id: ++noticeSequence.current, message, kind });
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => {
      setNotice((current) => current?.id === notice.id ? null : current);
    }, notice.kind === "error" ? 6500 : 4200);
    return () => clearTimeout(timeout);
  }, [notice]);

  const isPlayingRef = useRef(false);
  const playbackStateRef = useRef<"stopped" | "playing" | "paused">("stopped");
  const playRequest = useRef(0);
  const startingAudio = useRef(false);
  const sequenceEndRef = useRef(0);
  useEffect(() => { sequenceEndRef.current = progression ? sequenceEndQuarters(progression) : 0; }, [progression]);
  // Shrinking the musical pattern cannot leave a saved custom loop out of bounds.
  useEffect(() => {
    if (!progression || !loopRegion) return;
    const clamped = normalizeLoopRange(loopRegion, sequenceEndQuarters(progression));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reconcile a now-shorter sequence exactly once
    if (clamped.start !== loopRegion.start || clamped.end !== loopRegion.end) setLoopRegion(clamped);
  }, [progression, loopRegion]);
  const isLoopingRef = useRef(savedSession?.isLooping ?? true);
  const isScrubbingRef = useRef(false);
  // Copied notes, normalized so the earliest timeStart among them is 0. A ref
  // is fine: it doesn't need to trigger re-renders and isn't itself undoable.
  const clipboardRef = useRef<NoteEvent[] | null>(null);
  // Pending debounced-autosave timer. Exposed outside the effect so an
  // explicit "clear saved session" click can cancel an in-flight save --
  // otherwise it could silently resurrect the session moments later.
  const autosaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const undo = useCallback(() => {
    undoHistory();
    setSelectedNoteIndices(new Set());
  }, [undoHistory]);

  const redo = useCallback(() => {
    redoHistory();
    setSelectedNoteIndices(new Set());
  }, [redoHistory]);

  // AudioContext should only start from a user gesture. Restore the
  // selection without starting the audio engine on page load.
  useEffect(() => {
    setSynthType(savedSession?.synthType ?? "classic");
  }, [savedSession]);

  // Mixer changes (including mute/solo) update gain buses without restarting
  // playback or rewriting the underlying MIDI note data.
  useEffect(() => {
    setTrackMixer(trackMix);
  }, [trackMix]);

  // Debounced autosave of the session so a hard reload can restore it.
  useEffect(() => {
    autosaveTimeoutRef.current = setTimeout(() => {
      const saved = saveSession({
        progression,
        root,
        mode,
        bpm,
        dissonance,
        complexity,
        bars,
        generationMode,
        synthType,
        snapResolution,
        noteLength,
        zoomX,
        trackMix,
        isLooping,
        loopRegion,
      });
      setSaveState(saved ? "saved" : "unavailable");
    }, 400);
    return () => clearTimeout(autosaveTimeoutRef.current);
  }, [
    progression,
    root,
    mode,
    bpm,
    dissonance,
    complexity,
    bars,
    generationMode,
    synthType,
    snapResolution,
    noteLength,
    zoomX,
    trackMix,
    isLooping,
    loopRegion,
  ]);

  // Keep the audio engine in sync with edits (including live drag previews),
  // BPM changes, and loop toggles while the transport is running.
  useEffect(() => {
    if (playbackState !== "stopped" && progression) {
      updateProgressionLive(livePreview ?? progression, bpm, isLooping, loopRegion);
    }
  }, [progression, livePreview, bpm, playbackState, isLooping, loopRegion]);

  // ----- Transport -----

  const handlePlay = useCallback(async () => {
    if (playbackStateRef.current === "paused") {
      resumeAudio();
      playbackStateRef.current = "playing";
      isPlayingRef.current = true;
      setPlaybackState("playing");
      return;
    }
    if (playbackStateRef.current === "playing" || !progression?.notes.length || startingAudio.current) return;
    const request = ++playRequest.current;
    startingAudio.current = true;
    try {
      await initAudio();
    } catch (error) {
      console.error(error);
      notify("Audio could not start. Check browser permissions and try Play again.", "error");
      return;
    } finally {
      startingAudio.current = false;
    }
    if (request !== playRequest.current) return;
    const endTick = sequenceEndQuarters(progression);
    let startTick = currentTick;
    const range = normalizeLoopRange(loopRegion, endTick);
    if (isLoopingRef.current && (startTick < range.start || startTick >= range.end)) {
      startTick = range.start;
      setCurrentTick(startTick);
    } else if (startTick >= endTick) {
      startTick = 0;
      setCurrentTick(0);
    }
    setPlaybackState("playing");
    playbackStateRef.current = "playing";
    isPlayingRef.current = true;
    playProgression(
      progression,
      bpm,
      {
        onTick: (tick) => {
          if (!isScrubbingRef.current) {
            setCurrentTick(isLoopingRef.current && sequenceEndRef.current > 0 ? tick % sequenceEndRef.current : tick);
          }
        },
        onEnded: () => {
          setPlaybackState("stopped");
          playbackStateRef.current = "stopped";
          isPlayingRef.current = false;
          setCurrentTick(0);
        },
      },
      startTick,
      isLoopingRef.current,
      loopRegion,
    );
  }, [progression, bpm, currentTick, loopRegion, notify]);

  const handlePause = useCallback(() => {
    if (playbackStateRef.current !== "playing") return;
    pauseAudio();
    playbackStateRef.current = "paused";
    isPlayingRef.current = false;
    setPlaybackState("paused");
  }, []);

  const handleStop = useCallback(() => {
    playRequest.current++;
    setPlaybackState("stopped");
    playbackStateRef.current = "stopped";
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
      if (playbackStateRef.current !== "stopped") {
        setCurrentTick(seekAudio(tick));
      } else {
        setCurrentTick(tick);
      }
    },
    [],
  );

  const handleScrubStateChange = useCallback((scrubbing: boolean) => {
    isScrubbingRef.current = scrubbing;
  }, []);

  const handleLoopRegionChange = useCallback((next: LoopRange | null) => {
    setLoopRegion(next);
  }, []);

  const handleSynthChange = useCallback((type: SynthType) => {
    setSynthTypeState(type);
    setSynthType(type);
    // The transport's global instrument picker retains the original
    // single-track behavior. Multitrack patches live in Track Studio.
    if (tracks.length <= 1 && tracks.length > 0) {
      const id = tracks[0].index;
      setTrackOverrides((prev) => ({
        ...prev,
        [id]: { ...(trackMix[id] ?? defaultTrackSettings(id, type)), synthType: type },
      }));
    }
  }, [tracks, trackMix]);

  const handleTrackChange = useCallback(
    (index: number, changes: Partial<TrackSettings>) => {
      if (tracks.length === 1 && changes.synthType) {
        setSynthTypeState(changes.synthType);
        setSynthType(changes.synthType);
      }
      setTrackOverrides((prev) => ({
        ...prev,
        [index]: {
          ...(prev[index] ?? trackMix[index] ?? defaultTrackSettings(index, synthType)),
          ...changes,
        },
      }));
    },
    [trackMix, synthType, tracks.length],
  );

  const handleFocusTrack = useCallback((index: number | null) => {
    setFocusedTrack(index);
    setSelectedNoteIndices(new Set());
  }, []);

  const handleAddTrack = useCallback(() => {
    const base = progression ?? { notes: [], chords: [], totalBars: bars };
    const created = addTrack(base);
    if (!created) {
      notify("All 15 melodic MIDI channels are in use. Remove a track before adding another.", "error");
      return;
    }
    commit(created.progression);
    // Override explicitly so a newly allocated ID never inherits stale mixer state.
    setTrackOverrides(prev => ({
      ...prev,
      [created.index]: defaultTrackSettings(created.index, synthType),
    }));
    setFocusedTrack(created.index);
    setSelectedNoteIndices(new Set());
    openTracks();
    notify("Added a new track. Draw or stamp notes into the focused lane.", "success");
  }, [progression, bars, commit, synthType, notify]);

  const handleRenameTrack = useCallback((index: number, name: string) => {
    commit(prev => prev ? renameTrack(prev, index, name) : prev);
  }, [commit]);

  const handleDuplicateTrack = useCallback((index: number) => {
    if (!progression) return;
    const duplicate = duplicateTrack(progression, index);
    if (!duplicate) {
      notify("Could not duplicate: all melodic MIDI channels are in use.", "error");
      return;
    }
    commit(duplicate.progression);
    const source = trackMix[index] ?? defaultTrackSettings(index, synthType);
    setTrackOverrides(prev => ({
      ...prev,
      [duplicate.index]: { ...source, solo: false },
    }));
    setFocusedTrack(duplicate.index);
    setSelectedNoteIndices(new Set());
    notify("Duplicated the track and its notes. Undo to restore the previous arrangement.", "success");
  }, [progression, commit, trackMix, synthType, notify]);

  const handleDeleteTrack = useCallback((index: number) => {
    if (!progression) return;
    const updated = deleteTrack(progression, index);
    if (updated === progression) return;
    commit(updated);
    setSelectedNoteIndices(new Set());
    setFocusedTrack(previous => previous === index ? null : previous);
    // Retain session-local overrides for Undo; nextTrackIndex prevents accidental reuse.
    notify("Track removed. Undo restores its notes and metadata.", "info");
  }, [progression, commit, notify]);

  // Only affects what happens on a future reload — does not touch the
  // current in-memory working state. Cancels any in-flight debounced
  // autosave first, otherwise a save already scheduled before this click
  // could land right after and silently resurrect the session.
  const handleClearSavedSession = useCallback(() => {
    clearTimeout(autosaveTimeoutRef.current);
    clearSession();
    setSaveState("cleared");
    notify("Saved session cleared. Current work stays open; future edits will autosave.", "info");
  }, [notify]);

  // ----- Generation -----

  const handleGenerate = useCallback(() => {
    handleStop();
    const layered = generationMode === "layers";
    const seq = generateSequence(root, mode, bars, dissonance, complexity, layered);
    commit(seq);
    setSelectedNoteIndices(new Set());
    const harmonySynth = synthType === "sub" ? "epiano" : synthType;
    setTrackOverrides(layered ? {
      0: defaultTrackSettings(0, "sub"),
      1: { ...defaultTrackSettings(1, harmonySynth), synthType: harmonySynth },
    } : {});
    if (layered) setInspectorTab("tracks");
    setFocusedTrack(null);
    setLoopRegion(null);
    setCurrentTick(0);
    setScrollAnchorKey((k) => k + 1);
    setFitRequest(k => k + 1);
    setMobileInspectorOpen(false);
    notify("Generated a " + seq.totalBars + "-bar pattern in " + root + " " + mode + (layered ? " with separate Bass and Harmony tracks." : "."), "success");
  }, [root, mode, bars, dissonance, complexity, generationMode, synthType, commit, notify, handleStop]);

  const handleGenerateVariations = useCallback(() => {
    if (!progression) return;
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
    notify("Rhythmic variation added. Undo with Ctrl/⌘+Z.", "success");
  }, [progression, dissonance, complexity, root, mode, commit, notify]);

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
    notify("MIDI file exported and ready for your DAW.", "success");
  }, [progression, bpm, root, mode, notify]);

  const loadMidiFile = useCallback(
    async (file: File) => {
      try {
        const { progression: parsed, bpm: fileBpm } = await parseMidiFile(file);
        if (parsed.notes.length === 0) {
          notify("This MIDI file contains no melodic notes to import.", "error");
          return;
        }
        const detected = detectKeyFromProgression(parsed);
        setRoot(detected.root);
        setMode(detected.mode);
        if (fileBpm) {
          setBpm(clamp(Math.round(fileBpm), MIN_BPM, MAX_BPM));
        }
        handleStop();
        commit(parsed);
        setSelectedNoteIndices(new Set());
        setTrackOverrides({});
        setFocusedTrack(null);
        setLoopRegion(null);
        setCurrentTick(0);
        setScrollAnchorKey((k) => k + 1);
        setFitRequest(k => k + 1);
        setMobileInspectorOpen(false);
        if (listTracks(parsed).length > 1) setInspectorTab("tracks");
        notify("Imported " + file.name + " · " + parsed.notes.length + " notes.", "success");
      } catch (err) {
        console.error(err);
        notify("Couldn't read this MIDI file. Try another .mid or .midi file.", "error");
      }
    },
    [commit, notify, handleStop],
  );

  // ----- Editing -----

  const handleChopSelected = useCallback(() => {
    const selected = editTargets;
    if (selected.size === 0) return;
    commit((prev) => {
      if (!prev) return prev;
      const chopLen = noteLength;
      const newNotes: typeof prev.notes = [];
      let changed = false;
      prev.notes.forEach((n, i) => {
        const shouldChop = selected.has(i);
        if (shouldChop && n.duration > chopLen + 0.001) {
          changed = true;
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
      return changed ? { ...prev, notes: newNotes } : prev;
    });
    setSelectedNoteIndices(new Set());
  }, [editTargets, noteLength, commit]);

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
      setSelectedNoteIndices(new Set(
        progression.notes
          .map((note, i) =>
            visibleFocusedTrack === null || trackIndexOf(note) === visibleFocusedTrack ? i : -1,
          )
          .filter((index) => index >= 0),
      ));
    }
  }, [progression, visibleFocusedTrack]);

  const handleCopySelected = useCallback(() => {
    if (!progression || selectedNoteIndices.size === 0) return;
    const selected = Array.from(selectedNoteIndices)
      .map((i) => progression.notes[i])
      .filter((n): n is NoteEvent => !!n);
    if (selected.length === 0) return;
    const earliest = Math.min(...selected.map((n) => n.timeStart));
    clipboardRef.current = selected.map((n) => ({
      ...n,
      timeStart: n.timeStart - earliest,
    }));
  }, [progression, selectedNoteIndices]);

  const handlePasteClipboard = useCallback(() => {
    const clip = clipboardRef.current;
    if (!progression || !clip || clip.length === 0) return;
    const pasteTick = currentTick;
    const startIndex = progression.notes.length;
    const pasted = clip.map((n) => ({
      ...n,
      timeStart: n.timeStart + pasteTick,
      ...(visibleFocusedTrack === null ? {} : { trackIndex: visibleFocusedTrack }),
    }));
    commit((prev) =>
      prev
        ? ensureBarsCoverNotes({ ...prev, notes: [...prev.notes, ...pasted] })
        : prev,
    );
    setSelectedNoteIndices(new Set(pasted.map((_, i) => startIndex + i)));
  }, [progression, currentTick, commit, visibleFocusedTrack]);

  const handleApplySwing = useCallback(() => {
    if (editTargets.size === 0) return;
    commit((prev) => {
      if (!prev) return prev;
      const targeted = prev.notes.filter((_, i) => editTargets.has(i));
      const swung = applySwing({ ...prev, notes: targeted }, swingAmount);
      if (swung.notes.every((n, i) => n === targeted[i])) return prev;
      let index = 0;
      return ensureBarsCoverNotes({ ...prev, notes: prev.notes.map((n, i) => editTargets.has(i) ? swung.notes[index++] : n) });
    });
  }, [swingAmount, commit, editTargets]);

  const handleDuplicateBar = useCallback(() => {
    const barStart = Math.floor(currentTick / 4) * 4;
    const barEnd = barStart + 4;
    commit((prev) => {
      if (!prev) return prev;
      const barNotes = prev.notes.filter(
        (n, index) => editTargets.has(index) && n.timeStart >= barStart && n.timeStart < barEnd,
      );
      if (barNotes.length === 0) return prev;
      const duplicated = barNotes.map((n) => ({
        ...n,
        timeStart: n.timeStart + 4,
      }));
      return ensureBarsCoverNotes({ ...prev, notes: [...prev.notes, ...duplicated] });
    });
  }, [currentTick, commit, editTargets]);

  // ----- Note Lab: selection-aware, undoable transforms -----

  const handleQuantize = useCallback(
    (grid: number, strength: number) => {
      const selection = editTargets;
      if (selection.size === 0) return;
      commit((prev) =>
        prev ? quantizeNotes(prev, grid, strength, selection) : prev,
      );
    },
    [editTargets, commit],
  );

  const handleTranspose = useCallback(
    (semitones: number) => {
      const selection = editTargets;
      if (selection.size === 0) return;
      commit((prev) =>
        prev ? transposeNotes(prev, semitones, selection) : prev,
      );
    },
    [editTargets, commit],
  );

  const handleHumanize = useCallback(
    (amount: number) => {
      const selection = editTargets;
      if (selection.size === 0) return;
      // Seed before dispatch. Recreate the RNG inside the reducer updater so
      // React StrictMode's double evaluation yields exactly the same notes.
      const seed = Math.floor(Math.random() * 0x100000000);
      commit((prev) =>
        prev ? humanizeNotes(prev, amount, selection, seededRandom(seed)) : prev,
      );
    },
    [editTargets, commit],
  );

  // ----- Keyboard shortcuts -----
  // The handler lives in a ref so a single window listener always sees fresh
  // state; the old effect-with-deps version acted on stale history.
  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {});
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.defaultPrevented || shortcutsOpen) return;
    const target = e.target instanceof HTMLElement ? e.target : null;
    if (target?.closest('input, textarea, select, [role="dialog"], dialog, [contenteditable="true"]')) return;
    if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault(); setShortcutsOpen(true); return;
    }
    // Keyboard navigation in menus and buttons takes priority over editor hotkeys.
    if (target?.closest('button, summary, a[href], [role="tab"], [role="button"], [role="listbox"], [role="slider"], [role="spinbutton"], [role="menuitem"]')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "g") {
      e.preventDefault(); if (!e.repeat) handleGenerate(); return;
    }
    if (e.key === "Escape") {
      if (mobileInspectorOpen) setMobileInspectorOpen(false);
      else setSelectedNoteIndices(new Set());
      return;
    }
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      const modes: Record<string, ToolMode> = { b: "draw", v: "select", s: "stamp", c: "cut", h: "pan" };
      if (modes[e.key.toLowerCase()]) { setToolMode(modes[e.key.toLowerCase()]); return; }
      if (e.key.toLowerCase() === "f") { e.preventDefault(); setFitRequest(k => k + 1); return; }
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
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
      // Only intercept when there's actually a note selection to copy —
      // otherwise let native browser copy-to-clipboard proceed as normal
      // (e.g. copying chord-name/status text on the page).
      if (selectedNoteIndices.size === 0) return;
      e.preventDefault();
      handleCopySelected();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
      if (!clipboardRef.current?.length) return;
      e.preventDefault();
      handlePasteClipboard();
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      if (selectedNoteIndices.size > 0) {
        e.preventDefault();
        deleteSelected();
      }
      return;
    }
    if (e.code === "Space") {
      if (e.repeat || target?.closest('button, summary, [role="tab"]')) return;
      e.preventDefault();
      if (isPlayingRef.current) handlePause();
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
    if (!lower.endsWith(".mid") && !lower.endsWith(".midi")) {
      notify("Only .mid and .midi files are supported.", "error");
      return;
    }
    await loadMidiFile(file);
  };

  const startBlank = () => {
    handleStop();
    commit({ notes: [], chords: [], totalBars: bars });
    setSelectedNoteIndices(new Set()); setTrackOverrides({}); setFocusedTrack(null); setLoopRegion(null);
    setToolMode("draw"); setScrollAnchorKey(k => k + 1); setFitRequest(k => k + 1); setMobileInspectorOpen(false);
  };
  const hasNotes = !!progression?.notes.length;
  const displayedSynth = tracks.length === 1 ? trackMix[tracks[0].index]?.synthType ?? synthType : synthType;
  return (
    <div className={"workbench" + (!desktopInspectorOpen ? " inspector-collapsed" : "")} onDragEnter={handleDragEnter} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      {isDraggingMidi && <div className="file-drop-overlay"><Upload size={36} /><h2>Drop your MIDI here</h2><p>Your current pattern is recoverable with Undo.</p></div>}
      <TransportBar isPlaying={isPlaying} isPaused={playbackState === "paused"} canPlay={hasNotes} canUndo={canUndo} canRedo={canRedo} isLooping={isLooping} bpm={bpm} currentTick={currentTick}
        onPlay={handlePlay} onPause={handlePause} onStop={handleStop} onUndo={undo} onRedo={redo} onToggleLoop={toggleLooping} onBpmChange={setBpm}
        onLoadFile={loadMidiFile} onExport={handleExport} onClearSavedSession={handleClearSavedSession} onOpenShortcuts={() => setShortcutsOpen(true)} onToggleInspector={toggleInspector} />
      <div className="workspace">
        <Inspector tab={inspectorTab} onTabChange={setInspectorTab} mobileOpen={mobileInspectorOpen} onClose={() => setMobileInspectorOpen(false)}
          compose={<Sidebar root={root} mode={mode} dissonance={dissonance} complexity={complexity} bars={bars} canVary={hasNotes}
            generationMode={generationMode} onGenerationModeChange={setGenerationMode}
            synthType={displayedSynth} multiTrack={tracks.length > 1} onSynthChange={handleSynthChange} onOpenTracks={openTracks}
            onRootChange={setRoot} onModeChange={setMode} onDissonanceChange={setDissonance} onComplexityChange={setComplexity} onBarsChange={setBars}
            onGenerate={handleGenerate} onAddVariation={handleGenerateVariations} onPreviewError={message => notify(message, "error")} />}
          transform={<TransformBar noteCount={editTargets.size} selectedCount={selectedNoteIndices.size} scopeLabel={scopeLabel}
            onQuantize={handleQuantize} onTranspose={handleTranspose} onHumanize={handleHumanize} swingAmount={swingAmount}
            onSwingAmountChange={setSwingAmount} onApplySwing={handleApplySwing} noteLength={noteLength} onNoteLengthChange={setNoteLength}
            onChop={handleChopSelected} onDuplicateBar={handleDuplicateBar} />}
          tracks={<TrackStudio tracks={tracks} mixer={trackMix} defaultSynth={synthType} focusedTrack={visibleFocusedTrack}
            onFocusTrack={handleFocusTrack} onChange={handleTrackChange} onAddTrack={handleAddTrack}
            onRenameTrack={handleRenameTrack} onDuplicateTrack={handleDuplicateTrack} onDeleteTrack={handleDeleteTrack}
            onPreviewError={message => notify(message, "error")} />}
        />
        <main className="editor-main" aria-label="MIDI editor">
          <div className="editor-context"><div className="editor-title"><Music2 size={16} /><h1>Piano roll</h1><span className="context-separator">/</span>
            <span>{progression ? root + " " + mode : "New session"}</span></div>
            <div className="editor-context-right">{progression && <><span className="pattern-length">{progression.totalBars} bars</span>
              <select aria-label="Edit track" value={visibleFocusedTrack ?? "all"} onChange={event => handleFocusTrack(event.target.value === "all" ? null : Number(event.target.value))}>
                <option value="all">All tracks</option>{tracks.map(t => <option key={t.index} value={t.index}>{t.name}</option>)}
              </select></>}
              <span className="time-signature">4/4</span>
            </div>
          </div>
          <EditToolbar toolMode={toolMode} stampType={stampType} noteLength={noteLength} snapResolution={snapResolution} zoomX={zoomX}
            followPlayback={followPlayback} inspectorOpen={desktopInspectorOpen} onToolModeChange={setToolMode} onStampTypeChange={setStampType}
            onNoteLengthChange={setNoteLength} onSnapResolutionChange={setSnapResolution} onZoomChange={setZoomX}
            onToggleFollow={() => setFollowPlayback(f => !f)} onFit={() => setFitRequest(k => k + 1)} onToggleInspector={toggleInspector} />
          <PianoRoll progression={progression} focusedTrack={visibleFocusedTrack} root={root} mode={mode} statusLabel={scopeLabel}
            onGenerate={handleGenerate} onStartBlank={startBlank} onLoadFile={loadMidiFile} selectedIndices={selectedNoteIndices}
            toolMode={toolMode} stampType={stampType} noteLength={noteLength} snapResolution={snapResolution} zoomX={zoomX}
            fitRequest={fitRequest} isPlaying={isPlaying} currentTick={currentTick} followPlayback={followPlayback}
            isLooping={isLooping} loopRegion={loopRegion} onLoopRegionChange={handleLoopRegionChange}
            scrollAnchorKey={scrollAnchorKey} onSelectionChange={setSelectedNoteIndices} commit={commit} onZoomChange={setZoomX}
            onScrub={handleScrub} onScrubStateChange={handleScrubStateChange} onLivePreview={setLivePreview} />
        </main>
      </div>
      <footer className="app-status"><span className="save-status">{saveState === "saved" ? <Check size={12} /> : <HardDrive size={12} />}
        {saveState === "saved" ? "Saved in this browser" : saveState === "unavailable" ? "Autosave unavailable — export to keep your work" : saveState === "cleared" ? "Browser autosave cleared" : "Saving…"}</span>
        <span className="status-hints"><kbd>Space</kbd> Play / pause <i>·</i><kbd>B</kbd> Draw <i>·</i><kbd>V</kbd> Select <i>·</i><kbd>H</kbd> Hand</span>
        <button onClick={() => setShortcutsOpen(true)} aria-label="Open keyboard shortcuts"><kbd>?</kbd><span>Shortcuts</span></button>
      </footer>
      <ShortcutHelp open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <StatusToast notice={notice} onDismiss={() => setNotice(null)} />
    </div>
  );
}
