import { describe, expect, it } from "vitest";
import { createEmptyCell } from "../src/core/model";
import { exportSpice, importSpice } from "../src/core/spice";
import { testLibrary, twoPinSymbol } from "./fixtures";

describe("SPICE interchange", () => {
  it("exports a deterministic golden netlist", () => {
    const cell = createEmptyCell("Main");
    cell.nodes.push({
      id: "r1",
      symbolId: twoPinSymbol.id,
      reference: "R1",
      value: "1k",
      x: 100,
      y: 100,
      rotation: 0,
      mirrored: false,
    });
    cell.annotations.push(
      { id: "in", kind: "net", text: "IN", x: 100, y: 80, size: 14 },
      { id: "out", kind: "net", text: "OUT", x: 100, y: 120, size: 14 },
    );
    expect(exportSpice(cell, testLibrary).text).toBe(
      [
        "* Drawic SPICE netlist",
        "* Cell: Main",
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
    expect(imported.cell.nodes).toHaveLength(2);
    expect(imported.cell.annotations.map((annotation) => annotation.text)).toEqual([
      "IN",
      "OUT",
      "OUT",
      "0",
    ]);
    const output = exportSpice(imported.cell, testLibrary).text;
    expect(output).toContain("R1 IN OUT 2k");
    expect(output).toContain("C1 OUT 0 10u");
  });

  it("reports non-SPICE electrical blocks instead of pretending to export them", () => {
    const cell = createEmptyCell("Blocks");
    cell.nodes.push({
      id: "op",
      symbolId: "opamp",
      reference: "U1",
      value: "",
      x: 100,
      y: 100,
      rotation: 0,
      mirrored: false,
    });
    const result = exportSpice(cell, testLibrary);
    expect(result.unsupportedDevices).toEqual(["U1: Operational Amplifier"]);
    expect(result.text).toContain("* Not exported by Drawic 0.1:");
  });
});
