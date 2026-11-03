import { DropdownMenu } from "../ui";
import React, { useEffect, useRef } from "react";

export interface ContextMenuItem {
  kind: "item";
  id: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
}

export interface ContextMenuSwatches {
  kind: "swatches";
  id: string;
  label: string;
  colors: readonly { value: string; label: string }[];
  onSelect: (value: string) => void;
}

export type ContextMenuEntry =
  | ContextMenuItem
  | ContextMenuSwatches
  | "separator";

interface ContextMenuProps {
  x: number;
  y: number;
  entries: readonly ContextMenuEntry[];
  label: string;
  onClose: () => void;
}

/** Canvas hit testing supplies a client point, including for keyboard-invoked page menus. */
export function ContextMenu({ x, y, entries, label, onClose }: ContextMenuProps) {
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const dismiss = (event: Event) => {
      if (!(event.target instanceof Node && content.current?.contains(event.target))) onClose();
    };
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    return () => {
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, [onClose]);

  return <DropdownMenu.Root open modal={false} onOpenChange={open => { if (!open) onClose(); }}>
    <DropdownMenu.Trigger>
      <span aria-hidden="true" tabIndex={-1} style={{ position: "fixed", left: x, top: y }} />
    </DropdownMenu.Trigger>
    <DropdownMenu.Content ref={content} className="context-menu" aria-label={label}
      aria-labelledby={undefined}
      onFocus={event => {
        if (event.target === event.currentTarget) {
          event.currentTarget.querySelector<HTMLElement>('[role="menuitem"]:not([data-disabled])')?.focus();
        }
      }}
      align="start" sideOffset={0} collisionPadding={8} loop>
      {entries.map((entry, index) => {
        if (entry === "separator") return <DropdownMenu.Separator key={index} />;
        if (entry.kind === "swatches") return <DropdownMenu.Group key={entry.id} aria-label={entry.label}
          className="context-menu-swatches">
          {entry.colors.map(color => <DropdownMenu.Item key={color.value} aria-label={color.label}
            title={color.label} onSelect={() => entry.onSelect(color.value)}>
            <span className="menu-color-chip" style={{ backgroundColor: color.value }} />
          </DropdownMenu.Item>)}
        </DropdownMenu.Group>;
        return <DropdownMenu.Item key={entry.id} disabled={entry.disabled === true}
          onSelect={entry.onSelect}>{entry.label}</DropdownMenu.Item>;
      })}
    </DropdownMenu.Content>
  </DropdownMenu.Root>;
}
