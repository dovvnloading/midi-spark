import React, { useState, useEffect, useRef } from 'react';
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
  const startY = useRef(0);
  const startVal = useRef(value);

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (isDragging) {
        const deltaY = startY.current - e.clientY;
        const moveSteps = Math.floor(deltaY / 2); // 2px per step
        const nextVal = startVal.current + moveSteps * step;
        const clampedVal = Math.max(min, Math.min(max, nextVal));
        onChange(clampedVal);
      }
    };
    
    const handlePointerUp = () => {
      if (isDragging) {
        setIsDragging(false);
        document.body.style.cursor = '';
      }
    };

    if (isDragging) {
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    }
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isDragging, min, max, step, onChange]);

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    startY.current = e.clientY;
    startVal.current = value;
    document.body.style.cursor = 'ns-resize';
  };

  return (
    <div 
      className={cn(
        "cursor-ns-resize select-none hardware-display px-2 py-1 text-center font-mono outline-none flex items-center justify-center transition-colors relative overflow-hidden", 
        isDragging && "brightness-125", 
        className
      )}
      onPointerDown={handlePointerDown}
      title="Click and drag up/down to change"
    >
      {/* Scanline effect for LCD look */}
      <div className="absolute inset-0 pointer-events-none bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPjxyZWN0IHdpZHRoPSI0IiBoZWlnaHQ9IjEiIGZpbGw9InJnYmEoMCwwLDAsMC4yKSIvPjwvc3ZnPg==')] opacity-50 z-10" />
      <div className="relative z-20 flex gap-2 items-center">
        {label && <span className="text-[10px] opacity-50 font-sans tracking-widest">{label}</span>}
        <span className="font-bold">{value}</span>
      </div>
    </div>
  );
}
