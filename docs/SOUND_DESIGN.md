# MIDI Spark — Sound Design Engineering
## Expressive procedural instrument library, v2

The sound bank is a set of **49 original procedural Tone.js patches**, not a
soundfont, audio-sample library or an attempted acoustic-instrument emulator.
All original 33 preset IDs were preserved. The goal is genuinely contrasting
envelope shapes, harmonic content, time-varying spectra, and playing dynamics.
A sound needs a useful role in music, not just a different synth wave name.

### Why the earlier bank felt similar

The former 33 presets used only four engine templates (Synth, MonoSynth,
FMSynth and AMSynth). Their main differences were carrier wave, modulation
ratio, filter envelope, volume and ADSR. They were then routed through just
five hard-coded, shared chorus/tremolo/phaser/reverb/delay families. In
particular, "dry" sub bass, mallet and pluck voices were subjected to ambient
effects appropriate to pads/keys. In a multitrack arrangement this homogenized
attacks, tails and stereo motion, despite many different names.

The new system separates **voice identity**, **color**, **movement**,
**dynamics**, and **room/echo**. Audio can be auditioned at low and high MIDI
velocity without rewriting the notes in a MIDI file.

### Architecture: six distinct sound engines

| Voice engine | What actually changes | Where it is useful |
|---|---|---|
| Basic Synth | Sine/triangle/square/saw, pulse/PWM and 2–4 detuned FatOscillator voices | Smooth mallets, unison poly keys, spectral pads |
| Filtered MonoSynth | Note-triggered resonant lowpass/filter-envelope sweeps, with optional fat/pulse/PWM source | Acid/rubber bass, brass, filterstep, responsive leads |
| FMSynth | Carrier/modulator ratio, index and independently decaying FM modulation envelope | Tines, bells, digital edge, resonant wood, FM bass |
| AMSynth | Ring/amplitude modulation via separate oscillators and envelope | Textural, metallic, softly moving synthetic pads |
| DuoSynth | Two oscillator voices with distinct waveforms, envelopes, harmonicity and subtle vibrato | Choir-like synthesis, reed keys, evolving pads, dual leads |
| MembraneSynth | Tuned frequency envelope / pitch drop, distinct from simply filtering a sine | Punchy pitched percussive low-end |

Tone.js's `PolySynth` provides the same note input across all six engines.
Each expensive unison or dual-voice patch has its own low polyphony limit,
while ordinary patches have a conservative limit of 16. The preset catalog
is typed and validated: changes to patch structure fail typecheck/tests.

### Audible differences: programmed modulation

Instruments optionally insert individual processors in this order:

```
voice oscillator(s) and native envelopes
  → optional static spectral color: lowpass / highpass / bandpass
  → preset motion: chorus, tremolo, AutoFilter, AutoPanner, Vibrato, Phaser
  → independent track gain (live level, mute, solo)
  → shared acoustic space or echo rack, OR dry path
  → single master peak limiter
  → Web Audio destination
```

Each LFO modulation is **per active instrument**, not a random, globally
shared animation applied to all pads. Parameters are specified per patch:
frequency in Hertz, depth, wetness, modulation sweep range, chorus delay and
stereo spread. AutoFilter, AutoPanner, chorus and tremolo LFOs are started
and disposed correctly; they do not run as dozens of inactive background
oscillators. A fresh processor chain is built on track instrument changes
and fully disposed with the old synth. The common reverb/echo racks do not
multiply for every new instrument.

Important choices:
- `Deep Sub`, `Wooden Mallet`, `Modern Pluck`, `Hollow Clav` and
  `Pitch Punch` avoid broad, sustained wet racks. Their attacks stay defined.
- `Horizon Swell`, `Tidal Choir`, `Nebula Drift` and `Orbital Field`
  use *slow* LFO changes, long envelopes, stereo motion and space.
- `Neon Poly`, `Unison Stack`, `Classic Analog` and `Saw Runner`
  use genuinely detuned fat oscillators instead of a single dry saw.
- `Vowel Formant`, `Filterstep` and `Circuit Dial` use pulse/PWM and
  moving resonant filters, while FM bells change harmonic content through
  their carrier/modulator envelope.
- `Magnetic Warble` uses slow pitch drift plus tremolo and a restrained
  tape-like delay bus, deliberately distinct from the long FM bell tails.

### Dynamic range and instrument response

