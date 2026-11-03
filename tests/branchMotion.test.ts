import { describe, expect, it } from "vitest";
import { addWire } from "../src/core/editor";
import { nodePinPosition } from "../src/core/geometry";
import type { DrawingPage, Point, WireEndpoint } from "../src/core/model";
import { findNetGraphViolations } from "../src/core/netGraph";
import { planNodeMove, resolveWirePoints } from "../src/core/wireMotion";
import {
  addTestJunction,
  addTestWire,
  fixtureDocument,
  groundSymbol,
  nodePin,
  testLibrary,
  twoPinSymbol,
} from "./fixtures";

function groundedCircuit(groundX: number) {
  const document = fixtureDocument();
  const page = document.pages[0]!;
  const left = nodePin(20, 20);
  const right = nodePin(180, 20, "capacitor");
  const ground = nodePin(groundX, 160, "ground");
  page.nodes.push(left, right, ground);
  return { document, page, left, right, ground };
}

function expectGroundedT(page: DrawingPage, at: Point): void {
  const net = page.nets[0]!;
  expect(page.nets).toHaveLength(1);
  expect(net.junctions.map(junction => junction.point)).toEqual([at]);
  expect(net.wires).toHaveLength(3);

  const directions = new Set<string>();
  for (const wire of net.wires) {
    expect(resolveWirePoints(page, testLibrary, wire)).toEqual(wire.points);
    const startsAtDot = wire.start.kind === "junction";
    expect(startsAtDot ? wire.start : wire.end).toEqual({
      kind: "junction", junctionId: net.junctions[0]!.id,
    });
    expect((startsAtDot ? wire.end : wire.start).kind).toBe("pin");
    const path = startsAtDot ? wire.points : [...wire.points].reverse();
    expect(path[0]).toEqual(at);
    directions.add([Math.sign(path[1]!.x - at.x), Math.sign(path[1]!.y - at.y)].join(","));
  }
  expect(directions).toEqual(new Set(["-1,0", "1,0", "0,1"]));
  expect(findNetGraphViolations(page)).toEqual([]);
}

describe("grounded T branches", () => {
  it.each(["start", "end"])("keeps the T connected when moving the ground pin at the %s of a straight branch", (pinSide) => {
    const { page, left, right, ground } = groundedCircuit(100);
    const at = { x: 100, y: 80 };
    const dot = addTestJunction(page, "net", "junction", at.x, at.y);
    const junction: WireEndpoint = { kind: "junction", junctionId: dot.id };
    for (const node of [left, right]) {
      addTestWire(page, "net", node.id,
        [nodePinPosition(node, twoPinSymbol, 1), { x: node.x, y: at.y }, at],
        { kind: "pin", deviceId: node.id, pinId: "2" }, junction);
    }
    const pin = nodePinPosition(ground, groundSymbol, 0);
    const anchor: WireEndpoint = { kind: "pin", deviceId: ground.id, pinId: "GND" };
    if (pinSide === "start") {
      addTestWire(page, "net", "branch", [pin, at], anchor, junction);
    } else {
      addTestWire(page, "net", "branch", [at, pin], junction, anchor);
    }

    const moved = planNodeMove(page, testLibrary, new Set([ground.id]), { x: -30, y: 0 });
    expectGroundedT(moved, at);
  });

  it("joins a new ground lead where it first meets the trunk before the clicked attachment", () => {
    const { document, page, left, right, ground } = groundedCircuit(70);
    const clicked = { x: 100, y: 80 };
    const divergence = { x: ground.x, y: clicked.y };
    const trunk = addWire(document, page.id, {
      id: "trunk",
      points: [
        nodePinPosition(left, twoPinSymbol, 1), { x: left.x, y: clicked.y },
        { x: right.x, y: clicked.y }, nodePinPosition(right, twoPinSymbol, 1),
      ],
      startAnchor: { deviceId: left.id, pinId: "2" },
      endAnchor: { deviceId: right.id, pinId: "2" },
    });
    const wired = addWire(trunk, page.id, {
      id: "ground-lead",
      points: [nodePinPosition(ground, groundSymbol, 0), divergence, clicked],
      startAnchor: { deviceId: ground.id, pinId: "GND" },
      junctionPoints: [clicked],
    });
    expectGroundedT(wired.pages[0]!, divergence);
  });
});
