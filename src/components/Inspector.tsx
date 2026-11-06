import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
export type InspectorTab = "compose" | "transform" | "tracks";
const tabs = [{ id: "compose", label: "Compose" }, { id: "transform", label: "Transform" }, { id: "tracks", label: "Tracks" }] as const;
interface Props {
  tab: InspectorTab; onTabChange: (tab: InspectorTab) => void;
  mobileOpen: boolean; onClose: () => void;
  compose: ReactNode; transform: ReactNode; tracks: ReactNode;
}
export function Inspector({ tab, onTabChange, mobileOpen, onClose, compose, transform, tracks }: Props) {
  const ref = useRef<HTMLElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!mobileOpen || !window.matchMedia("(max-width: 760px)").matches) return;
    opener.current = document.activeElement as HTMLElement;
    ref.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
    return () => opener.current?.focus();
  }, [mobileOpen]);
  const contents = { compose, transform, tracks };
  return <>
    {mobileOpen && <button className="inspector-backdrop" aria-label="Close inspector" onClick={onClose} />}
    <aside ref={ref} className={"inspector" + (mobileOpen ? " is-open" : "")} aria-label="Pattern inspector"
      onKeyDown={event => {
        if (!mobileOpen || !window.matchMedia("(max-width: 760px)").matches) return;
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
        if (event.key === "Tab") {
          const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]')).filter(el => el.getClientRects().length > 0);
          const first = focusable[0], last = focusable.at(-1);
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      }}>
      <div className="inspector-tabs-row">
        <div role="tablist" aria-label="Inspector" className="inspector-tabs">
          {tabs.map((item, index) => <button key={item.id} type="button" role="tab" id={"tab-" + item.id}
            aria-selected={tab === item.id} aria-controls={"panel-" + item.id} tabIndex={tab === item.id ? 0 : -1}
            onClick={() => onTabChange(item.id)} onKeyDown={event => {
              let next: number;
              if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
              else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
              else if (event.key === "Home") next = 0;
              else if (event.key === "End") next = tabs.length - 1;
              else return;
              event.preventDefault(); onTabChange(tabs[next].id);
              document.getElementById("tab-" + tabs[next].id)?.focus();
            }}>{item.label}</button>)}
        </div>
        <button className="icon-button inspector-close" aria-label="Close inspector" onClick={onClose}><X size={17} /></button>
      </div>
      {tabs.map(item => <div key={item.id} role="tabpanel" id={"panel-" + item.id} aria-labelledby={"tab-" + item.id}
        hidden={tab !== item.id} className="inspector-panel">{contents[item.id]}</div>)}
    </aside>
  </>;
}
