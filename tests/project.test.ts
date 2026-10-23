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
