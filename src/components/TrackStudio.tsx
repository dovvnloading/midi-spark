import { useState } from "react";
import { Layers, View, Plus, Draw, Copy, Trash, Check, Close } from "./StudioIcons";
import { getTrackColorClasses } from "../lib/constants";
import type { SynthType } from "../lib/audio";
import { SoundPicker } from "./SoundPicker";
import { defaultTrackSettings, type TrackMix, type TrackDescriptor, type TrackSettings } from "../lib/tracks";
import { CustomSlider } from "./CustomSlider";

export interface TrackStudioProps {
  tracks: TrackDescriptor[];
  mixer: TrackMix;
  /** Source MIDI instrument program (zero-based), not the browser patch. */
  midiPrograms: Record<number, number | null>;
  defaultSynth: SynthType;
  focusedTrack: number | null;
  onFocusTrack: (track: number | null) => void;
  onChange: (track: number, changes: Partial<TrackSettings>) => void;
  onAddTrack: () => void;
  onRenameTrack: (index: number, name: string) => void;
  onDuplicateTrack: (index: number) => void;
  onDeleteTrack: (index: number) => void;
  onPreviewError?: (message: string) => void;
}

export function TrackStudio(p: TrackStudioProps) {
  const [renaming, setRenaming] = useState<number | null>(null);
  const [draftName, setDraftName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);
  const finishRename = () => {
    if (renaming === null || !draftName.trim()) return;
    p.onRenameTrack(renaming, draftName);
    setRenaming(null);
  };

  return <div className="inspector-content track-panel">
    <header className="tool-panel-intro">
      <span className="eyebrow">TRACKS</span>
      <h2>Arrange &amp; mix.</h2>
    </header>
    <button type="button" className="secondary-button wide track-add"
      onClick={p.onAddTrack} aria-label="Add track"><Plus size={15} />Add track</button>
    {p.tracks.length === 0
      ? <div className="inspector-empty"><Layers size={24} />
        <p>Add a track to draw notes or import a MIDI file.</p>
      </div>
      : <>
        {p.focusedTrack !== null && <button type="button"
          className="text-button wide track-show-all"
          onClick={() => p.onFocusTrack(null)}>Show all tracks
          <span className="count-badge">{p.tracks.length}</span>
        </button>}
        <div className="track-list">
          {p.tracks.map(track => {
            const setting = p.mixer[track.index] ??
              defaultTrackSettings(track.index, p.defaultSynth);
            const focused = p.focusedTrack === track.index;
            const program = p.midiPrograms[track.index];
            return <section className={"track-strip" + (focused ? " focused" : "")}
              key={track.index} aria-label={track.name + " controls"}>
              <div className="track-strip-heading">
                {renaming === track.index ? <div className="track-rename">
                  <input autoFocus aria-label="New track name" maxLength={48}
                    value={draftName} onChange={event => setDraftName(event.target.value)}
                    onKeyDown={event => {
                      if (event.key === "Enter") { event.preventDefault(); finishRename(); }
                      if (event.key === "Escape") {
                        event.preventDefault(); event.stopPropagation(); setRenaming(null);
                      }
                    }} />
                  <button type="button" aria-label="Save track name" onClick={finishRename}
                    disabled={!draftName.trim()}><Check size={14} /></button>
                  <button type="button" aria-label="Cancel rename"
                    onClick={() => setRenaming(null)}><Close size={14} /></button>
                </div> : <button type="button" className="track-name-button"
                  aria-pressed={focused}
                  onClick={() => p.onFocusTrack(focused ? null : track.index)}
                  title="Focus this track in the piano roll">
                  <span className={`track-color ${getTrackColorClasses(track.index)}`} />
                  <span><strong>{track.name}</strong>
                    <small>{track.noteCount} notes{focused ? " · Focused" : ""}</small></span>
                  {focused && <View size={13} aria-hidden="true" />}
                </button>}
                <div className="track-toggles">
                  <button type="button" aria-label={(setting.muted ? "Unmute " : "Mute ") + track.name}
                    aria-pressed={setting.muted}
                    onClick={() => p.onChange(track.index, { muted: !setting.muted })}>M</button>
                  <button type="button" aria-label={(setting.solo ? "Unsolo " : "Solo ") + track.name}
                    aria-pressed={setting.solo}
                    onClick={() => p.onChange(track.index, { solo: !setting.solo })}>S</button>
                </div>
              </div>
              <details className="compose-disclosure track-settings-disclosure">
                <summary><span>Sound &amp; actions</span><small>{Math.round(setting.level * 100)}% level</small></summary>
                <div className="compose-disclosure-body">
                  <SoundPicker label={track.name + " instrument"} value={setting.synthType}
                    onChange={type => p.onChange(track.index, { synthType: type })}
                    onPreviewError={p.onPreviewError} />
                  <p className="track-midi-export-note">
                    Browser playback sound · MIDI export: {program === null || program === undefined
                      ? "default GM program" : "GM program " + (program + 1)}
                  </p>
                  <div className="field-heading"><label>Level</label>
                    <output>{Math.round(setting.level * 100)}<span>%</span></output></div>
                  <CustomSlider min={0} max={100} value={Math.round(setting.level * 100)}
                    label={track.name + " volume"}
                    onChange={value => p.onChange(track.index, { level: value / 100 })} />
                  <div className="track-management" role="group"
                    aria-label={track.name + " management"}>
                    <button type="button" onClick={() => {
                      setRenaming(track.index);
                      setDraftName(track.name);
                      setPendingDelete(null);
                    }} aria-label={"Rename " + track.name}>
                      <Draw size={13} />Rename</button>
                    <button type="button" onClick={() => p.onDuplicateTrack(track.index)}
                      aria-label={"Duplicate " + track.name}>
                      <Copy size={13} />Duplicate</button>
                    <button type="button" onClick={() => {
                      if (track.noteCount === 0) p.onDeleteTrack(track.index);
                      else { setPendingDelete(track.index); setRenaming(null); }
                    }} aria-label={"Delete " + track.name}>
                      <Trash size={13} />Delete</button>
                  </div>
                  {pendingDelete === track.index && <div className="track-delete-confirm"
                    role="alertdialog" aria-label={"Delete " + track.name + " confirmation"}
                    onKeyDown={event => {
                      if (event.key === "Escape") {
                        event.preventDefault(); event.stopPropagation(); setPendingDelete(null);
                      }
                    }}>
                    <p>Delete {track.name} and its {track.noteCount} notes? Undo restores them.</p>
                    <div>
                      <button type="button" autoFocus
                        onClick={() => setPendingDelete(null)}>Cancel</button>
                      <button type="button" className="danger-action"
                        onClick={() => { setPendingDelete(null); p.onDeleteTrack(track.index); }}>
                        Delete track
                      </button>
                    </div>
                  </div>}
                </div>
              </details>
            </section>;
          })}
        </div>
      </>}
  </div>;
}
