import React from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DeviceLibraryRecord } from "../src/core/library";
import { DeviceEditor } from "../src/renderer/components/DeviceEditor";
import { createStarterDevice } from "../src/renderer/components/DeviceLibraryScreen";

function button(container: HTMLElement, text: string): HTMLButtonElement {
  const match = [...container.querySelectorAll("button")].find((candidate) =>
    candidate.textContent?.includes(text),
  );
  if (!match) {
    throw new Error(`Button ${text} not found.`);
  }
  return match as HTMLButtonElement;
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

function lockedRecord(): DeviceLibraryRecord {
  return {
    id: "custom-locked",
    title: "Locked Device",
    category: "custom",
    keywords: [],
    electrical: true,
    palette: true,
    frame: { x: -20, y: -20, width: 40, height: 40 },
    artwork: {
      type: "svg",
      viewBox: "-20 -20 40 40",
      body: '<circle cx="0" cy="0" r="10" fill="none" stroke="currentColor"/>',
      source: "locked.svg",
      sourceSha256: "0",
    },
    pins: [
      {
        id: "1",
        key: "1",
        name: "1",
        role: "passive",
        direction: "west",
        side: "west",
        x: -20,
        y: 0,
      },
    ],
    labelAnchors: {
      reference: { x: 26, y: -4, anchor: "start" },
      value: { x: 26, y: 10, anchor: "start" },
    },
    spice: { prefix: "X", defaultValue: "", supported: false },
    metadata: { sourceCollection: "user", sourceRevision: null },
  };
}

describe("device editor", () => {
  let container: HTMLElement;
  let root: Root;

  function render(record: DeviceLibraryRecord, artworkLocked: boolean) {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    flushSync(() =>
      root.render(
        <DeviceEditor
          initial={record}
          mode="create"
          artworkLocked={artworkLocked}
          onSave={onSave}
          onCancel={onCancel}
        />,
      ),
    );
    return { onSave, onCancel };
  }

  function canvas(): SVGSVGElement {
    return container.querySelector(".device-editor-canvas") as SVGSVGElement;
  }

  function pointer(
    type: "pointerdown" | "pointermove" | "pointerup",
    clientX: number,
    clientY: number,
  ): void {
    flushSync(() =>
      canvas().dispatchEvent(
        new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          button: 0,
          buttons: type === "pointerup" ? 0 : 1,
          clientX,
          clientY,
        }),
      ),
    );
  }

  beforeEach(() => {
    Object.defineProperty(SVGSVGElement.prototype, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 400,
        bottom: 400,
        width: 400,
        height: 400,
        toJSON: () => ({}),
      }),
    });
    Object.assign(Element.prototype, {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => true),
    });
  });

  afterEach(() => {
    root.unmount();
    container.remove();
  });

  it("draws a rectangle, adds a pin, and saves a complete record", () => {
    const { onSave } = render(createStarterDevice("custom-test"), false);

    flushSync(() => button(container, "Rect").click());
    pointer("pointerdown", 103, 103);
    pointer("pointermove", 303, 303);
    pointer("pointerup", 303, 303);

    flushSync(() => button(container, "Pin").click());
    pointer("pointerdown", 350, 200);
    pointer("pointerup", 350, 200);

    const titleLabel = [...container.querySelectorAll("label")].find(
      (label) => label.textContent?.trim() === "Title",
    );
    setInputValue(titleLabel!.querySelector("input")!, "Divider");

    flushSync(() => button(container, "Save device").click());

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0]![0] as DeviceLibraryRecord;
    expect(saved.title).toBe("Divider");
    expect(saved.artwork.shapes).toHaveLength(1);
    expect(saved.artwork.shapes![0]).toMatchObject({
      kind: "rect",
      x: -10,
      y: -10,
      width: 20,
      height: 20,
    });
    expect(saved.artwork.body).toContain("<rect");
    expect(saved.pins).toHaveLength(1);
    expect(saved.pins[0]!.direction).toBe("east");
    expect(saved.pins[0]!.x).toBe(20);
    expect(saved.pins[0]!.y).toBe(0);
    expect(saved.frame).toEqual({ x: -20, y: -20, width: 40, height: 40 });
  });

  it("blocks saving an empty device and shows validation errors", () => {
    const { onSave } = render(createStarterDevice("custom-empty"), false);
    flushSync(() => button(container, "Save device").click());
    expect(onSave).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Draw at least one artwork shape.");
    expect(container.textContent).toContain("Add at least one pin.");
  });

  it("keeps the editor open after saving and confirms unsaved changes on return", () => {
    const { onSave, onCancel } = render(createStarterDevice("custom-navigation"), false);
    flushSync(() => button(container, "Rect").click());
    pointer("pointerdown", 103, 103);
    pointer("pointermove", 303, 303);
    pointer("pointerup", 303, 303);
    flushSync(() => button(container, "Pin").click());
    pointer("pointerdown", 350, 200);
    pointer("pointerup", 350, 200);

    flushSync(() => button(container, "Device library").click());
    expect(container.textContent).toContain("Return to the device library?");
    flushSync(() => button(container, "Keep editing").click());
    expect(onCancel).not.toHaveBeenCalled();

    flushSync(() => button(container, "Save device").click());
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    expect(container.querySelector(".device-editor")).not.toBeNull();

    flushSync(() => button(container, "Device library").click());
    expect(container.textContent).not.toContain("Return to the device library?");
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("offers discard or save when returning with an unsaved edit", () => {
    const { onSave, onCancel } = render(createStarterDevice("custom-leave"), false);
    flushSync(() => button(container, "Rect").click());
    pointer("pointerdown", 103, 103);
    pointer("pointermove", 303, 303);
    pointer("pointerup", 303, 303);
    flushSync(() => button(container, "Pin").click());
    pointer("pointerdown", 350, 200);
    pointer("pointerup", 350, 200);

    flushSync(() => button(container, "Device library").click());
    flushSync(() => button(container, "Save and return").click());
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("discards an unsaved metadata edit only after confirmation", () => {
    const { onSave, onCancel } = render(createStarterDevice("custom-discard"), false);
    const title = [...container.querySelectorAll("label")].find(
      (label) => label.textContent?.trim() === "Title",
    )?.querySelector("input");
    setInputValue(title!, "Changed title");
    flushSync(() => button(container, "Device library").click());
    expect(onCancel).not.toHaveBeenCalled();
    flushSync(() => button(container, "Discard changes").click());
    expect(onSave).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("puts the selected object before device setup and explains the active tool", () => {
    render(createStarterDevice("custom-inspector"), false);
    expect(container.querySelectorAll(".device-editor-tool-group")).toHaveLength(3);
    expect(button(container, "Select").getAttribute("aria-pressed")).toBe("true");
    expect(button(container, "Rect").querySelector("svg")).not.toBeNull();
    expect(container.querySelector(".device-editor-stage-hint")?.textContent).toContain(
      "Select a shape or pin",
    );

    flushSync(() => button(container, "Rect").click());
    expect(button(container, "Rect").getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector(".device-editor-stage-hint")?.textContent).toContain(
      "Drag on the artwork",
    );
    pointer("pointerdown", 120, 120);
    pointer("pointermove", 280, 280);
    pointer("pointerup", 280, 280);

    const inspector = container.querySelector(".device-editor-inspector")!;
    const object = inspector.querySelector(".device-editor-object-section")!;
    const setup = inspector.querySelector(".device-editor-metadata")!;
    expect(object.compareDocumentPosition(setup) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(setup.querySelector("summary")?.textContent).toBe("Device setup");
    expect(setup.hasAttribute("open")).toBe(false);
  });

  it("keeps fixed artwork when the device is locked", () => {
    const initial = lockedRecord();
    const { onSave } = render(initial, true);
    expect(button(container, "Line").disabled).toBe(true);
    expect(button(container, "Pin").disabled).toBe(false);

    flushSync(() => button(container, "Save device").click());
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0]![0] as DeviceLibraryRecord;
    expect(saved.artwork.body).toBe(initial.artwork.body);
    expect(saved.artwork.shapes).toBeUndefined();
  });
});
