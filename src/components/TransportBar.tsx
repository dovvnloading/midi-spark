import { useRef } from "react";
import {
  Download,
  Keyboard,
  Play,
  Repeat,
  Square,
  Trash2,
  Undo2,
  Redo2,
  Upload,
  PanelTop,
} from "lucide-react";
import { CustomDropdown } from "./CustomDropdown";
import { DraggableNumberInput } from "./DraggableNumberInput";
import { MIN_BPM, MAX_BPM, SYNTH_OPTIONS } from "../lib/constants";
import type { SynthType } from "../lib/audio";

export interface TransportBarProps {
  isPlaying: boolean;
  canPlay: boolean;
  canUndo: boolean;
  canRedo: boolean;
  followPlayback: boolean;
  isLooping: boolean;
  bpm: number;
  synthType: SynthType;
  multiTrack: boolean;
  onPlay: () => void;
  onStop: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleFollow: () => void;
  onToggleLoop: () => void;
  onBpmChange: (bpm: number) => void;
  onSynthChange: (synth: SynthType) => void;
  onLoadFile: (file: File) => void;
  onExport: () => void;
  onClearSavedSession: () => void;
  onOpenShortcuts: () => void;
}

export function TransportBar({
  isPlaying,
  canPlay,
  canUndo,
  canRedo,
  followPlayback,
  isLooping,
  bpm,
  synthType,
  multiTrack,
  onPlay,
  onStop,
  onUndo,
  onRedo,
  onToggleFollow,
  onToggleLoop,
  onBpmChange,
  onSynthChange,
  onLoadFile,
  onExport,
  onClearSavedSession,
  onOpenShortcuts,
}: TransportBarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      role="region"
      aria-label="Transport and file controls. Scroll horizontally for additional controls."
      tabIndex={0}
      className="hardware-panel toolbar-scroll sticky top-0 z-50 mx-auto w-full max-w-6xl min-w-0 shrink-0 overflow-x-auto"
    >
      <div className="flex h-[70px] min-w-max items-center justify-between gap-5 px-3 sm:px-4">
        <div className="flex shrink-0 items-center gap-3">
          <div role="group" aria-label="Playback" className="flex items-center gap-2">
            <button
              type="button"
              onClick={isPlaying ? onStop : onPlay}
              disabled={!isPlaying && !canPlay}
              aria-label={isPlaying ? "Stop playback (Space)" : "Play sequence (Space)"}
              title={isPlaying ? "Stop (Space)" : "Play (Space)"}
              className={
                "hardware-btn h-11 w-11 shrink-0 rounded-[11px] " +
                (isPlaying
                  ? "border-[#6a4655] bg-[#412b37] text-rose-300 hover:text-white"
                  : "hardware-btn-primary")
              }
            >
              {isPlaying
                ? <Square size={15} fill="currentColor" aria-hidden="true" />
                : <Play size={17} fill="currentColor" aria-hidden="true" />}
            </button>
            <div className="min-w-[85px] px-1">
              <p className="studio-kicker">Transport</p>
              <p className="mt-0.5 text-xs font-semibold text-[var(--text-main)]">
                {isPlaying ? "Playing" : canPlay ? "Ready" : "No pattern"}
              </p>
            </div>
          </div>

          <div className="studio-separator mx-1" aria-hidden="true" />

          <div role="group" aria-label="Edit history" className="flex items-center gap-1">
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              aria-label="Undo (Ctrl+Z)"
              title="Undo (Ctrl+Z)"
              className="hardware-btn studio-quiet-btn h-9 w-9"
            >
              <Undo2 size={17} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              aria-label="Redo (Ctrl+Y)"
              title="Redo (Ctrl+Y)"
              className="hardware-btn studio-quiet-btn h-9 w-9"
            >
              <Redo2 size={17} aria-hidden="true" />
            </button>
          </div>

          <div className="studio-separator mx-1" aria-hidden="true" />

          <div role="group" aria-label="Playback behavior" className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onToggleLoop}
              aria-pressed={isLooping}
              aria-label="Loop playback"
              title="Loop playback"
              className={
                "hardware-btn h-9 gap-2 px-3 text-xs " +
                (isLooping ? "studio-tool-active" : "studio-quiet-btn")
              }
            >
              <Repeat size={15} aria-hidden="true" />
              Loop
            </button>
            <button
              type="button"
              onClick={onToggleFollow}
              aria-pressed={followPlayback}
              aria-label="Follow playhead"
              title="Automatically scroll with playback"
              className={
                "hardware-btn h-9 gap-2 px-3 text-xs " +
                (followPlayback ? "studio-tool-active" : "studio-quiet-btn")
              }
            >
              <PanelTop size={15} aria-hidden="true" />
              Follow
            </button>
          </div>

          <div className="studio-separator mx-1" aria-hidden="true" />

          <div className="flex items-center gap-3">
            <div className="flex flex-col gap-1">
              <span className="studio-kicker">Tempo</span>
              <DraggableNumberInput
                label="BPM"
                className="h-9 w-[100px]"
                value={bpm}
                min={MIN_BPM}
                max={MAX_BPM}
                step={1}
                onChange={onBpmChange}
              />
            </div>
            {multiTrack ? (
              <div className="flex min-w-[125px] flex-col gap-1">
                <span className="studio-kicker">Sound</span>
                <span
                  className="text-[11px] font-medium text-[var(--text-muted)]"
                  title="Change individual track instruments in Track Studio."
                >
                  Per-track instruments
                </span>
              </div>
            ) : (
              <div className="flex w-[170px] flex-col gap-1">
                <span className="studio-kicker">Instrument</span>
                <CustomDropdown
                  ariaLabel="Instrument preset"
                  options={SYNTH_OPTIONS.map((option) => ({
                    label: option.label,
                    value: option.value,
                  }))}
                  value={synthType}
                  onChange={(value) => onSynthChange(value as SynthType)}
                />
              </div>
            )}
          </div>
        </div>

        <div role="group" aria-label="Project actions" className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onOpenShortcuts}
            aria-label="Keyboard shortcuts (?)"
            title="Keyboard shortcuts (?)"
            className="hardware-btn studio-quiet-btn h-10 w-10"
          >
            <Keyboard size={17} aria-hidden="true" />
          </button>
          <div className="studio-separator mx-1" aria-hidden="true" />
          <input
            type="file"
            accept=".mid,.midi"
            ref={fileInputRef}
            className="hidden"
            tabIndex={-1}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onLoadFile(file);
              event.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="hardware-btn h-10 px-3.5 text-xs"
          >
            <Upload size={15} aria-hidden="true" />
            Import
          </button>
          <button
            type="button"
            onClick={onClearSavedSession}
            aria-label="Clear saved browser session"
            title="Clear autosaved browser session (keeps current work in this tab)"
            className="hardware-btn studio-quiet-btn h-10 w-10"
          >
            <Trash2 size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onExport}
            disabled={!canPlay}
            className="hardware-btn hardware-btn-primary h-10 px-4 text-xs"
          >
            <Download size={15} aria-hidden="true" />
            Export MIDI
          </button>
        </div>
      </div>
    </div>
  );
}
