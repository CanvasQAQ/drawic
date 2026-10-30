import React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  createEditor,
  IS_BOLD,
  IS_ITALIC,
  IS_SUBSCRIPT,
  IS_SUPERSCRIPT,
} from "lexical";
import {
  RichTextEditor,
  runsFromEditorState,
  type RichTextEditorHandle,
} from "../src/renderer/components/RichTextEditor";
import type { RichTextRun } from "../src/core/model";

// jsdom does not implement layout geometry; Lexical reads caret rects when it
// scrolls a programmatic selection into view (e.g. autoFocus). The editor logic
// under test does not depend on real geometry, so provide empty rects.
if (typeof Range !== "undefined") {
  if (typeof Range.prototype.getBoundingClientRect !== "function") {
    Range.prototype.getBoundingClientRect = () =>
      ({
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        toJSON: () => ({}),
      }) as DOMRect;
  }
  if (typeof Range.prototype.getClientRects !== "function") {
    Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  }
}

function mount(element: React.ReactElement): {
  container: HTMLElement;
  root: ReturnType<typeof createRoot>;
} {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  flushSync(() => root.render(element));
  return { container, root };
}

function queryContent(container: HTMLElement): HTMLDivElement {
  const content = container.querySelector<HTMLDivElement>(".rich-text-content");
  if (content === null) {
    throw new Error("Rich text content element was not rendered.");
  }
  return content;
}

function click(element: Element): void {
  flushSync(() =>
    element.dispatchEvent(new MouseEvent("click", { bubbles: true })),
  );
}

function focusOut(element: Element, relatedTarget: EventTarget | null): void {
  flushSync(() =>
    element.dispatchEvent(
      new FocusEvent("focusout", { bubbles: true, relatedTarget }),
    ),
  );
}

function dispatchKey(
  element: Element,
  key: string,
  modifiers: { ctrlKey?: boolean; metaKey?: boolean } = {},
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...modifiers,
  });
  flushSync(() => element.dispatchEvent(event));
  return event;
}

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function run(
  text: string,
  overrides: {
    bold?: boolean;
    italic?: boolean;
    script?: "normal" | "subscript" | "superscript";
    color?: string;
    fontSizeScale?: number;
  } = {},
): RichTextRun {
  return {
    text,
    bold: overrides.bold ?? false,
    italic: overrides.italic ?? false,
    script: overrides.script ?? "normal",
    ...(overrides.color === undefined ? {} : { color: overrides.color }),
    ...(overrides.fontSizeScale === undefined
      ? {}
      : { fontSizeScale: overrides.fontSizeScale }),
  };
}

