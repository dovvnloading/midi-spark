# Midi Spark — Overhaul Plan

Working document for the July 2026 cleanup/enhancement pass. Updated as work progresses.
Branch: `overhaul/v1` → PR → `main` (Pages auto-deploys from `main`).

## Baseline (as found)

- AI Studio export: React 19 + Vite 6 + Tailwind 4 + Tone.js 15 + Tonal.
- Single 1,807-line `src/App.tsx` containing all UI + interaction logic.
- Build/typecheck status at baseline: recorded in Phase 0.
- Live site: https://dovvnloading.github.io/midi-spark/

## Phase 0 — Baseline verification

- [x] Clone, read entire codebase
- [ ] `npm install` clean
- [ ] `tsc --noEmit` baseline
- [ ] `vite build` baseline
- [ ] Dev-server smoke test in browser (generate, play, edit, export)

## Phase 1 — Repo hygiene (cruft removal)

- [ ] Remove `metadata.json` (AI Studio artifact; claims Gemini capability the app no longer has)
- [ ] Remove `.env.example` (`APP_URL` is referenced nowhere)
- [ ] `vite.config.ts`: drop dead `GEMINI_API_KEY` define, dead `@` alias, AI-Studio HMR
      workaround + mojibake comment
- [ ] `package.json`: remove unused deps — `express`, `dotenv`, `@types/express`, `tsx`,
      `esbuild`, `autoprefixer`, `@tonaljs/modules`, `motion`, `clsx`/`tailwind-merge` kept
      (used by `cn`), dedupe `vite` (deps+devDeps), move build-only packages to devDeps
- [ ] `package.json`: fix scripts — remove `clean` (references nonexistent `server.js`,
      non-portable `rm -rf`), remove unused `build:pages*` (workflow passes `--base` itself),
      rename `lint` → `typecheck`, add `engines`
- [ ] Add MIT `LICENSE` (README claims MIT but no file exists)
- [ ] `index.html`: meta description, theme-color, favicon (self-hosted SVG), author
- [ ] README: fix author name typo ("Wensey" → "Wesney"), add live-demo link, badges,
      keyboard-shortcut docs, updated project structure
- [ ] `.gitignore`: drop stale `!.env.example` carve-out

## Phase 2 — Bug fixes (correctness)

- [ ] **MIDI import timing (critical)**: `parseMidiFile` hardcodes 128 PPQ; real files are
      480/960 → imported notes ~4–7.5x wrong duration/position. Use `midi.header.ppq`.
- [ ] **MIDI import**: adopt file tempo (BPM) instead of ignoring it; merge all melodic
      tracks instead of keeping only the densest; skip channel-10 percussion; guard the
      empty-file case (`Math.max(...[])` → `-Infinity` bars)
- [ ] **Undo/redo corruption**: `saveToHistory` is called inside `setState` updaters →
      double history entries under StrictMode, plus stale `historyIndex` closures.
      Replace with a reducer-based history store; commits happen in event handlers only.
- [ ] **Stale keyboard shortcuts**: keydown effect closes over `undo`/`redo`/`history` but
      deps are `[selectedNoteIndices, noteLength]` → Ctrl+Z acts on stale history. Fix via
      ref-based handler. Also: guard Delete/Backspace when typing in inputs.
- [ ] **Minor-key dissonance bug**: `applyDissonance` turns `iidim` into `iidimm7` (invalid)
      → silently falls back to a bare-root voicing. Handle diminished romans (`m7b5`).
- [ ] **Playback end sentinel**: `onTick(0)` doubles as "ended" signal — a tick that lands
      on 0 while playing non-looped stops the UI. Use an explicit `onEnded` callback.
- [ ] **Octave-shift range**: high-dissonance octave displacement can leave the 0–127 MIDI
      range (name/midi fall out of sync via `|| 60` fallback). Clamp.
- [ ] **DOM-selector fragility**: lasso/slice math resolves the grid via
      `querySelector('.relative[style*="width:"]')`. Use a proper React ref.
- [ ] **Zoom jank**: `transition-all duration-1000` on the piano-roll content container
      animates every zoom change. Remove.
- [ ] Fix synth-change fake-event hack (`{ target: { value } } as any`)

## Phase 3 — Structure refactor

- [ ] Split `App.tsx` (1,807 lines) into:
  - `components/Sidebar.tsx` — generation controls
  - `components/TransportBar.tsx` — play/stop, undo/redo, follow/loop, BPM, instrument, import/export
  - `components/EditToolbar.tsx` — tool modes, stamp picker, chop/length/snap/zoom
  - `components/PianoRoll.tsx` — grid, keys, timeline, notes, all pointer interactions
  - `components/ErrorBoundary.tsx`
  - `hooks/useHistory.ts` — reducer-based undo/redo store
  - `lib/constants.ts` — stamps, note-length/snap options, layout constants
- [ ] Consolidate MIDI on `@tonejs/midi` for both import and export
      (`lib/midi.ts`); drop `midi-writer-js`; export via Blob URL with proper PPQ + tempo;
      name the track
- [ ] `lib/audio.ts`: migrate deprecated `Tone.Transport`/`Tone.Destination` globals to
      `getTransport()`/`getDestination()`
- [ ] Enable TypeScript `strict` mode; remove `any` casts; scope tsconfig to `src`

## Phase 4 — UX enhancements

- [ ] Space bar = play/stop (standard DAW transport shortcut)
- [ ] Zoom-to-cursor: Ctrl+wheel keeps the tick under the pointer anchored
- [ ] `CustomDropdown`: Escape to close, aria-expanded/haspopup, focus-safe
- [ ] `DraggableNumberInput`: wheel support + double-click to type a value
- [ ] Note-name labels on notes when zoomed in far enough
- [ ] Icon-only buttons get aria-labels; drop dead `custom-scrollbar` class
- [ ] Error boundary so a render crash doesn't white-screen the app

## Phase 5 — Quality gates

- [ ] ESLint (flat config: typescript-eslint + react-hooks) with clean run
- [ ] Vitest + tests: theory invariants (range/duration/bars), key detection,
      dissonance→valid-chord property, MIDI export/import round-trip at real PPQ
- [ ] CI workflow: typecheck + lint + test + build on PRs and main pushes
- [ ] README final pass; this plan finalized

## Phase 6 — Ship

- [ ] Push branch, open PR with full summary
- [ ] CI green on PR → merge to `main`
- [ ] Verify Pages deploy + live-site smoke test
- [ ] Delete stale merged remote branches (3 old `codex/*` branches)

## Deferred / future ideas (not this pass)

- Velocity editing lane (drag to shape velocities)
- Multi-track import as separate lanes / instrument per track
- Scale-highlighting on the piano roll rows
- Copy/paste of selections; duplicate-bar tool
- Swing/humanize post-processors as toggles
- Persist last session to localStorage
