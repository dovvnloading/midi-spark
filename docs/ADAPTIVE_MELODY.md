# Melody-conditioned composition — engineering notes

## Purpose and non-goals

Midi Spark's **Follow melody** mode is a transparent, browser-only symbolic
composition system. Three distinct operations — **Harmonize**, **Continue**,
and **Reimagine** — condition generated notes on an original, immutable MIDI
source track. It is not audio transcription, a generative neural model or a
guarantee of a uniquely "correct" continuation or chord progression.

Design constraints:

- Do not mutate the user-authored melody, imported tracks or unrelated tracks.
- Regeneration is atomic and undoable; replace only parts owned by this source.
- All generated notes must be valid MIDI events.
- A fixed random stream produces reproducible output.
- Existing scratch generation, existing v1 local sessions and standard MIDI
  import/export must remain usable.
- Work without online services or new runtime dependencies.

Harmonization lives in `src/lib/adaptive.ts`; source-aware continuation and
variation are in `src/lib/motif.ts`. State/UI orchestration is in
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

**Harmonic pacing (follow-up):** *Each bar* maintains the original one-chord
per four beats, while *2 / bar* explicitly requests two-beat segments.
*Adaptive* compares the chord evidence for the first and second halves of
each bar against a single four-beat chord: the halves must contain actual
onsets, prefer different harmonies and collectively improve fit by enough to
justify an extra change. The same global sequence-level search is run across
the resulting one- or two-part bar windows, penalizing unnecessary changes
on beat three. If the optimized path ends up assigning the same chord to
both halves, it coalesces them into one four-beat event to avoid needless
bass/chord retriggers. Bass and harmony note durations are bounded to each
resulting chord window, so a newly chosen chord does not overlap its
predecessor's notes by accident. Automatic key detection now uses the
**original user melody** rather than allowing a generated continuation to
redefine the key; the continuation still contributes harmonic evidence.

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
reduces density to leave room for the lead. Onsets are grouped so polyphonic
attacks do not skew the groove detector: clearly straight melody timing favors
on-beat accompaniment, while a strong repeated offbeat emphasis influences
syncopated bass/chord accents. Within each chord region, rising melodic contour
favors descending arpeggios (and vice versa), making the accompaniment less
likely to compete in the same register direction. Seeded arpeggio start-tone
variations preserve alternative arrangements even when the source groove is
strong. Per-region accompaniment velocities also scale with the user's
melodic attack velocities, so quiet phrases aren't dominated by loud,
fixed-level generated parts. No operations change source notes.

### 5. Melody continuation and reimagination

These are independent transformations of the *representation* of a source
melody; source MIDI events are not edited in either operation.

- Source notes are sorted into onset groups, reducing nearly simultaneous
  polyphonic notes to the highest audible lead voice. The original polyphonic
  data stays unchanged; only the new melodic track is monophonic.
- **Continue** extracts a recent phrase up to four bars long, preserving its
  note-onset spacing and durations. It projects intervals relative to a new
  anchor close to the last original pitch, optionally using diatonic
  neighboring tones and occasional contour inversion at high creative distance.
  The phrase is repeated as required to fill the requested 1/2/4/8-bar
  extension. Registers, duration bounds and octave leaps are constrained.
- **Reimagine** retains the source phrase's onset and duration structure
  with limited controlled off-grid rhythmic adjustments, scale-neighbor
  substitutions, and velocity changes. Its source opening is kept and its
  final pitch remains recognizable. A generated alternative is stored on its
  own track, soloed on first generation so the unmodified source can be
  compared by changing solo/mute in Tracks.
- The key/mode comes from Compose, or from *unambiguous* key analysis.
  When analysis is uncertain, Compose remains authoritative.
- A linked continuation becomes extra *harmonic evidence* in the harmonizer;
  its notes are still preserved when bass/harmony regenerate.

These heuristic transformations are deliberately bounded and deterministic
under a supplied random stream. No claim is made that they rival large
trained melody-generation models in musical originality or consistency.

### 6. Ownership and editing semantics

Generated track headers carry:
- `generatedRole: "bass" | "harmony" | "continuation" | "variation"`
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
- Reusing generated track IDs on repeated harmonization, continuation and reimagination.
- Leaving unrelated imported MIDI tracks and metadata unchanged.
- Selecting a nonzero source track from a multi-track file.
- Seeded repeatability and immutable state.
- Keeping notes within MIDI pitch and positive duration bounds.
- Reporting empty, malformed, over-limit and channel-exhausted cases.
- Version-one autosave and ownership-marker validation.
- Playwright/Chromium browser flow: MIDI import, track choice, harmonize,
  continue, reimagine, regenerate, undo, reload and standard MIDI re-import.

Run `npm run typecheck && npm run lint && npm test && npm run build` and
the existing `scripts/browser_smoke.py` production-browser checks.

## Known limitations and next steps

1. **Metric structure.** Core timeline and generation currently assume 4/4;
   variable meter, tempo maps and mid-phrase modulations need a broader
   timeline model, not a special-case added inside the harmonizer.
2. **Harmony granularity.** One chord per bar is reliable for this release.
   A later iteration can use phrase-aware half-bar or adaptive change points.
3. **Phrase understanding.** The motif generator is presently an explainable
   recent-phrase transformation, not a pretrained symbolic sequence model.
   Future quality work includes stronger hierarchical phrasing, voice-leading,
   multi-phrase rhythmic development and an evaluation dataset.
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
