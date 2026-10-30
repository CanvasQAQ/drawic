import React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import {
  createEmptyPage,
  type DrawingPage,
  type SelectionRef,
} from "../src/core/model";
import { PropertiesPanel } from "../src/renderer/components/PropertiesPanel";
import { addTestNet, addTestWire } from "./fixtures";

type PanelProps = React.ComponentProps<typeof PropertiesPanel>;

function renderPanel(
  page: DrawingPage,
  selection: SelectionRef[],
  overrides: Partial<PanelProps> = {},
): {
  container: HTMLElement;
  root: ReturnType<typeof createRoot>;
  noop: ReturnType<typeof vi.fn>;
} {
  const noop = vi.fn();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  flushSync(() =>
    root.render(
      <PropertiesPanel
        page={page}
        selection={selection}
        netNameByWire={new Map()}
        onUpdateNode={noop}
        onUpdateNodeLabel={noop}
        onUpdateReferenceLabel={noop}
        onResetNodeLabelStyle={noop}
        onUpdateTypography={noop}
        onUpdateAnnotation={noop}
        onUpdateShape={noop}
        onUpdateNetName={noop}
        onUpdateNetColor={noop}
        onRotate={noop}
        onMirror={noop}
        onMirrorVertical={noop}
        onDelete={noop}
        onCollapse={noop}
        {...overrides}
      />,
    ),
  );
  return { container, root, noop };
}

function clickButton(container: HTMLElement, label: string): void {
  flushSync(() =>
    container
      .querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!
      .dispatchEvent(new MouseEvent("click", { bubbles: true })),
  );
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  flushSync(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function pointerDown(input: HTMLInputElement): void {
  flushSync(() =>
    input.dispatchEvent(
      new MouseEvent("pointerdown", { bubbles: true, button: 0, buttons: 1 }),
    ),
  );
}

function pointerUp(element: Element): void {
  flushSync(() =>
    element.dispatchEvent(
      new MouseEvent("pointerup", { bubbles: true, button: 0 }),
    ),
  );
}

function blurInput(input: HTMLInputElement): void {
  flushSync(() =>
    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })),
  );
}

function fieldByLabel(container: HTMLElement, label: string): HTMLInputElement {
  const labelElement = Array.from(container.querySelectorAll("label")).find(
    (element) => element.textContent?.trim() === label,
  );
  return (labelElement as HTMLLabelElement | undefined)?.control as HTMLInputElement;
}

function noteShape() {
  return {
    id: "note_1",
    kind: "note" as const,
    x: 20,
    y: 20,
    width: 240,
    height: 100,
    rotation: 0 as const,
    stroke: "#b98433",
    fill: "#f2c777",
    text: "Quick note\nBody copy",
    strokeWidth: 1.5,
    dash: "solid" as const,
    opacity: 1,
    fillOpacity: 0.22,
    textSize: 13,
    textColor: "#6b4d20",
    textAlign: "start" as const,
    textBold: true,
    textOffset: { x: 10, y: -4 },
  };
}

