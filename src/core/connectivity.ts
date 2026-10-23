import {
  distance,
  nodePinPosition,
  pointOnSegment,
  pointsEqual,
  segmentIntersection,
} from "./geometry";
import type {
  Annotation,
  ComponentNode,
  DrawingPage,
  Point,
  SelectionRef,
  SymbolDefinition,
} from "./model";

interface Segment {
  wireId: string;
  wireIndex: number;
  segmentIndex: number;
  start: Point;
  end: Point;
}

interface PinTerminal {
  key: string;
  node: ComponentNode;
  symbol: SymbolDefinition;
  pinIndex: number;
  point: Point;
}

export interface ConnectivityResult {
  groups: string[][];
  networkIdByKey: Map<string, string>;
  networkIdByPin: Map<string, string>;
  networkIdByWire: Map<string, string>;
  networkIdByAnnotation: Map<string, string>;
  netNamesByGroup: Map<string, string[]>;
  pinTerminals: PinTerminal[];
  segments: Segment[];
  junctionPoints: Point[];
}

export const pinGraphKey = (nodeId: string, pinIndex: number): string =>
  `pin:${nodeId}:${pinIndex}`;
export const wireGraphKey = (wireId: string): string => `wire:${wireId}`;
export const annotationGraphKey = (annotationId: string): string => `label:${annotationId}`;

class DisjointSet {
  private readonly parent = new Map<string, string>();

  add(key: string): void {
    if (!this.parent.has(key)) {
      this.parent.set(key, key);
    }
  }

  find(key: string): string {
    this.add(key);
    const parent = this.parent.get(key)!;
    if (parent === key) {
      return key;
    }
    const root = this.find(parent);
    this.parent.set(key, root);
    return root;
  }

  union(a: string, b: string): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) {
      this.parent.set(rootB, rootA);
    }
  }

  groups(): Map<string, string[]> {
    const groups = new Map<string, string[]>();
    for (const key of this.parent.keys()) {
      const root = this.find(key);
      const group = groups.get(root) ?? [];
      group.push(key);
      groups.set(root, group);
    }
    return groups;
  }
}

function annotationTouchesSegment(annotation: Annotation, segment: Segment): boolean {
  return pointOnSegment(annotation, segment.start, segment.end, 7);
}

function endpointMatch(point: Point, segment: Segment): boolean {
  return pointsEqual(point, segment.start, 0.5) || pointsEqual(point, segment.end, 0.5);
}

