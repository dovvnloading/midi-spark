import { useState, useEffect, useRef } from 'react';
import { cn } from '../lib/utils';

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
  label
}: DraggableNumberInputProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const startY = useRef(0);
  const startVal = useRef(value);
  const movedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const clampValue = (v: number) => Math.max(min, Math.min(max, v));

  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (e: PointerEvent) => {
      const deltaY = startY.current - e.clientY;
      if (Math.abs(deltaY) > 2) movedRef.current = true;
      const moveSteps = Math.floor(deltaY / 2); // 2px per step
      onChange(clampValue(startVal.current + moveSteps * step));
    };

    const handlePointerUp = () => {
      setIsDragging(false);
      document.body.style.cursor = '';
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDragging, min, max, step, onChange]);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (isEditing) return;
    setIsDragging(true);
    movedRef.current = false;
    startY.current = e.clientY;
    startVal.current = value;
    document.body.style.cursor = 'ns-resize';
  };

  const beginEditing = () => {
    setEditText(String(value));
    setIsEditing(true);
  };

  const commitEdit = () => {
    const parsed = Number(editText);
    if (!Number.isNaN(parsed)) {
      onChange(clampValue(Math.round(parsed / step) * step));
    }
    setIsEditing(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (isEditing) return;
    const direction = e.deltaY < 0 ? 1 : -1;
    onChange(clampValue(value + direction * step));
  };

  return (
    <div
      className={cn(
        "cursor-ns-resize select-none hardware-display px-2 py-1 text-center font-mono outline-none flex items-center justify-center transition-colors relative overflow-hidden",
        isDragging && "brightness-125",
        className
      )}
      onPointerDown={handlePointerDown}
      onDoubleClick={beginEditing}
      onWheel={handleWheel}
      title="Drag up/down, scroll, or double-click to type"
    >
      {/* Scanline effect for LCD look */}
      <div className="absolute inset-0 pointer-events-none bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPjxyZWN0IHdpZHRoPSI0IiBoZWlnaHQ9IjEiIGZpbGw9InJnYmEoMCwwLDAsMC4yKSIvPjwvc3ZnPg==')] opacity-50 z-10" />
      <div className="relative z-20 flex gap-2 items-center">
        {label && <span className="text-[10px] opacity-50 font-sans tracking-widest">{label}</span>}
        {isEditing ? (
          <input
            ref={inputRef}
            type="number"
            className="font-bold bg-transparent w-12 text-center outline-none text-inherit"
            value={editText}
            min={min}
            max={max}
            onChange={(e) => setEditText(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitEdit();
              if (e.key === 'Escape') setIsEditing(false);
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
