# Melody-conditioned composition — engineering notes

## Purpose and non-goals

Midi Spark's **Follow melody** operation is a transparent, browser-only symbolic
harmonizer. It takes an existing MIDI note track as an immutable condition and
builds chord, bass and harmony parts around it. It is not audio transcription,
a generative neural model or a guarantee of a uniquely "correct" harmony.

Design constraints:

- Do not mutate the user-authored melody, imported tracks or unrelated tracks.
- Regeneration is atomic and undoable; replace only parts owned by this source.
- All generated notes must be valid MIDI events.
- A fixed random stream produces reproducible output.
- Existing scratch generation, existing v1 local sessions and standard MIDI
  import/export must remain usable.
- Work without online services or new runtime dependencies.

The implementation lives in `src/lib/adaptive.ts`. State/UI orchestration is in
`src/App.tsx` and `src/components/Sidebar.tsx`. Ownership metadata is on
`TrackMetadata` and optional chord metadata in `ProgressionData`.

## Method

### 1. Input and segmentation

The user chooses a non-generated track with at least one note. The harmonizer
checks pitch, onset, duration and bounds, and supports up to 64 bars / 4,096
source notes. The underlying editor uses quarter-note units and a 4/4 grid.

Each input note is weighted by the amount of its duration that overlaps a bar,
metric strength (especially downbeats and beat three), velocity, and probable
passing-tone status. Short stepwise tones receive less weight than sustained
notes. Sustained notes that cross bars contribute to each overlapped bar.
This is a deliberately explainable heuristic, not trained phrase inference.

### 2. Chord vocabulary

The selected or reliably detected major/minor key supplies diatonic triads,
and sevenths where permitted by tension. Minor-key dominant chords and high
tension modal mixture expand the search. Tonal validates the resulting chord
symbols and supplies pitch classes.

The melody key detector is a *ranking heuristic*, not a calibrated confidence
model. If its result is ambiguous, the manually chosen Compose key is used.

### 3. Global harmonic optimization

For each bar and candidate chord, compute an emission score from weighted
melody-tone membership:

```
emission(chord, bar) = weighted average(
  chord-tone reward or (distance-adjusted non-chord-tone penalty)
) - tension-dependent complexity cost
```

Transitions reward plausible root movement, common tones and functional
predominant–dominant–tonic motion, while discouraging gratuitous changes in
silent bars. A first-order dynamic-programming (Viterbi-style) search picks
the highest-scoring *sequence*, rather than selecting each bar independently.
A small seeded perturbation allows repeatable alternative harmonizations.

No claim is made that these hand-tuned scores match the quality of a
state-of-the-art learned harmonization model. They provide a reliable,
inspectable no-server baseline for a controlled MIDI editor.

### 4. Accompaniment

Accompaniment uses one dedicated Bass track and one dedicated Harmony track.
The bass follows the selected chord root within a low MIDI register; the upper
chord tones are placed by a register-constrained, voice-movement minimization
search. When the melody is unusually low, the harmony moves above it instead
of piling up directly on the lead.

Sparse, balanced and active accompaniment options control note density.
If the source melody has many onsets in a bar, the generator automatically
reduces density to leave room for the lead. No operations change source notes.

### 5. Ownership and editing semantics

Generated track headers carry:
- `generatedRole: "bass" | "harmony"`
- `sourceTrackIndex: number`

These are *app-specific* fields, persisted in local browser sessions and
not exported as custom metadata into a standard MIDI file. On regeneration,
existing matching tracks retain their indexes and MIDI channels, their notes
are replaced, and all other tracks are preserved. When the source has no
generated parts, the existing track allocator reserves two free melodic
channels before any changed data can be committed.

Duplicating a generated track explicitly strips ownership so that user edits
to the copy cannot be overwritten by later regeneration. Using Undo rolls
back the entire generated progression in one step.

## Correctness and acceptance testing

Unit and integration checks cover:

- Input/source melody exact preservation (pitch, time, duration, velocity, track).
- Reusing generated track IDs on repeated harmonization.
- Leaving unrelated imported MIDI tracks and metadata unchanged.
- Selecting a nonzero source track from a multi-track file.
- Seeded repeatability and immutable state.
- Keeping notes within MIDI pitch and positive duration bounds.
- Reporting empty, malformed, over-limit and channel-exhausted cases.
- Version-one autosave and ownership-marker validation.
- Playwright/Chromium browser flow: MIDI import, track choice, harmonize,
  regenerate, undo and reload.

Run `npm run typecheck && npm run lint && npm test && npm run build` and
the existing `scripts/browser_smoke.py` production-browser checks.

## Known limitations and next steps

1. **Metric structure.** Core timeline and generation currently assume 4/4;
   variable meter, tempo maps and mid-phrase modulations need a broader
   timeline model, not a special-case added inside the harmonizer.
2. **Harmony granularity.** One chord per bar is reliable for this release.
   A later iteration can use phrase-aware half-bar or adaptive change points.
3. **Phrase and motif continuation.** Interval-contour and duration-token
   extraction can support "Continue melody" and call/response generation.
   The current release deliberately prioritizes exact preservation of the
   supplied notes over unvalidated source-editing transformations.
4. **Learned alternatives.** A future optional model should be benchmarked
   against this deterministic engine for perceived harmony, melodic identity,
   latency, memory cost, offline operation and licensing. Avoid introducing a
   large model solely to claim SOTA.
5. **Audio transcription.** Converting WAV/MP3 humming into MIDI requires a
   separate pitch/onset inference path and latency/privacy analysis.
6. **MIDI provenance.** Plain MIDI round-trips preserve notes, tracks and
   programs, not app-specific generated-track ownership. Browser sessions
   retain ownership as version-compatible session metadata.
7. **Evaluation.** Add a curated royalty-cleared dataset with expected
   harmonic analyses, randomized melody regression tests and blind listener
   preference comparisons. Optimize musical quality, not only unit tests.

## References

- Tonal music-theory library and chord API:
  https://tonaljs.github.io/tonal/docs
- *Automatic melody harmonization with triad chords: A comparative study*
  (2021), DOI: https://doi.org/10.1080/09298215.2021.1873392

These provide background for symbolic harmony and search techniques; they do
not establish empirical state-of-the-art performance for this implementation.
