# MIDI Spark — UI/UX Quality Audit and Issue Backlog
**8 November 2026** · Audited code revision: `d8a07a1f`

## Purpose and evidence

The project has a capable editor and detailed feature coverage, but has accumulated
friction in direct manipulation, mobile accessibility, visual hierarchy and
risk communication. This audit deliberately began by **filing actionable
GitHub issues #34–#47 before editing implementation files**.

Reviewed: `src/App.tsx`, piano roll, inspector/Compose, track studio, SoundPicker,
transport, toolbars, shortcut help, toast handling, global styles, existing
desktop/mobile screenshots and 66 passing Chromium smoke checks. Screenshots in
`docs/screenshots` are captures of an earlier UI state; source code and new
browser tests take precedence for current behavior.

This is **code and screenshot evidence**, not an independent end-user usability
study, screen-reader certification or full WCAG audit. Issues explicitly
distinguish reproducible behaviors from recommended design improvements.

## Prioritized issue ledger

| Priority | Issue | Impact | Area |
|---|---|---|---|
| P1 | [#34](https://github.com/dovvnloading/midi-spark/issues/34) | BPM entry clamps intermediate input | Transport |
| P1 | [#35](https://github.com/dovvnloading/midi-spark/issues/35) | No per-note keyboard navigation/editing | Piano roll |
| P1 | [#36](https://github.com/dovvnloading/midi-spark/issues/36) | Velocity lane inaccessible without pointer | Piano roll |
| P1 | [#37](https://github.com/dovvnloading/midi-spark/issues/37) | Loop-range instructions require Shift on touch | Mobile / Compose |
| P1 | [#38](https://github.com/dovvnloading/midi-spark/issues/38) | Microtype and control readability | Visual design |
| P1 | [#39](https://github.com/dovvnloading/midi-spark/issues/39) | Tiny editing targets, active tool unclear | Mobile |
| P1 | [#40](https://github.com/dovvnloading/midi-spark/issues/40) | Import/generate silently replaces current project | Project safety |
| P1 | [#41](https://github.com/dovvnloading/midi-spark/issues/41) | Audio preview failures swallowed/transient | Feedback |
| P1 | [#42](https://github.com/dovvnloading/midi-spark/issues/42) | Browser sound vs GM export program mismatch | MIDI export |
| P1 | [#43](https://github.com/dovvnloading/midi-spark/issues/43) | Melody inspector has high cognitive load | Composition |
| P2 | [#44](https://github.com/dovvnloading/midi-spark/issues/44) | Search results and selected state unclear | Sound library |
| P2 | [#45](https://github.com/dovvnloading/midi-spark/issues/45) | Missing gestures/touch alternatives in Help | Onboarding |
| P2 | [#46](https://github.com/dovvnloading/midi-spark/issues/46) | Editing target unclear in 'All tracks' view | Multitrack editing |
| P2 | [#47](https://github.com/dovvnloading/midi-spark/issues/47) | 4/4 badge may misrepresent source meter | MIDI timeline |

## Work packages

**First release candidate: [PR #48](https://github.com/dovvnloading/midi-spark/pull/48)**
addresses immediate, highly reproducible friction: incremental BPM editing,
explicit touch/keyboard loop bar range controls, concise active-tool guidance,
sticky/accessible audio errors, sound-filter status and clearing, shortcut help,
a visible target track and truthful '4/4 grid' wording, with a targeted
typography and touch-control pass.

Keep **#38 and #39 open** if full contrast/target-size verification or
keyboard alternatives are incomplete. Keep **#47 open** until imported meter
is actually modeled or appropriately warned about. Even good partial fixes
should not be marked fully resolved without meeting their acceptance criteria.

**Next: direct manipulation and safety** — #35, #36 and #40. These require a
coherent keyboard note-selection model and a preflight 'replace arrangement'
interaction for imports and generation. Design and acceptance tests together;
avoid a piecemeal collection of keyboard shortcuts that disagree with pointer
editing or cause hidden destructive changes.

**Then: product information architecture** — #42 and #43. Review the
preview/GM export relationship at the point of decision; progressively disclose
advanced harmony controls by task, preserving user preferences and efficient
multi-track workflows.

## Release gates and user-centered follow-up

- **Behavior:** 66 existing browser checks, plus tests for typed BPM, a mobile
  loop created without Shift, track target feedback, and sound search.
- **Accessibility:** keyboard-only task completion; concrete focus order and
  visible focus; WCAG 2.2 target-size/spacing checks (SC 2.5.8), dragging
  alternatives (SC 2.5.7), text contrast (SC 1.4.3), and meaningful-control
  non-text contrast (SC 1.4.11).
- **Responsive:** capture and inspect 320×640, 375×667, 390×844, 768×768,
  and 1440×900, plus 200% browser zoom. Protect the playable piano viewport
  from vertical toolbar bloat.
- **Usability study:** time three short tasks (type BPM and play; set a two-bar
  loop on touch; import melody, focus track and harmonize), then attempt
  keyboard-only note/velocity editing. Ask where users believe new notes
  will be drawn and what an exported MIDI instrument contains.
- **Quality:** prefer task clarity, reachable controls and truthful outcomes
  over decorative complexity. Avoid claiming broad accessibility compliance
  or 'professional grade' solely from CSS improvements.

### Design references
- [WCAG 2.2 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum)
- [WCAG 2.2 dragging movements and contrast](https://www.w3.org/TR/WCAG22/)
- [ARIA modal dialog focus management](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
