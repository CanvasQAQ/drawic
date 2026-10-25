import { describe, expect, it } from "vitest";
import {
  addComponent,
  mirrorSelection,
  mirrorSelectionVertical,
  moveNodes,
  rotateSelection,
  updateNode,
  updateNodeLabel,
  updateDocumentTypography,
} from "../src/core/editor";
import {
  commitHistory,
  createHistory,
  redoHistory,
  undoHistory,
} from "../src/core/history";
import {
  createDocument,
  createEmptyPage,
  pageById,
  parseProjectText,
  serializeProject,
  type DrawingPage,
  type SymbolDefinition,
} from "../src/core/model";
import {
  nodeLabelVisible,
  rectanglesIntersect,
  symbolLabelPosition,
} from "../src/core/geometry";
import {
  DEFAULT_SERIF_FONT_STACK,
  DEFAULT_SANS_FONT_STACK,
  NAME_BASE_FONT_SIZE,
  defaultLabelSide,
  effectiveNameFontSize,
  layoutNodeLabels,
  labelTextBounds,
  nodeInkBounds,
  parseReferenceAppearance,
} from "../src/core/labels";
import { addTestWire, testLibrary, twoPinSymbol } from "./fixtures";

const nmosSymbol: SymbolDefinition = {
  id: "nmos",
  label: "NMOS",
  category: "transistor",
  electrical: true,
  palette: true,
  frame: { x: -24, y: -24, width: 48, height: 48 },
  selectionBox: { x: -22, y: -22, width: 34.581395, height: 44 },
  labelBounds: { x: -20, y: -20, width: 30.581395, height: 40 },
  pins: [
    { key: "D", role: "drain", side: "north", x: 10, y: -20 },
    { key: "G", role: "gate", side: "west", x: -20, y: 0 },
    { key: "S", role: "source", side: "south", x: 10, y: 20 },
  ],
  file: "nmos.svg",
  svgBody: "<path/>",
};

const bjtSymbol: SymbolDefinition = {
  ...nmosSymbol,
  id: "npn",
  label: "NPN Bipolar Transistor",
};

const tcoilSymbol: SymbolDefinition = {
  ...nmosSymbol,
  id: "tcoil",
  label: "T-Coil",
  category: "passive",
  labelBounds: { x: -90, y: -53.3856, width: 180, height: 84.4316 },
};

const opampSymbol: SymbolDefinition = {
  ...twoPinSymbol,
  id: "opamp",
  label: "Operational Amplifier",
  category: "analog-block",
  labelBounds: { x: -40, y: -30, width: 70, height: 60 },
};

const portSymbol: SymbolDefinition = {
  ...twoPinSymbol,
  id: "port",
  label: "Port",
  category: "interface",
  labelBounds: { x: -10, y: -3, width: 15, height: 6 },
  pins: [{ key: "P", role: "signal", side: "east", x: 5, y: 0 }],
};

function node(symbolId: string, patch: Record<string, unknown> = {}) {
  return {
    id: `node_${symbolId}`,
    symbolId,
    reference: symbolId === "nmos" ? "M1" : "R1",
    value: "1",
    x: 100,
    y: 100,
    rotation: 0 as const,
    mirrored: false,
    ...patch,
  };
}

function placedLabel(
  symbol: SymbolDefinition,
  patch: Record<string, unknown> = {},
  page: DrawingPage = createEmptyPage("Labels"),
) {
  const component = node(symbol.id, patch);
  const layouts = layoutNodeLabels(component, symbol, page, {
    showValue: false,
    automatic: false,
  });
  return symbolLabelPosition({ ...component, labelLayout: layouts }, symbol, "reference");
}

