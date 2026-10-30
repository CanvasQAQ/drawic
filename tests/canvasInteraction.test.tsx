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
  fitViewportToAspect,
  fitViewportToBounds,
  focusViewportToMarquee,
  resizeViewportToElement,
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
  tool?: "select" | "duplicate" | "wire" | "net-label" | "text" | "rectangle" | "ellipse" | "note";
  placementSymbol?: typeof twoPinSymbol | null;
  selection?: Array<{ kind: "node" | "node-label" | "wire" | "junction" | "annotation" | "shape"; id: string }>;
  onSelectionChange?: (selection: Array<{ kind: "node" | "node-label" | "wire" | "junction" | "annotation" | "shape"; id: string }>) => void;
  onPlace?: (point: Point, rotation: 0 | 90 | 180 | 270) => void;
  onAddWire?: (points: Point[], anchors?: unknown) => void;
  onUpdateWire?: (wireId: string, points: Point[]) => void;
  onMoveNodeLabel?: (
    nodeId: string,
    label: "reference" | "value",
    delta: Point,
  ) => void;
  onUpdateShape?: (shapeId: string, patch: Record<string, unknown>) => void;
  onUpdateAnnotation?: (annotationId: string, patch: Record<string, unknown>) => void;
  onMoveSelected?: (delta: Point) => void;
  onReorderObjects?: (direction: "front" | "forward" | "backward" | "back") => void;
  onDuplicateSelection?: () => void;
  onDeleteSelection?: () => void;
  onDuplicateNode?: (nodeId: string, delta: Point) => void;
  onAddAnnotation?: (kind: "text" | "net", point: Point, wireId?: string) => void;
  onAddShape?: (kind: string, bounds: { x: number; y: number; width: number; height: number }) => void;
  initialEditAnnotationId?: string | null;
  onInitialEditConsumed?: () => void;
  initialEditShapeId?: string | null;
  onInitialEditShapeConsumed?: () => void;
  onNoteEditingFinished?: () => void;
  onTextEditingFinished?: () => void;
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
        onPlace={options.onPlace ?? vi.fn()}
        onDuplicateNode={options.onDuplicateNode ?? vi.fn()}
        onAddWire={options.onAddWire ?? vi.fn()}
        onUpdateWire={options.onUpdateWire ?? vi.fn()}
        onUpdateNode={vi.fn()}
        onMoveNodeLabel={options.onMoveNodeLabel ?? vi.fn()}
        onAddJunction={vi.fn()}
        onAddAnnotation={options.onAddAnnotation ?? vi.fn()}
        onUpdateAnnotation={options.onUpdateAnnotation ?? vi.fn()}
        onAddShape={options.onAddShape ?? vi.fn()}
        onUpdateShape={options.onUpdateShape ?? vi.fn()}
        onMoveSelected={options.onMoveSelected ?? vi.fn()}
        onReorderObjects={options.onReorderObjects ?? vi.fn()}
        onDuplicateSelection={options.onDuplicateSelection ?? vi.fn()}
        onDeleteSelection={options.onDeleteSelection ?? vi.fn()}
        initialEditAnnotationId={options.initialEditAnnotationId ?? null}
        onInitialEditConsumed={options.onInitialEditConsumed}
        initialEditShapeId={options.initialEditShapeId ?? null}
        onInitialEditShapeConsumed={options.onInitialEditShapeConsumed}
        onNoteEditingFinished={options.onNoteEditingFinished}
        onTextEditingFinished={options.onTextEditingFinished}
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

  it("rotates a placement preview with R before committing the device", () => {
    const onPlace = vi.fn();
    const { container, root } = renderCanvas({
      placementSymbol: twoPinSymbol,
      onPlace,
    });
    const svg = container.querySelector<SVGSVGElement>("svg.schematic-canvas")!;
    flushSync(() => svg.dispatchEvent(pointerEvent("pointermove", 400, 250)));
    flushSync(() =>
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "r", bubbles: true })),
    );
    expect(
      container.querySelector(".placement-ghost [transform]")?.getAttribute(
        "transform",
      ),
    ).toContain("rotate(90)");
    flushSync(() => svg.dispatchEvent(pointerEvent("pointerdown", 400, 250)));
    expect(onPlace).toHaveBeenCalledWith({ x: 400, y: 250 }, 90);
    root.unmount();
  });

  it("snaps a device pin onto an existing Wire during placement", () => {
    const page = createEmptyPage("Pin snap");
    addTestWire(
      page,
      "net_wire",
      "wire_target",
      [
        { x: 20, y: 100 },
        { x: 220, y: 100 },
      ],
    );
    const onPlace = vi.fn();
    const { container, root } = renderCanvas({
      page,
      placementSymbol: twoPinSymbol,
      onPlace,
    });
    const svg = container.querySelector<SVGSVGElement>("svg.schematic-canvas")!;
    flushSync(() => svg.dispatchEvent(pointerEvent("pointermove", 103, 125)));
    flushSync(() => svg.dispatchEvent(pointerEvent("pointerdown", 103, 125)));
    expect(onPlace).toHaveBeenCalledWith({ x: 100, y: 120 }, 0);
    root.unmount();
  });

  it("snaps a device pin onto another Net only when its drag is released", async () => {
    const page = createEmptyPage("Pin drag snap");
    addResistor(page, "r1", 100, 100);
    addTestWire(
      page,
      "net_target",
      "wire_target",
      [
        { x: 20, y: 160 },
        { x: 220, y: 160 },
      ],
    );
    const onMoveSelected = vi.fn();
    const { container, root } = renderCanvas({
      page,
      onMoveSelected,
    });
    const node = container.querySelector<SVGElement>('[data-node-id="r1"]')!;
    flushSync(() => node.dispatchEvent(pointerEvent("pointerdown", 100, 100)));
    flushSync(() => node.dispatchEvent(pointerEvent("pointermove", 100, 130)));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container.querySelector(".component-node")?.classList).toContain(
      "is-moving",
    );
    expect(onMoveSelected).not.toHaveBeenCalled();
    const svg = container.querySelector<SVGSVGElement>("svg.schematic-canvas")!;
    flushSync(() => svg.dispatchEvent(pointerEvent("pointerup", 100, 130)));
    expect(onMoveSelected).toHaveBeenCalledWith({ x: 0, y: 40 });
    root.unmount();
  });

  it("keeps the viewBox matched to the canvas when its element size changes", () => {
    const resized = resizeViewportToElement(
      { x: 100, y: 50, width: 1600, height: 1000 },
      { width: 800, height: 500 },
      { width: 1000, height: 400 },
    );
    expect(resized.width / resized.height).toBeCloseTo(2.5);
    expect(resized.x + resized.width / 2).toBeCloseTo(900);
    expect(resized.y + resized.height / 2).toBeCloseTo(550);

    const fitted = fitViewportToAspect(
      { x: 0, y: 0, width: 1600, height: 1000 },
      2,
    );
    expect(fitted).toEqual({ x: 0, y: 100, width: 1600, height: 800 });
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
      { x: 160, y: 92 },
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

  it("applies the containing net color to every wire group", () => {
    const page = createEmptyPage("Colored net");
    addTestNet(page, "net_color", "VOUT").color = "#1d4ed8";
    addTestWire(
      page,
      "net_color",
      "wire_a",
      [
        { x: 0, y: 100 },
        { x: 100, y: 100 },
      ],
    );
    addTestWire(
      page,
      "net_color",
      "wire_b",
      [
        { x: 200, y: 100 },
        { x: 300, y: 100 },
      ],
    );
    const { container, root } = renderCanvas({ page });
    const groups = container.querySelectorAll<SVGGElement>(".wire-group");
    expect(groups).toHaveLength(2);
    for (const group of groups) {
      expect(group.style.getPropertyValue("--net-color")).toBe("#1d4ed8");
    }
    root.unmount();
  });

  it("keeps exactly one Name node when a hidden Name is shown again", () => {
    const page = createEmptyPage("Show Name");
    addResistor(page, "r1", 100, 100);
    page.nodes[0]!.labelLayout = {
      reference: {
        offset: { x: 0, y: 0 },
        hidden: true,
        position: { x: 115, y: 105 },
        anchor: "start",
        placement: "default",
        side: "east",
      },
    };
    const hidden = renderCanvas({ page });
    expect(hidden.container.querySelectorAll(".component-reference")).toHaveLength(0);
    hidden.root.unmount();

    page.nodes[0]!.labelLayout!.reference!.hidden = false;
    const shown = renderCanvas({ page });
    expect(shown.container.querySelectorAll(".component-reference")).toHaveLength(1);
    shown.root.unmount();
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
    expect(container.querySelectorAll(".junction-ring")).toHaveLength(0);
    for (const dot of container.querySelectorAll(".junction-dot")) {
      expect(dot.getAttribute("r")).toBe("3.2");
    }
    root.unmount();
  });

  it("renders the junction halo only for the selected junction", () => {
    const page = createEmptyPage("Junction halo");
    const junction = addTestJunction(
      page,
      "net_1",
      "junction_1",
      100,
      100,
    );
    const { container, root } = renderCanvas({
      page,
      selection: [{ kind: "junction", id: junctionSelectionId(junction) }],
    });
    const rings = container.querySelectorAll(".junction-ring");
    expect(rings).toHaveLength(1);
    expect(rings[0]?.getAttribute("r")).toBe("5.5");
    root.unmount();
  });

  it("applies the owning Net color to its junction", () => {
    const page = createEmptyPage("Colored junction");
    addTestNet(page, "net_color", "VOUT").color = "#0f766e";
    addTestJunction(page, "net_color", "junction_color", 100, 100);
    const { container, root } = renderCanvas({ page });
    expect(
      container
        .querySelector<SVGGElement>(".junction")!
        .style.getPropertyValue("--junction-color"),
    ).toBe("#0f766e");
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
          onDuplicateNode={vi.fn()}
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
          onReorderObjects={vi.fn()}
          onDuplicateSelection={vi.fn()}
          onDeleteSelection={vi.fn()}
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

  it("shows duplicate preview before the placing click in duplicate mode", async () => {
    const onDuplicateNode = vi.fn();
    const page = createEmptyPage("Duplicate mode");
    addResistor(page, "r1", 100, 100);
    const { container, root } = renderCanvas({
      page,
      tool: "duplicate",
      selection: [{ kind: "node", id: "r1" }],
      onDuplicateNode,
    });
    const svg = container.querySelector<SVGSVGElement>("svg.schematic-canvas")!;
    flushSync(() => svg.dispatchEvent(pointerEvent("pointermove", 160, 140)));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container.querySelectorAll(".is-duplicate-preview")).toHaveLength(0);
    const node = container.querySelector<SVGElement>('[data-node-id="r1"]')!;
    flushSync(() => node.dispatchEvent(pointerEvent("pointerdown", 100, 100)));
    await new Promise((resolve) => setTimeout(resolve, 0));
    flushSync(() => svg.dispatchEvent(pointerEvent("pointermove", 160, 140)));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container.querySelectorAll(".is-duplicate-preview")).toHaveLength(1);
    expect(onDuplicateNode).not.toHaveBeenCalled();
    flushSync(() => svg.dispatchEvent(pointerEvent("pointerdown", 160, 140)));
    expect(onDuplicateNode).toHaveBeenCalledWith(
      "r1",
      { x: 60, y: 40 },
      0,
    );
    root.unmount();
  });

  it("arms duplicate preview from a device click when nothing is selected", () => {
    const onDuplicateNode = vi.fn();
    const page = createEmptyPage("Arm duplicate");
    addResistor(page, "r1", 100, 100);
    const { container, root } = renderCanvas({
      page,
      tool: "duplicate",
      onDuplicateNode,
    });
    const node = container.querySelector<SVGElement>('[data-node-id="r1"]')!;
    flushSync(() => node.dispatchEvent(pointerEvent("pointerdown", 100, 100)));
    expect(onDuplicateNode).not.toHaveBeenCalled();
    root.unmount();
  });

  it("duplicates instead of moving when Ctrl-dragging a device", () => {
    const onDuplicateNode = vi.fn();
    const onMoveSelected = vi.fn();
    const page = createEmptyPage("Ctrl drag duplicate");
    addResistor(page, "r1", 100, 100);
    const { container, root } = renderCanvas({
      page,
      onDuplicateNode,
      onMoveSelected,
    });
    const svg = container.querySelector<SVGSVGElement>("svg.schematic-canvas")!;
    const node = container.querySelector<SVGElement>('[data-node-id="r1"]')!;
    flushSync(() =>
      node.dispatchEvent(pointerEvent("pointerdown", 100, 100, { ctrlKey: true })),
    );
    flushSync(() => svg.dispatchEvent(pointerEvent("pointermove", 150, 140, { ctrlKey: true })));
    expect(container.querySelectorAll(".component-node")).toHaveLength(2);
    expect(container.querySelector(".is-duplicate-preview")).not.toBeNull();
    flushSync(() => svg.dispatchEvent(pointerEvent("pointerup", 150, 140, { ctrlKey: true })));
    expect(onDuplicateNode).toHaveBeenCalledWith(
      "r1",
      { x: 50, y: 40 },
      0,
    );
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
    expect(handles).toHaveLength(8);
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
  it("renders multi-line text and net labels with their net color", () => {
    const page = createEmptyPage("Styled labels");
    addTestNet(page, "net_vout", "VOUT").color = "#0f766e";
    addTestWire(
      page,
      "net_vout",
      "wire_vout",
      [
        { x: 100, y: 100 },
        { x: 200, y: 100 },
      ],
    );
    page.annotations.push({
      id: "text_1",
      kind: "text",
      text: "Line one\nLine two",
      x: 40,
      y: 200,
      size: 18,
      color: "#b42318",
      align: "middle",
      bold: true,
      italic: true,
      rotation: 90,
    });
    page.annotations.push({
      id: "net_1",
      kind: "net",
      text: "VOUT",
      x: 100,
      y: 92,
      size: 14,
      wireId: "wire_vout",
      netId: "net_vout",
    });
    const { container, root } = renderCanvas({ page });
    const text = container.querySelector<SVGTextElement>(".annotation-text")!;
    expect(text.children).toHaveLength(2);
    expect(text.getAttribute("text-anchor")).toBe("middle");
    expect(text.getAttribute("font-weight")).toBe("700");
    expect(text.getAttribute("font-style")).toBe("italic");
    expect(text.getAttribute("transform")).toBe("rotate(90 40 200)");
    expect(text.style.getPropertyValue("--annotation-color")).toBe("#b42318");
    const net = container.querySelector<SVGTextElement>(".annotation-net")!;
    expect(net.textContent).toBe("VOUT");
    expect(net.textContent).not.toContain("⌁");
    expect(net.style.getPropertyValue("--annotation-color")).toBe("#0f766e");
    root.unmount();
  });

  it("renders partial rich text formatting in annotations and notes", () => {
    const page = createEmptyPage("Rich text rendering");
    page.annotations.push({
      id: "text_rich",
      kind: "text",
      text: "Bold and italic",
      x: 40,
      y: 200,
      size: 18,
      richText: [
        { text: "Bold", bold: true, italic: false, script: "normal" },
        { text: " and ", bold: false, italic: false, script: "normal" },
        { text: "italic", bold: false, italic: true, script: "normal" },
      ],
    });
    page.shapes.push({
      id: "note_rich",
      kind: "note",
      x: 40,
      y: 300,
      width: 240,
      height: 130,
      rotation: 0,
      stroke: "#b98433",
      fill: "#f2c777",
      text: "Heading\nBody",
      textSize: 13,
      richText: [
        { text: "Heading\n", bold: true, italic: false, script: "normal" },
        { text: "Body", bold: false, italic: true, script: "normal" },
      ],
    });
    const { container, root } = renderCanvas({ page });
    const annotation = container.querySelector(".annotation-text")!;
    expect(annotation.textContent).toBe("Bold and italic");
    expect(
      annotation.querySelector('tspan[font-weight="700"]')?.textContent,
    ).toBe("Bold");
    expect(
      annotation.querySelector('tspan[font-style="italic"]')?.textContent,
    ).toBe("italic");

    const note = container.querySelector(".note-text")!;
    expect(note.textContent).toBe("HeadingBody");
    expect(
      note.querySelector('tspan[font-weight="700"]')?.textContent,
    ).toBe("Heading");
    expect(
      note.querySelector('tspan[font-style="italic"]')?.textContent,
    ).toBe("Body");
    root.unmount();
  });

  it("renders shape stroke, dash, opacity, and text styling", () => {
    const page = createEmptyPage("Styled shape");
    page.shapes.push({
      id: "shape_styled",
      kind: "rectangle",
      x: 40,
      y: 50,
      width: 120,
      height: 70,
      rotation: 0,
      stroke: "#0f766e",
      fill: "#ffffff",
      strokeWidth: 3,
      dash: "dotted",
      opacity: 0.5,
      fillOpacity: 0.4,
      text: "Note\nline",
      textSize: 18,
      textColor: "#1d4ed8",
      textAlign: "start",
      textBold: false,
    });
    const { container, root } = renderCanvas({
      page,
      selection: [{ kind: "shape", id: "shape_styled" }],
    });
    const body = container.querySelector(".shape-body")!;
    expect(body.getAttribute("stroke-width")).toBe("3");
    expect(body.getAttribute("stroke-dasharray")).toBe("2 4");
    expect(body.getAttribute("fill")).toBe("#ffffff");
    expect(body.getAttribute("opacity")).toBe("0.5");
    expect(body.getAttribute("fill-opacity")).toBe("0.4");
    const text = container.querySelector<SVGTextElement>(".shape-text")!;
    expect(text.children).toHaveLength(2);
    expect(text.getAttribute("fill")).toBe("#1d4ed8");
    expect(text.getAttribute("font-size")).toBe("18");
    expect(text.getAttribute("text-anchor")).toBe("start");
    expect(text.getAttribute("font-weight")).toBe("400");
    root.unmount();
  });

  it("resizes shapes with shift aspect ratio and alt center modifiers", async () => {
    const onUpdateShape = vi.fn();
    const page = createEmptyPage("Shape modifiers");
    page.shapes.push({
      id: "shape_mod",
      kind: "rectangle",
      x: 40,
      y: 50,
      width: 120,
      height: 70,
      rotation: 0,
      stroke: "#263d48",
      fill: "transparent",
    });
    const { container, root } = renderCanvas({
      page,
      selection: [{ kind: "shape", id: "shape_mod" }],
      onUpdateShape,
    });
    const southeast = container.querySelector(".shape-resize-se")!;
    flushSync(() =>
      southeast.dispatchEvent(pointerEvent("pointerdown", 160, 120, { shiftKey: true })),
    );
    flushSync(() =>
      southeast.dispatchEvent(pointerEvent("pointermove", 180, 125, { shiftKey: true })),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    flushSync(() =>
      southeast.dispatchEvent(pointerEvent("pointerup", 180, 125, { shiftKey: true })),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    const ratioPatch = onUpdateShape.mock.calls.at(-1)?.[1] as {
      width: number;
      height: number;
    };
    expect(ratioPatch.width).toBe(140);
    expect(ratioPatch.height).toBeCloseTo((70 * 140) / 120, 4);

    onUpdateShape.mockClear();
    flushSync(() =>
      southeast.dispatchEvent(pointerEvent("pointerdown", 160, 120, { altKey: true })),
    );
    flushSync(() =>
      southeast.dispatchEvent(pointerEvent("pointermove", 180, 130, { altKey: true })),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    flushSync(() =>
      southeast.dispatchEvent(pointerEvent("pointerup", 180, 130, { altKey: true })),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onUpdateShape).toHaveBeenCalledWith("shape_mod", {
      x: 20,
      y: 40,
      width: 160,
      height: 90,
    });
    root.unmount();
  });

  it("opens the inline editor for a newly created text annotation", async () => {
    const page = createEmptyPage("Fresh text");
    page.annotations.push({
      id: "label_new",
      kind: "text",
      text: "Text",
      x: 60,
      y: 90,
      size: 16,
    });
    const onInitialEditConsumed = vi.fn();
    const { container, root } = renderCanvas({
      page,
      selection: [{ kind: "annotation", id: "label_new" }],
      initialEditAnnotationId: "label_new",
      onInitialEditConsumed,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onInitialEditConsumed).toHaveBeenCalled();
    const editor = container.querySelector(
      '[aria-label="Editable text annotation"]',
    );
    expect(editor).not.toBeNull();
    expect(editor?.textContent).toBe("Text");
    root.unmount();
  });

  it("draws square shapes with shift and centered shapes with alt", async () => {
    const onAddShape = vi.fn();
    const { container, root } = renderCanvas({
      tool: "rectangle",
      onAddShape,
    });
    const svg = container.querySelector<SVGSVGElement>("svg.schematic-canvas")!;
    flushSync(() =>
      svg.dispatchEvent(pointerEvent("pointerdown", 100, 100, { shiftKey: true })),
    );
    flushSync(() =>
      svg.dispatchEvent(pointerEvent("pointermove", 180, 140, { shiftKey: true })),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    flushSync(() =>
      svg.dispatchEvent(pointerEvent("pointerup", 180, 140, { shiftKey: true })),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onAddShape).toHaveBeenCalledWith("rectangle", {
      x: 100,
      y: 100,
      width: 80,
      height: 80,
    });

    onAddShape.mockClear();
    flushSync(() =>
      svg.dispatchEvent(pointerEvent("pointerdown", 100, 100, { altKey: true })),
    );
    flushSync(() =>
      svg.dispatchEvent(pointerEvent("pointermove", 140, 120, { altKey: true })),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    flushSync(() =>
      svg.dispatchEvent(pointerEvent("pointerup", 140, 120, { altKey: true })),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onAddShape).toHaveBeenCalledWith("rectangle", {
      x: 60,
      y: 80,
      width: 80,
      height: 40,
    });
    root.unmount();
  });


  it("renders block notes with a header, heading, and translucent fill", () => {
    const page = createEmptyPage("Notes");
    page.shapes.push({
      id: "note_1",
      kind: "note",
      x: 20,
      y: 30,
      width: 240,
      height: 120,
      rotation: 0,
      stroke: "#b98433",
      fill: "#f2c777",
      strokeWidth: 1.5,
      dash: "solid",
      opacity: 1,
      fillOpacity: 0.22,
      text: "Gain stage\nSets closed-loop gain",
      textSize: 13,
      textColor: "#6b4d20",
      textAlign: "start",
      textBold: false,
    });
    const { container, root } = renderCanvas({
      page,
      selection: [{ kind: "shape", id: "note_1" }],
    });
    expect(container.querySelector(".note-body")).not.toBeNull();
    expect(container.querySelector(".note-tag")).toBeNull();
    const text = container.querySelector(".note-text")!;
    expect(text.children).toHaveLength(2);
    expect(text.textContent).toContain("Gain stage");
    expect(text.textContent).toContain("Sets closed-loop gain");
    const body = container.querySelector(".note-body")!;
    expect(body.getAttribute("fill-opacity")).toBe("0.22");
    expect(container.querySelectorAll(".shape-resize-handle")).toHaveLength(8);
    root.unmount();
  });

  it("opens an object menu on right-click, selects the hit object, and runs actions", () => {
    const page = createEmptyPage("Context menu");
    page.nodes.push({
      id: "r1",
      symbolId: "resistor",
      reference: "R1",
      value: "1k",
      x: 100,
      y: 100,
      rotation: 0,
      mirrored: false,
    });
    const onSelectionChange = vi.fn();
    const onDeleteSelection = vi.fn();
    const { container, root } = renderCanvas({
      page,
      onSelectionChange,
      onDeleteSelection,
    });
    const node = container.querySelector<SVGElement>('[data-node-id="r1"]')!;
    flushSync(() =>
      node.dispatchEvent(pointerEvent("pointerdown", 100, 100, { button: 2 })),
    );
    flushSync(() =>
      node.dispatchEvent(pointerEvent("pointerup", 100, 100, { button: 2 })),
    );
    expect(onSelectionChange).toHaveBeenCalledWith([{ kind: "node", id: "r1" }]);
    const menu = container.querySelector('[role="menu"]');
    expect(menu).not.toBeNull();
    const front = [...container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
      (candidate) => candidate.textContent === "Bring to front",
    );
    expect(front?.disabled).toBe(true);
    const item = [...container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
      (candidate) => candidate.textContent === "Delete",
    );
    flushSync(() => item!.click());
    expect(onDeleteSelection).toHaveBeenCalledOnce();
    root.unmount();
    container.remove();
  });

  it("stays closed after a right-button drag over an object", () => {
    const page = createEmptyPage("Context drag");
    page.nodes.push({
      id: "r1",
      symbolId: "resistor",
      reference: "R1",
      value: "1k",
      x: 100,
      y: 100,
      rotation: 0,
      mirrored: false,
    });
    const { container, root } = renderCanvas({ page });
    const node = container.querySelector<SVGElement>('[data-node-id="r1"]')!;
    flushSync(() =>
      node.dispatchEvent(pointerEvent("pointerdown", 100, 100, { button: 2 })),
    );
    flushSync(() =>
      node.dispatchEvent(pointerEvent("pointermove", 160, 100, { button: 2 })),
    );
    flushSync(() =>
      node.dispatchEvent(pointerEvent("pointerup", 160, 100, { button: 2 })),
    );
    expect(container.querySelector('[role="menu"]')).toBeNull();
    root.unmount();
    container.remove();
  });

  it("applies a quick colour combination from the object menu", () => {
    const page = createEmptyPage("Context palette");
    page.shapes.push({
      id: "shape_1",
      kind: "rectangle",
      x: 40,
      y: 40,
      width: 120,
      height: 60,
      rotation: 0,
      stroke: "#263d48",
      fill: "#ffffff",
    });
    const onUpdateShape = vi.fn();
    const { container, root } = renderCanvas({
      page,
      selection: [{ kind: "shape", id: "shape_1" }],
      onUpdateShape,
    });
    const shape = container.querySelector<SVGElement>('[data-shape-id="shape_1"]')!;
    flushSync(() =>
      shape.dispatchEvent(pointerEvent("pointerdown", 60, 60, { button: 2 })),
    );
    flushSync(() =>
      shape.dispatchEvent(pointerEvent("pointerup", 60, 60, { button: 2 })),
    );
    const swatch = container.querySelector<HTMLButtonElement>(
      '.context-menu [aria-label="Note"]',
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

  it("paints objects in the stored stacking order", () => {
    const page = createEmptyPage("Stacking");
    page.nodes.push({
      id: "node_1",
      symbolId: "resistor",
      reference: "R1",
      value: "1k",
      x: 100,
      y: 100,
      rotation: 0,
      mirrored: false,
    });
    page.shapes.push({
      id: "note_1",
      kind: "note",
      x: 60,
      y: 60,
      width: 220,
      height: 140,
      rotation: 0,
      stroke: "#b98433",
      fill: "#f2c777",
      text: "Note",
    });

    const above = renderCanvas({ page });
    const aboveOrder = Array.from(
      above.container.querySelectorAll(".note-body, .component-node"),
    );
    expect(aboveOrder[0]?.classList.contains("component-node")).toBe(true);
    above.root.unmount();
    above.container.remove();

    const behind = renderCanvas({
      page: { ...page, zOrder: ["note_1", "node_1"] },
    });
    const behindOrder = Array.from(
      behind.container.querySelectorAll(".note-body, .component-node"),
    );
    expect(behindOrder[0]?.classList.contains("note-body")).toBe(true);
    behind.root.unmount();
    behind.container.remove();
  });


  it("creates a default-size note on a simple click and can start over a wire", async () => {
    const onAddShape = vi.fn();
    const page = createEmptyPage("Note creation");
    addTestNet(page, "net_note", "N1");
    addTestWire(
      page,
      "net_note",
      "wire_note",
      [
        { x: 100, y: 100 },
        { x: 400, y: 100 },
      ],
    );
    const { container, root } = renderCanvas({
      page,
      tool: "note",
      onAddShape,
    });
    const svg = container.querySelector<SVGSVGElement>("svg.schematic-canvas")!;
    flushSync(() => svg.dispatchEvent(pointerEvent("pointerdown", 120, 120)));
    flushSync(() => svg.dispatchEvent(pointerEvent("pointerup", 120, 120)));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onAddShape).toHaveBeenCalledWith("note", {
      x: 120,
      y: 120,
      width: 240,
      height: 100,
    });

    onAddShape.mockClear();
    const wire = container.querySelector(".wire-hit")!;
    flushSync(() => wire.dispatchEvent(pointerEvent("pointerdown", 200, 100)));
    flushSync(() => wire.dispatchEvent(pointerEvent("pointermove", 320, 180)));
    await new Promise((resolve) => setTimeout(resolve, 0));
    flushSync(() => wire.dispatchEvent(pointerEvent("pointerup", 320, 180)));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onAddShape).toHaveBeenCalledWith("note", {
      x: 200,
      y: 100,
      width: 120,
      height: 80,
    });
    root.unmount();
  });


  it("drags note text freely inside the note frame", async () => {
    const onUpdateShape = vi.fn();
    const page = createEmptyPage("Note text drag");
    page.shapes.push({
      id: "note_1",
      kind: "note",
      x: 20,
      y: 30,
      width: 240,
      height: 140,
      rotation: 0,
      stroke: "#b98433",
      fill: "#f2c777",
      strokeWidth: 1.5,
      dash: "solid",
      opacity: 1,
      fillOpacity: 0.22,
      text: "Gain stage\nSets closed-loop gain.",
      textSize: 13,
      textColor: "#6b4d20",
      textAlign: "start",
      textBold: false,
    });
    const { container, root } = renderCanvas({
      page,
      selection: [{ kind: "shape", id: "note_1" }],
      onUpdateShape,
    });
    const text = container.querySelector(".note-text")!;
    flushSync(() => text.dispatchEvent(pointerEvent("pointerdown", 60, 70)));
    flushSync(() => text.dispatchEvent(pointerEvent("pointermove", 80, 90)));
    await new Promise((resolve) => setTimeout(resolve, 0));
    flushSync(() => text.dispatchEvent(pointerEvent("pointerup", 80, 90)));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onUpdateShape).toHaveBeenCalledWith("note_1", {
      textOffset: { x: 20, y: 20 },
    });
    root.unmount();
  });


  it("finishes note editing on the next canvas click instead of creating another note", async () => {
    const page = createEmptyPage("Note finish");
    page.shapes.push({
      id: "note_1",
      kind: "note",
      x: 40,
      y: 50,
      width: 240,
      height: 120,
      rotation: 0,
      stroke: "#b98433",
      fill: "#f2c777",
      strokeWidth: 1.5,
      dash: "solid",
      opacity: 1,
      fillOpacity: 0.22,
      text: "Gain stage",
      textSize: 13,
      textColor: "#6b4d20",
      textAlign: "start",
      textBold: false,
    });
    const onAddShape = vi.fn();
    const onNoteEditingFinished = vi.fn();
    const { container, root } = renderCanvas({
      page,
      tool: "note",
      selection: [{ kind: "shape", id: "note_1" }],
      initialEditShapeId: "note_1",
      onNoteEditingFinished,
      onAddShape,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(
      container.querySelector('[aria-label="Editable note text"]'),
    ).not.toBeNull();
    const svg = container.querySelector<SVGSVGElement>("svg.schematic-canvas")!;
    await new Promise((resolve) => setTimeout(resolve, 20));
    flushSync(() => svg.dispatchEvent(pointerEvent("pointerdown", 500, 400)));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onNoteEditingFinished).toHaveBeenCalled();
    expect(onAddShape).not.toHaveBeenCalled();
    root.unmount();
  });

  it("finishes text editing on the next canvas click instead of creating another text", async () => {
    const page = createEmptyPage("Text finish");
    page.annotations.push({
      id: "text_1",
      kind: "text",
      text: "Hello",
      x: 120,
      y: 140,
      size: 16,
    });
    const onAddAnnotation = vi.fn();
    const onTextEditingFinished = vi.fn();
    const { container, root } = renderCanvas({
      page,
      tool: "text",
      selection: [{ kind: "annotation", id: "text_1" }],
      initialEditAnnotationId: "text_1",
      onTextEditingFinished,
      onAddAnnotation,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(
      container.querySelector('[aria-label="Editable text annotation"]'),
    ).not.toBeNull();
    const svg = container.querySelector<SVGSVGElement>("svg.schematic-canvas")!;
    flushSync(() => svg.dispatchEvent(pointerEvent("pointerdown", 500, 400)));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onTextEditingFinished).toHaveBeenCalled();
    expect(onAddAnnotation).not.toHaveBeenCalled();
    root.unmount();
  });
});
