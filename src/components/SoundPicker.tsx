import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Headphones, LoaderCircle, Play, Search, SlidersHorizontal, Star, X } from "lucide-react";
import { auditionPreset } from "../lib/audio";
import { filterSoundPresets, presetViewCounts, sanitizeFavoriteIds, PRESET_VIEWS, type PresetView } from "../lib/presetBrowser";
import { PRESET_BY_ID, PRESET_IDS, SOUND_PRESETS, type SynthType } from "../lib/presets";

export interface SoundPickerProps {
  value: SynthType;
  onChange: (type: SynthType) => void;
  label?: string;
  onPreviewError?: (message: string) => void;
}

const FAVORITES_STORAGE_KEY = "midi-spark:sound-favorites";
const FAVORITES_CHANGED_EVENT = "midi-spark:sound-favorites-updated";
let cachedFavorites: Set<SynthType> | null = null;

function readFavorites(): Set<SynthType> {
  if (cachedFavorites) return cachedFavorites;
  try {
    cachedFavorites = new Set(sanitizeFavoriteIds(JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY) ?? "[]"), PRESET_IDS) as SynthType[]);
  } catch {
    // In-memory favorites still work when browser storage is unavailable.
    cachedFavorites = new Set();
  }
  return cachedFavorites;
}

function saveFavorites(next: Set<SynthType>): void {
  cachedFavorites = next;
  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify([...next]));
  } catch {
    // The in-memory cache continues to serve every mounted picker.
  }
  window.dispatchEvent(new Event(FAVORITES_CHANGED_EVENT));
}

/** Shared by Compose and the track mixer. Browsing and auditioning never
 * change the active patch; only the explicit Use action commits a choice. */
