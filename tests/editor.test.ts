import { describe, expect, it } from "vitest";
import { buildConnectivity, pinGraphKey } from "../src/core/connectivity";
import {
  addComponent,
  addWire,
  mirrorSelection,
  moveNodes,
  removeSelection,
  renameNet,
  rotateSelection,
  updateNode,
  updateWirePoints,
  updateWireName,
} from "../src/core/editor";
import {
  createDocument,
  createEmptyPage,
  junctionSelectionId,
  pageById,
} from "../src/core/model";
import { addPage } from "../src/core/project";
import { testLibrary, twoPinSymbol } from "./fixtures";

function twoAnchorDocument() {
  let document = createDocument({ pageId: "page_a" });
  document = addPage(document, createEmptyPage("Signals", "page_b"));
  document = addComponent(document, "page_a", {
    symbol: twoPinSymbol,
    reference: "R1",
    value: "1k",
    point: { x: 100, y: 100 },
    id: "r1",
    now: "2026-10-23T00:00:01.000Z",
  });
  document = addComponent(document, "page_a", {
    symbol: twoPinSymbol,
    reference: "R2",
    value: "2k",
    point: { x: 300, y: 220 },
    id: "r2",
    now: "2026-10-23T00:00:02.000Z",
  });
  document = addWire(document, "page_a", {
    id: "w1",
    points: [
      { x: 100, y: 120 },
      { x: 190, y: 120 },
      { x: 190, y: 200 },
      { x: 300, y: 200 },
    ],
    startAnchor: { deviceId: "r1", pinId: "2" },
    endAnchor: { deviceId: "r2", pinId: "1" },
    now: "2026-10-23T00:00:03.000Z",
  });
  return document;
}

