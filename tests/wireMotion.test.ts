import { describe, expect, it } from "vitest";
import { moveNodes, updateWirePoints } from "../src/core/editor";
import {
  allJunctions,
  createDocument,
  createEmptyPage,
  pageById,
  type DrawingPage,
  type SymbolDefinition,
} from "../src/core/model";
import {
  planNodeMirror,
  planNodeMove,
  planNodeRotation,
  resolveWirePoints,
} from "../src/core/wireMotion";
import {
  addTestJunction,
  addTestWire,
  wireInPage,
} from "./fixtures";

const horizontalSymbol: SymbolDefinition = {
  id: "horizontal-test",
  label: "Horizontal Test",
  category: "test",
  electrical: true,
  palette: true,
  frame: { x: -20, y: -10, width: 40, height: 20 },
  pins: [
    { key: "L", role: "passive", side: "west" },
    { key: "R", role: "passive", side: "east" },
  ],
  file: "horizontal-test.svg",
  svgBody: '<line x1="-20" y1="0" x2="20" y2="0" stroke="#000"/>',
};

const library = [horizontalSymbol];

function addNode(page: DrawingPage, id: string, x: number): void {
  page.nodes.push({
    id,
    symbolId: horizontalSymbol.id,
    reference: id.toUpperCase(),
    value: "1",
    x,
    y: 100,
    rotation: 0,
    mirrored: false,
  });
}

function boundaryPage(): DrawingPage {
  const page = createEmptyPage("Boundary");
  addNode(page, "left", 100);
  addNode(page, "right", 300);
  addTestWire(
    page,
    "net_1",
    "wire_boundary",
    [
      { x: 120, y: 100 },
      { x: 200, y: 100 },
      { x: 200, y: 160 },
      { x: 280, y: 160 },
      { x: 280, y: 100 },
    ],
    { kind: "pin", deviceId: "left", pinId: "R" },
    { kind: "pin", deviceId: "right", pinId: "L" },
  );
  return page;
}

