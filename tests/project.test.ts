import { describe, expect, it } from "vitest";
import {
  DOCUMENT_KIND,
  DOCUMENT_SCHEMA_VERSION,
  createDocument,
  createEmptyPage,
  parseProjectText,
  serializeProject,
} from "../src/core/model";
import {
  duplicatePage,
  addJunction,
  movePage,
  movePageToIndex,
} from "../src/core/project";
import {
  addTestNet,
  addTestWire,
  allTestWires,
} from "./fixtures";
import { allJunctions, allWires, pageById } from "../src/core/model";

describe("Drawic drawing format", () => {
  it("round-trips independent pages without dropping stable identities", () => {
    const document = createDocument({
      title: "Round trip",
      now: "2026-10-23T00:00:00.000Z",
      id: "project_roundtrip",
      pageId: "page_roundtrip",
    });
    document.pages.push(createEmptyPage("Second page", "page_second"));
    const parsed = parseProjectText(serializeProject(document));
    expect(parsed).toEqual(document);
    expect(parsed.kind).toBe(DOCUMENT_KIND);
    expect(parsed.schemaVersion).toBe(DOCUMENT_SCHEMA_VERSION);
    expect(serializeProject(parsed)).toBe(serializeProject(document));
  });

  it("preserves rich text runs on annotations and drawing shapes", () => {
    const document = createDocument({
      title: "Rich text",
      id: "project_rich_text",
      pageId: "page_rich_text",
    });
    document.pages[0]!.annotations.push({
      id: "text_rich",
      kind: "text",
      text: "Bold and italic",
      x: 20,
      y: 30,
      size: 16,
      richText: [
        { text: "Bold", bold: true, italic: false, script: "normal" },
        { text: " and ", bold: false, italic: false, script: "normal" },
        { text: "italic", bold: false, italic: true, script: "normal" },
      ],
    });
    document.pages[0]!.shapes.push({
      id: "note_rich",
      kind: "note",
      x: 30,
      y: 40,
      width: 240,
      height: 100,
      rotation: 0,
      stroke: "#b98433",
      fill: "#f2c777",
      text: "Heading\nBody",
      richText: [
        { text: "Heading\n", bold: true, italic: false, script: "normal" },
        { text: "Body", bold: false, italic: true, script: "normal" },
      ],
    });

    const parsed = parseProjectText(serializeProject(document));
    expect(parsed).toEqual(document);
    expect(parsed.pages[0]?.annotations[0]?.richText).toHaveLength(3);
    expect(parsed.pages[0]?.shapes[0]?.richText).toHaveLength(2);
  });

  it("rejects rich text runs that do not compose the stored text", () => {
    const document = createDocument({
      title: "Invalid rich text",
      id: "project_invalid_rich_text",
      pageId: "page_invalid_rich_text",
    });
    document.pages[0]!.annotations.push({
      id: "text_bad",
      kind: "text",
      text: "Visible",
      x: 20,
      y: 30,
      size: 16,
      richText: [
        { text: "Different", bold: true, italic: false, script: "normal" },
      ],
    });
    expect(() => parseProjectText(serializeProject(document))).toThrow();
  });

  it("preserves canvas-edited labels and shape text", () => {
    const document = createDocument({
      title: "Editable canvas objects",
      id: "project_editable",
      pageId: "page_editable",
    });
    document.pages[0]!.nodes.push({
      id: "node_r1",
      symbolId: "resistor",
      reference: "R7",
      value: "4k7",
      x: 100,
      y: 100,
      rotation: 0,
      mirrored: false,
      labelLayout: {
        reference: { offset: { x: 14, y: -8 }, hidden: false },
        value: { offset: { x: 0, y: 0 }, hidden: true },
      },
    });
    document.pages[0]!.shapes.push({
      id: "shape_box",
      kind: "rectangle",
      x: 30,
      y: 40,
      width: 120,
      height: 60,
      rotation: 0,
      stroke: "#263d48",
      fill: "transparent",
      text: "Bias network",
      strokeWidth: 3,
      dash: "dashed",
      opacity: 0.6,
      fillOpacity: 0.35,
      textSize: 18,
      textColor: "#1d4ed8",
      textAlign: "start",
      textBold: false,
      textOffset: { x: 8, y: -4 },
    });
    const parsed = parseProjectText(serializeProject(document));
    expect(parsed).toEqual(document);
  });

  it("round-trips component label placement, styling, and diagram typography", () => {
    const document = createDocument({ pageId: "page_style_labels" });
    document.typography = { family: "serif", scale: 1.25 };
    document.pages[0]!.nodes.push({
      id: "r1",
      symbolId: "resistor",
      reference: "R12",
      value: "1k",
      x: 100,
      y: 100,
      rotation: 90,
      mirrored: true,
      mirroredVertically: true,
      labelLayout: {
        reference: {
          offset: { x: 0, y: 0 },
          hidden: false,
          position: { x: 140, y: 160 },
          anchor: "end",
          placement: "manual",
          side: "west",
          fontSizeScale: 1.1,
          color: "#1d4ed8",
          fontWeight: 700,
          fontStyle: "italic",
          script: "superscript",
          richText: [
            { text: "R", bold: true, italic: true, script: "normal" },
            { text: "12", bold: true, italic: false, script: "subscript" },
          ],
        },
        value: {
          offset: { x: 0, y: 0 },
          hidden: true,
        },
      },
    });
    const parsed = parseProjectText(serializeProject(document));
    expect(parsed).toEqual(document);
    let index = 0;
    const duplicated = duplicatePage(parsed, "page_style_labels", {
      pageId: "page_style_labels_copy",
      idFactory: (prefix) => `${prefix}_copy_${++index}`,
    });
    expect(duplicated.pages[1]?.nodes[0]?.labelLayout).toEqual(
      document.pages[0]?.nodes[0]?.labelLayout,
    );
  });

  it("round-trips net-owned wires and attached net labels", () => {
    const document = createDocument({ pageId: "page_wire_mode" });
    addTestNet(document.pages[0]!, "net_vout", "VOUT").color = "#0f766e";
    addTestNet(document.pages[0]!, "net_gnd", "GND");
    addTestWire(
      document.pages[0]!,
      "net_vout",
      "wire_auto",
      [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
      ],
    );
    addTestWire(
      document.pages[0]!,
      "net_gnd",
      "wire_manual",
      [
        { x: 0, y: 20 },
        { x: 20, y: 20 },
      ],
    );
    document.pages[0]!.annotations.push({
      id: "label_vout",
      kind: "net",
      text: "VOUT",
      x: 10,
      y: 0,
      size: 14,
      wireId: "wire_auto",
      netId: "net_vout",
    });
    document.pages[0]!.annotations.push({
      id: "label_note",
      kind: "text",
      text: "Line one\nLine two",
      x: 30,
      y: 40,
      size: 18,
      color: "#b42318",
      align: "middle",
      bold: true,
      italic: true,
      rotation: 90,
    });

    const parsed = parseProjectText(serializeProject(document));
    expect(parsed).toEqual(document);
    let copyIndex = 0;
    const duplicated = duplicatePage(parsed, "page_wire_mode", {
      pageId: "page_wire_mode_copy",
      idFactory: (prefix) => `${prefix}_copy_${++copyIndex}`,
    });
    expect(duplicated.pages[1]?.nets.map((net) => net.name)).toEqual([
      "VOUT",
      "GND",
    ]);
    expect(duplicated.pages[1]?.nets[0]?.color).toBe("#0f766e");
    expect(duplicated.pages[1]?.annotations[0]?.wireId).toBe("wire_copy_3");
    expect(duplicated.pages[1]?.nets[0]?.id).toBe("net_copy_1");
    expect(allTestWires(duplicated.pages[1]!).map((wire) => wire.id)).toEqual([
      "wire_copy_3",
      "wire_copy_4",
    ]);
  });

  it("rejects malformed persisted net colors", () => {
    const document = createDocument({ pageId: "page_bad_color" });
    addTestNet(document.pages[0]!, "net_bad", "BAD").color = "teal";
    expect(() => parseProjectText(serializeProject(document))).toThrow(
      /six-digit hexadecimal color/,
    );
  });

  it("rejects future schema versions instead of guessing", () => {
    const source = JSON.stringify({
      ...createDocument(),
      schemaVersion: 999,
    });
    expect(() => parseProjectText(source)).toThrow(/newer Drawic format/i);
  });

  it("explicitly rejects the retired Cell-oriented preview format", () => {
    expect(() =>
      parseProjectText(
        JSON.stringify({
          schemaVersion: 1,
          kind: "drawic-schematic",
          cells: [],
        }),
      ),
    ).toThrow(/retired Drawic format/i);
  });

  it("explicitly rejects schema version 2 instead of migrating it", () => {
    const current = createDocument();
    expect(() =>
      parseProjectText(
        JSON.stringify({
          ...current,
          schemaVersion: 2,
          pages: [
            {
              ...current.pages[0],
              wires: [],
              junctions: [],
            },
          ],
        }),
      ),
    ).toThrow(/retired Drawic format/i);
  });

  it("rejects duplicate stable identifiers", () => {
    const page = createEmptyPage("Duplicate", "same");
    const document = {
      ...createDocument({ pageId: "same" }),
      pages: [page, { ...page, name: "Second" }],
    };
    expect(() => parseProjectText(JSON.stringify(document))).toThrow(
      /Duplicate stable identifier/,
    );
  });

  it("duplicates and reorders pages as ordered independent canvases", () => {
    const first = createDocument({ pageId: "page_a" });
    first.pages.push(createEmptyPage("Signals", "page_b"));
    let index = 0;
    const duplicated = duplicatePage(first, "page_a", {
      pageId: "page_copy",
      idFactory: (prefix) => `${prefix}_${++index}`,
    });
    expect(duplicated.pages.map((page) => page.id)).toEqual([
      "page_a",
      "page_b",
      "page_copy",
    ]);
    const moved = movePage(duplicated, "page_copy", -1);
    expect(moved.pages.map((page) => page.id)).toEqual([
      "page_a",
      "page_copy",
      "page_b",
    ]);
  });

  it("moves a page to an explicit index for tab dragging", () => {
    const document = createDocument({ pageId: "page_a" });
    document.pages.push(
      createEmptyPage("Power", "page_b"),
      createEmptyPage("Signals", "page_c"),
    );
    expect(
      movePageToIndex(document, "page_c", 0).pages.map((page) => page.id),
    ).toEqual(["page_c", "page_a", "page_b"]);
    expect(
      movePageToIndex(document, "page_a", 2).pages.map((page) => page.id),
    ).toEqual(["page_b", "page_c", "page_a"]);
    expect(movePageToIndex(document, "page_a", 0)).toBe(document);
    expect(movePageToIndex(document, "missing", 1)).toBe(document);
  });

  it("remaps the stacking order when a page is duplicated", () => {
    const document = createDocument({ pageId: "page_layers" });
    const page = document.pages[0]!;
    page.nodes.push(
      {
        id: "node_a",
        symbolId: "resistor",
        reference: "R1",
        value: "1k",
        x: 0,
        y: 0,
        rotation: 0,
        mirrored: false,
      },
      {
        id: "node_b",
        symbolId: "resistor",
        reference: "R2",
        value: "1k",
        x: 40,
        y: 0,
        rotation: 0,
        mirrored: false,
      },
    );
    page.zOrder = ["node_b", "node_a"];
    let index = 0;
    const duplicated = duplicatePage(document, "page_layers", {
      pageId: "page_copy",
      idFactory: (prefix) => `${prefix}_${++index}`,
    });
    const copy = duplicated.pages[1]!;
    expect(copy.nodes.map((node) => node.id)).toEqual(["node_1", "node_2"]);
    expect(copy.zOrder).toEqual(["node_2", "node_1"]);
  });

  it("joins crossing nets at a stable junction and splits both wire edges", () => {
    const document = createDocument({ pageId: "page_crossing" });
    const page = document.pages[0]!;
    addTestWire(
      page,
      "net_h",
      "horizontal",
      [
        { x: 0, y: 100 },
        { x: 200, y: 100 },
      ],
    );
    addTestWire(
      page,
      "net_v",
      "vertical",
      [
        { x: 100, y: 0 },
        { x: 100, y: 200 },
      ],
    );
    const joined = addJunction(
      document,
      "page_crossing",
      { x: 100, y: 100 },
      () => "2026-10-24T01:00:00.000Z",
    );
    const next = pageById(joined, "page_crossing");
    expect(next.nets).toHaveLength(1);
    expect(allJunctions(next)).toHaveLength(1);
    expect(allWires(next)).toHaveLength(4);
    const junction = allJunctions(next)[0]!.junction;
    for (const { wire } of allWires(next)) {
      expect(
        [wire.start, wire.end].some(
          (endpoint) =>
            endpoint.kind === "junction" &&
            endpoint.junctionId === junction.id,
        ),
      ).toBe(true);
    }
  });
});
