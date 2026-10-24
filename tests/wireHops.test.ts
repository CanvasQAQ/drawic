import { describe, expect, it } from "vitest";
import { buildConnectivity } from "../src/core/connectivity";
import { createEmptyPage } from "../src/core/model";
import {
  WIRE_HOP_RADIUS,
  wireHops,
  wireOverlaps,
  wirePathData,
} from "../src/core/wireHops";
import { testLibrary } from "./fixtures";

describe("wire crossing hops", () => {
  it("draws a hop for crossing wires that are not on the same net", () => {
    const page = createEmptyPage("Crossing hops");
    page.wires.push(
      { id: "horizontal", points: [{ x: 0, y: 100 }, { x: 200, y: 100 }] },
      { id: "vertical", points: [{ x: 100, y: 0 }, { x: 100, y: 200 }] },
    );
    const connectivity = buildConnectivity(page, testLibrary);
    const hops = wireHops(connectivity);

    expect(hops.get("horizontal")).toEqual([{ x: 100, y: 100 }]);
    expect(hops.has("vertical")).toBe(false);
    const path = wirePathData(page.wires[0]!.points, hops.get("horizontal"));
    expect(path).toContain(`L ${100 - WIRE_HOP_RADIUS} 100`);
    expect(path).toContain("Q 100 90");
  });

  it("removes the hop when an explicit junction joins the wires", () => {
    const page = createEmptyPage("Joined crossing");
    page.wires.push(
      { id: "horizontal", points: [{ x: 0, y: 100 }, { x: 200, y: 100 }] },
      { id: "vertical", points: [{ x: 100, y: 0 }, { x: 100, y: 200 }] },
    );
    page.junctions.push({ x: 100, y: 100 });
    expect(wireHops(buildConnectivity(page, testLibrary))).toEqual(new Map());
  });

  it("treats passive endpoint overlap as a visual crossing", () => {
    const page = createEmptyPage("Endpoint hop");
    page.wires.push(
      { id: "horizontal", points: [{ x: 0, y: 100 }, { x: 200, y: 100 }] },
      { id: "branch", points: [{ x: 100, y: 100 }, { x: 100, y: 200 }] },
    );
    const connectivity = buildConnectivity(page, testLibrary);
    expect(wireHops(connectivity).get("horizontal")).toEqual([
      { x: 100, y: 100 },
    ]);
  });

  it("hops the through-wire when a horizontal endpoint lands on a vertical wire", () => {
    const page = createEmptyPage("Endpoint on vertical");
    page.wires.push(
      { id: "ending", points: [{ x: 100, y: 100 }, { x: 200, y: 100 }] },
      { id: "vertical", points: [{ x: 100, y: 0 }, { x: 100, y: 200 }] },
    );
    const connectivity = buildConnectivity(page, testLibrary);
    expect(wireHops(connectivity).get("vertical")).toEqual([
      { x: 100, y: 100 },
    ]);
  });

  it("suppresses duplicate collinear geometry inside one merged net", () => {
    const page = createEmptyPage("Merged overlap");
    page.wires.push(
      {
        id: "a",
        name: "VCC",
        points: [{ x: 0, y: 100 }, { x: 100, y: 100 }],
      },
      {
        id: "b",
        name: "VCC",
        points: [{ x: 50, y: 100 }, { x: 150, y: 100 }],
      },
    );
    const connectivity = buildConnectivity(page, testLibrary);
    const overlaps = wireOverlaps(connectivity);
    expect(overlaps.get("b")).toEqual([
      { segmentIndex: 0, start: 0, end: 0.5 },
    ]);
    expect(
      wirePathData(page.wires[1]!.points, [], overlaps.get("b")),
    ).not.toContain("M 50 100");
  });

  it("does not draw a hop on deliberately overlapping collinear wires", () => {
    const page = createEmptyPage("Overlapping branch start");
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
    expect(wireHops(connectivity)).toEqual(new Map());
    expect(wireOverlaps(connectivity).get("overlap")).toEqual([
      { segmentIndex: 0, start: 0, end: 1 },
    ]);
  });
});
