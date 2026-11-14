import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

// A common drawing grid keeps the controls legible at the editor's 11–20px sizes.
function makeIcon(path: string, solid = false) {
  return function StudioIcon({ size = 20, ...props }: IconProps) {
    return (
      <svg width={size} height={size} viewBox="0 0 20 20"
        fill={solid ? "currentColor" : "none"} stroke="currentColor"
        strokeWidth={solid ? 1 : 1.65} strokeLinecap="round" strokeLinejoin="round"
        aria-hidden="true" focusable="false" {...props}>
        <path d={path} />
      </svg>
    );
  };
}

// Transport and session
export const Play = makeIcon("M5.5 3.2 16.5 10l-11 6.8Z", true);
export const Pause = makeIcon("M4.5 3.5h3.7v13H4.5z M11.8 3.5h3.7v13h-3.7z", true);
export const Stop = makeIcon("M4.3 4.3h11.4v11.4H4.3z", true);
export const Loop = makeIcon("M3 10V7a2 2 0 0 1 2-2h11m-3-3 3 3-3 3 M17 10v3a2 2 0 0 1-2 2H4m3-3-3 3 3 3");
export const Undo = makeIcon("M7 3.5 2.8 7.7 7 12 M3.4 7.7h8.1a5.4 5.4 0 0 1 5.4 5.4v2.4");
export const Redo = makeIcon("m13 3.5 4.2 4.2L13 12 M16.6 7.7H8.5a5.4 5.4 0 0 0-5.4 5.4v2.4");
export const Upload = makeIcon("M3 12.5v4h14v-4 M10 12.5v-10m-4 4 4-4 4 4");
export const Download = makeIcon("M3 12.5v4h14v-4 M10 2.5v10m-4-4 4 4 4-4");
export const ProjectFolder = makeIcon("M2.5 14.8V4.3h5.8l2 2.5h5.4v2.5 M2.5 15.7l2.6-6.4h12.7l-2.6 6.4Z");
export const Keyboard = makeIcon("M2 4.5h16v11H2z M5.2 8h.1m3 0h.1m3 0h.1m3 0h.1 M6.3 12h7.4");
export const Sliders = makeIcon("M2 5.8h3.7m4.2 0H18 M5.7 3.1h4.2v5.4H5.7z M2 14.2h8.4m4.2 0H18 M10.4 11.5h4.2v5.4h-4.2z");
export const Trash = makeIcon("M3 5.5h14 M7.2 5.5V3.1h5.6v2.4 M5 5.5l.8 11h8.4l.8-11 M10 8.6v4.7");
export const Storage = makeIcon("M3 11.5 5.3 4h9.4l2.3 7.5v4.8H3z M3 11.5h14 M13.4 13.9h.6");

// Piano roll and editing
export const PianoRollIcon = makeIcon("M2.8 2.8v14.4h14.4 M5.7 12.6h3.9v-1.4H5.7z M9.7 8.7h4.5V7.3H9.7z M14 4.8h3.2V3.4H14z");
export const Draw = makeIcon("m3 16.7 1-4.5L13.9 2.3l3.8 3.8-9.9 9.8Z M11.8 4.5l3.7 3.7");
export const Select = makeIcon("M4 2.5 16 11l-5.3.7 2.7 4.7-2.7 1.5-2.8-4.8L4 17Z");
export const Stamp = makeIcon("M3 16.7h14 M4 14v-2.3l4-.9V8.6a3.5 3.5 0 1 1 4 0v2.2l4 .9V14Z");
export const Slice = makeIcon("m3 14 7.9-10.2h6.3l-5.5 7.1-6.7 3.1Z M11.8 4l2.4 3.3 M2.7 16.5h5.5m2.7 0h1.1m2.7 0h2.6");
export const Pan = makeIcon("M6.4 10.6V5.7a1.3 1.3 0 0 1 2.6 0v3.5 M9 8.4V3.8a1.3 1.3 0 0 1 2.6 0v5.4 M11.6 8.3V5.2a1.3 1.3 0 0 1 2.6 0v4.3 M14.2 8.3a1.3 1.3 0 0 1 2.6 0v3.9c0 3.4-1.8 5.3-5.2 5.3H9.9c-1.5 0-2.5-.5-3.5-1.9l-3.5-5a1.3 1.3 0 0 1 2-1.6l1.5 1.6Z");
export const FitPattern = makeIcon("M2.8 7V3h4.3m5.8 0h4.3v4m0 6v4h-4.3m-5.8 0H2.8v-4 M6 11.8h3.4m1.2-3.6H14");
export const View = makeIcon("M1.8 10c2.3-3.6 5-5.3 8.2-5.3s5.9 1.7 8.2 5.3c-2.3 3.6-5 5.3-8.2 5.3S4.1 13.6 1.8 10Z M12.3 10a2.3 2.3 0 1 1-4.6 0 2.3 2.3 0 1 1 4.6 0Z");
export const Locate = makeIcon("M3 6.5V3h3.5m7 0H17v3.5m0 7V17h-3.5m-7 0H3v-3.5 M7.4 10H10m0 0h2.6M10 7.4v5.2");
export const InspectorPanel = makeIcon("M2.3 3.5h15.4v13H2.3z M7.3 3.5v13");
export const CollapsePanel = makeIcon("M2.3 3.5h15.4v13H2.3z M7.3 3.5v13 M13.8 7.3 11 10l2.8 2.7");
export const Lock = makeIcon("M4 8.8h12v8H4z M6.5 8.8V6.3a3.5 3.5 0 0 1 7 0v2.5 M10 11.5v2.4");
export const Unlock = makeIcon("M4 8.8h12v8H4z M6.5 8.8V6.3a3.5 3.5 0 0 1 6.8-1.2");
const lens = "M13.6 8.1a5.5 5.5 0 1 1-11 0 5.5 5.5 0 1 1 11 0Z M12.3 12.3l5 5";
export const Search = makeIcon(lens);
export const ZoomIn = makeIcon(lens + " M5.6 8.1h5 M8.1 5.6v5");
export const ZoomOut = makeIcon(lens + " M5.6 8.1h5");

