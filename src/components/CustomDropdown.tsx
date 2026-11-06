import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { cn } from "../lib/utils";

export type OptionType = { label: string; value: string | number } | string;
export type GroupedOptionType = { groupLabel: string; options: OptionType[] };

export interface CustomDropdownProps {
  options: OptionType[] | GroupedOptionType[];
  value: string | number;
  onChange: (val: string | number) => void;
  className?: string;
  dropdownWidth?: string;
  ariaLabel?: string;
}

const resolveOption = (opt: OptionType) =>
  typeof opt === "string" ? { label: opt, value: opt } : opt;

/** Keyboard-accessible listbox: arrows open/navigate, Enter/Space select,
 * Escape closes and restores focus, Tab continues normal keyboard navigation. */
export function CustomDropdown({
  options,
  value,
  onChange,
  className,
  dropdownWidth,
  ariaLabel = "Select an option",
}: CustomDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const isGrouped = options.length > 0 &&
    typeof options[0] === "object" && "groupLabel" in options[0];
  const flatOptions = isGrouped
    ? (options as GroupedOptionType[]).flatMap((group) => group.options)
    : (options as OptionType[]);
  const selectedIndex = flatOptions.findIndex((option) => resolveOption(option).value === value);
  const currentLabel = selectedIndex >= 0
    ? resolveOption(flatOptions[selectedIndex]).label
    : String(value);

  useEffect(() => {
    if (!isOpen) return;
    optionRefs.current[activeIndex]?.focus();
  }, [isOpen, activeIndex]);

  useEffect(() => {
    if (!isOpen) return;
    function onClickOutside(event: MouseEvent) {
      if (containerRef.current?.contains(event.target as Node)) return;
      if (dropdownRef.current?.contains(event.target as Node)) return;
      setIsOpen(false);
    }
    function onScroll(event: Event) {
      if (dropdownRef.current?.contains(event.target as Node)) return;
      setIsOpen(false);
    }
    function onResize() { setIsOpen(false); }

    document.addEventListener("mousedown", onClickOutside);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [isOpen]);

  const close = () => {
    setIsOpen(false);
    buttonRef.current?.focus();
  };
  const open = (index = selectedIndex) => {
    if (buttonRef.current) setRect(buttonRef.current.getBoundingClientRect());
    setActiveIndex(Math.max(0, index));
    setIsOpen(true);
  };
  const select = (nextValue: string | number) => {
    onChange(nextValue);
    close();
  };
  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => Math.min(flatOptions.length - 1, i + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(flatOptions.length - 1);
    } else if (event.key === "Tab") {
      setIsOpen(false);
    }
  };

  const renderOption = (option: OptionType, index: number) => {
    const entry = resolveOption(option);
    return (
      <button
        ref={(element) => { optionRefs.current[index] = element; }}
        key={index}
        id={listboxId + "-option-" + index}
        type="button"
        role="option"
        aria-selected={entry.value === value}
        tabIndex={index === activeIndex ? 0 : -1}
        onClick={() => select(entry.value)}
        className={cn(
          "w-full text-left px-3 py-2 text-xs font-mono tracking-wide hover:bg-[#333b4f] hover:text-white transition-colors",
          entry.value === value ? "text-[#b9ffc9] bg-[#202b2d]" : "text-[#d0d3dc]",
        )}
      >
        {entry.label}
      </button>
    );
  };

  const openAbove = !!rect && window.innerHeight - rect.bottom < 260 && rect.top > 260;
  const menuWidth = rect ? Math.max(rect.width, 140) : 140;

  const portalContent = isOpen && rect ? createPortal(
    <div
      ref={dropdownRef}
      id={listboxId}
      role="listbox"
      aria-label={ariaLabel}
      onKeyDown={handleMenuKeyDown}
      className="fixed z-[9999] rounded-lg shadow-[0_14px_40px_rgba(0,0,0,0.8)] border border-[#414a5e] bg-[#171b25] max-h-60 overflow-auto py-1 focus:outline-none"
      style={{
        top: openAbove ? undefined : rect.bottom + 4,
        bottom: openAbove ? window.innerHeight - rect.top + 4 : undefined,
        left: Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8)),
        width: dropdownWidth || menuWidth,
      }}
    >
      {isGrouped
        ? (options as GroupedOptionType[]).map((group, groupIndex, groups) => {
            const offset = groups.slice(0, groupIndex)
              .reduce((sum, item) => sum + item.options.length, 0);
            return (
              <div key={group.groupLabel} className="mb-1">
                <div className="px-3 py-1.5 text-[10px] font-bold text-[#a0a8ba] uppercase tracking-wide bg-black/40 border-b border-black">
                  {group.groupLabel}
                </div>
                {group.options.map((item, index) => renderOption(item, offset + index))}
              </div>
            );
          })
        : flatOptions.map(renderOption)}
    </div>,
    document.body,
  ) : null;

  return (
    <div className={cn("inline-block text-left w-full relative", className)} ref={containerRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => isOpen ? close() : open()}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            open(Math.min(flatOptions.length - 1, Math.max(0, selectedIndex + 1)));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            open(Math.max(0, selectedIndex - 1));
          }
        }}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        className="w-full flex items-center justify-between hardware-display px-3 py-2 text-xs font-mono tracking-wide hover:brightness-125 transition-colors"
        style={{ textShadow: "0 0 4px rgba(74,255,159,0.3)" }}
      >
        <span className="truncate">{currentLabel}</span>
        <ChevronDown
          size={14}
          aria-hidden="true"
          className={"ml-2 flex-shrink-0 opacity-70 transition-transform duration-200 " +
            (isOpen ? "rotate-180" : "")}
        />
      </button>
      {portalContent}
    </div>
  );
}
