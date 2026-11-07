import { useEffect, useRef, type ReactNode } from "react";
import { Layers, PanelLeftClose, SlidersHorizontal, Sparkles, X } from "lucide-react";

export type InspectorTab = "compose" | "transform" | "tracks";
const tabs = [
  { id: "compose", label: "Compose", Icon: Sparkles },
  { id: "transform", label: "Transform", Icon: SlidersHorizontal },
  { id: "tracks", label: "Tracks", Icon: Layers },
] as const;

interface Props {
  tab: InspectorTab;
  onTabChange: (tab: InspectorTab) => void;
  mobileOpen: boolean;
  onClose: () => void;
  onToggle: () => void;
  width: number;
  onResize: (width: number) => void;
  compose: ReactNode;
  transform: ReactNode;
  tracks: ReactNode;
}
const MIN_WIDTH = 270;
const MAX_WIDTH = 420;
const DEFAULT_WIDTH = 312;
const clamp = (value: number) => Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(value)));

export function Inspector({ tab, onTabChange, mobileOpen, onClose, onToggle, width, onResize, compose, transform, tracks }: Props) {
  const ref = useRef<HTMLElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const resizeStart = useRef<{ x: number; width: number } | null>(null);

  useEffect(() => {
    if (!mobileOpen || !window.matchMedia("(max-width: 760px)").matches) return;
    opener.current = document.activeElement as HTMLElement;
    ref.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
    return () => opener.current?.focus();
  }, [mobileOpen]);

  const contents = { compose, transform, tracks };

  return <>
    {mobileOpen && <button className="inspector-backdrop" aria-label="Close inspector" onClick={onClose} />}
    <aside id="studio-inspector" ref={ref} className={"inspector" + (mobileOpen ? " is-open" : "")}
      aria-label="Studio controls"
      onKeyDown={event => {
        if (!mobileOpen || !window.matchMedia("(max-width: 760px)").matches) return;
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
        if (event.key === "Tab") {
          const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]',
          )).filter(element => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden");
          const first = focusable[0], last = focusable.at(-1);
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      }}>
      <div className="inspector-heading">
        <div className="inspector-heading-copy">
          <span className="inspector-overline"><span aria-hidden="true" className="inspector-live-dot" /> YOUR WORKSPACE</span>
          <strong>Studio controls</strong>
        </div>
        <button type="button" className="icon-button inspector-collapse" aria-label="Collapse sidebar"
          title="Hide studio controls" onClick={onToggle}><PanelLeftClose size={17} /></button>
        <button type="button" className="icon-button inspector-close" aria-label="Close inspector"
          onClick={onClose}><X size={18} /></button>
      </div>
      <div className="inspector-tabs-row">
        <div role="tablist" aria-label="Studio workspace" className="inspector-tabs">
          {tabs.map((item, index) => <button key={item.id} type="button" role="tab" id={"tab-" + item.id}
            aria-selected={tab === item.id} aria-controls={"panel-" + item.id} tabIndex={tab === item.id ? 0 : -1}
            onClick={() => onTabChange(item.id)} onKeyDown={event => {
              let next: number;
              if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
              else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
              else if (event.key === "Home") next = 0;
              else if (event.key === "End") next = tabs.length - 1;
              else return;
              event.preventDefault();
              onTabChange(tabs[next].id);
              document.getElementById("tab-" + tabs[next].id)?.focus();
            }}><item.Icon size={15} strokeWidth={1.8} aria-hidden="true" /><span>{item.label}</span></button>)}
        </div>
      </div>
      {tabs.map(item => <div key={item.id} role="tabpanel" id={"panel-" + item.id}
        aria-labelledby={"tab-" + item.id} hidden={tab !== item.id}
        className="inspector-panel">{contents[item.id]}</div>)}
      <div className="inspector-resizer" role="separator" tabIndex={0}
        aria-label="Resize studio sidebar" aria-orientation="vertical"
        aria-controls="studio-inspector" aria-valuemin={MIN_WIDTH} aria-valuemax={MAX_WIDTH} aria-valuenow={width}
        title="Drag to resize · Double-click to reset"
        onPointerDown={event => {
          if (event.button !== 0 || window.matchMedia("(max-width: 760px)").matches) return;
          resizeStart.current = { x: event.clientX, width };
          event.currentTarget.setPointerCapture(event.pointerId);
          event.preventDefault();
        }}
        onPointerMove={event => {
          if (!resizeStart.current) return;
          // Resize the CSS grid directly during drag: don't re-render the piano roll at pointer frequency.
          const maxForViewport = Math.max(MIN_WIDTH, window.innerWidth - 360);
          const next = clamp(Math.min(maxForViewport, resizeStart.current.width + event.clientX - resizeStart.current.x));
          ref.current?.closest<HTMLElement>(".workbench")?.style.setProperty("--inspector-width", next + "px");
        }}
        onPointerUp={event => {
          const start = resizeStart.current;
          if (start) {
            const maxForViewport = Math.max(MIN_WIDTH, window.innerWidth - 360);
            onResize(clamp(Math.min(maxForViewport, start.width + event.clientX - start.x)));
          }
          resizeStart.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          resizeStart.current = null;
          ref.current?.closest<HTMLElement>(".workbench")?.style.setProperty("--inspector-width", width + "px");
        }}
        onLostPointerCapture={() => {
          if (resizeStart.current) {
            resizeStart.current = null;
            ref.current?.closest<HTMLElement>(".workbench")?.style.setProperty("--inspector-width", width + "px");
          }
        }}
        onDoubleClick={() => onResize(DEFAULT_WIDTH)}
        onKeyDown={event => {
          const step = event.shiftKey ? 24 : 12;
          let next: number;
          if (event.key === "ArrowLeft") next = width - step;
          else if (event.key === "ArrowRight") next = width + step;
          else if (event.key === "Home") next = MIN_WIDTH;
          else if (event.key === "End") next = MAX_WIDTH;
          else return;
          event.preventDefault();
          event.stopPropagation();
          onResize(clamp(next));
        }}><span aria-hidden="true" /></div>
    </aside>
  </>;
}
