import { useState } from "react";
import { AudioLines, ChevronDown, ChevronUp, SlidersHorizontal } from "lucide-react";
import { CustomDropdown } from "./CustomDropdown";
import { CustomSlider } from "./CustomSlider";
import { ROOT_NOTES } from "../lib/constants";

export interface SidebarProps {
  root: string;
  mode: "major" | "minor";
  dissonance: number;
  complexity: number;
  bars: number;
  canVary: boolean;
  onRootChange: (root: string) => void;
  onModeChange: (mode: "major" | "minor") => void;
  onDissonanceChange: (value: number) => void;
  onComplexityChange: (value: number) => void;
  onBarsChange: (value: number) => void;
  onGenerate: () => void;
  onAddVariation: () => void;
}

export function Sidebar({
  root,
  mode,
  dissonance,
  complexity,
  bars,
  canVary,
  onRootChange,
  onModeChange,
  onDissonanceChange,
  onComplexityChange,
  onBarsChange,
  onGenerate,
  onAddVariation,
}: SidebarProps) {
  const [mobileExpanded, setMobileExpanded] = useState(false);

  return (
    <aside
      aria-label="Generation controls"
      className="w-auto lg:w-[300px] lg:min-w-[300px] shrink-0 p-4 lg:p-5 flex flex-col gap-4 overflow-y-auto hardware-panel relative z-40 m-3 mb-0 lg:m-4 lg:mr-0 max-h-[70dvh] lg:max-h-none"
    >
      <div className="flex items-center gap-3 lg:mb-4">
        <div className="relative w-10 h-10 rounded-xl bg-gradient-to-b from-[var(--surface-bg-hover)] to-[var(--piano-black)] flex items-center justify-center border border-[var(--border-color)] shadow-[0_0_15px_rgba(77,124,255,0.15)] overflow-hidden">
          <div className="absolute inset-0 bg-[var(--accent)] opacity-10 mix-blend-overlay"></div>
          <AudioLines
            className="text-[var(--accent)] drop-shadow-[0_0_8px_rgba(77,124,255,0.8)] relative z-10"
            size={24}
            strokeWidth={2}
          />
        </div>
        <h1 className="text-2xl font-black tracking-tighter flex items-center">
          <span className="text-white drop-shadow-sm">MIDI</span>
          <span className="text-[var(--accent)] drop-shadow-[0_0_10px_rgba(77,124,255,0.3)] ml-1">
            SPARK
          </span>
        </h1>
        <button
          type="button"
          className="lg:hidden ml-auto inline-flex items-center gap-2 rounded-lg border border-[var(--border-color)] px-3 py-2 text-[11px] font-semibold text-[var(--text-main)]"
          aria-expanded={mobileExpanded}
          aria-controls="generation-settings"
          onClick={() => setMobileExpanded((open) => !open)}
        >
          <SlidersHorizontal size={14} aria-hidden="true" />
          Settings
          {mobileExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
      </div>

      <div
        id="generation-settings"
        className={`flex-col gap-5 ${mobileExpanded ? "flex" : "hidden"} lg:flex`}
      >
      <div className="flex flex-col gap-4">
        <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1 block">
          Key & Scale
        </label>
        <div className="flex gap-4">
          <CustomDropdown
            ariaLabel="Root key"
            options={ROOT_NOTES.map((k) => ({ label: k, value: k }))}
            value={root}
            onChange={(v) => onRootChange(String(v))}
          />

          <CustomDropdown
            ariaLabel="Scale mode"
            options={[
              { label: "Major", value: "major" },
              { label: "Minor", value: "minor" },
            ]}
            value={mode}
            onChange={(v) => onModeChange(v as "major" | "minor")}
          />
        </div>
        <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
          These settings shape your next generation. Existing MIDI notes stay in place.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <div className="flex justify-between mb-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] block">
              Chord Tension
            </label>
            <span className="text-[10px] font-mono text-[var(--text-main)] opacity-80">
              {dissonance}%
            </span>
          </div>
          <CustomSlider
            className="mt-1"
            min={0}
            max={100}
            value={dissonance}
            label="Chord tension"
            onChange={onDissonanceChange}
          />
          <div className="flex justify-between mt-2 text-[9px] font-mono text-[var(--text-muted)]">
            <span>Low</span>
            <span>High</span>
          </div>
        </div>

        <div className="mt-2">
          <div className="flex justify-between mb-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] block">
              Groove Complexity
            </label>
            <span className="text-[10px] font-mono text-[var(--text-main)] opacity-80">
              {complexity}%
            </span>
          </div>
          <CustomSlider
            className="mt-1"
            min={0}
            max={100}
            value={complexity}
            label="Groove complexity"
            onChange={onComplexityChange}
          />
        </div>

        <div className="mt-2">
          <div className="flex justify-between mb-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] block">
              Loop Length
            </label>
            <span className="text-[10px] font-mono text-[var(--text-main)] opacity-80">
              {bars} Bars
            </span>
          </div>
          <CustomSlider
            className="mt-1"
            min={4}
            max={16}
            step={4}
            value={bars}
            label="Loop length"
            onChange={onBarsChange}
          />
        </div>
      </div>

      <div className="flex flex-col gap-3 mt-4">
        <button
          onClick={onGenerate}
          className="hardware-btn hardware-btn-primary h-12 w-full uppercase tracking-wide text-[11px] gap-2 font-bold"
        >
          Generate Chord Progression
        </button>

        <button
          onClick={onAddVariation}
          disabled={!canVary}
          className="hardware-btn h-10 w-full text-[11px] uppercase tracking-wide gap-2 font-bold"
        >
          Add Rhythmic Variation
        </button>
      </div>
      </div>
    </aside>
  );
}
