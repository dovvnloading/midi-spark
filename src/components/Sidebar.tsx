import { ArrowUpRight } from "./StudioIcons";
import { CustomDropdown } from "./CustomDropdown";
import { SoundPicker } from "./SoundPicker";
import { CustomSlider } from "./CustomSlider";
import { HarmonyGuideEditor } from "./HarmonyGuideEditor";
import { HarmonyTakeLab, type HarmonyTakeView } from "./HarmonyTakeLab";
import { ROOT_NOTES } from "../lib/constants";
import type { SynthType } from "../lib/audio";
import type { AccompanimentDensity, MelodyKeyStrategy, HarmonicPacing } from "../lib/adaptive";
import type { ContinuationBars } from "../lib/motif";
import type { MelodySourceScope } from "../lib/melodyScope";
import type { LoopRange } from "../lib/timeline";
import type { HarmonyConstraint, ArrangementSection } from "../lib/theory";
import type { SongForm } from "../lib/songForm";

export interface SidebarProps {
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
  melodyTracks: { index: number; name: string; noteCount: number }[];
  melodyBarCount: number | null;
  melodySourceTrackIndex: number | null;
  melodyPhraseScope: MelodySourceScope;
  onMelodyPhraseScopeChange: (value: MelodySourceScope) => void;
  selectedMelodyNoteCount: number;
  hasExplicitLoop: boolean;
  sourceLoopRange: LoopRange | null;
  onSourceLoopRangeChange: (range: LoopRange | null) => void;
  harmonicFit: number;
  harmonyExploration: number;
  onHarmonyExplorationChange: (value: number) => void;
  phraseCoherence: number;
  onPhraseCoherenceChange: (value: number) => void;
  lockedChordCount: number;
  onUnlockAllChords: () => void;
  harmonyGuides: { index: number; guide: HarmonyConstraint }[];
  availableHarmonyChords: string[];
  onAddHarmonyGuide: (bar: number, chord: string, kind: HarmonyConstraint["kind"]) => void;
  onRemoveHarmonyGuide: (index: number) => void;
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
  accompanimentDensity: AccompanimentDensity;
  harmonicPacing: HarmonicPacing;
  onHarmonicPacingChange: (value: HarmonicPacing) => void;
  melodyKeyStrategy: MelodyKeyStrategy;
  melodyTask: "harmonize" | "continue" | "reimagine";
  motifCreativity: number;
  continuationBars: ContinuationBars;
  onMelodyTaskChange: (task: "harmonize" | "continue" | "reimagine") => void;
  onMotifCreativityChange: (value: number) => void;
  onContinuationBarsChange: (value: ContinuationBars) => void;
  onMelodySourceModeChange: (mode: "scratch" | "follow") => void;
  onMelodySourceTrackChange: (index: number) => void;
  onHarmonicFitChange: (value: number) => void;
  onAccompanimentDensityChange: (value: AccompanimentDensity) => void;
  onMelodyKeyStrategyChange: (value: MelodyKeyStrategy) => void;
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

/** One clear primary workflow. Specialist controls stay intact behind
 * native, keyboard-accessible disclosures; users never have to wade through
 * generation internals before finding the basic Create action. */
export function Sidebar(p: SidebarProps) {
  const shortcut = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘ G" : "Ctrl G";
  const isFollow = p.melodySourceMode === "follow";
  const isHarmonizing = isFollow && p.melodyTask === "harmonize";
  const hasTakes = isHarmonizing && (p.canExploreTakes || p.takeViews.length > 0);
  const canShowForm = p.canBuildSongForm || p.arrangementSections.length > 0;
  const activeLength = isFollow ? p.melodyBarCount : p.bars;

  return (
    <div className="compose-panel">
      <div className="inspector-content compose-content">
        <header className="compose-compact-intro">
          <div className="compose-intro-label">
            <span className="eyebrow">COMPOSE</span>
            <span className="panel-version">01 / CREATE</span>
          </div>
          <h2>Make music.</h2>
          <p>{p.root} {p.mode} <span aria-hidden="true">·</span>{" "}
            {activeLength === null ? "Draw or import a melody" : activeLength + " bars"}</p>
        </header>

        <section className="field-section compose-section melody-source-section">
          <div className="section-heading">
            <h3>Starting point</h3>
          </div>
          <div className="generation-mode" role="group" aria-label="Generation starting point">
            <button type="button" aria-pressed={!isFollow}
              onClick={() => p.onMelodySourceModeChange("scratch")}>From scratch</button>
            <button type="button" aria-pressed={isFollow}
              onClick={() => p.onMelodySourceModeChange("follow")}>Follow melody</button>
          </div>
        </section>

        <section className="field-section compose-section compact-key-section">
          <div className="section-heading"><h3>Key &amp; scale</h3></div>
          <div className="field-pair labeled-field-pair">
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
        </section>

        {isFollow && <section className="field-section compose-section follow-workflow-section">
          <div className="section-heading"><h3>Work with melody</h3></div>
          <div className="melody-adaptive-controls">
            <div className="melody-step-heading"><h4>Source</h4></div>
            {p.melodyTracks.length > 0
              ? <label className="field-control">
                <span>Source melody track</span>
                <CustomDropdown ariaLabel="Source melody track" value={p.melodySourceTrackIndex ?? ""}
                  options={p.melodyTracks.map(track => ({
                    label: track.name + " · " + track.noteCount + " notes", value: track.index,
                  }))}
                  onChange={value => p.onMelodySourceTrackChange(Number(value))} />
              </label>
              : <p className="generation-hint" role="status">
                Draw notes in the piano roll or import MIDI to choose a melody.
              </p>}

            <div className="melody-step-heading"><h4>Action</h4></div>
            <div className="generation-mode melody-task" role="group" aria-label="Melody operation">
              <button type="button" aria-pressed={p.melodyTask === "harmonize"}
                onClick={() => p.onMelodyTaskChange("harmonize")}>Harmonize</button>
              <button type="button" aria-pressed={p.melodyTask === "continue"}
                onClick={() => p.onMelodyTaskChange("continue")}>Continue</button>
              <button type="button" aria-pressed={p.melodyTask === "reimagine"}
                onClick={() => p.onMelodyTaskChange("reimagine")}>Reimagine</button>
            </div>
            <p className="generation-hint melody-task-help" role="status">
              {p.melodyTask === "harmonize" ? "Add bass and harmony around your original melody."
                : p.melodyTask === "continue" ? "Write the next phrase without changing the source."
                  : "Create a separate alternate lead for comparison."}
            </p>
            <div className="melody-step-heading"><h4>{p.melodyTask === "harmonize" ? "Harmonic fit" : "Creative distance"}</h4></div>
            <div className="expression-control">
              <div className="field-heading">
                <output>{p.melodyTask === "harmonize" ? p.harmonicFit : p.motifCreativity}<span>%</span></output>
              </div>
              {p.melodyTask === "harmonize"
                ? <CustomSlider value={p.harmonicFit} min={0} max={100}
                  onChange={p.onHarmonicFitChange} label="Harmonic fit to melody" />
                : <CustomSlider value={p.motifCreativity} min={0} max={100}
                  onChange={p.onMotifCreativityChange} label="Melodic creative distance" />}
              <div className="range-captions"><span>{p.melodyTask === "harmonize" ? "Exploratory" : "Recognizable"}</span>
                <span>{p.melodyTask === "harmonize" ? "Close fit" : "Adventurous"}</span></div>
            </div>
            {p.melodyTask === "continue" && <div className="continuation-length">
              <div className="field-heading"><h4>Additional bars</h4></div>
              <div className="generation-mode melody-bar-count" role="group" aria-label="Continuation length">
                {([1, 2, 4, 8] as const).map(count =>
                  <button key={count} type="button" aria-pressed={p.continuationBars === count}
                    onClick={() => p.onContinuationBarsChange(count)}>{count}</button>)}
              </div>
            </div>}

            <details className="compose-disclosure melody-scope-disclosure">
              <summary><span>Phrase selection</span><small>
                {p.melodyPhraseScope === "track" ? "Full track" :
                  p.melodyPhraseScope === "selected" ? "Selected notes" : "Loop range"}
              </small></summary>
              <div className="compose-disclosure-body">
                <div className="field-heading"><h4>Phrase source</h4></div>
            <div className="generation-mode melody-task" role="group" aria-label="Melody source phrase">
              <button type="button" aria-pressed={p.melodyPhraseScope === "track"}
                onClick={() => p.onMelodyPhraseScopeChange("track")}>Full track</button>
              <button type="button" aria-pressed={p.melodyPhraseScope === "selected"}
                onClick={() => p.onMelodyPhraseScopeChange("selected")}>Selected</button>
              <button type="button" aria-pressed={p.melodyPhraseScope === "loop"}
                onClick={() => p.onMelodyPhraseScopeChange("loop")}>Loop range</button>
            </div>
            <p className="generation-hint" role="status">
              {p.melodyPhraseScope === "track"
                ? "Use every note on the source track, including linked continuation when harmonizing."
                : p.melodyPhraseScope === "selected"
                  ? p.selectedMelodyNoteCount > 0
                    ? p.selectedMelodyNoteCount + " source notes selected · switch to Select tool (V) to edit the phrase."
                    : "Select melody notes with the Select tool (V) on the chosen track first."
                  : p.hasExplicitLoop
                    ? "Use melody attacks inside the chosen range. You can also adjust the handles on the timeline."
                    : "Choose bars below to set a range. On a keyboard, Shift-drag the ruler; on touch, use the bar selectors or timeline handles."}
            </p>
            {p.melodyPhraseScope === "loop" && p.melodyBarCount !== null && p.melodyBarCount > 0 && (() => {
              const lastBar = Math.max(1, p.melodyBarCount);
              const from = p.sourceLoopRange ? Math.floor(p.sourceLoopRange.start / 4) + 1 : 1;
              const through = p.sourceLoopRange ? Math.ceil(p.sourceLoopRange.end / 4) : lastBar;
              const bars = Array.from({length: lastBar}, (_, index) =>
                ({ label: "Bar " + (index + 1), value: index + 1 }));
              return <div className="source-loop-editor" aria-label="Choose melody loop bars">
                <div className="field-pair labeled-field-pair">
                  <label className="field-control"><span>From bar</span>
                    <CustomDropdown ariaLabel="Loop from bar" value={from} options={bars}
                      onChange={value => {
                        const start = Number(value);
                        p.onSourceLoopRangeChange({start: (start - 1) * 4,
                          end: Math.max(start, through) * 4});
                      }} />
                  </label>
                  <label className="field-control"><span>Through bar</span>
                    <CustomDropdown ariaLabel="Loop through bar" value={through} options={bars}
                      onChange={value => {
                        const end = Number(value);
                        p.onSourceLoopRangeChange({start: (Math.min(from, end) - 1) * 4,
                          end: end * 4});
                      }} />
                  </label>
                </div>
                <div className="source-loop-actions">
                  <button className="text-button" type="button" onClick={() =>
                    p.onSourceLoopRangeChange({start: 0, end: lastBar * 4})}>Use full pattern</button>
                  <button className="text-button" type="button" disabled={!p.sourceLoopRange}
                    onClick={() => p.onSourceLoopRangeChange(null)}>Clear loop selection</button>
                </div>
                <p className="generation-hint">Selecting a bar range includes notes that start within those bars.
                  Adjust the ruler handles for finer timing.</p>
              </div>;
            })()}
              </div>
            </details>

            <details className="melody-advanced">
              <summary>
                <strong>Advanced {p.melodyTask === "harmonize" ? "harmony" : "melody"} options</strong>
                <span>{p.melodyTask === "harmonize"
                  ? p.harmonicPacing + " pacing · " + p.accompanimentDensity + " motion · " + p.harmonyExploration + "% explore · " + p.phraseCoherence + "% form"
                  : "Key: " + (p.melodyKeyStrategy === "detect" ? "detect melody" : "Compose key")}</span>
              </summary>
              <div className="melody-advanced-content">
                {p.melodyTask === "harmonize" && <>
            <div className="expression-control">
              <div className="field-heading"><h4>Harmony exploration</h4>
                <output>{p.harmonyExploration}<span>%</span></output></div>
              <CustomSlider value={p.harmonyExploration} min={0} max={100}
                onChange={p.onHarmonyExplorationChange} label="Harmony exploration" />
              <div className="range-captions"><span>Closest path</span><span>More alternatives</span></div>
              <p className="generation-hint">Find different near-best chord paths without forcing
                arbitrary dissonance. Zero uses the original harmonic search.</p>
            </div>
            <div className="expression-control">
              <div className="field-heading"><h4>Phrase coherence</h4>
                <output>{p.phraseCoherence}<span>%</span></output></div>
              <CustomSlider value={p.phraseCoherence} min={0} max={100}
                onChange={p.onPhraseCoherenceChange} label="Phrase coherence" />
              <div className="range-captions"><span>Free harmonization</span><span>Thematic callbacks</span></div>
              <p className="generation-hint">When exploration is above zero, repeated or transposed
                melodic ideas can share a chord-root arc. Melody-supported endings favor resolution.
                Only near-best, melody-compatible chord paths are considered.</p>
            </div>
            <div className="field-heading"><h4>Protected chord regions</h4>
              <span className="field-hint">{p.lockedChordCount} locked</span></div>
            <p className="generation-hint">Click the padlock on any generated chord in the
              piano-roll chord lane to preserve that chord and its bass/harmony notes.
              Generate again to explore only the unlocked regions. Lock changes are undoable.</p>
            {p.lockedChordCount > 0 && <button type="button" className="text-button"
              onClick={p.onUnlockAllChords}>Unlock all {p.lockedChordCount} chord regions</button>}
            <HarmonyGuideEditor sourceTrackIndex={p.melodySourceTrackIndex}
              totalBars={p.melodyBarCount} availableChords={p.availableHarmonyChords}
              keyStrategy={p.melodyKeyStrategy} guides={p.harmonyGuides}
              onAddGuide={p.onAddHarmonyGuide} onRemoveGuide={p.onRemoveHarmonyGuide} />
            <div className="field-heading"><h4>Chord changes</h4></div>
            <div className="generation-mode melody-task" role="group" aria-label="Harmonic pacing">
              <button type="button" aria-pressed={p.harmonicPacing === "bar"}
                onClick={() => p.onHarmonicPacingChange("bar")}>Each bar</button>
              <button type="button" aria-pressed={p.harmonicPacing === "adaptive"}
                onClick={() => p.onHarmonicPacingChange("adaptive")}>Adaptive</button>
              <button type="button" aria-pressed={p.harmonicPacing === "half-bar"}
                onClick={() => p.onHarmonicPacingChange("half-bar")}>2 / bar</button>
            </div>
            <p className="generation-hint">Adaptive adds a mid-bar chord only when both
              halves suggest different harmony. No extra chords for passing notes alone.</p>
            <div className="field-heading"><h4>Accompaniment motion</h4></div>
            <div className="generation-mode melody-density" role="group" aria-label="Accompaniment motion">
              {(["sparse", "balanced", "active"] as const).map(value =>
                <button key={value} type="button" aria-pressed={p.accompanimentDensity === value}
                  onClick={() => p.onAccompanimentDensityChange(value)}>
                  {value === "sparse" ? "Sparse" : value === "balanced" ? "Balanced" : "Active"}
                </button>)}
            </div>
                </>}
            <div className="field-heading melody-key-heading"><h4>Key strategy</h4></div>
            <div className="generation-mode" role="group" aria-label="Melody key strategy">
              <button type="button" aria-pressed={p.melodyKeyStrategy === "manual"}
                onClick={() => p.onMelodyKeyStrategyChange("manual")}>Compose key</button>
              <button type="button" aria-pressed={p.melodyKeyStrategy === "detect"}
                onClick={() => p.onMelodyKeyStrategyChange("detect")}>Detect melody</button>
            </div>
            {p.melodyTask === "harmonize" && p.melodyPhraseScope !== "track" && <p className="generation-hint">
              {p.melodyPhraseScope === "selected" ? "Only bars containing selected notes receive new backing." :
                "Only bars in your loop range receive new backing."}
              {" "}Duplicate generated parts first to retain earlier edits.
            </p>}
              </div>
            </details>
          </div>
        </section>}

        {!isFollow && <section className="field-section compose-section compact-pattern-section">
          <div className="section-heading"><h3>Pattern</h3></div>
          <div className="field-heading"><h4>Length</h4><span className="field-hint">BARS</span></div>
          <div className="segmented" role="group" aria-label="Pattern length">
            {[4, 8, 12, 16].map(length => <button type="button" key={length}
              aria-pressed={p.bars === length} onClick={() => p.onBarsChange(length)}>{length}</button>)}
          </div>
          <div className="field-heading arrangement-label"><h4>Parts</h4></div>
          <div className="generation-mode" role="group" aria-label="Generation layers">
            <button type="button" aria-pressed={p.generationMode === "single"}
              onClick={() => p.onGenerationModeChange("single")}>Single track</button>
            <button type="button" aria-pressed={p.generationMode === "layers"}
              onClick={() => p.onGenerationModeChange("layers")}>Bass + Harmony</button>
          </div>
        </section>}

        <section className="field-section compose-section sound-section">
          <div className="section-heading">
            <h3>{p.multiTrack ? "Instruments" : "Sound"}</h3>
          </div>
          {p.multiTrack
            ? <button type="button" className="secondary-button wide track-studio-link"
              onClick={p.onOpenTracks}>Open track mixer <ArrowUpRight size={15} aria-hidden="true" /></button>
            : <SoundPicker label="Preview sound" value={p.synthType}
              onChange={p.onSynthChange} onPreviewError={p.onPreviewError} />}
        </section>

        {!isFollow && <section className="field-section compose-section compact-feel-section">
          <div className="section-heading"><h3>Character</h3></div>
          <div className="feel-presets" role="group" aria-label="Quick expression presets">
            {FEEL_PRESETS.map(preset => <button key={preset.label} type="button"
              title={preset.description}
              aria-pressed={p.dissonance === preset.tension && p.complexity === preset.detail}
              onClick={() => { p.onDissonanceChange(preset.tension); p.onComplexityChange(preset.detail); }}>
              {preset.label}</button>)}
          </div>
        </section>}

        {(!isFollow || isHarmonizing) && <details className="compose-disclosure expression-disclosure">
          <summary><span>Fine-tune expression</span><small>
            {isFollow ? "Chord tension " + p.dissonance + "%" :
              "Tension " + p.dissonance + "% · Detail " + p.complexity + "%"}
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
        </details>}

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
