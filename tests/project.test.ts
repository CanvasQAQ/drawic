import { describe, expect, it } from "vitest";
import {
  DOCUMENT_KIND,
  DOCUMENT_SCHEMA_VERSION,
  createDocument,
  createEmptyPage,
  parseProjectText,
  serializeProject,
} from "../src/core/model";
import { duplicatePage, movePage } from "../src/core/project";

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
    });
    const parsed = parseProjectText(serializeProject(document));
    expect(parsed).toEqual(document);
  });

  it("round-trips wire names and attached net labels", () => {
    const document = createDocument({ pageId: "page_wire_mode" });
    document.pages[0]!.wires.push({
      id: "wire_auto",
      name: "VOUT",
      points: [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
      ],
    });
    document.pages[0]!.wires.push({
      id: "wire_manual",
      name: "GND",
      points: [
        { x: 0, y: 20 },
        { x: 20, y: 20 },
      ],
    });
    document.pages[0]!.annotations.push({
      id: "label_vout",
      kind: "net",
      text: "VOUT",
      x: 10,
      y: 0,
      size: 14,
      wireId: "wire_auto",
    });

    const parsed = parseProjectText(serializeProject(document));
    expect(parsed).toEqual(document);
    let copyIndex = 0;
    const duplicated = duplicatePage(parsed, "page_wire_mode", {
      pageId: "page_wire_mode_copy",
      idFactory: (prefix) => `${prefix}_copy_${++copyIndex}`,
    });
    expect(duplicated.pages[1]?.wires.map((wire) => wire.name)).toEqual([
      "VOUT",
      "GND",
    ]);
    expect(duplicated.pages[1]?.annotations[0]?.wireId).toBe("wire_copy_1");
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
});
