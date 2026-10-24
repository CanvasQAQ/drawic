import type {
  ComponentNode,
  NodeLabelKind,
  Point,
  SymbolDefinition,
  SymbolPin,
  SymbolSide,
} from "./model";

export const GRID_SIZE = 10;
export const SNAP_DISTANCE = 12;
export const AUTO_ROUTE_ESCAPE = GRID_SIZE * 2;

export function roundToGrid(value: number, grid = GRID_SIZE): number {
  return Math.round(value / grid) * grid;
}

export function snapPoint(point: Point, grid = GRID_SIZE): Point {
  return { x: roundToGrid(point.x, grid), y: roundToGrid(point.y, grid) };
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function pointsEqual(a: Point, b: Point, tolerance = 0.01): boolean {
  return distance(a, b) <= tolerance;
}

function pinsOnSide(symbol: SymbolDefinition, side: SymbolSide): Array<{ pin: SymbolPin; index: number }> {
  return symbol.pins
    .map((pin, index) => ({ pin, index }))
    .filter((entry) => entry.pin.side === side);
}

export function localPinPosition(symbol: SymbolDefinition, pinIndex: number): Point {
  const pin = symbol.pins[pinIndex];
  if (!pin) {
    throw new Error(`Unknown pin index ${pinIndex} for ${symbol.id}.`);
  }
  const centerX = symbol.frame.x + symbol.frame.width / 2;
  const centerY = symbol.frame.y + symbol.frame.height / 2;
  if (
    typeof pin.x === "number" &&
    Number.isFinite(pin.x) &&
    typeof pin.y === "number" &&
    Number.isFinite(pin.y)
  ) {
    return { x: centerX + pin.x, y: centerY + pin.y };
  }
  const sameSide = pinsOnSide(symbol, pin.side);
  const order = Math.max(0, sameSide.findIndex((entry) => entry.index === pinIndex));
  const fraction = (order + 1) / (sameSide.length + 1);
  const left = symbol.frame.x;
  const top = symbol.frame.y;
  const right = left + symbol.frame.width;
  const bottom = top + symbol.frame.height;
  switch (pin.side) {
    case "north":
      return {
        x: left + symbol.frame.width * fraction,
        y: top,
      };
    case "south":
      return {
        x: left + symbol.frame.width * fraction,
        y: bottom,
      };
    case "west":
      return {
        x: left,
        y: top + symbol.frame.height * fraction,
      };
    case "east":
      return {
        x: right,
        y: top + symbol.frame.height * fraction,
      };
  }
}

export function symbolLabelPosition(
  node: Pick<ComponentNode, "x" | "y" | "rotation" | "mirrored" | "labelLayout">,
  symbol: SymbolDefinition,
  kind: NodeLabelKind,
): { point: Point; anchor: "start" | "middle" | "end" } {
  const fallback =
    kind === "reference"
      ? { x: 8, y: -2, anchor: "start" as const }
      : { x: 8, y: 13, anchor: "start" as const };
  const configured = symbol.labelAnchors?.[kind] ?? fallback;
  const offset = node.labelLayout?.[kind]?.offset ?? { x: 0, y: 0 };
  const point = transformLocalPoint(node, { x: configured.x, y: configured.y });
  return {
    point: { x: point.x + offset.x, y: point.y + offset.y },
    anchor: configured.anchor,
  };
}

export function nodeLabelVisible(
  node: ComponentNode,
  kind: NodeLabelKind,
): boolean {
  return !node.labelLayout?.[kind]?.hidden;
}

export function transformLocalPoint(
  node: Pick<ComponentNode, "x" | "y" | "rotation" | "mirrored">,
  point: Point,
): Point {
  const mirroredX = node.mirrored ? -point.x : point.x;
  const mirroredY = point.y;
  switch (node.rotation) {
    case 0:
      return { x: node.x + mirroredX, y: node.y + mirroredY };
    case 90:
      return { x: node.x - mirroredY, y: node.y + mirroredX };
    case 180:
      return { x: node.x - mirroredX, y: node.y - mirroredY };
    case 270:
      return { x: node.x + mirroredY, y: node.y - mirroredX };
  }
}

export function nodePinPosition(
  node: ComponentNode,
  symbol: SymbolDefinition,
  pinIndex: number,
): Point {
  const centerX = symbol.frame.x + symbol.frame.width / 2;
  const centerY = symbol.frame.y + symbol.frame.height / 2;
  const local = localPinPosition(symbol, pinIndex);
  return transformLocalPoint(node, {
    x: local.x - centerX,
    y: local.y - centerY,
  });
}

export function symbolTransform(node: ComponentNode, symbol: SymbolDefinition): string {
  const centerX = symbol.frame.x + symbol.frame.width / 2;
  const centerY = symbol.frame.y + symbol.frame.height / 2;
  const mirror = node.mirrored ? " scale(-1 1)" : "";
  return `translate(${node.x} ${node.y}) rotate(${node.rotation})${mirror} translate(${-centerX} ${-centerY})`;
}

export function nodeBounds(node: ComponentNode, symbol: SymbolDefinition): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  const centerX = symbol.frame.x + symbol.frame.width / 2;
  const centerY = symbol.frame.y + symbol.frame.height / 2;
  const corners = [
    { x: symbol.frame.x, y: symbol.frame.y },
    { x: symbol.frame.x + symbol.frame.width, y: symbol.frame.y },
    { x: symbol.frame.x, y: symbol.frame.y + symbol.frame.height },
    {
      x: symbol.frame.x + symbol.frame.width,
      y: symbol.frame.y + symbol.frame.height,
    },
  ].map((point) =>
    transformLocalPoint(node, {
      x: point.x - centerX,
      y: point.y - centerY,
    }),
  );
  return {
    minX: Math.min(...corners.map((point) => point.x)),
    minY: Math.min(...corners.map((point) => point.y)),
    maxX: Math.max(...corners.map((point) => point.x)),
    maxY: Math.max(...corners.map((point) => point.y)),
  };
}

