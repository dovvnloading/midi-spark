import { Sparkles, Shuffle, ArrowUpRight } from "lucide-react";
import { CustomDropdown } from "./CustomDropdown";
import { SoundPicker } from "./SoundPicker";
import { CustomSlider } from "./CustomSlider";
import { ROOT_NOTES } from "../lib/constants";
import type { SynthType } from "../lib/audio";
export interface SidebarProps {
  root: string; mode: "major" | "minor"; dissonance: number; complexity: number; bars: number; canVary: boolean;
  synthType: SynthType; multiTrack: boolean;
  onRootChange: (value: string) => void; onModeChange: (value: "major" | "minor") => void;
  onDissonanceChange: (value: number) => void; onComplexityChange: (value: number) => void; onBarsChange: (value: number) => void;
  onSynthChange: (value: SynthType) => void; onOpenTracks: () => void;
  onGenerate: () => void; onAddVariation: () => void; onPreviewError?: (message: string) => void;
}
export function Sidebar(p: SidebarProps) {
  return <div className="compose-panel">
    <div className="inspector-content">
      <div className="panel-intro"><span className="eyebrow">IDEA ENGINE</span><h2>A starting point.<br />Not a formula.</h2>
        <p>Shape the harmony and feel of your next pattern.</p></div>
      <section className="field-section">
        <h3>Key & scale</h3>
        <div className="field-pair"><CustomDropdown ariaLabel="Root key" value={p.root} onChange={v => p.onRootChange(String(v))} options={[...ROOT_NOTES]} />
          <CustomDropdown ariaLabel="Scale mode" value={p.mode} onChange={v => p.onModeChange(v as "major" | "minor")} options={[{ label: "Major", value: "major" }, { label: "Minor", value: "minor" }]} /></div>
      </section>
      <section className="field-section sound-section">
        <div className="field-heading"><h3>{p.multiTrack ? "Track instruments" : "Preview sound"}</h3><span className="field-hint">Audio only</span></div>
        {p.multiTrack ? <button className="secondary-button wide" onClick={p.onOpenTracks}>Open track mixer <ArrowUpRight size={14} /></button> :
          <SoundPicker label="Preview sound" value={p.synthType} onChange={p.onSynthChange} onPreviewError={p.onPreviewError} />}
      </section>
      <section className="field-section">
        <div className="field-heading"><h3>Chord tension</h3><output>{p.dissonance}<span>%</span></output></div>
        <CustomSlider value={p.dissonance} min={0} max={100} onChange={p.onDissonanceChange} label="Chord tension" />
        <div className="range-captions"><span>Familiar</span><span>Unexpected</span></div>
        <div className="field-heading spaced"><h3>Rhythmic detail</h3><output>{p.complexity}<span>%</span></output></div>
        <CustomSlider value={p.complexity} min={0} max={100} onChange={p.onComplexityChange} label="Rhythmic detail" />
        <div className="range-captions"><span>Spacious</span><span>Intricate</span></div>
      </section>
      <section className="field-section">
        <div className="field-heading"><h3>Pattern length</h3><span className="field-hint">bars</span></div>
        <div className="segmented" role="group" aria-label="Pattern length">
          {[4, 8, 12, 16].map(bars => <button key={bars} aria-pressed={p.bars === bars} onClick={() => p.onBarsChange(bars)}>{bars}</button>)}
        </div>
      </section>
      <p className="inspector-note">Generation replaces the pattern. Your previous idea is always one undo away.</p>
    </div>
    <div className="compose-actions">
      <button className="primary-button generate-button" onClick={p.onGenerate}><Sparkles size={16} /><span>Generate pattern</span><kbd>{/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘ G" : "Ctrl G"}</kbd></button>
      <button className="text-button variation-button" disabled={!p.canVary} onClick={p.onAddVariation}><Shuffle size={14} /> Create a variation</button>
    </div>
  </div>;
}