describe("RichTextEditor", () => {
  it("renders seeded bold, italic, subscript, and superscript runs", () => {
    const { container, root } = mount(
      <RichTextEditor
        ariaLabel="Editable label"
        initialRuns={[
          run("Bold", { bold: true }),
          run("Italic", { italic: true }),
          run("sub", { script: "subscript" }),
          run("sup", { script: "superscript" }),
        ]}
        onFinish={() => undefined}
      />,
    );

    expect(container.querySelector(".rich-text-editor")).not.toBeNull();
    expect(container.querySelector('[role="group"]')).not.toBeNull();
    const content = queryContent(container);
    expect(content.getAttribute("aria-label")).toBe("Editable label");
    expect(content.textContent).toBe("BoldItalicsubsup");
    expect(content.querySelector("strong")?.textContent).toBe("Bold");
    expect(content.querySelector("em")?.textContent).toBe("Italic");
    expect(content.querySelector("sub")?.textContent).toBe("sub");
    expect(content.querySelector("sup")?.textContent).toBe("sup");

    root.unmount();
    container.remove();
  });

  it("keeps italic composed with bold so the editor shows both", () => {
    const { container, root } = mount(
      <RichTextEditor
        ariaLabel="Editable label"
        initialRuns={[
          { text: "Both", bold: true, italic: true, script: "normal" },
        ]}
        onFinish={() => undefined}
      />,
    );
    const content = queryContent(container);
    const boldElement = content.querySelector("strong");
    expect(boldElement?.textContent).toBe("Both");
    expect(boldElement?.classList.contains("rich-text-bold")).toBe(true);
    expect(boldElement?.classList.contains("rich-text-italic")).toBe(true);
    root.unmount();
    container.remove();
  });

  it("renders a toolbar whose pressed state starts false", () => {
    const { container, root } = mount(
      <RichTextEditor
        ariaLabel="Editable label"
        initialRuns={[run("Name")]}
        onFinish={() => undefined}
      />,
    );

    const toolbar = container.querySelector('[role="toolbar"]');
    expect(toolbar?.getAttribute("aria-label")).toBe("Text formatting");
    const labels = [
      "Bold selected text",
      "Italicize selected text",
      "Subscript selected text",
      "Superscript selected text",
    ];
    for (const label of labels) {
      const button = container.querySelector<HTMLButtonElement>(
        `[aria-label="${label}"]`,
      );
      expect(button).not.toBeNull();
      expect(button?.getAttribute("aria-pressed")).toBe("false");
    }
    expect(toolbar?.querySelectorAll("button")).toHaveLength(4);

    root.unmount();
    container.remove();
  });

  it("applies an initial format to an empty editor", async () => {
    const { container, root } = mount(
      <RichTextEditor
        ariaLabel="Editable note"
        initialRuns={[]}
        initialFormat="bold"
        autoFocus
        onFinish={() => undefined}
      />,
    );
    await flushMicrotasks();
    expect(
      container
        .querySelector('[aria-label="Bold selected text"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
    root.unmount();
    container.remove();
  });

  it("reflects a uniform format before the editor is focused", () => {
    const { container, root } = mount(
      <RichTextEditor
        ariaLabel="Editable label"
        initialRuns={[run("Name", { bold: true })]}
        onFinish={() => undefined}
      />,
    );
    expect(
      container
        .querySelector('[aria-label="Bold selected text"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      container
        .querySelector('[aria-label="Italicize selected text"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("false");
    root.unmount();
    container.remove();
  });

  it("supports custom toolbar label, hidden toolbar, and root className", () => {
    const hidden = mount(
      <RichTextEditor
        ariaLabel="Editable label"
        className="inline-label-editor"
        showToolbar={false}
        initialRuns={[run("Name")]}
        onFinish={() => undefined}
      />,
    );
    const rootElement = hidden.container.querySelector(".rich-text-editor");
    expect(rootElement?.classList.contains("inline-label-editor")).toBe(true);
    expect(hidden.container.querySelector('[role="toolbar"]')).toBeNull();
    hidden.root.unmount();
    hidden.container.remove();

    const labelled = mount(
      <RichTextEditor
        ariaLabel="Editable label"
        toolbarLabel="Label text formatting"
        initialRuns={[run("Name")]}
        onFinish={() => undefined}
      />,
    );
    expect(
      labelled.container
        .querySelector('[role="toolbar"]')
        ?.getAttribute("aria-label"),
    ).toBe("Label text formatting");
    labelled.root.unmount();
    labelled.container.remove();
  });

  it("splits multiline runs into paragraphs and flattens single-line runs", () => {
    const runs = [run("first\nsecond", { bold: true })];

    const multiline = mount(
      <RichTextEditor
        ariaLabel="Multiline label"
        multiline
        initialRuns={runs}
        onFinish={() => undefined}
      />,
    );
    const multilineContent = queryContent(multiline.container);
    const paragraphs = Array.from(multilineContent.querySelectorAll("p"));
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs.map((paragraph) => paragraph.textContent)).toEqual([
      "first",
      "second",
    ]);
    expect(multilineContent.textContent).toBe("firstsecond");
    multiline.root.unmount();
    multiline.container.remove();

    const singleLine = mount(
      <RichTextEditor
        ariaLabel="Single-line label"
        initialRuns={runs}
        onFinish={() => undefined}
      />,
    );
    const singleLineContent = queryContent(singleLine.container);
    expect(singleLineContent.querySelectorAll("p")).toHaveLength(1);
    expect(singleLineContent.textContent).toBe("firstsecond");
    singleLine.root.unmount();
    singleLine.container.remove();
  });

  it("serializes editor states into runs with formatting and newlines", () => {
    const editor = createEditor({ namespace: "rich-text-editor-test" });
    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const first = $createParagraphNode();
        const bold = $createTextNode("Bo").setFormat(IS_BOLD);
        const boldItalic = $createTextNode("ld").setFormat(
          IS_BOLD | IS_ITALIC,
        );
        first.append(bold, boldItalic);
        const second = $createParagraphNode();
        const subscript = $createTextNode("sub").setFormat(IS_SUBSCRIPT);
        const superscript = $createTextNode("sup").setFormat(IS_SUPERSCRIPT);
        superscript.setStyle("color: #ff0000; --drawic-font-size-scale: 0.8");
        second.append(subscript, superscript);
        root.append(first, second);
      },
      { discrete: true },
    );

    const runs = runsFromEditorState(editor.getEditorState());
    expect(runs.map((entry) => entry.text).join("")).toBe("Bold\nsubsup");
    expect(runs[0]).toEqual(run("Bo", { bold: true }));
    expect(runs[1]).toEqual(run("ld\n", { bold: true, italic: true }));
    expect(runs[2]).toEqual(run("sub", { script: "subscript" }));
    expect(runs[3]).toEqual(
      run("sup", {
        script: "superscript",
        color: "#ff0000",
        fontSizeScale: 0.8,
      }),
    );
  });

  it("merges adjacent runs with identical formatting when serializing", () => {
    const editor = createEditor({ namespace: "rich-text-editor-merge-test" });
    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const paragraph = $createParagraphNode();
        paragraph.append(
          $createTextNode("Mer").setFormat(IS_ITALIC),
          $createTextNode("ged").setFormat(IS_ITALIC),
        );
        root.append(paragraph);
      },
      { discrete: true },
    );

    const runs = runsFromEditorState(editor.getEditorState());
    expect(runs).toEqual([run("Merged", { italic: true })]);
  });

  it("does not report a draft change from seeding the editor", () => {
    const onChange = vi.fn();
    const { container, root } = mount(
      <RichTextEditor
        ariaLabel="Multiline label"
        multiline
        autoFocus
        initialRuns={[run("first\nsecond", { bold: true })]}
        onChange={onChange}
        onFinish={() => undefined}
      />,
    );

    expect(onChange).not.toHaveBeenCalled();

    root.unmount();
    container.remove();
  });

  it("reports null when focus leaves an unchanged editor", () => {
    const onFinish = vi.fn();
    const { container, root } = mount(
      <RichTextEditor
        ariaLabel="Editable label"
        initialRuns={[run("Name", { bold: true })]}
        onFinish={onFinish}
      />,
    );
    const content = queryContent(container);
    content.focus();
    focusOut(content, document.body);

    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith(null);

    root.unmount();
    container.remove();
  });

  it("preserves optional run metadata and newlines when reporting no change", () => {
    const onFinish = vi.fn();
    const { container, root } = mount(
      <RichTextEditor
        ariaLabel="Multiline label"
        multiline
        initialRuns={[
          run("first\nsecond", {
            bold: true,
            script: "subscript",
            color: "#00ff00",
            fontSizeScale: 0.75,
          }),
        ]}
        onFinish={onFinish}
      />,
    );
    const content = queryContent(container);
    content.focus();
    focusOut(content, document.body);

    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith(null);

    root.unmount();
    container.remove();
  });

  it("discards a formatted draft when Escape cancels the edit", async () => {
    const onFinish = vi.fn();
    const { container, root } = mount(
      <RichTextEditor
        ariaLabel="Editable label"
        initialRuns={[run("Name")]}
        selectAllOnFocus
        onFinish={onFinish}
      />,
    );
    const content = queryContent(container);
    const boldButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="Bold selected text"]',
    )!;

    click(boldButton);
    await flushMicrotasks();
    expect(content.querySelector("strong")?.textContent).toBe("Name");

    dispatchKey(content, "Escape");
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith(null);

    root.unmount();
    container.remove();
  });

  it("keeps editing alive when focus moves to a toolbar button", () => {
    const onFinish = vi.fn();
    const { container, root } = mount(
      <RichTextEditor
        ariaLabel="Editable label"
        initialRuns={[run("Name")]}
        onFinish={onFinish}
      />,
    );
    const content = queryContent(container);
    const boldButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="Bold selected text"]',
    )!;

    content.focus();
    focusOut(content, boldButton);
    expect(onFinish).not.toHaveBeenCalled();

    focusOut(boldButton, document.body);
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith(null);

    root.unmount();
    container.remove();
  });

  it("updates toolbar pressed state and commits changed runs after formatting", async () => {
    const onFinish = vi.fn();
    const onChange = vi.fn();
    const { container, root } = mount(
      <RichTextEditor
        ariaLabel="Editable label"
        initialRuns={[run("Name")]}
        autoFocus
        selectAllOnFocus
        onChange={onChange}
        onFinish={onFinish}
      />,
    );
    const content = queryContent(container);
    const boldButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="Bold selected text"]',
    )!;

    expect(document.activeElement).toBe(content);

    click(boldButton);
    await flushMicrotasks();
    expect(content.querySelector("strong")?.textContent).toBe("Name");
    expect(boldButton.getAttribute("aria-pressed")).toBe("true");
    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual([
      run("Name", { bold: true }),
    ]);

    focusOut(content, document.body);
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0]?.[0]).toEqual([run("Name", { bold: true })]);

    root.unmount();
    container.remove();
  });

  it("commits single-line editors on Enter and cancels on Escape", () => {
    const enterFinish = vi.fn();
    const enterEditor = mount(
      <RichTextEditor
        ariaLabel="Single-line label"
        initialRuns={[run("Name")]}
        onFinish={enterFinish}
      />,
    );
    const enterContent = queryContent(enterEditor.container);
    enterContent.focus();
    const enterEvent = dispatchKey(enterContent, "Enter");
    expect(enterEvent.defaultPrevented).toBe(true);
    expect(enterContent.querySelectorAll("p")).toHaveLength(1);
    expect(enterFinish).toHaveBeenCalledTimes(1);
    expect(enterFinish).toHaveBeenCalledWith(null);
    enterEditor.root.unmount();
    enterEditor.container.remove();

    const escapeFinish = vi.fn();
    const escapeEditor = mount(
      <RichTextEditor
        ariaLabel="Single-line label"
        initialRuns={[run("Name")]}
        onFinish={escapeFinish}
      />,
    );
    const escapeContent = queryContent(escapeEditor.container);
    escapeContent.focus();
    const escapeEvent = dispatchKey(escapeContent, "Escape");
    expect(escapeEvent.defaultPrevented).toBe(true);
    expect(escapeFinish).toHaveBeenCalledTimes(1);
    expect(escapeFinish).toHaveBeenCalledWith(null);
    escapeEditor.root.unmount();
    escapeEditor.container.remove();
  });

  it("keeps plain Enter in multiline editors and commits with Ctrl+Enter", async () => {
    const onFinish = vi.fn();
    const { container, root } = mount(
      <RichTextEditor
        ariaLabel="Multiline label"
        multiline
        initialRuns={[run("Name")]}
        onFinish={onFinish}
      />,
    );
    const content = queryContent(container);
    content.focus();

    dispatchKey(content, "Enter");
    await flushMicrotasks();
    expect(onFinish).not.toHaveBeenCalled();
    expect(content.querySelectorAll("p")).toHaveLength(2);

    const commitEvent = dispatchKey(content, "Enter", { ctrlKey: true });
    expect(commitEvent.defaultPrevented).toBe(true);
    expect(onFinish).toHaveBeenCalledTimes(1);

    root.unmount();
    container.remove();
  });

  it("exposes commit, cancel, and focus through its imperative handle", () => {
    const onFinish = vi.fn();
    const handle = React.createRef<RichTextEditorHandle>();
    const { container, root } = mount(
      <RichTextEditor
        ref={handle}
        ariaLabel="Editable label"
        initialRuns={[run("Name")]}
        onFinish={onFinish}
      />,
    );

    flushSync(() => handle.current?.focus());
    expect(document.activeElement).toBe(queryContent(container));

    flushSync(() => handle.current?.commit());
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith(null);

    flushSync(() => handle.current?.cancel());
    expect(onFinish).toHaveBeenCalledTimes(1);

    flushSync(() => handle.current?.commit());
    expect(onFinish).toHaveBeenCalledTimes(1);

    root.unmount();
    container.remove();
  });
});
