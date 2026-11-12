# Sound Library — UX specification and QA gate

**Scope:** `src/components/SoundPicker.tsx`, `src/preset-browser.css`, `src/lib/audio.ts`.
This browser is shared by Compose and each Track Studio instrument slot; changes
to the library must not change MIDI note or export data.

## Interaction contract

- **Current ≠ staged ≠ auditioning.** Browsing and previewing are reversible.
  The in-use preset is marked independently from the staged selection; only
  **Use [preset]** changes the track. **Cancel**, close, backdrop, and Escape
  discard the draft and restore focus to the opening sound control.
- **Fast navigation.** Search matches preset metadata and synth engine.
  Category totals reflect search; each filtered result count is announced.
  Arrow keys move focus between visible cards (two columns desktop, one on
  phones); Home/End navigate the list; Enter/Space stage. Search Escape first
  clears a nonempty query, then closes the dialog.
- **Safe asynchronous audio.** Closing the dialog invalidates pending preview
  completions, disposes scheduled synth voices and their processors, and
  prevents a late error/toast or loading spinner from leaking into a new session.
  Audio preview never commits the staged selection.
- **Modal behavior.** The portal stays above editor stacks; the editor becomes
  inert; background scrolling is locked and restored exactly; tab focus loops
  within the dialog; opening search receives focus and dismissal returns focus
  to the opener. Removing a focused Favorite card redirects focus to search.
- **Responsive and accessible.** The category rail scrolls horizontally on
  tablet/zoom; result cards become single-column on phones; sticky commit
  actions remain reachable on short screens and when the virtual keyboard
  changes the visual viewport. Primary controls are at least 44px square or
  high, with visible focus and reduced-motion support.

## Automated acceptance

PRs run all of the existing `scripts/browser_smoke.py` interaction checks,
`scripts/browser_accessibility.py` contrast/touch checks, and the independent
`scripts/library_qa.py` in headless Chromium against the *production build*.
The library suite checks:

1. Fifty? No: the **actual 49-preset catalog**, categories, filter counts and
   empty state (a future catalog expansion requires matching test updates).
2. Keyboard navigation, staging without silent commit, cancel, scroll restoration,
   focus return, Escape-to-clear, and explicit apply.
3. Favorites removal without orphaning focus; hit-target visibility and topmost
   pointer hit testing (not merely high z-index).
4. Layout geometry, vertical results scrolling, fixed footer and horizontal
   overflow at 1440×900, 1024×768, 800×600, 720×450, 390×844, 375×667,
   320×640 and 320×360. A 720×450 CSS viewport is a **zoom/reflow proxy**,
   not a genuine browser zoom setting.
5. Rapid audition, close/reopen state, and browser runtime errors. Audio unit
   tests cover cancellation of a pending preview and disposal of active voices.

Workflow uploads `browser-report/library-*.png` and `library-qa.json` for
human inspection; do not claim a pixel-perfect UI solely from automated checks.

## Manual release checklist

- Inspect actual screenshots at every CI viewport, including empty results,
  selected/in-use states and the shortest landscape layout. Look for chopped
  text, ambiguous actions, awkward whitespace and clipped cards.
- On real iOS Safari and Android Chrome: open on Compose and Tracks, type with
  software keyboard visible, close/reopen, scroll cards without moving the
  background, switch categories, favorite and preview rapidly.
- With keyboard only: open, search, clear, navigate cards, audition, apply,
  cancel; verify no focus is lost and focus rings stay visible. Check with a
  screen reader (VoiceOver/NVDA) that selected and in-use states are distinct.
- Listen to several sounds, cancel while a pad is sustaining and immediately
  switch tracks. Confirm notes are not altered and previews do not keep playing.
- Check 200% *actual* browser zoom and operating-system reduced-motion settings.

**Ship criterion:** Typecheck, ESLint, unit tests, build and both Chromium QA
suites green, plus manual screenshot and physical-device checks. Headless CI
does not certify premium taste, audible quality, accessibility compliance or
real-device behavior.
