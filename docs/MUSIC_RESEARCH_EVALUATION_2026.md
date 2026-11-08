# MIDI Spark — Research & Evaluation Audit
## Symbolic melody conditioning, harmony, continuation, and musical quality
**Research date:** 8 November 2026  
**Evidence:** MIDI Spark main branch at commit bc15914c; upstream project documentation and peer-reviewed papers linked below.  
**Status:** Comparative research and a reproducible local benchmark are implemented on a review branch. The synthetic benchmark is a diagnostic, not a trained-model competition.

## Executive finding

MIDI Spark has a defensible product niche: an immediately editable, browser-based, offline MIDI piano roll that keeps a user-provided melody intact while harmonizing, continuing or reimagining it. Its strongest property is **explicit control of which source notes may condition a generation** and **non-destructive track ownership**. Its weakest competitive dimensions are not note preservation or platform independence: they are the absence of measured listener preference, longer-range harmonic/phrase planning, richer arrangement textures, and variable meter.

It would be misleading to call the current deterministic harmonizer superior to a contemporary learned model without running both on the same notes, with compatible tasks and blinded listening. A paper-reported metric from another dataset cannot establish that.

Our immediate research investment is therefore a **reproducible scorecard** with original test material, explicit simple baselines and no undisclosed listening claims. The test suite can identify severe regressions and show which musical qualities actually change between commits. It cannot certify aesthetic superiority.

## 1. Capability comparison (verified upstream documentation)

| System | Primary task / conditioning | Output and user workflow | Relevant advantage | Limits for direct comparison |
|---|---|---|---|---|
| **MIDI Spark (current)** | Draw/import a source track, select notes/loop, constrain chord fit, pacing, backing density, Continue/Reimagine | Editable MIDI, browser synth/mixer, full provenance in browser sessions | Exact source preservation, scoped regeneration, offline/no new model download | Primarily rule-based; 4/4, no learned long-form style or formal listening results |
| **AccoMontage2 (ISMIR 2022)** | Melody-to-chords and piano backing; optimize note dissonance, phrase-template match and whole-piece coherence | Structured arrangement, selectable Pop/R&B/Dark harmony and texture | Explicit micro/meso/macro optimization, phrase-scale musical form, style-specific piano arrangements | Research-oriented Python-based system; task/genre different from a general multitrack editor |
| **GETMusic (IJCAI 2025)** | Arbitrary source/target track combinations and masked-position completion, discrete diffusion across aligned tracks | Symbolic multitrack MIDI | Flexible track completion and context-aware masked infill | Model/compute and vocabulary constraints; its published accompaniment experiments also condition on *ground-truth chords* |
| **MIDI-GPT (AAAI 2025, active 2026 repo)** | Bar-wise multitrack infilling and attribute-conditioned generation; context-aware attention masks | MIDI, pretrained PyTorch models, CLI/server and DAW-oriented interfaces | Per-bar control of density, duration, polyphony, pitch range/key/pitch classes in newer models; 4/8/12/16-bar contexts | Python/weights inference and integration cost; **MIT code is distinct from noncommercial pretrained weights** |
| **Magenta Studio (Google)** | MIDI Continue, Interpolate, Generate, Groove, Drumify | Ableton Live MIDI clip tools | Proven musician-centered workflow and learned continuation/interpolation/groove | Melody input monophonic; some older standalone distributions no longer maintained |
| **MusicVAE (Google Magenta)** | Sampling/interpolation and latent melodic variation | Pretrained symbolic MIDI models | Latent interpolation between musical ideas; hierarchical 16-bar decoder | Model-specific constraints; 16-bar trio checkpoint is large and not a direct harmonic-scoring baseline |
| **MusicLang** | Explicit tonal grammar, symbolic transformations, counterpoint and optional learned prediction | Python score-to-MIDI and notation workflows | More explicit chord/scale and contrapuntal abstractions | Not a drop-in browser module; base-language and model licenses differ |
| **MusicGen Melody (Meta)** | Chroma-conditioned **audio** generation | Synthesized waveform | Much richer audio/timbre output | Does not directly provide editable source-preserving MIDI note tracks |
| **MIDI-SAG (2026)** | Vocal melody MIDI plus optional audio/text-to-vocal pipelines for accompaniment | Full-song **audio** backing | Long-form structure and vocal-contingent accompaniment | Different output modality; third-party inference components have separate licenses |

### What is actually known from published results

