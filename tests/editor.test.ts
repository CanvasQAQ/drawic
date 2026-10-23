import { describe, expect, it } from "vitest";
import { buildConnectivity, pinGraphKey } from "../src/core/connectivity";
import {
  addComponent,
  addWire,
  mirrorSelection,
  moveNodes,
  rotateSelection,
} from "../src/core/editor";
import { createDocument, createEmptyPage, pageById } from "../src/core/model";
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
      "2026-10-23T00:00:06.000Z",
    );
    wire = pageById(document, "page_a").wires[0]!;
    expect(wire.points[0]).toEqual({ x: 80, y: 100 });
  });
});
