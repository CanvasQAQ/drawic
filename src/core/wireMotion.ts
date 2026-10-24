import {
  AUTO_ROUTE_ESCAPE,
  nodePinPosition,
  pointOnSegment,
  pointsEqual,
  simplifyOrthogonalPath,
} from "./geometry";
import type {
  ComponentNode,
  ConnectionAnchor,
  DrawingPage,
  Junction,
  Point,
  Rotation,
  SymbolDefinition,
  Wire,
  WireEndpoint,
} from "./model";
import {
  allJunctions,
  allWires,
  endpointAnchor,
  findJunction,
  findWire,
  type LocatedJunction,
  type LocatedWire,
} from "./model";

type EndpointSide = "start" | "end";

function findNode(
  page: DrawingPage,
  library: readonly SymbolDefinition[],
  anchor: ConnectionAnchor,
): { node: ComponentNode; symbol: SymbolDefinition; pinIndex: number } | null {
  const node = page.nodes.find((candidate) => candidate.id === anchor.deviceId);
  if (!node) {
    return null;
  }
  const symbol = library.find((candidate) => candidate.id === node.symbolId);
  if (!symbol) {
    return null;
  }
  const pinIndex = symbol.pins.findIndex((pin) => pin.key === anchor.pinId);
  return pinIndex >= 0 ? { node, symbol, pinIndex } : null;
}

function resolveEndpoint(
  page: DrawingPage,
  library: readonly SymbolDefinition[],
  endpoint: WireEndpoint,
): Point | null | undefined {
  if (endpoint.kind === "open") {
    return undefined;
  }
  if (endpoint.kind === "junction") {
    return findJunction(page, endpoint.junctionId)?.junction.point ?? null;
  }
  const resolved = findNode(page, library, {
    deviceId: endpoint.deviceId,
    pinId: endpoint.pinId,
  });
  if (!resolved) {
    return null;
  }
  return nodePinPosition(resolved.node, resolved.symbol, resolved.pinIndex);
}

function pinOutwardDirectionForEndpoint(
  page: DrawingPage,
  library: readonly SymbolDefinition[],
  endpoint: WireEndpoint,
): Point | undefined {
  if (endpoint.kind !== "pin") {
    return undefined;
  }
  const resolved = findNode(page, library, {
    deviceId: endpoint.deviceId,
    pinId: endpoint.pinId,
  });
  if (!resolved) {
    return undefined;
  }
  const side = resolved.symbol.pins[resolved.pinIndex]?.side;
  let vector: Point;
  switch (side) {
    case "north":
      vector = { x: 0, y: -1 };
      break;
    case "east":
      vector = { x: 1, y: 0 };
      break;
    case "south":
      vector = { x: 0, y: 1 };
      break;
    case "west":
      vector = { x: -1, y: 0 };
      break;
    default:
      return undefined;
  }
  const mirroredX = resolved.node.mirrored ? -vector.x : vector.x;
  switch (resolved.node.rotation) {
    case 0:
      return { x: mirroredX, y: vector.y };
    case 90:
      return { x: -vector.y, y: mirroredX };
    case 180:
      return { x: -mirroredX, y: -vector.y };
    case 270:
      return { x: vector.y, y: -mirroredX };
  }
}

export function pinOutwardDirection(
  page: DrawingPage,
  library: readonly SymbolDefinition[],
  anchor: ConnectionAnchor | undefined,
): Point | undefined {
  return anchor
    ? pinOutwardDirectionForEndpoint(page, library, {
        kind: "pin",
        deviceId: anchor.deviceId,
        pinId: anchor.pinId,
      })
    : undefined;
}

function segmentAxis(a: Point, b: Point): "horizontal" | "vertical" | null {
  if (a.y === b.y && a.x !== b.x) {
    return "horizontal";
  }
  if (a.x === b.x && a.y !== b.y) {
    return "vertical";
  }
  return null;
}

function directionAlong(
  endpoint: Point,
  neighbor: Point,
  direction: Point | undefined,
): boolean {
  if (!direction) {
    return true;
  }
  const segment = { x: neighbor.x - endpoint.x, y: neighbor.y - endpoint.y };
  return segment.x * direction.x + segment.y * direction.y > 0;
}

