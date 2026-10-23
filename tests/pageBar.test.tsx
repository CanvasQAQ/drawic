import React from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { PageBar } from "../src/renderer/components/PageBar";

const pages = [
  { id: "page_a", name: "Overview" },
  { id: "page_b", name: "Power" },
  { id: "page_c", name: "Signals" },
];

function renderElement(element: React.ReactElement): { container: HTMLElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  flushSync(() => root.render(element));
  return { container, root };
}

function renderBar(activePageId = "page_b") {
  const handlers = {
    onSelect: vi.fn(),
    onAdd: vi.fn(),
    onRename: vi.fn(),
    onDuplicate: vi.fn(),
    onDelete: vi.fn(),
    onMove: vi.fn(),
  };
  const view = renderElement(
    <PageBar pages={pages} activePageId={activePageId} {...handlers} />,
  );
  return { ...handlers, ...view };
}

describe("page bar", () => {
  it("exposes pages as accessible tabs without hierarchy terminology", () => {
    const { container, root } = renderBar();
    const tabs = [...container.querySelectorAll<HTMLElement>('[role="tab"]')];
    const power = tabs.find((tab) => tab.textContent?.includes("Power"));
    const overview = tabs.find((tab) => tab.textContent?.includes("Overview"));
    expect(power?.getAttribute("aria-selected")).toBe("true");
    expect(overview?.getAttribute("aria-selected")).toBe("false");
    expect(container.textContent?.toLowerCase()).not.toContain("top");
    root.unmount();
  });

  it("routes page and page-operation actions", () => {
    const handlers = renderBar();
    const click = (label: string): void => {
      const byLabel = handlers.container.querySelector<HTMLElement>(
        `[aria-label="${label}"]`,
      );
      const byText = [...handlers.container.querySelectorAll<HTMLElement>("button")].find(
        (candidate) => candidate.textContent?.trim().endsWith(label),
      );
      const button = byLabel ?? byText;
      if (!button) {
        throw new Error(`Button ${label} was not rendered.`);
      }
      button.click();
    };
    const signals = [...handlers.container.querySelectorAll<HTMLElement>('[role="tab"]')].find(
      (tab) => tab.textContent?.includes("Signals"),
    );
    signals?.click();
    click("Add page");
    click("Rename");
    click("Duplicate");
    click("Move left");
    click("Move right");

    expect(handlers.onSelect).toHaveBeenCalledWith("page_c");
    expect(handlers.onAdd).toHaveBeenCalledOnce();
    expect(handlers.onRename).toHaveBeenCalledOnce();
    expect(handlers.onDuplicate).toHaveBeenCalledOnce();
    expect(handlers.onMove).toHaveBeenNthCalledWith(1, "page_b", -1);
    expect(handlers.onMove).toHaveBeenNthCalledWith(2, "page_b", 1);
    handlers.root.unmount();
  });

  it("prevents deleting the final page and moving beyond the ends", () => {
    const view = renderElement(
      <PageBar
        pages={pages}
        activePageId="page_a"
        onSelect={vi.fn()}
        onAdd={vi.fn()}
        onRename={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onMove={vi.fn()}
      />,
    );
    const button = (name: string): HTMLButtonElement | null =>
      [...view.container.querySelectorAll<HTMLButtonElement>("button")].find(
        (candidate) => candidate.textContent?.trim().endsWith(name),
      ) ?? null;
    expect(button("Move left")?.disabled).toBe(true);

    flushSync(() =>
      view.root.render(
        <PageBar
          pages={[pages[0]!]}
          activePageId="page_a"
          onSelect={vi.fn()}
          onAdd={vi.fn()}
          onRename={vi.fn()}
          onDuplicate={vi.fn()}
          onDelete={vi.fn()}
          onMove={vi.fn()}
        />,
      ),
    );
    expect(button("Delete")?.disabled).toBe(true);
    view.root.unmount();
  });
});
