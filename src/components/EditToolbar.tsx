import { useEffect, useRef } from "react";
import { ChevronDown, Hand, MousePointer2, Pencil, Scissors, Stamp, ZoomIn, ZoomOut, Scan, PanelLeft, LocateFixed } from "lucide-react";
import { CustomDropdown } from "./CustomDropdown";
import { CHORD_STAMPS, SCALE_STAMPS, SNAP_OPTIONS, NOTE_LENGTH_OPTIONS, MIN_ZOOM, MAX_ZOOM } from "../lib/constants";
export type ToolMode = "draw" | "select" | "stamp" | "cut" | "pan";
export interface EditToolbarProps {
  toolMode: ToolMode; stampType: string; noteLength: number; snapResolution: number; zoomX: number;
  followPlayback: boolean; inspectorOpen: boolean;
  onToolModeChange: (mode: ToolMode) => void; onStampTypeChange: (stamp: string) => void;
  onNoteLengthChange: (length: number) => void; onSnapResolutionChange: (snap: number) => void; onZoomChange: (zoom: number) => void;
  onFit: () => void; onToggleFollow: () => void; onToggleInspector: () => void;
}
const TOOLS = [
  { mode: "draw", label: "Draw", key: "B", Icon: Pencil }, { mode: "select", label: "Select", key: "V", Icon: MousePointer2 },
  { mode: "stamp", label: "Stamp", key: "S", Icon: Stamp }, { mode: "cut", label: "Slice", key: "C", Icon: Scissors },
  { mode: "pan", label: "Hand", key: "H", Icon: Hand },
] as const;
const ACTIVE_TOOL_HELP: Record<ToolMode, string> = {
  draw: "Tap the grid to add a note; drag to set its length.",
  select: "Tap a note to select, move or resize it; drag empty space to lasso.",
  stamp: "Tap the grid to place the chosen chord or scale.",
  cut: "Drag across notes to split them.",
  pan: "Drag the canvas to navigate without editing notes.",
};

export function EditToolbar(p: EditToolbarProps) {
  const viewRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      const menu = viewRef.current;
      if (menu?.open && event.target instanceof Node && !menu.contains(event.target)) menu.open = false;
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);
  return <div className="editor-toolbar" aria-label="Editing controls">
    <div className="tool-cluster"><button className="icon-button inspector-toggle" aria-label="Toggle inspector" aria-pressed={p.inspectorOpen} onClick={p.onToggleInspector} title="Inspector"><PanelLeft size={16} /></button>
      <span className="control-divider" />
      <div className="tool-segment" role="group" aria-label="Editing tool">
        {TOOLS.map(({ mode, label, key, Icon }) => <button key={mode} onClick={() => p.onToolModeChange(mode)} aria-label={label + " tool"}
          aria-pressed={p.toolMode === mode} title={label + " (" + key + ")"}><Icon size={16} /><span>{label}</span></button>)}
      </div>
    </div>
    <div className="precision-controls"><label><span>Snap</span><CustomDropdown ariaLabel="Grid snap" options={SNAP_OPTIONS.map(o => o.value === 0 ? { ...o, label: "Off" } : o)} value={p.snapResolution} onChange={v => p.onSnapResolutionChange(Number(v))} /></label>
      <label><span>Length</span><CustomDropdown ariaLabel="Draw length" options={NOTE_LENGTH_OPTIONS} value={p.noteLength} onChange={v => p.onNoteLengthChange(Number(v))} /></label>
      {p.toolMode === "stamp" && <CustomDropdown ariaLabel="Stamp type" options={[
        { groupLabel: "Chords", options: Object.keys(CHORD_STAMPS) }, { groupLabel: "Scales", options: Object.keys(SCALE_STAMPS) },
      ]} value={p.stampType} onChange={v => p.onStampTypeChange(String(v))} />}
    </div>
    <div className="active-tool-readout" role="status" aria-live="polite" aria-atomic="true">
      <strong>{TOOLS.find(tool => tool.mode === p.toolMode)?.label} tool</strong>
      <span>{ACTIVE_TOOL_HELP[p.toolMode]}</span>
    </div>
    <div className="view-controls" role="group" aria-label="Canvas view">
      <button className="icon-button fit-button" aria-label="Fit pattern" title="Fit pattern (F)"
        onClick={p.onFit}><Scan size={16} /><span>Fit</span></button>
      <details className="canvas-view-menu" ref={viewRef} onKeyDown={event => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.open = false;
          event.currentTarget.querySelector("summary")?.focus();
        }
      }}>
        <summary className="secondary-button canvas-view-trigger" aria-label="Canvas view options">
          <span>View</span><ChevronDown size={13} aria-hidden="true" />
        </summary>
        <div className="canvas-view-menu-content">
          <button type="button" aria-pressed={p.followPlayback} onClick={p.onToggleFollow}>
            <LocateFixed size={16} aria-hidden="true" />Follow playback
          </button>
          <button type="button" onClick={() => p.onZoomChange(Math.max(MIN_ZOOM, p.zoomX / 1.25))}>
            <ZoomOut size={16} aria-hidden="true" />Zoom out
          </button>
          <button type="button" onClick={() => p.onZoomChange(Math.min(MAX_ZOOM, p.zoomX * 1.25))}>
            <ZoomIn size={16} aria-hidden="true" />Zoom in
          </button>
        </div>
      </details>
    </div>
  </div>;
}
