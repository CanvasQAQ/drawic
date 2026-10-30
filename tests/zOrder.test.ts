import { describe, expect, it } from "vitest";
import {
  createEmptyPage,
  parseProjectText,
  serializeProject,
  type DrawingPage,
  type DrawingShape,
} from "../src/core/model";
import {
  defaultPaintOrder,
  reorderPaintEntries,
  resolvePaintOrder,
  withPaintEntry,
} from "../src/core/zOrder";

function shape(id: string, kind: DrawingShape["kind"]): DrawingShape {
  return {
    id,
    kind,
    x: 0,
    y: 0,
    width: 100,
    height: 60,
    rotation: 0,
    stroke: "#203a45",
    fill: "#ffffff",
  };
}

function pageFixture(): DrawingPage {
  const page = createEmptyPage("Layers");
  page.shapes.push(shape("rect_1", "rectangle"), shape("note_1", "note"));
  page.nodes.push({
    id: "node_1",
    symbolId: "resistor",
    reference: "R1",
    value: "1k",
    x: 0,
    y: 0,
    rotation: 0,
    mirrored: false,
  });
  page.nets.push({
    id: "net_1",
    wires: [
      {
        id: "wire_1",
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
        start: { kind: "open" },
        end: { kind: "open" },
      },
    ],
    junctions: [],
  });
  page.annotations.push({
    id: "text_1",
    kind: "text",
    text: "Hi",
    x: 0,
    y: 0,
    size: 16,
  });
  return page;
}

function ids(page: DrawingPage): string[] {
  return resolvePaintOrder(page).map((entry) => entry.id);
}

describe("z-order", () => {
  it("uses the legacy band order when a page has no stored order", () => {
    expect(defaultPaintOrder(pageFixture()).map((entry) => entry.id)).toEqual([
      "rect_1",
      "wire_1",
      "node_1",
      "note_1",
      "text_1",
    ]);
  });

  it("drops stale and duplicate ids and appends missing objects", () => {
    const page: DrawingPage = {
      ...pageFixture(),
      zOrder: ["text_1", "ghost", "text_1"],
    };
    expect(ids(page)).toEqual([
      "text_1",
      "rect_1",
      "wire_1",
      "node_1",
      "note_1",
    ]);
  });

  it("inserts a new object above the last object of its own kind", () => {
    const page = withPaintEntry(
      { ...pageFixture(), zOrder: ["rect_1", "wire_1", "node_1", "note_1", "text_1"] },
      { kind: "shape", id: "note_2" },
    );
    expect(page.zOrder).toEqual([
      "rect_1",
      "wire_1",
      "node_1",
      "note_1",
      "note_2",
      "text_1",
    ]);
  });

  it("moves a Note below a component with a single arrange step", () => {
    const page = { ...pageFixture(), zOrder: ["rect_1", "wire_1", "node_1", "note_1", "text_1"] };
    const reordered = reorderPaintEntries(page, ["note_1"], "backward");
    expect(reordered.zOrder).toEqual([
      "rect_1",
      "wire_1",
      "note_1",
      "node_1",
      "text_1",
    ]);
  });

  it("sends a selection to the back and to the front as one block", () => {
    const page = { ...pageFixture(), zOrder: ["rect_1", "wire_1", "node_1", "note_1", "text_1"] };
    expect(reorderPaintEntries(page, ["note_1", "text_1"], "back").zOrder).toEqual([
      "note_1",
      "text_1",
      "rect_1",
      "wire_1",
      "node_1",
    ]);
    expect(reorderPaintEntries(page, ["rect_1", "wire_1"], "front").zOrder).toEqual([
      "node_1",
      "note_1",
      "text_1",
      "rect_1",
      "wire_1",
    ]);
  });

  it("returns the same page when an arrange step changes nothing", () => {
    const page = { ...pageFixture(), zOrder: ["rect_1", "wire_1", "node_1", "note_1", "text_1"] };
    expect(reorderPaintEntries(page, ["text_1"], "front")).toBe(page);
    expect(reorderPaintEntries(page, ["rect_1"], "back")).toBe(page);
    expect(reorderPaintEntries(page, ["missing"], "front")).toBe(page);
  });

  it("round-trips the stored order and normalizes it on load", () => {
    const page = { ...pageFixture(), zOrder: ["rect_1", "wire_1", "node_1", "note_1", "text_1"] };
    const document = {
      schemaVersion: 3 as const,
      kind: "drawic-drawing" as const,
      id: "doc",
      title: "Layers",
      createdAt: "2026-01-01T00:00:00.000Z",
      modifiedAt: "2026-01-01T00:00:00.000Z",
      pages: [page],
    };
    const parsed = parseProjectText(serializeProject(document));
    expect(parsed.pages[0]?.zOrder).toEqual([
      "rect_1",
      "wire_1",
      "node_1",
      "note_1",
      "text_1",
    ]);
  });

  it("rejects a stored order that is not a list of ids", () => {
    const document = {
      schemaVersion: 3 as const,
      kind: "drawic-drawing" as const,
      id: "doc",
      title: "Layers",
      createdAt: "2026-01-01T00:00:00.000Z",
      modifiedAt: "2026-01-01T00:00:00.000Z",
      pages: [{ ...pageFixture(), zOrder: [1, 2] }],
    };
    expect(() => parseProjectText(JSON.stringify(document))).toThrow(
      /zOrder\[0\] must be a string/,
    );
  });
});
