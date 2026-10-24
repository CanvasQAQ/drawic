import { describe, expect, it } from "vitest";
import { buildSchematicSvg } from "../src/core/export/svg";
import { buildBitmapPdf } from "../src/core/export/pdf";
import { createEmptyPage } from "../src/core/model";
import { testLibrary, twoPinSymbol } from "./fixtures";

describe("export formats", () => {
  it("produces deterministic standalone SVG", () => {
    const page = createEmptyPage("Export & Test");
    page.nodes.push({
      id: "r1",
      symbolId: twoPinSymbol.id,
      reference: "R1",
      value: "1k",
      x: 100,
      y: 100,
      rotation: 0,
      mirrored: false,
    });
    page.wires.push({
      id: "wire",
      points: [
        { x: 100, y: 80 },
        { x: 180, y: 80 },
      ],
    });
    const first = buildSchematicSvg(page, testLibrary);
    const second = buildSchematicSvg(page, testLibrary);
    expect(first).toBe(second);
    expect(first).toContain("<svg");
    expect(first).toContain("Export &amp; Test");
    expect(first).not.toMatch(/(?:src|href)="https?:|url\(https?:/);
  });

  it("exports arc hops for electrically separate wire crossings", () => {
    const page = createEmptyPage("Crossing export");
    page.wires.push(
      {
        id: "horizontal",
        points: [
          { x: 20, y: 100 },
          { x: 220, y: 100 },
        ],
      },
      {
        id: "vertical",
        points: [
          { x: 120, y: 20 },
          { x: 120, y: 180 },
        ],
      },
    );
    const svg = buildSchematicSvg(page, testLibrary);
    expect(svg).toContain("Q 120 90");
  });

  it("constructs a deterministic, non-empty bitmap PDF", () => {
    const bitmap = {
      width: 2,
      height: 1,
      rgba: new Uint8Array([255, 0, 0, 255, 0, 0, 255, 255]),
    };
    const first = buildBitmapPdf(bitmap);
    const second = buildBitmapPdf(bitmap);
    expect(first.byteLength).toBeGreaterThan(100);
    expect(new TextDecoder().decode(first.slice(0, 8))).toBe("%PDF-1.4");
    expect(new TextDecoder().decode(first.slice(-6))).toBe("%%EOF\n");
    expect(first).toEqual(second);
  });
});