describe("properties Net controls", () => {
  it("edits the selected net color from a wire inspector", () => {
    const page = createEmptyPage("Net color");
    addTestNet(page, "net_color", "VOUT").color = "#0f766e";
    addTestWire(
      page,
      "net_color",
      "wire_color",
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    );
    const onUpdateNetColor = vi.fn();
    const noop = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    flushSync(() =>
      root.render(
        <PropertiesPanel
          page={page}
          selection={[{ kind: "wire", id: "wire_color" }]}
          netNameByWire={new Map([["wire_color", "VOUT"]])}
          onUpdateNode={noop}
          onUpdateNodeLabel={noop}
          onUpdateReferenceLabel={noop}
          onResetNodeLabelStyle={noop}
          onUpdateTypography={noop}
          onUpdateAnnotation={noop}
          onUpdateShape={noop}
          onUpdateNetName={noop}
          onUpdateNetColor={onUpdateNetColor}
          onRotate={noop}
          onMirror={noop}
          onMirrorVertical={noop}
          onDelete={noop}
          onCollapse={noop}
        />,
      ),
    );

    const blue = container.querySelector<HTMLButtonElement>(
      '[aria-label="Set net color #1d4ed8"]',
    )!;
    flushSync(() => blue.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onUpdateNetColor).toHaveBeenCalledWith("wire_color", "#1d4ed8");

    const reset = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent === "Default",
    )!;
    flushSync(() => reset.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onUpdateNetColor).toHaveBeenCalledWith("wire_color", null);
    root.unmount();
    container.remove();
  });

  it("edits label appearance without exposing the electrical Reference as a style", () => {
    const page = createEmptyPage("Label style");
    page.nodes.push({
      id: "r1",
      symbolId: "resistor",
      reference: "R1",
      value: "1k",
      x: 100,
      y: 100,
      rotation: 0,
      mirrored: false,
      labelLayout: {
        reference: {
          offset: { x: 0, y: 0 },
          hidden: false,
          position: { x: 115, y: 105 },
          anchor: "start",
          placement: "default",
          side: "east",
        },
      },
    });
    const onUpdateNodeLabel = vi.fn();
    const onUpdateNode = vi.fn();
    const noop = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    flushSync(() =>
      root.render(
        <PropertiesPanel
          page={page}
          selection={[
            { kind: "node-label", id: "r1", label: "reference" },
          ]}
          netNameByWire={new Map()}
          onUpdateNode={onUpdateNode}
          onUpdateNodeLabel={onUpdateNodeLabel}
          onUpdateReferenceLabel={noop}
          onResetNodeLabelStyle={noop}
          onUpdateTypography={noop}
          onUpdateAnnotation={noop}
          onUpdateShape={noop}
          onUpdateNetName={noop}
          onUpdateNetColor={noop}
          onRotate={noop}
          onMirror={noop}
          onMirrorVertical={noop}
          onDelete={noop}
          onCollapse={noop}
        />,
      ),
    );
    expect(
      container.querySelector('[aria-label="Editable component Name"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[aria-label="Bold selected text"][aria-pressed="true"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[aria-label="Italicize selected text"][aria-pressed="false"]',
      ),
    ).not.toBeNull();
    expect(
      Array.from(container.querySelectorAll("button")).some(
        (button) => button.textContent === "Italic",
      ),
    ).toBe(false);
    expect(onUpdateNodeLabel).not.toHaveBeenCalled();
    expect(noop).not.toHaveBeenCalled();
    root.unmount();
    container.remove();
  });
});

