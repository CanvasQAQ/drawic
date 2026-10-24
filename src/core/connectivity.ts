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
import { defaultNetName } from "./model";
import { resolveWirePoints } from "./wireMotion";

export interface WireSegment {
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
  netNameByGroup: Map<string, string>;
  netNameByWire: Map<string, string>;
  pinTerminals: PinTerminal[];
  segments: WireSegment[];
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

function annotationTouchesSegment(annotation: Annotation, segment: WireSegment): boolean {
  return pointOnSegment(annotation, segment.start, segment.end, 7);
}

function endpointMatch(point: Point, segment: WireSegment): boolean {
  return pointsEqual(point, segment.start, 0.5) || pointsEqual(point, segment.end, 0.5);
}

function collinearOverlap(
  a: WireSegment,
  b: WireSegment,
): { start: Point; end: Point } | null {
  const horizontal =
    a.start.y === a.end.y && b.start.y === b.end.y && a.start.y === b.start.y;
  const vertical =
    a.start.x === a.end.x && b.start.x === b.end.x && a.start.x === b.start.x;
  if (!horizontal && !vertical) {
    return null;
  }
  const aStart = horizontal ? a.start.x : a.start.y;
  const aEnd = horizontal ? a.end.x : a.end.y;
  const bStart = horizontal ? b.start.x : b.start.y;
  const bEnd = horizontal ? b.end.x : b.end.y;
  const lower = Math.max(Math.min(aStart, aEnd), Math.min(bStart, bEnd));
  const upper = Math.min(Math.max(aStart, aEnd), Math.max(bStart, bEnd));
  if (upper - lower < 0.1) {
    return null;
  }
  return horizontal
    ? { start: { x: lower, y: a.start.y }, end: { x: upper, y: a.start.y } }
    : { start: { x: a.start.x, y: lower }, end: { x: a.start.x, y: upper } };
}

export function buildConnectivity(
  page: DrawingPage,
  library: readonly SymbolDefinition[],
): ConnectivityResult {
  const graph = new DisjointSet();
  const bySymbol = new Map(library.map((symbol) => [symbol.id, symbol]));
  const segments: WireSegment[] = [];
  const pinTerminals: PinTerminal[] = [];

  for (const wire of page.wires) {
    graph.add(wireGraphKey(wire.id));
    const points = resolveWirePoints(page, library, wire);
    if (!points) {
      continue;
    }
    for (let index = 0; index < points.length - 1; index += 1) {
      const start = points[index]!;
      const end = points[index + 1]!;
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
      const overlap = collinearOverlap(a, b);
      const explicitJunction =
        (intersection !== null &&
          page.junctions.some((junction) =>
            pointsEqual(junction, intersection, 0.5),
          )) ||
        (overlap !== null &&
          page.junctions.some((junction) =>
            pointOnSegment(junction, overlap.start, overlap.end, 0.5),
          ));
      if (explicitJunction) {
        graph.union(wireGraphKey(a.wireId), wireGraphKey(b.wireId));
      }
    }
  }

  const labelsByText = new Map<string, string[]>();
  for (const wire of page.wires) {
    const text = wire.name?.trim() ?? "";
    if (!text) {
      continue;
    }
    const labels = labelsByText.get(text) ?? [];
    labels.push(wireGraphKey(wire.id));
    labelsByText.set(text, labels);
  }
  for (const annotation of page.annotations) {
    if (annotation.kind !== "net") {
      continue;
    }
    const key = annotationGraphKey(annotation.id);
    graph.add(key);
    if (annotation.wireId) {
      const attachedWire = page.wires.find(
        (wire) => wire.id === annotation.wireId,
      );
      if (attachedWire) {
        graph.union(key, wireGraphKey(attachedWire.id));
      }
    } else {
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
  const netNameByGroup = new Map<string, string>();
  for (const [index, group] of groups.entries()) {
    const networkId = networkIdByKey.get(group[0]!)!;
    const labelNames = page.annotations
      .filter(
        (annotation) =>
          annotation.kind === "net" &&
          networkIdByAnnotation.get(annotation.id) === networkId &&
          annotation.text.trim(),
      )
      .map((annotation) => annotation.text.trim());
    const wireNames = page.wires
      .filter(
        (wire) =>
          wire.name?.trim() &&
          networkIdByWire.get(wire.id) === networkId,
      )
      .map((wire) => wire.name!.trim());
    const names = [...wireNames, ...labelNames]
      .filter((name, index, all) => all.indexOf(name) === index)
      .sort();
    netNamesByGroup.set(networkId, names);
    netNameByGroup.set(
      networkId,
      [...labelNames].sort()[0] ?? [...wireNames].sort()[0] ?? defaultNetName(index),
    );
  }
  const netNameByWire = new Map<string, string>();
  for (const wire of page.wires) {
    const networkId = networkIdByWire.get(wire.id);
    if (networkId) {
      netNameByWire.set(
        wire.id,
        netNameByGroup.get(networkId) ?? defaultNetName(0),
      );
    }
  }

  const hiddenOverlapJunctions = new Set<string>();
  for (let left = 0; left < segments.length; left += 1) {
    const a = segments[left]!;
    for (let right = left + 1; right < segments.length; right += 1) {
      const b = segments[right]!;
      if (a.wireId === b.wireId) {
        continue;
      }
      const overlap = collinearOverlap(a, b);
      if (!overlap) {
        continue;
      }
      for (const junction of page.junctions) {
        if (pointOnSegment(junction, overlap.start, overlap.end, 0.5)) {
          hiddenOverlapJunctions.add(
            `${junction.x.toFixed(3)}:${junction.y.toFixed(3)}`,
          );
        }
      }
    }
  }
  const explicitJunctions = page.junctions
    .filter(
      (point) =>
        !hiddenOverlapJunctions.has(
          `${point.x.toFixed(3)}:${point.y.toFixed(3)}`,
        ),
    )
    .map((point) => ({ ...point }));
  const automaticSameNetJunctions: Point[] = [];
  for (let left = 0; left < segments.length; left += 1) {
    const a = segments[left]!;
    for (let right = left + 1; right < segments.length; right += 1) {
      const b = segments[right]!;
      if (
        a.wireId === b.wireId ||
        networkIdByWire.get(a.wireId) !== networkIdByWire.get(b.wireId)
      ) {
        continue;
      }
      const intersection = segmentIntersection(a.start, a.end, b.start, b.end);
      if (intersection) {
        automaticSameNetJunctions.push(intersection);
      }
    }
  }
  const uniqueJunctions = [
    ...explicitJunctions,
    ...automaticSameNetJunctions,
  ].filter(
    (point, index, all) => all.findIndex((other) => pointsEqual(point, other, 0.5)) === index,
  );

  return {
    groups,
    networkIdByKey,
    networkIdByPin,
    networkIdByWire,
    networkIdByAnnotation,
    netNamesByGroup,
    netNameByGroup,
    netNameByWire,
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
