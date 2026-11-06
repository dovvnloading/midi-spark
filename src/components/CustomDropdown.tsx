import { ChevronDown } from "lucide-react";
import { cn } from "../lib/utils";

export type OptionType = { label: string; value: string | number } | string;
export type GroupedOptionType = { groupLabel: string; options: OptionType[] };
export interface CustomDropdownProps {
  options: OptionType[] | GroupedOptionType[];
  value: string | number;
  onChange: (value: string | number) => void;
  className?: string;
  dropdownWidth?: string;
  ariaLabel?: string;
}
const resolve = (option: OptionType) => typeof option === "string" ? { label: option, value: option } : option;

/** Native selection keeps keyboard, touch and screen-reader behavior consistent. */
export function CustomDropdown({ options, value, onChange, className, ariaLabel = "Select an option" }: CustomDropdownProps) {
  const grouped = options.length > 0 && typeof options[0] === "object" && "groupLabel" in options[0];
  const renderOption = (option: OptionType) => {
    const item = resolve(option);
    return <option key={item.value} value={item.value}>{item.label}</option>;
  };
  return (
    <div className={cn("select-field", className)}>
      <select aria-label={ariaLabel} value={value} onChange={event => {
        onChange(typeof value === "number" ? Number(event.target.value) : event.target.value);
      }}>
        {grouped ? (options as GroupedOptionType[]).map(group => (
          <optgroup key={group.groupLabel} label={group.groupLabel}>{group.options.map(renderOption)}</optgroup>
        )) : (options as OptionType[]).map(renderOption)}
      </select>
      <ChevronDown size={13} aria-hidden="true" />
    </div>
  );
}
