import { describe, expect, it } from "vitest";
import { buildConnectivity, pinGraphKey } from "../src/core/connectivity";
import { resolveWirePoints } from "../src/core/wireMotion";
import {
  addAnnotation,
  addComponent,
  addShape,
  addWire,
  duplicateNode,
  mirrorSelection,
  moveNodes,
  removeSelection,
  renameNet,
  reorderShape,
  rotateSelection,
  updateAnnotation,
  updateNode,
  updateNodeLabel,
  updateShape,
  updateWirePoints,
  updateNetColorForWire,
  updateNetNameForWire,
} from "../src/core/editor";
import {
  allJunctions,
  allWires,
  createDocument,
  createEmptyPage,
  findWire,
  junctionSelectionId,
  pageById,
} from "../src/core/model";
import { addPage } from "../src/core/project";
import {
  addTestJunction,
  addTestNet,
  addTestWire,
  allTestWires,
  testLibrary,
  twoPinSymbol,
  wireInPage,
} from "./fixtures";

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

describe("page-scoped net editing", () => {
  it("keeps independent edits on their selected page", () => {
    const document = twoAnchorDocument();
    expect(pageById(document, "page_a").nodes).toHaveLength(2);
    expect(pageById(document, "page_b").nodes).toHaveLength(0);
  });

  it("duplicates a device with a new ID, unique Reference, and shifted labels", () => {
    let document = createDocument({ pageId: "page_duplicate_node" });
    document = addComponent(document, "page_duplicate_node", {
      symbol: twoPinSymbol,
      reference: "R1",
      value: "1k",
      point: { x: 100, y: 100 },
      id: "r1",
      library: testLibrary,
    });
    document = updateNodeLabel(
      document,
      "page_duplicate_node",
      "r1",
      "reference",
      { color: "#1d4ed8", fontStyle: "italic" },
      testLibrary,
    );
    const sourceLabel = pageById(document, "page_duplicate_node").nodes[0]!
      .labelLayout!.reference!.position!;
    document = duplicateNode(
      document,
      "page_duplicate_node",
      "r1",
      { x: 30, y: 20 },
      testLibrary,
      "r2",
      "2026-10-25T00:00:00.000Z",
    );
    const duplicate = pageById(document, "page_duplicate_node").nodes[1]!;
    expect(duplicate).toMatchObject({
      id: "r2",
      reference: "R2",
      value: "1k",
      x: 130,
      y: 120,
    });
    expect(duplicate.labelLayout?.reference?.position).toEqual({
      x: sourceLabel.x + 30,
      y: sourceLabel.y + 20,
    });
    expect(duplicate.labelLayout?.reference).toMatchObject({
      color: "#1d4ed8",
      fontStyle: "italic",
    });
  });

  it("connects pin endpoint references even when stored geometry is displaced", () => {
    const document = twoAnchorDocument();
    const page = pageById(document, "page_a");
    findWire(page, "w1")!.wire.points[0] = { x: 50, y: 50 };
    const connectivity = buildConnectivity(page, testLibrary);
    expect(connectivity.networkIdByPin.get(pinGraphKey("r1", 1))).toBe(
      connectivity.networkIdByWire.get("w1"),
    );
  });

  it("moves attached wire endpoints with a device while preserving orthogonality", () => {
    const moved = moveNodes(
      twoAnchorDocument(),
      "page_a",
      ["r1"],
      { x: 20, y: 30 },
      testLibrary,
      "2026-10-23T00:00:04.000Z",
    );
    const page = pageById(moved, "page_a");
    const wire = wireInPage(page, "w1")!;
    expect(page.nodes.find((node) => node.id === "r1")).toMatchObject({
      x: 120,
      y: 130,
    });
    expect(wire.points[0]).toEqual({ x: 120, y: 150 });
    for (let index = 1; index < wire.points.length; index += 1) {
      const previous = wire.points[index - 1]!;
      const current = wire.points[index]!;
      expect(previous.x === current.x || previous.y === current.y).toBe(true);
    }
  });

  it("keeps pin endpoint references through rotation and mirroring", () => {
    let document = twoAnchorDocument();
    document = rotateSelection(
      document,
      "page_a",
      [{ kind: "node", id: "r1" }],
      testLibrary,
      "2026-10-23T00:00:05.000Z",
    );
    let wire = findWire(pageById(document, "page_a"), "w1")!.wire;
    expect(
      resolveWirePoints(pageById(document, "page_a"), testLibrary, wire)![0],
    ).toEqual({ x: 80, y: 100 });
    expect(wire.start).toEqual({ kind: "pin", deviceId: "r1", pinId: "2" });

    document = mirrorSelection(
      document,
      "page_a",
      [{ kind: "node", id: "r1" }],
      testLibrary,
      "2026-10-23T00:00:06.000Z",
    );
    wire = findWire(pageById(document, "page_a"), "w1")!.wire;
    expect(
      resolveWirePoints(pageById(document, "page_a"), testLibrary, wire)![0],
    ).toEqual({ x: 80, y: 100 });
  });

  it("updates a net name once and updates all attached labels", () => {
    let document = createDocument({ pageId: "page_rename_net" });
    document = addWire(document, "page_rename_net", {
      id: "wire_rename",
      name: "N001",
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    });
    const page = pageById(document, "page_rename_net");
    page.annotations.push({
      id: "label_n001",
      kind: "net",
      text: "N001",
      x: 20,
      y: 0,
      size: 14,
      wireId: "wire_rename",
      netId: page.nets[0]!.id,
    });
    const renamed = updateNetNameForWire(
      document,
      "page_rename_net",
      "wire_rename",
      "VOUT",
      "2026-10-24T00:00:00.000Z",
    );
    const next = pageById(renamed, "page_rename_net");
    expect(next.nets[0]?.name).toBe("VOUT");
    expect(next.annotations[0]?.text).toBe("VOUT");
  });

  it("applies a color to every wire in the selected net and can reset it", () => {
    let document = createDocument({ pageId: "page_net_color" });
    const page = document.pages[0]!;
    addTestWire(
      page,
      "net_color",
      "wire_a",
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    );
    addTestWire(
      page,
      "net_color",
      "wire_b",
      [
        { x: 200, y: 0 },
        { x: 300, y: 0 },
      ],
    );

    document = updateNetColorForWire(
      document,
      "page_net_color",
      "wire_a",
      "#1D4ED8",
      "2026-10-25T00:00:00.000Z",
    );
    expect(pageById(document, "page_net_color").nets[0]?.color).toBe("#1d4ed8");

    document = updateNetColorForWire(
      document,
      "page_net_color",
      "wire_b",
      null,
      "2026-10-25T00:00:01.000Z",
    );
    expect(pageById(document, "page_net_color").nets[0]?.color).toBeUndefined();
  });

  it("ignores malformed net colors", () => {
    const document = createDocument({ pageId: "page_invalid_color" });
    addTestWire(
      document.pages[0]!,
      "net_color",
      "wire_a",
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    );
    expect(
      updateNetColorForWire(
        document,
        "page_invalid_color",
        "wire_a",
        "red",
      ),
    ).toBe(document);
  });

  it("creates a junction and splits a through wire when drawing a branch", () => {
    let document = createDocument({ pageId: "page_branch" });
    document = addWire(document, "page_branch", {
      id: "through",
      name: "N001",
      points: [
        { x: 0, y: 100 },
        { x: 200, y: 100 },
      ],
    });
    document = addWire(document, "page_branch", {
      id: "branch",
      points: [
        { x: 100, y: 100 },
        { x: 100, y: 180 },
      ],
      junctionPoints: [{ x: 100, y: 100 }],
    });
    const page = pageById(document, "page_branch");
    expect(page.nets).toHaveLength(1);
    expect(page.nets[0]?.name).toBe("N001");
    expect(page.nets[0]?.junctions).toHaveLength(1);
    expect(allWires(page)).toHaveLength(3);
  });

  it("renames a net directly without duplicating names on wires", () => {
    let document = createDocument({ pageId: "page_rename_group" });
    document = addWire(document, "page_rename_group", {
      id: "a",
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    });
    const page = pageById(document, "page_rename_group");
    addTestWire(
      page,
      page.nets[0]!.id,
      "b",
      [
        { x: 100, y: 0 },
        { x: 100, y: 80 },
      ],
    );
    page.annotations.push({
      id: "label_a",
      kind: "net",
      text: "N001",
      x: 20,
      y: 0,
      size: 14,
      wireId: "a",
      netId: page.nets[0]!.id,
    });
    const renamed = renameNet(
      document,
      "page_rename_group",
      ["a", "b"],
      ["label_a"],
      "CLOCK",
      "2026-10-24T00:00:00.000Z",
    );
    const next = pageById(renamed, "page_rename_group");
    expect(next.nets[0]?.name).toBe("CLOCK");
    expect(next.annotations[0]?.text).toBe("CLOCK");
  });

  it("deletes a stable junction selection", () => {
    const document = createDocument({ pageId: "page_junction_delete" });
    const junction = addTestJunction(
      document.pages[0]!,
      "net_1",
      "junction_1",
      80,
      120,
    );
    const deleted = removeSelection(
      document,
      "page_junction_delete",
      [{ kind: "junction", id: junctionSelectionId(junction) }],
      "2026-10-24T00:00:00.000Z",
    );
    expect(allJunctions(pageById(deleted, "page_junction_delete"))).toEqual([]);
  });

  it("moves a junction and all incident wire endpoints together", () => {
    const document = createDocument({ pageId: "page_junction_move" });
    const page = document.pages[0]!;
    addTestNet(page, "net_1");
    addTestJunction(page, "net_1", "junction_1", 100, 100);
    addTestWire(
      page,
      "net_1",
      "left",
      [
        { x: 0, y: 100 },
        { x: 100, y: 100 },
      ],
      { kind: "open" },
      { kind: "junction", junctionId: "junction_1" },
    );
    addTestWire(
      page,
      "net_1",
      "right",
      [
        { x: 100, y: 100 },
        { x: 200, y: 100 },
      ],
      { kind: "junction", junctionId: "junction_1" },
      { kind: "open" },
    );
    addTestWire(
      page,
      "net_1",
      "branch",
      [
        { x: 100, y: 100 },
        { x: 100, y: 180 },
      ],
      { kind: "junction", junctionId: "junction_1" },
      { kind: "open" },
    );
    const moved = updateWirePoints(
      document,
      "page_junction_move",
      "branch",
      [
        { x: 120, y: 100 },
        { x: 120, y: 180 },
      ],
      "2026-10-24T00:00:00.000Z",
    );
    const next = pageById(moved, "page_junction_move");
    expect(allJunctions(next)[0]?.junction.point).toEqual({ x: 120, y: 100 });
    expect(findWire(next, "left")?.wire.points[1]).toEqual({
      x: 120,
      y: 100,
    });
    const connectivity = buildConnectivity(next, testLibrary);
    expect(connectivity.networkIdByWire.get("left")).toBe(
      connectivity.networkIdByWire.get("branch"),
    );
  });
  it("stores text and shape styling and reorders drawing shapes", () => {
    let document = createDocument({ pageId: "page_styled" });
    document = addShape(document, "page_styled", {
      kind: "rectangle",
      x: 10,
      y: 20,
      width: 100,
      height: 60,
      id: "shape_a",
    });
    document = addShape(document, "page_styled", {
      kind: "ellipse",
      x: 40,
      y: 60,
      width: 80,
      height: 40,
      id: "shape_b",
    });
    const added = pageById(document, "page_styled").shapes[0]!;
    expect(added).toMatchObject({
      strokeWidth: 2,
      dash: "solid",
      opacity: 1,
      fillOpacity: 1,
      textSize: 13,
      textColor: "#263d48",
      textAlign: "middle",
      textBold: true,
    });

    document = updateShape(document, "page_styled", "shape_a", {
      stroke: "#b42318",
      fill: "#ffffff",
      strokeWidth: 4,
      dash: "dashed",
      opacity: 0.5,
      fillOpacity: 0.3,
      textSize: 20,
      textColor: "#1d4ed8",
      textAlign: "start",
      textBold: false,
      textOffset: { x: 6, y: -8 },
    });
    expect(pageById(document, "page_styled").shapes[0]).toMatchObject({
      stroke: "#b42318",
      fill: "#ffffff",
      strokeWidth: 4,
      dash: "dashed",
      opacity: 0.5,
      fillOpacity: 0.3,
      textSize: 20,
      textColor: "#1d4ed8",
      textAlign: "start",
      textBold: false,
      textOffset: { x: 6, y: -8 },
    });

    document = reorderShape(document, "page_styled", "shape_a", "forward");
    expect(pageById(document, "page_styled").shapes.map((shape) => shape.id)).toEqual([
      "shape_b",
      "shape_a",
    ]);

    document = addAnnotation(document, "page_styled", {
      kind: "text",
      text: "Line one\nLine two",
      point: { x: 10, y: 30 },
      id: "label_1",
    });
    document = updateAnnotation(document, "page_styled", "label_1", {
      color: "#b42318",
      align: "middle",
      bold: true,
      italic: true,
      rotation: 90,
      size: 20,
    });
    expect(pageById(document, "page_styled").annotations[0]).toMatchObject({
      text: "Line one\nLine two",
      color: "#b42318",
      align: "middle",
      bold: true,
      italic: true,
      rotation: 90,
      size: 20,
    });
  });


  it("creates notes with the quick-note visual defaults", () => {
    let document = createDocument({ pageId: "page_notes" });
    document = addShape(document, "page_notes", {
      kind: "note",
      x: 40,
      y: 60,
      width: 240,
      height: 100,
      id: "note_1",
    });
    expect(pageById(document, "page_notes").shapes[0]).toMatchObject({
      kind: "note",
      fill: "#f2c777",
      fillOpacity: 0.22,
      stroke: "#b98433",
      strokeWidth: 1.5,
      text: "",
      textAlign: "start",
      textColor: "#6b4d20",
    });
  });

});
