import { ArrowUpRight, AudioLines, Info, Layers, Music2, Shuffle, SlidersHorizontal, Sparkles } from "lucide-react";
import { CustomDropdown } from "./CustomDropdown";
import { SoundPicker } from "./SoundPicker";
import { CustomSlider } from "./CustomSlider";
import { ROOT_NOTES } from "../lib/constants";
import type { SynthType } from "../lib/audio";
import type { AccompanimentDensity, MelodyKeyStrategy, HarmonicPacing } from "../lib/adaptive";
import type { ContinuationBars } from "../lib/motif";
import type { MelodySourceScope } from "../lib/melodyScope";
import type { LoopRange } from "../lib/timeline";

export interface SidebarProps {
  root: string; mode: "major" | "minor"; dissonance: number; complexity: number; bars: number; canVary: boolean;
  synthType: SynthType; multiTrack: boolean;
  generationMode: "single" | "layers";
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
          <p>{p.melodySourceMode === "follow"
            ? "Bring a melody. Build everything around it."
            : "Start with a key, shape the feeling, and make it yours."}</p>
        </div>

        <div className="composition-summary" aria-label={"Current setup: " + p.root + " " + p.mode + ", " +
          (p.melodySourceMode === "follow" ? (p.melodyBarCount ?? 0) + " melody bars" : p.bars + " bars")}>
          <span className="composition-summary-icon"><Music2 size={17} strokeWidth={1.8} /></span>
          <span className="composition-summary-copy">
            <small>YOUR STARTING POINT</small>
            <strong>{p.root} {p.mode} <span>·</span>
              {p.melodySourceMode === "follow" ? (p.melodyBarCount === null ? "Draw a melody" : p.melodyBarCount + " bars") : p.bars + " bars"}</strong>
          </span>
          <span className="composition-summary-status" aria-hidden="true" />
        </div>

        <section className="field-section compose-section melody-source-section">
          <div className="section-heading">
            <span className="section-heading-icon"><Music2 size={15} /></span>
            <h3>Starting point</h3>
            <span className="section-index">MELODY-AWARE</span>
          </div>
          <div className="generation-mode" role="group" aria-label="Generation starting point">
            <button type="button" aria-pressed={p.melodySourceMode === "scratch"}
              onClick={() => p.onMelodySourceModeChange("scratch")}>From scratch</button>
            <button type="button" aria-pressed={p.melodySourceMode === "follow"}
              onClick={() => p.onMelodySourceModeChange("follow")}>Follow melody</button>
          </div>
          {p.melodySourceMode === "follow" && <div className="melody-adaptive-controls">
            <div className="melody-step-heading"><span aria-hidden="true">1</span><h4>Choose source</h4></div>
            {p.melodyTracks.length > 0 ? <label className="field-control">
              <span>Source melody track</span>
              <CustomDropdown ariaLabel="Source melody track" value={p.melodySourceTrackIndex ?? ""}
                options={p.melodyTracks.map(track => ({
                  label: track.name + " · " + track.noteCount + " notes", value: track.index,
                }))}
                onChange={value => p.onMelodySourceTrackChange(Number(value))} />
            </label> : <p className="generation-hint" role="status">
              Draw notes in the piano roll, or import a MIDI file, to choose a melody.
            </p>}
            <div className="field-heading"><h4>Source phrase</h4></div>
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
            <div className="melody-step-heading"><span aria-hidden="true">2</span><h4>Choose action</h4></div>
            <div className="generation-mode melody-task" role="group" aria-label="Melody operation">
              <button type="button" aria-pressed={p.melodyTask === "harmonize"}
                onClick={() => p.onMelodyTaskChange("harmonize")}>Harmonize</button>
              <button type="button" aria-pressed={p.melodyTask === "continue"}
                onClick={() => p.onMelodyTaskChange("continue")}>Continue</button>
              <button type="button" aria-pressed={p.melodyTask === "reimagine"}
                onClick={() => p.onMelodyTaskChange("reimagine")}>Reimagine</button>
            </div>
            <p className="generation-hint melody-task-help" role="status">
              {p.melodyTask === "harmonize"
                ? "Build backing parts that follow your melody. The source notes stay untouched."
                : p.melodyTask === "continue"
                  ? "Extend the chosen phrase on a separate track, leaving the original unchanged."
                  : "Create a new interpretation on a separate track, soloed for comparison."}
            </p>
            <div className="melody-step-heading"><span aria-hidden="true">3</span><h4>Tune result</h4></div>
            {p.melodyTask === "harmonize" ? <>
            <div className="expression-control">
              <div className="field-heading"><h4>Harmonic fit</h4>
                <output>{p.harmonicFit}<span>%</span></output></div>
              <CustomSlider value={p.harmonicFit} min={0} max={100}
                onChange={p.onHarmonicFitChange} label="Harmonic fit to melody" />
              <div className="range-captions"><span>Exploratory</span><span>Close fit</span></div>
            </div>

            </> : <>
            <div className="expression-control">
              <div className="field-heading"><h4>Creative distance</h4>
                <output>{p.motifCreativity}<span>%</span></output></div>
              <CustomSlider value={p.motifCreativity} min={0} max={100}
                onChange={p.onMotifCreativityChange} label="Melodic creative distance" />
              <div className="range-captions"><span>Recognizable</span><span>Adventurous</span></div>
            </div>
            {p.melodyTask === "continue" && <>
              <div className="field-heading"><h4>Additional bars</h4></div>
              <div className="generation-mode melody-bar-count" role="group" aria-label="Continuation length">
                {([1, 2, 4, 8] as const).map(count =>
                  <button key={count} type="button" aria-pressed={p.continuationBars === count}
                    onClick={() => p.onContinuationBarsChange(count)}>{count}</button>)}
              </div>
              <p className="generation-hint">MIDI Spark uses the chosen phrase as a motif, then
                places the answer after the end of your original melody track—never on top of later notes.
                Source notes remain exactly as drawn.</p>
            </>}
            {p.melodyTask === "reimagine" && <p className="generation-hint">
              Create an alternate lead on a separate track. Its first and final notes
              remain recognizable, and it is soloed for easy A/B listening.</p>}
            </>}
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
          </div>}
        </section>

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
          <p className="browser-sound-export-hint">Browser playback sound only.
            MIDI export contains notes and General MIDI programs, not this synth patch.</p>
        </section>

