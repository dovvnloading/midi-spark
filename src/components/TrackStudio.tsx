import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Layers3, SlidersVertical } from "lucide-react";
import { SYNTH_OPTIONS } from "../lib/constants";
import type { SynthType } from "../lib/audio";
import type { TrackDescriptor, TrackMix, TrackSettings } from "../lib/tracks";
import { defaultTrackSettings, trackIsAudible } from "../lib/tracks";
import { CustomDropdown } from "./CustomDropdown";

export interface TrackStudioProps {
  tracks: TrackDescriptor[];
  mixer: TrackMix;
  defaultSynth: SynthType;
  focusedTrack: number | null;
  onFocusTrack: (index: number | null) => void;
  onChange: (index: number, changes: Partial<TrackSettings>) => void;
}

const TRACK_ACCENTS = [
  "#f3be73", "#f08f9f", "#78c9df", "#a4d28a", "#d7a6ec", "#7cb5f4",
];

export function TrackStudio({
  tracks,
  mixer,
  defaultSynth,
  focusedTrack,
  onFocusTrack,
  onChange,
}: TrackStudioProps) {
  const [expanded, setExpanded] = useState(tracks.length > 1);
  const previousCount = useRef(tracks.length);

  // Reveal the mixer when importing a multitrack file into an empty project.
  useEffect(() => {
    if (previousCount.current < 2 && tracks.length > 1) setExpanded(true);
    previousCount.current = tracks.length;
  }, [tracks.length]);

  if (!tracks.length) return null;

  return (
    <section className="relative z-20 mx-auto w-full max-w-6xl shrink-0" aria-label="Track Studio">
      <div className="hardware-panel flex min-h-12 items-center justify-between gap-4 px-3 py-2 sm:px-4">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls="track-studio-strips"
          onClick={() => setExpanded((value) => !value)}
          className="flex items-center gap-2.5 rounded-lg p-1 text-left hover:text-white"
          title="Expand mixer for per-track instruments, levels, mute and solo"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#293954] text-[var(--accent)]">
            <Layers3 size={15} aria-hidden="true" />
          </div>
          <div>
            <span className="block text-[12px] font-bold leading-4 text-[var(--text-main)]">Track Studio</span>
            <span className="block text-[10px] leading-4 text-[var(--text-subtle)]">
              {tracks.length} {tracks.length === 1 ? "track" : "tracks"} · Instruments & levels
            </span>
          </div>
          {expanded
            ? <ChevronUp size={14} className="ml-1 text-[var(--text-muted)]" aria-hidden="true" />
            : <ChevronDown size={14} className="ml-1 text-[var(--text-muted)]" aria-hidden="true" />}
        </button>
        <div className="flex items-center gap-2">
          {focusedTrack !== null && (
            <span className="hidden text-xs text-[var(--text-muted)] sm:inline">
              Editing track {focusedTrack + 1}
            </span>
          )}
          <button
            type="button"
            aria-pressed={focusedTrack === null}
            onClick={() => onFocusTrack(null)}
            className={
              "hardware-btn h-8 px-3 text-[11px] " +
              (focusedTrack === null ? "studio-tool-active" : "studio-quiet-btn")
            }
            title="Show all tracks together in the piano roll"
          >
            <SlidersVertical size={13} aria-hidden="true" />
            All tracks
          </button>
        </div>
      </div>

      {expanded && (
        <div
          id="track-studio-strips"
          className="hardware-panel toolbar-scroll mt-2 flex gap-2.5 overflow-x-auto p-3"
        >
          {tracks.map((track) => {
            const setting = mixer[track.index] ??
              defaultTrackSettings(track.index, defaultSynth);
            const focused = focusedTrack === track.index;
            const audible = trackIsAudible(track.index, mixer);
            const accent = TRACK_ACCENTS[track.index % TRACK_ACCENTS.length];

            return (
              <div
                key={track.index}
                role="group"
                aria-label={track.name + " track controls"}
                className={
                  "flex w-[216px] min-w-[216px] shrink-0 flex-col gap-3 rounded-xl border bg-[var(--surface-soft)] p-3 " +
                  (focused
                    ? "border-[var(--accent)]"
                    : "border-[var(--border-color)]")
                }
              >
                <div className="flex items-start gap-2">
                  <div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: accent }} />
                  <button
                    type="button"
                    aria-pressed={focused}
                    onClick={() => onFocusTrack(focused ? null : track.index)}
                    title={"Focus " + track.name + " in the piano roll"}
                    className="min-w-0 flex-1 rounded text-left"
                  >
                    <span className="block truncate text-[12px] font-semibold text-[var(--text-main)]">
                      {track.name}
                    </span>
                    <span className="mt-0.5 block text-[10px] text-[var(--text-subtle)]">
                      Track {track.index + 1} · {track.noteCount} notes
                    </span>
                  </button>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      aria-label={setting.muted ? "Unmute " + track.name : "Mute " + track.name}
                      aria-pressed={setting.muted}
                      title="Mute"
                      onClick={() => onChange(track.index, { muted: !setting.muted })}
                      className={
                        "hardware-btn h-8 w-8 text-xs " +
                        (setting.muted ? "border-rose-500/40 bg-rose-500/15 text-rose-300" : "studio-quiet-btn")
                      }
                    >
                      M
                    </button>
                    <button
                      type="button"
                      aria-label={setting.solo ? "Unsolo " + track.name : "Solo " + track.name}
                      aria-pressed={setting.solo}
                      title="Solo"
                      onClick={() => onChange(track.index, { solo: !setting.solo })}
                      className={
                        "hardware-btn h-8 w-8 text-xs " +
                        (setting.solo ? "border-amber-400/40 bg-amber-400/15 text-amber-200" : "studio-quiet-btn")
                      }
                    >
                      S
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="studio-field-label block">Instrument</label>
                  <CustomDropdown
                    ariaLabel={track.name + " instrument"}
                    options={SYNTH_OPTIONS.map((preset) => ({
                      label: preset.label,
                      value: preset.value,
                    }))}
                    value={setting.synthType}
                    onChange={(value) => onChange(track.index, { synthType: value as SynthType })}
                  />
                </div>
                <label className="space-y-1.5">
                  <span className="flex items-center justify-between">
                    <span className="studio-field-label">Level</span>
                    <output className="font-mono text-[11px] tabular-nums text-[var(--text-main)]">
                      {Math.round(setting.level * 100)}%
                    </output>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={Math.round(setting.level * 100)}
                    onChange={(event) => onChange(track.index, {
                      level: Number(event.target.value) / 100,
                    })}
                    aria-label={track.name + " volume"}
                    className="h-6 w-full cursor-pointer"
                  />
                </label>
                <p className="text-[10px] leading-4 text-[var(--text-subtle)]">
                  {audible
                    ? focused ? "Focused in piano roll" : "Audible"
                    : setting.muted ? "Muted" : "Not audible"}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
