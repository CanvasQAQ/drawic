import { describe, expect, it } from "vitest";
import { createEmptyPage, type SymbolDefinition } from "../src/core/model";
import {
  AUTO_ROUTE_ESCAPE,
  pathAvoidsObstacles,
  routeOrthogonal,
  routeWireGeometry,
  routingObstacles,
} from "../src/core/routing";

const symbol: SymbolDefinition = {
  id: "routing-test",
  label: "Routing Test",
  category: "test",
  electrical: true,
  palette: true,
  frame: { x: -20, y: -10, width: 40, height: 20 },
  pins: [
    { key: "L", role: "passive", side: "west" },
    { key: "R", role: "passive", side: "east" },
  ],
  file: "routing-test.svg",
  svgBody: "",
};

describe("orthogonal wire routing", () => {
  it("uses a direct segment when nothing is in the way", () => {
    expect(
      routeOrthogonal({ x: 0, y: 0 }, { x: 100, y: 0 }, []),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]);
  });

  it("finds a short orthogonal detour around component and shape bounds", () => {
    const obstacle = { minX: 30, minY: -20, maxX: 70, maxY: 20 };
    const route = routeOrthogonal(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      [obstacle],
      { gridSize: 10, clearance: 5 },
    );
    expect(pathAvoidsObstacles(route, [obstacle])).toBe(true);
    expect(route.length).toBeLessThanOrEqual(4);
    for (let index = 1; index < route.length; index += 1) {
      const previous = route[index - 1]!;
      const current = route[index]!;
      expect(previous.x === current.x || previous.y === current.y).toBe(true);
    }
  });

  it("leaves a pin outward before routing and keeps the endpoint device as an obstacle", () => {
    const page = createEmptyPage("Escape");
    page.nodes.push({
      id: "node",
      symbolId: symbol.id,
      reference: "U1",
      value: "1",
      x: 100,
      y: 100,
      rotation: 0,
      mirrored: false,
    });
    const start = { x: 120, y: 100 };
    const route = routeWireGeometry(
      page,
      [symbol],
      start,
      { x: 20, y: 100 },
      { deviceId: "node", pinId: "R" },
    );

    expect(route[0]).toEqual(start);
    expect(route[1]!.x - route[0]!.x).toBeGreaterThanOrEqual(
      AUTO_ROUTE_ESCAPE,
    );
    expect(route[1]!.y).toBe(start.y);
    expect(pathAvoidsObstacles(route, routingObstacles(page, [symbol]))).toBe(
      true,
    );
  });
});
