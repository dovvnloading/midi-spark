# Midi Spark

[![CI](https://github.com/dovvnloading/midi-spark/actions/workflows/ci.yml/badge.svg)](https://github.com/dovvnloading/midi-spark/actions/workflows/ci.yml)
[![Deploy](https://github.com/dovvnloading/midi-spark/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/dovvnloading/midi-spark/actions/workflows/deploy-pages.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Live app: [dovvnloading.github.io/midi-spark](https://dovvnloading.github.io/midi-spark/)**

<img width="1568" height="891" alt="Midi Spark piano roll interface" src="https://github.com/user-attachments/assets/be62c0bd-ae6c-47f6-bde2-9f0f0e0cb93a" />

Midi Spark is a mathematical MIDI generation tool for exploring chord progressions, rhythmic complexity, and dissonance. It generates, edits, previews, imports, and exports MIDI sequences with built-in synthesizers and an interactive piano roll — entirely in your browser, no account or install required.

## Features

### Algorithmic MIDI Generation

Generate chord progressions from musical parameters:

* **Root key & mode** — any of the 12 keys, major or minor, with correct diatonic
  qualities (minor degrees stay minor, flat degrees stay flat)
* **Chord tension** — from plain triads through 7ths/9ths up to altered dominants,
  tritone substitutions, and `maj13#11` voicings
* **Groove complexity** — sustained pads, syncopated stabs (tresillo, offbeat
  anticipation), or 8th/16th-note arpeggio engines with voice-leading between bars
* **Loop length** — 4 to 16 bars

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
* **Swing**: a slider + "Apply Swing" delays off-beat 8th/16th notes by a
  proportional amount for a looser, more human groove
* Right-click (or right-click-drag) to delete
* Snap grid from 1/4 down to 1/32 or free placement, `Ctrl+wheel` zoom to cursor
* Full undo/redo history (50 steps)

### Note Lab — Precision + Feel

Expand **Note Lab** below the edit toolbar for three undoable, selection-aware
transforms. Select notes first to target only those notes, or leave nothing
selected to affect the whole pattern:

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

### Track Studio — Multitrack Playback & Editing

After you load a multitrack MIDI file, **Track Studio** presents a strip for
each source track. Every strip has its own instrument preset, level fader,
mute button, and multi-solo button. Tracks have independent synth voices
and gain buses, so mix changes can be heard during playback without changing
MIDI notes. Effects are shared per synth preset.

Click a track's name to **focus that lane** in the piano roll: only its notes
and velocity bars appear, and notes drawn or stamped there are assigned to the
focused track. Lasso and slice operate only within the focused lane, and
`Ctrl+A` selects its visible notes. **All lanes** restores the combined view.
Note Lab transforms and CHOP still affect *all* notes if you don't explicitly
select any; use selection when you want to restrict those operations.

Track controls and focus are session-local. Mix settings autosave for a future
visit but are not embedded in exported MIDI. Imported track names, MIDI program
numbers, and channel assignments are retained and written back on export,
independently of the chosen browser synth presets.

### Built-In Sound Engine

Five Tone.js synthesizer presets, each with its own effect chain: Classic Analog,
Electric Piano, Atmospheric Pad, Modern Pluck, and Dreamwave. Edits are audible
live during playback — including while dragging notes.

### MIDI Import & Export

* Drag & drop `.mid`/`.midi` files onto the app (or use **Load MIDI**)
* Import honors the file's own PPQ and tempo, merges melodic tracks, skips
  percussion, and auto-detects the key
* Multi-track files are tagged per source track and colored distinctly in the
  piano roll (single-track imports render identically to a generated sequence)
* Export produces a standard 480-PPQ MIDI file with tempo, ready for any DAW;
  imported melodic track separation, names, instrument programs, and MIDI
  channel assignments are preserved on export

### Session Persistence

Your last sequence and settings (key, mode, tension, complexity, bars, BPM,
instrument, track mixer, snap/note-length, zoom) are autosaved to `localStorage` and
restored on your next visit. A "Clear saved session" control (next to Load
MIDI) resets this without touching your current in-progress work.

## Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `Space` | Play / stop |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / redo |
| `Ctrl+Y` | Redo |
| `Ctrl+A` | Select all notes |
| `Ctrl+C` / `Ctrl+V` | Copy / paste selected notes (pastes at the playhead) |
| `Delete` / `Backspace` | Delete selected notes |
| `Alt+U` | Chop selected notes (all if none selected) |
| `Ctrl+wheel` | Zoom (anchored at cursor) |
| `Shift+wheel` | Horizontal scroll |

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
  hooks/
    useHistory.ts         reducer-based undo/redo store
  lib/
    theory.ts             progression generation, dissonance, key detection, swing
    transforms.ts         selection-aware MIDI note transforms
    tracks.ts             track identification, mixer state + solo rules
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
