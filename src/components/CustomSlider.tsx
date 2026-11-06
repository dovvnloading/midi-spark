import { cn } from "../lib/utils";

export interface CustomSliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  className?: string;
  fillColor?: string;
  label?: string;
}

/** Native range input for keyboard/touch/screen-reader support, layered over
 * the existing hardware-style track and thumb. */
export function CustomSlider({
  value,
  min,
  max,
  step = 1,
  onChange,
  className,
  fillColor = "linear-gradient(90deg, #1f2c66 0%, #4aff9f 100%)",
  label = "Adjust value",
}: CustomSliderProps) {
  const percentage = max > min
    ? Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100))
    : 0;

  return (
    <div className={cn("relative w-full h-8 flex items-center group", className)}>
      <div
        aria-hidden="true"
        className="absolute w-full h-2 rounded-full overflow-hidden pointer-events-none"
        style={{
          background: "#0d0f13",
          border: "1px solid #000",
          boxShadow: "inset 0 1px 3px rgba(0,0,0,0.8)",
        }}
      >
        <div
          className="h-full pointer-events-none"
          style={{
            width: percentage + "%",
            background: fillColor,
            boxShadow: "0 0 8px rgba(74, 255, 159, 0.4)",
          }}
        />
      </div>
      <div
        aria-hidden="true"
        className="absolute h-6 w-3 rounded-sm pointer-events-none flex flex-col items-center justify-center gap-[2px] z-10 group-focus-within:ring-2 group-focus-within:ring-[#a2b3ff] group-focus-within:ring-offset-2 group-focus-within:ring-offset-[#111216]"
        style={{
          left: "calc(" + percentage + "% - 6px)",
          background: "linear-gradient(180deg, #4b66d4 0%, #2f4ba6 100%)",
          border: "1px solid #111",
          borderTop: "1px solid #7f99ff",
          boxShadow: "0 2px 5px rgba(0,0,0,0.8), inset 0 1px 1px rgba(255,255,255,0.2)",
        }}
      >
        <div className="w-[6px] h-[1px] bg-[#111216] opacity-80" />
        <div className="w-[6px] h-[1px] bg-[#111216] opacity-80" />
        <div className="w-[6px] h-[1px] bg-[#111216] opacity-80" />
      </div>
      <input
        type="range"
        aria-label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
        className="absolute inset-0 z-20 w-full h-full opacity-0 cursor-pointer touch-pan-x"
      />
    </div>
  );
}
