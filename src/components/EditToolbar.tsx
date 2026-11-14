import { useRef, useState } from "react";
import { ChevronDown, View, Pan, Select, Draw, Slice, Stamp, ZoomIn, ZoomOut, FitPattern, InspectorPanel, Locate } from "./StudioIcons";
import { CustomDropdown } from "./CustomDropdown";
import { FloatingMenu } from "./FloatingMenu";
import { SNAP_OPTIONS, NOTE_LENGTH_OPTIONS, MIN_ZOOM, MAX_ZOOM } from "../lib/constants";
import { StampPicker } from "./StampPicker";
export type ToolMode = "draw" | "select" | "stamp" | "cut" | "pan";
export interface EditToolbarProps {
  toolMode: ToolMode; stampType: string; noteLength: number; snapResolution: number; zoomX: number;
  followPlayback: boolean; inspectorOpen: boolean;
  onToolModeChange: (mode: ToolMode) => void; onStampTypeChange: (stamp: string) => void;
  onNoteLengthChange: (length: number) => void; onSnapResolutionChange: (snap: number) => void; onZoomChange: (zoom: number) => void;
  onFit: () => void; onToggleFollow: () => void; onToggleInspector: () => void;
}
const TOOLS = [
  { mode: "draw", label: "Draw", key: "B", Icon: Draw }, { mode: "select", label: "Select", key: "V", Icon: Select },
  { mode: "stamp", label: "Stamp", key: "S", Icon: Stamp }, { mode: "cut", label: "Slice", key: "C", Icon: Slice },
  { mode: "pan", label: "Hand", key: "H", Icon: Pan },
] as const;
const ACTIVE_TOOL_HELP: Record<ToolMode, string> = {
  draw: "Tap a grid cell to add a note. Drag to set its length.",
  select: "Drag notes to move. Drag a right edge to resize, or empty space to select.",
  stamp: "Choose a preset. Tap a row to place it at that pitch.",
  cut: "Drag across notes to split them.",
  pan: "Drag the grid to scroll in time and pitch.",
};

export function EditToolbar(p: EditToolbarProps) {
  const viewRef = useRef<HTMLDetailsElement>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const dismissView = () => {
    if (viewRef.current) viewRef.current.open = false;
    setViewOpen(false);
  };
  return <div className="editor-toolbar" data-tool={p.toolMode} aria-label="Editing controls">
    <div className="tool-cluster"><button type="button" id="inspector-toggle" className="icon-button inspector-toggle"
      aria-label="Toggle inspector" aria-expanded={p.inspectorOpen} aria-controls="studio-inspector"
      onClick={p.onToggleInspector} title="Inspector"><InspectorPanel size={16} /></button>
      <span className="control-divider" />
      <div className="tool-segment" role="group" aria-label="Editing tool">
        {TOOLS.map(({ mode, label, key, Icon }) => <button key={mode} onClick={() => p.onToolModeChange(mode)} aria-label={label + " tool"}
          aria-pressed={p.toolMode === mode} aria-keyshortcuts={key} title={label + " (" + key + ")"}><Icon size={16} /><span>{label}</span></button>)}
      </div>
    </div>
    <div className="precision-controls"><label><span>Snap</span><CustomDropdown ariaLabel="Grid snap" options={SNAP_OPTIONS.map(o => o.value === 0 ? { ...o, label: "Off" } : o)} value={p.snapResolution} onChange={v => p.onSnapResolutionChange(Number(v))} /></label>
      <label><span>Length</span><CustomDropdown ariaLabel="Draw length" options={NOTE_LENGTH_OPTIONS} value={p.noteLength} onChange={v => p.onNoteLengthChange(Number(v))} /></label>
      {p.toolMode === "stamp" && <div className="stamp-control"><span>Preset</span>
        <StampPicker value={p.stampType} onChange={p.onStampTypeChange} />
      </div>}
    </div>
    <div className="active-tool-readout" role="status" aria-live="polite" aria-atomic="true">
      <strong>{TOOLS.find(tool => tool.mode === p.toolMode)?.label} tool</strong>
      <span>{ACTIVE_TOOL_HELP[p.toolMode]}</span>
    </div>
    <div className="view-controls" role="group" aria-label="Canvas view">
      <button className="icon-button fit-button" aria-label="Fit pattern" title="Fit pattern (F)"
        onClick={p.onFit}><FitPattern size={16} /><span>Fit</span></button>
      <details className="canvas-view-menu" ref={viewRef}
        onToggle={event => setViewOpen(event.currentTarget.open)}
        onKeyDown={event => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            dismissView();
            event.currentTarget.querySelector("summary")?.focus();
          }
        }}>
        <summary role="button" className="secondary-button canvas-view-trigger"
          aria-label="Canvas view options" aria-expanded={viewOpen} aria-controls="canvas-view-popup">
          <View size={16} aria-hidden="true" /><span>View</span><ChevronDown size={13} aria-hidden="true" />
        </summary>
        {viewOpen && <FloatingMenu anchorRef={viewRef} className="canvas-view-menu-content"
          id="canvas-view-popup" label="Canvas view actions" onDismiss={dismissView}>
          <button type="button" aria-pressed={p.followPlayback} onClick={p.onToggleFollow}>
            <Locate size={16} aria-hidden="true" />Follow playback
          </button>
          <button type="button" disabled={p.zoomX <= MIN_ZOOM} onClick={() => p.onZoomChange(Math.max(MIN_ZOOM, p.zoomX / 1.25))}>
            <ZoomOut size={16} aria-hidden="true" />Zoom out
          </button>
          <button type="button" disabled={p.zoomX >= MAX_ZOOM} onClick={() => p.onZoomChange(Math.min(MAX_ZOOM, p.zoomX * 1.25))}>
            <ZoomIn size={16} aria-hidden="true" />Zoom in
          </button>
          <button type="button" className="compact-fit-action" onClick={() => {
            p.onFit();
            dismissView();
            viewRef.current?.querySelector("summary")?.focus();
          }}><FitPattern size={16} aria-hidden="true" />Fit pattern</button>
        </FloatingMenu>}
      </details>
    </div>
  </div>;
}
