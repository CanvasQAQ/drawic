import { describe, expect, it } from "vitest";
import { buildConnectivity, pinGraphKey } from "../src/core/connectivity";
import { createEmptyCell } from "../src/core/model";
import { testLibrary, twoPinSymbol } from "./fixtures";

describe("wire connectivity", () => {
  it("connects a device pin to a wire", () => {
    const cell = createEmptyCell("Connectivity");
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
    cell.wires.push({
      id: "w1",
      points: [
        { x: 100, y: 80 },
        { x: 180, y: 80 },
      ],
    });
    const connectivity = buildConnectivity(cell, testLibrary);
    const firstPin = connectivity.networkIdByPin.get(pinGraphKey("r1", 0));
    const wire = connectivity.networkIdByWire.get("w1");
    expect(firstPin).toBe(wire);
    expect(connectivity.networkIdByPin.get(pinGraphKey("r1", 1))).not.toBe(wire);
  });

  it("keeps a crossing separate from a junction", () => {
    const cell = createEmptyCell("Crossing");
    cell.wires.push(
      { id: "horizontal", points: [{ x: 0, y: 100 }, { x: 200, y: 100 }] },
      { id: "vertical", points: [{ x: 100, y: 0 }, { x: 100, y: 200 }] },
    );
    const crossing = buildConnectivity(cell, testLibrary);
    expect(crossing.networkIdByWire.get("horizontal")).not.toBe(
      crossing.networkIdByWire.get("vertical"),
    );

    cell.junctions.push({ x: 100, y: 100 });
    const joined = buildConnectivity(cell, testLibrary);
    expect(joined.networkIdByWire.get("horizontal")).toBe(
      joined.networkIdByWire.get("vertical"),
    );
  });

  it("joins wires when an endpoint touches another wire", () => {
    const cell = createEmptyCell("Endpoint");
    cell.wires.push(
      { id: "a", points: [{ x: 0, y: 100 }, { x: 200, y: 100 }] },
      { id: "b", points: [{ x: 100, y: 100 }, { x: 100, y: 180 }] },
    );
    const connectivity = buildConnectivity(cell, testLibrary);
    expect(connectivity.networkIdByWire.get("a")).toBe(connectivity.networkIdByWire.get("b"));
    expect(connectivity.junctionPoints).toContainEqual({ x: 100, y: 100 });
  });

  it("merges nets that use the same named label", () => {
    const cell = createEmptyCell("Nets");
    cell.wires.push(
      { id: "a", points: [{ x: 0, y: 0 }, { x: 50, y: 0 }] },
      { id: "b", points: [{ x: 200, y: 0 }, { x: 250, y: 0 }] },
    );
    cell.annotations.push(
      { id: "la", kind: "net", text: "VOUT", x: 20, y: 0, size: 14 },
      { id: "lb", kind: "net", text: "VOUT", x: 220, y: 0, size: 14 },
    );
    const connectivity = buildConnectivity(cell, testLibrary);
    expect(connectivity.networkIdByWire.get("a")).toBe(connectivity.networkIdByWire.get("b"));
  });
});