function insertEscape(
  endpoint: Point,
  neighbor: Point,
  direction: Point,
  side: EndpointSide,
): Point[] {
  const escape = {
    x: endpoint.x + direction.x * AUTO_ROUTE_ESCAPE,
    y: endpoint.y + direction.y * AUTO_ROUTE_ESCAPE,
  };
  const bridge =
    escape.x === neighbor.x || escape.y === neighbor.y
      ? [escape, neighbor]
      : [
          escape,
          direction.x
            ? { x: escape.x, y: neighbor.y }
            : { x: neighbor.x, y: escape.y },
          neighbor,
        ];
  if (side === "start") {
    return [endpoint, ...bridge];
  }
  return [...bridge.slice().reverse(), endpoint];
}

function alignEndpoint(
  source: readonly Point[],
  endpoint: Point,
  side: EndpointSide,
  direction?: Point,
): Point[] {
  const points = source.map((point) => ({ ...point }));
  if (points.length < 2) {
    return [endpoint, endpoint];
  }
  if (side === "start") {
    const originalStart = points[0]!;
    const neighbor = points[1]!;
    const axis = segmentAxis(originalStart, neighbor);
    points[0] = endpoint;
    if (points.length === 2 && !directionAlong(endpoint, neighbor, direction)) {
      const escaped = insertEscape(endpoint, neighbor, direction!, "start");
      return simplifyOrthogonalPath(escaped);
    }
    if (endpoint.x === neighbor.x || endpoint.y === neighbor.y) {
      if (directionAlong(endpoint, neighbor, direction)) {
        return simplifyOrthogonalPath(points);
      }
      const escaped = insertEscape(endpoint, neighbor, direction!, "start");
      return simplifyOrthogonalPath([...escaped, ...points.slice(2)]);
    }
    if (points.length > 2 && axis === "horizontal") {
      points[1] = { ...neighbor, y: endpoint.y };
    } else if (points.length > 2 && axis === "vertical") {
      points[1] = { ...neighbor, x: endpoint.x };
    } else {
      points.splice(
        1,
        0,
        direction?.x
          ? { x: endpoint.x, y: neighbor.y }
          : { x: neighbor.x, y: endpoint.y },
      );
    }
    if (direction && !directionAlong(endpoint, points[1]!, direction)) {
      const neighborAfterAlignment = points[1]!;
      const escaped = insertEscape(
        endpoint,
        neighborAfterAlignment,
        direction,
        "start",
      );
      return simplifyOrthogonalPath([...escaped, ...points.slice(2)]);
    }
    return simplifyOrthogonalPath(points);
  }

  const originalEnd = points.at(-1)!;
  const neighbor = points.at(-2)!;
  const axis = segmentAxis(originalEnd, neighbor);
  points[points.length - 1] = endpoint;
  if (points.length === 2 && !directionAlong(endpoint, neighbor, direction)) {
    const escaped = insertEscape(endpoint, neighbor, direction!, "end");
    return simplifyOrthogonalPath(escaped);
  }
  if (endpoint.x === neighbor.x || endpoint.y === neighbor.y) {
    if (directionAlong(endpoint, neighbor, direction)) {
      return simplifyOrthogonalPath(points);
    }
    const escaped = insertEscape(endpoint, neighbor, direction!, "end");
    return simplifyOrthogonalPath([...points.slice(0, -2), ...escaped]);
  }
  if (axis === "horizontal") {
    points[points.length - 2] = { ...neighbor, y: endpoint.y };
  } else if (axis === "vertical") {
    points[points.length - 2] = { ...neighbor, x: endpoint.x };
  } else {
    points.splice(
      points.length - 1,
      0,
      direction?.x
        ? { x: endpoint.x, y: neighbor.y }
        : { x: neighbor.x, y: endpoint.y },
    );
  }
  if (direction && !directionAlong(endpoint, points.at(-2)!, direction)) {
    const neighborAfterAlignment = points.at(-2)!;
    const escaped = insertEscape(
      endpoint,
      neighborAfterAlignment,
      direction,
      "end",
    );
    return simplifyOrthogonalPath([...points.slice(0, -2), ...escaped]);
  }
  return simplifyOrthogonalPath(points);
}