        {(p.melodySourceMode === "scratch" || p.melodyTask === "harmonize") && <section className="field-section compose-section expression-section">
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
          {p.melodySourceMode === "scratch" && <>
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
          </>}
        </section>}

        {p.melodySourceMode === "scratch" && <section className="field-section compose-section arrangement-section">
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
        </section>}
      </div>

      <div className="compose-actions">
        <div className="compose-action-topline"><span><span className="ready-indicator" />
          {p.melodySourceMode === "follow" ? "MELODY FIRST" : "READY WHEN YOU ARE"}</span>
          <small>{p.melodySourceMode === "follow" ? "Melody length · " + p.mode : p.bars + " bars · " + p.mode}</small></div>
        <button type="button" className="primary-button generate-button"
          disabled={p.melodySourceMode === "follow" && p.melodyTracks.length === 0}
          onClick={p.onGenerate} aria-keyshortcuts="Control+g Meta+g">
          <Sparkles size={17} strokeWidth={1.9} />
          <span>{p.melodySourceMode !== "follow" ? "Generate pattern"
            : p.melodyTask === "harmonize" ? "Harmonize melody"
              : p.melodyTask === "continue" ? "Continue melody" : "Reimagine melody"}</span>
          <kbd>{shortcut}</kbd>
        </button>
        <button type="button" className="text-button variation-button" disabled={!p.canVary} onClick={p.onAddVariation}
          title={p.canVary
            ? p.melodySourceMode === "follow" ? "Regenerate only the selected operation's output" : "Create a rhythmic variation"
            : "Draw or generate notes to unlock variations"}>
          <Shuffle size={15} /><span>{p.melodySourceMode !== "follow" ? "Create a variation"
            : p.melodyTask === "harmonize" ? "Try another harmonization"
              : p.melodyTask === "continue" ? "Try another continuation" : "Try another reimagination"}</span><ArrowUpRight size={14} />
        </button>
        <p className="compose-action-note"><Info size={12} />
          {p.melodySourceMode === "follow"
            ? "Only the selected generated part is replaced. Your source melody stays untouched."
            : "Generation replaces the pattern. Undo restores it."}</p>
      </div>
    </div>
  );
}