export function SoundPicker({ value, onChange, label = "Sound", onPreviewError }: SoundPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<PresetView>("All");
  const [draft, setDraft] = useState<SynthType>(value);
  const [favorites, setFavorites] = useState<Set<SynthType>>(readFavorites);
  const [auditioning, setAuditioning] = useState<SynthType | null>(null);
  const sequence = useRef(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const descriptionId = useId();

  const applied = PRESET_BY_ID[value] ?? PRESET_BY_ID.classic;
  const candidate = PRESET_BY_ID[draft] ?? applied;
  const counts = useMemo(() => presetViewCounts(SOUND_PRESETS, query, favorites), [query, favorites]);
  const filtered = useMemo(() => filterSoundPresets(SOUND_PRESETS, query, view, favorites), [query, view, favorites]);
  const filtersActive = view !== "All" || query.trim().length > 0;

  // Compose and each track have independent pickers. Keep their favorites in
  // sync, including edits made in another tab of the same browser.
  useEffect(() => {
    const sync = () => setFavorites(readFavorites());
    const onStorage = (event: StorageEvent) => {
      if (event.key !== FAVORITES_STORAGE_KEY) return;
      cachedFavorites = null;
      sync();
    };
    window.addEventListener(FAVORITES_CHANGED_EVENT, sync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(FAVORITES_CHANGED_EVENT, sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  // The browser is a real modal on every viewport, not a popover that leaves
  // underlying editor controls tabbable. Focus returns to its originating track.
  useLayoutEffect(() => {
    if (!open) return;
    const root = document.getElementById("root");
    const previouslyInert = root?.inert ?? false;
    if (root) root.inert = true;
    searchRef.current?.focus({ preventScroll: true });
    return () => {
      if (root) root.inert = previouslyInert;
      if (triggerRef.current?.isConnected) triggerRef.current.focus({ preventScroll: true });
    };
  }, [open]);

  const close = () => setOpen(false);

  const toggle = () => {
    if (open) { close(); return; }
    setQuery("");
    setView("All");
    setDraft(value);
    setOpen(true);
  };

  const preview = (type: SynthType) => {
    const request = ++sequence.current;
    setAuditioning(type);
    void auditionPreset(type)
      .catch(() => onPreviewError?.("Audio preview could not start. Check your browser audio settings."))
      .finally(() => {
        if (sequence.current === request) setAuditioning(null);
      });
  };

  const switchView = (next: PresetView) => {
    setView(next);
    resultsRef.current?.scrollTo({ top: 0 });
  };

  const updateQuery = (next: string) => {
    setQuery(next);
    resultsRef.current?.scrollTo({ top: 0 });
  };

  const toggleFavorite = (id: SynthType) => {
    const next = new Set(readFavorites());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    saveFavorites(next);
    setFavorites(next);
  };

  const resetFilters = () => {
    setQuery("");
    setView("All");
    resultsRef.current?.scrollTo({ top: 0 });
    searchRef.current?.focus();
  };

  const apply = () => {
    if (draft !== value) onChange(draft);
    close();
  };

  const onDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === "Tab") {
      const tabbables = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled])',
      ) ?? []).filter(element => element.getClientRects().length > 0);
      const first = tabbables[0], last = tabbables[tabbables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  };

  return (
    <div className="sound-picker">
      <div className="sound-picker-control">
        <button
          ref={triggerRef}
          type="button"
          aria-label={label + ": " + applied.label + ". Open sound library"}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="sound-picker-trigger"
          onClick={toggle}
        >
          <span className="sound-picker-title">
            <span className="sound-picker-kicker">CURRENT PRESET</span>
            <strong>{applied.label}</strong>
            <small>{applied.category}</small>
          </span>
          <ChevronDown size={17} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="sound-picker-listen"
          aria-busy={auditioning === value}
          aria-label={"Audition " + applied.label}
          title={"Hear " + applied.label + " without changing MIDI notes"}
          onClick={() => preview(value)}
        >
          {auditioning === value
            ? <LoaderCircle className="animate-spin" size={17} aria-hidden="true" />
            : <Play size={17} fill="currentColor" aria-hidden="true" />}
        </button>
      </div>
      <p className="sound-picker-helper">{applied.description}</p>
      <span className="sr-only" role="status" aria-live="polite">
        {auditioning ? "Preparing " + PRESET_BY_ID[auditioning].label : ""}
      </span>

      {open && createPortal(
        <div className="sound-library-layer">
          <div className="sound-library-backdrop" aria-hidden="true" onPointerDown={close} />
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Sound library"
            aria-describedby={descriptionId}
            className="sound-library"
            onKeyDown={onDialogKeyDown}
          >
            <header className="sound-library-header">
              <div className="sound-library-header-copy">
                <span className="sound-library-eyebrow"><SlidersHorizontal size={14} aria-hidden="true" /> INSTRUMENT BROWSER</span>
                <h2>Find your sound<span>.</span></h2>
                <p id={descriptionId}>Explore and audition freely. Your track changes only when you apply a preset.</p>
              </div>
              <button type="button" className="sound-library-close" aria-label="Close sound library" onClick={close}>
                <X size={20} aria-hidden="true" />
              </button>
            </header>

            <div className="sound-library-body">
              <nav className="sound-library-categories" aria-label="Sound categories">
                <span className="sound-library-nav-label">BROWSE BY TYPE</span>
                {PRESET_VIEWS.map(name => (
                  <button key={name} type="button" className={name === "Favorites" ? "favorite-view" : ""}
                    aria-label={name} aria-pressed={view === name} onClick={() => switchView(name)}>
                    <span className="sound-library-nav-name">
                      {name === "Favorites" && <Star size={14} aria-hidden="true" />}
                      {name === "All" ? "All sounds" : name}
                    </span>
                    <span className="sound-library-nav-count" aria-hidden="true">{counts[name]}</span>
                  </button>
                ))}
                <div className="sound-library-nav-note">
                  <Headphones size={16} aria-hidden="true" />
                  <span>49 original synthesized patches. No samples to download.</span>
                </div>
              </nav>

              <div className="sound-library-main">
                <div className="sound-library-tools">
                  <label className="sound-library-search">
                    <Search size={18} aria-hidden="true" />
                    <input ref={searchRef} type="search" value={query}
                      onChange={event => updateQuery(event.target.value)}
                      placeholder="Search sounds, moods, synth types…"
                      aria-label="Search presets" />
                    <span className="sound-library-search-hint" aria-hidden="true">SEARCH</span>
                  </label>
                  <div className="sound-library-summary">
                    <p role="status" aria-live="polite" aria-atomic="true">{filtered.length} of {SOUND_PRESETS.length} sounds</p>
                    {filtersActive && <button type="button" className="sound-library-reset" onClick={resetFilters}>Clear filters</button>}
                  </div>
                </div>

                <div className="sound-library-results" ref={resultsRef} aria-label="Preset results">
                  {filtered.length === 0 ? (
                    <div className="sound-library-empty">
                      <Search size={25} aria-hidden="true" />
                      <strong>{view === "Favorites" && !query.trim() ? "No favorites yet" : "No matching sounds"}</strong>
                      <p>{view === "Favorites" && !query.trim()
                        ? "Star a preset while browsing to keep it here for quick access."
                        : "Try another instrument or timbre, or reset your filters."}</p>
                      <button type="button" onClick={resetFilters}>Show all sounds</button>
                    </div>
                  ) : filtered.map(preset => {
                    const isDraft = preset.id === draft;
                    const inUse = preset.id === value;
                    const isFavorite = favorites.has(preset.id);
                    return (
                      <div className="sound-library-row" key={preset.id} data-category={preset.category}
                        data-active={isDraft} data-in-use={inUse}>
                        <button type="button" className="sound-library-select"
                          aria-label={"Select " + preset.label}
                          aria-pressed={isDraft}
                          onClick={() => setDraft(preset.id)}>
                          <span className="sound-library-row-topline">
                            <span className="sound-library-row-category">{preset.category}</span>
                            {inUse ? <span className="sound-library-row-tag"><Check size={12} aria-hidden="true" /> In use</span>
                              : isDraft ? <span className="sound-library-row-tag">Ready to apply</span> : null}
                          </span>
                          <span className="sound-library-row-copy">
                            <strong>{preset.label}</strong>
                            <small>{preset.description}</small>
                            <span className="sound-library-row-character">{preset.character}</span>
                          </span>
                        </button>
                        <div className="sound-library-row-actions">
                          <button type="button" className="sound-library-favorite"
                            aria-label={(isFavorite ? "Remove " : "Add ") + preset.label + (isFavorite ? " from favorites" : " to favorites")}
                            aria-pressed={isFavorite} title={isFavorite ? "Remove from favorites" : "Add to favorites"}
                            onClick={() => toggleFavorite(preset.id)}>
                            <Star size={17} fill={isFavorite ? "currentColor" : "none"} aria-hidden="true" />
                          </button>
                          <button type="button" className="sound-library-row-play"
                            aria-busy={auditioning === preset.id} aria-label={"Preview " + preset.label}
                            title={"Preview " + preset.label + " without applying"} onClick={() => preview(preset.id)}>
                            {auditioning === preset.id
                              ? <LoaderCircle className="animate-spin" size={16} aria-hidden="true" />
                              : <Play size={16} fill="currentColor" aria-hidden="true" />}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <footer className="sound-library-footer">
              <div className="sound-library-choice">
                <span className="sound-library-choice-eyebrow">{draft === value ? "CURRENT SOUND" : "READY TO APPLY"}</span>
                <strong>{candidate.label}</strong>
                <small>{candidate.category} <span aria-hidden="true">·</span> {draft === value
                  ? "Already in use on this track" : "Currently using " + applied.label}</small>
              </div>
              <div className="sound-library-footer-actions">
                <button type="button" className="sound-library-preview-action" onClick={() => preview(draft)}
                  aria-busy={auditioning === draft} aria-label={"Preview selected sound: " + candidate.label}>
                  {auditioning === draft
                    ? <LoaderCircle className="animate-spin" size={17} aria-hidden="true" />
                    : <Play size={16} fill="currentColor" aria-hidden="true" />}
                  <span>Preview</span>
                </button>
                <button type="button" className="sound-library-apply" onClick={apply}>
                  {draft === value ? "Done" : "Use " + candidate.label}
                  {draft !== value && <Check size={17} aria-hidden="true" />}
                </button>
              </div>
            </footer>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
