import { PRESET_CATEGORIES, type PresetCategory, type PresetDefinition } from "./presets";

export type PresetView = "All" | "Favorites" | PresetCategory;
export const PRESET_VIEWS: readonly PresetView[] = ["All", "Favorites", ...PRESET_CATEGORIES];

/** Search all descriptive fields. Separate words can match different fields. */
export function filterSoundPresets<T extends PresetDefinition>(
  presets: readonly T[],
  query: string,
  view: PresetView,
  favorites: ReadonlySet<string> = new Set(),
): T[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return presets.filter(preset => {
    if (view === "Favorites" && !favorites.has(preset.id)) return false;
    if (view !== "All" && view !== "Favorites" && preset.category !== view) return false;
    const haystack = [
      preset.label, preset.description, preset.category, preset.character,
      preset.patch.engine, preset.patch.wave, preset.fx,
      "secondWave" in preset.patch ? preset.patch.secondWave : "",
      ...(preset.motion ?? []).map(motion => motion.kind),
    ].join(" ").toLocaleLowerCase();
    return terms.every(term => haystack.includes(term));
  });
}

/** Category counts reflect the current search, not an unrelated global total. */
export function presetViewCounts(
  presets: readonly PresetDefinition[],
  query: string,
  favorites: ReadonlySet<string>,
): Record<PresetView, number> {
  const matches = filterSoundPresets(presets, query, "All", favorites);
  return Object.fromEntries(PRESET_VIEWS.map(view => [
    view,
    view === "All" ? matches.length : matches.filter(preset =>
      view === "Favorites" ? favorites.has(preset.id) : preset.category === view).length,
  ])) as Record<PresetView, number>;
}

/** Ignore corrupted storage, unknown patch IDs and duplicates. */
export function sanitizeFavoriteIds(raw: unknown, knownIds: ReadonlySet<string>): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((item): item is string =>
    typeof item === "string" && knownIds.has(item)))];
}
