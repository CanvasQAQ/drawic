import React from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyPage, type DrawingPage, type Point } from "../src/core/model";
import {
  SchematicCanvas,
  dragSegment,
  zoomViewport,
} from "../src/renderer/components/SchematicCanvas";
import { testLibrary, twoPinSymbol } from "./fixtures";

beforeEach(() => {
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
    value: () => ({
      inverse: () => ({}),
    }),
  });
});

function pointerEvent(type: string, clientX: number, clientY: number, extra = {}): MouseEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX,
    clientY,
    ...extra,
  });
  Object.defineProperty(event, "pointerId", { value: 1 });
  return event;
}

interface RenderOptions {
  page?: DrawingPage;
  tool?: "select" | "wire";
  placementSymbol?: typeof twoPinSymbol | null;
  selection?: Array<{ kind: "node" | "wire" | "annotation" | "shape"; id: string }>;
  onSelectionChange?: (selection: Array<{ kind: "node" | "wire" | "annotation" | "shape"; id: string }>) => void;
  onAddWire?: (points: Point[], anchors?: unknown) => void;
  onUpdateWire?: (wireId: string, points: Point[]) => void;
}

function renderCanvas(options: RenderOptions = {}): {
  container: HTMLElement;
  root: Root;
  page: DrawingPage;
} {
  const page = options.page ?? createEmptyPage("Canvas");
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  flushSync(() =>
    root.render(
      <SchematicCanvas
        page={page}
        library={testLibrary}
        tool={options.tool ?? "select"}
        placementSymbol={options.placementSymbol ?? null}
        selection={options.selection ?? []}
        onSelectionChange={options.onSelectionChange ?? vi.fn()}
        onPlace={vi.fn()}
        onAddWire={options.onAddWire ?? vi.fn()}
        onUpdateWire={options.onUpdateWire ?? vi.fn()}
        onAddJunction={vi.fn()}
        onAddAnnotation={vi.fn()}
        onAddShape={vi.fn()}
        onMoveSelected={vi.fn()}
      />,
    ),
  );
  return { container, root, page };
}

function addResistor(page: DrawingPage, id: string, x: number, y: number): void {
  page.nodes.push({
    id,
    symbolId: twoPinSymbol.id,
    reference: id.toUpperCase(),
    value: "1k",
    x,
    y,
    rotation: 0,
    mirrored: false,
  });
}

describe("canvas interactions", () => {
  it("keeps the pointer position stable while zooming and shows a placement ghost", () => {
    const zoomed = zoomViewport(
      { x: 0, y: 0, width: 1600, height: 1000 },
      { x: 400, y: 250 },
      0.5,
    );
    expect(zoomed).toEqual({ x: 200, y: 125, width: 800, height: 500 });

    const { container, root } = renderCanvas({ placementSymbol: twoPinSymbol });
    const svg = container.querySelector("svg.schematic-canvas")!;
    flushSync(() => svg.dispatchEvent(pointerEvent("pointermove", 240, 180)));
    expect(container.querySelector(".placement-ghost")).not.toBeNull();
    expect(container.querySelector(".placement-ghost text")?.textContent).toBe("Resistor");
    root.unmount();
  });

  it("starts a wire on one exact port and finishes on another", () => {
    const onAddWire = vi.fn();
    const page = createEmptyPage("Ports");
    addResistor(page, "r1", 100, 100);
    addResistor(page, "r2", 300, 300);
    const { container, root } = renderCanvas({ page, tool: "wire", onAddWire });
    const first = container.querySelector<SVGElement>(
      '[data-node-id="r1"] [data-pin-id="2"]',
    )!;
    const second = container.querySelector<SVGElement>(
      '[data-node-id="r2"] [data-pin-id="1"]',
    )!;

    flushSync(() => first.dispatchEvent(pointerEvent("pointerdown", 10, 10)));
    expect(container.querySelector(".wire-draft")).not.toBeNull();
    flushSync(() => second.dispatchEvent(pointerEvent("pointerdown", 20, 20)));

    expect(onAddWire).toHaveBeenCalledOnce();
    expect(onAddWire.mock.calls[0]?.[1]).toEqual({
      startAnchor: { deviceId: "r1", pinId: "2" },
      endAnchor: { deviceId: "r2", pinId: "1" },
    });
    root.unmount();
  });

  it("lets port clicks select their component when the wire tool is inactive", () => {
    const onSelectionChange = vi.fn();
    const page = createEmptyPage("Select ports");
    addResistor(page, "r1", 100, 100);
    const { container, root } = renderCanvas({ page, onSelectionChange });
    const pin = container.querySelector<SVGElement>(
      '[data-node-id="r1"] [data-pin-id="1"]',
    )!;

    flushSync(() => pin.dispatchEvent(pointerEvent("pointerdown", 10, 10)));

    expect(onSelectionChange).toHaveBeenCalledWith([{ kind: "node", id: "r1" }]);
    root.unmount();
  });

  it("shows orthogonal wire segment handles and computes routable points", () => {
    const page = createEmptyPage("Routes");
    page.wires.push({
      id: "wire_route",
      points: [
        { x: 100, y: 100 },
        { x: 200, y: 100 },
        { x: 200, y: 200 },
      ],
    });
    const { container, root } = renderCanvas({
      page,
      selection: [{ kind: "wire", id: "wire_route" }],
    });
    const handles = container.querySelectorAll(".wire-segment-handle");
    expect(handles).toHaveLength(2);
    expect(dragSegment(page.wires[0]!, 0, { x: 0, y: 20 })).toEqual([
      { x: 100, y: 120 },
      { x: 200, y: 120 },
      { x: 200, y: 200 },
    ]);
    root.unmount();
  });
});
