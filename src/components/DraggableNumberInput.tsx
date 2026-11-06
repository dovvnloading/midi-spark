import { useEffect, useRef, useState } from "react";
import { cn } from "../lib/utils";

export interface DraggableNumberInputProps {
  value: number;
  onChange: (val: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  label?: string;
}

export function DraggableNumberInput({
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  className,
  label,
}: DraggableNumberInputProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const startY = useRef(0);
  const startVal = useRef(value);
  const movedRef = useRef(false);
  const cancelEditRef = useRef(false);
  const displayRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const clampValue = (v: number) => Math.max(min, Math.min(max, v));

  useEffect(() => {
    if (!isDragging) return;
    const handlePointerMove = (e: PointerEvent) => {
      const deltaY = startY.current - e.clientY;
      if (Math.abs(deltaY) > 3) movedRef.current = true;
      if (!movedRef.current) return;
      const moveSteps = Math.trunc(deltaY / 3);
      onChange(clampValue(startVal.current + moveSteps * step));
    };
    const handlePointerUp = () => {
      setIsDragging(false);
      document.body.style.cursor = "";
      // A click types a precise value; dragging still nudges it.
      if (!movedRef.current) {
        setEditText(String(startVal.current));
        setIsEditing(true);
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      document.body.style.cursor = "";
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- numeric constraints stable for this drag
  }, [isDragging, min, max, step, onChange]);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const beginEditing = () => {
    setEditText(String(value));
    setIsEditing(true);
  };

  const commitEdit = () => {
    if (!cancelEditRef.current && editText.trim() !== "") {
      const parsed = Number(editText);
      if (Number.isFinite(parsed)) {
        onChange(clampValue(Math.round(parsed / step) * step));
      }
    }
    cancelEditRef.current = false;
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || isEditing) return;
    let next: number | null = null;
    if (e.key === "ArrowUp" || e.key === "ArrowRight") next = value + step;
    if (e.key === "ArrowDown" || e.key === "ArrowLeft") next = value - step;
    if (e.key === "Home") next = min;
    if (e.key === "End") next = max;
    if (next !== null) {
      e.preventDefault();
      onChange(clampValue(next));
    } else if (e.key === "Enter") {
      e.preventDefault();
      beginEditing();
    }
  };

  return (
    <div
      ref={displayRef}
      role="spinbutton"
      tabIndex={isEditing ? -1 : 0}
      aria-label={label ?? "Numeric value"}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      className={cn(
        "cursor-ns-resize select-none hardware-display px-2 py-1 text-center font-mono outline-none flex items-center justify-center relative overflow-hidden",
        isDragging && "brightness-125",
        className,
      )}
      onPointerDown={(e) => {
        if (isEditing || e.button !== 0) return;
        displayRef.current?.focus();
        setIsDragging(true);
        movedRef.current = false;
        startY.current = e.clientY;
        startVal.current = value;
        document.body.style.cursor = "ns-resize";
      }}
      onDoubleClick={beginEditing}
      onWheel={(e) => {
        // Ordinary page scrolling must never silently change BPM.
        if (isEditing || document.activeElement !== displayRef.current) return;
        onChange(clampValue(value + (e.deltaY < 0 ? 1 : -1) * step));
      }}
      onKeyDown={handleKeyDown}
      title="Click or press Enter to type. Drag vertically or use arrow keys to adjust."
    >
      <div className="relative flex items-center gap-2">
        {label && <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">{label}</span>}
        {isEditing ? (
          <input
            ref={inputRef}
            type="number"
            className="font-bold bg-transparent w-12 text-center text-inherit"
            value={editText}
            min={min}
            max={max}
            step={step}
            aria-label={(label ?? "Value") + " input"}
            onChange={(e) => setEditText(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitEdit();
                displayRef.current?.focus();
              } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                cancelEditRef.current = true;
                setIsEditing(false);
                displayRef.current?.focus();
              }
            }}
            onPointerDown={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="font-bold">{value}</span>
        )}
      </div>
    </div>
  );
}
