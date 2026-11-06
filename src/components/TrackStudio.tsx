import { useState } from "react";
import { AudioLines, ChevronDown, ChevronUp, Headphones, Layers3, Volume2, VolumeX } from "lucide-react";
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

/** Per-track mix strips with a selectable piano-roll lane. Audio remains
 * non-destructive: mute/solo/level never remove or alter MIDI note events. */
export function TrackStudio({
  tracks,
  mixer,
  defaultSynth,
  focusedTrack,
  onFocusTrack,
  onChange,
}: TrackStudioProps) {
  const [expanded, setExpanded] = useState(tracks.length > 1);
  if (!tracks.length) return null;

  return (
    <section className="w-full max-w-6xl mx-auto shrink-0 relative z-20" aria-label="Track Studio">
      <div className="hardware-panel px-4 py-2 flex items-center justify-between gap-4">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls="track-studio-strips"
          className="flex items-center gap-2 text-[10px] uppercase font-bold tracking-widest text-[var(--accent)] hover:text-white"
          title="Open Track Studio mixer and lane controls"
          onClick={() => setExpanded((value) => !value)}
        >
          <Layers3 size={15} aria-hidden="true" />
          Track Studio
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-[var(--text-muted)] font-mono">
            {tracks.length} {tracks.length === 1 ? "track" : "tracks"}
          </span>
          <button
            type="button"
            onClick={() => onFocusTrack(null)}
            aria-pressed={focusedTrack === null}
            className={"hardware-btn px-3 py-1.5 text-[10px] uppercase " +
              (focusedTrack === null ? "text-[var(--accent)]" : "")}
            title="Show all tracks together in the piano roll"
          >
            All lanes
          </button>
        </div>
      </div>
      {expanded && (
        <div
          id="track-studio-strips"
          className="hardware-panel mt-2 p-3 flex gap-3 overflow-x-auto toolbar-scroll"
        >
          {tracks.map((track) => {
            const setting = mixer[track.index] ??
              defaultTrackSettings(track.index, defaultSynth);
            const audible = trackIsAudible(track.index, mixer);
            const focused = focusedTrack === track.index;
            return (
              <div
                key={track.index}
                className={"min-w-[230px] w-[230px] shrink-0 rounded-lg border p-3 bg-[var(--piano-black)]/70 flex flex-col gap-3 " +
                  (focused ? "border-[var(--accent)]" : "border-[var(--border-color)]")}
              >
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-pressed={focused}
                    onClick={() => onFocusTrack(focused ? null : track.index)}
                    className={"flex-1 text-left min-w-0 rounded px-1 py-0.5 hover:text-[var(--accent)] " +
                      (focused ? "text-[var(--accent)]" : "text-[var(--text-main)]")}
                    title={"Focus the " + track.name + " lane for piano-roll editing"}
                  >
                    <span className="flex items-center gap-1 font-bold text-[11px]">
                      <AudioLines size={13} aria-hidden="true" />
                      <span className="truncate">{track.name}</span>
                    </span>
                    <span className="block mt-1 text-[9px] font-mono text-[var(--text-muted)]">
                      Track {track.index + 1} · {track.noteCount} notes
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={setting.muted ? "Unmute " + track.name : "Mute " + track.name}
                    aria-pressed={setting.muted}
                    onClick={() => onChange(track.index, { muted: !setting.muted })}
                    className={"hardware-btn w-8 h-8 text-[10px] " +
                      (setting.muted ? "text-red-400" : "text-[var(--text-main)]")}
                    title="Mute this track"
                  >
                    {setting.muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
                  </button>
                  <button
                    type="button"
                    aria-label={setting.solo ? "Unsolo " + track.name : "Solo " + track.name}
                    aria-pressed={setting.solo}
                    onClick={() => onChange(track.index, { solo: !setting.solo })}
                    className={"hardware-btn w-8 h-8 " +
                      (setting.solo ? "text-amber-400" : "text-[var(--text-main)]")}
                    title="Solo this track (multiple tracks may be soloed)"
                  >
                    <Headphones size={13} />
                  </button>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] uppercase tracking-wider font-bold text-[var(--text-muted)]">
                    Instrument
                  </span>
                  <CustomDropdown
                    ariaLabel={track.name + " instrument"}
                    options={SYNTH_OPTIONS.map((item) => ({
                      label: item.label,
                      value: item.value,
                    }))}
                    value={setting.synthType}
                    onChange={(value) => onChange(track.index, { synthType: value as SynthType })}
                  />
                </div>
                <label className="flex flex-col gap-1 text-[9px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                  <span className="flex justify-between">
                    <span>Level</span>
                    <span className={audible ? "text-emerald-400" : "text-red-400"}>
                      {Math.round(setting.level * 100)}%
                    </span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={Math.round(setting.level * 100)}
                    onChange={(event) =>
                      onChange(track.index, { level: Number(event.target.value) / 100 })}
                    aria-label={track.name + " volume"}
                    className="accent-[var(--accent)] w-full h-6 cursor-pointer"
                  />
                </label>
                <span className="text-[9px] font-mono text-[var(--text-muted)]">
                  {audible ? (focused ? "Focused · audible" : "Audible") : "Silent"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
