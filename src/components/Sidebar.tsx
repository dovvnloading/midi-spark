import { ArrowUpRight, AudioLines, Info, Layers, Music2, Shuffle, SlidersHorizontal, Sparkles } from "lucide-react";
import { CustomDropdown } from "./CustomDropdown";
import { SoundPicker } from "./SoundPicker";
import { CustomSlider } from "./CustomSlider";
import { ROOT_NOTES } from "../lib/constants";
import type { SynthType } from "../lib/audio";

export interface SidebarProps {
  root: string; mode: "major" | "minor"; dissonance: number; complexity: number; bars: number; canVary: boolean;
  synthType: SynthType; multiTrack: boolean;
  generationMode: "single" | "layers";
  onGenerationModeChange: (mode: "single" | "layers") => void;
  onRootChange: (value: string) => void; onModeChange: (value: "major" | "minor") => void;
  onDissonanceChange: (value: number) => void; onComplexityChange: (value: number) => void; onBarsChange: (value: number) => void;
  onSynthChange: (value: SynthType) => void; onOpenTracks: () => void;
  onGenerate: () => void; onAddVariation: () => void; onPreviewError?: (message: string) => void;
}

const FEEL_PRESETS = [
  { label: "Warm", tension: 12, detail: 18, description: "Open, familiar harmony with room to breathe" },
  { label: "Groove", tension: 34, detail: 58, description: "More movement and rhythmic energy" },
  { label: "Explore", tension: 74, detail: 76, description: "Adventurous harmony and intricate rhythm" },
] as const;

/** The composition surface: explore first, fine-tune next, generate last. */
export function Sidebar(p: SidebarProps) {
  const shortcut = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘ G" : "Ctrl G";
  return (
    <div className="compose-panel">
      <div className="inspector-content compose-content">
        <div className="panel-intro compose-intro">
          <div className="panel-kicker">
            <span className="eyebrow">IDEA ENGINE</span>
            <span className="panel-version">01 / CREATE</span>
          </div>
          <h2>Find your next<br /><em>musical idea.</em></h2>
          <p>Start with a key, shape the feeling, and make it yours.</p>
        </div>

        <div className="composition-summary" aria-label={"Current setup: " + p.root + " " + p.mode + ", " + p.bars + " bars"}>
          <span className="composition-summary-icon"><Music2 size={17} strokeWidth={1.8} /></span>
          <span className="composition-summary-copy">
            <small>YOUR STARTING POINT</small>
            <strong>{p.root} {p.mode} <span>·</span> {p.bars} bars</strong>
          </span>
          <span className="composition-summary-status" aria-hidden="true" />
        </div>

        <section className="field-section compose-section">
          <div className="section-heading">
            <span className="section-heading-icon"><Music2 size={15} /></span>
            <h3>Harmony</h3>
            <span className="section-index">01</span>
          </div>
          <div className="field-pair labeled-field-pair">
            <label className="field-control">
              <span>Root note</span>
              <CustomDropdown ariaLabel="Root key" value={p.root} onChange={value => p.onRootChange(String(value))} options={[...ROOT_NOTES]} />
            </label>
            <label className="field-control">
              <span>Scale</span>
              <CustomDropdown ariaLabel="Scale mode" value={p.mode} onChange={value => p.onModeChange(value as "major" | "minor")} options={[{ label: "Major", value: "major" }, { label: "Minor", value: "minor" }]} />
            </label>
          </div>
        </section>

        <section className="field-section compose-section sound-section">
          <div className="section-heading">
            <span className="section-heading-icon"><AudioLines size={15} /></span>
            <h3>{p.multiTrack ? "Instruments" : "Preview sound"}</h3>
            <span className="section-index">02</span>
          </div>
          {p.multiTrack
            ? <button className="secondary-button wide track-studio-link" onClick={p.onOpenTracks}>Open track mixer <ArrowUpRight size={15} /></button>
            : <SoundPicker label="Preview sound" value={p.synthType} onChange={p.onSynthChange} onPreviewError={p.onPreviewError} />}
        </section>

        <section className="field-section compose-section expression-section">
          <div className="section-heading">
            <span className="section-heading-icon"><SlidersHorizontal size={15} /></span>
            <h3>Expression</h3>
            <span className="section-index">03</span>
          </div>
          <div className="expression-control">
            <div className="field-heading"><h4>Chord tension</h4><output>{p.dissonance}<span>%</span></output></div>
            <CustomSlider value={p.dissonance} min={0} max={100} onChange={p.onDissonanceChange} label="Chord tension" />
            <div className="range-captions"><span>Familiar</span><span>Unexpected</span></div>
          </div>
          <div className="expression-control">
            <div className="field-heading"><h4>Rhythmic detail</h4><output>{p.complexity}<span>%</span></output></div>
            <CustomSlider value={p.complexity} min={0} max={100} onChange={p.onComplexityChange} label="Rhythmic detail" />
            <div className="range-captions"><span>Spacious</span><span>Intricate</span></div>
          </div>
          <div className="quick-directions-heading"><span>QUICK DIRECTIONS</span><span>One click to explore</span></div>
          <div className="feel-presets" role="group" aria-label="Quick expression presets">
            {FEEL_PRESETS.map(preset => (
              <button key={preset.label} type="button"
                title={preset.description}
                aria-pressed={p.dissonance === preset.tension && p.complexity === preset.detail}
                onClick={() => {
                  p.onDissonanceChange(preset.tension);
                  p.onComplexityChange(preset.detail);
                }}>{preset.label}</button>
            ))}
          </div>
        </section>

        <section className="field-section compose-section arrangement-section">
          <div className="section-heading">
            <span className="section-heading-icon"><Layers size={15} /></span>
            <h3>Arrangement</h3>
            <span className="section-index">04</span>
          </div>
          <div className="field-heading"><h4>Pattern length</h4><span className="field-hint">BARS</span></div>
          <div className="segmented" role="group" aria-label="Pattern length">
            {[4, 8, 12, 16].map(length => <button type="button" key={length} aria-pressed={p.bars === length}
              onClick={() => p.onBarsChange(length)}>{length}</button>)}
          </div>
          <div className="field-heading arrangement-label"><h4>Generation layers</h4><span className="field-hint">PARTS</span></div>
          <div className="generation-mode" role="group" aria-label="Generation layers">
            <button type="button" aria-pressed={p.generationMode === "single"}
              onClick={() => p.onGenerationModeChange("single")}>Single track</button>
            <button type="button" aria-pressed={p.generationMode === "layers"}
              onClick={() => p.onGenerationModeChange("layers")}>Bass + Harmony</button>
          </div>
          <p className="generation-hint">Two layers create separate, editable bass and harmony parts.</p>
        </section>
      </div>

      <div className="compose-actions">
        <div className="compose-action-topline"><span><span className="ready-indicator" /> READY WHEN YOU ARE</span><small>{p.bars} bars · {p.mode}</small></div>
        <button type="button" className="primary-button generate-button" onClick={p.onGenerate} aria-keyshortcuts="Control+g Meta+g">
          <Sparkles size={17} strokeWidth={1.9} /><span>Generate pattern</span><kbd>{shortcut}</kbd>
        </button>
        <button type="button" className="text-button variation-button" disabled={!p.canVary} onClick={p.onAddVariation}
          title={p.canVary ? "Create a fresh variation from the current pattern" : "Generate a pattern to unlock variations"}>
          <Shuffle size={15} /><span>Create a variation</span><ArrowUpRight size={14} />
        </button>
        <p className="compose-action-note"><Info size={12} /> Generation replaces the pattern. Undo restores it.</p>
      </div>
    </div>
  );
}
