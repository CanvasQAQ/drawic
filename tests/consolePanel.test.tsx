import React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import {
  ConsolePanel,
  type EditorLogEntry,
} from "../src/renderer/components/ConsolePanel";
import { Toolbar } from "../src/renderer/components/Toolbar";

function mount(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  flushSync(() => root.render(element));
  return { container, root };
}

describe("editor console", () => {
  it("shows timestamped session messages and supports clearing", () => {
    const onClear = vi.fn();
    const entries: EditorLogEntry[] = [
      {
        id: "log_1",
        at: "13:40:01",
        level: "info",
        message: "Placed M1. Placement remains active.",
      },
      {
        id: "log_2",
        at: "13:40:02",
        level: "error",
        message: "Export failed.",
      },
    ];
    const { container, root } = mount(
      <ConsolePanel entries={entries} onClear={onClear} onClose={vi.fn()} />,
    );

    const output = container.querySelector('[role="log"]')!;
    expect(output.textContent).toContain("13:40:01");
    expect(output.textContent).toContain("Placed M1. Placement remains active.");
    expect(output.querySelectorAll(".console-line")).toHaveLength(2);
    const clear = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Clear",
    )!;
    flushSync(() => clear.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onClear).toHaveBeenCalledOnce();
    root.unmount();
  });

  it("does not render a persistent placement banner in the toolbar", () => {
    const noop = vi.fn();
    const { container, root } = mount(
      <Toolbar
        tool="place"
        canUndo={false}
        canRedo={false}
        onNew={noop}
        onOpen={noop}
        onSave={noop}
        onTool={noop}
        onUndo={noop}
        onRedo={noop}
        onExport={noop}
      />,
    );
    expect(container.querySelector(".placement-banner")).toBeNull();
    expect(container.textContent).not.toContain("Click canvas to place");
    expect(container.textContent).not.toContain("Drawic");
    expect(
      container.querySelector('button[aria-label="Duplicate"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('button[aria-label="Rotate"]'),
    ).toBeNull();
    root.unmount();
  });
});
