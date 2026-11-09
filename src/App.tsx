import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Upload, Check, HardDrive, Music2 } from "lucide-react";
import {
  generateSequence,
  ProgressionData,
  NoteEvent,
  type HarmonyConstraint,
  applyVariationToProgression,
  applySwing,
  analyzeKeyFromProgression,
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
import { exportToMidiBlob, parseMidiFile, unsupportedSourceMeters } from "./lib/midi";
import { availableHarmonyChords, generateFromMelody, isAdaptiveTrack, type AccompanimentDensity, type MelodyKeyStrategy,
  type HarmonicPacing } from "./lib/adaptive";
import { generateMotif, type ContinuationBars } from "./lib/motif";
import { toggleChordRegionLock, unlockChordRegions } from "./lib/chordLocks";
import { addHarmonyGuide, removeHarmonyGuide } from "./lib/harmonyGuide";
import { describeHarmonyDifference, generateHarmonyTakes, harmonyStructureSignature, type HarmonyTake } from "./lib/harmonyTakes";
import { isCompatibleTakeBank, removeHarmonyFavorite, restoreHarmonyFavorite,
  saveHarmonyFavorite, type SavedHarmonyTakeBank } from "./lib/takeLibrary";
import type { MelodySourceScope } from "./lib/melodyScope";
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
import { ReplaceProjectDialog } from "./components/ReplaceProjectDialog";

interface HarmonyTakeBatch {
  base: ProgressionData;
  sourceTrackIndex: number;
  takes: HarmonyTake[];
}

type PendingReplacement =
  | {kind: "import"; filename: string; parsed: ProgressionData; fileBpm: number | null}
  | {kind: "generate"};

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
  const [melodySourceMode, setMelodySourceMode] = useState<"scratch" | "follow">(savedSession?.melodySourceMode ?? "scratch");
  const [melodySourceTrackIndex, setMelodySourceTrackIndex] = useState<number | null>(savedSession?.melodySourceTrackIndex ?? null);
  const [melodyPhraseScope, setMelodyPhraseScope] = useState<MelodySourceScope>(savedSession?.melodyPhraseScope ?? "track");
  const [harmonicFit, setHarmonicFit] = useState(savedSession?.harmonicFit ?? 82);
  const [harmonyExploration, setHarmonyExploration] = useState(savedSession?.harmonyExploration ?? 62);
  const [phraseCoherence, setPhraseCoherence] = useState(savedSession?.phraseCoherence ?? 65);
  const [accompanimentDensity, setAccompanimentDensity] = useState<AccompanimentDensity>(savedSession?.accompanimentDensity ?? "balanced");
  const [harmonicPacing, setHarmonicPacing] = useState<HarmonicPacing>(savedSession?.harmonicPacing ?? "adaptive");
  const [melodyKeyStrategy, setMelodyKeyStrategy] = useState<MelodyKeyStrategy>(savedSession?.melodyKeyStrategy ?? "manual");
  const [melodyTask, setMelodyTask] = useState<"harmonize" | "continue" | "reimagine">(savedSession?.melodyTask ?? "harmonize");
  const [motifCreativity, setMotifCreativity] = useState(savedSession?.motifCreativity ?? 46);
  const [continuationBars, setContinuationBars] = useState<ContinuationBars>(savedSession?.continuationBars ?? 4);

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
  // Candidate takes are ephemeral and reference their exact editable base.
  // Preview never enters history, autosave or MIDI export until acceptance.
  const [takeBatch, setTakeBatch] = useState<HarmonyTakeBatch | null>(null);
  const [savedTakeBank, setSavedTakeBank] = useState<SavedHarmonyTakeBank | null>(
    savedSession?.savedHarmonyTakes ?? null);
  const [previewTakeIndex, setPreviewTakeIndex] = useState<number | null>(null);
  const [focusedTrack, setFocusedTrack] = useState<number | null>(null);
  const [trackOverrides, setTrackOverrides] = useState<TrackMix>(
    savedSession?.trackMix ?? {},
  );
  const tracks = useMemo(() => listTracks(progression), [progression]);
  // Named empty tracks and saved chord labels are authored work, even when
  // a composition currently contains no pitched notes.
  const hasExistingContent = !!(progression &&
    (progression.notes.length || progression.chords.length || progression.tracks?.length));
  const visibleFocusedTrack =
    focusedTrack !== null && tracks.some((track) => track.index === focusedTrack)
      ? focusedTrack
      : null;
  const melodyTracks = useMemo(() => {
    const generated = new Set(progression?.tracks?.filter(isAdaptiveTrack).map(track => track.index) ?? []);
    return tracks.filter(track => track.noteCount > 0 && !generated.has(track.index));
  }, [progression, tracks]);
  const effectiveMelodySourceTrackIndex = melodyTracks.some(track => track.index === melodySourceTrackIndex)
    ? melodySourceTrackIndex
    : visibleFocusedTrack !== null && melodyTracks.some(track => track.index === visibleFocusedTrack)
      ? visibleFocusedTrack : melodyTracks[0]?.index ?? null;
  const selectedMelodyNoteCount = [...selectedNoteIndices].filter(index =>
    progression?.notes[index] &&
    trackIndexOf(progression.notes[index]) === effectiveMelodySourceTrackIndex).length;
  const lockedChordCount = progression?.chords.filter(chord =>
    chord.locked && chord.generatedSourceTrackIndex === effectiveMelodySourceTrackIndex).length ?? 0;
  const harmonyGuides = useMemo(() => (progression?.harmonyConstraints ?? [])
    .flatMap((guide, index) => guide.sourceTrackIndex === effectiveMelodySourceTrackIndex
      ? [{ index, guide }] : []), [progression, effectiveMelodySourceTrackIndex]);
  const harmonyChordChoices = useMemo(() => availableHarmonyChords(root, mode, dissonance),
    [root, mode, dissonance]);
  const canExploreTakes = effectiveMelodySourceTrackIndex !== null &&
    (progression?.tracks?.filter(track => track.sourceTrackIndex === effectiveMelodySourceTrackIndex &&
      (track.generatedRole === "bass" || track.generatedRole === "harmony")).length ?? 0) === 2;
  const comparingHarmony = melodySourceMode === "follow" && melodyTask === "harmonize";
  const validTakeBatch = comparingHarmony &&
    takeBatch?.base === progression && takeBatch.sourceTrackIndex === effectiveMelodySourceTrackIndex
    ? takeBatch : null;
  // Only restore favorites for precisely the arrangement they were saved
  // against. Any source edit, lock, guide or generated-note edit invalidates them.
  const validSavedTakeBank = comparingHarmony &&
    isCompatibleTakeBank(progression, effectiveMelodySourceTrackIndex, savedTakeBank)
    ? savedTakeBank : null;
  const takeChoices = useMemo(() => {
    if (!progression || effectiveMelodySourceTrackIndex === null || !comparingHarmony) return [];
    const choices: { take: HarmonyTake; savedId: string | null }[] = [];
    const known = new Set<string>();
    if (validSavedTakeBank) {
      for (const favorite of validSavedTakeBank.favorites) {
        const restored = restoreHarmonyFavorite(progression, validSavedTakeBank, favorite);
        if (!restored) continue;
        const signature = harmonyStructureSignature(restored.progression, effectiveMelodySourceTrackIndex);
        if (!known.has(signature)) { choices.push({ take: restored, savedId: favorite.id }); known.add(signature); }
      }
    }
    for (const take of validTakeBatch?.takes ?? []) {
      const signature = harmonyStructureSignature(take.progression, effectiveMelodySourceTrackIndex);
      if (!known.has(signature)) { choices.push({ take, savedId: null }); known.add(signature); }
    }
    return choices;
  }, [progression, effectiveMelodySourceTrackIndex, comparingHarmony, validSavedTakeBank, validTakeBatch]);
  const previewTake = previewTakeIndex === null ? null : takeChoices[previewTakeIndex]?.take ?? null;
  const displayProgression = previewTake?.progression ?? progression;
  const displayRoot = previewTake?.root ?? root;
  const displayMode = previewTake?.mode ?? mode;
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
  // Studio chrome is a workspace preference, separate from the musical session.
  const [inspectorWidth, setInspectorWidth] = useState(() => {
    try {
      const stored = Number(window.localStorage.getItem("midi-spark:inspector-width"));
      return stored >= 270 && stored <= 420 ? stored : 312;
    } catch {
      return 312;
    }
  });
  useEffect(() => {
    try { window.localStorage.setItem("midi-spark:inspector-width", String(inspectorWidth)); }
    catch { /* The studio remains usable with storage blocked. */ }
  }, [inspectorWidth]);
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
  const [pendingReplacement, setPendingReplacement] = useState<PendingReplacement | null>(null);
  const importRevision = useRef(0);
  const noticeSequence = useRef(0);

  const notify = useCallback((message: string, kind: NoticeKind = "info") => {
    setNotice(previous => previous?.kind === "error" && kind === "error" &&
      previous.message === message
      ? previous : { id: ++noticeSequence.current, message, kind });
  }, []);

  useEffect(() => {
    if (!notice || notice.kind === "error") return;
    const timeout = setTimeout(() => {
      setNotice((current) => current?.id === notice.id ? null : current);
    }, 4200);
    return () => clearTimeout(timeout);
  }, [notice]);

  const isPlayingRef = useRef(false);
  const playbackStateRef = useRef<"stopped" | "playing" | "paused">("stopped");
  const playRequest = useRef(0);
  const startingAudio = useRef(false);
  const sequenceEndRef = useRef(0);
  useEffect(() => { sequenceEndRef.current = displayProgression ? sequenceEndQuarters(displayProgression) : 0; }, [displayProgression]);
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
        melodySourceMode,
        melodySourceTrackIndex,
        melodyPhraseScope,
        harmonicFit,
        harmonyExploration,
        phraseCoherence,
        accompanimentDensity,
        harmonicPacing,
        melodyKeyStrategy,
        melodyTask,
        motifCreativity,
        continuationBars,
        synthType,
        snapResolution,
        noteLength,
        zoomX,
        trackMix,
        isLooping,
        loopRegion,
        ...(validSavedTakeBank ? { savedHarmonyTakes: validSavedTakeBank } : {}),
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
    melodySourceMode,
    melodySourceTrackIndex,
    melodyPhraseScope,
    harmonicFit,
    harmonyExploration,
    phraseCoherence,
    accompanimentDensity,
    harmonicPacing,
    melodyKeyStrategy,
    melodyTask,
    motifCreativity,
    continuationBars,
    synthType,
    snapResolution,
    noteLength,
    zoomX,
    trackMix,
    isLooping,
    loopRegion,
    validSavedTakeBank,
  ]);

  // Keep the audio engine in sync with edits (including live drag previews),
  // BPM changes, and loop toggles while the transport is running.
  useEffect(() => {
    if (playbackState !== "stopped" && displayProgression) {
      updateProgressionLive(livePreview ?? displayProgression, bpm, isLooping, loopRegion);
    }
  }, [displayProgression, livePreview, bpm, playbackState, isLooping, loopRegion]);

  // ----- Transport -----

  const handlePlay = useCallback(async () => {
    if (playbackStateRef.current === "paused") {
      resumeAudio();
      playbackStateRef.current = "playing";
      isPlayingRef.current = true;
      setPlaybackState("playing");
      return;
    }
    if (playbackStateRef.current === "playing" || !displayProgression?.notes.length || startingAudio.current) return;
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
    const endTick = sequenceEndQuarters(displayProgression);
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
      displayProgression,
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
  }, [displayProgression, bpm, currentTick, loopRegion, notify]);

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
    if (updated.notes.length === 0 && playbackStateRef.current !== "stopped") {
      handleStop();
    }
    commit(updated);
    setSelectedNoteIndices(new Set());
    setFocusedTrack(previous => previous === index ? null : previous);
    // Retain session-local overrides for Undo; nextTrackIndex prevents accidental reuse.
    notify("Track removed. Undo restores its notes and metadata.", "info");
  }, [progression, commit, notify, handleStop]);

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

  const handleToggleChordLock = useCallback((index: number) => {
    const chord = progression?.chords[index];
    if (!chord || chord.generatedSourceTrackIndex === undefined) return;
    commit(prev => prev ? toggleChordRegionLock(prev, index) : prev);
    notify((chord.locked ? "Unlocked " : "Locked ") + chord.name +
      (chord.locked ? " for regeneration." : " and its accompaniment. Undo to restore."), "success");
  }, [progression, commit, notify]);

  const handleUnlockAllChords = useCallback(() => {
    if (effectiveMelodySourceTrackIndex === null || lockedChordCount === 0) return;
    const sourceIndex = effectiveMelodySourceTrackIndex;
    commit(prev => prev ? unlockChordRegions(prev, sourceIndex) : prev);
    notify("Unlocked " + lockedChordCount + " chord regions. Undo restores them.", "info");
  }, [effectiveMelodySourceTrackIndex, lockedChordCount, commit, notify]);

  const handleAddHarmonyGuide = useCallback((bar: number, chord: string, kind: HarmonyConstraint["kind"]) => {
    if (!progression || effectiveMelodySourceTrackIndex === null) {
      notify("Choose a source melody track before adding a chord guide.", "error");
      return;
    }
    const edit = addHarmonyGuide(progression, {
      sourceTrackIndex: effectiveMelodySourceTrackIndex, bar, kind, chord,
    });
    if (!edit.ok) { notify(edit.reason, "error"); return; }
    if (edit.progression === progression) {
      notify("That chord guide is already in place.", "info");
      return;
    }
    commit(edit.progression);
    notify((kind === "require" ? "Pinned " : "Excluded ") + chord +
      " in bar " + (bar + 1) + ". Generate again to apply. Undo restores the guide.", "success");
  }, [progression, effectiveMelodySourceTrackIndex, commit, notify]);

  const handleRemoveHarmonyGuide = useCallback((index: number) => {
    const guide = progression?.harmonyConstraints?.[index];
    if (!progression || !guide || guide.sourceTrackIndex !== effectiveMelodySourceTrackIndex) return;
    commit(removeHarmonyGuide(progression, index));
    notify("Removed the chord guide. Undo restores it.", "info");
  }, [progression, effectiveMelodySourceTrackIndex, commit, notify]);

  const handleExploreHarmonyTakes = useCallback(() => {
    if (!progression || effectiveMelodySourceTrackIndex === null || !canExploreTakes) {
      notify("Harmonize the selected melody once before comparing takes.", "error");
      return;
    }
    const options = {
      sourceTrackIndex: effectiveMelodySourceTrackIndex,
      root, mode, tension: dissonance, harmonicFit, harmonyExploration,
      phraseCoherence, density: accompanimentDensity, keyStrategy: melodyKeyStrategy,
      harmonicPacing,
      sourceScope: melodyPhraseScope,
      sourceNoteIndices: [...selectedNoteIndices],
      sourceLoopRange: loopRegion,
    };
    // A new click brings spontaneous material; each candidate itself has a
    // fully reproducible seed, and all are computed against the same base.
    const baseSeed = Math.floor(Math.random() * 0x100000000);
    const seeds = Array.from({ length: 18 }, (_, i) =>
      (baseSeed + Math.imul(i + 1, 0x9e3779b9)) >>> 0);
    const result = generateHarmonyTakes(progression, options, seeds, 3);
    if (!result.ok) { notify(result.reason, "error"); return; }
    handleStop();
    setLivePreview(null);
    setTakeBatch({ base: progression, sourceTrackIndex: effectiveMelodySourceTrackIndex,
      takes: result.takes });
    setPreviewTakeIndex(0);
    setFitRequest(n => n + 1);
    notify("Found " + result.takes.length +
      " structurally distinct harmony takes. Previewing Take 1; your original is untouched.", "success");
  }, [progression, effectiveMelodySourceTrackIndex, canExploreTakes, root, mode, dissonance,
    harmonicFit, harmonyExploration, phraseCoherence, accompanimentDensity,
    melodyKeyStrategy, harmonicPacing, melodyPhraseScope, selectedNoteIndices,
    loopRegion, handleStop, notify]);

  const handleSelectHarmonyTake = useCallback((index: number | null) => {
    if (!validTakeBatch || (index !== null &&
      (!Number.isInteger(index) || index < 0 || index >= validTakeBatch.takes.length))) return;
    handleStop();
    setLivePreview(null);
    setPreviewTakeIndex(index);
    setFitRequest(n => n + 1);
  }, [validTakeBatch, handleStop]);

  const handleAcceptHarmonyTake = useCallback(() => {
    if (!previewTake || !validTakeBatch) return;
    handleStop();
    commit(previewTake.progression);
    if (melodyKeyStrategy === "detect") {
      setRoot(previewTake.root);
      setMode(previewTake.mode);
    }
    setTakeBatch(null);
    setPreviewTakeIndex(null);
    setSelectedNoteIndices(new Set());
    setFitRequest(n => n + 1);
    notify("Accepted the harmony take as one undoable edit. Your melody and track routing are preserved.", "success");
  }, [previewTake, validTakeBatch, melodyKeyStrategy, handleStop, commit, notify]);

  const handleDiscardHarmonyTakes = useCallback(() => {
    handleStop();
    setLivePreview(null);
    setTakeBatch(null);
    setPreviewTakeIndex(null);
    notify("Discarded take previews. Your original working arrangement is unchanged.", "info");
  }, [handleStop, notify]);

  /** New compositions are deliberately separate from melody-conditioned
   * generation: only this path can replace the entire project. */
  const generateScratch = useCallback(() => {
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
  }, [root, mode, bars, dissonance, complexity, generationMode,
    synthType, commit, notify, handleStop]);

  const handleGenerate = useCallback(() => {
    if (previewTake) {
      notify("Accept the preview or return to Original before regenerating.", "info");
      return;
    }
    if (melodySourceMode === "follow") {
      if (!progression || effectiveMelodySourceTrackIndex === null) {
        notify("Draw or import a melody, then choose its track.", "error");
        return;
      }
      const selectionScope = {
        sourceScope: melodyPhraseScope,
        sourceNoteIndices: [...selectedNoteIndices],
        sourceLoopRange: loopRegion,
      };
      const preserveSelection = (nextProgression: ProgressionData) => {
        if (melodyPhraseScope !== "selected") {
          setSelectedNoteIndices(new Set());
          return;
        }
        const chosen = new Set([...selectedNoteIndices].map(i => progression.notes[i]));
        setSelectedNoteIndices(new Set(nextProgression.notes.flatMap((note, index) =>
          chosen.has(note) ? [index] : [])));
      };
      if (melodyTask === "continue" || melodyTask === "reimagine") {
        const result = generateMotif(progression, {
          ...selectionScope,
          sourceTrackIndex: effectiveMelodySourceTrackIndex,
          operation: melodyTask === "continue" ? "continue" : "variation",
          root, mode, keyStrategy: melodyKeyStrategy,
          creativity: motifCreativity, continuationBars,
        });
        if (!result.ok) {
          notify(result.reason, "error");
          return;
        }
        handleStop();
        commit(result.progression);
        preserveSelection(result.progression);
        // A new variation is auditioned in solo mode so the unchanged original
        // isn't played simultaneously. Its solo state remains user-adjustable.
        const sourcePreset = trackMix[effectiveMelodySourceTrackIndex]?.synthType ?? synthType;
        setTrackOverrides(previous => {
          if (previous[result.generatedTrackIndex]) return previous;
          return {...previous, [result.generatedTrackIndex]: {
            ...defaultTrackSettings(result.generatedTrackIndex, sourcePreset),
            synthType: sourcePreset,
            solo: melodyTask === "reimagine",
          }};
        });
        if (result.detectedKey) {
          setRoot(result.root);
          setMode(result.mode);
        }
        setFocusedTrack(null);
        if (melodyPhraseScope !== "loop") setLoopRegion(null);
        setCurrentTick(0);
        setFitRequest(k => k + 1);
        setMobileInspectorOpen(false);
        notify((melodyTask === "continue" ? "Continued" : "Reimagined") +
          " the source melody on its own editable track (" + result.generatedNoteCount +
          " notes)." + (melodyTask === "reimagine"
            ? " The variation is soloed for comparison; adjust in Tracks."
            : " Source notes remain unchanged."), "success");
        return;
      }
      const result = generateFromMelody(progression, {
        ...selectionScope,
        sourceTrackIndex: effectiveMelodySourceTrackIndex,
        root, mode, tension: dissonance, harmonicFit, harmonyExploration, phraseCoherence,
        density: accompanimentDensity, keyStrategy: melodyKeyStrategy, harmonicPacing,
      });
      if (!result.ok) {
        notify(result.reason, "error");
        return;
      }
      handleStop();
      commit(result.progression);
      preserveSelection(result.progression);
      // Never overwrite a user's mixer changes when regenerating existing parts.
      setTrackOverrides(previous => {
        const next = { ...previous };
        result.generatedTrackIndices.forEach((index, i) => {
          if (next[index] === undefined) {
            const preset = i === 0 ? "sub" : synthType === "sub" ? "epiano" : synthType;
            next[index] = defaultTrackSettings(index, preset);
          }
        });
        return next;
      });
      if (result.usedDetectedKey) {
        setRoot(result.root);
        setMode(result.mode);
      }
      setFocusedTrack(null);
      // Keep Compose visible so users can rapidly audition alternative harmonies.
      setCurrentTick(0);
      setFitRequest(k => k + 1);
      setMobileInspectorOpen(false);
      notify("Generated melody-aware Bass + Harmony in " + result.root + " " + result.mode +
        (melodyKeyStrategy === "detect" && result.keyWasAmbiguous ? " (key uncertain; using Compose key)." : ".") +
        (result.alternativesConsidered !== undefined
          ? " Explored " + result.alternativesConsidered + " credible chord paths." : "") +
        " Original melody preserved.", "success");
      return;
    }
    if (hasExistingContent) {
      setPendingReplacement({kind: "generate"});
      return;
    }
    generateScratch();
  }, [root, mode, dissonance, synthType, commit, notify, handleStop,
    progression, effectiveMelodySourceTrackIndex, melodySourceMode, harmonicFit, accompanimentDensity, melodyKeyStrategy,
    melodyTask, motifCreativity, continuationBars, trackMix, harmonicPacing,
    harmonyExploration, phraseCoherence, melodyPhraseScope, selectedNoteIndices, loopRegion, generateScratch, hasExistingContent, previewTake]);

  const handleGenerateVariations = useCallback(() => {
    if (melodySourceMode === "follow") {
      handleGenerate();
      return;
    }
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
  }, [progression, dissonance, complexity, root, mode, commit, notify, melodySourceMode, handleGenerate]);

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
    notify("MIDI exported: notes and GM programs only. Browser synth sounds are not embedded in .mid files.", "success");
  }, [progression, bpm, root, mode, notify]);

  /** Parsing completes before replacing anything. Invalid files and Cancel
   * leave the entire in-memory score, track mixer and loop untouched. */
  const applyImportedMidi = useCallback((parsed: ProgressionData, fileBpm: number | null, fileName: string) => {
    const key = analyzeKeyFromProgression(parsed);
    setRoot(key.best.root);
    setMode(key.best.mode);
    if (fileBpm !== null && Number.isFinite(fileBpm)) {
      setBpm(clamp(Math.round(fileBpm), MIN_BPM, MAX_BPM));
    }
    handleStop();
    commit(parsed);
    setSelectedNoteIndices(new Set());
    setTrackOverrides({});
    setFocusedTrack(null);
    setMelodySourceTrackIndex(null);
    setLoopRegion(null);
    setCurrentTick(0);
    setScrollAnchorKey(k => k + 1);
    setFitRequest(k => k + 1);
    setMobileInspectorOpen(false);
    if (listTracks(parsed).length > 1) setInspectorTab("tracks");
    const alternative = key.alternatives[0];
    const keyLabel = key.best.root + " " + key.best.mode;
    const keyDetail = key.ambiguous
      ? " · Key uncertain: " + keyLabel +
        (alternative ? " (also " + alternative.root + " " + alternative.mode + ")" : "") +
        ". Adjust in Compose."
      : " · Estimated key: " + keyLabel + ".";
    const unsupportedMeters = unsupportedSourceMeters(parsed);
    notify("Imported " + fileName + " · " + parsed.notes.length + " notes" + keyDetail +
      (unsupportedMeters.length ? " Source meter " + unsupportedMeters.join(", ") +
        " is shown on a 4/4 editor grid." : ""), unsupportedMeters.length ? "info" : "success");
  }, [commit, notify, handleStop]);

  const loadMidiFile = useCallback(async (file: File) => {
    const revision = ++importRevision.current;
    try {
      const {progression: parsed, bpm: fileBpm} = await parseMidiFile(file);
      if (revision !== importRevision.current) return;
      if (parsed.notes.length === 0) {
        notify("This MIDI file contains no melodic notes to import.", "error");
        return;
      }
      if (hasExistingContent) {
        setPendingReplacement({kind:"import", filename:file.name, parsed, fileBpm});
      } else {
        applyImportedMidi(parsed, fileBpm, file.name);
      }
    } catch (err) {
      if (revision !== importRevision.current) return;
      console.error(err);
      notify("Couldn't read this MIDI file. Try another .mid or .midi file.", "error");
    }
  }, [applyImportedMidi, notify, hasExistingContent]);

  const confirmReplacement = useCallback(() => {
    const request = pendingReplacement;
    setPendingReplacement(null);
    if (!request) return;
    if (request.kind === "import") applyImportedMidi(request.parsed, request.fileBpm, request.filename);
    else generateScratch();
  }, [pendingReplacement, applyImportedMidi, generateScratch]);

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
    if (target?.closest('button, summary, a[href], [role="tab"], [role="button"], [role="listbox"], [role="slider"], [role="spinbutton"], [role="menuitem"]') &&
        !target.closest('[data-testid="piano-note"]')) return;
    // When auditioning, the score is a read-only candidate. Keep Space as
    // transport, Escape as Return to Original, but never dispatch editing,
    // history or regeneration shortcuts against the saved base score.
    if (previewTake) {
      if (e.key === "Escape") {
        e.preventDefault(); handleSelectHarmonyTake(null); return;
      }
      if (e.code !== "Space") {
        if (e.ctrlKey || e.metaKey || e.key === "Delete" || e.key === "Backspace")
          e.preventDefault();
        return;
      }
    }
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
    setSelectedNoteIndices(new Set()); setTrackOverrides({}); setFocusedTrack(null); setMelodySourceTrackIndex(null); setLoopRegion(null);
    setToolMode("draw"); setScrollAnchorKey(k => k + 1); setFitRequest(k => k + 1); setMobileInspectorOpen(false);
  };
  const hasNotes = !!displayProgression?.notes.length;
  const unsupportedMeters = progression ? unsupportedSourceMeters(progression) : [];
  const displayedSynth = tracks.length === 1 ? trackMix[tracks[0].index]?.synthType ?? synthType : synthType;
  return (
    <div className={"workbench" + (!desktopInspectorOpen ? " inspector-collapsed" : "")} style={{ "--inspector-width": inspectorWidth + "px" } as CSSProperties} onDragEnter={handleDragEnter} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      {isDraggingMidi && <div className="file-drop-overlay"><Upload size={36} /><h2>Drop your MIDI here</h2><p>Your current pattern is recoverable with Undo.</p></div>}
      <TransportBar isPlaying={isPlaying} isPaused={playbackState === "paused"} canPlay={hasNotes}
        canUndo={canUndo && !previewTake} canRedo={canRedo && !previewTake}
        isLooping={isLooping} bpm={bpm} currentTick={currentTick}
        onPlay={handlePlay} onPause={handlePause} onStop={handleStop} onUndo={undo} onRedo={redo} onToggleLoop={toggleLooping} onBpmChange={setBpm}
        onLoadFile={loadMidiFile} onExport={() => previewTake
          ? notify("Accept the auditioned take before exporting its MIDI; this project is still unchanged.", "info")
          : handleExport()}
        onClearSavedSession={handleClearSavedSession} onOpenShortcuts={() => setShortcutsOpen(true)} onToggleInspector={toggleInspector} />
      <div className="workspace">
        <Inspector tab={inspectorTab} onTabChange={setInspectorTab} mobileOpen={mobileInspectorOpen} onClose={() => setMobileInspectorOpen(false)}
          onToggle={toggleInspector} width={inspectorWidth} onResize={setInspectorWidth}
          compose={<Sidebar root={root} mode={mode} dissonance={dissonance} complexity={complexity} bars={bars} canVary={hasNotes}
            generationMode={generationMode} onGenerationModeChange={setGenerationMode}
            melodySourceMode={melodySourceMode} onMelodySourceModeChange={setMelodySourceMode}
            melodyTracks={melodyTracks} melodyBarCount={progression?.totalBars ?? null}
            melodySourceTrackIndex={effectiveMelodySourceTrackIndex}
            melodyPhraseScope={melodyPhraseScope} onMelodyPhraseScopeChange={setMelodyPhraseScope}
            selectedMelodyNoteCount={selectedMelodyNoteCount} hasExplicitLoop={loopRegion !== null}
            sourceLoopRange={loopRegion} onSourceLoopRangeChange={setLoopRegion}
            onMelodySourceTrackChange={setMelodySourceTrackIndex}
            harmonicFit={harmonicFit} onHarmonicFitChange={setHarmonicFit}
            harmonyExploration={harmonyExploration} onHarmonyExplorationChange={setHarmonyExploration}
            phraseCoherence={phraseCoherence} onPhraseCoherenceChange={setPhraseCoherence}
            lockedChordCount={lockedChordCount} onUnlockAllChords={handleUnlockAllChords}
            harmonyGuides={harmonyGuides} availableHarmonyChords={harmonyChordChoices}
            onAddHarmonyGuide={handleAddHarmonyGuide} onRemoveHarmonyGuide={handleRemoveHarmonyGuide}
            canExploreTakes={canExploreTakes} takeViews={validTakeBatch?.takes.map((take, i) => ({
              label: "Take " + (i + 1), changedRegions: take.changedRegions,
              chordSummary: take.chordSummary,
            })) ?? []}
            previewTakeIndex={validTakeBatch ? previewTakeIndex : null}
            onExploreTakes={handleExploreHarmonyTakes} onSelectTake={handleSelectHarmonyTake}
            onAcceptTake={handleAcceptHarmonyTake} onDiscardTakes={handleDiscardHarmonyTakes}
            accompanimentDensity={accompanimentDensity} onAccompanimentDensityChange={setAccompanimentDensity}
            harmonicPacing={harmonicPacing} onHarmonicPacingChange={setHarmonicPacing}
            melodyKeyStrategy={melodyKeyStrategy} onMelodyKeyStrategyChange={setMelodyKeyStrategy}
            melodyTask={melodyTask} onMelodyTaskChange={setMelodyTask}
            motifCreativity={motifCreativity} onMotifCreativityChange={setMotifCreativity}
            continuationBars={continuationBars} onContinuationBarsChange={setContinuationBars}
            synthType={displayedSynth} multiTrack={tracks.length > 1} onSynthChange={handleSynthChange} onOpenTracks={openTracks}
            onRootChange={setRoot} onModeChange={setMode} onDissonanceChange={setDissonance} onComplexityChange={setComplexity} onBarsChange={setBars}
            onGenerate={handleGenerate} onAddVariation={handleGenerateVariations} onPreviewError={message => notify(message, "error")} />}
          transform={<TransformBar noteCount={editTargets.size} selectedCount={selectedNoteIndices.size} scopeLabel={scopeLabel}
            onQuantize={handleQuantize} onTranspose={handleTranspose} onHumanize={handleHumanize} swingAmount={swingAmount}
            onSwingAmountChange={setSwingAmount} onApplySwing={handleApplySwing} noteLength={noteLength} onNoteLengthChange={setNoteLength}
            onChop={handleChopSelected} onDuplicateBar={handleDuplicateBar} />}
          tracks={<TrackStudio tracks={tracks} mixer={trackMix}
            midiPrograms={Object.fromEntries((progression?.tracks ?? []).map(track => [
              track.index, track.program ?? null,
            ]))}
            defaultSynth={synthType} focusedTrack={visibleFocusedTrack}
            onFocusTrack={handleFocusTrack} onChange={handleTrackChange} onAddTrack={handleAddTrack}
            onRenameTrack={handleRenameTrack} onDuplicateTrack={handleDuplicateTrack} onDeleteTrack={handleDeleteTrack}
            onPreviewError={message => notify(message, "error")} />}
        />
        <main className={"editor-main" + (previewTake ? " take-preview-active" : "")}
          inert={!!previewTake} aria-label="MIDI editor">
          <div className="editor-context"><div className="editor-title"><Music2 size={16} /><h1>Piano roll</h1><span className="context-separator">/</span>
            <span>{displayProgression ? displayRoot + " " + displayMode : "New session"}</span>
            {previewTake && <span className="take-preview-label" aria-hidden="true">
              Auditioning Take {(previewTakeIndex ?? 0) + 1} · Read only
            </span>}</div>
            <div className="editor-context-right">{progression && <><span className="pattern-length">{progression.totalBars} bars</span>
              <select aria-label="Edit track" value={visibleFocusedTrack ?? "all"} onChange={event => handleFocusTrack(event.target.value === "all" ? null : Number(event.target.value))}>
                <option value="all">All tracks</option>{tracks.map(t => <option key={t.index} value={t.index}>{t.name}</option>)}
              </select>
              <strong className="edit-target-indicator" aria-live="polite" title={
                visibleFocusedTrack === null
                  ? "Viewing all tracks. New notes go to " + (tracks[0]?.name ?? "Track 1")
                  : "Editing only " + (tracks.find(t => t.index === visibleFocusedTrack)?.name ?? "selected track")}>
                {visibleFocusedTrack === null
                  ? "New → " + (tracks[0]?.name ?? "Track 1")
                  : "Edit: " + (tracks.find(t => t.index === visibleFocusedTrack)?.name ?? "Track")}
              </strong></>}
              <span className="time-signature" title="The editor uses four quarter notes per bar, regardless of the original MIDI meter">4/4 editor grid</span>
            </div>
          </div>
          {unsupportedMeters.length > 0 && <p className="meter-import-warning" role="status">
            <strong>Imported meter: {progression?.sourceTimeSignatures?.join(", ")}.</strong>{" "}
            Notes retain their quarter-note timing, but the editor uses 4/4 bars; original measure boundaries and time signatures are not preserved on export.
          </p>}
          <EditToolbar toolMode={toolMode} stampType={stampType} noteLength={noteLength} snapResolution={snapResolution} zoomX={zoomX}
            followPlayback={followPlayback} inspectorOpen={desktopInspectorOpen} onToolModeChange={setToolMode} onStampTypeChange={setStampType}
            onNoteLengthChange={setNoteLength} onSnapResolutionChange={setSnapResolution} onZoomChange={setZoomX}
            onToggleFollow={() => setFollowPlayback(f => !f)} onFit={() => setFitRequest(k => k + 1)} onToggleInspector={toggleInspector} />
          <PianoRoll progression={displayProgression} focusedTrack={visibleFocusedTrack}
            root={displayRoot} mode={displayMode} statusLabel={scopeLabel}
            onGenerate={handleGenerate} onStartBlank={startBlank} onLoadFile={loadMidiFile}
            selectedIndices={previewTake ? new Set<number>() : selectedNoteIndices}
            toolMode={toolMode} stampType={stampType} noteLength={noteLength} snapResolution={snapResolution} zoomX={zoomX}
            fitRequest={fitRequest} isPlaying={isPlaying} currentTick={currentTick} followPlayback={followPlayback}
            isLooping={isLooping} loopRegion={loopRegion} onLoopRegionChange={handleLoopRegionChange}
            onToggleChordLock={handleToggleChordLock}
            scrollAnchorKey={scrollAnchorKey} onSelectionChange={setSelectedNoteIndices} commit={commit} onZoomChange={setZoomX}
            onScrub={handleScrub} onScrubStateChange={handleScrubStateChange} onLivePreview={setLivePreview}
            onAudioPreviewError={message => notify(message, "error")} />
        </main>
      </div>
      <footer className="app-status"><span className="save-status">{saveState === "saved" ? <Check size={12} /> : <HardDrive size={12} />}
        {saveState === "saved" ? "Saved in this browser" : saveState === "unavailable" ? "Autosave unavailable — export to keep your work" : saveState === "cleared" ? "Browser autosave cleared" : "Saving…"}</span>
        <span className="status-hints"><kbd>Space</kbd> Play / pause <i>·</i><kbd>B</kbd> Draw <i>·</i><kbd>V</kbd> Select <i>·</i><kbd>H</kbd> Hand</span>
        <button onClick={() => setShortcutsOpen(true)} aria-label="Open keyboard shortcuts"><kbd>?</kbd><span>Shortcuts</span></button>
      </footer>
      {pendingReplacement && <ReplaceProjectDialog
        operation={pendingReplacement.kind}
        existingNotes={progression?.notes.length ?? 0}
        existingTracks={tracks.length}
        incomingSummary={pendingReplacement.kind === "import"
          ? pendingReplacement.parsed.notes.length + " notes · " +
            listTracks(pendingReplacement.parsed).length + " tracks (" + pendingReplacement.filename + ")"
          : bars + " bars · " + (generationMode === "layers" ? "Bass + Harmony" : "single track")}
        onCancel={() => setPendingReplacement(null)}
        onConfirm={confirmReplacement}
      />}
      <ShortcutHelp open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <StatusToast notice={notice} onDismiss={() => setNotice(null)} />
    </div>
  );
}
