# Midi Spark

[![CI](https://github.com/dovvnloading/midi-spark/actions/workflows/ci.yml/badge.svg)](https://github.com/dovvnloading/midi-spark/actions/workflows/ci.yml)
[![Deploy](https://github.com/dovvnloading/midi-spark/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/dovvnloading/midi-spark/actions/workflows/deploy-pages.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Live app: [dovvnloading.github.io/midi-spark](https://dovvnloading.github.io/midi-spark/)**

<p align="center">
  <a href="docs/screenshots/desktop-editor.png">
    <img src="docs/screenshots/desktop-editor.png" alt="MIDI Spark desktop studio: a four-bar MIDI pattern in the piano roll, with chord lane, velocity editor, sound selection, and playback controls" width="1200" />
  </a>
</p>

Midi Spark is a mathematical MIDI generation tool for exploring chord progressions, rhythmic complexity, and dissonance. It generates, edits, previews, imports, and exports MIDI sequences with built-in synthesizers and an interactive piano roll — entirely in your browser, no account or install required.

## Interface gallery

Real Chromium screenshots from the [browser regression suite](scripts/browser_smoke.py), including the desktop editor and responsive mobile layouts. Select any image for the full-resolution view.

### Edit and transform

[![Note Lab view: quantize, transpose and humanize tools beside the piano roll](docs/screenshots/note-lab.png)](docs/screenshots/note-lab.png)

### Mobile workspace

| Compose inspector | Piano roll |
| :---: | :---: |
| <a href="docs/screenshots/mobile-compose.png"><img src="docs/screenshots/mobile-compose.png" alt="375px mobile Compose inspector with key and scale, sound preview, and pattern-generation controls" width="280" /></a> | <a href="docs/screenshots/mobile-piano-roll.png"><img src="docs/screenshots/mobile-piano-roll.png" alt="390px mobile piano roll with notes, editing controls, and playback transport" width="280" /></a> |

### First-run experience

<details>
<summary>View the new-session empty state</summary>

<a href="docs/screenshots/empty-state.png"><img src="docs/screenshots/empty-state.png" alt="MIDI Spark initial desktop workspace with actions to generate a pattern, start blank, or import MIDI" width="1200" /></a>

</details>

## Features

### Algorithmic MIDI Generation

Generate chord progressions from musical parameters:

* **Root key & mode** — any of the 12 keys, major or minor, with correct diatonic
  qualities (minor degrees stay minor, flat degrees stay flat)
* **Chord tension** — from plain triads through 7ths/9ths up to altered dominants,
  tritone substitutions, and `maj13#11` voicings
* **Harmonic voice-leading** — upper chord tones are arranged using a bounded
  search that prefers smaller voice movements and avoids crossing; minor mode
  uses explicit minor-key progressions instead of major-key remapping
* **Groove complexity** — sustained pads, syncopated stabs (tresillo, offbeat
  anticipation), and 8th/16th-note arpeggios with measured onset density
* **Reproducible musical tests** — the generator and variation functions accept
  optional seeded random streams for testing and repeatable output; the
  ordinary Generate button remains spontaneous
* **Loop length** — 4 to 16 bars
* **Generation layers** — keep the original single-track output or optionally
  split each generated pattern into independent **Bass** and **Harmony** tracks.
  The same note pitches, timing, velocities, and chord labels are preserved
  when switching generation mode.

### Melody-conditioned harmonization

Switch **Compose → Starting point → Follow melody** to build accompaniment
around a phrase instead of generating an unrelated progression:

1. **Draw or import a melody.** Use the piano roll, or load a MIDI file; choose
   the source track explicitly if there are several. Imported bass and other
   tracks are not silently treated as the lead. **Source phrase** can use the
   full track, the exact notes selected with the Select tool (V), or note attacks
   inside an explicit timeline loop (hold Shift and drag the ruler).
2. **Tune the harmonic fit.** The higher the fit, the more strongly sustained
   and accented melody tones influence chord selection. Short stepwise passing
   notes receive less weight. **Chord tension** allows sevenths and some
   chromatic/modal options; **Chord changes** chooses *Each bar* (steady),
   *Adaptive* (change halfway only when the melody gives independent evidence
   for contrasting harmonies), or *2 / bar* (regular half-bar changes).
   **Accompaniment motion** sets the density of the generated backing.
   **Harmony exploration** controls a quality-bounded, diversity-aware global
   chord search: low values prefer near-best paths; higher values consider
   more harmonically distinct possibilities without ignoring melody fit.
   Set it to **0** for the original Viterbi-based search. **Phrase coherence**
   (0–100%, under Advanced harmony) rewards reusing a related chord-root arc
   when a two-bar melodic idea returns, including transposed returns, and
   favors tonic cadences when the melody itself suggests resolution. It only
   reranks near-best chord paths that already pass the melody-fit safeguards;
   set it to 0 for unconstrained alternatives. Phrase coherence applies when
   harmony exploration is above 0. The engine follows clear offbeat emphasis
   and favors arpeggio motion opposite a rising or falling lead, while
   retaining seeded alternatives. Use the **padlock on a generated chord** in the
   piano-roll chord lane to preserve that chord **and the existing bass/harmony
   notes in its region**. Locking is undoable; the search constrains the next
   harmonization to those exact chord labels and keeps their MIDI untouched.
   Unlock a single chord, or use **Unlock all** under Advanced harmony. A locked
   half-bar keeps its two-beat window even when pacing is changed; incompatible
   key/tension settings produce a clear error rather than changing a lock.
   The **Chord guide** in Advanced harmony also lets you **pin a new chord in
   any bar**, before or after harmonization, or **exclude an unwanted chord**.
   Pins force one full-bar chord even when harmonic pacing is set to two per
   bar; exclusions filter candidate chords at every region inside the bar.
   These constraints are exact and undoable: unsupported chords, clashes with
   locks, and impossible exclusions yield clear errors instead of being
   silently ignored. Guides follow their source melody track and survive
   browser autosave. Unlike a chord padlock, a guide does not retain the
   previous bass/harmony MIDI events when you generate again.
3. **Choose the key strategy.** Use the root and mode from Compose, or select
   **Detect melody**. When key detection is uncertain, the app keeps the Compose
   key rather than presenting a guess as certain.
4. **Harmonize melody.** The generator uses a sequence-level dynamic-programming
   search to find a compatible chord path, then produces a register-aware
   **Generated Bass** and **Generated Harmony** track. Source notes keep their
   exact pitches, positions, durations, velocities, and track assignment.
5. **Compare before committing.** After the first harmonization, use **Take Lab →
   Explore 3 takes** to generate structurally distinct alternatives against the
   same unchanged project and current chord locks/guides. Click **Original** or
   a numbered **Take** to inspect its notes in the piano roll, and press the
   normal Play button to audition it with the same tempo, loop and mixer.
   Previewed piano rolls are read-only, and neither autosave nor standard MIDI
   export is changed until **Accept selected take** commits one undoable edit.
   **Clear takes** returns to the working arrangement without any commit.
   Candidate lists are session-only previews, not saved across reloads; when
   constraints leave no meaningful variation the app reports that honestly.
6. **Try another harmonization.** Only the generated tracks for that source are
   replaced. Their IDs, channels, and mixer selections are retained, and Undo
   restores the previous result. Other user-owned tracks remain untouched.
   **Duplicate a generated track in Tracks** before regenerating if you want
   to preserve your own edits to that part.

The **Follow melody → Creative operation** selector now has three actions:
**Harmonize**, **Continue**, and **Reimagine**.

- **Continue** uses recent note onset groups and interval contour as a rhythmic
  motif, generates a 1/2/4/8-bar answer after the source phrase, and writes it to
  a replaceable **Melody Continuation** track. The **Creative distance** control
  permits more or less diatonic substitution and contour inversion. The original
  notes and other user tracks are never modified.
- **Reimagine** creates a recognizable alternative on a separate **Melody
  Variation** track, preserving the phrase's exact opening/ending pitches
  and onset times while applying bounded changes to interior notes.
  The new alternative is
  automatically soloed for A/B playback; use Tracks to adjust solo/mute.
- **Harmonize** can also use the linked continuation as a harmonic guide, so
  bass and chords follow the new passage as well as the original phrase.

Generate again to replace only the corresponding generated track. Duplicate a
generated track before regenerating if you want to keep edits. These operations
are undoable and persist locally with their ownership metadata.

**Phrase targeting:** Selecting notes or a loop changes which *source melody*
influences each operation—not the original notes themselves. Continue uses that
phrase as the seed but starts its answer after the **end of the entire original
melody track**, avoiding collisions with later user notes. Reimagine creates a
separate alternative from the chosen phrase only. Harmonize changes only the
bars covered by the chosen phrase (rounded out to full measures), and keeps
existing generated backing outside those bars intact. A loop uses notes whose
attacks occur within its range, preserving leading rests when continuing.
For particularly long phrases, Continue uses up to the final four bars.

Source phrase *mode* and loop range are saved across browser reloads, but an
individual note selection is not saved; select the notes again after reloading.
If a selection/loop contains no source-track notes, MIDI Spark reports that
explicitly rather than silently generating from another track.

The generator runs entirely in-browser, deterministically with a supplied
random seed (and spontaneously in normal use). No model, account, upload,
server, or sampled audio is required. Existing **From scratch** generation is
unchanged.

**Current scope:** 4/4 quarter-note timing, up to 64 bars and 4,096 source
notes, with two free melodic MIDI channels required for the first harmonization.
This is *MIDI melody conditioning*, not audio pitch transcription or a
large-model composition system. Generated-track ownership is preserved in
browser autosave, but ordinary MIDI export does not carry this app-specific
ownership tag; after re-import, tracks can be selected and edited normally.
The optional key detector is heuristic and may be uncertain on short or
chromatic phrases. See [adaptive engine notes](docs/ADAPTIVE_MELODY.md)
for scoring, limitations, and future evaluation.

### Research and reproducible musical evaluation

A [competitive research and music-quality audit](docs/MUSIC_RESEARCH_EVALUATION_2026.md)
compares MIDI Spark's *editable, melody-conditioned MIDI workflow* against
AccoMontage2, GETMusic, MIDI-GPT, Magenta Studio and audio-generation systems,
while explicitly separating incompatible tasks and pretrained-model licensing.

The evaluation harness runs **ten original synthetic melody scenarios, twelve
fixed seeds per scenario and 480 actual engine calls**. It tracks note-preserving
correctness, duration-weighted chord-tone coverage, register overlap, chord
boundary spill, **structural and chord-path diversity**, and basic runtime.
GitHub CI publishes JSON/Markdown evaluation artifacts so future algorithm
changes can be compared on identical inputs:

```sh
npm ci
npm run eval:music
npm run eval:compare -- path/to/before.json path/to/after.json
```

The first pilot found 97.3% *literal chord-tone coverage* on deliberately
constructed example phrases, but only **22.5% distinct accompaniment
structures** and **20.0% distinct chord paths** across twelve takes.
A paired follow-up with the new 62%-exploration k-best search raised structural
backing diversity to **61.7%** and chord-path diversity to **55.0%**, with
literal chord-tone coverage of **97.5%** versus **97.3%** for the legacy search.
These numbers are from the same small synthetic benchmark, **not** a listener
preference study or a comparison with pretrained models.
**These are diagnostic values, not a measure of perceived musical quality or
evidence of superiority to trained models.** No external pretrained checkpoint
or human listening study has been run; the linked audit specifies a blinded
listener protocol and a prioritized improvement roadmap.

### Interactive Piano Roll

* **Draw** notes with click or click-drag (drag sets the length)
* **Select** with lasso, shift-click to extend, `Ctrl+A` for everything
* **Stamp** full chords (9 types) or scale guides (7 scales)
* **Slice** notes with a cut line, **chop** them into fixed-length segments
* Drag to move (single or multi-selection), grab the right edge to resize
* **Velocity lane** beneath the grid — drag a bar to reshape a note's velocity
  (drag a selected note's bar to scale the whole selection together)
* **Copy/paste** (`Ctrl+C`/`Ctrl+V`) and a **Duplicate Bar** tool for fast
  repetition
* **Scale highlighting**: piano-roll rows tint live to show which pitches are
  diatonic to the current root/mode
* **Swing**: a slider + "Apply Swing" applies a continuous, order-preserving
  timing warp. Even at 100%, neighboring 8th/16th notes remain distinct;
  exact beat anchors stay fixed
* Right-click (or right-click-drag) to delete
* Snap grid from 1/4 down to 1/32 or free placement, `Ctrl+wheel` zoom to cursor
* Full undo/redo history (50 steps)

### Note Lab — Precision + Feel

Open **Transform** in the inspector for undoable, selection-aware
transforms. Select notes first to target only those notes, or leave nothing
selected to affect the focused track (the whole pattern in All tracks):

* **Quantize** — pull note starts toward the nearest 1/4, 1/8, 1/16 or 1/32
  grid line. Strength from 0–100% lets you tighten a groove without flattening
  its feel; note durations remain unchanged.
* **Transpose** — nudge pitches ±1 semitone or ±12 semitones (one octave).
  Out-of-range MIDI pitches are left unchanged, never clipped to other notes.
* **Humanize** — introduce controllable timing and velocity variations. Runs
  are randomized but stable under React StrictMode; every application is one
  undoable operation.

Paste and Duplicate Bar now automatically extend the piano-roll canvas when
notes spill past the end of the current sequence.

### Track Studio — Native Track Creation, Mixing & Editing

**Track Studio** works with generated songs and imported MIDI alike. Choose
**Bass + Harmony** in Compose to generate two separately editable musical layers,
or use **Add track** to make a blank melody, pad, or counterpoint lane. Rename,
duplicate, and delete tracks directly in the mixer. A track with notes requires
confirmation before deletion, and Undo restores deleted notes and metadata.

Every strip has its own instrument preset, level fader, mute button, and
multi-solo button. Tracks have independent synth voices and gain buses, so mix
changes can be heard during playback without rewriting MIDI notes. Presets
now carry individually programmed spectral color, expressive velocity curves
and stereo/LFO modulation; common space/echo buses remain shared to avoid
multiplying heavyweight reverbs. A single master limiter helps control peaks
from dense unison or layered parts.

Click a track's name to **focus that lane** in the piano roll: only its notes
and velocity bars appear, and notes drawn or stamped there are assigned to the
focused track. Lasso and slice operate only within the focused lane, and
`Ctrl+A` selects its visible notes. **All tracks** restores the combined view.
Note Lab transforms and CHOP honor the focused track when nothing is selected.
A selection further restricts the operation. The inspector displays the scope.

Track focus and mixer controls are session-local. Mix settings autosave for a
future visit but are not embedded in exported MIDI. Track names, note separation,
General MIDI programs, and melodic channels are retained on export, independently
of browser synth patches. New tracks receive a safe unused melodic MIDI channel
(channel 10 is reserved for percussion), up to MIDI's 15 melodic channels. Empty
tracks survive export/import with their names; since an empty MIDI track has no
channel-bearing notes, a reader may report its channel as the default.

### Built-In Sound Engine — 49 Expressive Instruments

The redesigned **49-instrument sound bank** uses seven useful categories:
**Keys**, **Analog & Retro**, **Pads & Atmospheres**, **Plucks & Mallets**,
**Leads**, **Bass**, and **Motion & Experimental**. All 33 previous preset IDs
remain intact, so older projects, autosaves and track mixes still load.
Six genuinely different synthesis architectures provide the variety:
subtractive and unison oscillators, dual-oscillator voicing, FM, AM,
filtered mono synths, and tuned membrane basses. There are **no external
samples, soundfonts, cloud calls, accounts or downloads**.

The main difference is how the sounds behave, not the names:

- **Motion and texture** are individualized. Instruments use their own
  combinations of low/band/highpass color, LFO filter sweeps, pitch vibrato,
  tremolo, chorus, phasing, and stereo autopanning. Classic dry sub, pluck and
  mallet sounds bypass the lush shared ambient racks; sustained atmospheres
  evolve in stereo with longer releases.
- **Dynamic response** follows the MIDI velocity curve per instrument. Soft
  velvet keys respond very differently from tines, resonant bass and hard
  plucks. The browser audition plays a gentle attack followed by a harder
  attack, so the difference can be heard before selecting a sound.
- **Polyphony and CPU** are budgeted per voice (especially layered unison and
  dual-oscillator patches); processors are allocated only for active presets
  and disposed when you replace them. Shared delay/reverb sends keep
  multitrack arrangements lightweight.
- **Creative discovery** shows a meaningful synthesis character for each
  sound and supports search by timbre, motion or engine. For example, search
  `FM`, `pulse`, `vibrato`, `membrane` or `chorus`.

Open **Compose → Preview sound**, or any **Tracks** sound selector.
Click the row's play button to audition without changing your selection;
selecting a sound applies it and previews it immediately. Notes, exported
MIDI events, General MIDI programs and source-track ownership are unaffected
by this browser-only sound choice.

The bank is a collection of **original procedural synthesizer instruments**,
not acoustic recordings or an identical sampled instrument library. Detailed
patch and modulation choices, performance safeguards, and a critical listening
checklist are documented in [Sound Design Engineering](docs/SOUND_DESIGN.md).

### MIDI Import & Export

* Drag & drop `.mid`/`.midi` files onto the app (or use **Load MIDI**)
* Import honors the file's own PPQ and first tempo, merges melodic tracks and
  skips percussion. The estimated key is ranked from pitch-class profiles,
  duration and tonic evidence; ambiguous passages are labeled uncertain and
  a second possible key is shown (adjust root/mode in Compose).
* Multi-track files are tagged per source track and colored distinctly in the
  piano roll (single-track imports render identically to a generated sequence)
* Export produces a standard 480-PPQ MIDI file with tempo, ready for any DAW;
  imported melodic track separation, names, instrument programs, and MIDI
  channel assignments are preserved on export

### Session Persistence

Your last sequence and settings (key, mode, tension, complexity, bars, BPM,
generation mode, track names and identities, instrument, track mixer,
snap/note-length, zoom) are autosaved to `localStorage` and
restored on your next visit. A "Clear saved session" control (next to Load
MIDI) resets this without touching your current in-progress work.

## The canvas-first workspace

The transport and file actions stay in a compact top bar. The piano roll occupies
the remaining working area, with a persistent chord lane and individually editable
velocity stems. One inspector switches between **Compose**, **Transform**, and
**Tracks** without pushing the canvas offscreen. On small screens the inspector is
a dismissible side sheet.

**Create:** choose a key, tension, rhythm, length and single-track or layered
generation in Compose, then Generate. From a blank session, use Tracks → Add track
to start a new instrument lane without importing anything. Generate is available
with Ctrl/⌘+G. Generation replaces the current pattern; Undo restores it.

**Edit:** select Draw, Select, Stamp, Slice or Hand. Mouse, pen and touch use the
same pointer gestures; Hand pans the canvas without modifying notes. Fit (F)
frames the pattern horizontally and vertically. Use Ctrl/⌘+wheel for horizontal
zoom, or Shift+wheel to move through the timeline. The visible keyboard keeps the
full MIDI range available even when the pattern is framed.

**Timeline & playback:** Space toggles Play/Pause, and the separate Stop button
returns to bar 1. Click or drag the timeline ruler to seek. A shaded loop range
shows which beats repeat while Loop is enabled. **Shift+drag** the ruler to
select a new range, or drag the loop-in/out handles; keyboard users can focus
the handles and use the arrow keys for snapped adjustments. **Double-click**
the ruler to return to a full-pattern loop. Loop selection and on/off state
autosave locally; no loop metadata is added to exported MIDI.

**Transform:** selected notes take priority. Without a selection, transformations
affect the focused track, or the whole pattern in All tracks view. An empty track
never falls back to editing hidden tracks. The scope and note count are displayed
above quantize, transpose, humanize, swing and reshape actions.

**Mix:** track focus, instrument, level, mute and solo are in Tracks. Mix settings
change browser playback, not the exported MIDI note velocities or programs.

The status bar reports the actual autosave result. If browser storage fails,
export MIDI to retain your work. The More menu contains shortcuts and Clear
browser autosave; clearing autosave does not erase the working pattern.

## Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `Space` | Play / pause (use Stop to return to bar 1) |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / redo |
| `Ctrl+Y` | Redo |
| `Ctrl+A` | Select all notes |
| `Ctrl+C` / `Ctrl+V` | Copy / paste selected notes (pastes at the playhead) |
| `Delete` / `Backspace` | Delete selected notes |
| `Alt+U` | Chop selected notes (all if none selected) |
| `Ctrl+wheel` | Zoom (anchored at cursor) |
| `Shift+wheel` | Horizontal scroll |
| `?` | Open in-app keyboard shortcut guide |
| `Escape` | Clear note selection (or close help / mobile inspector) |
| `B` / `V` / `S` / `C` / `H` | Draw / Select / Stamp / Slice / Hand |
| `F` | Fit the complete pattern to the canvas |
| `Ctrl/⌘+G` | Generate a new pattern |

`Ctrl+C` only intercepts the shortcut when notes are selected — with nothing
selected, normal browser text-copy still works everywhere on the page.

## Technology

* **React 19** + **Vite 6** + **TypeScript** (strict)
* **Tailwind CSS 4** for the hardware-inspired UI
* **Tone.js 15** — synthesis and transport
* **Tonal** — music theory (roman numerals, chords, keys)
* **@tonejs/midi** — MIDI file parsing and serialization

## Development

Requires Node.js 20+.

```bash
npm install
npm run dev        # dev server on http://localhost:3000
```

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview the production build |
| `npm run typecheck` | TypeScript strict check |
| `npm run lint` | ESLint (typescript-eslint + react-hooks) |
| `npm test` | Vitest unit tests (theory, swing, MIDI round-trip, history, persistence) |

### Project Structure

```
src/
  App.tsx                 state orchestration + layout
  components/
    Sidebar.tsx           generation controls
    TransportBar.tsx      play/stop, undo/redo, BPM, instrument, import/export
    EditToolbar.tsx       tool modes, stamps, chop/length/snap/zoom
    TransformBar.tsx      Note Lab: quantize, transpose, humanize
    TrackStudio.tsx       per-track instrument, volume, mute, solo, focus
    PianoRoll.tsx         grid, keys, timeline, notes, pointer interactions
    CustomDropdown.tsx    themed listbox
    CustomSlider.tsx      themed slider
    DraggableNumberInput.tsx  drag/scroll/type number field
    ErrorBoundary.tsx
    ShortcutHelp.tsx        shortcut reference dialog
    StatusToast.tsx         accessible action notifications
  hooks/
    useHistory.ts         reducer-based undo/redo store
  lib/
    theory.ts             progression generation, dissonance, key detection, swing
    transforms.ts         selection-aware MIDI note transforms
    tracks.ts             track identification, mixer state + solo rules
    trackOperations.ts    add/rename/duplicate/delete, channel/ID allocation
    audio.ts              Tone.js synths, FX racks, transport
    midi.ts               MIDI file import/export (@tonejs/midi)
    persistence.ts        localStorage session save/load/clear
    constants.ts          musical + layout constants
tests/                    vitest suites
```

Every push to `main` deploys to GitHub Pages via `.github/workflows/deploy-pages.yml`;
`ci.yml` runs typecheck + lint + tests + build on every PR.

## License

[MIT](LICENSE) — designed and developed by Matthew Wesney.

## Browser regression checks

`.github/workflows/browser-qa.yml` builds the app and exercises the production
bundle in Chromium. It checks pointer drawing, selection/undo, dragging, resize,
emulated touch and cancellation, Hand panning, focused-track transformations,
mute/solo/level, layered track creation/undo/export, playback controls, dialog focus, mobile inspector navigation,
real browser reload persistence, MIDI download/re-import, and layout at six
viewport sizes from 375px to 1440px. Screenshots and geometry are retained as CI
artifacts. These are browser-emulation checks, not a claim of Safari or physical
phone/stylus-device certification.

To reproduce locally (Python 3.11+ and Node 22):

```bash
npm ci
npm run build
python -m pip install playwright==1.57.0
python -m playwright install chromium
npm run preview -- --host 127.0.0.1 --port 4173
# In another terminal:
python scripts/browser_smoke.py --url http://127.0.0.1:4173
```
