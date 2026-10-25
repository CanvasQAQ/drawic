import { describe, expect, it } from "vitest";
import { buildConnectivity, pinGraphKey } from "../src/core/connectivity";
import { createEmptyPage } from "../src/core/model";
import {
  addTestJunction,
  addTestNet,
  addTestWire,
  testLibrary,
  twoPinSymbol,
} from "./fixtures";

describe("net graph connectivity", () => {
  it("joins a pin touching a Wire without requiring a stored wire endpoint", () => {
    const page = createEmptyPage("Pin contact");
    page.nodes.push({
      id: "r1",
      symbolId: twoPinSymbol.id,
      reference: "R1",
      value: "1k",
      x: 100,
      y: 120,
      rotation: 0,
      mirrored: false,
    });
    addTestWire(
      page,
      "net_target",
      "wire_target",
      [
        { x: 20, y: 100 },
        { x: 220, y: 100 },
      ],
    );
    const connectivity = buildConnectivity(page, testLibrary);
    expect(connectivity.networkIdByPin.get(pinGraphKey("r1", 0))).toBe(
      connectivity.networkIdByWire.get("wire_target"),
    );
  });

  it("connects a pin endpoint to the wire's net", () => {
    const page = createEmptyPage("Connectivity");
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
      "w1",
      [
        { x: 100, y: 80 },
        { x: 180, y: 80 },
      ],
      { kind: "pin", deviceId: "r1", pinId: "1" },
    );
    const connectivity = buildConnectivity(page, testLibrary);
    expect(connectivity.networkIdByPin.get(pinGraphKey("r1", 0))).toBe(
      connectivity.networkIdByWire.get("w1"),
    );
    expect(connectivity.networkIdByPin.get(pinGraphKey("r1", 1))).not.toBe(
      connectivity.networkIdByWire.get("w1"),
    );
  });

  it("keeps geometry-only crossings in separate nets", () => {
    const page = createEmptyPage("Crossing");
    addTestWire(
      page,
      "net_h",
      "horizontal",
      [
        { x: 0, y: 100 },
        { x: 200, y: 100 },
      ],
    );
    addTestWire(
      page,
      "net_v",
      "vertical",
      [
        { x: 100, y: 0 },
        { x: 100, y: 200 },
      ],
    );
    const connectivity = buildConnectivity(page, testLibrary);
    expect(connectivity.networkIdByWire.get("horizontal")).not.toBe(
      connectivity.networkIdByWire.get("vertical"),
    );
    expect(connectivity.junctionPoints).toEqual([]);
  });

  it("treats all wires owned by one net as electrically connected", () => {
    const page = createEmptyPage("Net ownership");
    addTestWire(
      page,
      "net_1",
      "a",
      [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
      ],
    );
    addTestWire(
      page,
      "net_1",
      "b",
      [
        { x: 500, y: 500 },
        { x: 600, y: 500 },
      ],
    );
    const connectivity = buildConnectivity(page, testLibrary);
    expect(connectivity.networkIdByWire.get("a")).toBe(
      connectivity.networkIdByWire.get("b"),
    );
  });

  it("renders only explicit junction vertices as junction points", () => {
    const page = createEmptyPage("Junctions");
    addTestNet(page, "net_1");
    addTestJunction(page, "net_1", "junction_1", 100, 100);
    addTestWire(
      page,
      "net_1",
      "a",
      [
        { x: 0, y: 100 },
        { x: 100, y: 100 },
      ],
      { kind: "open" },
      { kind: "junction", junctionId: "junction_1" },
    );
    const connectivity = buildConnectivity(page, testLibrary);
    expect(connectivity.junctionPoints).toEqual([{ x: 100, y: 100 }]);
    expect(connectivity.networkIdByJunction.get("junction_1")).toBe(
      connectivity.networkIdByWire.get("a"),
    );
  });

  it("merges structural names and visible labels into one network", () => {
    const page = createEmptyPage("Names");
    addTestNet(page, "net_a", "VOUT");
    addTestNet(page, "net_b", "VOUT");
    addTestWire(
      page,
      "net_a",
      "a",
      [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
      ],
    );
    addTestWire(
      page,
      "net_b",
      "b",
      [
        { x: 200, y: 0 },
        { x: 250, y: 0 },
      ],
    );
    page.annotations.push({
      id: "label",
      kind: "net",
      text: "VOUT",
      x: 20,
      y: 0,
      size: 14,
      netId: "net_a",
      wireId: "a",
    });
    const connectivity = buildConnectivity(page, testLibrary);
    expect(connectivity.networkIdByWire.get("a")).toBe(
      connectivity.networkIdByWire.get("b"),
    );
    expect(
      connectivity.netNamesByGroup.get(
        connectivity.networkIdByWire.get("a")!,
      ),
    ).toEqual(["VOUT"]);
  });

  it("assigns one canonical generated name to every wire in a net", () => {
    const page = createEmptyPage("Generated names");
    addTestWire(
      page,
      "net_1",
      "a",
      [
        { x: 0, y: 100 },
        { x: 200, y: 100 },
      ],
    );
    addTestWire(
      page,
      "net_1",
      "b",
      [
        { x: 100, y: 100 },
        { x: 100, y: 180 },
      ],
    );
    const connectivity = buildConnectivity(page, testLibrary);
    expect(connectivity.netNameByWire.get("a")).toBe(
      connectivity.netNameByWire.get("b"),
    );
  });
});