AccoMontage2 emphasizes a meaningful weakness in MIDI Spark: musical harmony is not just immediate chord-tone membership. Its method jointly considers micro-level consonance, meso-level phrase templates and macro-level whole-song coherence. MIDI Spark's current optimization is mainly note/window evidence plus first-order chord transitions and a small cadence preference. [1, 2]

GETMusic demonstrates source/target track masking and arbitrary infilling, a useful longer-term architecture reference for selective accompaniment. Its paper reports accompaniment chord accuracy of **65.48% versus 61.17% for its PopMAG baseline**. Both systems in that experiment were also given ground-truth chord progression conditioning. These are *published numbers from their specific data and metric*, not scores that MIDI Spark can be compared with directly. [3]

MIDI-GPT is especially relevant to practical workflow research: explicit bar-mask infill, ignored contextual tracks, per-bar attributes, reproducible examples and multiple model contexts. It supports a serious external comparator protocol once weights are legally usable and computational resources exist. Its code is MIT licensed but the published pretrained weights are separately restricted to noncommercial research/education. [4]

Magenta Studio is the clearest UX lesson: Continue, Groove, Generate, Drumify and Interpolate address different musical goals. MIDI Spark now distinguishes Harmony/Continue/Reimagine, but lacks a polished audition/compare-candidates workflow, latent interpolation between two separate melodies, and learned performance groove. [5, 6]

MusicGen Melody and MIDI-SAG illustrate the distinction between MIDI-conditioned **audio** backing and editable MIDI arrangement. They should be compared only under clearly different audio/music-production tasks, never on the same MIDI score-generation leaderboard. [7, 8]

## 2. Code audit of MIDI Spark

**Source selection.** The shared melodyScope module validates full-track, selected-note and loop-onset conditioning. Explicit selection and source ownership are strengths; malformed, cross-track or missing selections fail clearly. A note crossing into a loop from before its start is not part of that onset-defined source. MIDI track ownership is persisted in browser sessions, not in standard exported MIDI meta-events.

**Harmonic candidates and search.** adaptive.ts builds tonal diatonic triads and tension-dependent sevenths, includes harmonic-minor dominant options and some modal mixture, weights duration/metric accent/velocity and possible passing tones, then runs a sequence-level dynamic-programming search over one- and half-bar regions. Region splitting is heuristic and currently bounded to 4/4; it does not understand song sections, reharmonization style labels, modulations, polymeter or extended jazz substitutions as first-class constraints.

**Voicing and texture.** Harmony/bass separation, register limits, rhythm/density, velocity following and some contrary arpeggio motion are useful engineering details. These are small rule families, not trained accompaniment textures. In particular, the objective function of the voicing picker is hand-tuned and does not measure perceptual clarity of orchestration.

**Melodic development.** motif.ts extracts a lead from near-simultaneous notes by choosing the highest onset pitch and derives a recent phrase (up to four bars). Continue reuses that timing and contour with controlled transpose, diatonic neighbors, occasional inversion and alternate repetitions. Reimagine preserves opening and cadence anchors. This is motif transformation—not learned anticipation, multi-voice separation, or hierarchically planned A/A'/B song form.

**Key analysis.** keyAnalysis.ts compares a duration-weighted pitch-class histogram to Krumhansl–Kessler major/minor profiles and reports uncertainty heuristically. Its margin is not a calibrated probability, and chromatic/modulating excerpts or short motifs can be ambiguous. The manual key override should remain visible.

**Timing and interoperability.** The internal music timeline currently assumes quarter-note units and 4/4 in generator and editor UI. This complicates correct handling of 3/4, 6/8, pickup measures, triplets and tempo-map variation. Source MIDI remains editable, but the exported standard MIDI does not preserve application-specific ownership markers. Those two issues merit separate architecture work.

**Testing maturity.** The repo's existing Vitest and Chromium tests cover correctness and end-to-end operations well. They do not automatically assess harmonic interest, phrase originality, stylistic fit, perceived sonic balance, or listener preference. The new benchmark fills part of the *diagnostic* gap only.

## 3. Reproducible local benchmark v1

### Scope and input rights

- **Ten original synthetic four-bar MIDI phrases**, deliberately authored for this project and distributed as TypeScript note data (no copyrighted song excerpts): major pop arch, minor cadence, offbeat G-major, sparse F-major sustains, D-minor chromatic passing notes, half-bar harmonic pivot, E-minor low register, Bb-major polyphony, repetitive D-major motif, and quiet Eb-major dynamics.
- **Twelve fixed random seeds per scenario**.
- **Four actual code paths per seed**: harmonize with bar pacing, harmonize with adaptive pacing, Continue and Reimagine. This yields **480 generator calls** across 10 scenarios, plus inexpensive tonic/greedy baselines.
- A new machine-readable JSON artifact and Markdown report are generated by **npm run eval:music**, including per-fixture values and percentiles. A GitHub Actions job uploads the pair for future commit-to-commit comparisons.
- The benchmark asserts exact preservation of all source-track MIDI note attributes, validity of generated pitches/velocity/timing, non-percussion channel usage, generation success and zero generated note tails beyond their chord region.

