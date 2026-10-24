import { describe, expect, it } from "vitest";
import { buildConnectivity } from "../src/core/connectivity";
import { createEmptyPage } from "../src/core/model";
import {
  WIRE_HOP_RADIUS,
  wireHops,
  wireOverlaps,
  wirePathData,
} from "../src/core/wireHops";
import { addTestNet, addTestWire, testLibrary } from "./fixtures";

describe("wire crossing hops", () => {
  it("draws a hop for crossing wires owned by different nets", () => {
    const page = createEmptyPage("Crossing hops");
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
    const hops = wireHops(connectivity);
    expect(hops.get("horizontal")).toEqual([{ x: 100, y: 100 }]);
    expect(hops.has("vertical")).toBe(false);
    const path = wirePathData(
      connectivity.segments
        .filter((segment) => segment.wireId === "horizontal")
        .flatMap((segment) => [segment.start, segment.end]),
      hops.get("horizontal"),
    );
    expect(path).toContain(`L ${100 - WIRE_HOP_RADIUS} 100`);
    expect(path).toContain("Q 100 90");
  });

  it("draws no hop for a crossing inside the same net", () => {
    const page = createEmptyPage("Same net crossing");
    addTestNet(page, "net_1", "VCC");
    addTestWire(
      page,
      "net_1",
      "horizontal",
      [
        { x: 0, y: 100 },
        { x: 200, y: 100 },
      ],
    );
    addTestWire(
      page,
      "net_1",
      "vertical",
      [
        { x: 100, y: 0 },
        { x: 100, y: 200 },
      ],
    );
    expect(wireHops(buildConnectivity(page, testLibrary))).toEqual(new Map());
  });

  it("treats separable endpoint overlap as a visual crossing", () => {
    const page = createEmptyPage("Endpoint hop");
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
      "branch",
      [
        { x: 100, y: 100 },
        { x: 100, y: 200 },
      ],
    );
    expect(wireHops(buildConnectivity(page, testLibrary)).get("horizontal")).toEqual([
      { x: 100, y: 100 },
    ]);
  });

  it("suppresses duplicate collinear geometry inside one net", () => {
    const page = createEmptyPage("Merged overlap");
    addTestNet(page, "net_1", "VCC");
    addTestWire(
      page,
      "net_1",
      "a",
      [
        { x: 0, y: 100 },
        { x: 100, y: 100 },
      ],
    );
    addTestWire(
      page,
      "net_1",
      "b",
      [
        { x: 50, y: 100 },
        { x: 150, y: 100 },
      ],
    );
    const connectivity = buildConnectivity(page, testLibrary);
    const overlaps = wireOverlaps(connectivity);
    expect(overlaps.get("b")).toEqual([
      { segmentIndex: 0, start: 0, end: 0.5 },
    ]);
  });
});
