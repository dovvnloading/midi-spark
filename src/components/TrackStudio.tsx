import { Layers, Eye } from "lucide-react";
import type { SynthType } from "../lib/audio";
import { SoundPicker } from "./SoundPicker";
import { defaultTrackSettings, trackIsAudible, type TrackMix, type TrackDescriptor, type TrackSettings } from "../lib/tracks";
import { CustomSlider } from "./CustomSlider";
export interface TrackStudioProps {
  tracks: TrackDescriptor[]; mixer: TrackMix; defaultSynth: SynthType; focusedTrack: number | null;
  onFocusTrack: (track: number | null) => void; onChange: (track: number, changes: Partial<TrackSettings>) => void;
  onPreviewError?: (message: string) => void;
}
export function TrackStudio(p: TrackStudioProps) {
  return <div className="inspector-content track-panel">
    <div className="panel-intro"><span className="eyebrow">TRACK STUDIO</span><h2>Find the balance.</h2><p>Mix the sound. Focus the edit.</p></div>
    {p.tracks.length === 0 ? <div className="inspector-empty"><Layers size={24} /><p>Generate a pattern or import MIDI to start mixing.</p></div> : <>
      <button className="secondary-button wide" aria-pressed={p.focusedTrack === null} onClick={() => p.onFocusTrack(null)}><Layers size={15} />Show all tracks <span className="count-badge">{p.tracks.length}</span></button>
      {p.tracks.map(track => {
        const setting = p.mixer[track.index] ?? defaultTrackSettings(track.index, p.defaultSynth);
        const focused = p.focusedTrack === track.index, audible = trackIsAudible(track.index, p.mixer);
        return <section className={"track-strip" + (focused ? " focused" : "")} key={track.index} aria-label={track.name + " controls"}>
          <div className="track-strip-heading"><button className="track-name-button" aria-pressed={focused}
            onClick={() => p.onFocusTrack(focused ? null : track.index)} title="Focus this track in the editor">
            <span className="track-color" style={{ background: ["#9bc5b5", "#deba86", "#aaa1cf", "#a4c4df"][track.index % 4] }} />
            <span><strong>{track.name}</strong><small>{track.noteCount} notes{focused ? " · Focused" : ""}</small></span>{focused && <Eye size={13} />}
          </button>
          <div className="track-toggles"><button aria-label={(setting.muted ? "Unmute " : "Mute ") + track.name} aria-pressed={setting.muted} onClick={() => p.onChange(track.index, { muted: !setting.muted })}>M</button>
            <button aria-label={(setting.solo ? "Unsolo " : "Solo ") + track.name} aria-pressed={setting.solo} onClick={() => p.onChange(track.index, { solo: !setting.solo })}>S</button></div>
          </div>
          <SoundPicker label={track.name + " instrument"} value={setting.synthType} onChange={type => p.onChange(track.index, { synthType: type })} onPreviewError={p.onPreviewError} />
          <div className="field-heading"><label>Level</label><output>{Math.round(setting.level * 100)}<span>%</span></output></div>
          <CustomSlider min={0} max={100} value={Math.round(setting.level * 100)} label={track.name + " volume"} onChange={v => p.onChange(track.index, { level: v / 100 })} />
          <div className="track-audibility"><span className={audible ? "audible-dot" : "silent-dot"} />{audible ? "Audible" : "Silent"}<span>Preview mix only</span></div>
        </section>;
      })}
      <p className="inspector-note">Mute, solo, and sound choices affect preview playback. Export preserves the source MIDI instruments.</p>
    </>}
  </div>;
}
