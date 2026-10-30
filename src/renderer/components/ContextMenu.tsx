import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

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

const VIEWPORT_MARGIN = 8;

/**
 * Small floating menu anchored at client coordinates. Closes on Escape, an
 * outside pointer press, scrolling, or resizing, and keeps arrow-key focus
 * inside its entries.
 */
export function ContextMenu({ x, y, entries, label, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) {
      return;
    }
    const rect = menu.getBoundingClientRect();
    const left = Math.max(
      VIEWPORT_MARGIN,
      Math.min(x, window.innerWidth - rect.width - VIEWPORT_MARGIN),
    );
    const top = Math.max(
      VIEWPORT_MARGIN,
      Math.min(y, window.innerHeight - rect.height - VIEWPORT_MARGIN),
    );
    setPosition({ left, top });
  }, [x, y, entries]);

  useEffect(() => {
    const menu = menuRef.current;
    const focusableItems = (): HTMLElement[] =>
      Array.from(
        menu?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ??
          [],
      );
    focusableItems()[0]?.focus();

    const handlePointerDown = (event: PointerEvent): void => {
      if (
        menu &&
        event.target instanceof Node &&
        menu.contains(event.target)
      ) {
        return;
      }
      onClose();
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (
        event.key !== "ArrowDown" &&
        event.key !== "ArrowUp" &&
        event.key !== "Home" &&
        event.key !== "End"
      ) {
        return;
      }
      const items = focusableItems();
      if (items.length === 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const current = items.indexOf(document.activeElement as HTMLElement);
      let next: number;
      if (event.key === "Home") {
        next = 0;
      } else if (event.key === "End") {
        next = items.length - 1;
      } else if (event.key === "ArrowDown") {
        next = current < 0 ? 0 : (current + 1) % items.length;
      } else {
        next = current <= 0 ? items.length - 1 : current - 1;
      }
      items[next]?.focus();
    };
    const handleDismiss = (): void => onClose();

    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("resize", handleDismiss);
    window.addEventListener("scroll", handleDismiss, true);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("resize", handleDismiss);
      window.removeEventListener("scroll", handleDismiss, true);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="context-menu"
      role="menu"
      aria-label={label}
      style={{ left: position.left, top: position.top }}
    >
      {entries.map((entry, index) => {
        if (entry === "separator") {
          return (
            <div
              key={`separator-${index}`}
              className="context-menu-separator"
              role="separator"
            />
          );
        }
        if (entry.kind === "swatches") {
          return (
            <div
              key={entry.id}
              className="context-menu-swatches"
              role="group"
              aria-label={entry.label}
            >
              {entry.colors.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  role="menuitem"
                  className="context-menu-swatch"
                  style={{ backgroundColor: color.value }}
                  aria-label={color.label}
                  title={color.label}
                  onClick={() => {
                    entry.onSelect(color.value);
                    onClose();
                  }}
                />
              ))}
            </div>
          );
        }
        return (
          <button
            key={entry.id}
            type="button"
            role="menuitem"
            className="context-menu-item"
            disabled={entry.disabled === true}
            onClick={() => {
              entry.onSelect();
              onClose();
            }}
          >
            {entry.label}
          </button>
        );
      })}
    </div>
  );
}
