import { describe, expect, it } from "vitest";
import { runElectricalRules } from "../src/core/erc";
import { createEmptyPage } from "../src/core/model";
import { addTestJunction, addTestWire, testLibrary } from "./fixtures";

describe("electrical rule checks", () => {
  it("finds duplicate and empty references", () => {
    const page = createEmptyPage("ERC");
    page.nodes.push(
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
    const codes = runElectricalRules(page, testLibrary).map((diagnostic) => diagnostic.code);
    expect(codes.filter((code) => code === "duplicate-reference")).toHaveLength(2);
    expect(codes).toContain("empty-reference");
  });

  it("finds dangling pins and invalid wire paths", () => {
    const page = createEmptyPage("ERC");
    page.nodes.push({
      id: "a",
      symbolId: "resistor",
      reference: "R1",
      value: "1k",
      x: 100,
      y: 100,
      rotation: 0,
      mirrored: false,
    });
    addTestWire(
      page,
      "net_bad",
      "bad",
      [
        { x: 0, y: 0 },
        { x: 20, y: 20 },
      ],
    );
    const diagnostics = runElectricalRules(page, testLibrary);
    expect(diagnostics.filter((item) => item.code === "dangling-pin")).toHaveLength(2);
    expect(diagnostics).toContainEqual(expect.objectContaining({ code: "invalid-wire", itemId: "bad" }));
  });

  it("reports broken Net graph invariants", () => {
    const page = createEmptyPage("Net graph ERC");
    addTestJunction(page, "net_1", "junction_1", 0, 0);
    addTestWire(
      page,
      "net_1",
      "wire",
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      { kind: "junction", junctionId: "junction_1" },
      { kind: "open" },
    );
    expect(
      runElectricalRules(page, testLibrary).some(
        (diagnostic) =>
          diagnostic.code === "net-graph-low-degree-junction",
      ),
    ).toBe(true);
  });
});