describe("page-scoped editing", () => {
  it("keeps independent edits on their selected page", () => {
    const document = twoAnchorDocument();
    expect(pageById(document, "page_a").nodes).toHaveLength(2);
    expect(pageById(document, "page_b").nodes).toHaveLength(0);
  });

  it("connects anchor-backed wire endpoints even when geometry is temporarily displaced", () => {
    let document = twoAnchorDocument();
    const page = pageById(document, "page_a");
    page.wires[0]!.points[0] = { x: 50, y: 50 };
    const connectivity = buildConnectivity(page, testLibrary);
    expect(connectivity.networkIdByPin.get(pinGraphKey("r1", 1))).toBe(
      connectivity.networkIdByWire.get("w1"),
    );
  });

  it("moves attached wire endpoints with a device while preserving orthogonal segments", () => {
    const moved = moveNodes(
      twoAnchorDocument(),
      "page_a",
      ["r1"],
      { x: 20, y: 30 },
      testLibrary,
      "2026-10-23T00:00:04.000Z",
    );
    const page = pageById(moved, "page_a");
    expect(page.nodes.find((node) => node.id === "r1")).toMatchObject({ x: 120, y: 130 });
    expect(page.wires[0]?.points[0]).toEqual({ x: 120, y: 150 });
    for (let index = 1; index < (page.wires[0]?.points.length ?? 0); index += 1) {
      const previous = page.wires[0]!.points[index - 1]!;
      const current = page.wires[0]!.points[index]!;
      expect(previous.x === current.x || previous.y === current.y).toBe(true);
    }
  });

  it("keeps anchored wire endpoints on their pins through rotation and mirroring", () => {
    let document = twoAnchorDocument();
    document = rotateSelection(
      document,
      "page_a",
      [{ kind: "node", id: "r1" }],
      testLibrary,
      "2026-10-23T00:00:05.000Z",
    );
    let wire = pageById(document, "page_a").wires[0]!;
    expect(wire.points[0]).toEqual({ x: 80, y: 100 });
    for (let index = 1; index < wire.points.length; index += 1) {
      const previous = wire.points[index - 1]!;
      const current = wire.points[index]!;
      expect(previous.x === current.x || previous.y === current.y).toBe(true);
    }

    document = mirrorSelection(
      document,
      "page_a",
      [{ kind: "node", id: "r1" }],
      testLibrary,
      "2026-10-23T00:00:06.000Z",
    );
    wire = pageById(document, "page_a").wires[0]!;
    expect(wire.points[0]).toEqual({ x: 80, y: 100 });
  });

  it("moves connected wires when device coordinates are edited directly", () => {
    const moved = updateNode(
      twoAnchorDocument(),
      "page_a",
      "r1",
      { x: 120, y: 130 },
      testLibrary,
      "2026-10-23T00:00:07.000Z",
    );
    const wire = pageById(moved, "page_a").wires[0]!;
    expect(wire.points[0]).toEqual({ x: 120, y: 150 });
    for (let index = 1; index < wire.points.length; index += 1) {
      const previous = wire.points[index - 1]!;
      const current = wire.points[index]!;
      expect(previous.x === current.x || previous.y === current.y).toBe(true);
    }
  });

  it("commits explicit junctions with a newly drawn branch wire", () => {
    let document = createDocument({ pageId: "page_branch" });
    document = addWire(document, "page_branch", {
      id: "wire_branch",
      name: "N001",
      points: [
        { x: 100, y: 100 },
        { x: 100, y: 180 },
      ],
      junctionPoints: [{ x: 100, y: 100 }],
      now: "2026-10-24T00:00:00.000Z",
    });
    const page = pageById(document, "page_branch");
    expect(page.wires[0]?.name).toBe("N001");
    expect(page.junctions).toEqual([{ x: 100, y: 100 }]);
  });

  it("keeps an attached net label in sync when the wire is renamed", () => {
    let document = createDocument({ pageId: "page_rename_wire" });
    document = addWire(document, "page_rename_wire", {
      id: "wire_rename",
      name: "N001",
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    });
    document = {
      ...document,
      pages: document.pages.map((page) => ({
        ...page,
        annotations: [
          {
            id: "label_n001",
            kind: "net",
            text: "N001",
            x: 20,
            y: 0,
            size: 14,
            wireId: "wire_rename",
          },
        ],
      })),
    };
    const renamed = updateWireName(
      document,
      "page_rename_wire",
      "wire_rename",
      "VOUT",
      "2026-10-24T00:00:00.000Z",
    );
    const page = pageById(renamed, "page_rename_wire");
    expect(page.wires[0]?.name).toBe("VOUT");
    expect(page.annotations[0]?.text).toBe("VOUT");
  });

  it("renames every wire and label in one connected net", () => {
    let document = createDocument({ pageId: "page_rename_net" });
    document = addWire(document, "page_rename_net", {
      id: "a",
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    });
    document = addWire(document, "page_rename_net", {
      id: "b",
      points: [
        { x: 100, y: 0 },
        { x: 100, y: 80 },
      ],
    });
    document = {
      ...document,
      pages: document.pages.map((page) => ({
        ...page,
        annotations: [
          {
            id: "label_a",
            kind: "net",
            text: "N001",
            x: 20,
            y: 0,
            size: 14,
            wireId: "a",
          },
        ],
      })),
    };
    const renamed = renameNet(
      document,
      "page_rename_net",
      ["a", "b"],
      ["label_a"],
      "CLOCK",
      "2026-10-24T00:00:00.000Z",
    );
    const page = pageById(renamed, "page_rename_net");
    expect(page.wires.map((wire) => wire.name)).toEqual(["CLOCK", "CLOCK"]);
    expect(page.annotations[0]?.text).toBe("CLOCK");
  });

  it("deletes a standalone explicit junction", () => {
    let document = createDocument({ pageId: "page_junction_delete" });
    const point = { x: 80, y: 120 };
    document = {
      ...document,
      pages: document.pages.map((page) => ({
        ...page,
        junctions: [point],
      })),
    };
    const deleted = removeSelection(
      document,
      "page_junction_delete",
      [{ kind: "junction", id: junctionSelectionId(point) }],
      "2026-10-24T00:00:00.000Z",
    );
    expect(pageById(deleted, "page_junction_delete").junctions).toEqual([]);
  });

  it("moves a junction and its connected branch when a wire segment is edited", () => {
    let document = createDocument({ pageId: "page_junction_move" });
    document = addWire(document, "page_junction_move", {
      id: "through",
      points: [
        { x: 0, y: 100 },
        { x: 200, y: 100 },
      ],
    });
    document = addWire(document, "page_junction_move", {
      id: "branch",
      points: [
        { x: 100, y: 100 },
        { x: 100, y: 180 },
      ],
    });
    document = {
      ...document,
      pages: document.pages.map((page) => ({
        ...page,
        junctions: [{ x: 100, y: 100 }],
      })),
    };
    const moved = updateWirePoints(
      document,
      "page_junction_move",
      "through",
      [
        { x: 0, y: 120 },
        { x: 200, y: 120 },
      ],
      "2026-10-24T00:00:00.000Z",
    );
    const page = pageById(moved, "page_junction_move");
    expect(page.junctions).toEqual([{ x: 100, y: 120 }]);
    expect(page.wires.find((wire) => wire.id === "branch")?.points[0]).toEqual({
      x: 100,
      y: 120,
    });
    const connectivity = buildConnectivity(page, testLibrary);
    expect(connectivity.networkIdByWire.get("through")).toBe(
      connectivity.networkIdByWire.get("branch"),
    );
  });
});
