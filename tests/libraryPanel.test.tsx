import React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { DeviceSymbol } from "../src/core/library";
import { LibraryPanel } from "../src/renderer/components/LibraryPanel";
import { testLibrary } from "./fixtures";

function renderPanel(symbols: readonly DeviceSymbol[], onManageDevices = vi.fn()) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  flushSync(() =>
    root.render(
      <LibraryPanel
        symbols={symbols}
        selectedSymbolId={null}
        onSelect={vi.fn()}
        onCollapse={vi.fn()}
        onManageDevices={onManageDevices}
      />,
    ),
  );
  return { container, root, onManageDevices };
}

describe("device library appearance", () => {
  it("leaves symbol ink to the active theme instead of embedding a light-only color", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    flushSync(() =>
      root.render(
        <LibraryPanel
          symbols={testLibrary as unknown as readonly DeviceSymbol[]}
          selectedSymbolId={testLibrary[0]!.id}
          onSelect={vi.fn()}
          onCollapse={vi.fn()}
        />,
      ),
    );

    const preview = container.querySelector<SVGElement>(".symbol-preview")!;
    expect(preview.getAttribute("style")).toBeNull();
    expect(preview.getAttribute("class")).toBe("symbol-preview");
    expect(container.textContent).not.toContain("PLACING");
    root.unmount();
    container.remove();
  });

  it("filters by source and opens the device manager", () => {
    const symbols = [
      { ...testLibrary[0]!, libraryId: "drawic-built-in" },
      {
        ...testLibrary[1]!,
        id: "custom-a",
        label: "Custom A",
        libraryId: "drawic-user",
        palette: true,
      },
      {
        ...testLibrary[2]!,
        id: "custom-b",
        label: "Project B",
        libraryId: "drawic-embedded",
        palette: true,
      },
    ] as unknown as DeviceSymbol[];
    const { container, root, onManageDevices } = renderPanel(symbols);

    flushSync(() =>
      (
        [...container.querySelectorAll("button")].find((button) =>
          button.textContent?.includes("Manage devices"),
        ) as HTMLButtonElement
      ).click(),
    );
    expect(onManageDevices).toHaveBeenCalledTimes(1);

    flushSync(() => container.querySelector<HTMLButtonElement>('[aria-label="Source"]')!.click());
    flushSync(() => [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(option => option.textContent?.includes("Custom"))!.click());
    expect(container.textContent).toContain("Custom A");
    expect(container.textContent).not.toContain("Project B");
    root.unmount();
    container.remove();
  });
});
