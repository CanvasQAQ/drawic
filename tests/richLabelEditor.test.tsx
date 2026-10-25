import React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { RichLabelEditor } from "../src/renderer/components/RichLabelEditor";
import type { RichTextRun } from "../src/core/model";

describe("rich Name editor", () => {
  it("renders independent multi-character Base and Subscript runs", () => {
    const runs: RichTextRun[] = [
      { text: "XU", bold: true, italic: true, script: "normal" },
      { text: "TAIL", bold: true, italic: false, script: "subscript" },
    ];
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    flushSync(() =>
      root.render(
        <RichLabelEditor
          nodeId="m1"
          reference="XU_TAIL"
          storedRuns={runs}
          onCommit={vi.fn()}
        />,
      ),
    );
    const editor = container.querySelector('[aria-label="Editable component Name"]')!;
    expect(editor.textContent).toBe("XUTAIL");
    expect(editor.querySelector("sub")?.textContent).toBe("TAIL");
    expect(
      container.querySelector('[aria-label="Subscript selected text"]'),
    ).not.toBeNull();
    root.unmount();
    container.remove();
  });
});