### Metric definitions, and what each cannot tell you

| Metric | Definition | Sensible interpretation and caveat |
|---|---|---|
| Chord-tone coverage | Duration × attack-accent × velocity weighted pitch-time overlapped by a labelled chord tone, divided by total weighted source note time | Higher = literal chord-tone fit; *not* proof of musical harmony. Deliberate suspensions, 9ths and altered tensions may lower it |
| Tonic-only coverage | Same statistic with a static diatonic tonic triad each bar | Deliberately weak negative control |
| Greedy-triad coverage | Independently select the best fitting diatonic triad **per bar**, without harmonic sequence planning | A *local fit* upper baseline in a limited triadic vocabulary; may win raw fit but sound worse as a progression |
| Chord changes per bar | Distinct adjacent chord-label changes divided by number of bars | Describes harmonic activity, not a target to maximize/minimize |
| Near-lead register collision | Fraction of accompaniment note-duration overlapping a source note within ±2 semitones | Flags possible register masking. Intentional unison, clusters and suspensions can be desirable |
| Chord-tail spill | Fraction of generated accompaniment notes extending beyond their assigned chord window | A correctness invariant, not an aesthetic quality score; should be zero |
| Scale-tone rate | Share of generated accompaniment notes in the selected major/minor scale | Highly chromatic but deliberate chord choices may score lower |
| Pitch-class entropy | Shannon entropy (bits) of backing pitch-class counts | Distribution breadth; noise can have higher entropy than great music |
| Take diversity | Unique exact generated MIDI signatures / twelve seeds | Measures whether the seed changes the result; novelty by itself is not quality |
| Mean melodic interval | Mean absolute semitone step between generated continuation onsets | Reveals leap sizes, not phrase appeal |
| Runtime p50/p95 | Measured execution time of all 480 calls inside the Node/Vitest process | Machine/CI load dependent; neither browser UI latency nor audio inference latency |

All values must be interpreted as **scenario-level diagnostics**, not a weighted aesthetic composite. Scenarios receive equal weight in aggregates, avoiding one dense polyphonic test dominating many small phrases. Strong user-facing claims require an independent, rights-cleared test set and human listening.

### Measured pilot — 8 November 2026 GitHub Actions

