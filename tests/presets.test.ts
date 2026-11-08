import { describe, expect, it } from "vitest";
import {
  PRESET_BY_ID,
  PRESET_CATEGORIES,
  PRESET_GROUP_OPTIONS,
  PRESET_IDS,
  SOUND_PRESETS,
  SYNTH_OPTIONS,
} from "../src/lib/presets";

/** Professional sound design is about real spectral/temporal identities,
 * not a new label on the same saw wave and envelope. */
describe("expressive sound bank", () => {
  it("maintains all 33 legacy IDs and offers 49 instruments across seven categories", () => {
    expect(SOUND_PRESETS).toHaveLength(49);
    expect(PRESET_IDS.size).toBe(SOUND_PRESETS.length);
    expect(PRESET_CATEGORIES).toHaveLength(7);
    expect(PRESET_GROUP_OPTIONS.reduce((n, g) => n + g.options.length, 0)).toBe(SOUND_PRESETS.length);
    expect(SYNTH_OPTIONS.map(x => x.value)).toEqual(SOUND_PRESETS.map(x => x.id));
    for (const id of ["classic", "epiano", "pad", "pluck", "dream",
      "velvet", "tines", "organ", "retro", "pulse", "analogBass", "acid",
      "rubberBass", "fmBass", "strings", "chime", "fmLead", "warmPad"]) {
      expect(PRESET_IDS.has(id), id + " would break autosave").toBe(true);
    }
    expect(new Set(SOUND_PRESETS.map(p => p.label)).size).toBe(49);
  });

  it("uses six real voice architectures, not only oscillator/ADSR variations", () => {
    for (const engine of ["basic", "mono", "fm", "am", "duo", "membrane"]) {
      expect(SOUND_PRESETS.some(p => p.patch.engine === engine)).toBe(true);
    }
    expect(SOUND_PRESETS.filter(p => p.patch.engine === "duo").length).toBeGreaterThanOrEqual(5);
    expect(SOUND_PRESETS.filter(p => p.patch.engine === "membrane")).toHaveLength(1);
    expect(SOUND_PRESETS.filter(p => p.patch.wave.startsWith("fat")).length)
      .toBeGreaterThanOrEqual(5);
    expect(SOUND_PRESETS.filter(p => p.patch.wave === "pulse" || p.patch.wave === "pwm").length)
      .toBeGreaterThanOrEqual(4);
  });

  it("delivers individual timbral signatures and genuinely different LFO motion", () => {
    const motionKinds = new Set(SOUND_PRESETS.flatMap(p =>
      (p.motion ?? []).map(m => m.kind)));
    for (const kind of ["chorus", "tremolo", "autoFilter", "autoPan", "vibrato", "phaser"]) {
      expect(motionKinds.has(kind), kind).toBe(true);
    }
    expect(SOUND_PRESETS.filter(p => (p.motion?.length ?? 0) > 0).length)
      .toBeGreaterThanOrEqual(36);
    expect(SOUND_PRESETS.filter(p => (p.motion?.length ?? 0) > 1).length)
      .toBeGreaterThanOrEqual(8);
    const fingerprints = SOUND_PRESETS.map(p => JSON.stringify({
      patch: p.patch, motion: p.motion, color: p.color, fx: p.fx,
    }));
    expect(new Set(fingerprints).size).toBe(49);
    expect(PRESET_BY_ID.sub.fx).toBe("dry");
    expect(PRESET_BY_ID.marimba.fx).toBe("dry");
    expect(PRESET_BY_ID.warble.fx).toBe("tape");
  });

  it("validates useful musical bounds and safe, readable descriptions", () => {
    SOUND_PRESETS.forEach(p => {
      expect(PRESET_BY_ID[p.id]).toBe(p);
      expect(p.label.length).toBeGreaterThanOrEqual(4);
      expect(p.description.length).toBeGreaterThan(15);
      expect(p.character.length).toBeGreaterThan(12);
      expect(PRESET_CATEGORIES).toContain(p.category);
      const { patch } = p;
      expect(patch.volume).toBeGreaterThanOrEqual(-22);
      expect(patch.volume).toBeLessThanOrEqual(0);
      for (const e of [patch.envelope, ...(patch.engine === "fm" || patch.engine === "am"
        ? [patch.modulationEnvelope] : patch.engine === "duo" ? [patch.secondEnvelope] :
          patch.engine === "mono" ? [patch.filterEnvelope] : [])]) {
        expect(e.attack).toBeGreaterThanOrEqual(0);
        expect(e.decay).toBeGreaterThanOrEqual(0);
        expect(e.sustain).toBeGreaterThanOrEqual(0);
        expect(e.sustain).toBeLessThanOrEqual(1);
        expect(e.release).toBeGreaterThanOrEqual(0);
      }
      if (patch.engine === "mono") {
        expect(patch.baseFrequency).toBeGreaterThan(30);
        expect(patch.octaves).toBeGreaterThan(0);
      }
      if (patch.engine === "membrane") {
        expect(patch.pitchDecay).toBeGreaterThan(0);
        expect(patch.octaves).toBeGreaterThanOrEqual(0.5);
      }
      if ("unison" in patch && patch.unison) {
        expect(patch.wave.startsWith("fat")).toBe(true);
        expect(patch.unison.count).toBeGreaterThanOrEqual(2);
        expect(patch.unison.count).toBeLessThanOrEqual(5);
        expect(patch.unison.spread).toBeLessThanOrEqual(40);
      }
      expect(p.velocityCurve ?? 1).toBeGreaterThanOrEqual(.6);
      expect(p.velocityCurve ?? 1).toBeLessThanOrEqual(1.6);
      expect(p.polyphony ?? 16).toBeGreaterThanOrEqual(7);
      if (p.color) {
        expect(p.color.frequency).toBeGreaterThanOrEqual(20);
        expect(p.color.frequency).toBeLessThanOrEqual(11000);
        expect(p.color.q).toBeGreaterThan(0);
      }
      for (const m of p.motion ?? []) {
        expect(m.rate).toBeGreaterThan(0);
        expect(m.rate).toBeLessThan(12);
        expect(m.wet).toBeGreaterThanOrEqual(0);
        expect(m.wet).toBeLessThanOrEqual(.8);
        if ("depth" in m) {
          expect(m.depth).toBeGreaterThan(0);
          expect(m.depth).toBeLessThanOrEqual(.95);
        }
      }
    });
  });
});
