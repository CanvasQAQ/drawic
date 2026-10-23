import {
  GRID_SIZE,
  distance,
  isOrthogonalPath,
  nodeBounds,
  nodePinPosition,
  orthogonalPath,
} from "./geometry";
import type {
  ComponentNode,
  ConnectionAnchor,
  DrawingPage,
  Point,
  SymbolDefinition,
  Wire,
} from "./model";

export interface RouteBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface RouteObstacle extends RouteBounds {
  ownerId: string;
}

interface RouteOptions {
  gridSize?: number;
  clearance?: number;
}

interface QueueEntry {
  key: string;
  cost: number;
  estimate: number;
}

const BEND_PENALTY = 30;
const EPSILON = 0.001;

function uniqueSorted(values: readonly number[]): number[] {
  return [...new Set(values.map((value) => Number(value.toFixed(6))))].sort(
    (a, b) => a - b,
  );
}

function expand(bounds: RouteBounds, amount: number): RouteBounds {
  return {
    minX: bounds.minX - amount,
    minY: bounds.minY - amount,
    maxX: bounds.maxX + amount,
    maxY: bounds.maxY + amount,
  };
}

export function routingObstacles(
  page: DrawingPage,
  library: readonly SymbolDefinition[],
  excludedDeviceIds: ReadonlySet<string> = new Set(),
): RouteBounds[] {
  const symbols = new Map(library.map((symbol) => [symbol.id, symbol]));
  const obstacles: RouteObstacle[] = [];
  for (const node of page.nodes) {
    if (excludedDeviceIds.has(node.id)) {
      continue;
    }
    const symbol = symbols.get(node.symbolId);
    if (symbol) {
      obstacles.push({ ...nodeBounds(node, symbol), ownerId: node.id });
    }
  }
  for (const shape of page.shapes) {
    obstacles.push({
      minX: Math.min(shape.x, shape.x + shape.width),
      minY: Math.min(shape.y, shape.y + shape.height),
      maxX: Math.max(shape.x, shape.x + shape.width),
      maxY: Math.max(shape.y, shape.y + shape.height),
      ownerId: shape.id,
    });
  }
  return obstacles;
}

function segmentHitsObstacle(
  start: Point,
  end: Point,
  obstacle: RouteBounds,
): boolean {
  if (start.y === end.y) {
    if (
      start.y <= obstacle.minY + EPSILON ||
      start.y >= obstacle.maxY - EPSILON
    ) {
      return false;
    }
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    return maxX > obstacle.minX + EPSILON && minX < obstacle.maxX - EPSILON;
  }
  if (start.x === end.x) {
    if (
      start.x <= obstacle.minX + EPSILON ||
      start.x >= obstacle.maxX - EPSILON
    ) {
      return false;
    }
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);
    return maxY > obstacle.minY + EPSILON && minY < obstacle.maxY - EPSILON;
  }
  return true;
}

export function pathAvoidsObstacles(
  points: readonly Point[],
  obstacles: readonly RouteBounds[],
): boolean {
  return points.every((point, index) => {
    if (index === 0) {
      return true;
    }
    const start = points[index - 1]!;
    return obstacles.every((obstacle) => !segmentHitsObstacle(start, point, obstacle));
  });
}

export function simplifyOrthogonalPath(points: readonly Point[]): Point[] {
  const compact: Point[] = [];
  for (const point of points) {
    const previous = compact.at(-1);
    if (!previous || distance(previous, point) > EPSILON) {
      compact.push({ ...point });
    }
  }
  const simplified: Point[] = [];
  for (const point of compact) {
    while (simplified.length >= 2) {
      const first = simplified[simplified.length - 2]!;
      const second = simplified[simplified.length - 1]!;
      const sameX = first.x === second.x && second.x === point.x;
      const sameY = first.y === second.y && second.y === point.y;
      if (!sameX && !sameY) {
        break;
      }
      simplified.pop();
    }
    simplified.push(point);
  }
  return simplified;
}

function queuePush(queue: QueueEntry[], entry: QueueEntry): void {
  queue.push(entry);
  let index = queue.length - 1;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (queue[parent]!.estimate <= entry.estimate) {
      break;
    }
    queue[index] = queue[parent]!;
    index = parent;
  }
  queue[index] = entry;
}

function queuePop(queue: QueueEntry[]): QueueEntry | undefined {
  const first = queue[0];
  const last = queue.pop();
  if (!first || !last || queue.length === 0) {
    return first;
  }
  let index = 0;
  while (true) {
    const left = index * 2 + 1;
    const right = left + 1;
    if (left >= queue.length) {
      break;
    }
    const child =
      right < queue.length && queue[right]!.estimate < queue[left]!.estimate
        ? right
        : left;
    if (queue[child]!.estimate >= last.estimate) {
      break;
    }
    queue[index] = queue[child]!;
    index = child;
  }
  queue[index] = last;
  return first;
}

