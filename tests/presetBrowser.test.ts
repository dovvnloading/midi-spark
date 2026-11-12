import { describe, expect, it } from "vitest";
import { filterSoundPresets, presetViewCounts, sanitizeFavoriteIds, PRESET_VIEWS } from "../src/lib/presetBrowser";
import { PRESET_IDS, SOUND_PRESETS } from "../src/lib/presets";

describe("preset browser discovery", () => {
  it("covers the sound bank and each category without rewriting patches", () => {
    const favorites = new Set(["glass", "sub"]);
    const counts = presetViewCounts(SOUND_PRESETS, "", favorites);
    expect(counts.All).toBe(49);
    expect(counts.Keys).toBe(8);
    expect(counts.Bass).toBeGreaterThan(0);
    expect(counts["Motion & Experimental"]).toBe(3);
    expect(counts.Favorites).toBe(2);
    expect(PRESET_VIEWS).toHaveLength(9);
    expect(filterSoundPresets(SOUND_PRESETS, "", "All")).toHaveLength(49);
    expect(filterSoundPresets(SOUND_PRESETS, "", "Favorites", favorites).map(p => p.id)).toEqual(["glass", "sub"]);
  });

  it("searches multiple words across names, descriptive character and synthesis motion", () => {
    expect(filterSoundPresets(SOUND_PRESETS, "  glass PIANO ", "All").map(p => p.id)).toEqual(["glass"]);
    expect(filterSoundPresets(SOUND_PRESETS, "wow", "Motion & Experimental").map(p => p.id)).toEqual(["warble"]);
    expect(filterSoundPresets(SOUND_PRESETS, "metallic FM", "All").map(p => p.id)).toContain("kalimba");
    expect(filterSoundPresets(SOUND_PRESETS, "glass piano", "Bass")).toHaveLength(0);
    const counts = presetViewCounts(SOUND_PRESETS, "glass piano", new Set(["glass"]));
    expect(counts.All).toBe(1);
    expect(counts.Keys).toBe(1);
    expect(counts.Favorites).toBe(1);
    expect(counts.Bass).toBe(0);
  });

  it("keeps favorite storage compatible with removed or invalid patches", () => {
    expect(sanitizeFavoriteIds(["glass", "glass", "sub", null, 7, "deleted"], PRESET_IDS)).toEqual(["glass", "sub"]);
    expect(sanitizeFavoriteIds("{not json}", PRESET_IDS)).toEqual([]);
    expect(sanitizeFavoriteIds(null, PRESET_IDS)).toEqual([]);
  });
});
