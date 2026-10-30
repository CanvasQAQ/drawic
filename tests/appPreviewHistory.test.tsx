import React from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/renderer/App";

function createBridge(): Window["drawic"] {
  const unsubscribe = (): void => undefined;
  return {
    platform: "linux",
    version: "test",
    openProject: vi.fn().mockResolvedValue(null),
    saveProject: vi.fn().mockResolvedValue({ canceled: true }),
    openRecentProject: vi.fn().mockResolvedValue(null),
    getRecentProjects: vi.fn().mockResolvedValue([]),
    exportSchematic: vi.fn().mockResolvedValue({ canceled: true }),
    importSpice: vi.fn().mockResolvedValue(null),
    saveSpice: vi.fn().mockResolvedValue({ canceled: true }),
    savePinAudit: vi.fn().mockResolvedValue({ canceled: true }),
    checkpoint: vi.fn().mockResolvedValue(undefined),
    clearRecovery: vi.fn().mockResolvedValue(undefined),
    getRecovery: vi.fn().mockResolvedValue(null),
    getLaunchProject: vi.fn().mockResolvedValue(null),
    setDocumentDirty: vi.fn(),
    finishClose: vi.fn(),
    isWindowMaximized: vi.fn().mockResolvedValue(false),
    minimizeWindow: vi.fn(),
    toggleWindowMaximize: vi.fn(),
    closeWindow: vi.fn(),
    onCommand: vi.fn(() => unsubscribe),
    onProjectOpen: vi.fn(() => unsubscribe),
    onWindowMaximizedChange: vi.fn(() => unsubscribe),
  };
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

function pointerDown(element: Element): void {
  flushSync(() =>
    element.dispatchEvent(
      new MouseEvent("pointerdown", { bubbles: true, button: 0, buttons: 1 }),
    ),
  );
}

function canvasPointer(
  element: Element,
  type: "pointerdown" | "pointerup",
  clientX: number,
  clientY: number,
): void {
  flushSync(() =>
    element.dispatchEvent(
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

function pointerUp(element: Element): void {
  flushSync(() =>
    element.dispatchEvent(
      new MouseEvent("pointerup", { bubbles: true, button: 0 }),
    ),
  );
}

function fieldByLabel(container: HTMLElement, label: string): HTMLInputElement {
  const labelElement = Array.from(container.querySelectorAll("label")).find(
    (element) => element.textContent?.trim() === label,
  );
  return (labelElement as HTMLLabelElement | undefined)?.control as HTMLInputElement;
}

const wait = (milliseconds = 0): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

describe("App slider preview history", () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    Object.defineProperty(window, "drawic", {
      configurable: true,
      value: createBridge(),
    });
    localStorage.clear();
    Object.assign(Element.prototype, {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
    });
    Object.defineProperty(SVGSVGElement.prototype, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 800,
        bottom: 500,
        width: 800,
        height: 500,
        toJSON: () => ({}),
      }),
    });
    Object.defineProperty(SVGSVGElement.prototype, "createSVGPoint", {
      configurable: true,
      value: function createSVGPoint(this: SVGSVGElement) {
        return {
          x: 0,
          y: 0,
          matrixTransform() {
            return { x: this.x, y: this.y };
          },
        };
      },
    });
    Object.defineProperty(SVGSVGElement.prototype, "getScreenCTM", {
      configurable: true,
      value: () => ({ inverse: () => ({}) }),
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    flushSync(() =>
      root.render(
        <React.StrictMode>
          <App />
        </React.StrictMode>,
      ),
    );
  });

  afterEach(() => {
    root.unmount();
    container.remove();
    Reflect.deleteProperty(window, "drawic");
    document.documentElement.removeAttribute("data-theme");
  });

  it("keeps a multi-step slider drag to one undo step", async () => {
    await wait();

    const slider = fieldByLabel(container, "Type scale");
    expect(slider.value).toBe("1");

    pointerDown(slider);
    for (const value of ["1.05", "1.1", "1.15"]) {
      setInputValue(slider, value);
      await wait();
    }
    expect(fieldByLabel(container, "Type scale").value).toBe("1.15");

    // Releasing outside the range input must still close the preview.
    pointerUp(document.body);
    await wait();

    const undo = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Undo"]',
    )!;
    expect(undo.disabled).toBe(false);
    flushSync(() =>
      undo.dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );
    await wait();

    expect(fieldByLabel(container, "Type scale").value).toBe("1");
  });

  it("switches from the Text tool to Select after finishing a new text", async () => {
    await wait();

    const textTool = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Text"]',
    )!;
    flushSync(() =>
      textTool.dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );
    await wait();

    const svg = container.querySelector<SVGSVGElement>(
      "svg.schematic-canvas",
    )!;
    canvasPointer(svg, "pointerdown", 400, 300);
    canvasPointer(svg, "pointerup", 400, 300);
    await wait(80);

    expect(
      container.querySelector('[aria-label="Editable text annotation"]'),
    ).not.toBeNull();
    expect(container.querySelector(".status-bar")?.textContent).toContain(
      "Tool: text",
    );
    expect(container.querySelectorAll(".annotation-text")).toHaveLength(1);

    canvasPointer(svg, "pointerdown", 600, 420);
    await wait(80);

    expect(container.querySelector(".status-bar")?.textContent).toContain(
      "Tool: select",
    );
    expect(container.querySelectorAll(".annotation-text")).toHaveLength(1);
  });
});
