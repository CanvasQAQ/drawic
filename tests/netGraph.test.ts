import { describe, expect, it } from "vitest";
import { createEmptyPage, type WireEndpoint } from "../src/core/model";
import { pointsEqual } from "../src/core/geometry";
import {
  canonicalizePageNetGraph,
  findNetGraphViolations,
} from "../src/core/netGraph";
import { addTestJunction, addTestNet, addTestWire } from "./fixtures";

const junction = (id: string): WireEndpoint => ({
  kind: "junction",
  junctionId: id,
});

describe("net graph normalization", () => {
  it("splits a wire through a junction into two edge wires", () => {
    const page = createEmptyPage("Junction split");
    addTestWire(
      page,
      "net_1",
      "through",
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    );
    addTestJunction(page, "net_1", "junction_1", 50, 0);
    addTestWire(
      page,
      "net_1",
      "branch",
      [
        { x: 50, y: 0 },
        { x: 50, y: 50 },
      ],
      junction("junction_1"),
      { kind: "open" },
    );

    const normalized = canonicalizePageNetGraph(page);
    expect(normalized.nets[0]?.wires).toHaveLength(3);
    expect(findNetGraphViolations(normalized)).toEqual([]);
    const throughEdges = normalized.nets[0]?.wires.filter(
      (wire) => wire.id !== "branch",
    );
    expect(throughEdges).toHaveLength(2);
    expect(
      throughEdges?.every(
        (wire) => wire.points.some((point) => pointsEqual(point, { x: 50, y: 0 })),
      ),
    ).toBe(true);
    expect(
      throughEdges?.filter((wire) =>
        [wire.start, wire.end].some(
          (endpoint) =>
            endpoint.kind === "junction" &&
            endpoint.junctionId === "junction_1",
        ),
      ),
    ).toHaveLength(2);
  });

  it("merges a degree-two junction back into one polyline", () => {
    const page = createEmptyPage("Degree two");
    addTestJunction(page, "net_1", "junction_1", 100, 0);
    addTestWire(
      page,
      "net_1",
      "left",
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      { kind: "open" },
      junction("junction_1"),
    );
    addTestWire(
      page,
      "net_1",
      "right",
      [
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ],
      junction("junction_1"),
      { kind: "open" },
    );

    const normalized = canonicalizePageNetGraph(page);
    expect(normalized.nets[0]?.junctions).toEqual([]);
    expect(normalized.nets[0]?.wires).toHaveLength(1);
    expect(normalized.nets[0]?.wires[0]?.points).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ]);
  });

  it("keeps a true three-way branch and its junction", () => {
    const page = createEmptyPage("Branch");
    addTestJunction(page, "net_1", "junction_1", 100, 0);
    addTestWire(
      page,
      "net_1",
      "left",
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      { kind: "open" },
      junction("junction_1"),
    );
    addTestWire(
      page,
      "net_1",
      "right",
      [
        { x: 100, y: 0 },
        { x: 200, y: 0 },
      ],
      junction("junction_1"),
      { kind: "open" },
    );
    addTestWire(
      page,
      "net_1",
      "branch",
      [
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ],
      junction("junction_1"),
      { kind: "open" },
    );

    const normalized = canonicalizePageNetGraph(page);
    expect(normalized.nets[0]?.junctions).toHaveLength(1);
    expect(normalized.nets[0]?.wires).toHaveLength(3);
    expect(findNetGraphViolations(normalized)).toEqual([]);
  });

  it("moves a branch junction to the point where it leaves the trunk", () => {
    const page = createEmptyPage("Divergence");
    addTestWire(
      page,
      "net_1",
      "trunk",
      [
        { x: 0, y: 100 },
        { x: 200, y: 100 },
      ],
    );
    addTestJunction(page, "net_1", "junction_start", 50, 100);
    addTestWire(
      page,
      "net_1",
      "branch",
      [
        { x: 50, y: 100 },
        { x: 100, y: 100 },
        { x: 100, y: 150 },
      ],
      junction("junction_start"),
      { kind: "open" },
    );

    const normalized = canonicalizePageNetGraph(page);
    expect(normalized.nets[0]?.junctions).toHaveLength(1);
    expect(normalized.nets[0]?.junctions[0]?.point).toEqual({
      x: 100,
      y: 100,
    });
    expect(normalized.nets[0]?.junctions[0]?.id).not.toBe("junction_start");
    expect(
      normalized.nets[0]?.wires.find(
        (wire) =>
          pointsEqual(wire.points[0]!, { x: 100, y: 100 }) &&
          pointsEqual(wire.points.at(-1)!, { x: 100, y: 150 }),
      )?.points,
    ).toEqual([
      { x: 100, y: 100 },
      { x: 100, y: 150 },
    ]);
  });

  it("splits a shared tail where two branches converge", () => {
    const page = createEmptyPage("Shared tail");
    addTestJunction(page, "net_1", "junction_merge", 100, 0);
    addTestWire(
      page,
      "net_1",
      "left_branch",
      [
        { x: 20, y: -20 },
        { x: 20, y: 0 },
        { x: 100, y: 0 },
      ],
      { kind: "open" },
      junction("junction_merge"),
    );
    addTestWire(
      page,
      "net_1",
      "right_branch",
      [
        { x: 50, y: -20 },
        { x: 50, y: 0 },
        { x: 100, y: 0 },
      ],
      { kind: "open" },
      junction("junction_merge"),
    );
    addTestWire(
      page,
      "net_1",
      "continuation",
      [
        { x: 100, y: 0 },
        { x: 100, y: 30 },
      ],
      junction("junction_merge"),
      { kind: "open" },
    );

    const normalized = canonicalizePageNetGraph(page);
    expect(normalized.nets[0]?.junctions).toHaveLength(1);
    expect(normalized.nets[0]?.junctions[0]?.point).toEqual({ x: 50, y: 0 });
    expect(
      normalized.nets[0]?.junctions.some(
        (junction) => junction.point.x === 100 && junction.point.y === 0,
      ),
    ).toBe(false);
    expect(normalized.nets[0]?.wires).toHaveLength(3);
  });

  it("creates a junction when an open wire endpoint lands inside another wire", () => {
    const page = createEmptyPage("Endpoint contact");
    addTestWire(
      page,
      "net_1",
      "through",
      [
        { x: 0, y: 100 },
        { x: 200, y: 100 },
      ],
    );
    addTestWire(
      page,
      "net_1",
      "branch",
      [
        { x: 100, y: 50 },
        { x: 100, y: 100 },
      ],
    );

    const normalized = canonicalizePageNetGraph(page);
    expect(normalized.nets[0]?.junctions).toHaveLength(1);
    expect(normalized.nets[0]?.junctions[0]?.point).toEqual({
      x: 100,
      y: 100,
    });
    const junctionId = normalized.nets[0]!.junctions[0]!.id;
    const branchWire = normalized.nets[0]?.wires.find(
      (wire) =>
        wire.points.some((point) => pointsEqual(point, { x: 100, y: 50 })) &&
        wire.points.some((point) => pointsEqual(point, { x: 100, y: 100 })),
    );
    expect([branchWire?.start, branchWire?.end]).toEqual(
      expect.arrayContaining([
        { kind: "open" },
        { kind: "junction", junctionId },
      ]),
    );
    expect(
      normalized.nets[0]?.wires.filter(
        (wire) =>
          [wire.start, wire.end].filter(
            (endpoint) =>
              endpoint.kind === "junction" &&
              endpoint.junctionId === junctionId,
          ).length > 0,
      ),
    ).toHaveLength(3);
    expect(findNetGraphViolations(normalized)).toEqual([]);
  });

  it("creates one junction at a same-net cross intersection", () => {
    const page = createEmptyPage("Same-net cross");
    addTestNet(page, "net_1");
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

    const normalized = canonicalizePageNetGraph(page);
    expect(normalized.nets[0]?.junctions).toHaveLength(1);
    expect(normalized.nets[0]?.junctions[0]?.point).toEqual({
      x: 100,
      y: 100,
    });
    expect(normalized.nets[0]?.wires).toHaveLength(4);
    expect(findNetGraphViolations(normalized)).toEqual([]);
  });

  it("merges separate net objects with the same explicit name", () => {
    const page = createEmptyPage("Named nets");
    addTestNet(page, "net_a", "VCC");
    addTestNet(page, "net_b", "VCC");
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
        { x: 100, y: 0 },
        { x: 150, y: 0 },
      ],
    );

    const normalized = canonicalizePageNetGraph(page);
    expect(normalized.nets).toHaveLength(1);
    expect(normalized.nets[0]).toMatchObject({
      name: "VCC",
      wires: [{ id: "a" }, { id: "b" }],
    });
    expect(canonicalizePageNetGraph(normalized)).toBe(normalized);
  });

  it("preserves a net color through canonicalization and named-net merging", () => {
    const page = createEmptyPage("Colored nets");
    addTestNet(page, "net_a", "VCC").color = "#0F766E";
    addTestNet(page, "net_b", "VCC");
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
        { x: 100, y: 0 },
        { x: 150, y: 0 },
      ],
    );

    const normalized = canonicalizePageNetGraph(page);
    expect(normalized.nets).toHaveLength(1);
    expect(normalized.nets[0]?.color).toBe("#0F766E");
    expect(canonicalizePageNetGraph(normalized)).toBe(normalized);
  });
});