describe("wire movement plans", () => {
  it("stretches only the moving end of a boundary wire", () => {
    const moved = planNodeMove(
      boundaryPage(),
      library,
      new Set(["left"]),
      { x: 20, y: 30 },
    );
    const wire = wireInPage(moved, "wire_boundary")!;
    expect(wire.points[0]).toEqual({ x: 140, y: 130 });
    expect(wire.points.at(-1)).toEqual({ x: 280, y: 100 });
    expect(wire.points.slice(2, 4)).toEqual([
      { x: 200, y: 160 },
      { x: 280, y: 160 },
    ]);
  });

  it("translates an internal wire and its internal junction rigidly", () => {
    const page = createEmptyPage("Internal junction");
    addNode(page, "left", 100);
    addNode(page, "right", 300);
    addTestJunction(page, "net_1", "junction_1", 200, 100);
    addTestWire(
      page,
      "net_1",
      "left_edge",
      [
        { x: 120, y: 100 },
        { x: 200, y: 100 },
      ],
      { kind: "pin", deviceId: "left", pinId: "R" },
      { kind: "junction", junctionId: "junction_1" },
    );
    addTestWire(
      page,
      "net_1",
      "right_edge",
      [
        { x: 200, y: 100 },
        { x: 280, y: 100 },
      ],
      { kind: "junction", junctionId: "junction_1" },
      { kind: "pin", deviceId: "right", pinId: "L" },
    );
    addTestWire(
      page,
      "net_1",
      "branch",
      [
        { x: 200, y: 100 },
        { x: 200, y: 160 },
      ],
      { kind: "junction", junctionId: "junction_1" },
      { kind: "open" },
    );
    page.annotations.push({
      id: "label_boundary",
      kind: "net",
      text: "N001",
      x: 200,
      y: 100,
      size: 14,
      wireId: "left_edge",
      netId: "net_1",
    });
    const original = resolveWirePoints(
      page,
      library,
      wireInPage(page, "left_edge")!,
    )!;
    const delta = { x: 40, y: -20 };
    const moved = planNodeMove(
      page,
      library,
      new Set(["left", "right"]),
      delta,
    );
    expect(wireInPage(moved, "left_edge")?.points).toEqual(
      original.map((point) => ({
        x: point.x + delta.x,
        y: point.y + delta.y,
      })),
    );
    expect(allJunctions(moved)[0]?.junction.point).toEqual({ x: 240, y: 80 });
    expect(moved.annotations[0]).toMatchObject({ x: 240, y: 80 });
  });

  it("does not change wires outside the moving device group", () => {
    const page = boundaryPage();
    const external = addTestWire(
      page,
      "net_external",
      "wire_external",
      [
        { x: 20, y: 20 },
        { x: 80, y: 20 },
      ],
    );
    const moved = planNodeMove(
      page,
      library,
      new Set(["left"]),
      { x: 20, y: 30 },
    );
    expect(wireInPage(moved, "wire_external")).toBe(external);
  });

  it("uses the same plan for preview and committed history", () => {
    const page = boundaryPage();
    const document = {
      ...createDocument({ pageId: page.id }),
      pages: [page],
    };
    const preview = planNodeMove(
      page,
      library,
      new Set(["left"]),
      { x: 20, y: 30 },
    );
    const committed = moveNodes(
      document,
      page.id,
      ["left"],
      { x: 20, y: 30 },
      library,
      "2026-10-23T00:00:00.000Z",
    );
    expect(pageById(committed, page.id)).toEqual(preview);
  });

  it("leaves a rotated pin along its new outward direction", () => {
    const page = createEmptyPage("Rotation");
    addNode(page, "left", 100);
    addTestWire(
      page,
      "net_1",
      "wire_rotation",
      [
        { x: 120, y: 100 },
        { x: 240, y: 100 },
      ],
      { kind: "pin", deviceId: "left", pinId: "R" },
    );
    const rotated = planNodeRotation(page, library, new Set(["left"]));
    const points = resolveWirePoints(
      rotated,
      library,
      wireInPage(rotated, "wire_rotation")!,
    )!;
    expect(points[0]).toEqual({ x: 100, y: 120 });
    expect(points[1]?.y).toBeGreaterThan(points[0]!.y);
  });

  it("does not accumulate a wire loop after four single-device rotations", () => {
    const page = boundaryPage();
    const original = wireInPage(page, "wire_boundary")!.points;
    let rotated = page;
    for (let index = 0; index < 4; index += 1) {
      rotated = planNodeRotation(
        rotated,
        library,
        new Set(["left"]),
      );
    }
    const result = wireInPage(rotated, "wire_boundary")!;
    expect(
      result.points.length,
      JSON.stringify(result.points),
    ).toBeLessThanOrEqual(original.length + 2);
    expect(wireInPage(rotated, "wire_boundary")!.points.at(-1)).toEqual(
      original.at(-1),
    );
  });

  it("reapplies the outward escape when a connected endpoint moves", () => {
    const page = createEmptyPage("Manual route");
    addNode(page, "left", 100);
    addTestWire(
      page,
      "net_1",
      "wire_manual",
      [
        { x: 120, y: 100 },
        { x: 120, y: 200 },
      ],
      { kind: "pin", deviceId: "left", pinId: "R" },
    );
    const moved = planNodeMove(
      page,
      library,
      new Set(["left"]),
      { x: 20, y: 20 },
    );
    const points = wireInPage(moved, "wire_manual")!.points;
    expect(points[0]).toEqual({ x: 140, y: 120 });
    expect(points[1]).toEqual({ x: 160, y: 120 });
  });

  it("stores no routing-mode metadata after a segment edit", () => {
    const page = createEmptyPage("Manual edit");
    addNode(page, "left", 100);
    addTestWire(
      page,
      "net_1",
      "wire_edit",
      [
        { x: 120, y: 100 },
        { x: 220, y: 100 },
      ],
      { kind: "pin", deviceId: "left", pinId: "R" },
    );
    const document = {
      ...createDocument({ pageId: page.id }),
      pages: [page],
    };
    const updated = updateWirePoints(
      document,
      page.id,
      "wire_edit",
      [
        { x: 120, y: 100 },
        { x: 120, y: 180 },
        { x: 220, y: 180 },
      ],
      "2026-10-24T00:00:00.000Z",
    );
    expect(wireInPage(pageById(updated, page.id), "wire_edit")).not.toHaveProperty(
      "routeMode",
    );
  });

  it("rigidly transforms an internal net edge", () => {
    const page = boundaryPage();
    const original = resolveWirePoints(
      page,
      library,
      wireInPage(page, "wire_boundary")!,
    )!;
    const segmentLengths = original.slice(1).map((point, index) =>
      Math.hypot(point.x - original[index]!.x, point.y - original[index]!.y),
    );
    for (const transformed of [
      planNodeRotation(page, library, new Set(["left", "right"])),
      planNodeMirror(page, library, new Set(["left", "right"])),
    ]) {
      const points = wireInPage(transformed, "wire_boundary")!.points;
      expect(
        points.slice(1).map((point, index) =>
          Math.hypot(point.x - points[index]!.x, point.y - points[index]!.y),
        ),
      ).toEqual(segmentLengths);
    }
  });

  it("resolves a moved pin without accumulating preview drift", () => {
    const page = boundaryPage();
    const preview = planNodeMove(
      page,
      library,
      new Set(["left"]),
      { x: 20, y: 30 },
    );
    const wire = wireInPage(preview, "wire_boundary")!;
    const resolved = resolveWirePoints(preview, library, wire)!;
    expect(resolved[0]).toEqual({ x: 140, y: 130 });
    expect(resolveWirePoints(preview, library, wire)).toEqual(resolved);
  });
});
