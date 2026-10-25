import { describe, expect, it } from "vitest";
import { buildSchematicSvg } from "../src/core/export/svg";
import { buildBitmapPdf } from "../src/core/export/pdf";
import { createEmptyPage } from "../src/core/model";
import { addTestJunction, addTestNet, addTestWire, testLibrary, twoPinSymbol } from "./fixtures";

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
    addTestWire(
      page,
      "net_1",
      "wire",
      [
        { x: 100, y: 80 },
        { x: 180, y: 80 },
      ],
    );
    page.nets[0]!.color = "#1d4ed8";
    const first = buildSchematicSvg(page, testLibrary);
    const second = buildSchematicSvg(page, testLibrary);
    expect(first).toBe(second);
    expect(first).toContain("<svg");
    expect(first).toContain("Export &amp; Test");
    expect(first).toContain('stroke="#1d4ed8"');
    expect(first).not.toMatch(/(?:src|href)="https?:|url\(https?:/);
  });

  it("exports arc hops for electrically separate wire crossings", () => {
    const page = createEmptyPage("Crossing export");
    addTestWire(
      page,
      "net_horizontal",
      "horizontal",
      [
          { x: 20, y: 100 },
          { x: 220, y: 100 },
      ],
    );
    addTestWire(
      page,
      "net_vertical",
      "vertical",
      [
          { x: 120, y: 20 },
          { x: 120, y: 180 },
      ],
    );
    const svg = buildSchematicSvg(page, testLibrary);
    expect(svg).toContain("Q 120 90");
  });

  it("exports Junctions with their owning Net color", () => {
    const page = createEmptyPage("Colored junction");
    addTestNet(page, "net_color", "VOUT").color = "#0f766e";
    addTestJunction(page, "net_color", "junction_color", 100, 100);
    const svg = buildSchematicSvg(page, testLibrary);
    expect(svg).toContain('class="junction"');
    expect(svg).toContain('fill="#0f766e"');
  });

  it("exports rich Name text with the requested font and subscript metrics", () => {
    const page = createEmptyPage("Rich labels");
    page.nodes.push({
      id: "m1",
      symbolId: twoPinSymbol.id,
      reference: "M1",
      value: "NMOS",
      x: 100,
      y: 100,
      rotation: 0,
      mirrored: false,
      labelLayout: {
        reference: {
          offset: { x: 0, y: 0 },
          hidden: false,
          position: { x: 115, y: 105 },
          anchor: "start",
          placement: "default",
          side: "east",
        },
        value: {
          offset: { x: 0, y: 0 },
          hidden: true,
        },
      },
    });
    const svg = buildSchematicSvg(page, testLibrary, {
      typography: { family: "serif", scale: 1.25 },
    });
    expect(svg).toContain('data-rich-role="base"');
    expect(svg).toContain('data-rich-role="subscript"');
    expect(svg).toContain("Liberation Serif");
    expect(svg).toContain("font-size=\"18.89\"");
    expect(svg).toContain("font-style=\"italic\"");
    expect(svg).toContain("dy=\"8.31\"");
    expect(svg).not.toContain('data-label-kind="value"');
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
