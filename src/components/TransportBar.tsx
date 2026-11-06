import { useEffect, useRef } from "react";
import { AudioLines, Download, Play, Square, Repeat2, Undo2, Redo2, Upload, Keyboard, Trash2, MoreHorizontal, SlidersHorizontal } from "lucide-react";
import { MIN_BPM, MAX_BPM } from "../lib/constants";
export interface TransportBarProps {
  isPlaying: boolean; canPlay: boolean; canUndo: boolean; canRedo: boolean; isLooping: boolean; bpm: number; currentTick: number;
  onPlay: () => void; onStop: () => void; onUndo: () => void; onRedo: () => void; onToggleLoop: () => void;
  onBpmChange: (value: number) => void; onLoadFile: (file: File) => void; onExport: () => void;
  onClearSavedSession: () => void; onOpenShortcuts: () => void; onToggleInspector: () => void;
}
export function TransportBar(p: TransportBarProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const moreRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      const menu = moreRef.current;
      if (menu?.open && event.target instanceof Node && !menu.contains(event.target)) menu.open = false;
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);
  const bar = Math.floor(p.currentTick / 4) + 1, beat = Math.floor(p.currentTick % 4) + 1;
  return <header className="app-header">
    <div className="wordmark"><span className="brand-mark"><AudioLines size={20} strokeWidth={1.8} /></span><span>midi<span className="wordmark-light">spark</span><span className="edition">STUDIO</span></span></div>
    <div className="transport" role="group" aria-label="Playback controls">
      <button className={"play-button" + (p.isPlaying ? " playing" : "")} onClick={p.isPlaying ? p.onStop : p.onPlay} disabled={!p.canPlay}
        aria-label={p.isPlaying ? "Stop playback" : "Play pattern"} title="Play / stop (Space)">
        {p.isPlaying ? <Square size={13} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
      </button>
      <button className="icon-button loop-button" aria-pressed={p.isLooping} onClick={p.onToggleLoop} aria-label="Loop playback" title="Loop playback"><Repeat2 size={17} /></button>
      <span className="control-divider" />
      <label className="tempo-field"><input type="number" aria-label="Tempo" min={MIN_BPM} max={MAX_BPM} step={1}
        value={p.bpm} onChange={event => { const next = event.target.valueAsNumber; if (Number.isFinite(next)) p.onBpmChange(Math.max(MIN_BPM, Math.min(MAX_BPM, next))); }} />
        <span>BPM</span></label>
      <span className="control-divider position-divider" />
      <div className="position-display" aria-label={"Bar " + bar + ", beat " + beat}><span>{String(bar).padStart(2, "0")}</span><i>:</i><span>{String(beat).padStart(2, "0")}</span><small>BAR / BEAT</small></div>
    </div>
    <div className="project-actions">
      <div className="history-actions"><button className="icon-button" onClick={p.onUndo} disabled={!p.canUndo} aria-label="Undo" title="Undo (Ctrl/⌘ Z)"><Undo2 size={17} /></button>
        <button className="icon-button" onClick={p.onRedo} disabled={!p.canRedo} aria-label="Redo" title="Redo (Ctrl/⌘ Shift Z)"><Redo2 size={17} /></button></div>
      <span className="control-divider history-divider" />
      <button className="secondary-button import-button" onClick={() => fileRef.current?.click()} aria-label="Import MIDI"><Upload size={15} /><span>Import</span></button>
      <button className="primary-button export-button" onClick={p.onExport} disabled={!p.canPlay} aria-label="Export MIDI"><Download size={15} /><span>Export MIDI</span></button>
      <details className="project-menu" ref={moreRef} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); } }}>
        <summary className="icon-button" aria-label="More actions"><MoreHorizontal size={18} /></summary>
        <div className="project-menu-content">
          <button onClick={() => { moreRef.current!.open = false; p.onOpenShortcuts(); }}><Keyboard size={15} />Keyboard shortcuts <kbd>?</kbd></button>
          <button onClick={() => { moreRef.current!.open = false; p.onToggleInspector(); }}><SlidersHorizontal size={15} />Toggle inspector</button>
          <button className="menu-danger" onClick={() => { moreRef.current!.open = false; p.onClearSavedSession(); }}><Trash2 size={15} />Clear browser autosave</button>
          <p>Clearing autosave keeps this session open.</p>
        </div>
      </details>
      <input type="file" accept=".mid,.midi" ref={fileRef} className="hidden" aria-label="Import MIDI file" onChange={event => {
        const file = event.target.files?.[0]; if (file) p.onLoadFile(file); event.target.value = "";
      }} />
    </div>
  </header>;
}