export function resolveWirePoints(
  page: DrawingPage,
  library: readonly SymbolDefinition[],
  wire: Wire,
): Point[] | null {
  if (wire.points.length < 2) {
    return null;
  }
  let points = wire.points.map((point) => ({ ...point }));
  const start = resolveEndpoint(page, library, wire.start);
  const end = resolveEndpoint(page, library, wire.end);
  if (start === null || end === null) {
    return null;
  }
  const oldStart = points[0]!;
  const oldEnd = points.at(-1)!;
  if (start && !pointsEqual(start, oldStart)) {
    points = alignEndpoint(
      points,
      start,
      "start",
      pinOutwardDirectionForEndpoint(page, library, wire.start),
    );
  }
  if (end && !pointsEqual(end, oldEnd)) {
    points = alignEndpoint(
      points,
      end,
      "end",
      pinOutwardDirectionForEndpoint(page, library, wire.end),
    );
  }
  return simplifyOrthogonalPath(points);
}

function endpointMoves(
  endpoint: WireEndpoint,
  nodeIds: ReadonlySet<string>,
): boolean {
  return endpoint.kind === "pin" && nodeIds.has(endpoint.deviceId);
}

function endpointMovesInTarget(
  source: DrawingPage,
  target: DrawingPage,
  endpoint: WireEndpoint,
  nodeIds: ReadonlySet<string>,
): boolean {
  if (endpoint.kind === "pin") {
    return nodeIds.has(endpoint.deviceId);
  }
  if (endpoint.kind === "junction") {
    const sourcePoint = findJunction(source, endpoint.junctionId)?.junction.point;
    const targetPoint = findJunction(target, endpoint.junctionId)?.junction.point;
    return Boolean(
      sourcePoint &&
        targetPoint &&
        !pointsEqual(sourcePoint, targetPoint, 0.001),
    );
  }
  return false;
}

function pointForEndpoint(
  page: DrawingPage,
  library: readonly SymbolDefinition[],
  endpoint: WireEndpoint,
): Point | undefined {
  const resolved = resolveEndpoint(page, library, endpoint);
  return resolved ?? undefined;
}

function moveWire(
  source: DrawingPage,
  moved: DrawingPage,
  library: readonly SymbolDefinition[],
  wire: Wire,
  nodeIds: ReadonlySet<string>,
  delta: Point,
): Wire {
  const moveStart = endpointMovesInTarget(source, moved, wire.start, nodeIds);
  const moveEnd = endpointMovesInTarget(source, moved, wire.end, nodeIds);
  if (!moveStart && !moveEnd) {
    return wire;
  }
  let points =
    resolveWirePoints(source, library, wire) ??
    wire.points.map((point) => ({ ...point }));
  if (moveStart && moveEnd) {
    points = points.map((point) => ({
      x: point.x + delta.x,
      y: point.y + delta.y,
    }));
  } else {
    if (moveStart) {
      const start = pointForEndpoint(moved, library, wire.start);
      if (start) {
        points = alignEndpoint(
          points,
          start,
          "start",
          pinOutwardDirectionForEndpoint(moved, library, wire.start),
        );
      }
    }
    if (moveEnd) {
      const end = pointForEndpoint(moved, library, wire.end);
      if (end) {
        points = alignEndpoint(
          points,
          end,
          "end",
          pinOutwardDirectionForEndpoint(moved, library, wire.end),
        );
      }
    }
  }
  return { ...wire, points: simplifyOrthogonalPath(points) };
}

function movedPage(
  page: DrawingPage,
  nodeIds: ReadonlySet<string>,
  delta: Point,
): DrawingPage {
  return {
    ...page,
    nodes: page.nodes.map((node) =>
      nodeIds.has(node.id)
        ? { ...node, x: node.x + delta.x, y: node.y + delta.y }
        : node,
    ),
  };
}

