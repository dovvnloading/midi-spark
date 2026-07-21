# Midi Spark — Overhaul Plan

Working document for the July 2026 cleanup/enhancement pass. Updated as work progresses.
Branch: `overhaul/v1` → PR → `main` (Pages auto-deploys from `main`).

## Baseline (as found)

- AI Studio export: React 19 + Vite 6 + Tailwind 4 + Tone.js 15 + Tonal.
- Single 1,807-line `src/App.tsx` containing all UI + interaction logic.
- Build/typecheck status at baseline: both passed (loose tsconfig, no @types/react).
- Live site: https://dovvnloading.github.io/midi-spark/

## Phase 0 — Baseline verification

- [x] Clone, read entire codebase
- [x] `npm install` clean
- [x] `tsc --noEmit` baseline
- [x] `vite build` baseline
- [x] Dev-server smoke test in browser (generate, play, edit, export)

## Phase 1 — Repo hygiene (cruft removal)

- [x] Remove `metadata.json` (AI Studio artifact; claims Gemini capability the app no longer has)
- [x] Remove `.env.example` (`APP_URL` is referenced nowhere)
- [x] `vite.config.ts`: drop dead `GEMINI_API_KEY` define, dead `@` alias, AI-Studio HMR
      workaround + mojibake comment
- [x] `package.json`: remove unused deps — `express`, `dotenv`, `@types/express`, `tsx`,
      `esbuild`, `autoprefixer`, `@tonaljs/modules`, `motion`, `clsx`/`tailwind-merge` kept
      (used by `cn`), dedupe `vite` (deps+devDeps), move build-only packages to devDeps
- [x] `package.json`: fix scripts — remove `clean` (references nonexistent `server.js`,
      non-portable `rm -rf`), remove unused `build:pages*` (workflow passes `--base` itself),
      rename `lint` → `typecheck`, add `engines`
- [x] Add MIT `LICENSE` (README claims MIT but no file exists)
- [x] `index.html`: meta description, theme-color, favicon (self-hosted SVG), author
- [x] README: fix author name typo ("Wensey" → "Wesney"), add live-demo link, badges,
      keyboard-shortcut docs, updated project structure
- [x] `.gitignore`: drop stale `!.env.example` carve-out

## Phase 2 — Bug fixes (correctness)

- [x] **MIDI import timing (critical)**: `parseMidiFile` hardcodes 128 PPQ; real files are
      480/960 → imported notes ~4–7.5x wrong duration/position. Use `midi.header.ppq`.
- [x] **MIDI import**: adopt file tempo (BPM) instead of ignoring it; merge all melodic
      tracks instead of keeping only the densest; skip channel-10 percussion; guard the
      empty-file case (`Math.max(...[])` → `-Infinity` bars)
- [x] **Undo/redo corruption**: `saveToHistory` is called inside `setState` updaters →
      double history entries under StrictMode, plus stale `historyIndex` closures.
      Replace with a reducer-based history store; commits happen in event handlers only.
- [x] **Stale keyboard shortcuts**: keydown effect closes over `undo`/`redo`/`history` but
      deps are `[selectedNoteIndices, noteLength]` → Ctrl+Z acts on stale history. Fix via
      ref-based handler. Also: guard Delete/Backspace when typing in inputs.
- [x] **Minor-key dissonance bug**: `applyDissonance` turns `iidim` into `iidimm7` (invalid)
      → silently falls back to a bare-root voicing. Handle diminished romans (`m7b5`).
- [x] **(found during verification) Roman-numeral quality bugs**: tonal derives chord
      quality only from explicit suffixes, never case — so `vi` in C played A MAJOR at
      low dissonance (all minor degrees were major triads); minor-mode `III`/`VI`/`VII`
      resolved against the major scale (E instead of Eb in C minor); `iidim` is
      unparseable (silent tonic fallback); `I7` got a second quality stacked on
      (`I7maj7`). All fixed with explicit qualities + flat prefixes; verified
      empirically across dissonance 0/30/60/90 in both modes — 0 fallback voicings.
