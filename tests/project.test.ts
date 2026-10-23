import { describe, expect, it } from "vitest";
import {
  createDocument,
  createEmptyCell,
  parseProjectText,
  serializeProject,
} from "../src/core/model";

describe("Drawic project format", () => {
  it("round-trips a document without dropping stable identities", () => {
    const document = createDocument({
      title: "Round trip",
      now: "2026-10-23T00:00:00.000Z",
      id: "project_roundtrip",
      cellId: "cell_roundtrip",
    });
    const parsed = parseProjectText(serializeProject(document));
    expect(parsed).toEqual(document);
    expect(serializeProject(parsed)).toBe(serializeProject(document));
  });

  it("rejects future schema versions instead of guessing", () => {
    const source = JSON.stringify({
      ...createDocument(),
      schemaVersion: 999,
    });
    expect(() => parseProjectText(source)).toThrow(/newer Drawic format/i);
  });

  it("rejects duplicate stable identifiers", () => {
    const cell = createEmptyCell("Duplicate", true, "same");
    const document = {
      ...createDocument({ cellId: "same" }),
      cells: [cell, { ...cell, name: "Second", isTop: false }],
    };
    expect(() => parseProjectText(JSON.stringify(document))).toThrow(/Duplicate stable identifier/);
  });

  it("rejects files with no active cell", () => {
    const document = {
      ...createDocument({ cellId: "cell_one" }),
      activeCellId: "missing",
    };
    expect(() => parseProjectText(JSON.stringify(document))).toThrow(/active cell/i);
  });
});