describe("component Name label layout", () => {
  it("matches the fixed NMOS placement results", () => {
    expect(placedLabel(nmosSymbol)).toEqual({ point: { x: 115, y: 105 }, anchor: "start" });
    expect(placedLabel(nmosSymbol, { rotation: 90 })).toEqual({
      point: { x: 100, y: 125 },
      anchor: "middle",
    });
    expect(placedLabel(nmosSymbol, { rotation: 270 })).toEqual({
      point: { x: 100, y: 80 },
      anchor: "middle",
    });
    expect(placedLabel(nmosSymbol, { mirrored: true })).toEqual({
      point: { x: 85, y: 105 },
      anchor: "end",
    });
  });

  it("matches the fixed Resistor placement result", () => {
    const resistor: SymbolDefinition = {
      ...twoPinSymbol,
      labelBounds: { x: -4.988372, y: -20, width: 10.360465, height: 40 },
    };
    expect(placedLabel(resistor)).toEqual({
      point: { x: 109, y: 105 },
      anchor: "start",
    });
  });

  it("uses the specified ink bounds, 4-unit gap, cap height, and subscript avoidance", () => {
    const page = createEmptyPage("Geometry");
    const component = node("nmos");
    expect(nodeInkBounds(component, nmosSymbol)).toEqual({
      minX: 80,
      minY: 80,
      maxX: 110.581395,
      maxY: 120,
    });

    const right = placedLabel(nmosSymbol, {}, page);
    expect(right.point.x).toBe(115);
    expect(right.point.y).toBe(105);

    const rotatedNode = node("nmos", { rotation: 270 });
    const above = placedLabel(nmosSymbol, { rotation: 270 }, page);
    const subscriptDrop = 0.76 * 0.44 * NAME_BASE_FONT_SIZE;
    expect(above.point.y).toBe(
      Math.round(nodeInkBounds(rotatedNode, nmosSymbol).minY - 4 - subscriptDrop),
    );
  });

  it("chooses default edges by device class and keeps Port away from its pin", () => {
    const page = createEmptyPage("Edges");
    expect(defaultLabelSide(node("nmos"), nmosSymbol, page)).toBe("east");
    expect(defaultLabelSide(node("npn"), bjtSymbol, page)).toBe("east");
    expect(defaultLabelSide(node("resistor"), twoPinSymbol, page)).toBe("east");
    expect(defaultLabelSide(node("tcoil"), tcoilSymbol, page)).toBe("north");
    expect(defaultLabelSide(node("opamp"), opampSymbol, page)).toBe("south");
    expect(defaultLabelSide(node("port"), portSymbol, page)).toBe("west");
  });

  it("moves a Port Name away from its connected wire direction", () => {
    const page = createEmptyPage("Connected port");
    const port = node("port");
    page.nodes.push(port);
    addTestWire(
      page,
      "net_port",
      "wire_port",
      [
        { x: 105, y: 100 },
        { x: 70, y: 100 },
      ],
      { kind: "pin", deviceId: port.id, pinId: "P" },
    );
    expect(defaultLabelSide(port, portSymbol, page)).toBe("east");
  });

  it("maps local right and local bottom edges through rotation and mirroring", () => {
    const page = createEmptyPage("Transforms");
    expect(defaultLabelSide(node("nmos", { rotation: 90 }), nmosSymbol, page)).toBe("south");
    expect(defaultLabelSide(node("nmos", { rotation: 180 }), nmosSymbol, page)).toBe("west");
    expect(defaultLabelSide(node("nmos", { rotation: 270 }), nmosSymbol, page)).toBe("north");
    expect(defaultLabelSide(node("nmos", { mirrored: true }), nmosSymbol, page)).toBe("west");
    expect(
      defaultLabelSide(node("nmos", { mirroredVertically: true }), nmosSymbol, page),
    ).toBe("east");
    expect(
      defaultLabelSide(
        node("nmos", { mirrored: true, mirroredVertically: true }),
        nmosSymbol,
        page,
      ),
    ).toBe("west");

    const generic = { ...twoPinSymbol, id: "generic-block", category: "analog-block" };
    expect(defaultLabelSide(node("generic-block"), generic, page)).toBe("south");
    expect(defaultLabelSide(node("generic-block", { rotation: 90 }), generic, page)).toBe(
      "west",
    );
    expect(defaultLabelSide(node("generic-block", { rotation: 180 }), generic, page)).toBe(
      "north",
    );
    expect(defaultLabelSide(node("generic-block", { rotation: 270 }), generic, page)).toBe(
      "east",
    );
    expect(
      defaultLabelSide(node("generic-block", { mirroredVertically: true }), generic, page),
    ).toBe("north");
  });

  it("keeps labels horizontal and applies the required font stacks and weights", () => {
    expect(DEFAULT_SANS_FONT_STACK).toContain("Metropolis");
    expect(DEFAULT_SERIF_FONT_STACK).toContain("Liberation Serif");
    const component = node("nmos");
    const layouts = layoutNodeLabels(component, nmosSymbol, createEmptyPage("Fonts"));
    expect(layouts.reference?.position).toBeDefined();
    expect(layouts.reference).not.toHaveProperty("rotation");
    expect(effectiveNameFontSize(layouts.reference, { family: "sans", scale: 1 })).toBe(
      NAME_BASE_FONT_SIZE,
    );
    expect(
      effectiveNameFontSize(layouts.reference, { family: "sans", scale: 1.25 }),
    ).toBeCloseTo(NAME_BASE_FONT_SIZE * 1.25);
  });

  it("parses standard References into bold-italic bases and bold upright subscripts", () => {
    expect(parseReferenceAppearance("M1")).toEqual([
      { text: "M", role: "base" },
      { text: "1", role: "subscript" },
    ]);
    expect(parseReferenceAppearance("R12")).toEqual([
      { text: "R", role: "base" },
      { text: "12", role: "subscript" },
    ]);
    expect(parseReferenceAppearance("M_TAIL")).toEqual([
      { text: "M", role: "base" },
      { text: "TAIL", role: "subscript" },
    ]);
    expect(parseReferenceAppearance("XU0")).toEqual([
      { text: "XU", role: "base" },
      { text: "0", role: "subscript" },
    ]);
    expect(parseReferenceAppearance("OA1")).toEqual([
      { text: "OA", role: "base" },
      { text: "1", role: "subscript" },
    ]);
    expect(parseReferenceAppearance("ΩTAIL")).toEqual([
      { text: "Ω", role: "base" },
      { text: "TAIL", role: "subscript" },
    ]);
    expect(parseReferenceAppearance("NMOS")).toEqual([{ text: "NMOS", role: "plain" }]);
  });

  it("orders Name before Value and lets Value occupy Name's slot when Name is hidden", () => {
    const page = createEmptyPage("Combined");
    const both = layoutNodeLabels(node("nmos"), nmosSymbol, page, {
      showValue: true,
    });
    const name = symbolLabelPosition(
      { ...node("nmos"), labelLayout: both },
      nmosSymbol,
      "reference",
    );
    const value = symbolLabelPosition(
      { ...node("nmos"), labelLayout: both },
      nmosSymbol,
      "value",
    );
    expect(value.point.y).toBeGreaterThan(name.point.y);

    const above = layoutNodeLabels(node("nmos", { rotation: 270 }), nmosSymbol, page, {
      showValue: true,
    });
    expect(
      symbolLabelPosition(
        { ...node("nmos", { rotation: 270 }), labelLayout: above },
        nmosSymbol,
        "reference",
      ).point.y,
    ).toBeLessThan(
      symbolLabelPosition(
        { ...node("nmos", { rotation: 270 }), labelLayout: above },
        nmosSymbol,
        "value",
      ).point.y,
    );

    const valueOnly = layoutNodeLabels(node("nmos"), nmosSymbol, page, {
      showReference: false,
      showValue: true,
    });
    expect(
      symbolLabelPosition(
        { ...node("nmos"), labelLayout: valueOnly },
        nmosSymbol,
        "value",
      ),
    ).toEqual({
      point: { x: 115, y: 105 },
      anchor: "start",
    });
  });
});