- [x] **Playback end sentinel**: `onTick(0)` doubles as "ended" signal — a tick that lands
      on 0 while playing non-looped stops the UI. Use an explicit `onEnded` callback.
- [x] **Octave-shift range**: high-dissonance octave displacement can leave the 0–127 MIDI
      range (name/midi fall out of sync via `|| 60` fallback). Clamp.
- [x] **DOM-selector fragility**: lasso/slice math resolves the grid via
      `querySelector('.relative[style*="width:"]')`. Use a proper React ref.
- [x] **Zoom jank**: `transition-all duration-1000` on the piano-roll content container
      animates every zoom change. Remove.
- [x] Fix synth-change fake-event hack (`{ target: { value } } as any`)

## Phase 3 — Structure refactor

- [x] Split `App.tsx` (1,807 lines) into:
  - `components/Sidebar.tsx` — generation controls
  - `components/TransportBar.tsx` — play/stop, undo/redo, follow/loop, BPM, instrument, import/export
  - `components/EditToolbar.tsx` — tool modes, stamp picker, chop/length/snap/zoom
  - `components/PianoRoll.tsx` — grid, keys, timeline, notes, all pointer interactions
  - `components/ErrorBoundary.tsx`
  - `hooks/useHistory.ts` — reducer-based undo/redo store
  - `lib/constants.ts` — stamps, note-length/snap options, layout constants
- [x] Consolidate MIDI on `@tonejs/midi` for both import and export
      (`lib/midi.ts`); drop `midi-writer-js`; export via Blob URL with proper PPQ + tempo;
      name the track
- [x] `lib/audio.ts`: migrate deprecated `Tone.Transport`/`Tone.Destination` globals to
      `getTransport()`/`getDestination()`
- [x] Enable TypeScript `strict` mode; remove `any` casts; scope tsconfig to `src`

## Phase 4 — UX enhancements

- [x] Space bar = play/stop (standard DAW transport shortcut)
- [x] Zoom-to-cursor: Ctrl+wheel keeps the tick under the pointer anchored
- [x] `CustomDropdown`: Escape to close, aria-expanded/haspopup, focus-safe
- [x] `DraggableNumberInput`: wheel support + double-click to type a value
- [x] Note-name labels on notes when zoomed in far enough
- [x] Icon-only buttons get aria-labels; drop dead `custom-scrollbar` class
- [x] Error boundary so a render crash doesn't white-screen the app

## Phase 5 — Quality gates

- [x] ESLint (flat config: typescript-eslint + react-hooks) with clean run
- [x] Vitest + tests: theory invariants (range/duration/bars), key detection,
      dissonance→valid-chord property, MIDI export/import round-trip at real PPQ
- [x] CI workflow: typecheck + lint + test + build on PRs and main pushes
- [x] README final pass; this plan finalized

## Phase 6 — Ship (completed 2026-07-21, PR #4)

- [x] Push branch, open PR with full summary
- [x] CI green on PR → merge to `main`
- [x] Verify Pages deploy + live-site smoke test
- [x] Delete stale merged remote branches (3 old `codex/*` branches)

## Phase 7 — Deferred feature pass (in progress, branch `overhaul/v2-deferred-features`)

Formalizes the six "future ideas" flagged at the end of the v1 pass into concrete,
independently verifiable stages. Each stage gates on `typecheck` + `lint --max-warnings 0`
+ `test` + `build` before being considered done, and is browser-verified afterward
exactly like Phases 0–6.

### 7.1 — Velocity editing lane

- [x] Velocity lane strip under the piano roll: one bar per note in view, height
      proportional to velocity (0.1–1.0)
- [x] Drag a bar to set that note's velocity; if the note is part of the current
      selection, drag scales all selected notes' velocities together (relative
      delta, clamped 0.1–1.0) — mirrors the existing multi-note drag pattern
- [x] Commits to undo history on release, not per pixel of drag
- [x] Live-audible: changing velocity while a note is sounding is reflected on next
      playback pass (uses the existing live-preview channel)
