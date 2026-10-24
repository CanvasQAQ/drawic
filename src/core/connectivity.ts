import {
  distance,
  nodePinPosition,
  pointOnSegment,
  pointsEqual,
  segmentIntersection,
} from "./geometry";
import {
  allJunctions,
  allWires,
  defaultNetName,
  type Annotation,
  type ComponentNode,
  type DrawingPage,
  type Point,
  type SelectionRef,
  type SymbolDefinition,
} from "./model";
import { resolveWirePoints } from "./wireMotion";

export interface WireSegment {
  wireId: string;
  wireIndex: number;
  segmentIndex: number;
  start: Point;
  end: Point;
}

export interface PinTerminal {
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
  networkIdByJunction: Map<string, string>;
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
export const junctionGraphKey = (junctionId: string): string =>
  `junction:${junctionId}`;
export const netGraphKey = (netId: string): string => `net:${netId}`;
export const annotationGraphKey = (annotationId: string): string =>
  `label:${annotationId}`;

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

function netsByName(page: DrawingPage): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const net of page.nets) {
    const name = net.name?.trim();
    if (!name) {
      continue;
    }
    const ids = result.get(name) ?? [];
    ids.push(net.id);
    result.set(name, ids);
  }
  return result;
}

function annotationTouchesSegment(
  annotation: Annotation,
  segment: WireSegment,
): boolean {
  return pointOnSegment(annotation, segment.start, segment.end, 7);
}

function pinEndpointKey(deviceId: string, pinId: string): string {
  return `pin-ref:${deviceId}:${pinId}`;
}

