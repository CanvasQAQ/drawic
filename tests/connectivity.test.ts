import { describe, expect, it } from "vitest";
import { buildConnectivity, pinGraphKey } from "../src/core/connectivity";
import { createEmptyPage } from "../src/core/model";
import { testLibrary, twoPinSymbol } from "./fixtures";

describe("wire connectivity", () => {
  it("connects a device pin to a wire", () => {
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
    page.wires.push({
      id: "w1",
      points: [
        { x: 100, y: 80 },
        { x: 180, y: 80 },
      ],
    });
    const connectivity = buildConnectivity(page, testLibrary);
    const firstPin = connectivity.networkIdByPin.get(pinGraphKey("r1", 0));
    const wire = connectivity.networkIdByWire.get("w1");
    expect(firstPin).toBe(wire);
    expect(connectivity.networkIdByPin.get(pinGraphKey("r1", 1))).not.toBe(wire);
    expect(connectivity.junctionPoints).toEqual([]);
  });

  it("keeps a crossing separate from a junction", () => {
    const page = createEmptyPage("Crossing");
    page.wires.push(
      { id: "horizontal", points: [{ x: 0, y: 100 }, { x: 200, y: 100 }] },
      { id: "vertical", points: [{ x: 100, y: 0 }, { x: 100, y: 200 }] },
    );
    const crossing = buildConnectivity(page, testLibrary);
    expect(crossing.networkIdByWire.get("horizontal")).not.toBe(
      crossing.networkIdByWire.get("vertical"),
    );

    page.junctions.push({ x: 100, y: 100 });
    const joined = buildConnectivity(page, testLibrary);
    expect(joined.networkIdByWire.get("horizontal")).toBe(
      joined.networkIdByWire.get("vertical"),
    );
  });

  it("keeps passive endpoint overlap separate until a junction is added", () => {
    const page = createEmptyPage("Endpoint");
    page.wires.push(
      { id: "a", points: [{ x: 0, y: 100 }, { x: 200, y: 100 }] },
      { id: "b", points: [{ x: 100, y: 100 }, { x: 100, y: 180 }] },
    );
    const connectivity = buildConnectivity(page, testLibrary);
    expect(connectivity.networkIdByWire.get("a")).not.toBe(
      connectivity.networkIdByWire.get("b"),
    );
    expect(connectivity.junctionPoints).toEqual([]);

    page.junctions.push({ x: 100, y: 100 });
    const joined = buildConnectivity(page, testLibrary);
    expect(joined.networkIdByWire.get("a")).toBe(
      joined.networkIdByWire.get("b"),
    );
    expect(joined.junctionPoints).toEqual([{ x: 100, y: 100 }]);
  });

  it("merges nets that use the same named label", () => {
    const page = createEmptyPage("Nets");
    page.wires.push(
      { id: "a", points: [{ x: 0, y: 0 }, { x: 50, y: 0 }] },
      { id: "b", points: [{ x: 200, y: 0 }, { x: 250, y: 0 }] },
    );
    page.annotations.push(
      { id: "la", kind: "net", text: "VOUT", x: 20, y: 0, size: 14 },
      { id: "lb", kind: "net", text: "VOUT", x: 220, y: 0, size: 14 },
    );
    const connectivity = buildConnectivity(page, testLibrary);
    expect(connectivity.networkIdByWire.get("a")).toBe(connectivity.networkIdByWire.get("b"));
  });

  it("merges disconnected wires with the same explicit name", () => {
    const page = createEmptyPage("Wire names");
    page.wires.push(
      {
        id: "a",
        name: "VREF",
        points: [{ x: 0, y: 0 }, { x: 50, y: 0 }],
      },
      {
        id: "b",
        name: "VREF",
        points: [{ x: 200, y: 0 }, { x: 250, y: 0 }],
      },
    );
    const connectivity = buildConnectivity(page, testLibrary);
    expect(connectivity.networkIdByWire.get("a")).toBe(
      connectivity.networkIdByWire.get("b"),
    );
    expect(
      connectivity.netNamesByGroup.get(
        connectivity.networkIdByWire.get("a")!,
      ),
    ).toEqual(["VREF"]);
  });

  it("marks intersections inside an already merged net", () => {
    const page = createEmptyPage("Merged crossing");
    page.wires.push(
      {
        id: "horizontal",
        name: "VCC",
        points: [{ x: 0, y: 100 }, { x: 200, y: 100 }],
      },
      {
        id: "vertical",
        name: "VCC",
        points: [{ x: 100, y: 0 }, { x: 100, y: 200 }],
      },
    );
    const connectivity = buildConnectivity(page, testLibrary);
    expect(connectivity.junctionPoints).toContainEqual({ x: 100, y: 100 });
  });

  it("assigns one canonical name to every wire in a connected net", () => {
    const page = createEmptyPage("Canonical names");
    page.wires.push(
      {
        id: "named",
        name: "VOUT",
        points: [{ x: 0, y: 100 }, { x: 200, y: 100 }],
      },
      {
        id: "unnamed",
        points: [{ x: 100, y: 100 }, { x: 100, y: 180 }],
      },
    );
    page.junctions.push({ x: 100, y: 100 });
    const connectivity = buildConnectivity(page, testLibrary);
    expect(connectivity.netNameByWire.get("named")).toBe("VOUT");
    expect(connectivity.netNameByWire.get("unnamed")).toBe("VOUT");
  });

  it("gives connected unnamed wires the same generated net name", () => {
    const page = createEmptyPage("Generated names");
    page.wires.push(
      { id: "a", points: [{ x: 0, y: 100 }, { x: 200, y: 100 }] },
      { id: "b", points: [{ x: 100, y: 100 }, { x: 100, y: 180 }] },
    );
    page.junctions.push({ x: 100, y: 100 });
    const connectivity = buildConnectivity(page, testLibrary);
    expect(connectivity.netNameByWire.get("a")).toBe(
      connectivity.netNameByWire.get("b"),
    );
  });

  it("merges deliberately overlapping collinear wires without showing a redundant junction", () => {
    const page = createEmptyPage("Collinear overlap");
    page.wires.push(
      {
        id: "existing",
        points: [{ x: 0, y: 100 }, { x: 200, y: 100 }],
      },
      {
        id: "overlap",
        points: [{ x: 100, y: 100 }, { x: 200, y: 100 }],
      },
    );
    page.junctions.push({ x: 100, y: 100 });
    const connectivity = buildConnectivity(page, testLibrary);
    expect(connectivity.networkIdByWire.get("existing")).toBe(
      connectivity.networkIdByWire.get("overlap"),
    );
    expect(connectivity.junctionPoints).toEqual([]);
  });
});
