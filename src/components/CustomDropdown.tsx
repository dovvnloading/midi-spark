import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';

export type OptionType = { label: string; value: string | number } | string;
export type GroupedOptionType = { groupLabel: string; options: OptionType[] };

export interface CustomDropdownProps {
  options: OptionType[] | GroupedOptionType[];
  value: string | number;
  onChange: (val: any) => void;
  className?: string;
  dropdownWidth?: string;
}

export function CustomDropdown({ options, value, onChange, className, dropdownWidth }: CustomDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    }
    
    function handleScroll(e: Event) {
      if (isOpen) {
        if (dropdownRef.current && dropdownRef.current.contains(e.target as Node)) {
          return;
        }
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('resize', handleScroll);
    window.addEventListener('scroll', handleScroll, true); 
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('resize', handleScroll);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isOpen]);

  const getLabelAndValue = (opt: OptionType) => {
    if (typeof opt === 'string') return { label: opt, value: opt };
    return { label: opt.label, value: opt.value };
  };

  let currentLabel = value.toString();
  const isGrouped = options.length > 0 && typeof options[0] === 'object' && 'groupLabel' in options[0];

  if (isGrouped) {
    const groups = options as GroupedOptionType[];
    for (const g of groups) {
      const found = g.options.find(o => getLabelAndValue(o).value === value);
      if (found) {
        currentLabel = getLabelAndValue(found).label;
        break;
      }
    }
  } else {
    const opts = options as OptionType[];
    const found = opts.find(o => getLabelAndValue(o).value === value);
    if (found) currentLabel = getLabelAndValue(found).label;
  }

  const handleSelect = (val: string | number) => {
    onChange(val);
    setIsOpen(false);
  };

  const toggleOpen = () => {
    if (!isOpen && buttonRef.current) {
      setRect(buttonRef.current.getBoundingClientRect());
    }
    setIsOpen(!isOpen);
  };

  const portalContent = isOpen && rect ? createPortal(
    <div 
      ref={dropdownRef}
      className="fixed z-[9999] mt-1 rounded shadow-[0_10px_30px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.1)] border border-black bg-[#16181d] max-h-60 overflow-auto py-1 focus:outline-none"
      style={{
        top: rect.bottom,
        left: rect.left,
        width: dropdownWidth || Math.max(rect.width, 140),
      }}
    >
      {isGrouped ? (
        (options as GroupedOptionType[]).map((group, idx) => (
          <div key={idx} className="mb-1">
            <div className="px-3 py-1 text-[9px] font-bold text-[#737b8c] uppercase tracking-widest bg-black/40 border-b border-black">
              {group.groupLabel}
            </div>
            {group.options.map((opt, i) => {
               const { label, value: optVal } = getLabelAndValue(opt);
               return (
                 <button
                   key={i}
                   onClick={() => handleSelect(optVal)}
                   className={cn(
                     "w-full text-left px-3 py-1.5 text-[10px] font-mono tracking-wider hover:bg-[#252831] hover:text-[#4aff9f] transition-colors",
                     value === optVal ? "text-[#4aff9f] bg-[#090a0c]" : "text-[#d0d3dc]"
                   )}
                 >
                   {label}
                 </button>
               );
            })}
          </div>
        ))
      ) : (
        (options as OptionType[]).map((opt, i) => {
          const { label, value: optVal } = getLabelAndValue(opt);
          return (
            <button
              key={i}
              onClick={() => handleSelect(optVal)}
              className={cn(
                "w-full text-left px-3 py-1.5 text-[10px] font-mono tracking-wider hover:bg-[#252831] hover:text-[#4aff9f] transition-colors",
                value === optVal ? "text-[#4aff9f] bg-[#090a0c]" : "text-[#d0d3dc]"
              )}
            >
              {label}
            </button>
          );
        })
      )}
    </div>,
    document.body
  ) : null;

  return (
    <div className={cn("inline-block text-left w-full relative", className)} ref={containerRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleOpen}
        className="w-full flex items-center justify-between hardware-display px-3 py-2 text-[10px] font-mono tracking-wider focus:outline-none hover:brightness-125 transition-all"
        style={{ textShadow: "0 0 4px rgba(74,255,159,0.3)" }}
      >
        <span className="truncate">{currentLabel}</span>
        <ChevronDown size={14} className={`ml-2 flex-shrink-0 opacity-70 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {portalContent}
    </div>
  );
}
