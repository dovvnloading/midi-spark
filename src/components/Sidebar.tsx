import { useState } from "react";
import {
  AudioLines,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
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
      aria-label="Composition settings"
      className="hardware-panel relative z-40 flex shrink-0 flex-col gap-0 overflow-y-auto m-3 mb-0 lg:m-4 lg:mr-0 lg:w-[290px] lg:min-w-[290px] lg:max-h-none max-h-[72dvh] bg-[var(--surface-bg)]"
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-[var(--border-color)] px-4 py-4 lg:px-5 lg:py-5">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[#253657]"
          aria-hidden="true"
        >
          <AudioLines className="text-[var(--accent)]" size={21} strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-[17px] font-extrabold leading-tight tracking-[-0.045em] text-white">
            MIDI <span className="text-[var(--accent)]">SPARK</span>
          </h1>
          <p className="mt-0.5 text-[10px] font-medium tracking-[0.11em] text-[var(--text-subtle)] uppercase">
            Generative MIDI studio
          </p>
        </div>
        <button
          type="button"
          className="hardware-btn studio-quiet-btn ml-auto h-9 px-3 lg:hidden"
          aria-expanded={mobileExpanded}
          aria-controls="composition-settings"
          onClick={() => setMobileExpanded((open) => !open)}
        >
          <SlidersHorizontal size={15} aria-hidden="true" />
          <span>Settings</span>
          {mobileExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
      </header>

      <div
        id="composition-settings"
        className={
          "flex-col gap-6 px-4 py-5 lg:px-5 lg:py-6 " +
          (mobileExpanded ? "flex" : "hidden lg:flex")
        }
      >
        <section className="space-y-3" aria-labelledby="sidebar-harmony">
          <div className="flex items-center justify-between">
            <h2 id="sidebar-harmony" className="studio-kicker">01 / Harmony</h2>
            <span className="text-[11px] text-[var(--text-subtle)]">Tonal center</span>
          </div>
          <div className="studio-group grid grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-3 p-3">
            <div className="min-w-0">
              <label className="studio-field-label mb-2 block">Key</label>
              <CustomDropdown
                ariaLabel="Root key"
                options={ROOT_NOTES.map((key) => ({ label: key, value: key }))}
                value={root}
                onChange={(value) => onRootChange(String(value))}
              />
            </div>
            <div className="min-w-0">
              <label className="studio-field-label mb-2 block">Scale</label>
              <CustomDropdown
                ariaLabel="Scale mode"
                options={[
                  { label: "Major", value: "major" },
                  { label: "Minor", value: "minor" },
                ]}
                value={mode}
                onChange={(value) => onModeChange(value as "major" | "minor")}
              />
            </div>
          </div>
        </section>

        <section className="space-y-4" aria-labelledby="sidebar-character">
          <h2 id="sidebar-character" className="studio-kicker">02 / Character</h2>
          <div className="studio-group space-y-5 p-4">
            <div>
              <div className="mb-1 flex items-center justify-between gap-3">
                <label className="studio-field-label">Chord tension</label>
                <output className="font-mono text-xs font-semibold tabular-nums text-[var(--accent)]">
                  {dissonance}%
                </output>
              </div>
              <p className="studio-panel-caption mb-2">From clean triads to dissonant color.</p>
              <CustomSlider
                min={0}
                max={100}
                value={dissonance}
                label="Chord tension"
                onChange={onDissonanceChange}
              />
              <div className="mt-1 flex justify-between text-[10px] text-[var(--text-subtle)]">
                <span>Simple</span>
                <span>Complex</span>
              </div>
            </div>
            <div className="border-t border-[var(--border-color)] pt-4">
              <div className="mb-1 flex items-center justify-between gap-3">
                <label className="studio-field-label">Groove density</label>
                <output className="font-mono text-xs font-semibold tabular-nums text-[var(--accent)]">
                  {complexity}%
                </output>
              </div>
              <p className="studio-panel-caption mb-2">Shape the rhythm and note activity.</p>
              <CustomSlider
                min={0}
                max={100}
                value={complexity}
                label="Groove complexity"
                onChange={onComplexityChange}
              />
              <div className="mt-1 flex justify-between text-[10px] text-[var(--text-subtle)]">
                <span>Spacious</span>
                <span>Busy</span>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-3" aria-labelledby="sidebar-arrangement">
          <h2 id="sidebar-arrangement" className="studio-kicker">03 / Arrangement</h2>
          <div className="studio-group p-4">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <label className="studio-field-label">Pattern length</label>
              <output className="font-mono text-xs font-semibold tabular-nums text-[var(--accent)]">
                {bars} bars
              </output>
            </div>
            <CustomSlider
              min={4}
              max={16}
              step={4}
              value={bars}
              label="Loop length"
              onChange={onBarsChange}
            />
            <div className="mt-1 flex justify-between text-[10px] text-[var(--text-subtle)]">
              <span>4</span>
              <span>8</span>
              <span>12</span>
              <span>16 bars</span>
            </div>
          </div>
        </section>

        <div className="space-y-2 pt-1">
          <button
            type="button"
            onClick={onGenerate}
            className="hardware-btn hardware-btn-primary h-11 w-full gap-2.5 px-3 text-[13px]"
          >
            <Sparkles size={16} aria-hidden="true" />
            Generate sequence
          </button>
          <button
            type="button"
            onClick={onAddVariation}
            disabled={!canVary}
            className="hardware-btn h-10 w-full gap-2.5 text-[12px]"
            title="Rework the current pattern without changing its harmony"
          >
            <RefreshCw size={14} aria-hidden="true" />
            Create variation
          </button>
          <p className="pt-1 text-center text-[11px] leading-relaxed text-[var(--text-subtle)]">
            These settings apply to your next generation.
          </p>
        </div>
      </div>
      <footer className="mt-auto hidden border-t border-[var(--border-color)] px-5 py-3 lg:block">
        <p className="text-[11px] text-[var(--text-subtle)]">
          Runs locally in your browser · No account required
        </p>
      </footer>
    </aside>
  );
}
