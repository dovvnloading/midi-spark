import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Headphones, LocateFixed, LoaderCircle, Play, Search, SlidersHorizontal, Star, X } from "lucide-react";
import { auditionPreset, cancelPresetAudition } from "../lib/audio";
import { filterSoundPresets, presetViewCounts, sanitizeFavoriteIds, PRESET_VIEWS, type PresetView } from "../lib/presetBrowser";
import { PRESET_BY_ID, PRESET_IDS, SOUND_PRESETS, type SynthType, type Wave } from "../lib/presets";

export interface SoundPickerProps {
  value: SynthType;
  onChange: (type: SynthType) => void;
  label?: string;
  onPreviewError?: (message: string) => void;
}

// A small visual representation of the oscillator family, not sampled audio.
const WAVE_FORMS: Record<Wave, string> = {
  sine: "M0 24 Q9 1 18 24 T36 24 T54 24 T72 24 T90 24 T108 24 T126 24 T144 24",
  triangle: "M0 24 L9 5 L27 43 L45 5 L63 43 L81 5 L99 43 L117 5 L135 43 L144 24",
  fattriangle: "M0 24 L9 7 L27 41 L45 7 L63 41 L81 7 L99 41 L117 7 L135 41 L144 24",
  square: "M0 35 H18 V12 H36 V35 H54 V12 H72 V35 H90 V12 H108 V35 H126 V12 H144",
  fatsquare: "M0 33 H18 V14 H36 V33 H54 V14 H72 V33 H90 V14 H108 V33 H126 V14 H144",
  sawtooth: "M0 41 L35 7 V41 L71 7 V41 L107 7 V41 L143 7",
  fatsawtooth: "M0 39 L35 9 V39 L71 9 V39 L107 9 V39 L143 9",
  pulse: "M0 35 H9 V10 H22 V35 H45 V10 H58 V35 H81 V10 H94 V35 H117 V10 H130 V35 H144",
  pwm: "M0 36 H11 V12 H22 V36 H49 V12 H61 V36 H80 V12 H96 V36 H119 V12 H130 V36 H144",
};

