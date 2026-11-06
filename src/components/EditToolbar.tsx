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

const TOOL_BUTTONS: {
  mode: ToolMode;
  title: string;
  Icon: typeof Pencil;
  activeClass: string;
}[] = [
  {
    mode: "draw",
    title: "Draw (Pencil)",
    Icon: Pencil,
    activeClass: "bg-[var(--surface-bg-hover)] text-[var(--accent)] shadow-sm",
  },
  {
    mode: "select",
    title: "Select (Lasso)",
    Icon: MousePointer2,
    activeClass: "bg-[var(--surface-bg-hover)] text-[var(--accent)] shadow-sm",
  },
  {
    mode: "stamp",
    title: "Chord Stamp",
    Icon: Stamp,
    activeClass: "bg-[var(--surface-bg-hover)] text-[var(--accent)] shadow-sm",
  },
  {
    mode: "cut",
    title: "Slice Tool (Drag to cut notes)",
    Icon: Scissors,
    activeClass: "bg-red-500/20 text-red-400 shadow-sm",
  },
];

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
      className="w-full max-w-6xl mx-auto overflow-x-auto toolbar-scroll z-20 relative shrink-0"
    >
      <div className="min-w-max flex items-center justify-between px-4 sm:px-6 pb-2 sm:pb-0 gap-4">
        <div className="flex hardware-display p-1 shrink-0">
          {TOOL_BUTTONS.map(({ mode, title, Icon, activeClass }) => (
            <button
              key={mode}
              onClick={() => onToolModeChange(mode)}
              className={`p-2 rounded-md transition-all ${toolMode === mode ? activeClass : "text-[var(--text-muted)] hover:text-[var(--text-main)]"}`}
              aria-label={title}
              aria-pressed={toolMode === mode}
              title={title}
            >
              <Icon size={18} />
            </button>
          ))}
          {toolMode === "stamp" && (
            <div className="pl-2 border-l border-[var(--border-color)] ml-2 flex items-center w-36">
              <CustomDropdown
                ariaLabel="Chord or scale stamp"
                options={[
                  {
                    groupLabel: "Chords",
                    options: Object.keys(CHORD_STAMPS).map((k) => ({
                      label: k,
                      value: k,
                    })),
                  },
                  {
                    groupLabel: "Scales",
                    options: Object.keys(SCALE_STAMPS).map((k) => ({
                      label: k,
                      value: k,
                    })),
                  },
                ]}
                value={stampType}
                onChange={(v) => onStampTypeChange(String(v))}
                className="border-none bg-transparent"
              />
            </div>
          )}
        </div>

        <div className="flex gap-4 shrink-0">
          <button
            onClick={onChop}
            disabled={!hasNotes}
            className="hardware-btn px-4 py-1.5 h-10 rounded text-[11px] font-bold uppercase tracking-widest text-[var(--accent)] hover:bg-[var(--surface-bg-hover)] flex items-center gap-2 border border-[var(--border-color)] bg-[var(--piano-black)] shrink-0"
            title="Chop notes into 'Length' segments (Alt+U). Applies to selected notes, or all notes if none selected."
          >
            <Zap size={14} />
            CHOP
          </button>
          <button
            onClick={onDuplicateBar}
            disabled={!hasNotes}
            className="hardware-btn px-4 py-1.5 h-10 rounded text-[11px] font-bold uppercase tracking-widest text-[var(--accent)] hover:bg-[var(--surface-bg-hover)] flex items-center gap-2 border border-[var(--border-color)] bg-[var(--piano-black)] shrink-0"
            title="Duplicate the bar the playhead is in, appended immediately after it."
          >
            <CopyPlus size={14} />
            DUPE BAR
          </button>
          <div className="flex items-center gap-2 hardware-display p-1 px-3 w-32 shrink-0">
            <Waves size={16} className="text-[var(--text-muted)] shrink-0" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)] shrink-0">
              Swing
            </span>
            <CustomSlider
              min={0}
              max={100}
              step={1}
              value={swingAmount}
              label="Swing percentage"
              onChange={onSwingAmountChange}
              className="h-6"
              fillColor="linear-gradient(90deg, #3b5bdb 0%, #5e7cf6 100%)"
            />
          </div>
          <button
            onClick={onApplySwing}
            disabled={!hasNotes || swingAmount === 0}
            className="hardware-btn px-4 py-1.5 h-10 rounded text-[11px] font-bold uppercase tracking-widest text-[var(--accent)] hover:bg-[var(--surface-bg-hover)] flex items-center gap-2 border border-[var(--border-color)] bg-[var(--piano-black)] shrink-0"
            title="Apply swing: delays every off-beat 8th/16th note by an amount proportional to the Swing slider; downbeats are untouched."
          >
            <Waves size={14} />
            APPLY SWING
          </button>
          <div className="flex items-center gap-2 hardware-display p-1 px-3 shrink-0">
            <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
              Length
            </span>
            <div className="w-24 ml-1">
              <CustomDropdown
                ariaLabel="Default note length"
                options={NOTE_LENGTH_OPTIONS}
                value={noteLength}
                onChange={(v) => onNoteLengthChange(Number(v))}
                className="border-none bg-transparent mt-1"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 hardware-display p-1 px-3 shrink-0">
            <Magnet size={16} className="text-[var(--text-muted)]" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
              Snap
            </span>
            <div className="w-24 ml-1">
              <CustomDropdown
                ariaLabel="Grid snap"
                options={SNAP_OPTIONS}
                value={snapResolution}
                onChange={(v) => onSnapResolutionChange(Number(v))}
                className="border-none bg-transparent mt-1"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 hardware-display p-1 px-3 w-32 shrink-0">
            <ZoomIn size={16} className="text-[var(--text-muted)] shrink-0" />
            <CustomSlider
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={1}
              value={zoomX}
              label="Horizontal zoom"
              onChange={onZoomChange}
              className="h-6"
              fillColor="linear-gradient(90deg, #3b5bdb 0%, #5e7cf6 100%)"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
