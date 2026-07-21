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
* Right-click (or right-click-drag) to delete
* Snap grid from 1/4 down to 1/32 or free placement, `Ctrl+wheel` zoom to cursor
* Full undo/redo history (50 steps)

### Built-In Sound Engine

Five Tone.js synthesizer presets, each with its own effect chain: Classic Analog,
Electric Piano, Atmospheric Pad, Modern Pluck, and Dreamwave. Edits are audible
live during playback — including while dragging notes.

### MIDI Import & Export

* Drag & drop `.mid`/`.midi` files onto the app (or use **Load MIDI**)
* Import honors the file's own PPQ and tempo, merges melodic tracks, skips
  percussion, and auto-detects the key
* Export produces a standard 480-PPQ MIDI file with tempo, ready for any DAW

## Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `Space` | Play / stop |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / redo |
| `Ctrl+Y` | Redo |
| `Ctrl+A` | Select all notes |
| `Delete` / `Backspace` | Delete selected notes |
| `Alt+U` | Chop selected notes (all if none selected) |
| `Ctrl+wheel` | Zoom (anchored at cursor) |
| `Shift+wheel` | Horizontal scroll |

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
| `npm test` | Vitest unit tests (theory, MIDI round-trip, history) |

### Project Structure

```
src/
  App.tsx                 state orchestration + layout
  components/
    Sidebar.tsx           generation controls
    TransportBar.tsx      play/stop, undo/redo, BPM, instrument, import/export
    EditToolbar.tsx       tool modes, stamps, chop/length/snap/zoom
    PianoRoll.tsx         grid, keys, timeline, notes, pointer interactions
    CustomDropdown.tsx    themed listbox
    CustomSlider.tsx      themed slider
    DraggableNumberInput.tsx  drag/scroll/type number field
    ErrorBoundary.tsx
  hooks/
    useHistory.ts         reducer-based undo/redo store
  lib/
    theory.ts             progression generation, dissonance, key detection
    audio.ts              Tone.js synths, FX racks, transport
    midi.ts               MIDI file import/export (@tonejs/midi)
    constants.ts          musical + layout constants
tests/                    vitest suites
```

Every push to `main` deploys to GitHub Pages via `.github/workflows/deploy-pages.yml`;
`ci.yml` runs typecheck + lint + tests + build on every PR.

## License

[MIT](LICENSE) — designed and developed by Matthew Wesney.
