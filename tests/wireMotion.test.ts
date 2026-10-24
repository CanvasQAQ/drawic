import { describe, expect, it } from "vitest";
import { moveNodes, updateWirePoints } from "../src/core/editor";
import {
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
  page.wires.push({
    id: "wire_boundary",
    points: [
      { x: 120, y: 100 },
      { x: 200, y: 100 },
      { x: 200, y: 160 },
      { x: 280, y: 160 },
      { x: 280, y: 100 },
    ],
    startAnchor: { deviceId: "left", pinId: "R" },
    endAnchor: { deviceId: "right", pinId: "L" },
  });
  return page;
}

describe("wire movement plans", () => {
  it("stretches only the moving end of a boundary wire", () => {
    const page = boundaryPage();
    const moved = planNodeMove(
      page,
      library,
      new Set(["left"]),
      { x: 20, y: 30 },
    );
    const wire = moved.wires[0]!;
    expect(wire.points[0]).toEqual({ x: 140, y: 130 });
    expect(wire.points.at(-1)).toEqual({ x: 280, y: 100 });
    expect(wire.points.slice(2, 4)).toEqual([
      { x: 200, y: 160 },
      { x: 280, y: 160 },
    ]);
  });

  it("translates an internal wire and its internal junction without changing shape", () => {
    const page = boundaryPage();
    page.junctions.push({ x: 200, y: 100 });
    page.annotations.push({
      id: "label_boundary",
      kind: "net",
      text: "N001",
      x: 200,
      y: 100,
      size: 14,
      wireId: "wire_boundary",
    });
    const original = resolveWirePoints(page, library, page.wires[0]!)!;
    const delta = { x: 40, y: -20 };
    const moved = planNodeMove(
      page,
      library,
      new Set(["left", "right"]),
      delta,
    );
    expect(moved.wires[0]?.points).toEqual(
      original.map((point) => ({
        x: point.x + delta.x,
        y: point.y + delta.y,
      })),
    );
    expect(moved.junctions).toEqual([{ x: 240, y: 80 }]);
    expect(moved.annotations[0]).toMatchObject({ x: 240, y: 80 });
  });

  it("does not change external wires", () => {
    const page = boundaryPage();
    const external = {
      id: "wire_external",
      points: [
        { x: 20, y: 20 },
        { x: 80, y: 20 },
      ],
    };
    page.wires.push(external);
    const moved = planNodeMove(
      page,
      library,
      new Set(["left"]),
      { x: 20, y: 30 },
    );
    expect(moved.wires.find((wire) => wire.id === "wire_external")).toBe(external);
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
    page.wires.push({
      id: "wire_rotation",
      points: [
        { x: 120, y: 100 },
        { x: 240, y: 100 },
      ],
      startAnchor: { deviceId: "left", pinId: "R" },
    });
    const rotated = planNodeRotation(
      page,
      library,
      new Set(["left"]),
    );
    const points = rotated.wires[0]!.points;
    expect(points[0]).toEqual({ x: 100, y: 120 });
    expect(points[1]?.y).toBeGreaterThan(points[0]!.y);
  });

  it("reapplies the default escape rule when automatic routing runs again", () => {
    const page = createEmptyPage("Manual route");
    addNode(page, "left", 100);
    page.wires.push({
      id: "wire_manual",
      points: [
        { x: 120, y: 100 },
        { x: 120, y: 200 },
      ],
      startAnchor: { deviceId: "left", pinId: "R" },
    });
    const moved = planNodeMove(
      page,
      library,
      new Set(["left"]),
      { x: 20, y: 20 },
    );
    expect(moved.wires[0]?.points[0]).toEqual({ x: 140, y: 120 });
    expect(moved.wires[0]?.points[1]).toEqual({ x: 160, y: 120 });
  });

  it("stores no routing-mode metadata after a segment edit", () => {
    const page = createEmptyPage("Manual edit");
    addNode(page, "left", 100);
    page.wires.push({
      id: "wire_edit",
      points: [
        { x: 120, y: 100 },
        { x: 220, y: 100 },
      ],
      startAnchor: { deviceId: "left", pinId: "R" },
    });
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
    expect(pageById(updated, page.id).wires[0]).not.toHaveProperty(
      "routeMode",
    );
  });

  it("rigidly transforms an internal wire when a device group rotates or mirrors", () => {
    const page = boundaryPage();
    const original = resolveWirePoints(page, library, page.wires[0]!)!;
    const segmentLengths = original.slice(1).map((point, index) =>
      Math.hypot(point.x - original[index]!.x, point.y - original[index]!.y),
    );

    for (const transformed of [
      planNodeRotation(page, library, new Set(["left", "right"])),
      planNodeMirror(page, library, new Set(["left", "right"])),
    ]) {
      const points = transformed.wires[0]!.points;
      expect(
        points.slice(1).map((point, index) =>
          Math.hypot(point.x - points[index]!.x, point.y - points[index]!.y),
        ),
      ).toEqual(segmentLengths);
      for (let index = 1; index < points.length; index += 1) {
        const previous = points[index - 1]!;
        const current = points[index]!;
        expect(previous.x === current.x || previous.y === current.y).toBe(true);
      }
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
    const resolved = resolveWirePoints(preview, library, preview.wires[0]!)!;
    expect(resolved[0]).toEqual({ x: 140, y: 130 });
    expect(resolveWirePoints(preview, library, preview.wires[0]!)).toEqual(
      resolved,
    );
  });
});
