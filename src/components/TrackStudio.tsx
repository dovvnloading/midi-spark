import { useState } from "react";
import { Layers, Eye, Plus, Pencil, Copy, Trash2, Check, X } from "lucide-react";
import type { SynthType } from "../lib/audio";
import { SoundPicker } from "./SoundPicker";
import { defaultTrackSettings, trackIsAudible, type TrackMix, type TrackDescriptor, type TrackSettings } from "../lib/tracks";
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
    <div className="panel-intro"><span className="eyebrow">TRACK STUDIO</span><h2>Build the layers.</h2><p>Add parts, shape their sound, and focus the edit.</p></div>
    <button className="secondary-button wide track-add" onClick={p.onAddTrack} aria-label="Add track"><Plus size={15} />Add track</button>
    {p.tracks.length === 0 ? <div className="inspector-empty"><Layers size={24} /><p>Add an empty track to draw notes, generate a pattern, or import MIDI.</p></div> : <>
      <button className="secondary-button wide" aria-pressed={p.focusedTrack === null} onClick={() => p.onFocusTrack(null)}>
        <Layers size={15} />Show all tracks <span className="count-badge">{p.tracks.length}</span>
      </button>
      {p.tracks.map(track => {
        const setting = p.mixer[track.index] ?? defaultTrackSettings(track.index, p.defaultSynth);
        const focused = p.focusedTrack === track.index;
        const audible = trackIsAudible(track.index, p.mixer);
        return <section className={"track-strip" + (focused ? " focused" : "")} key={track.index} aria-label={track.name + " controls"}>
          <div className="track-strip-heading">
            {renaming === track.index ? <div className="track-rename">
              <input autoFocus aria-label="New track name" maxLength={48} value={draftName}
                onChange={event => setDraftName(event.target.value)}
                onKeyDown={event => {
                  if (event.key === "Enter") { event.preventDefault(); finishRename(); }
                  if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setRenaming(null); }
                }} />
              <button aria-label="Save track name" onClick={finishRename} disabled={!draftName.trim()}><Check size={14} /></button>
              <button aria-label="Cancel rename" onClick={() => setRenaming(null)}><X size={14} /></button>
            </div> : <button className="track-name-button" aria-pressed={focused}
              onClick={() => p.onFocusTrack(focused ? null : track.index)} title="Focus this track in the editor">
              <span className="track-color" style={{ background: ["#9bc5b5", "#deba86", "#aaa1cf", "#a4c4df"][track.index % 4] }} />
              <span><strong>{track.name}</strong><small>{track.noteCount} notes{focused ? " · Focused" : ""}</small></span>{focused && <Eye size={13} />}
            </button>}
            <div className="track-toggles">
              <button aria-label={(setting.muted ? "Unmute " : "Mute ") + track.name} aria-pressed={setting.muted}
                onClick={() => p.onChange(track.index, { muted: !setting.muted })}>M</button>
              <button aria-label={(setting.solo ? "Unsolo " : "Solo ") + track.name} aria-pressed={setting.solo}
                onClick={() => p.onChange(track.index, { solo: !setting.solo })}>S</button>
            </div>
          </div>
          <div className="track-management" role="group" aria-label={track.name + " management"}>
            <button onClick={() => { setRenaming(track.index); setDraftName(track.name); setPendingDelete(null); }}
              aria-label={"Rename " + track.name}><Pencil size={13} />Rename</button>
            <button onClick={() => p.onDuplicateTrack(track.index)} aria-label={"Duplicate " + track.name}><Copy size={13} />Duplicate</button>
            <button onClick={() => {
              if (track.noteCount === 0) p.onDeleteTrack(track.index);
              else { setPendingDelete(track.index); setRenaming(null); }
            }} aria-label={"Delete " + track.name}><Trash2 size={13} />Delete</button>
          </div>
          {pendingDelete === track.index && <div className="track-delete-confirm" role="alertdialog" aria-label={"Delete " + track.name + " confirmation"}
            onKeyDown={event => {
              if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setPendingDelete(null); }
            }}>
            <p>Delete {track.name} and its {track.noteCount} notes? Undo will restore them.</p>
            <div>
              <button autoFocus onClick={() => setPendingDelete(null)}>Cancel</button>
              <button className="danger-action" onClick={() => { setPendingDelete(null); p.onDeleteTrack(track.index); }}>Delete track</button>
            </div>
          </div>}
          <SoundPicker label={track.name + " instrument"} value={setting.synthType}
            onChange={type => p.onChange(track.index, { synthType: type })} onPreviewError={p.onPreviewError} />
          <p className="track-midi-export-note">Browser sound only · MIDI exports
            {p.midiPrograms[track.index] === null || p.midiPrograms[track.index] === undefined
              ? " the default GM program"
              : " GM program " + (p.midiPrograms[track.index]! + 1)}
          </p>
          <div className="field-heading"><label>Level</label><output>{Math.round(setting.level * 100)}<span>%</span></output></div>
          <CustomSlider min={0} max={100} value={Math.round(setting.level * 100)}
            label={track.name + " volume"} onChange={value => p.onChange(track.index, { level: value / 100 })} />
          <div className="track-audibility"><span className={audible ? "audible-dot" : "silent-dot"} />
            {audible ? "Audible" : "Silent"}<span>Preview mix only</span></div>
        </section>;
      })}
      <p className="inspector-note">Add, rename, duplicate or remove musical tracks here. Undo restores note and track edits. Browser synth sounds affect playback only; MIDI export uses each track's General MIDI program.</p>
    </>}
  </div>;
}
