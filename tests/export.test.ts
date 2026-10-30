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
  it("exports styled text, colored net labels, and shape paint attributes", () => {
    const page = createEmptyPage("Styled export");
    addTestNet(page, "net_vout", "VOUT").color = "#0f766e";
    addTestWire(
      page,
      "net_vout",
      "wire_vout",
      [
        { x: 100, y: 100 },
        { x: 200, y: 100 },
      ],
    );
    page.annotations.push({
      id: "label_net",
      kind: "net",
      text: "VOUT",
      x: 100,
      y: 92,
      size: 14,
      wireId: "wire_vout",
      netId: "net_vout",
    });
    page.annotations.push({
      id: "label_text",
      kind: "text",
      text: "Line one\nLine two",
      x: 20,
      y: 300,
      size: 18,
      color: "#b42318",
      align: "middle",
      bold: true,
      italic: true,
      rotation: 90,
    });
    page.shapes.push({
      id: "shape_styled",
      kind: "rectangle",
      x: 10,
      y: 10,
      width: 120,
      height: 60,
      rotation: 0,
      stroke: "#0f766e",
      fill: "#ffffff",
      strokeWidth: 3,
      dash: "dashed",
      opacity: 0.5,
      fillOpacity: 0.4,
      text: "Note\nA",
      textSize: 18,
      textColor: "#1d4ed8",
      textAlign: "start",
      textBold: false,
    });
    const svg = buildSchematicSvg(page, testLibrary);
    expect(svg).toContain('class="annotation annotation-net"');
    expect(svg).toContain('class="annotation annotation-text"');
    expect(svg).toContain('fill="#0f766e"');
    expect(svg).toContain('paint-order="stroke"');
    expect(svg).toContain('stroke="#ffffff"');
    expect(svg).toContain('fill="#b42318"');
    expect(svg).toContain('font-style="italic"');
    expect(svg).toContain('transform="rotate(90 20 300)"');
    expect(svg).toContain("<tspan");
    expect(svg).not.toContain("⌁");
    expect(svg).toContain('stroke-width="3"');
    expect(svg).toContain('stroke-dasharray="7 5"');
    expect(svg).toContain('opacity="0.5"');
    expect(svg).toContain('fill-opacity="0.4"');
    expect(svg).toContain('fill="#1d4ed8"');
    expect(svg).toContain('font-weight="400"');
  });


  it("exports block notes with header and heading text", () => {
    const page = createEmptyPage("Note export");
    page.shapes.push({
      id: "note_1",
      kind: "note",
      x: 20,
      y: 30,
      width: 240,
      height: 120,
      rotation: 0,
      stroke: "#b98433",
      fill: "#f2c777",
      strokeWidth: 1.5,
      dash: "solid",
      opacity: 1,
      fillOpacity: 0.22,
      text: "Gain stage\nSets closed-loop gain",
      textSize: 13,
      textColor: "#6b4d20",
      textAlign: "start",
      textBold: false,
    });
    const svg = buildSchematicSvg(page, testLibrary);
    expect(svg).not.toContain('class="note-tag"');
    expect(svg).not.toContain(">NOTE</text>");
    expect(svg).toContain("Gain stage");
    expect(svg).toContain("Sets closed-loop gain");
    expect(svg).toContain('fill-opacity="0.22"');
    expect(svg).toContain('font-weight="700"');
    expect(svg).toContain('font-weight="400"');
  });

});
