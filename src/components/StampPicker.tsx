import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Search, Stamp } from "./StudioIcons";
import { FloatingMenu } from "./FloatingMenu";
import {
  getStampPreset, searchStampPresets, STAMP_GROUPS, STAMP_PRESETS,
  type StampPreset,
} from "../lib/stampPresets";

interface StampPickerProps {
  value: string;
  onChange: (id: string) => void;
}

function detail(preset: StampPreset): string {
  return preset.kind === "progression"
    ? preset.formula + " · " + preset.description
    : preset.description;
}

/** Searchable, keyboard-accessible library that stays above the clipped editor. */
export function StampPicker({ value, onChange }: StampPickerProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = getStampPreset(value) ?? STAMP_PRESETS[0];
  const matches = searchStampPresets(query);

  const close = () => {
    if (detailsRef.current) detailsRef.current.open = false;
    setOpen(false);
    setQuery("");
  };

  useEffect(() => {
    if (open) searchRef.current?.focus({ preventScroll: true });
  }, [open]);

  const select = (id: string) => {
    onChange(id);
    close();
    detailsRef.current?.querySelector("summary")?.focus();
  };

  return <details className="stamp-picker" ref={detailsRef}
    onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="stamp-picker-trigger" aria-label={"Choose stamp preset, " + selected.label}
      aria-controls="stamp-preset-menu">
      <Stamp size={14} aria-hidden="true" />
      <span className="stamp-picker-trigger-copy">
        <strong>{selected.label}</strong>
        <small>{selected.kind === "progression" ? "Progression" : selected.kind === "scale" ? "Scale" : "Chord"}</small>
      </span>
      <ChevronDown size={13} aria-hidden="true" />
    </summary>
    {open && <FloatingMenu anchorRef={detailsRef} className="stamp-picker-menu"
      id="stamp-preset-menu" label="Chord and progression stamp presets" onDismiss={close}>
      <div className="stamp-picker-heading">
        <strong>Stamp library</strong>
        <span>{STAMP_PRESETS.length} presets</span>
      </div>
      <label className="stamp-picker-search">
        <Search size={15} aria-hidden="true" />
        <input ref={searchRef} value={query} onChange={event => setQuery(event.target.value)}
          type="search" aria-label="Search stamp presets"
          placeholder="Search chords, scales, progressions…"
          onKeyDown={event => {
            if (event.key === "ArrowDown") {
              const first = searchRef.current?.closest(".stamp-picker-menu")
                ?.querySelector<HTMLButtonElement>(".stamp-picker-option");
              if (first) { event.preventDefault(); first.focus(); }
            }
          }} />
      </label>
      <p className="stamp-picker-instruction">
        Select a recipe, then click the piano grid: the clicked note is its root or tonic.
        Progressions place all chords in one edit.
      </p>
      <div className="stamp-picker-results" role="status" aria-live="polite">
        {matches.length} {matches.length === 1 ? "result" : "results"}
      </div>
      {STAMP_GROUPS.map(group => {
        const items = matches.filter(preset => preset.group === group);
        if (!items.length) return null;
        return <section key={group} className="stamp-picker-group"
          role="group" aria-label={group}>
          <h3>{group}</h3>
          {items.map(preset => <button key={preset.id} type="button"
            className="stamp-picker-option" aria-pressed={preset.id === selected.id}
            onClick={() => select(preset.id)}>
            <span className="stamp-picker-option-copy">
              <strong>{preset.label}</strong>
              <small>{detail(preset)}</small>
            </span>
            {preset.id === selected.id && <Check size={14} className="stamp-picker-selected" />}
          </button>)}
        </section>;
      })}
      {matches.length === 0 && <p className="stamp-picker-empty">
        No matching presets. Try a chord quality, musical style, or Roman numeral.
      </p>}
    </FloatingMenu>}
  </details>;
}