export function routeOrthogonal(
  start: Point,
  end: Point,
  obstacles: readonly RouteBounds[],
  options: RouteOptions = {},
): Point[] {
  if (start.x === end.x || start.y === end.y) {
    const direct = simplifyOrthogonalPath([start, end]);
    if (pathAvoidsObstacles(direct, obstacles)) {
      return direct;
    }
  }

  const gridSize = options.gridSize ?? GRID_SIZE;
  const clearance = options.clearance ?? gridSize / 2;
  const expandedObstacles = obstacles.map((obstacle) => expand(obstacle, clearance));
  const margin = gridSize * 4;
  const directBounds = {
    minX: Math.min(start.x, end.x) - margin,
    maxX: Math.max(start.x, end.x) + margin,
    minY: Math.min(start.y, end.y) - margin,
    maxY: Math.max(start.y, end.y) + margin,
  };
  const relevantObstacles = expandedObstacles.filter(
    (obstacle) =>
      obstacle.maxX >= directBounds.minX &&
      obstacle.minX <= directBounds.maxX &&
      obstacle.maxY >= directBounds.minY &&
      obstacle.minY <= directBounds.maxY,
  );
  const minX = Math.min(start.x, end.x, ...relevantObstacles.map((item) => item.minX)) - margin;
  const maxX = Math.max(start.x, end.x, ...relevantObstacles.map((item) => item.maxX)) + margin;
  const minY = Math.min(start.y, end.y, ...relevantObstacles.map((item) => item.minY)) - margin;
  const maxY = Math.max(start.y, end.y, ...relevantObstacles.map((item) => item.maxY)) + margin;
  const xCoordinates = new Set<number>([start.x, end.x]);
  const yCoordinates = new Set<number>([start.y, end.y]);
  for (const obstacle of relevantObstacles) {
    xCoordinates.add(obstacle.minX);
    xCoordinates.add(obstacle.maxX);
    yCoordinates.add(obstacle.minY);
    yCoordinates.add(obstacle.maxY);
  }
  const firstX = Math.ceil(minX / gridSize) * gridSize;
  const firstY = Math.ceil(minY / gridSize) * gridSize;
  for (let x = firstX; x <= maxX; x += gridSize) {
    xCoordinates.add(x);
  }
  for (let y = firstY; y <= maxY; y += gridSize) {
    yCoordinates.add(y);
  }
  const xs = uniqueSorted([...xCoordinates]);
  const ys = uniqueSorted([...yCoordinates]);
  const startX = xs.indexOf(start.x);
  const startY = ys.indexOf(start.y);
  const endX = xs.indexOf(end.x);
  const endY = ys.indexOf(end.y);
  if (startX < 0 || startY < 0 || endX < 0 || endY < 0) {
    return simplifyOrthogonalPath(orthogonalPath(start, end));
  }

  const costs = new Map<string, number>();
  const previous = new Map<string, string | null>();
  const statePoint = (key: string): Point => {
    const [xIndexText, yIndexText] = key.split(":");
    return { x: xs[Number(xIndexText)]!, y: ys[Number(yIndexText)]! };
  };
  const startKey = `${startX}:${startY}`;
  const targetKey = `${endX}:${endY}`;
  const queue: QueueEntry[] = [];
  for (const direction of [0, 1]) {
    const key = `${startKey}:${direction}`;
    costs.set(key, 0);
    previous.set(key, null);
    queuePush(queue, {
      key,
      cost: 0,
      estimate: Math.abs(end.x - start.x) + Math.abs(end.y - start.y),
    });
  }

  let finalKey: string | null = null;
  while (queue.length > 0) {
    const current = queuePop(queue)!;
    const parts = current.key.split(":");
    const xIndex = Number(parts[0]);
    const yIndex = Number(parts[1]);
    const direction = Number(parts[2]);
    if (costs.get(current.key) !== current.cost) {
      continue;
    }
    if (xIndex === endX && yIndex === endY) {
      finalKey = current.key;
      break;
    }
    const point = { x: xs[xIndex]!, y: ys[yIndex]! };
    const neighbours = [
      { xIndex: xIndex - 1, yIndex, direction: 0 },
      { xIndex: xIndex + 1, yIndex, direction: 0 },
      { xIndex, yIndex: yIndex - 1, direction: 1 },
      { xIndex, yIndex: yIndex + 1, direction: 1 },
    ];
    for (const neighbour of neighbours) {
      if (
        neighbour.xIndex < 0 ||
        neighbour.xIndex >= xs.length ||
        neighbour.yIndex < 0 ||
        neighbour.yIndex >= ys.length
      ) {
        continue;
      }
      const nextPoint = {
        x: xs[neighbour.xIndex]!,
        y: ys[neighbour.yIndex]!,
      };
      if (
        relevantObstacles.some((obstacle) =>
          segmentHitsObstacle(point, nextPoint, obstacle),
        )
      ) {
        continue;
      }
      const nextKey = `${neighbour.xIndex}:${neighbour.yIndex}:${neighbour.direction}`;
      const nextCost =
        current.cost +
        distance(point, nextPoint) +
        (direction === neighbour.direction ? 0 : BEND_PENALTY);
      if ((costs.get(nextKey) ?? Number.POSITIVE_INFINITY) <= nextCost) {
        continue;
      }
      costs.set(nextKey, nextCost);
      previous.set(nextKey, current.key);
      queuePush(queue, {
        key: nextKey,
        cost: nextCost,
        estimate:
          nextCost +
          Math.abs(end.x - nextPoint.x) +
          Math.abs(end.y - nextPoint.y),
      });
    }
  }

  if (!finalKey) {
    return simplifyOrthogonalPath(orthogonalPath(start, end));
  }
  const keys: string[] = [];
  let cursor: string | null = finalKey;
  while (cursor) {
    keys.push(cursor);
    cursor = previous.get(cursor) ?? null;
  }
  const route = keys
    .reverse()
    .map((key) => statePoint(key.split(":").slice(0, 2).join(":")));
  const result = simplifyOrthogonalPath(route);
  if (!isOrthogonalPath(result) || !pathAvoidsObstacles(result, relevantObstacles)) {
    return simplifyOrthogonalPath(orthogonalPath(start, end));
  }
  return result;
}

