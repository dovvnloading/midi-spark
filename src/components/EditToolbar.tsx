import {
  CopyPlus,
  Magnet,
  MousePointer2,
  Pencil,
  Scissors,
  Stamp,
  Waves,
  Zap,
  ZoomIn,
} from "lucide-react";
import { CustomDropdown } from "./CustomDropdown";
import { CustomSlider } from "./CustomSlider";
import {
  CHORD_STAMPS,
  MAX_ZOOM,
  MIN_ZOOM,
  NOTE_LENGTH_OPTIONS,
  SCALE_STAMPS,
  SNAP_OPTIONS,
} from "../lib/constants";

export type ToolMode = "draw" | "select" | "stamp" | "cut";

export interface EditToolbarProps {
  toolMode: ToolMode;
  stampType: string;
  noteLength: number;
  snapResolution: number;
  zoomX: number;
  swingAmount: number;
  hasNotes: boolean;
  onToolModeChange: (mode: ToolMode) => void;
  onStampTypeChange: (stamp: string) => void;
  onNoteLengthChange: (length: number) => void;
  onSnapResolutionChange: (snap: number) => void;
  onZoomChange: (zoom: number) => void;
  onSwingAmountChange: (amount: number) => void;
  onChop: () => void;
  onDuplicateBar: () => void;
  onApplySwing: () => void;
}

const TOOLS = [
  { mode: "draw", label: "Draw", Icon: Pencil, title: "Draw notes with click or drag" },
  { mode: "select", label: "Select", Icon: MousePointer2, title: "Select notes by dragging a lasso" },
  { mode: "stamp", label: "Stamp", Icon: Stamp, title: "Place a chord or scale at once" },
  { mode: "cut", label: "Slice", Icon: Scissors, title: "Drag through notes to split them" },
] as const;

export function EditToolbar({
  toolMode,
  stampType,
  noteLength,
  snapResolution,
  zoomX,
  swingAmount,
  hasNotes,
  onToolModeChange,
  onStampTypeChange,
  onNoteLengthChange,
  onSnapResolutionChange,
  onZoomChange,
  onSwingAmountChange,
  onChop,
  onDuplicateBar,
  onApplySwing,
}: EditToolbarProps) {
  return (
    <div
      role="region"
      aria-label="Piano roll editing tools. Scroll horizontally for more controls."
      tabIndex={0}
      className="hardware-panel toolbar-scroll relative z-20 mx-auto w-full max-w-6xl shrink-0 overflow-x-auto"
    >
      <div className="flex min-h-[63px] min-w-max items-center gap-4 px-3 py-2 sm:px-4">
        <div className="flex items-center gap-2">
          <span className="studio-kicker mr-1">Tools</span>
          <div role="group" aria-label="Piano roll tool" className="studio-group flex items-center gap-1 p-1">
            {TOOLS.map(({ mode, label, Icon, title }) => (
              <button
                type="button"
                key={mode}
                aria-label={title}
                aria-pressed={toolMode === mode}
                title={title}
                onClick={() => onToolModeChange(mode)}
                className={
                  "hardware-btn h-9 gap-1.5 border-transparent px-2.5 text-xs " +
                  (toolMode === mode ? "studio-tool-active" : "studio-quiet-btn")
                }
              >
                <Icon size={16} aria-hidden="true" />
                <span>{label}</span>
              </button>
            ))}
          </div>
          {toolMode === "stamp" && (
            <div className="w-[146px]">
              <CustomDropdown
                ariaLabel="Chord or scale stamp"
                options={[
                  {
                    groupLabel: "Chords",
                    options: Object.keys(CHORD_STAMPS).map((name) => ({
                      label: name,
                      value: name,
                    })),
                  },
                  {
                    groupLabel: "Scales",
                    options: Object.keys(SCALE_STAMPS).map((name) => ({
                      label: name,
                      value: name,
                    })),
                  },
                ]}
                value={stampType}
                onChange={(value) => onStampTypeChange(String(value))}
              />
            </div>
          )}
        </div>

        <div className="studio-separator" aria-hidden="true" />

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Magnet size={16} className="text-[var(--text-muted)]" aria-hidden="true" />
            <label className="studio-field-label">Snap</label>
            <div className="w-[84px]">
              <CustomDropdown
                ariaLabel="Grid snap"
                options={SNAP_OPTIONS}
                value={snapResolution}
                onChange={(value) => onSnapResolutionChange(Number(value))}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="studio-field-label">Length</label>
            <div className="w-[84px]">
              <CustomDropdown
                ariaLabel="Default note length"
                options={NOTE_LENGTH_OPTIONS}
                value={noteLength}
                onChange={(value) => onNoteLengthChange(Number(value))}
              />
            </div>
          </div>
        </div>

        <div className="studio-separator" aria-hidden="true" />

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Waves size={16} className="text-[var(--text-muted)]" aria-hidden="true" />
            <label className="studio-field-label">Swing</label>
            <span className="w-[30px] text-right font-mono text-[11px] tabular-nums text-[var(--accent)]">
              {swingAmount}%
            </span>
            <div className="w-[82px]">
              <CustomSlider
                min={0}
                max={100}
                step={1}
                value={swingAmount}
                label="Swing percentage"
                onChange={onSwingAmountChange}
              />
            </div>
            <button
              type="button"
              onClick={onApplySwing}
              disabled={!hasNotes || swingAmount === 0}
              title="Delay offbeat 8th and 16th notes by the swing amount"
              className="hardware-btn h-9 px-3 text-xs"
            >
              Apply
            </button>
          </div>
          <button
            type="button"
            onClick={onChop}
            disabled={!hasNotes}
            title="Chop selected notes into the current note length (Alt+U)"
            className="hardware-btn studio-quiet-btn h-9 px-2.5 text-xs"
          >
            <Zap size={15} aria-hidden="true" />
            Chop
          </button>
          <button
            type="button"
            onClick={onDuplicateBar}
            disabled={!hasNotes}
            title="Copy the bar at the playhead into the following bar"
            className="hardware-btn studio-quiet-btn h-9 px-2.5 text-xs"
          >
            <CopyPlus size={16} aria-hidden="true" />
            Duplicate bar
          </button>
        </div>

        <div className="studio-separator" aria-hidden="true" />

        <div className="flex items-center gap-2">
          <ZoomIn size={16} className="text-[var(--text-muted)]" aria-hidden="true" />
          <span className="studio-field-label">Zoom</span>
          <div className="w-[86px]">
            <CustomSlider
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={1}
              value={zoomX}
              label="Horizontal zoom"
              onChange={onZoomChange}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