describe("component Name integration", () => {
  it("shows Name and hides Value after ordinary placement", () => {
    const document = createDocument({ pageId: "page_labels" });
    const placed = addComponent(document, "page_labels", {
      symbol: twoPinSymbol,
      value: "1k",
      point: { x: 100, y: 100 },
      id: "r1",
    });
    const component = pageById(placed, "page_labels").nodes[0]!;
    expect(component.reference).toMatch(/^R\d+$/);
    expect(component.labelLayout?.reference?.hidden).toBe(false);
    expect(component.labelLayout?.value?.hidden).toBe(true);
    expect(component.labelLayout?.reference?.placement).toBe("default");
    expect(component.labelLayout?.reference?.position).toBeDefined();
  });

  it("allocates the smallest unused suffix within a shared prefix", () => {
    let document = createDocument({ pageId: "page_numbers" });
    document.pages[0]!.nodes.push(
      node("resistor", { id: "r1", reference: "R1" }),
      node("resistor", { id: "r3", reference: "R3" }),
    );
    document = addComponent(document, "page_numbers", {
      symbol: twoTerminalSymbol("variable-resistor", "R"),
      value: "2k",
      point: { x: 100, y: 100 },
      id: "r2",
    });
    expect(pageById(document, "page_numbers").nodes.at(-1)?.reference).toBe("R2");
  });

  it("corrects a duplicate explicitly supplied Reference", () => {
    let document = createDocument({ pageId: "page_duplicate" });
    document = addComponent(document, "page_duplicate", {
      symbol: twoPinSymbol,
      reference: "R1",
      value: "1k",
      point: { x: 100, y: 100 },
      id: "r1",
    });
    document = addComponent(document, "page_duplicate", {
      symbol: twoPinSymbol,
      reference: "R1",
      value: "2k",
      point: { x: 200, y: 100 },
      id: "r2",
    });
    expect(pageById(document, "page_duplicate").nodes.map((entry) => entry.reference)).toEqual([
      "R1",
      "R2",
    ]);
  });

  it("omits Name for empty Reference, explicit disable, or symbol policy", () => {
    const cases: Array<{
      symbol: SymbolDefinition;
      reference?: string;
      showReference?: boolean;
    }> = [
      { symbol: twoPinSymbol, reference: "" },
      { symbol: twoPinSymbol, showReference: false },
      { symbol: { ...twoPinSymbol, referenceLabel: false } },
    ];
    for (const [index, item] of cases.entries()) {
      const document = createDocument({ pageId: `page_hidden_${index}` });
      const placed = addComponent(document, `page_hidden_${index}`, {
        symbol: item.symbol,
        ...(item.reference === undefined ? {} : { reference: item.reference }),
        ...(item.showReference === undefined
          ? {}
          : { showReference: item.showReference }),
        value: "1k",
        point: { x: 100, y: 100 },
        id: `r${index}`,
      });
      expect(
        nodeLabelVisible(
          pageById(placed, `page_hidden_${index}`).nodes[0]!,
          "reference",
        ),
      ).toBe(false);
    }
  });

  it("keeps GUI placement fixed and lets Agent placement avoid wires", () => {
    const guiPage = createEmptyPage("GUI collision");
    addTestWire(guiPage, "net_wire", "wire", [
      { x: 116, y: 60 },
      { x: 116, y: 140 },
    ]);
    const guiDocument = {
      ...createDocument({ pageId: guiPage.id }),
      pages: [guiPage],
    };
    const gui = addComponent(guiDocument, guiPage.id, {
      symbol: nmosSymbol,
      reference: "M1",
      value: "NMOS",
      point: { x: 100, y: 100 },
      id: "m_gui",
    });
    expect(
      symbolLabelPosition(
        pageById(gui, guiPage.id).nodes[0]!,
        nmosSymbol,
        "reference",
      ).point,
    ).toEqual({ x: 115, y: 105 });

    const agentPage = createEmptyPage("Agent collision");
    addTestWire(agentPage, "net_wire", "wire", [
      { x: 116, y: 60 },
      { x: 116, y: 140 },
    ]);
    const agentDocument = {
      ...createDocument({ pageId: agentPage.id }),
      pages: [agentPage],
    };
    const agent = addComponent(agentDocument, agentPage.id, {
      symbol: nmosSymbol,
      reference: "M1",
      value: "NMOS",
      point: { x: 100, y: 100 },
      id: "m_agent",
      placementMode: "agent",
    });
    const agentComponent = pageById(agent, agentPage.id).nodes[0]!;
    const agentName = symbolLabelPosition(
      agentComponent,
      nmosSymbol,
      "reference",
    );
    expect(agentName.point).not.toEqual({ x: 115, y: 105 });
    const nameBox = labelTextBounds(
      agentName.point,
      agentName.anchor,
      "M1",
      NAME_BASE_FONT_SIZE,
      true,
    );
    expect(
      rectanglesIntersect(nameBox, {
        minX: 115,
        minY: 59,
        maxX: 117,
        maxY: 141,
      }),
      JSON.stringify({ agentName, nameBox }),
    ).toBe(false);
  });

  it("moves Name and Value together away from collisions during Agent placement", () => {
    const page = createEmptyPage("Agent group collision");
    addTestWire(page, "net_wire", "wire", [
      { x: 116, y: 60 },
      { x: 116, y: 140 },
    ]);
    const document = {
      ...createDocument({ pageId: page.id }),
      pages: [page],
    };
    const placed = addComponent(document, page.id, {
      symbol: nmosSymbol,
      reference: "M1",
      value: "NMOS",
      point: { x: 100, y: 100 },
      id: "m_agent_group",
      placementMode: "agent",
      showValue: true,
    });
    const component = pageById(placed, page.id).nodes[0]!;
    const name = symbolLabelPosition(component, nmosSymbol, "reference");
    const value = symbolLabelPosition(component, nmosSymbol, "value");
    expect(name.point).not.toEqual({ x: 115, y: 105 });
    expect(value.point.x).toBe(name.point.x);
    expect(value.point.y).toBeGreaterThan(name.point.y);
    for (const [label, text, fontSize, rich] of [
      [name, "M1", NAME_BASE_FONT_SIZE, true],
      [value, "NMOS", 12.5, false],
    ] as const) {
      const box = labelTextBounds(
        label.point,
        label.anchor,
        text,
        fontSize,
        rich,
      );
      expect(
        rectanglesIntersect(box, {
          minX: 115,
          minY: 59,
          maxX: 117,
          maxY: 141,
        }),
        JSON.stringify({ label, text, box }),
      ).toBe(false);
    }
  });

  it("moves an Agent label out of a closed wire enclosure", () => {
    const page = createEmptyPage("Enclosed label");
    addTestWire(
      page,
      "net_enclosure",
      "enclosure",
      [
        { x: 112, y: 90 },
        { x: 132, y: 90 },
        { x: 132, y: 120 },
        { x: 112, y: 120 },
        { x: 112, y: 90 },
      ],
    );
    const document = {
      ...createDocument({ pageId: page.id }),
      pages: [page],
    };
    const placed = addComponent(document, page.id, {
      symbol: nmosSymbol,
      reference: "M1",
      value: "NMOS",
      point: { x: 100, y: 100 },
      id: "m_enclosed",
      placementMode: "agent",
    });
    expect(
      symbolLabelPosition(
        pageById(placed, page.id).nodes[0]!,
        nmosSymbol,
        "reference",
      ).point,
    ).not.toEqual({ x: 115, y: 105 });
  });

  it("moves with the device but keeps manually positioned labels through rotation", () => {
    let document = createDocument({ pageId: "page_manual" });
    document = addComponent(document, "page_manual", {
      symbol: twoPinSymbol,
      reference: "R1",
      value: "1k",
      point: { x: 100, y: 100 },
      id: "r1",
    });
    const initial = pageById(document, "page_manual").nodes[0]!;
    const manualPosition = { x: 180, y: 170 };
    document = updateNodeLabel(document, "page_manual", "r1", "reference", {
      position: manualPosition,
      placement: "manual",
    });
    document = moveNodes(document, "page_manual", ["r1"], { x: 20, y: 10 }, testLibrary);
    expect(
      pageById(document, "page_manual").nodes[0]?.labelLayout?.reference?.position,
    ).toEqual({ x: 200, y: 180 });
    document = rotateSelection(
      document,
      "page_manual",
      [{ kind: "node", id: "r1" }],
      testLibrary,
    );
    expect(
      pageById(document, "page_manual").nodes[0]?.labelLayout?.reference?.position,
    ).toEqual({ x: 200, y: 180 });

    document = updateNodeLabel(document, "page_manual", "r1", "reference", {
      hidden: true,
    });
    document = updateNodeLabel(document, "page_manual", "r1", "reference", {
      hidden: false,
    });
    expect(
      pageById(document, "page_manual").nodes[0]?.labelLayout?.reference?.position,
    ).toEqual({ x: 200, y: 180 });
    expect(initial.reference).toBe("R1");
  });

  it("reflows default labels on rotation while unmodified labels stay horizontal", () => {
    let document = createDocument({ pageId: "page_default_rotation" });
    document = addComponent(document, "page_default_rotation", {
      symbol: nmosSymbol,
      reference: "M1",
      value: "NMOS",
      point: { x: 100, y: 100 },
      id: "m1",
      library: [nmosSymbol],
    });
    expect(
      symbolLabelPosition(
        pageById(document, "page_default_rotation").nodes[0]!,
        nmosSymbol,
        "reference",
      ),
    ).toEqual({ point: { x: 115, y: 105 }, anchor: "start" });
    document = rotateSelection(
      document,
      "page_default_rotation",
      [{ kind: "node", id: "m1" }],
      [nmosSymbol],
    );
    expect(
      symbolLabelPosition(
        pageById(document, "page_default_rotation").nodes[0]!,
        nmosSymbol,
        "reference",
      ),
    ).toEqual({ point: { x: 100, y: 125 }, anchor: "middle" });
    expect(
      pageById(document, "page_default_rotation").nodes[0]?.labelLayout?.reference
        ?.placement,
    ).toBe("default");
    document = mirrorSelection(
      document,
      "page_default_rotation",
      [{ kind: "node", id: "m1" }],
      [nmosSymbol],
    );
    expect(
      pageById(document, "page_default_rotation").nodes[0]?.labelLayout?.reference
        ?.placement,
    ).toBe("default");
  });

  it("mirrors vertically and moves a bottom-side Name to the top", () => {
    let document = createDocument({ pageId: "page_vertical_mirror" });
    document = addComponent(document, "page_vertical_mirror", {
      symbol: opampSymbol,
      reference: "OA1",
      value: "OP",
      point: { x: 100, y: 100 },
      id: "oa1",
      library: [opampSymbol],
    });
    const before = symbolLabelPosition(
      pageById(document, "page_vertical_mirror").nodes[0]!,
      opampSymbol,
      "reference",
    );
    document = mirrorSelectionVertical(
      document,
      "page_vertical_mirror",
      [{ kind: "node", id: "oa1" }],
      [opampSymbol],
    );
    const component = pageById(document, "page_vertical_mirror").nodes[0]!;
    const after = symbolLabelPosition(component, opampSymbol, "reference");
    expect(component.mirroredVertically).toBe(true);
    expect(after.anchor).toBe("middle");
    expect(after.point.y).toBeLessThan(before.point.y);
  });

  it("groups a newly shown Value below a default Name", () => {
    let document = createDocument({ pageId: "page_show_value" });
    document = addComponent(document, "page_show_value", {
      symbol: nmosSymbol,
      reference: "M1",
      value: "NMOS",
      point: { x: 100, y: 100 },
      id: "m1",
      library: [nmosSymbol],
    });
    document = updateNodeLabel(
      document,
      "page_show_value",
      "m1",
      "value",
      { hidden: false },
      [nmosSymbol],
    );
    const component = pageById(document, "page_show_value").nodes[0]!;
    const name = symbolLabelPosition(component, nmosSymbol, "reference");
    const value = symbolLabelPosition(component, nmosSymbol, "value");
    expect(value.point.y).toBeGreaterThan(name.point.y);
    expect(value.anchor).toBe(name.anchor);
  });

  it("updates document-level typography without touching electrical names", () => {
    const initial = createDocument({ pageId: "page_typography" });
    const updated = updateDocumentTypography(
      initial,
      { family: "serif", scale: 1.3 },
      "2026-10-25T00:00:00.000Z",
    );
    expect(updated.typography).toEqual({ family: "serif", scale: 1.3 });
    expect(updated.pages).toEqual(initial.pages);
  });

  it("keeps custom Name typography when the electrical Reference changes", () => {
    let document = createDocument({ pageId: "page_custom_name" });
    document = addComponent(document, "page_custom_name", {
      symbol: twoPinSymbol,
      reference: "R1",
      value: "1k",
      point: { x: 100, y: 100 },
      id: "r1",
    });
    document = updateNodeLabel(
      document,
      "page_custom_name",
      "r1",
      "reference",
      {
        fontStyle: "italic",
        fontWeight: 700,
        script: "superscript",
        color: "#1d4ed8",
      },
      testLibrary,
    );
    document = updateNode(
      document,
      "page_custom_name",
      "r1",
      { reference: "R12" },
      testLibrary,
    );
    const reference = pageById(document, "page_custom_name").nodes[0]!.reference;
    expect(reference).toBe("R12");
    expect(
      pageById(document, "page_custom_name").nodes[0]?.labelLayout?.reference,
    ).toMatchObject({
      fontStyle: "italic",
      fontWeight: 700,
      script: "superscript",
      color: "#1d4ed8",
    });
    expect(
      pageById(document, "page_custom_name").nodes[0]?.labelLayout?.reference
        ?.placement,
    ).toBe("default");
  });

  it("round-trips label placement, visibility, typography, and visual style", () => {
    const document = createDocument({ pageId: "page_persist_labels" });
    document.typography = { family: "serif", scale: 1.2 };
    const placed = addComponent(document, "page_persist_labels", {
      symbol: nmosSymbol,
      reference: "M1",
      value: "NMOS",
      point: { x: 100, y: 100 },
      id: "m1",
    });
    const styled = updateNodeLabel(placed, "page_persist_labels", "m1", "reference", {
      position: { x: 140, y: 160 },
      placement: "manual",
      fontSizeScale: 1.1,
      fontStyle: "italic",
      fontWeight: 700,
      script: "superscript",
      color: "#1d4ed8",
    });
    const parsed = parseProjectText(serializeProject(styled));
    expect(parsed).toEqual(styled);
    expect(pageById(parsed, "page_persist_labels").nodes[0]?.reference).toBe("M1");
  });

  it("preserves label state through undo and redo", () => {
    const initial = createDocument({ pageId: "page_label_history" });
    let history = createHistory(initial);
    const placed = addComponent(initial, "page_label_history", {
      symbol: twoPinSymbol,
      reference: "R1",
      value: "1k",
      point: { x: 100, y: 100 },
      id: "r1",
    });
    history = commitHistory(history, placed);
    const style = updateNodeLabel(
      history.present,
      "page_label_history",
      "r1",
      "reference",
      { color: "#1d4ed8", placement: "manual", position: { x: 140, y: 160 } },
      testLibrary,
    );
    history = commitHistory(history, style);

    const undone = undoHistory(history);
    expect(
      pageById(undone.present, "page_label_history").nodes[0]?.labelLayout?.reference?.color,
    ).toBeUndefined();
    const redone = redoHistory(undone);
    expect(
      pageById(redone.present, "page_label_history").nodes[0]?.labelLayout?.reference,
    ).toMatchObject({
      color: "#1d4ed8",
      placement: "manual",
      position: { x: 140, y: 160 },
    });
  });
});

function twoTerminalSymbol(id: string, prefix: string): SymbolDefinition {
  return {
    ...twoPinSymbol,
    id,
    label: id,
    spice: {
      prefix,
      defaultValue: "1k",
      supported: true,
    },
  } as SymbolDefinition;
}
