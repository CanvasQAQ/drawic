import { describe, expect, it } from "vitest";
import { createEmptyPage } from "../src/core/model";
import { normalizePageWireOverlaps } from "../src/core/wireMerge";

describe("collinear wire normalization", () => {
  it("splits an overlapping branch at its divergence junction", () => {
    const page = createEmptyPage("Branch overlap");
    page.wires.push(
      {
        id: "through",
        points: [
          { x: 610, y: 420 },
          { x: 900, y: 420 },
        ],
      },
      {
        id: "branch",
        points: [
          { x: 660, y: 420 },
          { x: 750, y: 420 },
          { x: 750, y: 450 },
        ],
      },
    );
    page.junctions.push(
      { x: 740, y: 420 },
      { x: 660, y: 420 },
    );

    const normalized = normalizePageWireOverlaps(page);
    expect(normalized.wires[0]?.name).toBe("N001");
    expect(normalized.wires[1]).toMatchObject({
      name: "N001",
      points: [
        { x: 750, y: 420 },
        { x: 750, y: 450 },
      ],
    });
    expect(normalized.junctions).toEqual([{ x: 750, y: 420 }]);
  });

  it("merges collinear continuation without creating a junction", () => {
    const page = createEmptyPage("Continuation overlap");
    page.wires.push(
      {
        id: "through",
        points: [
          { x: 610, y: 510 },
          { x: 860, y: 510 },
        ],
      },
      {
        id: "continuation",
        points: [
          { x: 720, y: 510 },
          { x: 870, y: 510 },
          { x: 870, y: 530 },
        ],
      },
    );
    page.junctions.push({ x: 720, y: 510 });

    const normalized = normalizePageWireOverlaps(page);
    expect(normalized.wires).toHaveLength(1);
    expect(normalized.wires[0]).toMatchObject({
      name: "N001",
      points: [
        { x: 610, y: 510 },
        { x: 870, y: 510 },
        { x: 870, y: 530 },
      ],
    });
    expect(normalized.junctions).toEqual([]);
  });
});
