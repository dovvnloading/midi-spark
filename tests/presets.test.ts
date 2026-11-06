import { describe, expect, it } from "vitest";
import {
  PRESET_BY_ID,
  PRESET_CATEGORIES,
  PRESET_GROUP_OPTIONS,
  PRESET_IDS,
  SOUND_PRESETS,
  SYNTH_OPTIONS,
} from "../src/lib/presets";

describe("curated sound library", () => {
  it("has 33 distinct, searchable patches across six useful categories", () => {
    expect(SOUND_PRESETS).toHaveLength(33);
    expect(PRESET_IDS.size).toBe(SOUND_PRESETS.length);
    expect(PRESET_CATEGORIES).toHaveLength(6);
    expect(PRESET_GROUP_OPTIONS.reduce((sum, group) => sum + group.options.length, 0)).toBe(SOUND_PRESETS.length);
    expect(SYNTH_OPTIONS.map((entry) => entry.value)).toEqual(SOUND_PRESETS.map((preset) => preset.id));
  });

  it("keeps existing sound IDs and includes pluck, bass, lead and pad engines", () => {
    for (const oldId of ["classic", "epiano", "pad", "pluck", "dream"]) {
      expect(PRESET_IDS.has(oldId)).toBe(true);
    }
    for (const expected of ["mono", "basic", "fm", "am"]) {
      expect(SOUND_PRESETS.some((preset) => preset.patch.engine === expected)).toBe(true);
    }
  });

  it("describes each sound and keeps safe envelope/volume bounds", () => {
    SOUND_PRESETS.forEach((preset) => {
      expect(PRESET_BY_ID[preset.id]).toBe(preset);
      expect(preset.label.length).toBeGreaterThan(3);
      expect(preset.description.length).toBeGreaterThan(10);
      expect(PRESET_CATEGORIES).toContain(preset.category);
      const patch = preset.patch;
      expect(patch.volume).toBeGreaterThanOrEqual(-18);
      expect(patch.volume).toBeLessThanOrEqual(0);
      expect(patch.envelope.attack).toBeGreaterThanOrEqual(0);
      expect(patch.envelope.release).toBeGreaterThan(0);
      expect(patch.envelope.sustain).toBeGreaterThanOrEqual(0);
      expect(patch.envelope.sustain).toBeLessThanOrEqual(1);
      if (patch.engine === "mono") expect(patch.baseFrequency).toBeGreaterThan(0);
    });
  });
});
