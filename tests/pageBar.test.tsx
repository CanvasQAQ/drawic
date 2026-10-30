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

function renderElement(element: React.ReactElement): {
  container: HTMLElement;
  root: Root;
} {
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
    onRenamePage: vi.fn(),
    onDuplicatePage: vi.fn(),
    onDeletePage: vi.fn(),
    onMoveTo: vi.fn(),
  };
  const view = renderElement(
    <PageBar pages={pages} activePageId={activePageId} {...handlers} />,
  );
  return { ...handlers, ...view };
}

function tabByText(container: HTMLElement, name: string): HTMLElement {
  const tab = [...container.querySelectorAll<HTMLElement>('[role="tab"]')].find(
    (candidate) => candidate.textContent?.includes(name),
  );
  if (!tab) {
    throw new Error(`Tab ${name} was not rendered.`);
  }
  return tab;
}

function clickMenuItem(container: HTMLElement, label: string): void {
  const item = [...container.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!item) {
    throw new Error(`Menu item ${label} was not rendered.`);
  }
  flushSync(() => item.click());
}

function pointerEvent(
  type: string,
  clientX: number,
  clientY: number,
): MouseEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX,
    clientY,
  });
  Object.defineProperty(event, "pointerId", { value: 3 });
  return event;
}

describe("page bar", () => {
  it("exposes pages as accessible tabs without hierarchy terminology", () => {
    const { container, root } = renderBar();
    const tabs = [...container.querySelectorAll<HTMLElement>('[role="tab"]')];
    const power = tabs.find((tab) => tab.textContent?.includes("Power"));
    const overview = tabs.find((tab) => tab.textContent?.includes("Overview"));
    expect(power?.getAttribute("aria-selected")).toBe("true");
    expect(overview?.getAttribute("aria-selected")).toBe("false");
    expect(overview?.getAttribute("aria-label")).toBe(
      "Overview, page 1 of 3",
    );
    expect(container.textContent?.toLowerCase()).not.toContain("top");
    root.unmount();
    container.remove();
  });

  it("selects on click, adds pages, and renames on double-click", () => {
    const handlers = renderBar();
    flushSync(() => tabByText(handlers.container, "Signals").click());
    expect(handlers.onSelect).toHaveBeenCalledWith("page_c");

    flushSync(() =>
      handlers.container
        .querySelector<HTMLButtonElement>('[aria-label="Add page"]')!
        .click(),
    );
    expect(handlers.onAdd).toHaveBeenCalledOnce();

    flushSync(() =>
      tabByText(handlers.container, "Overview").dispatchEvent(
        new MouseEvent("dblclick", { bubbles: true }),
      ),
    );
    expect(handlers.onRenamePage).toHaveBeenCalledWith("page_a");
    handlers.root.unmount();
    handlers.container.remove();
  });

  it("offers page actions from a right-click menu", () => {
    const handlers = renderBar();
    flushSync(() =>
      tabByText(handlers.container, "Power").dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          clientX: 40,
          clientY: 20,
        }),
      ),
    );
    expect(handlers.onSelect).toHaveBeenCalledWith("page_b");
    expect(
      handlers.container.querySelector('[role="menu"]'),
    ).not.toBeNull();

    clickMenuItem(handlers.container, "Duplicate");
    expect(handlers.onDuplicatePage).toHaveBeenCalledWith("page_b");

    flushSync(() =>
      tabByText(handlers.container, "Power").dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, clientX: 40, clientY: 20 }),
      ),
    );
    clickMenuItem(handlers.container, "Delete");
    expect(handlers.onDeletePage).toHaveBeenCalledWith("page_b");

    flushSync(() =>
      tabByText(handlers.container, "Power").dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, clientX: 40, clientY: 20 }),
      ),
    );
    clickMenuItem(handlers.container, "Move left");
    expect(handlers.onMoveTo).toHaveBeenCalledWith("page_b", 0);
    handlers.root.unmount();
    handlers.container.remove();
  });

  it("disables page actions that would leave the ends", () => {
    const view = renderBar("page_a");
    flushSync(() =>
      tabByText(view.container, "Overview").dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, clientX: 10, clientY: 10 }),
      ),
    );
    const moveLeft = [...view.container.querySelectorAll<HTMLButtonElement>(
      '[role="menuitem"]',
    )].find((item) => item.textContent?.trim() === "Move left");
    expect(moveLeft?.disabled).toBe(true);
    view.root.unmount();
    view.container.remove();
  });

  it("reorders tabs by dragging past a neighbour", () => {
    const handlers = renderBar();
    const tab = tabByText(handlers.container, "Overview");
    flushSync(() => {
      tab.dispatchEvent(pointerEvent("pointerdown", 0, 0));
      tab.dispatchEvent(pointerEvent("pointermove", 40, 0));
      tab.dispatchEvent(pointerEvent("pointerup", 40, 0));
    });
    // All tab rects are zero-sized in jsdom, so the pointer sits past every
    // midpoint and the drop index becomes the last slot.
    expect(handlers.onMoveTo).toHaveBeenCalledWith("page_a", 2);
    handlers.root.unmount();
    handlers.container.remove();
  });

  it("moves the focused tab with Alt+Arrow and deletes refuse the last page", () => {
    const handlers = renderBar();
    flushSync(() =>
      tabByText(handlers.container, "Power").dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          key: "ArrowRight",
          altKey: true,
        }),
      ),
    );
    expect(handlers.onMoveTo).toHaveBeenCalledWith("page_b", 2);
    handlers.root.unmount();
    handlers.container.remove();

    const single = renderElement(
      <PageBar
        pages={[pages[0]!]}
        activePageId="page_a"
        onSelect={vi.fn()}
        onAdd={vi.fn()}
        onRenamePage={vi.fn()}
        onDuplicatePage={vi.fn()}
        onDeletePage={vi.fn()}
        onMoveTo={vi.fn()}
      />,
    );
    flushSync(() =>
      tabByText(single.container, "Overview").dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, clientX: 10, clientY: 10 }),
      ),
    );
    const remove = [...single.container.querySelectorAll<HTMLButtonElement>(
      '[role="menuitem"]',
    )].find((item) => item.textContent?.trim() === "Delete");
    expect(remove?.disabled).toBe(true);
    single.root.unmount();
    single.container.remove();
  });
});
