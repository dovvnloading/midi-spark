import { memo } from "react";
import { Interval, Scale } from "@tonaljs/tonal";
import { ArrowUpRight, Layers, PianoRollIcon } from "./StudioIcons";
import { CustomDropdown } from "./CustomDropdown";
import { SoundPicker } from "./SoundPicker";
import { CustomSlider } from "./CustomSlider";
import { MelodyControls, type MelodyControlsProps } from "./MelodyControls";
import { HarmonyTakeLab, type HarmonyTakeView } from "./HarmonyTakeLab";
import { ROOT_NOTES } from "../lib/constants";
import type { SynthType } from "../lib/audio";
import type { ArrangementSection } from "../lib/theory";
import type { SongForm } from "../lib/songForm";

export interface SidebarProps extends MelodyControlsProps {
  root: string; mode: "major" | "minor"; dissonance: number; complexity: number; bars: number; canVary: boolean;
  synthType: SynthType; multiTrack: boolean;
  generationMode: "single" | "layers";
  songForm: SongForm;
  onSongFormChange: (form: SongForm) => void;
  formContrast: number;
  onFormContrastChange: (value: number) => void;
  canBuildSongForm: boolean;
  onBuildSongForm: () => void;
  arrangementSections: ArrangementSection[];
  melodySourceMode: "scratch" | "follow";
  canExploreTakes: boolean;
  takeViews: HarmonyTakeView[];
  previewTakeIndex: number | null;
  onExploreTakes: () => void;
  onSelectTake: (index: number | null) => void;
  onAuditionTake: (index: number | null) => void;
  onSaveTake: () => void;
  onRemoveSavedTake: (id: string) => void;
  onAcceptTake: () => void;
  onDiscardTakes: () => void;
  onMelodySourceModeChange: (mode: "scratch" | "follow") => void;
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

/** Note names and vertical spacing both follow the selected scale, including
 * enharmonic spellings such as E# in F# major. */
const ScaleReadout = memo(function ScaleReadout({ root, mode }: Pick<SidebarProps, "root" | "mode">) {
  const scale = Scale.get(root + " " + mode);
  return <div className="compose-scale-readout" role="img"
    aria-label={root + " " + mode + " scale: " + scale.notes.join(", ")}>
    <div className="compose-scale-grid" aria-hidden="true">
      {scale.intervals.map(interval =>
        <span className="compose-scale-degree" key={interval}>
          <span className="compose-scale-pitch"
            style={{ bottom: ((Interval.semitones(interval) ?? 0) / 12) * 100 + "%" }} />
        </span>)}
    </div>
    <div className="compose-scale-notes" aria-hidden="true">
      {scale.notes.map(note => <span key={note}>{note.replaceAll("#", "♯").replaceAll("b", "♭")}</span>)}
    </div>
  </div>;
});

export function Sidebar(p: SidebarProps) {
  const shortcut = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘ G" : "Ctrl G";
  const isFollow = p.melodySourceMode === "follow";
  const isHarmonizing = isFollow && p.melodyTask === "harmonize";
  const hasTakes = isHarmonizing && (p.canExploreTakes || p.takeViews.length > 0);
  const canShowForm = p.canBuildSongForm || p.arrangementSections.length > 0;

  return (
    <div className="compose-panel">
      <div className="inspector-content compose-content">
        <header className="compose-device-header">
          <h2 className="compose-device-title">{isFollow ? "Melody processor" : "Pattern generator"}</h2>
          <div className="generation-mode compose-source-switch" role="group" aria-label="Generation starting point">
            <button type="button" aria-pressed={!isFollow} onClick={() => p.onMelodySourceModeChange("scratch")}>
              <PianoRollIcon size={15} aria-hidden="true" />From scratch
            </button>
            <button type="button" aria-pressed={isFollow} onClick={() => p.onMelodySourceModeChange("follow")}>
              <Layers size={15} aria-hidden="true" />Follow melody
            </button>
          </div>
        </header>

        <section className="compose-key-module" aria-label="Compose key and scale">
          <div className="compose-key-fields">
            <label className="field-control">
              <span>Root note</span>
              <CustomDropdown ariaLabel="Root key" value={p.root}
                onChange={value => p.onRootChange(String(value))} options={[...ROOT_NOTES]} />
            </label>
            <label className="field-control">
              <span>Scale</span>
              <CustomDropdown ariaLabel="Scale mode" value={p.mode}
                onChange={value => p.onModeChange(value as "major" | "minor")}
                options={[{ label: "Major", value: "major" }, { label: "Minor", value: "minor" }]} />
            </label>
          </div>
          <ScaleReadout root={p.root} mode={p.mode} />
        </section>
        {isFollow && p.melodyKeyStrategy === "detect" && <p className="compose-detect-hint">
          Melody key detection is active.
        </p>}

        {isFollow && <MelodyControls {...p} />}

        {!isFollow && <section className="compose-module compose-arrangement" aria-label="Pattern setup">
          <div className="compose-param-row">
            <h3>Bars</h3>
            <div className="segmented" role="group" aria-label="Pattern length">
              {[4, 8, 12, 16].map(length => <button type="button" key={length}
                aria-pressed={p.bars === length} onClick={() => p.onBarsChange(length)}>{length}</button>)}
            </div>
          </div>
          <div className="compose-param-row">
            <h3>Parts</h3>
            <div className="generation-mode compose-parts-switch" role="group" aria-label="Generation layers">
              <button type="button" aria-pressed={p.generationMode === "single"}
                onClick={() => p.onGenerationModeChange("single")}>Single track</button>
              <button type="button" aria-pressed={p.generationMode === "layers"}
                onClick={() => p.onGenerationModeChange("layers")}>Bass + Harmony</button>
            </div>
          </div>
        </section>}

        <section className="compose-module sound-section">
          <div className="section-heading">
            <h3>{p.multiTrack ? "Instruments" : "Instrument"}</h3>
          </div>
          {p.multiTrack
            ? <button type="button" className="secondary-button wide track-studio-link"
              onClick={p.onOpenTracks}>Open track mixer <ArrowUpRight size={15} aria-hidden="true" /></button>
            : <SoundPicker label="Preview sound" value={p.synthType}
              onChange={p.onSynthChange} onPreviewError={p.onPreviewError} />}
        </section>

        {(!isFollow || isHarmonizing) && <section className="compose-module compose-expression">
          <div className="section-heading"><h3>Expression</h3></div>
          {!isFollow && <div className="feel-presets" role="group" aria-label="Quick expression presets">
            {FEEL_PRESETS.map(preset => <button key={preset.label} type="button"
              title={preset.description}
              aria-pressed={p.dissonance === preset.tension && p.complexity === preset.detail}
              onClick={() => { p.onDissonanceChange(preset.tension); p.onComplexityChange(preset.detail); }}>
              {preset.label}</button>)}
          </div>}
          <details className="compose-disclosure expression-disclosure">
            <summary><span>Fine-tune</span><small>
              {isFollow ? p.dissonance + "% tension" : p.dissonance + "% tension · " + p.complexity + "% detail"}
            </small></summary>
            <div className="compose-disclosure-body">
              <div className="expression-control">
                <div className="field-heading"><h4>Chord tension</h4>
                  <output>{p.dissonance}<span>%</span></output></div>
                <CustomSlider value={p.dissonance} min={0} max={100}
                  onChange={p.onDissonanceChange} label="Chord tension" />
                <div className="range-captions"><span>Familiar</span><span>Unexpected</span></div>
              </div>
              {!isFollow && <div className="expression-control">
                <div className="field-heading"><h4>Rhythmic detail</h4>
                  <output>{p.complexity}<span>%</span></output></div>
                <CustomSlider value={p.complexity} min={0} max={100}
                  onChange={p.onComplexityChange} label="Rhythmic detail" />
                <div className="range-captions"><span>Spacious</span><span>Intricate</span></div>
              </div>}
            </div>
          </details>
        </section>}

        {hasTakes && <details className="compose-disclosure take-lab-disclosure">
          <summary><span>Compare takes</span><small>
            {p.takeViews.length ? p.takeViews.length + " saved / fresh" : "Explore alternatives"}
          </small></summary>
          <div className="compose-disclosure-body">
            <HarmonyTakeLab enabled={p.canExploreTakes} takes={p.takeViews}
              previewIndex={p.previewTakeIndex} onExplore={p.onExploreTakes}
              onSelect={p.onSelectTake} onAudition={p.onAuditionTake}
              onSave={p.onSaveTake} onRemoveSaved={p.onRemoveSavedTake}
              onAccept={p.onAcceptTake} onDiscard={p.onDiscardTakes} />
          </div>
        </details>}

        {canShowForm && <details className="compose-disclosure song-form-disclosure">
          <summary><span>Song structure</span><small>
            {p.arrangementSections.length > 0
              ? p.arrangementSections.length + " sections · " + (p.melodyBarCount ?? 0) + " bars"
              : "Expand a 4- or 8-bar idea"}
          </small></summary>
          <div className="compose-disclosure-body">
            {p.arrangementSections.length === 0 && <p className="generation-hint">
              Turn your idea into A–A′–B–A or A–B–A′–B, with a contrasting bridge.
            </p>}
            <div className="field-heading"><h4>Section plan</h4></div>
            <div className="generation-mode" role="group" aria-label="Song form">
              <button type="button" aria-pressed={p.songForm === "AABA"}
                onClick={() => p.onSongFormChange("AABA")}>A–A′–B–A</button>
              <button type="button" aria-pressed={p.songForm === "ABAB"}
                onClick={() => p.onSongFormChange("ABAB")}>A–B–A′–B</button>
            </div>
            <div className="expression-control">
              <div className="field-heading"><h4>Section contrast</h4>
                <output>{p.formContrast}<span>%</span></output></div>
              <CustomSlider value={p.formContrast} min={0} max={100}
                onChange={p.onFormContrastChange} label="Section contrast" />
            </div>
            <button type="button" className="secondary-button wide song-form-build"
              disabled={!p.canBuildSongForm} onClick={p.onBuildSongForm}>
              Build {p.melodyBarCount && [4, 8].includes(p.melodyBarCount)
                ? p.melodyBarCount * 4 : 16}-bar song form
            </button>
            {p.arrangementSections.length > 0 && <ol className="song-form-sections"
              aria-label="Current arrangement sections">
              {p.arrangementSections.map((section, i) => <li key={i}>
                <strong>{section.label}</strong>
                <span>Bars {section.startBar + 1}–{section.startBar + section.bars}
                  {" · "}{section.role}</span>
              </li>)}
            </ol>}
          </div>
        </details>}
      </div>

      <div className="compose-actions">
        <button type="button" className="primary-button generate-button"
          disabled={p.previewTakeIndex !== null || (isFollow && p.melodyTracks.length === 0)}
          onClick={p.onGenerate} aria-keyshortcuts="Control+g Meta+g">
          <span>{!isFollow ? "Generate pattern"
            : p.melodyTask === "harmonize" ? "Harmonize melody"
              : p.melodyTask === "continue" ? "Continue melody" : "Reimagine melody"}</span>
          <kbd>{shortcut}</kbd>
        </button>
        {p.canVary && <button type="button" className="text-button variation-button"
          disabled={p.previewTakeIndex !== null} onClick={p.onAddVariation}
          title={isFollow ? "Try this melody action with fresh material" : "Make a new rhythmic variation"}>
          {!isFollow ? "Try a variation" :
            p.melodyTask === "harmonize" ? "Try another harmonization"
              : p.melodyTask === "continue" ? "Try another continuation" : "Try another reimagination"}
        </button>}
      </div>
    </div>
  );
}
