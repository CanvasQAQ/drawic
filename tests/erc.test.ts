import { describe, expect, it } from "vitest";
import { runElectricalRules } from "../src/core/erc";
import { createEmptyCell } from "../src/core/model";
import { testLibrary } from "./fixtures";

describe("electrical rule checks", () => {
  it("finds duplicate and empty references", () => {
    const cell = createEmptyCell("ERC");
    cell.nodes.push(
      {
        id: "a",
        symbolId: "resistor",
        reference: "R1",
        value: "1k",
        x: 100,
        y: 100,
        rotation: 0,
        mirrored: false,
      },
      {
        id: "b",
        symbolId: "resistor",
        reference: "R1",
        value: "2k",
        x: 200,
        y: 100,
        rotation: 0,
        mirrored: false,
      },
      {
        id: "c",
        symbolId: "resistor",
        reference: "",
        value: "3k",
        x: 300,
        y: 100,
        rotation: 0,
        mirrored: false,
      },
    );
    const codes = runElectricalRules(cell, testLibrary).map((diagnostic) => diagnostic.code);
    expect(codes.filter((code) => code === "duplicate-reference")).toHaveLength(2);
    expect(codes).toContain("empty-reference");
  });

  it("finds dangling pins and invalid wire paths", () => {
    const cell = createEmptyCell("ERC");
    cell.nodes.push({
      id: "a",
      symbolId: "resistor",
      reference: "R1",
      value: "1k",
      x: 100,
      y: 100,
      rotation: 0,
      mirrored: false,
    });
    cell.wires.push({
      id: "bad",
      points: [
        { x: 0, y: 0 },
        { x: 20, y: 20 },
      ],
    });
    const diagnostics = runElectricalRules(cell, testLibrary);
    expect(diagnostics.filter((item) => item.code === "dangling-pin")).toHaveLength(2);
    expect(diagnostics).toContainEqual(expect.objectContaining({ code: "invalid-wire", itemId: "bad" }));
  });
});
