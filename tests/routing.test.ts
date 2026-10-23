import { describe, expect, it } from "vitest";
import { pathAvoidsObstacles, routeOrthogonal } from "../src/core/routing";

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
});
