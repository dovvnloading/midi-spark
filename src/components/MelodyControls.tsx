import { CustomDropdown } from "./CustomDropdown";
import { CustomSlider } from "./CustomSlider";
import { HarmonyGuideEditor } from "./HarmonyGuideEditor";
import type { HarmonyConstraint } from "../lib/theory";
import type { AccompanimentDensity, MelodyKeyStrategy, HarmonicPacing } from "../lib/adaptive";
import type { ContinuationBars } from "../lib/motif";
import type { MelodySourceScope } from "../lib/melodyScope";
import type { LoopRange } from "../lib/timeline";

export interface MelodyControlsProps {
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
  onMelodySourceTrackChange: (index: number) => void;
  onHarmonicFitChange: (value: number) => void;
  onAccompanimentDensityChange: (value: AccompanimentDensity) => void;
  onMelodyKeyStrategyChange: (value: MelodyKeyStrategy) => void;
}

export function MelodyControls(p: MelodyControlsProps) {
  return (
    <section className="compose-module follow-workflow-section">
      <div className="section-heading"><h3>Source melody</h3></div>
      <div className="melody-adaptive-controls">
        {p.melodyTracks.length > 0
          ? <label className="field-control">
            <span>Track</span>
            <CustomDropdown ariaLabel="Source melody track" value={p.melodySourceTrackIndex ?? ""}
              options={p.melodyTracks.map(track => ({
                label: track.name + " · " + track.noteCount + " notes", value: track.index,
              }))}
              onChange={value => p.onMelodySourceTrackChange(Number(value))} />
          </label>
          : <p className="generation-hint" role="status">
            Draw a melody in the piano roll or import a MIDI file.
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
        <div className="expression-control">
          <div className="field-heading melody-step-heading">
            <h4>{p.melodyTask === "harmonize" ? "Harmonic fit" : "Creative distance"}</h4>
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

        <details className="compose-disclosure melody-advanced">
          <summary>
            <span>{p.melodyTask === "harmonize" ? "Harmony settings" : "Melody settings"}</span>
            <small>{p.melodyTask === "harmonize"
              ? p.harmonyExploration + "% explore"
              : p.melodyKeyStrategy === "detect" ? "Detect key" : "Compose key"}</small>
          </summary>
          <div className="melody-advanced-content">
            {p.melodyTask === "harmonize" && <>
              <div className="expression-control">
                <div className="field-heading"><h4>Harmony exploration</h4>
                  <output>{p.harmonyExploration}<span>%</span></output></div>
                <CustomSlider value={p.harmonyExploration} min={0} max={100}
                  onChange={p.onHarmonyExplorationChange} label="Harmony exploration" />
                <div className="range-captions"><span>Closest path</span><span>More alternatives</span></div>
                <p className="generation-hint">Raise exploration to try other chords that fit the melody.</p>
              </div>
              <div className="expression-control">
                <div className="field-heading"><h4>Phrase coherence</h4>
                  <output>{p.phraseCoherence}<span>%</span></output></div>
                <CustomSlider value={p.phraseCoherence} min={0} max={100}
                  onChange={p.onPhraseCoherenceChange} label="Phrase coherence" />
                <div className="range-captions"><span>Free harmonization</span><span>Thematic callbacks</span></div>
                <p className="generation-hint">With exploration above zero, higher values give repeating phrases similar chord movement.</p>
              </div>
              <div className="field-heading"><h4>Protected chord regions</h4>
                <span className="field-hint">{p.lockedChordCount} locked</span></div>
              <p className="generation-hint">Lock a chord in the piano roll to keep its bass and harmony when generating again.</p>
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
              <p className="generation-hint">Adaptive adds a mid-bar change when the melody suggests new harmony.</p>
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
    </section>
  );
}