describe("properties numeric controls", () => {
  it("uses sliders for continuous note appearance values", () => {
    const page = createEmptyPage("Note controls");
    page.shapes.push(noteShape());
    const onUpdateShape = vi.fn();
    const onPreviewStart = vi.fn();
    const onPreviewEnd = vi.fn();
    const { container, root } = renderPanel(
      page,
      [{ kind: "shape", id: "note_1" }],
      { onUpdateShape, onPreviewStart, onPreviewEnd },
    );

    const lineWidth = fieldByLabel(container, "Line width");
    expect(lineWidth.value).toBe("1.5");
    expect(container.textContent).toContain("1.5 px");

    pointerDown(lineWidth);
    setInputValue(lineWidth, "3.5");
    pointerUp(document.body);
    expect(onUpdateShape).toHaveBeenCalledWith("note_1", {
      strokeWidth: 3.5,
    });
    expect(onPreviewStart).toHaveBeenCalledTimes(1);
    expect(onPreviewEnd).toHaveBeenCalledTimes(1);

    const opacity = fieldByLabel(container, "Opacity");
    const fillOpacity = fieldByLabel(container, "Fill opacity");
    expect(opacity.value).toBe("100");
    expect(fillOpacity.value).toBe("22");

    setInputValue(opacity, "40");
    setInputValue(fillOpacity, "60");
    expect(onUpdateShape).toHaveBeenCalledWith("note_1", { opacity: 0.4 });
    expect(onUpdateShape).toHaveBeenCalledWith("note_1", {
      fillOpacity: 0.6,
    });

    root.unmount();
    container.remove();
  });

  it("uses stepper buttons for text and note sizes", () => {
    const page = createEmptyPage("Text sizes");
    page.annotations.push({
      id: "text_1",
      kind: "text",
      text: "Hello",
      x: 20,
      y: 20,
      size: 16,
    });
    page.shapes.push(noteShape());
    const onUpdateAnnotation = vi.fn();
    const onUpdateShape = vi.fn();
    const first = renderPanel(
      page,
      [{ kind: "annotation", id: "text_1" }],
      { onUpdateAnnotation, onUpdateShape },
    );

    clickButton(first.container, "Increase Font size");
    expect(onUpdateAnnotation).toHaveBeenCalledWith("text_1", { size: 17 });

    const fontSize = fieldByLabel(first.container, "Font size");
    setInputValue(fontSize, "32");
    blurInput(fontSize);
    expect(onUpdateAnnotation).toHaveBeenCalledWith("text_1", { size: 32 });
    first.root.unmount();
    first.container.remove();

    const second = renderPanel(
      page,
      [{ kind: "shape", id: "note_1" }],
      { onUpdateAnnotation, onUpdateShape },
    );
    clickButton(second.container, "Increase Label size");
    expect(onUpdateShape).toHaveBeenCalledWith(
      "note_1",
      expect.objectContaining({ textSize: 14 }),
    );

    clickButton(second.container, "Decrease Text offset X");
    expect(onUpdateShape).toHaveBeenCalledWith("note_1", {
      textOffset: { x: 9, y: -4 },
    });
    clickButton(second.container, "Decrease Text offset Y");
    expect(onUpdateShape).toHaveBeenCalledWith("note_1", {
      textOffset: { x: 10, y: -5 },
    });
    second.root.unmount();
    second.container.remove();
  });

  it("uses the shared rich editor for text annotations and notes", () => {
    const page = createEmptyPage("Rich property fields");
    page.annotations.push({
      id: "text_rich",
      kind: "text",
      text: "Bold and italic",
      x: 20,
      y: 30,
      size: 16,
      richText: [
        { text: "Bold", bold: true, italic: false, script: "normal" },
        { text: " and ", bold: false, italic: false, script: "normal" },
        { text: "italic", bold: false, italic: true, script: "normal" },
      ],
    });
    page.shapes.push(noteShape());
    const annotation = renderPanel(page, [
      { kind: "annotation", id: "text_rich" },
    ]);
    expect(
      annotation.container.querySelector(
        '[aria-label="Editable text annotation"]',
      ),
    ).not.toBeNull();
    expect(
      annotation.container.querySelectorAll(".rich-text-toolbar button"),
    ).toHaveLength(4);
    expect(
      Array.from(annotation.container.querySelectorAll("button")).some(
        (button) => button.textContent === "Bold",
      ),
    ).toBe(false);
    annotation.root.unmount();
    annotation.container.remove();

    const note = renderPanel(page, [{ kind: "shape", id: "note_1" }]);
    expect(
      note.container.querySelector('[aria-label="Editable note text"]'),
    ).not.toBeNull();
    expect(
      note.container.querySelectorAll(".rich-text-toolbar button"),
    ).toHaveLength(4);
    expect(
      Array.from(note.container.querySelectorAll("button")).some(
        (button) => button.textContent === "Bold label",
      ),
    ).toBe(false);
    note.root.unmount();
    note.container.remove();
  });

  it("applies panel text edits to the document while typing", async () => {
    const page = createEmptyPage("Live panel edits");
    page.annotations.push({
      id: "text_live",
      kind: "text",
      text: "Live",
      x: 10,
      y: 20,
      size: 16,
    });
    const onUpdateAnnotation = vi.fn();
    const onPreviewStart = vi.fn();
    const onPreviewEnd = vi.fn();
    const { container, root } = renderPanel(
      page,
      [{ kind: "annotation", id: "text_live" }],
      { onUpdateAnnotation, onPreviewStart, onPreviewEnd },
    );
    const content = container.querySelector<HTMLElement>(
      '[aria-label="Editable text annotation"]',
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
    expect(onUpdateAnnotation).toHaveBeenCalled();
    const [annotationId, patch] = onUpdateAnnotation.mock.calls.at(-1)!;
    expect(annotationId).toBe("text_live");
    expect(patch.text).toBe("Live");
    expect(patch.richText).toEqual([
      { text: "Live", bold: true, italic: false, script: "normal" },
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

  it("uses a slider for component label font scale", () => {
    const page = createEmptyPage("Label scale");
    page.nodes.push({
      id: "r1",
      symbolId: "resistor",
      reference: "R1",
      value: "1k",
      x: 100,
      y: 100,
      rotation: 0,
      mirrored: false,
      labelLayout: {
        reference: {
          offset: { x: 0, y: 0 },
          hidden: false,
          position: { x: 115, y: 105 },
          anchor: "start",
          placement: "default",
          side: "east",
          fontSizeScale: 1,
        },
      },
    });
    const onUpdateNodeLabel = vi.fn();
    const { container, root } = renderPanel(
      page,
      [{ kind: "node-label", id: "r1", label: "reference" }],
      { onUpdateNodeLabel },
    );
    const scale = fieldByLabel(container, "Font size scale");
    expect(scale.value).toBe("1");
    setInputValue(scale, "1.5");
    expect(onUpdateNodeLabel).toHaveBeenCalledWith("r1", "reference", {
      fontSizeScale: 1.5,
    });
    root.unmount();
    container.remove();
  });
});

describe("properties panel layout", () => {
  it("toggles component label visibility from an inline eye button", () => {
    const page = createEmptyPage("Eye toggles");
    page.nodes.push({
      id: "r1",
      symbolId: "resistor",
      reference: "R1",
      value: "1k",
      x: 0,
      y: 0,
      rotation: 0,
      mirrored: false,
    });
    const onUpdateNodeLabel = vi.fn();
    const { container, root } = renderPanel(
      page,
      [{ kind: "node", id: "r1" }],
      { onUpdateNodeLabel },
    );
    const hideReference = container.querySelector<HTMLButtonElement>(
      '[aria-label="Hide reference label"]',
    );
    expect(hideReference?.getAttribute("aria-pressed")).toBe("true");
    flushSync(() => hideReference!.click());
    expect(onUpdateNodeLabel).toHaveBeenCalledWith("r1", "reference", {
      hidden: true,
    });
    root.unmount();
    container.remove();
  });

  it("shows a quick colour combination before fine tuning a shape", () => {
    const page = createEmptyPage("Palette");
    page.shapes.push({
      id: "shape_1",
      kind: "rectangle",
      x: 0,
      y: 0,
      width: 80,
      height: 40,
      rotation: 0,
      stroke: "#263d48",
      fill: "#ffffff",
    });
    const onUpdateShape = vi.fn();
    const { container, root } = renderPanel(
      page,
      [{ kind: "shape", id: "shape_1" }],
      { onUpdateShape },
    );
    const swatch = container.querySelector<HTMLButtonElement>(
      '[aria-label="Note colors"]',
    );
    expect(swatch).not.toBeNull();
    flushSync(() => swatch!.click());
    expect(onUpdateShape).toHaveBeenCalledWith("shape_1", {
      fill: "#f2c777",
      stroke: "#b98433",
      textColor: "#6b4d20",
    });
    root.unmount();
    container.remove();
  });

  it("no longer renders roadmap items or explanatory hints", () => {
    const page = createEmptyPage("Quiet panel");
    const { container, root } = renderPanel(page, []);
    expect(container.querySelector(".property-hint")).toBeNull();
    expect(container.textContent).not.toContain("Roadmap");
    expect(container.textContent).not.toContain("Not implemented");
    expect(container.textContent).not.toContain("Rename page");
    root.unmount();
    container.remove();
  });
});