MIDI velocity is passed through an explicit per-patch power curve,
`outputVelocity = clamp(inputVelocity, 0, 1) ** velocityCurve`,
with a tiny nonzero floor to avoid invalid/numerically silent triggers.
The curve changes **what gets sent to Tone**, not the stored MIDI event.
A curve below one keeps gently played patches audible; a curve above one
requires harder playing before bright or attack-heavy presets reach full
strength. For FM and filtered voices this works alongside their native
note-triggered envelope behavior.

The audition comparison schedules two related phrases: a quiet strike and
a strong strike. Slow pads are held longer so the changing filter and
oscillator blend can be heard; short percussive voices keep tighter phrases.
The preview is independent from the selected instrument and Track mixer,
so browsing sounds does not alter the arrangement.

### Studio routing and performance

- 49 definitions do **not** mean 49 active synths at startup. The 5 legacy
  core preview patches remain initialized for backwards compatibility, but
  other sounds are created only on demand by a track, preview, or audition.
  Selection caches at most one extra preview voice and one audition voice.
- Existing track mixer gain nodes remain after each sound's own spectral/motion
  chain, preserving live level and mute/solo behavior during sustained notes.
- Per-voice modulation/filter nodes are disposed when changing tracks,
  switching preview instruments or auditioning another patch. This is a
  necessary guard against accumulating LFOs and audio nodes in long sessions.
- The common effect buses provide their own carefully restrained ambience
  and a dry path. A shared peak limiter helps avoid summed clipping, but is
  **not a loudness normalizer**: users should still balance multi-track levels,
  particularly at extreme density.
- No audio files, new runtime modules or server connections are required.
  Preset IDs remain compatible with saved v1 project sessions and imported
  TrackMix settings. Standard MIDI export does not embed browser synth patches.

### Tests and honest quality limits

Tests assert: catalog uniqueness/compatibility, all 49 constructible voice
configurations, six distinct engine choices, multiple LFO types, bounded
envelopes/parameters, velocity-response monotonicity, soft/hard preview,
node disposal, mixer source isolation and MIDI transport behavior.
The Chromium suite previews **every one of the 49 sounds** in an actual
Web Audio context and checks real user selection/saves.

These are engineering and runtime checks, **not** a psychoacoustic claim that
all 49 presets sound excellent, are loudness-matched, or outperform a commercial
sample library. The bank deliberately remains procedural and relatively
lightweight; credible acoustic grand piano, realistic cymbals and bowed
instrument articulations require high-quality recordings or much more
complex instruments.

#### Critical listening acceptance — recommended

For a rigorous future sound-design review:

1. Audition every patch on C2, C3, C4 and C5 (as musically appropriate),
   softly and strongly, with duration 0.25s/1s/3s. Use *matched perceived
   loudness* when judging timbre; louder is not automatically better.
2. Listen for clicks, high-note aliasing, chorus detuning, harsh FM partials,
   a bass fundamental that disappears on small speakers and long reverb tails
   obscuring subsequent notes. Compare clean/dense chords in each preset.
3. Measure per-note peak, RMS/LUFS, attack time, harmonic distribution,
   clipping and stereo correlation in Web Audio offline renders.
4. Pairwise compare plausibly similar neighbors in each category and check
   whether listeners can consistently distinguish the synthesized instrument
   *after* normalizing gain. If not, redesign or remove redundant patches.
5. Evaluate expressivity with velocity 0.2, 0.5 and 0.95 and determine
   whether the timbre responds appropriately. Use a mix of headphones,
   monitors and low-frequency-limited speakers.
6. Subjective preferences and validated loudness balancing should be measured
   with an external listening study; this release does not claim one occurred.

### Next implementation opportunities

- A user-editable **macro panel** per instrument (Brightness / Movement /
  Space / Drive) with bounded ranges and a preset-reset action.
- Optional stereo sends per *track* rather than a shared family rack, where
  CPU and memory budgets permit; performance profiles for low-end mobile.
- Optional properly licensed recorded multisamples for acoustic families,
  with explicit offline caching, provenance and user consent.
- Browser-based offline timbral render QA and blind ABX listening research
  comparing the patches against one another at matched perceived loudness.

### Primary references

- [Tone.js 15.1.22 API](https://tonejs.github.io/docs/15.1.22/index.html)
- [PolySynth voice allocation](https://tonejs.github.io/docs/15.1.22/classes/PolySynth.html)
- [DuoSynth engine](https://tonejs.github.io/docs/15.0.4/classes/DuoSynth.html)
- [MembraneSynth pitch envelope](https://tonejs.github.io/docs/15.1.22/classes/MembraneSynth.html)
- [AutoFilter synthesis movement](https://tonejs.github.io/docs/15.0.4/classes/AutoFilter.html)
