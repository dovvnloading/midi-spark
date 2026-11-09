import { describe, expect, it } from "vitest";
import { PROJECT_FORMAT, PROJECT_VERSION, parseNativeProjectText,
  serializeNativeProject } from "../src/lib/projectFile";
import type { SavedSession } from "../src/lib/persistence";
import type { ProgressionData } from "../src/lib/theory";

const progression: ProgressionData = {
  notes: [
    { midi: 60, name: "C4", timeStart: 0, duration: 0.75, velocity: 0.8, trackIndex: 0 },
    { midi: 48, name: "C3", timeStart: 0, duration: 1.4, velocity: 0.7, trackIndex: 2 },
  ],
  chords: [
    { name: "C", timeStart: 0, duration: 4, generatedSourceTrackIndex: 0, locked: true },
  ],
  totalBars: 16,
  tracks: [
    { index: 0, name: "User melody", program: 11, channel: 0 },
    { index: 2, name: "Generated Bass", program: 32, channel: 2,
      generatedRole: "bass", sourceTrackIndex: 0 },
    { index: 3, name: "Generated Harmony", program: 1, channel: 3,
      generatedRole: "harmony", sourceTrackIndex: 0 },
  ],
  nextTrackIndex: 4,
  harmonyConstraints: [{ sourceTrackIndex: 0, bar: 2, kind: "avoid", chord: "G7" }],
  arrangementSections: [
    { label: "A", role: "theme", startBar: 0, bars: 4 },
    { label: "A′", role: "variation", startBar: 4, bars: 4 },
    { label: "B", role: "contrast", startBar: 8, bars: 4 },
    { label: "A (return)", role: "reprise", startBar: 12, bars: 4 },
  ],
};
const session: SavedSession = {
  progression, root: "C", mode: "major", bpm: 96, dissonance: 50,
  complexity: 46, bars: 4, generationMode: "layers",
  melodySourceMode: "follow", melodySourceTrackIndex: 0,
  melodyPhraseScope: "loop", harmonicFit: 82, harmonyExploration: 90,
  phraseCoherence: 75, accompanimentDensity: "balanced", harmonicPacing: "adaptive",
  melodyKeyStrategy: "manual", melodyTask: "harmonize",
  motifCreativity: 50, continuationBars: 4,
  synthType: "epiano", snapResolution: 0.25, noteLength: 0.5, zoomX: 60,
  isLooping: true, loopRegion: { start: 8, end: 12 },
  trackMix: {
    0: { synthType: "pad", muted: false, solo: false, level: 0.8 },
    2: { synthType: "sub", muted: false, solo: false, level: 0.6 },
    3: { synthType: "epiano", muted: false, solo: false, level: 0.7 },
  },
};
describe("native MIDI Spark project archive", () => {
  it("round trips a fully editable arrangement, audio, ownership, lock and guide metadata", () => {
    const before = JSON.stringify(session);
    const text = serializeNativeProject(session);
    const parsed = parseNativeProjectText(text);
    expect(parsed).toEqual({ ok: true, session });
    expect(JSON.stringify(session)).toBe(before);
    const envelope = JSON.parse(text);
    expect(envelope.format).toBe(PROJECT_FORMAT);
    expect(envelope.version).toBe(PROJECT_VERSION);
  });

  it("reports unrecognized, future, empty, malformed, and oversized files without making edits", () => {
    const example = JSON.parse(serializeNativeProject(session));
    const cases = [
      "{not-json",
      "{}",
      "null",
      JSON.stringify({ ...example, format: "another-application" }),
      JSON.stringify({ ...example, version: 999 }),
      JSON.stringify({ ...example, session: { ...session, progression: { ...progression, notes: [{ midi: "invalid" }] } } }),
      JSON.stringify({ ...example, session: { ...session, bpm: -20 } }),
      JSON.stringify({ ...example, session: { ...session, root: "not a key" } }),
      JSON.stringify({ ...example, session: { ...session, progression: { ...progression,
        notes: [{ ...progression.notes[0], midi: 160 }] } } }),
      JSON.stringify({ ...example, session: { ...session, progression: { ...progression,
        notes: [{ ...progression.notes[0], timeStart: 999 }] } } }),
      " ".repeat(16 * 1024 * 1024 + 1),
    ];
    for (const input of cases) expect(parseNativeProjectText(input).ok).toBe(false);
    expect(JSON.stringify(session)).toBe(JSON.stringify({ ...session }));
  });

  it("rejects corrupt/misaligned native form data instead of guessing section positions", () => {
    const example = JSON.parse(serializeNativeProject(session));
    example.session.progression.arrangementSections[2].startBar = 9;
    expect(parseNativeProjectText(JSON.stringify(example))).toMatchObject({
      ok: false, reason: expect.stringMatching(/invalid/),
    });
    const extended: SavedSession = { ...session, progression: {
      ...progression, totalBars: 20,
    } };
    expect(parseNativeProjectText(serializeNativeProject(extended))).toEqual({
      ok: true, session: extended,
    });
    const sparse: SavedSession = { ...session, progression: {
      notes: [], chords: [], totalBars: 4,
    } };
    expect(parseNativeProjectText(serializeNativeProject(sparse))).toEqual({
      ok: true, session: sparse,
    });
  });
});
