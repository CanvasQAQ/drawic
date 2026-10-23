import React from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyPage, type DrawingPage, type Point } from "../src/core/model";
import {
  SchematicCanvas,
  dragSegment,
  fitViewportToBounds,
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
  selection?: Array<{ kind: "node" | "node-label" | "wire" | "annotation" | "shape"; id: string }>;
  onSelectionChange?: (selection: Array<{ kind: "node" | "node-label" | "wire" | "annotation" | "shape"; id: string }>) => void;
  onAddWire?: (points: Point[], anchors?: unknown) => void;
  onUpdateWire?: (wireId: string, points: Point[]) => void;
  onMoveNodeLabel?: (
    nodeId: string,
    label: "reference" | "value",
    delta: Point,
  ) => void;
  onUpdateShape?: (shapeId: string, patch: Record<string, unknown>) => void;
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
        onUpdateNode={vi.fn()}
        onMoveNodeLabel={options.onMoveNodeLabel ?? vi.fn()}
        onAddJunction={vi.fn()}
        onAddAnnotation={vi.fn()}
        onUpdateAnnotation={vi.fn()}
        onAddShape={vi.fn()}
        onUpdateShape={options.onUpdateShape ?? vi.fn()}
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

  it("supports direct wheel zoom and F fit without a modifier key", async () => {
    const page = createEmptyPage("Viewport");
    addResistor(page, "r1", 900, 600);
    const { container, root } = renderCanvas({ page });
    const svg = container.querySelector("svg.schematic-canvas")!;
    flushSync(() =>
      svg.dispatchEvent(
        new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          clientX: 400,
          clientY: 250,
          deltaY: -160,
        }),
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    const zoomedViewBox = svg.getAttribute("viewBox");
    expect(zoomedViewBox).not.toBe("0 0 1600 1000");
    flushSync(() =>
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "f", bubbles: true })),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(svg.getAttribute("viewBox")).not.toBe(zoomedViewBox);
    expect(
      fitViewportToBounds(
        { minX: 900, minY: 600, maxX: 920, maxY: 640 },
        1.6,
      ),
    ).toMatchObject({ width: 320 });
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

  it("shows handles on pinned segments and keeps both pins fixed while adding a dogleg", () => {
    const page = createEmptyPage("Pinned handles");
    addResistor(page, "r1", 100, 100);
    addResistor(page, "r2", 300, 300);
    page.wires.push({
      id: "wire_pinned",
      points: [
        { x: 100, y: 120 },
        { x: 200, y: 120 },
        { x: 200, y: 280 },
        { x: 300, y: 280 },
      ],
      startAnchor: { deviceId: "r1", pinId: "2" },
      endAnchor: { deviceId: "r2", pinId: "1" },
    });
    const { container, root } = renderCanvas({
      page,
      selection: [{ kind: "wire", id: "wire_pinned" }],
    });
    expect(container.querySelectorAll(".wire-segment-handle")).toHaveLength(3);
    const routed = dragSegment(page.wires[0]!, 0, { x: 0, y: 20 });
    expect(routed[0]).toEqual({ x: 100, y: 120 });
    expect(routed.at(-1)).toEqual({ x: 300, y: 280 });
    for (let index = 1; index < routed.length; index += 1) {
      const previous = routed[index - 1]!;
      const current = routed[index]!;
      expect(previous.x === current.x || previous.y === current.y).toBe(true);
    }
    root.unmount();
  });

  it("previews connected wire movement before a component drag is released", async () => {
    const onMoveSelected = vi.fn();
    const page = createEmptyPage("Live wires");
    addResistor(page, "r1", 100, 100);
    page.wires.push({
      id: "wire_live",
      points: [
        { x: 100, y: 120 },
        { x: 260, y: 120 },
      ],
      startAnchor: { deviceId: "r1", pinId: "2" },
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    flushSync(() =>
      root.render(
        <SchematicCanvas
          page={page}
          library={testLibrary}
          tool="select"
          placementSymbol={null}
          selection={[{ kind: "node", id: "r1" }]}
          onSelectionChange={vi.fn()}
          onPlace={vi.fn()}
          onAddWire={vi.fn()}
          onUpdateWire={vi.fn()}
          onUpdateNode={vi.fn()}
          onMoveNodeLabel={vi.fn()}
          onAddJunction={vi.fn()}
          onAddAnnotation={vi.fn()}
          onUpdateAnnotation={vi.fn()}
          onAddShape={vi.fn()}
          onUpdateShape={vi.fn()}
          onMoveSelected={onMoveSelected}
        />,
      ),
    );
    const node = container.querySelector<SVGElement>('[data-node-id="r1"]')!;
    const initialPath = container.querySelector(".wire-visible")?.getAttribute("d");
    const initialHitX = node.querySelector(".component-hit")?.getAttribute("x");
    flushSync(() => node.dispatchEvent(pointerEvent("pointerdown", 100, 100)));
    flushSync(() => node.dispatchEvent(pointerEvent("pointermove", 160, 140)));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(
      container.querySelector<SVGElement>('[data-node-id="r1"]')?.getAttribute("class"),
    ).toContain("is-moving");
    expect(
      container
        .querySelector('[data-node-id="r1"] .component-hit')
        ?.getAttribute("x"),
    ).not.toBe(initialHitX);
    const previewPath = container.querySelector(".wire-visible")?.getAttribute("d");
    expect(previewPath).not.toBe(initialPath);
    expect(onMoveSelected).not.toHaveBeenCalled();
    root.unmount();
  });

  it("selects and moves a component label independently from its device", async () => {
    const onSelectionChange = vi.fn();
    const onMoveNodeLabel = vi.fn();
    const page = createEmptyPage("Editable labels");
    addResistor(page, "r1", 100, 100);
    const { container, root } = renderCanvas({
      page,
      onSelectionChange,
      onMoveNodeLabel,
    });
    const reference = container.querySelector(".component-reference")!;
    flushSync(() => reference.dispatchEvent(pointerEvent("pointerdown", 120, 98)));
    expect(onSelectionChange).toHaveBeenCalledWith([
      { kind: "node-label", id: "r1", label: "reference" },
    ]);
    flushSync(() => reference.dispatchEvent(pointerEvent("pointermove", 150, 118)));
    await new Promise((resolve) => setTimeout(resolve, 0));
    flushSync(() => reference.dispatchEvent(pointerEvent("pointerup", 150, 118)));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onMoveNodeLabel).toHaveBeenCalledWith("r1", "reference", {
      x: 30,
      y: 20,
    });
    root.unmount();
  });

  it("moves and resizes drawing shapes directly on the canvas", async () => {
    const onUpdateShape = vi.fn();
    const page = createEmptyPage("Editable shapes");
    page.shapes.push({
      id: "shape_box",
      kind: "rectangle",
      x: 40,
      y: 50,
      width: 120,
      height: 70,
      rotation: 0,
      stroke: "#263d48",
      fill: "transparent",
      text: "Filter",
    });
    const { container, root } = renderCanvas({
      page,
      selection: [{ kind: "shape", id: "shape_box" }],
      onUpdateShape,
    });
    const shape = container.querySelector(".drawing-shape")!;
    flushSync(() => shape.dispatchEvent(pointerEvent("pointerdown", 60, 60)));
    flushSync(() => shape.dispatchEvent(pointerEvent("pointermove", 90, 80)));
    await new Promise((resolve) => setTimeout(resolve, 0));
    flushSync(() => shape.dispatchEvent(pointerEvent("pointerup", 90, 80)));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onUpdateShape).toHaveBeenCalledWith("shape_box", { x: 70, y: 70 });
    expect(container.querySelector(".shape-text")?.textContent).toBe("Filter");
    const handles = container.querySelectorAll(".shape-resize-handle");
    expect(handles).toHaveLength(4);
    const southeast = container.querySelector(".shape-resize-se")!;
    flushSync(() => southeast.dispatchEvent(pointerEvent("pointerdown", 160, 120)));
    flushSync(() => southeast.dispatchEvent(pointerEvent("pointermove", 180, 140)));
    await new Promise((resolve) => setTimeout(resolve, 0));
    flushSync(() => southeast.dispatchEvent(pointerEvent("pointerup", 180, 140)));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onUpdateShape).toHaveBeenCalledWith("shape_box", {
      x: 40,
      y: 50,
      width: 140,
      height: 90,
    });
    root.unmount();
  });
});
