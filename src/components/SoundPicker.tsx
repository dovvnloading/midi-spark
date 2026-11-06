import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Play, Search, SlidersHorizontal, X } from "lucide-react";
import { auditionPreset } from "../lib/audio";
import {
  PRESET_BY_ID,
  PRESET_CATEGORIES,
  SOUND_PRESETS,
  type PresetCategory,
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const selected = PRESET_BY_ID[value];

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
    const scroll = (event: Event) => {
      if (dialogRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const resize = () => setOpen(false);
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
    void auditionPreset(type).catch(() => {
      onPreviewError?.("Audio preview could not start. Check your browser audio settings.");
    });
  };

  const toggle = () => {
    if (open) { close(); return; }
    setQuery("");
    setCategory("All");
    setAnchor(triggerRef.current?.getBoundingClientRect() ?? null);
    setOpen(true);
  };

  const filtered = SOUND_PRESETS.filter((preset) =>
    (category === "All" || category === preset.category) &&
    (preset.label + " " + preset.description + " " + preset.category)
      .toLowerCase().includes(query.trim().toLowerCase()),
  );

  const width = Math.min(390, typeof window === "undefined" ? 390 : window.innerWidth - 24);
  const height = Math.min(500, typeof window === "undefined" ? 500 : window.innerHeight - 24);
  const above = !!anchor && window.innerHeight - anchor.bottom < 270 && anchor.top > 270;
  const position = anchor ? {
    width,
    maxHeight: height,
    left: Math.max(12, Math.min(anchor.left, window.innerWidth - width - 12)),
    ...(above
      ? { bottom: window.innerHeight - anchor.top + 6 }
      : { top: Math.min(anchor.bottom + 6, window.innerHeight - height - 12) }),
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
          aria-label={"Audition " + selected.label}
          title={"Hear " + selected.label + " without changing the MIDI"}
          onClick={() => preview(value)}
        >
          <Play size={15} fill="currentColor" aria-hidden="true" />
        </button>
      </div>
      <p className="sound-picker-helper">{selected.description}</p>

      {open && anchor && createPortal(
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="false"
          aria-label="Sound library"
          className="sound-library"
          style={position}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              event.preventDefault();
              close();
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
                  </span>
                  {preset.id === value && <Check size={15} aria-hidden="true" />}
                </button>
                <button
                  type="button"
                  className="sound-library-row-play"
                  aria-label={"Preview " + preset.label}
                  title={"Hear " + preset.label + " without selecting"}
                  onClick={() => preview(preset.id)}
                ><Play size={14} fill="currentColor" aria-hidden="true" /></button>
              </div>
            ))}
          </div>
          <p className="sound-library-footer">Synthesized in your browser · No downloads · Preview only</p>
        </div>,
        document.body,
      )}
    </div>
  );
}
