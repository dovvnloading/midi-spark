import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, LoaderCircle, Play, Search, SlidersHorizontal, X } from "lucide-react";
import { auditionPreset } from "../lib/audio";
import {
  PRESET_BY_ID,
  PRESET_CATEGORIES,
  SOUND_PRESETS,
  type PresetCategory,
  type PresetDefinition,
  type SynthType,
} from "../lib/presets";

export interface SoundPickerProps {
  value: SynthType;
  onChange: (type: SynthType) => void;
  label?: string;
  onPreviewError?: (message: string) => void;
}

type CategoryFilter = "All" | PresetCategory;

/** A compact picker backed by the shared sound bank. Selecting a patch does
 * not change any MIDI data, and previewing one doesn't change the selection. */
export function SoundPicker({ value, onChange, label = "Sound", onPreviewError }: SoundPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("All");
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [auditioning, setAuditioning] = useState<SynthType | null>(null);
  const previewSequence = useRef(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const selected = PRESET_BY_ID[value] ?? PRESET_BY_ID.classic;

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const outside = (event: PointerEvent) => {
      if (dialogRef.current?.contains(event.target as Node)) return;
      if (triggerRef.current?.parentElement?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const updatePosition = (event?: Event) => {
      // Scrolling the inspector must not dismiss a sound-selection task.
      if (event && dialogRef.current?.contains(event.target as Node)) return;
      setAnchor(triggerRef.current?.getBoundingClientRect() ?? null);
    };
    const scroll = (event: Event) => updatePosition(event);
    const resize = () => updatePosition();
    document.addEventListener("pointerdown", outside);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", resize);
    };
  }, [open]);

  const preview = (type: SynthType) => {
    const request = ++previewSequence.current;
    setAuditioning(type);
    void auditionPreset(type)
      .catch(() => onPreviewError?.("Audio preview could not start. Check your browser audio settings."))
      .finally(() => {
        if (previewSequence.current === request) setAuditioning(null);
      });
  };

  const toggle = () => {
    if (open) { close(); return; }
    setQuery("");
    setCategory("All");
    setAnchor(triggerRef.current?.getBoundingClientRect() ?? null);
    setOpen(true);
  };

  const motionTerms = (preset: PresetDefinition): string =>
    (preset.motion ?? []).map(modulation => modulation.kind).join(" ");
  const filtered = SOUND_PRESETS.filter((preset) =>
    (category === "All" || category === preset.category) &&
    (preset.label + " " + preset.description + " " + preset.category + " " + preset.character +
      " " + preset.patch.engine + " " + motionTerms(preset))
      .toLowerCase().includes(query.trim().toLowerCase()),
  );

  const mobile = window.innerWidth <= 760;
  const width = Math.min(390, window.innerWidth - 24);
  const maxHeight = Math.min(500, window.innerHeight - 24);
  const roomBelow = anchor ? window.innerHeight - anchor.bottom - 12 : 0;
  const roomAbove = anchor ? anchor.top - 12 : 0;
  const above = !mobile && roomBelow < 280 && roomAbove > roomBelow;
  const available = above ? roomAbove - 6 : roomBelow - 6;
  const centered = mobile || available < 180;
  const height = centered ? maxHeight : Math.min(maxHeight, available);
  const position = anchor ? {
    width,
    maxHeight: height,
    left: centered ? (window.innerWidth - width) / 2 : Math.max(12, Math.min(anchor.left, window.innerWidth - width - 12)),
    ...(centered
      ? { top: Math.max(12, (window.innerHeight - height) / 2) }
      : above ? { bottom: window.innerHeight - anchor.top + 6 } : { top: anchor.bottom + 6 }),
  } : {};

  return (
    <div className="sound-picker">
      <div className="sound-picker-control">
        <button
          ref={triggerRef}
          type="button"
          aria-label={label + ": " + selected.label + ". Open sound library"}
          aria-expanded={open}
          aria-haspopup="dialog"
          className="sound-picker-trigger"
          onClick={toggle}
        >
          <span className="sound-picker-title">
            <strong>{selected.label}</strong>
            <small>{selected.category}</small>
          </span>
          <ChevronDown size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="sound-picker-listen"
          aria-busy={auditioning === value}
          aria-label={"Audition " + selected.label}
          title={"Hear " + selected.label + " with soft then strong velocity, without changing the MIDI"}
          onClick={() => preview(value)}
        >
          {auditioning === value
            ? <LoaderCircle className="animate-spin" size={15} aria-hidden="true" />
            : <Play size={15} fill="currentColor" aria-hidden="true" />}
        </button>
      </div>
      <p className="sound-picker-helper">{selected.description}</p>
      <p className="sound-picker-character">{selected.character}</p>
      <span className="sr-only" role="status" aria-live="polite">
        {auditioning ? "Preparing " + PRESET_BY_ID[auditioning].label : ""}
      </span>

      {open && anchor && createPortal(
        <>
        {mobile && <div className="sound-library-backdrop" aria-hidden="true" onPointerDown={close} />}
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal={mobile}
          aria-label="Sound library"
          className="sound-library"
          style={position}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              event.preventDefault();
              close();
            }
            if (mobile && event.key === "Tab") {
              const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
                'button:not([disabled]), input:not([disabled])',
              ));
              const first = items[0], last = items.at(-1);
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus();
              }
            }
          }}
        >
          <div className="sound-library-header">
            <div>
              <span className="sound-library-eyebrow"><SlidersHorizontal size={13} /> SOUND LIBRARY</span>
              <strong>{SOUND_PRESETS.length} presets</strong>
            </div>
            <button type="button" className="sound-library-close" aria-label="Close sound library" onClick={close}><X size={16} /></button>
          </div>
          <div className="sound-library-search">
            <Search size={15} aria-hidden="true" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search timbre or instrument…"
              aria-label="Search presets"
            />
          </div>
          <div className="sound-library-categories" role="group" aria-label="Sound category">
            {(["All", ...PRESET_CATEGORIES] as CategoryFilter[]).map((name) => (
              <button
                key={name}
                type="button"
                aria-pressed={name === category}
                onClick={() => setCategory(name)}
              >
                {name}
              </button>
            ))}
          </div>
          <div className="sound-library-results" aria-label="Preset results">
            {filtered.length === 0 ? (
              <p className="sound-library-empty">No matching sounds. Try another search.</p>
            ) : filtered.map((preset) => (
              <div className="sound-library-row" key={preset.id}>
                <button
                  type="button"
                  className="sound-library-select"
                  aria-pressed={preset.id === value}
                  onClick={() => {
                    onChange(preset.id);
                    preview(preset.id);
                    close();
                  }}
                >
                  <span className="sound-library-row-copy">
                    <strong>{preset.label}</strong>
                    <small>{preset.description}</small>
                    <span className="sound-library-row-character">{preset.character}</span>
                  </span>
                  {preset.id === value && <Check size={15} aria-hidden="true" />}
                </button>
                <button
                  type="button"
                  className="sound-library-row-play"
                  aria-busy={auditioning === preset.id}
                  aria-label={"Preview " + preset.label}
                  title={"Hear " + preset.label + " without selecting"}
                  onClick={() => preview(preset.id)}
                >{auditioning === preset.id
                  ? <LoaderCircle className="animate-spin" size={14} aria-hidden="true" />
                  : <Play size={14} fill="currentColor" aria-hidden="true" />}</button>
              </div>
            ))}
          </div>
          <p className="sound-library-footer">Every instrument synthesized locally · Preview contrasts soft and strong notes</p>
        </div>
        </>,
        document.body,
      )}
    </div>
  );
}
