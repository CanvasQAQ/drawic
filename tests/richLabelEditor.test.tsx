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

  it("commits formatting-only changes when focus leaves the editor", async () => {
    const onCommit = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    flushSync(() =>
      root.render(
        <RichLabelEditor
          reference="Name"
          onCommit={onCommit}
        />,
      ),
    );
    const content = container.querySelector<HTMLElement>(
      '[aria-label="Editable component Name"]',
    )!;
    content.focus();
    const range = document.createRange();
    range.selectNodeContents(content);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    flushSync(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[aria-label="Bold selected text"]',
        )!
        .dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(content.querySelector("strong")?.textContent).toBe("Name");

    flushSync(() =>
      content.dispatchEvent(
        new FocusEvent("focusout", { bubbles: true, relatedTarget: document.body }),
      ),
    );

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0]?.[0]).toBe("Name");
    expect(onCommit.mock.calls[0]?.[1]).toEqual([
      { text: "Name", bold: true, italic: false, script: "normal" },
    ]);
    root.unmount();
    container.remove();
  });

  it("reports live changes and brackets one preview step per edit", async () => {
    const onChange = vi.fn();
    const onPreviewStart = vi.fn();
    const onPreviewEnd = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    flushSync(() =>
      root.render(
        <RichLabelEditor
          reference="Name"
          onChange={onChange}
          onCommit={vi.fn()}
          onPreviewStart={onPreviewStart}
          onPreviewEnd={onPreviewEnd}
        />,
      ),
    );
    const content = container.querySelector<HTMLElement>(
      '[aria-label="Editable component Name"]',
    )!;
    content.focus();
    const range = document.createRange();
    range.selectNodeContents(content);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    flushSync(() =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="Bold selected text"]')!
        .dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onPreviewStart).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls.at(-1)?.[0]).toBe("Name");
    expect(onChange.mock.calls.at(-1)?.[1]).toEqual([
      { text: "Name", bold: true, italic: false, script: "normal" },
    ]);

    flushSync(() =>
      content.dispatchEvent(
        new FocusEvent("focusout", { bubbles: true, relatedTarget: document.body }),
      ),
    );
    expect(onPreviewEnd).toHaveBeenCalledTimes(1);
    root.unmount();
    container.remove();
  });
});
