import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '../lib/utils';

export interface CustomSliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  className?: string;
  fillColor?: string;
}

export function CustomSlider({ 
  value, 
  min, 
  max, 
  step = 1, 
  onChange, 
  className, 
  fillColor = 'linear-gradient(90deg, #1f2c66 0%, #4aff9f 100%)' 
}: CustomSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const calculateValue = useCallback(
    (clientX: number): number | null => {
      if (!trackRef.current) return null;
      const rect = trackRef.current.getBoundingClientRect();
      let percent = (clientX - rect.left) / rect.width;
      percent = Math.max(0, Math.min(1, percent));
      const rawVal = min + percent * (max - min);
      const steppedVal = Math.round(rawVal / step) * step;
      return Math.max(min, Math.min(max, steppedVal));
    },
    [min, max, step],
  );

  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (e: PointerEvent) => {
      const next = calculateValue(e.clientX);
      if (next !== null) onChange(next);
    };
    const handlePointerUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isDragging, calculateValue, onChange]);

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    const next = calculateValue(e.clientX);
    if (next !== null) onChange(next);
  };

  const percentage = ((value - min) / (max - min)) * 100;

  return (
    <div 
      className={cn("relative w-full h-8 flex items-center group cursor-pointer", className)}
      onPointerDown={handlePointerDown}
    >
      {/* Track Background */}
      <div 
        ref={trackRef}
        className="absolute w-full h-2 rounded-full overflow-hidden pointer-events-none"
        style={{
          background: '#0d0f13',
          border: '1px solid #000',
          boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.8)'
        }}
      >
        {/* Fill */}
        <div 
          className="h-full pointer-events-none"
          style={{
            width: `${percentage}%`,
            background: fillColor,
            boxShadow: '0 0 8px rgba(74, 255, 159, 0.4)'
          }}
        />
      </div>
      
      {/* Thumb */}
      <div 
        className="absolute h-6 w-3 rounded-sm transition-transform pointer-events-none flex flex-col items-center justify-center gap-[2px] z-10"
        style={{
          left: `calc(${percentage}% - 6px)`,
          background: 'linear-gradient(180deg, #4b66d4 0%, #2f4ba6 100%)',
          border: '1px solid #111',
          borderTop: '1px solid #7f99ff',
          boxShadow: '0 2px 5px rgba(0,0,0,0.8), inset 0 1px 1px rgba(255,255,255,0.2)',
          transform: isDragging ? 'scale(1.1)' : 'scale(1)'
        }}
      >
        <div className="w-[6px] h-[1px] bg-[#111216] shadow-[0_1px_0_rgba(255,255,255,0.2)] opacity-80" />
        <div className="w-[6px] h-[1px] bg-[#111216] shadow-[0_1px_0_rgba(255,255,255,0.2)] opacity-80" />
        <div className="w-[6px] h-[1px] bg-[#111216] shadow-[0_1px_0_rgba(255,255,255,0.2)] opacity-80" />
      </div>
    </div>
  );
}
