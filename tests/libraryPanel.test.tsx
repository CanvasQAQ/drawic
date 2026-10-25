import React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { DeviceSymbol } from "../src/core/library";
import { LibraryPanel } from "../src/renderer/components/LibraryPanel";
import { testLibrary } from "./fixtures";

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
});
