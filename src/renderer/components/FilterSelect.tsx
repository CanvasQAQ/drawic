import React, { useRef, useState } from "react";
import { Select } from "../ui";

interface Option { value: string; label: string }

export function FilterSelect({ label, value, options, onChange }: {
  label: string; value: string; options: readonly Option[]; onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const initialItem = useRef<number | null>(null);
  return <Select.Root open={open} onOpenChange={next => { setOpen(next); if (!next) initialItem.current = null; }} value={value} onValueChange={onChange}>
    <Select.Trigger aria-label={label} className="filter-select" onKeyDown={event => {
      event.stopPropagation();
      if (open || event.ctrlKey || event.metaKey || event.altKey) return;
      const index = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 :
        event.key.length === 1 && event.key !== " "
          ? options.findIndex(option => option.label.toLowerCase().startsWith(event.key.toLowerCase())) : -1;
      if (index >= 0) {
        event.preventDefault();
        initialItem.current = index;
        setOpen(true);
      }
    }} />
    <Select.Content position="popper" onFocus={event => {
      if (initialItem.current !== null) {
        const item = event.currentTarget.querySelectorAll<HTMLElement>('[role="option"]')[initialItem.current];
        initialItem.current = null;
        item?.focus();
      }
    }} onKeyDown={event => event.stopPropagation()}>
      {options.map(option => <Select.Item key={option.value} value={option.value}>{option.label}</Select.Item>)}
    </Select.Content>
  </Select.Root>;
}
