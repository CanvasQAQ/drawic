import React from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createEmptyPage,
  junctionSelectionId,
  type DrawingPage,
  type Point,
} from "../src/core/model";
import {
  SchematicCanvas,
  dragSegment,
  fitViewportToBounds,
  focusViewportToMarquee,
  zoomViewport,
} from "../src/renderer/components/SchematicCanvas";
import {
  addTestJunction,
  addTestNet,
  addTestWire,
  testLibrary,
  twoPinSymbol,
  wireInPage,
} from "./fixtures";

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
  tool?: "select" | "wire" | "net-label";
  placementSymbol?: typeof twoPinSymbol | null;
  selection?: Array<{ kind: "node" | "node-label" | "wire" | "junction" | "annotation" | "shape"; id: string }>;
  onSelectionChange?: (selection: Array<{ kind: "node" | "node-label" | "wire" | "junction" | "annotation" | "shape"; id: string }>) => void;
  onAddWire?: (points: Point[], anchors?: unknown) => void;
  onUpdateWire?: (wireId: string, points: Point[]) => void;
  onMoveNodeLabel?: (
    nodeId: string,
    label: "reference" | "value",
    delta: Point,
  ) => void;
  onUpdateShape?: (shapeId: string, patch: Record<string, unknown>) => void;
  onMoveSelected?: (delta: Point) => void;
  onAddAnnotation?: (kind: "text" | "net", point: Point, wireId?: string) => void;
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
        onAddAnnotation={options.onAddAnnotation ?? vi.fn()}
        onUpdateAnnotation={vi.fn()}
        onAddShape={vi.fn()}
        onUpdateShape={options.onUpdateShape ?? vi.fn()}
        onMoveSelected={options.onMoveSelected ?? vi.fn()}
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

  it("includes distant wires and junctions in fit-to-content bounds", async () => {
    const page = createEmptyPage("Wire bounds");
    addResistor(page, "r1", 100, 100);
    addTestWire(
      page,
      "net_far",
      "wire_far",
      [
        { x: -1200, y: -800 },
        { x: 12600, y: -800 },
        { x: 12600, y: 1600 },
      ],
    );
    addTestJunction(page, "net_far", "junction_far", -1200, -800);
    const { container, root } = renderCanvas({ page });
    const svg = container.querySelector("svg.schematic-canvas")!;

    flushSync(() =>
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "f", bubbles: true })),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    const [x, y, width, height] = svg
      .getAttribute("viewBox")!
      .split(" ")
      .map(Number);
    expect(x).toBeLessThanOrEqual(-1200);
    expect(y).toBeLessThanOrEqual(-800);
    expect(x! + width!).toBeGreaterThanOrEqual(12600);
    expect(y! + height!).toBeGreaterThanOrEqual(1600);
    root.unmount();
  });

  it("focuses the viewport to a right-drag marquee", () => {
    const focused = focusViewportToMarquee(
      { x: 120, y: 100 },
      { x: 420, y: 300 },
      1.6,
    );
    expect(focused.x).toBeLessThanOrEqual(120);
    expect(focused.y).toBeLessThanOrEqual(100);
    expect(focused.x + focused.width).toBeGreaterThanOrEqual(420);
    expect(focused.y + focused.height).toBeGreaterThanOrEqual(300);
    expect(focused.width).toBeLessThan(1600);
  });

  it("applies right-drag focus from canvas pointer gestures", async () => {
    const page = createEmptyPage("Right drag gesture");
    addResistor(page, "r1", 800, 500);
    const { container, root } = renderCanvas({ page });
    const svg = container.querySelector("svg.schematic-canvas")!;
    const initialViewBox = svg.getAttribute("viewBox");

    flushSync(() =>
      svg.dispatchEvent(
        pointerEvent("pointerdown", 120, 100, { button: 2 }),
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    flushSync(() =>
      svg.dispatchEvent(
        pointerEvent("contextmenu", 120, 100, { button: 2 }),
      ),
    );
    flushSync(() =>
      svg.dispatchEvent(
        pointerEvent("mousemove", 420, 300, { buttons: 2 }),
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(
      container.querySelector(".viewport-marquee")?.getAttribute("width"),
    ).toBe("300");
    flushSync(() =>
      svg.dispatchEvent(pointerEvent("pointerup", 420, 300, { button: 2 })),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(svg.getAttribute("viewBox")).not.toBe(initialViewBox);
    expect(container.querySelector(".viewport-marquee")).toBeNull();
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

  it("creates an explicit junction when a new wire starts on an existing wire", async () => {
    const onAddWire = vi.fn();
    const page = createEmptyPage("Wire branch");
    addTestWire(
      page,
      "net_existing",
      "wire_existing",
      [
        { x: 0, y: 100 },
        { x: 200, y: 100 },
      ],
    );
    const { container, root } = renderCanvas({
      page,
      tool: "wire",
      onAddWire,
    });
    const existing = container.querySelector(".wire-hit")!;
    const svg = container.querySelector("svg.schematic-canvas")!;

    flushSync(() =>
      existing.dispatchEvent(pointerEvent("pointerdown", 83, 100)),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    flushSync(() =>
      svg.dispatchEvent(pointerEvent("pointerdown", 320, 260)),
    );

    expect(onAddWire).toHaveBeenCalledOnce();
    expect(onAddWire.mock.calls[0]?.[2]).toEqual([{ x: 80, y: 100 }]);
    root.unmount();
  });

  it("keeps port affordances small without placing a junction on a device endpoint", () => {
    const page = createEmptyPage("Subtle ports");
    addResistor(page, "r1", 100, 100);
    addTestWire(
      page,
      "net_1",
      "wire_to_pin",
      [
        { x: 100, y: 80 },
        { x: 200, y: 80 },
      ],
      { kind: "pin", deviceId: "r1", pinId: "1" },
    );
    const { container, root } = renderCanvas({ page, tool: "wire" });
    const pin = container.querySelector('[data-node-id="r1"] [data-pin-id="1"]')!;

    expect(pin.querySelector(".port-pin-hit-area")?.getAttribute("r")).toBe("6");
    expect(pin.querySelector(".port-pin-indicator")?.getAttribute("r")).toBe("3");
    expect(container.querySelector(".junction-auto")).toBeNull();
    root.unmount();
  });

  it("attaches a net label to the clicked wire", () => {
    const onAddAnnotation = vi.fn();
    const page = createEmptyPage("Net label target");
    addTestNet(page, "net_1", "N007");
    addTestWire(
      page,
      "net_1",
      "wire_label",
      [
        { x: 120, y: 100 },
        { x: 260, y: 100 },
      ],
    );
    const { container, root } = renderCanvas({
      page,
      tool: "net-label",
      onAddAnnotation,
    });
    const wire = container.querySelector(".wire-hit")!;

    flushSync(() =>
      wire.dispatchEvent(pointerEvent("pointerdown", 160, 100)),
    );
    expect(onAddAnnotation).toHaveBeenCalledWith(
      "net",
      { x: 160, y: 100 },
      "wire_label",
    );
    root.unmount();
  });

  it("keeps a highlighted straight wire rendered after selecting its device", () => {
    const page = createEmptyPage("Highlighted straight wire");
    addResistor(page, "r1", 100, 100);
    addTestWire(
      page,
      "net_1",
      "wire_straight",
      [
        { x: 100, y: 80 },
        { x: 240, y: 80 },
      ],
      { kind: "pin", deviceId: "r1", pinId: "1" },
    );
    const { container, root } = renderCanvas({
      page,
      selection: [{ kind: "node", id: "r1" }],
    });

    expect(container.querySelector(".wire-visible")).not.toBeNull();
    expect(container.querySelector(".wire-group")?.getAttribute("class")).toContain(
      "is-net-highlighted",
    );
    expect(container.querySelector("#net-glow")).toBeNull();
    root.unmount();
  });

  it("selects an explicit junction from its hit target", () => {
    const onSelectionChange = vi.fn();
    const page = createEmptyPage("Junction selection");
    const junction = addTestJunction(
      page,
      "net_1",
      "junction_1",
      100,
      100,
    );
    const { container, root } = renderCanvas({
      page,
      onSelectionChange,
    });
    const hit = container.querySelector(".junction-hit")!;

    flushSync(() =>
      hit.dispatchEvent(pointerEvent("pointerdown", 100, 100)),
    );
    expect(onSelectionChange).toHaveBeenCalledWith([
      { kind: "junction", id: junctionSelectionId(junction) },
    ]);
    root.unmount();
  });

  it("renders only explicit junction vertices with one visual form", () => {
    const page = createEmptyPage("Junction style");
    addTestNet(page, "net_1", "VCC");
    addTestWire(
      page,
      "net_1",
      "horizontal",
      [
          { x: 0, y: 100 },
          { x: 200, y: 100 },
      ],
    );
    addTestWire(
      page,
      "net_1",
      "vertical",
      [
          { x: 100, y: 0 },
          { x: 100, y: 200 },
      ],
    );
    addTestJunction(page, "net_1", "junction_1", 50, 50);
    const { container, root } = renderCanvas({ page });

    expect(container.querySelectorAll(".junction")).toHaveLength(1);
    expect(container.querySelectorAll(".junction-explicit")).toHaveLength(1);
    expect(container.querySelectorAll(".junction-auto")).toHaveLength(0);
    for (const ring of container.querySelectorAll(".junction-ring")) {
      expect(ring.getAttribute("r")).toBe("5.5");
    }
    for (const dot of container.querySelectorAll(".junction-dot")) {
      expect(dot.getAttribute("r")).toBe("3.2");
    }
    root.unmount();
  });

  it("hugs the visible symbol ink instead of the oversized placement frame", () => {
    const page = createEmptyPage("Tight hit target");
    addResistor(page, "r1", 100, 100);
    const { container, root } = renderCanvas({ page });
    const hit = container.querySelector('[data-node-id="r1"] .component-hit')!;

    expect(hit.getAttribute("x")).toBe("92");
    expect(hit.getAttribute("y")).toBe("82");
    expect(hit.getAttribute("width")).toBe("16");
    expect(hit.getAttribute("height")).toBe("36");
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
    addTestWire(
      page,
      "net_route",
      "wire_route",
      [
        { x: 100, y: 100 },
        { x: 200, y: 100 },
        { x: 200, y: 200 },
      ],
    );
    const { container, root } = renderCanvas({
      page,
      selection: [{ kind: "wire", id: "wire_route" }],
    });
    const handles = container.querySelectorAll(".wire-segment-handle");
    expect(handles).toHaveLength(2);
    expect(dragSegment(wireInPage(page, "wire_route")!, 0, { x: 0, y: 20 })).toEqual([
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
    addTestWire(
      page,
      "net_pinned",
      "wire_pinned",
      [
        { x: 100, y: 120 },
        { x: 200, y: 120 },
        { x: 200, y: 280 },
        { x: 300, y: 280 },
      ],
      { kind: "pin", deviceId: "r1", pinId: "2" },
      { kind: "pin", deviceId: "r2", pinId: "1" },
    );
    const { container, root } = renderCanvas({
      page,
      selection: [{ kind: "wire", id: "wire_pinned" }],
    });
    expect(container.querySelectorAll(".wire-segment-handle")).toHaveLength(3);
    const routed = dragSegment(wireInPage(page, "wire_pinned")!, 0, { x: 0, y: 20 });
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
    addTestWire(
      page,
      "net_live",
      "wire_live",
      [
        { x: 100, y: 120 },
        { x: 260, y: 120 },
      ],
      { kind: "pin", deviceId: "r1", pinId: "2" },
    );
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

  it("discards a wire movement preview when the gesture is cancelled", async () => {
    const onMoveSelected = vi.fn();
    const page = createEmptyPage("Cancelled drag");
    addResistor(page, "r1", 100, 100);
    addTestWire(
      page,
      "net_cancel",
      "wire_cancel",
      [
        { x: 100, y: 120 },
        { x: 240, y: 120 },
      ],
      { kind: "pin", deviceId: "r1", pinId: "2" },
    );
    const { container, root } = renderCanvas({
      page,
      selection: [{ kind: "node", id: "r1" }],
      onMoveSelected,
    });
    const node = container.querySelector<SVGElement>('[data-node-id="r1"]')!;
    const initialPath = container.querySelector(".wire-visible")?.getAttribute("d");

    flushSync(() => node.dispatchEvent(pointerEvent("pointerdown", 100, 100)));
    flushSync(() => node.dispatchEvent(pointerEvent("pointermove", 160, 140)));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container.querySelector(".wire-visible")?.getAttribute("d")).not.toBe(
      initialPath,
    );

    flushSync(() =>
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
    );
    flushSync(() => node.dispatchEvent(pointerEvent("pointerup", 160, 140)));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container.querySelector(".wire-visible")?.getAttribute("d")).toBe(
      initialPath,
    );
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
