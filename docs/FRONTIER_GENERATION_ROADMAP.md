# MIDI Spark — Frontier Generation Roadmap

> Goal: a **musician-steerable, source-preserving, offline-capable symbolic composition studio** that can produce and revise coherent arrangements, not merely sample a different chord each click. "Frontier" is a direction of engineering and evaluation, **not a state-of-the-art quality claim**.

## Current baseline (9 November 2026)

- Source-preserving harmonize, Continue and Reimagine already exist, with scoped regeneration, undo, multitrack MIDI and seeded repeatability.
- The existing diverse k-best harmonizer explores quality-bounded chord alternatives. Its November 8 paired synthetic benchmark shows clear structural variation improvement, but no listening preference study.
- The important gaps are *formal phrasing*, user constraints, alternative auditioning, polyphonic voice understanding, stylistically flexible accompaniment, and real-repertoire evaluation.
- Do not treat chord-tone coverage, raw diversity or an unvalidated score as perceived musical quality.

## M0 — Phrase memory in symbolic harmonic search (this change)

- Analyze repeated **two-bar lead ideas**, including pitch transposition; reject one-note coincidences and weak rhythmic matches.
- Detect candidate cadence moments from melodic arrivals/rests, not a hard-coded tonic cadence in every fourth bar.
- Softly rerank only already-credible k-best chord paths; preserve the original score/coverage budgets.
- Expose **Phrase coherence (0–100%)** in Advanced harmony, with a saved user preference and a zero-off mode.
- Include deterministic tests for callbacks, transposition, cadences, preservation and valid MIDI, without claiming increased listener preference.

**Ship criterion:** typecheck, lint, Vitest and build green; repeatability/source invariants unchanged. Run the established 480-call evaluation on both the default setting and a coherence-enabled setting; compare chord-tone coverage, structural diversity, chord changes and runtime. Do not tune solely to a single synthetic corpus.

## M1 — Constraints that composers can trust

- **Implemented (PR follow-up):** lock/unlock any generated chord region in the piano-roll chord lane, preserve its exact generated bass/harmony notes, require its chord in both harmonic search algorithms and persist the preference. Undo and scoped replacement remain safe; incompatible chords/timing return explicit errors.
- **Remaining:** allow explicit chord exclusions and user-specified new harmonic anchors, beyond locking a preexisting generated chord.
- Constrained sequence search must reject violating paths *before* scoring them, and say when constraints are impossible rather than silently disregarding them.
- Support exact scoped infill between two locked regions, preserving all non-target notes, track IDs and mixer settings.

**Ship criterion:** property-based invariants for locked regions, exact input-note identity, undo, JSON restore and repeatable regenerated takes; accessible lock/unlock controls and explicit conflict error states.

## M2 — Auditionable alternatives with informed selection

- Keep multiple chord/texture candidates as editable snapshots, not a destructive "generate again" cycle.
- A/B or A/B/C audition at the same BPM/loop point; label changes in chord roots, pacing and density without presenting invented "quality" probabilities.
- Let the user pin parts of one take and regenerate only the others. Preserve good takes across exploratory calls.

**Ship criterion:** no source mutation, playback switches without leaked voices, one undoable accept action, keyboard and screen-reader usability, and a browser regression path.

## M3 — Hierarchical musical form + arrangements

- Split harmonic planning into **phrase**, **section** and **voicing/texture** objectives. Develop A/A'/B themes with controllable contrast and meaningful cadences.
- Add genuine bass counterline generation and voice-leading across phrase boundaries. Support rhythm families, motif reuse and sparse orchestration with editable part ownership.
- For polyphonic sources, track lead voices through time instead of always selecting the highest note at each onset. Explicitly distinguish lead, bass and chordal evidence.

**Ship criterion:** right-cleared 8–32-bar form fixtures, phrase-recurrence and cadence diagnostics, voice-leading and collision checks, and blinded musician listening. Favor coherency without trading away melody-fit and register clarity.

## M4 — Evaluation that measures music, not just code

- Pair existing synthetic fixtures with **licensed or original multi-phrase MIDI** and score the same inputs/seeds across versions.
- Include same-vocabulary greedy and ablation baselines; test continuity under transposed motif returns, phrase boundaries, syncopation, chromatic melody and long gaps.
- Build *blinded*, randomized, level-matched A/B listening prompts. Sample practicing musicians and report preference proportions, uncertainty and genre spread, not just aggregate labels.
- Track p95 compute/memory for 4, 16, 32 and 64 bars in browsers; production on-device latency matters more than a single Node run.

**Ship criterion:** versioned fixture manifests, reproducible reports, prespecified regression thresholds, and evidence sufficient to keep or revert each algorithm intervention.

## M5 — Optional learned infill, without losing trust

- Define a generator interface returning typed proposals, provenance, seed, conditioning source IDs and a validation report. Both symbolic heuristics and learned backends must satisfy the same invariants.
- Pilot a small licensed symbolic model **only if weights and deployment rights permit**, ideally in a worker via WebGPU/WASM with a deterministic rule-based fallback.
- Never silently upload user MIDI. If external inference is later offered, make upload, privacy, costs, licensing and data retention explicit and opt-in.
- Audit model-conditioned output for correct timing, pitch/range, polyphony and preservation **before** committing it to the editor.

**Ship criterion:** identical integration tests across backends, accepted output only after schema/constraint validation, no loss of offline workflow, transparent compute and licensing disclosures.

## Enablers (parallel)

- Replace 4/4-only assumptions with a meter-aware internal timeline before claiming full MIDI interoperability (including 3/4, 6/8, pickups, triplets and tempo maps).
- Define a native project archive for generated-role provenance, constraints and alternative takes; standard MIDI export alone cannot preserve every app-specific edit.
- Maintain accessible, progressive controls: simple defaults, discoverable advanced parameters and one-click recovery/undo.

## Working principle

Promote a generation feature only when it improves a defined musician task **and** passes ownership, reproducibility, quality-bound and UX gates. Novelty, randomness and fashionable model labels are not sufficient.
