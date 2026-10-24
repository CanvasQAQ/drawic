import { describe, expect, it } from "vitest";
import { createEmptyPage, type SymbolDefinition } from "../src/core/model";
import { exportSpice, importSpice } from "../src/core/spice";
import { addTestNet, addTestWire, testLibrary, twoPinSymbol } from "./fixtures";

describe("SPICE interchange", () => {
  it("exports a deterministic golden netlist", () => {
    const page = createEmptyPage("Main");
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
    page.annotations.push(
      { id: "in", kind: "net", text: "IN", x: 100, y: 80, size: 14 },
      { id: "out", kind: "net", text: "OUT", x: 100, y: 120, size: 14 },
    );
    expect(exportSpice(page, testLibrary).text).toBe(
      [
        "* Drawic SPICE netlist",
        "* Page: Main",
        "* Generated locally; values are normalized only by trimming whitespace.",
        "R1 IN OUT 1k",
        ".end",
        "",
      ].join("\n"),
    );
  });

  it("imports and re-exports basic elements without losing connectivity", () => {
    const imported = importSpice("Basic RC\nR1 IN OUT 2k\nC1 OUT 0 10u\n.end\n", {
      library: testLibrary,
      idFactory: (() => {
        let index = 0;
        return (prefix: string) => `${prefix}_${++index}`;
      })(),
    });
    expect(imported.page.nodes).toHaveLength(2);
    expect(imported.page.annotations.map((annotation) => annotation.text)).toEqual([
      "IN",
      "OUT",
      "OUT",
      "0",
    ]);
    const output = exportSpice(imported.page, testLibrary).text;
    expect(output).toContain("R1 IN OUT 2k");
    expect(output).toContain("C1 OUT 0 10u");
  });

  it("reports non-SPICE electrical blocks instead of pretending to export them", () => {
    const page = createEmptyPage("Blocks");
    page.nodes.push({
      id: "op",
      symbolId: "opamp",
      reference: "U1",
      value: "",
      x: 100,
      y: 100,
      rotation: 0,
      mirrored: false,
    });
    const result = exportSpice(page, testLibrary);
    expect(result.unsupportedDevices).toEqual(["U1: Operational Amplifier"]);
    expect(result.text).toContain("* Not exported by Drawic 0.2:");
  });

  it("ties the bulk node of a three-terminal MOS symbol to its source", () => {
    const nmos: SymbolDefinition = {
      id: "nmos",
      label: "NMOS",
      category: "transistor",
      electrical: true,
      palette: true,
      frame: { x: -24, y: -24, width: 48, height: 48 },
      pins: [
        { key: "D", role: "drain", side: "north" },
        { key: "G", role: "gate", side: "west" },
        { key: "S", role: "source", side: "south" },
      ],
      file: "nmos.svg",
      svgBody: "",
    };
    const page = createEmptyPage("Three-terminal MOS");
    page.nodes.push({
      id: "m1",
      symbolId: "nmos",
      reference: "M1",
      value: "NMOS",
      x: 100,
      y: 100,
      rotation: 0,
      mirrored: false,
    });
    addTestNet(page, "net_drain", "DRAIN");
    addTestNet(page, "net_gate", "GATE");
    addTestNet(page, "net_source", "SOURCE");
    addTestWire(
      page,
      "net_drain",
      "drain",
      [{ x: 100, y: 76 }, { x: 100, y: 40 }],
      { kind: "pin", deviceId: "m1", pinId: "D" },
    );
    addTestWire(
      page,
      "net_gate",
      "gate",
      [{ x: 76, y: 100 }, { x: 40, y: 100 }],
      { kind: "pin", deviceId: "m1", pinId: "G" },
    );
    addTestWire(
      page,
      "net_source",
      "source",
      [{ x: 100, y: 124 }, { x: 100, y: 160 }],
      { kind: "pin", deviceId: "m1", pinId: "S" },
    );
    page.annotations.push(
      {
        id: "d",
        kind: "net",
        text: "DRAIN",
        x: 100,
        y: 50,
        size: 14,
        netId: "net_drain",
        wireId: "drain",
      },
      {
        id: "g",
        kind: "net",
        text: "GATE",
        x: 50,
        y: 100,
        size: 14,
        netId: "net_gate",
        wireId: "gate",
      },
      {
        id: "s",
        kind: "net",
        text: "SOURCE",
        x: 100,
        y: 150,
        size: 14,
        netId: "net_source",
        wireId: "source",
      },
    );

    expect(exportSpice(page, [nmos]).text).toContain(
      "M1 DRAIN GATE SOURCE SOURCE NMOS",
    );
  });

  it("warns instead of failing when a four-terminal MOS netlist meets a three-terminal symbol", () => {
    const nmos: SymbolDefinition = {
      id: "nmos",
      label: "NMOS",
      category: "transistor",
      electrical: true,
      palette: true,
      frame: { x: -24, y: -24, width: 48, height: 48 },
      pins: [
        { key: "D", role: "drain", side: "north" },
        { key: "G", role: "gate", side: "west" },
        { key: "S", role: "source", side: "south" },
      ],
      file: "nmos.svg",
      svgBody: "",
    };
    const imported = importSpice("M1 DRAIN GATE SOURCE BULK NMOS\n.end\n", {
      library: [nmos],
    });
    expect(imported.page.nodes).toHaveLength(1);
    expect(imported.page.annotations).toHaveLength(3);
    expect(imported.warnings).toEqual([
      "M1: 1 terminal net(s) omitted because nmos is three-terminal.",
    ]);
  });

  it("selects a four-terminal MOS variant when importing a bulk net", () => {
    const nmos: SymbolDefinition = {
      id: "nmos",
      label: "NMOS",
      category: "transistor",
      electrical: true,
      palette: true,
      frame: { x: -24, y: -24, width: 48, height: 48 },
      pins: [
        { key: "D", role: "drain", side: "north" },
        { key: "G", role: "gate", side: "west" },
        { key: "S", role: "source", side: "south" },
      ],
      file: "nmos.svg",
      svgBody: "",
    };
    const nmosBase: SymbolDefinition = {
      ...nmos,
      id: "nmos--base",
      variantOf: "nmos",
      variantId: "base",
      label: "NMOS (4-terminal)",
      pins: [...nmos.pins, { key: "B", role: "bulk", side: "east" }],
      file: "variants/nmos--base.svg",
    };
    const imported = importSpice("M1 DRAIN GATE SOURCE BULK NMOS\n.end\n", {
      library: [nmos, nmosBase],
    });
    expect(imported.page.nodes[0]?.symbolId).toBe("nmos--base");
    expect(imported.page.annotations).toHaveLength(4);
    expect(imported.warnings).toEqual([]);
  });
});