export function orthogonalPath(start: Point, end: Point): Point[] {
  if (pointsEqual(start, end)) {
    return [start, end];
  }
  if (start.x === end.x || start.y === end.y) {
    return [start, end];
  }
  const horizontalFirst = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y);
  const corner = horizontalFirst ? { x: end.x, y: start.y } : { x: start.x, y: end.y };
  return [start, corner, end];
}

export function isOrthogonalPath(points: Point[]): boolean {
  return points.every((point, index) => {
    if (index === 0) {
      return true;
    }
    const previous = points[index - 1]!;
    return (
      (point.x === previous.x && point.y !== previous.y) ||
      (point.y === previous.y && point.x !== previous.x) ||
      (point.x === previous.x && point.y === previous.y)
    );
  });
}

export function simplifyOrthogonalPath(points: readonly Point[]): Point[] {
  const compact: Point[] = [];
  for (const point of points) {
    const previous = compact.at(-1);
    if (!previous || distance(previous, point) > 0.001) {
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

export function pointOnSegment(point: Point, start: Point, end: Point, tolerance = 0.5): boolean {
  const minX = Math.min(start.x, end.x) - tolerance;
  const maxX = Math.max(start.x, end.x) + tolerance;
  const minY = Math.min(start.y, end.y) - tolerance;
  const maxY = Math.max(start.y, end.y) + tolerance;
  if (point.x < minX || point.x > maxX || point.y < minY || point.y > maxY) {
    return false;
  }
  const cross = (point.x - start.x) * (end.y - start.y) - (point.y - start.y) * (end.x - start.x);
  return Math.abs(cross) <= tolerance * Math.max(1, distance(start, end));
}

export function segmentIntersection(a: Point, b: Point, c: Point, d: Point): Point | null {
  const denominator = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
  if (Math.abs(denominator) < 0.000001) {
    return null;
  }
  const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / denominator;
  const u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / denominator;
  if (t < -0.000001 || t > 1.000001 || u < -0.000001 || u > 1.000001) {
    return null;
  }
  return {
    x: a.x + t * (b.x - a.x),
    y: a.y + t * (b.y - a.y),
  };
}

export function nearestPointOnSegments(
  point: Point,
  segments: Array<{ start: Point; end: Point }>,
): Point {
  let best = point;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const segment of segments) {
    const dx = segment.end.x - segment.start.x;
    const dy = segment.end.y - segment.start.y;
    const lengthSquared = dx * dx + dy * dy;
    const t =
      lengthSquared === 0
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              ((point.x - segment.start.x) * dx + (point.y - segment.start.y) * dy) /
                lengthSquared,
            ),
          );
    const candidate = {
      x: segment.start.x + t * dx,
      y: segment.start.y + t * dy,
    };
    const candidateDistance = distance(point, candidate);
    if (candidateDistance < bestDistance) {
      best = candidate;
      bestDistance = candidateDistance;
    }
  }
  return best;
}

export function rectanglesIntersect(
  a: { minX: number; minY: number; maxX: number; maxY: number },
  b: { minX: number; minY: number; maxX: number; maxY: number },
): boolean {
  return a.maxX >= b.minX && a.minX <= b.maxX && a.maxY >= b.minY && a.minY <= b.maxY;
}