export function buildConnectivity(
  page: DrawingPage,
  library: readonly SymbolDefinition[],
): ConnectivityResult {
  const graph = new DisjointSet();
  const bySymbol = new Map(library.map((symbol) => [symbol.id, symbol]));
  const locatedWires = allWires(page);
  const locatedJunctions = allJunctions(page);
  const segments: WireSegment[] = [];
  const pinTerminals: PinTerminal[] = [];

  for (const net of page.nets) {
    graph.add(netGraphKey(net.id));
    for (const wire of net.wires) {
      graph.add(wireGraphKey(wire.id));
      graph.union(netGraphKey(net.id), wireGraphKey(wire.id));
      if (wire.start.kind === "pin") {
        graph.union(
          wireGraphKey(wire.id),
          pinEndpointKey(wire.start.deviceId, wire.start.pinId),
        );
      } else if (wire.start.kind === "junction") {
        graph.union(
          wireGraphKey(wire.id),
          junctionGraphKey(wire.start.junctionId),
        );
      }
      if (wire.end.kind === "pin") {
        graph.union(
          wireGraphKey(wire.id),
          pinEndpointKey(wire.end.deviceId, wire.end.pinId),
        );
      } else if (wire.end.kind === "junction") {
        graph.union(
          wireGraphKey(wire.id),
          junctionGraphKey(wire.end.junctionId),
        );
      }
    }
    for (const junction of net.junctions) {
      graph.add(junctionGraphKey(junction.id));
      graph.union(netGraphKey(net.id), junctionGraphKey(junction.id));
    }
  }
  for (const netIds of netsByName(page).values()) {
    for (let index = 1; index < netIds.length; index += 1) {
      graph.union(netGraphKey(netIds[0]!), netGraphKey(netIds[index]!));
    }
  }

  locatedWires.forEach(({ wire }, wireIndex) => {
    const points = resolveWirePoints(page, library, wire);
    if (!points) {
      return;
    }
    for (let segmentIndex = 0; segmentIndex < points.length - 1; segmentIndex += 1) {
      segments.push({
        wireId: wire.id,
        wireIndex,
        segmentIndex,
        start: points[segmentIndex]!,
        end: points[segmentIndex + 1]!,
      });
    }
  });

  for (const node of page.nodes) {
    const symbol = bySymbol.get(node.symbolId);
    if (!symbol) {
      continue;
    }
    symbol.pins.forEach((pin, pinIndex) => {
      const key = pinGraphKey(node.id, pinIndex);
      const point = nodePinPosition(node, symbol, pinIndex);
      graph.add(key);
      graph.union(key, pinEndpointKey(node.id, pin.key));
      pinTerminals.push({ key, node, symbol, pinIndex, point });
      for (const segment of segments) {
        if (pointOnSegment(point, segment.start, segment.end, 0.7)) {
          graph.union(key, wireGraphKey(segment.wireId));
        }
      }
    });
  }

  const labelsByText = new Map<string, string[]>();
  for (const annotation of page.annotations) {
    if (annotation.kind !== "net") {
      continue;
    }
    const key = annotationGraphKey(annotation.id);
    graph.add(key);
    if (annotation.netId) {
      graph.union(key, netGraphKey(annotation.netId));
    }
    if (annotation.wireId) {
      graph.union(key, wireGraphKey(annotation.wireId));
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
    const networkId = networkIdByKey.get(pin.key);
    if (networkId) {
      networkIdByPin.set(pin.key, networkId);
    }
  }
  const networkIdByWire = new Map<string, string>();
  for (const { wire } of locatedWires) {
    const networkId = networkIdByKey.get(wireGraphKey(wire.id));
    if (networkId) {
      networkIdByWire.set(wire.id, networkId);
    }
  }
  const networkIdByJunction = new Map<string, string>();
  for (const { junction } of locatedJunctions) {
    const networkId = networkIdByKey.get(junctionGraphKey(junction.id));
    if (networkId) {
      networkIdByJunction.set(junction.id, networkId);
    }
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
    const netIds = new Set(
      group.flatMap((key) =>
        key.startsWith("net:") ? [key.slice("net:".length)] : [],
      ),
    );
    const structuralNames = page.nets
      .filter((net) => netIds.has(net.id) && net.name?.trim())
      .map((net) => net.name!.trim());
    const annotationIds = new Set(
      group.flatMap((key) =>
        key.startsWith("label:") ? [key.slice("label:".length)] : [],
      ),
    );
    const labelNames = page.annotations
      .filter(
        (annotation) =>
          annotation.kind === "net" &&
          annotationIds.has(annotation.id) &&
          annotation.text.trim(),
      )
      .map((annotation) => annotation.text.trim());
    const names = [...structuralNames, ...labelNames].filter(
      (name, nameIndex, all) => all.indexOf(name) === nameIndex,
    );
    netNamesByGroup.set(networkId, names.sort());
    netNameByGroup.set(
      networkId,
      [...labelNames].sort()[0] ??
        [...structuralNames].sort()[0] ??
        defaultNetName(index),
    );
  }

  const netNameByWire = new Map<string, string>();
  for (const { wire } of locatedWires) {
    const networkId = networkIdByWire.get(wire.id);
    if (networkId) {
      netNameByWire.set(
        wire.id,
        netNameByGroup.get(networkId) ?? defaultNetName(0),
      );
    }
  }

  return {
    groups,
    networkIdByKey,
    networkIdByPin,
    networkIdByWire,
    networkIdByJunction,
    networkIdByAnnotation,
    netNamesByGroup,
    netNameByGroup,
    netNameByWire,
    pinTerminals,
    segments,
    junctionPoints: locatedJunctions.map(({ junction }) => ({ ...junction.point })),
  };
}

export function selectedNetworkIds(
  connectivity: ConnectivityResult,
  selection: readonly SelectionRef[],
): Set<string> {
  const result = new Set<string>();
  for (const item of selection) {
    const network =
      item.kind === "wire"
        ? connectivity.networkIdByWire.get(item.id)
        : item.kind === "junction"
          ? connectivity.networkIdByJunction.get(
              item.id.replace(/^junction:/, ""),
            )
          : item.kind === "annotation"
            ? connectivity.networkIdByAnnotation.get(item.id)
            : undefined;
    if (network) {
      result.add(network);
    }
  }
  return result;
}

export function wiresIntersect(a: WireSegment, b: WireSegment): Point | null {
  if (a.wireId === b.wireId) {
    return null;
  }
  return segmentIntersection(a.start, a.end, b.start, b.end);
}

export function segmentsTouch(a: WireSegment, b: WireSegment): boolean {
  return (
    pointsEqual(a.start, b.start, 0.5) ||
    pointsEqual(a.start, b.end, 0.5) ||
    pointsEqual(a.end, b.start, 0.5) ||
    pointsEqual(a.end, b.end, 0.5)
  );
}