export function buildConnectivity(
  page: DrawingPage,
  library: readonly SymbolDefinition[],
): ConnectivityResult {
  const graph = new DisjointSet();
  const bySymbol = new Map(library.map((symbol) => [symbol.id, symbol]));
  const segments: Segment[] = [];
  const pinTerminals: PinTerminal[] = [];

  for (const wire of page.wires) {
    graph.add(wireGraphKey(wire.id));
    for (let index = 0; index < wire.points.length - 1; index += 1) {
      const start = wire.points[index]!;
      const end = wire.points[index + 1]!;
      segments.push({
        wireId: wire.id,
        wireIndex: page.wires.indexOf(wire),
        segmentIndex: index,
        start,
        end,
      });
    }
  }

  for (const node of page.nodes) {
    const symbol = bySymbol.get(node.symbolId);
    if (!symbol) {
      continue;
    }
    symbol.pins.forEach((_pin, pinIndex) => {
      const key = pinGraphKey(node.id, pinIndex);
      const point = nodePinPosition(node, symbol, pinIndex);
      graph.add(key);
      pinTerminals.push({ key, node, symbol, pinIndex, point });
      for (const segment of segments) {
        if (pointOnSegment(point, segment.start, segment.end, 0.7)) {
          graph.union(key, wireGraphKey(segment.wireId));
        }
      }
    });
  }

  for (const wire of page.wires) {
    for (const anchor of [wire.startAnchor, wire.endAnchor]) {
      if (!anchor) {
        continue;
      }
      const node = page.nodes.find((candidate) => candidate.id === anchor.deviceId);
      const symbol = node ? bySymbol.get(node.symbolId) : undefined;
      const pinIndex = symbol?.pins.findIndex((pin) => pin.key === anchor.pinId) ?? -1;
      if (node && pinIndex >= 0) {
        graph.union(wireGraphKey(wire.id), pinGraphKey(node.id, pinIndex));
      }
    }
  }

  for (let left = 0; left < segments.length; left += 1) {
    const a = segments[left]!;
    for (let right = left + 1; right < segments.length; right += 1) {
      const b = segments[right]!;
      if (a.wireId === b.wireId) {
        continue;
      }
      const intersection = segmentIntersection(a.start, a.end, b.start, b.end);
      const aEndpointOnB =
        pointOnSegment(a.start, b.start, b.end, 0.7) ||
        pointOnSegment(a.end, b.start, b.end, 0.7);
      const bEndpointOnA =
        pointOnSegment(b.start, a.start, a.end, 0.7) ||
        pointOnSegment(b.end, a.start, a.end, 0.7);
      const explicitJunction =
        intersection !== null &&
        page.junctions.some((junction) => pointsEqual(junction, intersection, 0.5));
      if (
        intersection &&
        (aEndpointOnB || bEndpointOnA || explicitJunction)
      ) {
        graph.union(wireGraphKey(a.wireId), wireGraphKey(b.wireId));
      }
    }
  }

  const labelsByText = new Map<string, string[]>();
  for (const annotation of page.annotations) {
    if (annotation.kind !== "net") {
      continue;
    }
    const key = annotationGraphKey(annotation.id);
    graph.add(key);
    for (const segment of segments) {
      if (annotationTouchesSegment(annotation, segment)) {
        graph.union(key, wireGraphKey(segment.wireId));
      }
    }
    for (const pin of pinTerminals) {
      if (distance(annotation, pin.point) <= 8) {
        graph.union(key, pin.key);
      }
    }
    const text = annotation.text.trim();
    if (text) {
      const labels = labelsByText.get(text) ?? [];
      labels.push(key);
      labelsByText.set(text, labels);
    }
  }
  for (const labels of labelsByText.values()) {
    for (let index = 1; index < labels.length; index += 1) {
      graph.union(labels[0]!, labels[index]!);
    }
  }

  const rawGroups = [...graph.groups().values()]
    .map((group) => group.sort())
    .sort((a, b) => (a[0] ?? "").localeCompare(b[0] ?? ""));
  const networkIdByKey = new Map<string, string>();
  const groups: string[][] = [];

  rawGroups.forEach((group, index) => {
    const networkId = `net_${index + 1}`;
    groups.push(group);
    for (const key of group) {
      networkIdByKey.set(key, networkId);
    }
  });

  const networkIdByPin = new Map<string, string>();
  for (const pin of pinTerminals) {
    networkIdByPin.set(pin.key, networkIdByKey.get(pin.key)!);
  }
  const networkIdByWire = new Map<string, string>();
  for (const wire of page.wires) {
    networkIdByWire.set(wire.id, networkIdByKey.get(wireGraphKey(wire.id))!);
  }
  const networkIdByAnnotation = new Map<string, string>();
  for (const annotation of page.annotations) {
    const networkId = networkIdByKey.get(annotationGraphKey(annotation.id));
    if (networkId) {
      networkIdByAnnotation.set(annotation.id, networkId);
    }
  }

  const netNamesByGroup = new Map<string, string[]>();
  for (const group of groups) {
    const networkId = networkIdByKey.get(group[0]!)!;
    const names = page.annotations
      .filter(
        (annotation) =>
          annotation.kind === "net" &&
          networkIdByAnnotation.get(annotation.id) === networkId &&
          annotation.text.trim(),
      )
      .map((annotation) => annotation.text.trim())
      .filter((name, index, all) => all.indexOf(name) === index)
      .sort();
    netNamesByGroup.set(networkId, names);
  }

  const explicitJunctions = page.junctions.map((point) => ({ ...point }));
  const automaticJunctions: Point[] = [];
  const endpointWires = new Map<string, Set<string>>();
  for (const segment of segments) {
    for (const point of [segment.start, segment.end]) {
      const key = `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
      const wires = endpointWires.get(key) ?? new Set<string>();
      wires.add(segment.wireId);
      endpointWires.set(key, wires);
    }
  }
  for (const segment of segments) {
    for (const point of [segment.start, segment.end]) {
      const others = segments.filter(
        (other) =>
          other.wireId !== segment.wireId &&
          pointOnSegment(point, other.start, other.end, 0.7),
      );
      const pinsHere = pinTerminals.some((pin) => pointsEqual(pin.point, point, 0.7));
      if (others.length > 0 || pinsHere) {
        automaticJunctions.push(point);
      }
    }
  }
  const uniqueJunctions = [...explicitJunctions, ...automaticJunctions].filter(
    (point, index, all) => all.findIndex((other) => pointsEqual(point, other, 0.5)) === index,
  );

  return {
    groups,
    networkIdByKey,
    networkIdByPin,
    networkIdByWire,
    networkIdByAnnotation,
    netNamesByGroup,
    pinTerminals,
    segments,
    junctionPoints: uniqueJunctions,
  };
}

export function selectedNetworkIds(
  connectivity: ConnectivityResult,
  selection: readonly SelectionRef[],
): Set<string> {
  const result = new Set<string>();
  for (const item of selection) {
    if (item.kind === "wire") {
      const network = connectivity.networkIdByWire.get(item.id);
      if (network) {
        result.add(network);
      }
    } else if (item.kind === "annotation") {
      const network = connectivity.networkIdByAnnotation.get(item.id);
      if (network) {
        result.add(network);
      }
    }
  }
  return result;
}