- [x] Gate green; browser-verified: drag lowers/raises velocity, undo restores it

### 7.2 — Copy/paste + duplicate-bar tool

- [x] `Ctrl+C` copies the selected notes (times normalized relative to the earliest
      `timeStart` in the selection) into in-memory clipboard state
- [x] `Ctrl+V` pastes the clipboard at the current playhead tick, selecting the
      newly pasted notes and committing to history
- [x] "Duplicate Bar" tool: duplicates all notes whose bar contains the playhead
      immediately after that bar, shifting nothing else (additive, non-destructive)
- [x] Gate green; browser-verified: copy at position A, move playhead, paste at B
      reproduces the exact relative layout; duplicate-bar doubles bar content

### 7.3 — Scale-highlighting on piano roll rows

- [x] Piano-roll keyboard keys and grid rows get a subtle tint when their pitch
      class is diatonic to the current root/mode (reuses the major/minor interval
      tables already in `theory.ts`)
- [x] Recomputes live when root or mode changes — no regeneration required
- [x] Layered so it never obscures existing black/white key shading, chord
      markers, or note rendering
- [x] Gate green; browser-verified: switching root/mode visibly moves the tint

### 7.4 — Swing / humanize post-processor toggle

- [x] New "Swing" slider (0–100%) in the edit toolbar
- [x] "Apply Swing" is a non-destructive, explicit action button (not a live
      always-on transform) that delays every off-beat 8th/16th note by an amount
      proportional to the slider, leaving downbeats untouched; commits to history
- [x] Unit test: 0% swing is a no-op; at 50% only off-beat notes shift, downbeats
      never move
- [x] Gate green; browser-verified audibly/visually on a generated progression

### 7.5 — Persist last session to localStorage

- [x] Debounced autosave of `{ progression, root, mode, bpm, dissonance,
      complexity, bars, synthType, snapResolution, noteLength, zoomX }` to
      `localStorage` on change
- [x] Restored on load when present; corrupt/missing/schema-mismatched data falls
      back silently to the current empty-state default (never throws)
- [x] Explicit "Clear saved session" control so users aren't stuck with unwanted
      persisted state
- [x] Unit test: save → reload round-trips the exact progression and settings
- [x] Gate green; browser-verified: hard reload restores the working sequence

### 7.6 — Multi-track MIDI import (scoped v1: tag + color only)

Scope decision: full separate-lane rendering with per-track instruments is a much
larger architecture change (multi-synth playback, per-track mixer UI). This pass
does the additive, low-risk half and re-defers the rest.

- [x] `NoteEvent` gains an optional `trackIndex` (additive field, not a breaking
      shape change)
- [x] Import assigns each source MIDI track its own index instead of flattening
      everything into one anonymous list (still merged into one `notes[]`, just
      tagged)
- [x] Piano roll colors notes by `trackIndex` from a small fixed palette when a
      progression has more than one track; single-track/generated progressions
      render exactly as before (no visual regression)
- [x] Explicitly re-documented as deferred: per-track instrument routing and a
      separate-lanes UI remain future work
- [x] Gate green; browser-verified: importing a multi-track file shows distinct
      colors per track; a generated (single "track") progression is unchanged

### 7.7 — Adversarial review findings (post-implementation)

Three independent reviewer passes (correctness/regression-risk, spec-compliance/UX,
code-quality) ran against the full 7.1–7.6 diff. All three, working separately,
independently converged on the same headline bug — strong signal it was real, not
a false positive. Confirmed/plausible findings and their resolutions:

