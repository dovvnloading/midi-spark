import { useRef } from "react";
import { Play, Repeat, Square, Trash2, Undo2, Redo2, Keyboard } from "lucide-react";
import { CustomDropdown } from "./CustomDropdown";
import { DraggableNumberInput } from "./DraggableNumberInput";
import { MIN_BPM, MAX_BPM, SYNTH_OPTIONS } from "../lib/constants";
import { SynthType } from "../lib/audio";

export interface TransportBarProps {
  isPlaying: boolean;
  canPlay: boolean;
  canUndo: boolean;
  canRedo: boolean;
  followPlayback: boolean;
  isLooping: boolean;
  bpm: number;
  synthType: SynthType;
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
      aria-label="Transport controls. Scroll horizontally for more actions."
      tabIndex={0}
      className="w-full max-w-6xl mx-auto min-w-0 overflow-x-auto toolbar-scroll hardware-panel z-30 relative shrink-0"
    >
      <div className="min-w-max h-16 px-3 sm:px-5 flex justify-between items-center gap-4">
        <div className="flex items-center gap-3 sm:gap-4">
          {isPlaying ? (
            <button
              onClick={onStop}
              aria-label="Stop (Space)"
              title="Stop (Space)"
              className="hardware-btn w-10 h-10 rounded-full text-[var(--accent)] hover:text-red-400 shrink-0"
            >
              <Square fill="currentColor" size={12} />
            </button>
          ) : (
            <button
              onClick={onPlay}
              aria-label="Play (Space)"
              title="Play (Space)"
              className="hardware-btn w-10 h-10 rounded-full text-[var(--accent)] hover:text-emerald-400 shrink-0"
              disabled={!canPlay}
            >
              <Play fill="currentColor" size={16} />
            </button>
          )}

          <div className="h-6 w-px bg-[var(--border-color)] mx-1 sm:mx-2 shrink-0"></div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onUndo}
              disabled={!canUndo}
              className="hardware-btn w-10 h-10 rounded-full disabled:opacity-30 shrink-0"
              aria-label="Undo (Ctrl+Z)"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 size={16} />
            </button>
            <button
              onClick={onRedo}
              disabled={!canRedo}
              className="hardware-btn w-10 h-10 rounded-full disabled:opacity-30 shrink-0"
              aria-label="Redo (Ctrl+Y)"
              title="Redo (Ctrl+Y)"
            >
              <Redo2 size={16} />
            </button>
          </div>

          <div className="h-6 w-px bg-[var(--border-color)] mx-1 sm:mx-2 shrink-0"></div>

          <button
            onClick={onToggleFollow}
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
            onClick={onToggleLoop}
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
              min={MIN_BPM}
              max={MAX_BPM}
              step={1}
              onChange={onBpmChange}
            />
          </div>

          <div className="flex items-center space-x-2 px-4 h-10 hardware-display rounded-full sm:ml-2 shrink-0">
            <span className="text-xs font-semibold uppercase opacity-60">
              Instrument:
            </span>
            <div className="w-44 -mr-2 shrink-0">
              <CustomDropdown
                options={SYNTH_OPTIONS.map((o) => ({
                  label: o.label,
                  value: o.value,
                }))}
                value={synthType}
                onChange={(v) => onSynthChange(v as SynthType)}
                className="bg-transparent border-none mt-[-2px]"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          <button
            type="button"
            onClick={onOpenShortcuts}
            aria-label="Keyboard shortcuts (question mark)"
            title="Keyboard shortcuts (?)"
            className="hardware-btn w-10 h-10 rounded-full shrink-0"
          >
            <Keyboard size={16} />
          </button>
          <input
            type="file"
            accept=".mid,.midi"
            className="hidden"
            ref={fileInputRef}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onLoadFile(file);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="hardware-btn h-10 px-4 sm:px-6 text-[11px] uppercase tracking-wide flex gap-2 font-bold items-center shrink-0"
          >
            Load MIDI
          </button>
          <button
            onClick={onClearSavedSession}
            aria-label="Clear saved session"
            title="Clear the autosaved session from this browser (only affects a future reload, not your current work)"
            className="hardware-btn w-10 h-10 rounded-full text-[var(--text-muted)] hover:text-red-400 shrink-0"
          >
            <Trash2 size={14} />
          </button>
          <button
            onClick={onExport}
            disabled={!canPlay}
            className="hardware-btn hardware-btn-primary h-10 px-4 sm:px-6 text-[11px] uppercase tracking-wide flex gap-2 font-bold items-center shrink-0"
          >
            Export MIDI
          </button>
        </div>
      </div>
    </div>
  );
}