The first successful real-engine diagnostic run, **[CI run 42484176393](https://github.com/dovvnloading/midi-spark/actions/runs/42484176393)**, yielded the following **equally weighted averages across 10 synthetic scenarios** (12 seeded takes each, 480 generator calls):

| Metric | Observed |
|---|---:|
| Tonic-only chord-tone coverage | **66.8%** |
| Local greedy diatonic triads | **76.1%** |
| MIDI Spark one chord per bar | **88.6%** |
| MIDI Spark adaptive harmony | **97.3%** |
| Mean adaptive distinct chord changes per bar | **1.07** |
| Close lead-register overlap | **1.2%** |
| Generated note tails crossing chord boundaries | **0.0%** |
| Backing scale-tone rate | **99.1%** |
| Unique accompaniment takes across 12 seeds | **22.5%** |
| Unique continuation takes / reimagination takes | **100% / 100%** |
| Approximate Node/Vitest p50 / p95 operation timing | **0.43 / 0.98 ms** |

The per-fixture CSV-equivalent breakdown, all seed run descriptors, and machine-readable values are published as Markdown/JSON workflow artifacts, not copied into app state.

**Interpretation:**

- The large chord-tone membership score means the search matches the pitch classes of these synthetic phrases. It **does not mean 97.3% musical quality**: the score aligns with the engine's own objective, and broad chord vocabularies plus frequent chord changes raise it mechanically.
- The greedy comparison is **not** a matched-vocabulary, same-search ablation. It uses seven plain diatonic triads, whereas MIDI Spark considers more harmonies and optimized half-bar splits. The gap is descriptive, not causal evidence of algorithmic superiority.
- The clearest **product problem** is that only **22.5%** of generated accompaniment MIDI signatures were distinct across twelve seeds per fixture. This is roughly 2.7 distinct takes out of 12. Repeated "Try another harmonization" can therefore be an underwhelming experience. Before optimizing, add a **structural novelty** metric (chord path and grid-quantized pitch/onset patterns) that cannot be gamed by insignificant velocity jitter.
- The 100% unique melody-generation rates reflect event-signature diversity; they do not guarantee good motifs, just different MIDI events. They require a human coherence evaluation.
- The 0% chord-tail violation and unchanged source notes are meaningful **correctness** evidence. A low near-lead collision ratio suggests limited immediate register overlap but is not proof of good orchestration.
- Very small latency numbers are Node-process timings for simple fixtures; they say nothing about browser audio initialization, large input files, device memory use or neural-model deployment time.

**Next measured hypothesis:** improve the *structural* diversity and phrase coherence of alternative accompaniment takes without materially degrading source-note preservation, tone fit, or generated-track ownership. Compare the same fixture/seed set before and after any algorithmic change, and confirm with blinded listening.

### Baseline fairness and what has *not* been run

The benchmark's tonic and greedy systems are transparent **simple controls**. They lack the same chord vocabulary and full arrangement generation as MIDI Spark. Consequently, it is not a controlled algorithm-ablation study and cannot prove the sequence optimizer beats a same-vocabulary local optimizer. A future study should compare against a same-candidate greedy scorer and a sequence search with cadence/transition costs ablated.

**No AccoMontage2, GETMusic, MusicVAE, MIDI-GPT or other neural pretrained checkpoint has been run in this evaluation.** We do not invent comparisons. A valid cross-model test must use the same user-provided MIDI, chord conditioning policy, output-track inventory, evaluation metric implementation, seed scheme (as supported), and sound renderer. Missing capabilities must be marked inapplicable, not silently substituted.

### Running and auditing

Run **npm run eval:music** after npm ci. The command executes the real generator functions and writes music-evaluation.md and music-evaluation.json. The normal npm test suite also checks benchmark correctness. CI publishes **symbolic-music-evaluation** as a run artifact with the exact per-scenario values and source revision. Paths:

- tests/musicQualityFixtures.ts — original scenarios
- tests/musicQualityMetrics.ts — documented metrics and control baselines
- tests/musicQualityBenchmark.test.ts — seed sweep and preservation assertions
- scripts/run_music_eval.mjs — no-dependency Node report writer
- .github/workflows/ci.yml — execution and artifact retention

Any metric or baseline definition change must increment the benchmark identifier and document that its values are **not directly comparable** with the older version.

## 4. Listening-study protocol (not yet conducted)

A listening preference study is necessary before asserting musical quality superiority. Proposed first round:

1. Use **at least 20 independently rights-cleared melody clips** spanning pop, jazz, classical, folk, sparse/dense phrases, chromatic lines, unpitched pauses and different ranges. Split at the *composition* level, never let another excerpt from the same composition leak between tuning and test.
2. Use a **paired, randomized, blinded A/B** design. Hold melody, synth bank, instrument mix, loudness, tempo, note rendering, loop duration and output-track count constant. Run condition-matched MIDI Spark against a literal repeat/triadic baseline and, if legally available, one learned symbolic model.
3. Ask separate questions on **melody fidelity**, harmonic suitability, structural coherence, rhythmic support, balance/masking, and overall listening preference. Include **no preference** and a free-form defect field. Do not ask people to guess which output uses AI.
4. Randomize left/right assignment and trial order within listeners; include a small number of repeated anchor pairs to check consistency. Recruit a mix of musicians and non-musicians and report their groups separately.
5. Report per-listener and per-phrase variation, bootstrap confidence intervals clustered by listener and composition, and paired preference fractions. Avoid reporting only mean opinion score or treating multiple trials from one listener as independent people.
6. Pre-register exclusion rules and the primary endpoint before hearing study outcomes. Don't optimize the model on the final held-out evaluation clips.

A strict source-invariant check should run before any blind comparison. For style-sensitive results, add targeted expert listening for cadence, counterpoint and phrase-level form.

## 5. Data, deployment and licensing

**Fixtures in this PR are original and distribution-safe** for the benchmark. Future corpus expansion needs a rights assessment, not just a repository license notice.

- POP909 contains 909 professionally made arrangements of *popular songs*. Its repository has an MIT license, but this does **not automatically establish public-domain or commercial redistribution rights in the underlying compositions and recordings**. Prefer authorized, rights-cleared excerpts for release and public demos; avoid shipping the dataset inside the app. [9]
- MIDI-GPT has MIT source code, but as of this research its pretrained model weights use the Metacreation Non-Commercial Research License. Treat them separately; no direct checkpoint bundling or commercial inference integration without rights clearance. [4]
- GETMusic/Muzic, AccoMontage2 and Magenta code repositories are available for research; model weights, example songs and upstream dependency rights must be independently confirmed before redistribution. [1, 3, 5]
- Runtime behavior matters: installing a large Python model/checkpoint would change MIDI Spark's current instant, offline, browser-only posture. A future learned model should be a deliberate, optional inference adapter, with user disclosure/consent for sending their MIDI to any external service.

## 6. Prioritized research and implementation roadmap

| Priority | Research work | Why it matters | Gate before release |
|---|---|---|---|
| P0 | Establish baseline report and quality trend history; collect 20+ licensed melodies and anonymous A/B listening | Without it, claims of improved musicality are anecdotal | Reproducible scores + blind preference result |
| P0 | Counterfactual ablations: remove transition/cadence costs, disable melody-aware rhythm and key detection, hold vocabulary fixed | Determines whether each "smart" rule helps or only adds complexity | Paired same-seed comparisons on same fixtures |
| P1 | Multi-phrase form planner: repeated themes with controlled variation, section-level harmonic goals, strong cadence resolution | Current continuation is mainly local motif transformation, not composition form | Long-range repetition/contrast metrics + listener coherence |
| P1 | Explicit chord constraints / lock individual bars, style-aware chord grammar and alternative paths | More musician control, especially when a model's best chord is not the user's intent | Input constraints never violated; undo/regen safety |
| P1 | A/B candidate audition with retained takes and short reason explanations | Turns "Try another" into informed iteration, reducing accidental loss of a good idea | Selection preservation, accessibility, editing and mixer tests |
| P1 | Proper meter/timing refactor: imported time signature, pickup bars, 3/4, 6/8, triplets and tempo mapping | Current quarter-beat 4/4 assumptions limit professional MIDI interoperability | MIDI fixtures + temporal invariants + browser QA |
| P2 | Polyphonic lead voice extraction and more varied accompaniment textures with phrase-aware bass motion | Current highest-onset proxy can select wrong note in chords | Ground-truth voice annotations on rights-cleared clips |
| P2 | Optional pretrained symbolic infilling pilot (MIDI-GPT / GETMusic family or another commercially permitted model) | Better learned form may be useful, but has compute, model-licensing and user-control costs | Same-suite model evaluation, license review, opt-in privacy |
| P2 | MIDI metadata round-trip for provenance or native project file format | Standard MIDI loses generated ownership/source linkage | Import/export compatibility and editor recovery tests |

**No universal SOTA claim is warranted yet.** The strongest defensible goal is high-quality, *controllable and locally editable* melody-conditioned MIDI—and to demonstrate it by repeatable benchmarks and human preferences.

## References — primary sources reviewed 8 November 2026

1. Li Yi et al. (2022), AccoMontage2, ISMIR; https://zenodo.org/records/7316642 and source https://github.com/billyblu2000/AccoMontage2
2. Automatic melody harmonization with triad chords: A comparative study (2021); https://www.tandfonline.com/doi/full/10.1080/09298215.2021.1873392
3. Lv et al. (IJCAI 2025), GETMusic; https://ijcai.org/proceedings/2025/1127 and code https://github.com/microsoft/muzic/tree/main/getmusic
4. Metacreation Lab, MIDI-GPT; https://github.com/Metacreation-Lab/MIDI-GPT and model card https://huggingface.co/Metacreation/MIDI-GPT
5. Google Magenta Studio; https://magenta.withgoogle.com/studio
6. Google MusicVAE, implementation and model constraints; https://github.com/magenta/magenta/blob/main/magenta/models/music_vae/README.md
7. Meta AudioCraft MusicGen Melody; https://github.com/facebookresearch/audiocraft/blob/main/docs/MUSICGEN.md
8. Tsai et al. (2026), MIDI-SAG; https://arxiv.org/abs/2602.22029 and source https://github.com/fundwotsai2001/MIDI-SAG
9. POP909 Dataset; https://github.com/music-x-lab/POP909-Dataset and https://arxiv.org/abs/2008.07142
10. MusPy metrics; https://muspy.readthedocs.io/en/latest/doc/metrics.html
11. MGEval toolbox and objective/statistical evaluation philosophy; https://github.com/RichardYang40148/mgeval
12. Recent advances in music generation: methods, evaluation, and challenges (2026); https://link.springer.com/article/10.1007/s10462-026-11582-x
13. MusicLang interpretable symbolic music framework; https://github.com/MusicLang/musiclang