- [x] **(blocker, triple-confirmed) 7.6 color regression**: `hasTrackColors` gated on
      "does any note carry a `trackIndex`" rather than "are there ≥2 distinct
      tracks" — since import tags every note (single-track files get `trackIndex:
      0`), importing an ordinary single-track file recolored every note amber
      instead of the original accent-blue. Fixed to require >1 distinct index;
      browser-verified both directions (single-track import → unchanged blue;
      3-track import → 3 distinct colors).
- [x] **7.2 Ctrl+C regression**: copy shortcut unconditionally called
      `preventDefault()` even with nothing selected, silently breaking native
      browser text-copy anywhere else on the page. Fixed to only intercept when
      `selectedNoteIndices.size > 0`; browser-verified `defaultPrevented` is false
      with no selection and true with one.
- [x] **7.4 spec gap**: plan text said swing delays "every off-beat 8th/16th
      note," but the shipped implementation only handled 8th notes. Extended
      `applySwing` to also delay off-beat 16th notes (the "e"/"a" of the beat) at
      a proportionally smaller, independently-capped delay; existing test updated
      + a new test added for the 16th-note case; browser-verified at 100% swing.
- [x] **7.1 parity gap**: velocity-lane drag didn't support shift-click to extend
      selection, unlike the main-grid note drag it was billed as mirroring. Added
      the same shift-click branch; browser-verified (2 → 4 selected DOM elements
      across two notes).
- [x] **Code-quality nits**: `applySwing` now reuses the shared `clamp()` helper
      instead of hand-rolling one; two filler comments in `persistence.ts` that
      only restated their function's doc comment were replaced with comments that
      state actual non-obvious WHY (why no `console.warn`, why the catch must
      never propagate).
- Reviewed but not changed (documented, not silently dropped):
  - 7.2 Duplicate Bar overlays onto an already-occupied following bar rather than
    inserting/shifting — matches the plan's literal "shifting nothing else"
    wording; left as-is.
  - 7.4 swing is not idempotent on repeated "Apply Swing" clicks at the same
    slider value below ~18% (each click keeps compounding slightly rather than
    converging) — plausible, not live-reproduced by the reviewer, not part of the
    original acceptance criteria (only "0% is a no-op" was required); left as a
    known limitation for a future pass.
  - 7.4's applied-at-swingAmount-with-no-eligible-notes case records a harmless
    but semantically-empty undo step — benign, not a data-integrity issue.
  - Ctrl+C/Ctrl+V discoverability (no README entry, no in-app tooltip) — folded
    into Phase 8's README update below, not a Phase 7 gap.

## Phase 8 — Integration, verification & ship

- [x] All Phase 7 sub-stages implemented on `overhaul/v2-deferred-features`,
      each individually gated (typecheck+lint+test+build) before the next started
- [x] Independent adversarial review pass over the full diff (correctness/
      regression-risk, spec-compliance, code-quality lenses) — findings fixed or
      explicitly logged as accepted trade-offs (see 7.7 above)
- [x] Full browser regression pass: every Phase 0–6 feature re-verified alongside
      the 6 new ones (generate/vary/chop/undo-redo/draw/drag/resize/lasso/slice/
      stamp/transport/import-export all still work). Also caught + fixed one
      stale UI string the review missed: the "Apply Swing" button's tooltip
      still said "8th note" only, after 7.7 extended swing to cover 16ths too.
      Zero console errors across the full battery.
- [x] README updated with new shortcuts/features; this plan's Phase 7 checkboxes
      finalized
- [x] Push branch, open PR, CI green, merge to `main`, verify Pages deploy +
      live-site smoke test (completed 2026-07-22, [PR #5](https://github.com/dovvnloading/midi-spark/pull/5);
      live site re-checked with a cleared `localStorage`: Generate/Duplicate
      Bar/Apply Swing/Clear-session controls all present and functional,
      velocity lane renders once notes exist, zero console errors)

**Phase 7 + 8 complete.** All 6 deferred features shipped, adversarially
reviewed (one triple-confirmed blocker + 3 other real issues fixed before
merge), regression-tested against every Phase 0–6 feature, and verified live
in production.

## Deferred / future ideas (still not this pass)

- Full multi-track lanes with per-track instrument routing/mixing (7.6 above
  ships only tagging + color, not this)
- Per-note pan / MPE-style expression
- Collaborative/shareable session links