function wireTouchesPoint(
  page: DrawingPage,
  library: readonly SymbolDefinition[],
  wire: Wire,
  point: Point,
): boolean {
  const points = resolveWirePoints(page, library, wire);
  if (!points) {
    return false;
  }
  return points.some((candidate, index) => {
    if (pointsEqual(candidate, point, 0.5)) {
      return true;
    }
    const next = points[index + 1];
    return next ? pointOnSegment(point, candidate, next, 0.7) : false;
  });
}

export function pathProjectionRatio(
  point: Point,
  points: readonly Point[],
): number {
  const lengths: number[] = [];
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1]!;
    const end = points[index]!;
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    lengths.push(length);
    total += length;
  }
  if (total <= 0.001) {
    return 0;
  }
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestAlongPath = 0;
  let traversed = 0;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1]!;
    const end = points[index]!;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    const t =
      lengthSquared <= 0.000001
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              ((point.x - start.x) * dx + (point.y - start.y) * dy) /
                lengthSquared,
            ),
          );
    const candidate = { x: start.x + t * dx, y: start.y + t * dy };
    const candidateDistance = Math.hypot(
      point.x - candidate.x,
      point.y - candidate.y,
    );
    if (candidateDistance < bestDistance) {
      bestDistance = candidateDistance;
      bestAlongPath = traversed + lengths[index - 1]! * t;
    }
    traversed += lengths[index - 1]!;
  }
  return bestAlongPath / total;
}

export function pointAtPathRatio(
  points: readonly Point[],
  ratio: number,
): Point {
  let total = 0;
  const lengths: number[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const length = Math.hypot(
      points[index]!.x - points[index - 1]!.x,
      points[index]!.y - points[index - 1]!.y,
    );
    lengths.push(length);
    total += length;
  }
  if (total <= 0.001) {
    return { ...points[0]! };
  }
  let remaining = Math.max(0, Math.min(1, ratio)) * total;
  for (let index = 1; index < points.length; index += 1) {
    const length = lengths[index - 1]!;
    if (remaining <= length || index === points.length - 1) {
      const start = points[index - 1]!;
      const end = points[index]!;
      const t = length <= 0.001 ? 0 : remaining / length;
      return {
        x: start.x + (end.x - start.x) * t,
        y: start.y + (end.y - start.y) * t,
      };
    }
    remaining -= length;
  }
  return { ...points.at(-1)! };
}

function moveAttachedAnnotations(
  source: DrawingPage,
  target: DrawingPage,
  library: readonly SymbolDefinition[],
): DrawingPage["annotations"] {
  return target.annotations.map((annotation) => {
    if (!annotation.wireId) {
      return annotation;
    }
    const sourceWire = findWire(source, annotation.wireId)?.wire;
    const targetWire = findWire(target, annotation.wireId)?.wire;
    if (!sourceWire || !targetWire) {
      return annotation;
    }
    const sourcePoints = resolveWirePoints(source, library, sourceWire);
    const targetPoints = resolveWirePoints(target, library, targetWire);
    if (!sourcePoints || !targetPoints) {
      return annotation;
    }
    const point = pointAtPathRatio(
      targetPoints,
      pathProjectionRatio(annotation, sourcePoints),
    );
    return { ...annotation, x: point.x, y: point.y };
  });
}

function moveInternalJunctions(
  source: DrawingPage,
  moved: DrawingPage,
  library: readonly SymbolDefinition[],
  nodeIds: ReadonlySet<string>,
  delta: Point,
): Map<string, Junction> {
  const result = new Map<string, Junction>();
  const locatedWires = allWires(source);
  for (const { junction } of allJunctions(source)) {
    const touching = locatedWires
      .map((entry) => entry.wire)
      .filter((wire) =>
        [wire.start, wire.end].some(
          (endpoint) =>
            endpoint.kind === "junction" &&
            endpoint.junctionId === junction.id,
        ),
      );
    const pinEndpoints = touching.flatMap((wire) =>
      [wire.start, wire.end].filter((endpoint) => endpoint.kind === "pin"),
    );
    const allInternal =
      pinEndpoints.length > 0 &&
      pinEndpoints.every((endpoint) => endpointMoves(endpoint, nodeIds));
    result.set(
      junction.id,
      allInternal
        ? {
            ...junction,
            point: {
              x: junction.point.x + delta.x,
              y: junction.point.y + delta.y,
            },
          }
        : { ...junction },
    );
  }
  return result;
}

