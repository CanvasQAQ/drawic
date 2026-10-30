import React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import {
  ContextMenu,
  type ContextMenuEntry,
} from "../src/renderer/components/ContextMenu";

function renderMenu(
  entries: ContextMenuEntry[],
  onClose = vi.fn(),
): { container: HTMLElement; root: ReturnType<typeof createRoot>; onClose: typeof onClose } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  flushSync(() =>
    root.render(
      <ContextMenu x={20} y={20} entries={entries} label="Test menu" onClose={onClose} />,
    ),
  );
  return { container, root, onClose };
}

const entries: ContextMenuEntry[] = [
  { kind: "item", id: "front", label: "Bring to front", onSelect: vi.fn() },
  { kind: "item", id: "back", label: "Send to back", onSelect: vi.fn(), disabled: true },
  { kind: "item", id: "delete", label: "Delete", onSelect: vi.fn() },
];

describe("ContextMenu", () => {
  it("renders a labelled menu and focuses the first enabled item", () => {
    const { container, root } = renderMenu(entries);
    const menu = container.querySelector('[role="menu"]');
    expect(menu?.getAttribute("aria-label")).toBe("Test menu");
    expect(document.activeElement?.textContent).toBe("Bring to front");
    expect(
      [...container.querySelectorAll('[role="menuitem"]')].map((item) =>
        item.getAttribute("disabled"),
      ),
    ).toEqual([null, "", null]);
    root.unmount();
    container.remove();
  });

  it("roves focus with arrows, Home, and End", () => {
    const { container, root } = renderMenu(entries);
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
    expect(document.activeElement?.textContent).toBe("Delete");
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Home", bubbles: true }),
    );
    expect(document.activeElement?.textContent).toBe("Bring to front");
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "End", bubbles: true }),
    );
    expect(document.activeElement?.textContent).toBe("Delete");
    root.unmount();
    container.remove();
  });

  it("runs the chosen item and then closes", () => {
    const onSelect = vi.fn();
    const { container, root, onClose } = renderMenu([
      { kind: "item", id: "one", label: "One", onSelect },
    ]);
    flushSync(() =>
      container.querySelector<HTMLButtonElement>('[role="menuitem"]')!.click(),
    );
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
    root.unmount();
    container.remove();
  });

  it("closes on Escape and on an outside pointer press", () => {
    const first = renderMenu(entries);
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(first.onClose).toHaveBeenCalledOnce();
    first.root.unmount();
    first.container.remove();

    const second = renderMenu(entries);
    flushSync(() =>
      document.body.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true }),
      ),
    );
    expect(second.onClose).toHaveBeenCalledOnce();
    second.root.unmount();
    second.container.remove();
  });

  it("stays open when the pointer press lands inside the menu", () => {
    const { container, root, onClose } = renderMenu(entries);
    flushSync(() =>
      container
        .querySelector('[role="menu"]')!
        .dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })),
    );
    expect(onClose).not.toHaveBeenCalled();
    root.unmount();
    container.remove();
  });

  it("renders swatch rows that report the picked colour", () => {
    const onPick = vi.fn();
    const { container, root, onClose } = renderMenu([
      {
        kind: "swatches",
        id: "palette",
        label: "Quick colors",
        colors: [
          { value: "#112233", label: "Ink" },
          { value: "#f2c777", label: "Note" },
        ],
        onSelect: onPick,
      },
    ]);
    expect(
      container.querySelector('[role="group"]')?.getAttribute("aria-label"),
    ).toBe("Quick colors");
    flushSync(() =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="Note"]')!
        .click(),
    );
    expect(onPick).toHaveBeenCalledWith("#f2c777");
    expect(onClose).toHaveBeenCalledOnce();
    root.unmount();
    container.remove();
  });
});
