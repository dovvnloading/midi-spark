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

/** Accessible native input with a compact, calm studio appearance. */
export function CustomSlider({
  value,
  min,
  max,
  step = 1,
  onChange,
  className,
  fillColor = "var(--accent)",
  label = "Adjust value",
}: CustomSliderProps) {
  const percent = max > min
    ? Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100))
    : 0;

  return (
    <div className={cn("relative flex h-8 w-full items-center", className)}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-[#303b50]"
      >
        <div
          className="h-full rounded-full"
          style={{ width: percent + "%", background: fillColor }}
        />
      </div>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        className="studio-range absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent"
      />
    </div>
  );
}