export function planNodeMove(
  page: DrawingPage,
  library: readonly SymbolDefinition[],
  nodeIds: ReadonlySet<string>,
  delta: Point,
): DrawingPage {
  if (nodeIds.size === 0 || (delta.x === 0 && delta.y === 0)) {
    return page;
  }
  const moved = movedPage(page, nodeIds, delta);
  const movedJunctions = moveInternalJunctions(
    page,
    moved,
    library,
    nodeIds,
    delta,
  );
  const movedWithJunctions: DrawingPage = {
    ...moved,
    nets: moved.nets.map((net) => ({
      ...net,
      junctions: net.junctions.map(
        (junction) => movedJunctions.get(junction.id) ?? junction,
      ),
    })),
  };
  const planned: DrawingPage = {
    ...movedWithJunctions,
    nets: movedWithJunctions.nets.map((net) => ({
      ...net,
      wires: net.wires.map((wire) =>
        moveWire(page, movedWithJunctions, library, wire, nodeIds, delta),
      ),
    })),
  };
  return {
    ...planned,
    annotations: moveAttachedAnnotations(page, planned, library),
  };
}

interface PointTransform {
  apply(point: Point): Point;
}

function transformInternalWire(
  source: DrawingPage,
  transformed: DrawingPage,
  library: readonly SymbolDefinition[],
  wire: Wire,
  nodeIds: ReadonlySet<string>,
  groupTransform: PointTransform,
): Wire {
  const startSelected = endpointMovesInTarget(
    source,
    transformed,
    wire.start,
    nodeIds,
  );
  const endSelected = endpointMovesInTarget(
    source,
    transformed,
    wire.end,
    nodeIds,
  );
  if (!startSelected && !endSelected) {
    return wire;
  }
  const oldPoints = resolveWirePoints(source, library, wire);
  if (!oldPoints) {
    return wire;
  }
  if (startSelected && endSelected) {
    const newStart = pointForEndpoint(transformed, library, wire.start);
    const newEnd = pointForEndpoint(transformed, library, wire.end);
    if (newStart && newEnd) {
      return {
        ...wire,
        points: simplifyOrthogonalPath(
          oldPoints.map((point, index) => {
            if (index === 0) {
              return newStart!;
            }
            if (index === oldPoints.length - 1) {
              return newEnd!;
            }
            return groupTransform.apply(point);
          }),
        ),
      };
    }
  }
  let points = oldPoints;
  if (startSelected) {
    const start = pointForEndpoint(transformed, library, wire.start);
    if (start) {
      points = alignEndpoint(
        points,
        start,
        "start",
        pinOutwardDirectionForEndpoint(transformed, library, wire.start),
      );
    }
  }
  if (endSelected) {
    const end = pointForEndpoint(transformed, library, wire.end);
    if (end) {
      points = alignEndpoint(
        points,
        end,
        "end",
        pinOutwardDirectionForEndpoint(transformed, library, wire.end),
      );
    }
  }
  return { ...wire, points: simplifyOrthogonalPath(points) };
}

function transformInternalJunctions(
  source: DrawingPage,
  library: readonly SymbolDefinition[],
  nodeIds: ReadonlySet<string>,
  groupTransform: PointTransform,
): Map<string, Junction> {
  const result = new Map<string, Junction>();
  const locatedWires = allWires(source);
  for (const { junction } of allJunctions(source)) {
    const touching = locatedWires
      .map((entry) => entry.wire)
      .filter((wire) =>
        [wire.start, wire.end].some(
          (endpoint) =>
            endpoint.kind === "junction" &&
            endpoint.junctionId === junction.id,
        ),
      );
    const pinEndpoints = touching.flatMap((wire) =>
      [wire.start, wire.end].filter((endpoint) => endpoint.kind === "pin"),
    );
    const allInternal =
      pinEndpoints.length > 0 &&
      pinEndpoints.every((endpoint) => endpointMoves(endpoint, nodeIds));
    result.set(
      junction.id,
      allInternal
        ? {
            ...junction,
            point: groupTransform.apply(junction.point),
          }
        : { ...junction },
    );
  }
  return result;
}

