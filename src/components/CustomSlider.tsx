import type { CSSProperties } from "react";
import { cn } from "../lib/utils";
export interface CustomSliderProps {
  value: number; min: number; max: number; step?: number;
  onChange: (value: number) => void; className?: string; fillColor?: string; label?: string;
}
export function CustomSlider({ value, min, max, step = 1, onChange, className, label = "Adjust value" }: CustomSliderProps) {
  const percent = max > min ? Math.max(0, Math.min(100, (value - min) / (max - min) * 100)) : 0;
  return <input className={cn("range-field", className)} type="range" aria-label={label}
    value={value} min={min} max={max} step={step} style={{ "--range-fill": percent + "%" } as CSSProperties}
    onChange={event => onChange(Number(event.target.value))} />;
}