// Tracks, takes and auditioning
export const Layers = makeIcon("M2.5 3.5h15v3.4h-15z M2.5 10h9v2H2.5z M6.8 15h10.7v2H6.8z");
export const Copy = makeIcon("M6.8 6.8h10v10h-10z M3 13.2V3h10.2");
export const CopyPlus = makeIcon("M6.8 6.8h10v10h-10z M3 13.2V3h10.2 M9.1 11.8h5.4m-2.7-2.7v5.4");
export const Headphones = makeIcon("M3.1 12V9.2a6.9 6.9 0 0 1 13.8 0V12 M3.1 10.3h3.5v6.2H3.1z M13.4 10.3h3.5v6.2h-3.5z");
export const Shuffle = makeIcon("M2.5 5.5h3.3l7.4 9h4 M14.5 12l2.7 2.5-2.7 2.5 M2.5 14.5h3.3l2.3-2.8 M11.9 7.1l1.3-1.6h4 M14.5 3l2.7 2.5L14.5 8");
export const SaveTake = makeIcon("M14.8 10.5v6.8L10 14.5l-4.8 2.8V3h6 M15 2v6m-3-3h6");
export const Favorite = makeIcon("m10 2 2.5 5 5.6.9-4.1 4 1 5.6-5-2.7-5 2.7 1-5.6-4.1-4L7.5 7Z");
export const Speaker = makeIcon("M2.5 7.6h3.3l4.7-3.8v12.4l-4.7-3.8H2.5z M13.5 7.1a4.6 4.6 0 0 1 0 5.8 M15.9 4.5a8.2 8.2 0 0 1 0 11");
export const Loading = makeIcon("M16.9 10a6.9 6.9 0 1 1-6.9-6.9 M13.9 4.3l.4.3");

// Shared interface marks
export const Check = makeIcon("m3.3 10 4.3 4.3 9-9.1");
export const Close = makeIcon("m4.5 4.5 11 11 M15.5 4.5l-11 11");
export const Plus = makeIcon("M3.7 10h12.6 M10 3.7v12.6");
export const ChevronDown = makeIcon("m4.5 7.5 5.5 5 5.5-5");
export const ChevronLeft = makeIcon("m12.5 4.5-5 5.5 5 5.5");
export const ChevronRight = makeIcon("m7.5 4.5 5 5.5-5 5.5");
export const ArrowDown = makeIcon("M10 2.7v14.4m-5.2-5.2 5.2 5.2 5.2-5.2");
export const ArrowUp = makeIcon("M10 17.3V2.9m-5.2 5.2L10 2.9l5.2 5.2");
export const ArrowRight = makeIcon("M2.7 10h14.4m-5.2-5.2 5.2 5.2-5.2 5.2");
export const ArrowUpRight = makeIcon("m4.5 15.5 11-11 M6.7 4.5h8.8v8.8");
export const ErrorBadge = makeIcon("M7 2.4h6L17.6 7v6L13 17.6H7L2.4 13V7z M10 6.1v4.6m0 2.6v.2");
export const Warning = makeIcon("m10 2.4 8.1 14.1H1.9Z M10 7.3v3.8m0 2.5v.1");
export const Info = makeIcon("M17.6 10a7.6 7.6 0 1 1-15.2 0 7.6 7.6 0 1 1 15.2 0Z M8.6 9.3H10v4.4h1.5 M10 6.1v.2");