export function planNodeRotation(
  page: DrawingPage,
  library: readonly SymbolDefinition[],
  nodeIds: ReadonlySet<string>,
): DrawingPage {
  if (nodeIds.size === 0) {
    return page;
  }
  const selected = page.nodes.filter((node) => nodeIds.has(node.id));
  const center = {
    x:
      selected.reduce((total, node) => total + node.x, 0) /
      Math.max(1, selected.length),
    y:
      selected.reduce((total, node) => total + node.y, 0) /
      Math.max(1, selected.length),
  };
  const groupTransform: PointTransform = {
    apply(point: Point): Point {
      return {
        x: center.x - (point.y - center.y),
        y: center.y + (point.x - center.x),
      };
    },
  };
  const transformed: DrawingPage = {
    ...page,
    nodes: page.nodes.map((node) =>
      nodeIds.has(node.id)
        ? {
            ...node,
            x: center.x - (node.y - center.y),
            y: center.y + (node.x - center.x),
            rotation: ((node.rotation + 90) % 360) as Rotation,
          }
        : node,
    ),
  };
  const transformedJunctions = transformInternalJunctions(
    page,
    library,
    nodeIds,
    groupTransform,
  );
  const transformedWithJunctions: DrawingPage = {
    ...transformed,
    nets: transformed.nets.map((net) => ({
      ...net,
      junctions: net.junctions.map(
        (junction) => transformedJunctions.get(junction.id) ?? junction,
      ),
    })),
  };
  const planned: DrawingPage = {
    ...transformedWithJunctions,
    nets: transformedWithJunctions.nets.map((net) => ({
      ...net,
      wires: net.wires.map((wire) =>
        transformInternalWire(
          page,
          transformedWithJunctions,
          library,
          wire,
          nodeIds,
          groupTransform,
        ),
      ),
    })),
  };
  return {
    ...planned,
    annotations: moveAttachedAnnotations(page, planned, library),
  };
}

export function planNodeMirror(
  page: DrawingPage,
  library: readonly SymbolDefinition[],
  nodeIds: ReadonlySet<string>,
): DrawingPage {
  if (nodeIds.size === 0) {
    return page;
  }
  const selected = page.nodes.filter((node) => nodeIds.has(node.id));
  const centerX =
    selected.reduce((total, node) => total + node.x, 0) /
    Math.max(1, selected.length);
  const groupTransform: PointTransform = {
    apply(point: Point): Point {
      return {
        x: centerX - (point.x - centerX),
        y: point.y,
      };
    },
  };
  const transformed: DrawingPage = {
    ...page,
    nodes: page.nodes.map((node) =>
      nodeIds.has(node.id)
        ? {
            ...node,
            x: centerX - (node.x - centerX),
            mirrored: !node.mirrored,
          }
        : node,
    ),
  };
  const transformedJunctions = transformInternalJunctions(
    page,
    library,
    nodeIds,
    groupTransform,
  );
  const transformedWithJunctions: DrawingPage = {
    ...transformed,
    nets: transformed.nets.map((net) => ({
      ...net,
      junctions: net.junctions.map(
        (junction) => transformedJunctions.get(junction.id) ?? junction,
      ),
    })),
  };
  const planned: DrawingPage = {
    ...transformedWithJunctions,
    nets: transformedWithJunctions.nets.map((net) => ({
      ...net,
      wires: net.wires.map((wire) =>
        transformInternalWire(
          page,
          transformedWithJunctions,
          library,
          wire,
          nodeIds,
          groupTransform,
        ),
      ),
    })),
  };
  return {
    ...planned,
    annotations: moveAttachedAnnotations(page, planned, library),
  };
}

export function pathInkBounds(points: readonly Point[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} | null {
  if (points.length === 0) {
    return null;
  }
  return {
    minX: Math.min(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxX: Math.max(...points.map((point) => point.x)),
    maxY: Math.max(...points.map((point) => point.y)),
  };
}
