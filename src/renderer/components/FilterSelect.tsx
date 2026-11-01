import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface Option { value: string; label: string }

export function FilterSelect({ label, value, options, onChange }: {
  label: string; value: string; options: readonly Option[]; onChange: (value: string) => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 180, maxHeight: 320 });
  const selected = Math.max(0, options.findIndex(option => option.value === value));
  const search = useRef({ text: "", time: 0 });
  useEffect(() => {
    if (!open) return;
    const update = () => {
      const rect = trigger.current!.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom - 12;
      const above = rect.top - 12;
      const height = Math.min(320, Math.max(below, above));
      const width = Math.min(window.innerWidth - 16, Math.max(rect.width, 200));
      setPosition({ top: below >= Math.min(320, above) ? rect.bottom + 4 : Math.max(8, rect.top - height - 4),
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), width, maxHeight: height });
    };
    const outside = (event: PointerEvent) => {
      if (!trigger.current?.contains(event.target as Node) && !popup.current?.contains(event.target as Node)) setOpen(false);
    };
    update();
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);
  useEffect(() => {
    if (open) popup.current?.querySelector('[data-active="true"]')?.scrollIntoView?.({ block: "nearest" });
  }, [active, open]);
  const choose = (index: number) => { onChange(options[index]!.value); setOpen(false); trigger.current?.focus(); };
  return <div className="filter-select">
    <button ref={trigger} type="button" role="combobox" aria-label={label} aria-expanded={open}
      aria-controls={open ? id : undefined} aria-haspopup="listbox"
      aria-activedescendant={open ? `${id}-${active}` : undefined}
      onClick={() => { setActive(selected); setOpen(!open); }}
      onKeyDown={event => {
        event.stopPropagation();
        if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
        else if (event.key === "Tab") setOpen(false);
        else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          setOpen(true);
          setActive(event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 :
            !open ? selected : (active + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
        } else if ((event.key === "Enter" || event.key === " ") && open) { event.preventDefault(); choose(active); }
        else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && event.key !== " ") {
          event.preventDefault();
          const now = Date.now();
          search.current = { text: (now - search.current.time < 700 ? search.current.text : "") + event.key.toLowerCase(), time: now };
          const index = options.findIndex(option => option.label.toLowerCase().startsWith(search.current.text));
          if (index >= 0) { setOpen(true); setActive(index); }
        }
      }}><span>{options[selected]?.label}</span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></button>
    {open && createPortal(<div ref={popup} id={id} role="listbox" aria-label={label} className="filter-options" style={position}>
      {options.map((option, index) => <div key={option.value} id={`${id}-${index}`} role="option"
        aria-selected={value === option.value} data-active={active === index}
        onPointerMove={() => setActive(index)} onMouseDown={event => event.preventDefault()} onClick={() => choose(index)}>
        <span>{option.label}</span><span aria-hidden="true">{value === option.value ? "✓" : ""}</span>
      </div>)}
    </div>, document.body)}
  </div>;
}