export function pinPointForAnchor(
  page: DrawingPage,
  library: readonly SymbolDefinition[],
  anchor: ConnectionAnchor,
): Point | null {
  const node = page.nodes.find((candidate) => candidate.id === anchor.deviceId);
  const symbol = node
    ? library.find((candidate) => candidate.id === node.symbolId)
    : undefined;
  if (!node || !symbol) {
    return null;
  }
  const pinIndex = symbol.pins.findIndex((pin) => pin.key === anchor.pinId);
  return pinIndex >= 0 ? nodePinPosition(node, symbol, pinIndex) : null;
}

export function routeWireGeometry(
  page: DrawingPage,
  library: readonly SymbolDefinition[],
  start: Point,
  end: Point,
  startAnchor?: ConnectionAnchor,
  endAnchor?: ConnectionAnchor,
): Point[] {
  const excluded = new Set<string>();
  if (startAnchor) {
    excluded.add(startAnchor.deviceId);
  }
  if (endAnchor) {
    excluded.add(endAnchor.deviceId);
  }
  return routeOrthogonal(start, end, routingObstacles(page, library, excluded));
}

function rerouteWire(
  page: DrawingPage,
  library: readonly SymbolDefinition[],
  wire: Wire,
): Wire {
  const first = wire.points[0];
  const last = wire.points.at(-1);
  if (!first || !last) {
    return wire;
  }
  const start =
    (wire.startAnchor && pinPointForAnchor(page, library, wire.startAnchor)) || first;
  const end = (wire.endAnchor && pinPointForAnchor(page, library, wire.endAnchor)) || last;
  return {
    ...wire,
    points: routeWireGeometry(
      page,
      library,
      start,
      end,
      wire.startAnchor,
      wire.endAnchor,
    ),
  };
}

export function rerouteConnectedWires(
  page: DrawingPage,
  library: readonly SymbolDefinition[],
  nodeIds: ReadonlySet<string>,
): DrawingPage {
  if (nodeIds.size === 0) {
    return page;
  }
  return {
    ...page,
    wires: page.wires.map((wire) => {
      const connected =
        (wire.startAnchor && nodeIds.has(wire.startAnchor.deviceId)) ||
        (wire.endAnchor && nodeIds.has(wire.endAnchor.deviceId));
      return connected ? rerouteWire(page, library, wire) : wire;
    }),
  };
}

export function previewMoveNodes(
  page: DrawingPage,
  library: readonly SymbolDefinition[],
  nodeIds: ReadonlySet<string>,
  delta: Point,
): DrawingPage {
  if (nodeIds.size === 0 || (delta.x === 0 && delta.y === 0)) {
    return page;
  }
  const moved: DrawingPage = {
    ...page,
    nodes: page.nodes.map((node) =>
      nodeIds.has(node.id)
        ? { ...node, x: node.x + delta.x, y: node.y + delta.y }
        : node,
    ),
  };
  return rerouteConnectedWires(moved, library, nodeIds);
}