function SoundSignature({ wave }: { wave: Wave }) {
  return (
    <svg className="sound-library-wave" viewBox="0 0 144 48" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path className="sound-library-wave-center" d="M0 24 H144" />
      <path className="sound-library-wave-shape" d={WAVE_FORMS[wave]} />
    </svg>
  );
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
  const [previewError, setPreviewError] = useState<string | null>(null);
  const sequence = useRef(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
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
    const trigger = triggerRef.current;
    const previouslyInert = root?.inert ?? false;
    const previousBodyOverflow = document.body.style.overflow;
    const previousPageOverflow = document.documentElement.style.overflow;
    const updateViewport = () => {
      // The virtual keyboard can shrink the visible viewport without changing
      // CSS 100dvh. Keep the preview/commit actions reachable on mobile.
      const viewport = window.visualViewport;
      layerRef.current?.style.setProperty("--library-height", `${viewport?.height ?? window.innerHeight}px`);
      layerRef.current?.style.setProperty("--library-top", `${viewport?.offsetTop ?? 0}px`);
    };
    if (root) root.inert = true;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    updateViewport();
    window.addEventListener("resize", updateViewport);
    window.visualViewport?.addEventListener("resize", updateViewport);
    window.visualViewport?.addEventListener("scroll", updateViewport);
    searchRef.current?.focus({ preventScroll: true });
    return () => {
      cancelPresetAudition();
      window.removeEventListener("resize", updateViewport);
      window.visualViewport?.removeEventListener("resize", updateViewport);
      window.visualViewport?.removeEventListener("scroll", updateViewport);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousPageOverflow;
      if (root) root.inert = previouslyInert;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [open]);

  const close = () => {
    // Ignore late promise completions as soon as the dialog is dismissed.
    ++sequence.current;
    setAuditioning(null);
    setOpen(false);
  };

  const toggle = () => {
    if (open) { close(); return; }
    setQuery("");
    setView("All");
    setDraft(value);
    setPreviewError(null);
    setOpen(true);
  };

  const preview = (type: SynthType) => {
    const request = ++sequence.current;
    setPreviewError(null);
    setAuditioning(type);
    void auditionPreset(type)
      .catch(() => {
        if (sequence.current !== request) return;
        const message = "Audio preview could not start. Check your browser audio settings.";
        setPreviewError(message);
        onPreviewError?.(message);
      })
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
    // Removing the focused card from Favorites would otherwise drop keyboard
    // focus into the inert editor behind the dialog.
    if (view === "Favorites" && !next.has(id)) {
      requestAnimationFrame(() => searchRef.current?.focus({ preventScroll: true }));
    }
  };

  const resetFilters = () => {
    setQuery("");
    setView("All");
    resultsRef.current?.scrollTo({ top: 0 });
    searchRef.current?.focus();
  };

  const revealDraft = () => {
    // Selecting a preset in another category or while searching should never
    // strand the staged choice behind filters. The footer is the stable way
    // back to its card, independent of scroll position and current results.
    setQuery("");
    setView("All");
    requestAnimationFrame(() => {
      const activeCard = resultsRef.current?.querySelector<HTMLButtonElement>(
        '.sound-library-row[data-active="true"] .sound-library-select',
      );
      activeCard?.scrollIntoView({ block: "center" });
      activeCard?.focus({ preventScroll: true });
    });
  };

  const apply = () => {
    if (draft !== value) onChange(draft);
    close();
  };

  const onDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (document.activeElement === searchRef.current && query) updateQuery("");
      else close();
    } else if (event.target instanceof HTMLButtonElement &&
      event.target.matches(".sound-library-select") &&
      ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      const buttons = Array.from(resultsRef.current?.querySelectorAll<HTMLButtonElement>(".sound-library-select") ?? []);
      const current = buttons.indexOf(event.target);
      if (current < 0) return;
      const columns = window.matchMedia("(max-width: 590px)").matches ? 1 : 2;
      const step = event.key === "ArrowDown" ? columns : event.key === "ArrowUp" ? -columns :
        event.key === "ArrowRight" ? 1 : -1;
      const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 :
        Math.max(0, Math.min(buttons.length - 1, current + step));
      event.preventDefault();
      buttons[next]?.focus();
    } else if (event.key === "Tab") {
      const tabbables = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled])',
      ) ?? []).filter(element => element.getClientRects().length > 0);
      const first = tabbables[0], last = tabbables[tabbables.length - 1];
      if (!dialogRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
      } else if (event.shiftKey && document.activeElement === first) {
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
        <div ref={layerRef} className="sound-library-layer">
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
                <span className="sound-library-eyebrow"><SlidersHorizontal size={14} aria-hidden="true" /> MIDI SPARK / SOUND COLLECTION</span>
                <h2>Find your sound<span>.</span></h2>
                <p id={descriptionId}>Explore, preview, and make it yours. Nothing changes until you apply.</p>
              </div>
              <div className="sound-library-header-stat" aria-label={SOUND_PRESETS.length + " original synthesizer presets"}>
                <strong>{SOUND_PRESETS.length.toString().padStart(2, "0")}</strong>
                <span>ORIGINAL<br />PATCHES</span>
              </div>
              <button type="button" className="sound-library-close" aria-label="Close sound library" onClick={close}>
                <X size={20} aria-hidden="true" />
              </button>
            </header>
            {previewError && <div className="sound-library-error" role="alert">
              <span>{previewError}</span>
              <button type="button" aria-label="Dismiss preview error" onClick={() => setPreviewError(null)}>
                <X size={16} aria-hidden="true" />
              </button>
            </div>}

            <div className="sound-library-body">
              <nav className="sound-library-categories" aria-label="Sound categories">
                <span className="sound-library-nav-label">COLLECTIONS <span>0{PRESET_VIEWS.length - 2} FAMILIES</span></span>
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
                  <span>Built to explore. All sounds are original browser synths; your MIDI stays intact.</span>
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
                    <span className="sound-library-search-hint" aria-hidden="true">ESC TO CLEAR</span>
                  </label>
                  <div className="sound-library-summary">
                    <p role="status" aria-live="polite" aria-atomic="true"><strong>{filtered.length}</strong> of {SOUND_PRESETS.length} sounds <span className="sound-library-context">/ {view === "All" ? "Entire collection" : view}</span></p>
                    {filtersActive ? <button type="button" className="sound-library-reset" onClick={resetFilters}>Clear filters</button>
                      : <span className="sound-library-navigation-hint">Arrow keys navigate cards</span>}
                  </div>
                </div>

                <div className="sound-library-results" ref={resultsRef} role="group" aria-label="Preset results">
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
                            <span className="sound-library-row-tags">
                              {inUse && <span className="sound-library-row-tag in-use">In use</span>}
                              {isDraft && <span className="sound-library-row-tag selected"><Check size={12} aria-hidden="true" /> Selected</span>}
                            </span>
                          </span>
                          <span className="sound-library-row-art">
                            <SoundSignature wave={preset.patch.wave} />
                            <span className="sound-library-row-engine">{preset.patch.engine.toUpperCase()} SYNTH</span>
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

            <span className="sr-only" role="status" aria-live="polite">
              {auditioning ? "Preparing " + PRESET_BY_ID[auditioning].label : ""}
            </span>
            <footer className="sound-library-footer">
              <button type="button" className="sound-library-choice" onClick={revealDraft}
                aria-label={"Show " + candidate.label + " in the sound collection"}
                title={"Find " + candidate.label + " in the sound collection"}>
                <span className="sound-library-choice-eyebrow">{draft === value ? "CURRENT SOUND" : "STAGED / NOT YET APPLIED"}</span>
                <span className="sound-library-choice-title"><strong>{candidate.label}</strong>
                  <LocateFixed size={15} aria-hidden="true" /></span>
                <small>{candidate.category} <span aria-hidden="true">·</span> {draft === value
                  ? "Already in use on this track" : "Currently using " + applied.label}</small>
              </button>
              <div className="sound-library-footer-actions">
                <button type="button" className="sound-library-cancel" onClick={close}>Cancel</button>
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
