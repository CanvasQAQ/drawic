import {
  pointOnSegment,
  pointsEqual,
  segmentIntersection,
  simplifyOrthogonalPath,
} from "./geometry";
import {
  allJunctions,
  allWires,
  createIdentifier,
  type DrawingPage,
  type DrawicDocument,
  type Junction,
  type Net,
  type PinEndpoint,
  type Point,
  type Wire,
  type WireEndpoint,
} from "./model";

interface AtomicEdge {
  id: string;
  a: string;
  b: string;
  points: Map<string, Point>;
  sourceWireIds: Set<string>;
}

interface GraphNode {
  key: string;
  point: Point;
  edges: Set<string>;
  pins: PinEndpoint[];
}

export interface NetGraphViolation {
  code:
    | "invalid-junction-reference"
    | "low-degree-junction"
    | "junction-crosses-wire"
    | "endpoint-crosses-wire"
    | "crossing-without-junction"
    | "overlapping-segments"
    | "duplicate-endpoints";
  netId: string;
  itemId?: string;
  message: string;
}

function pointKey(point: Point): string {
  return `${point.x.toFixed(3)}:${point.y.toFixed(3)}`;
}

function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function pinKey(endpoint: PinEndpoint): string {
  return `${endpoint.deviceId}:${endpoint.pinId}`;
}

function wireEndpointKey(wire: Wire, side: "start" | "end"): string {
  const endpoint = side === "start" ? wire.start : wire.end;
  const point = side === "start" ? wire.points[0]! : wire.points.at(-1)!;
  if (endpoint.kind === "pin") {
    return `pin:${endpoint.deviceId}:${endpoint.pinId}`;
  }
  if (endpoint.kind === "junction") {
    return `junction:${endpoint.junctionId}`;
  }
  return `open:${pointKey(point)}`;
}

function endpointPoint(
  wire: Wire,
  endpoint: WireEndpoint,
): Point | null {
  if (endpoint.kind === "pin") {
    return wire.start === endpoint ? wire.points[0]! : wire.points.at(-1)!;
  }
  if (endpoint.kind === "open") {
    return wire.start === endpoint ? wire.points[0]! : wire.points.at(-1)!;
  }
  return null;
}

function collectPinEndpoints(
  net: Net,
  nodes: Map<string, GraphNode>,
): void {
  for (const wire of net.wires) {
    for (const endpoint of [wire.start, wire.end]) {
      if (endpoint.kind !== "pin") {
        continue;
      }
      const point = endpointPoint(wire, endpoint);
      if (!point) {
        continue;
      }
      const key = pointKey(point);
      const node = nodes.get(key);
      if (node && !node.pins.some((pin) => pinKey(pin) === pinKey(endpoint))) {
        node.pins.push(endpoint);
      }
    }
  }
}

function buildAtomicGraph(net: Net): {
  nodes: Map<string, GraphNode>;
  edges: Map<string, AtomicEdge>;
} {
  const splitKeys = new Set<string>();
  const pointsByKey = new Map<string, Point>();
  const addPoint = (point: Point): void => {
    const key = pointKey(point);
    splitKeys.add(key);
    pointsByKey.set(key, { ...point });
  };
  for (const wire of net.wires) {
    for (const point of wire.points) {
      addPoint(point);
    }
  }
  for (const junction of net.junctions) {
    addPoint(junction.point);
  }

  const rawSegments = net.wires.flatMap((wire) =>
    wire.points.slice(1).map((end, index) => ({
      wire,
      start: wire.points[index]!,
      end,
    })),
  );
  for (let left = 0; left < rawSegments.length; left += 1) {
    for (let right = left + 1; right < rawSegments.length; right += 1) {
      const a = rawSegments[left]!;
      const b = rawSegments[right]!;
      if (a.wire.id === b.wire.id) {
        continue;
      }
      const intersection = segmentIntersection(a.start, a.end, b.start, b.end);
      if (intersection) {
        addPoint(intersection);
      }
    }
  }

  const edges = new Map<string, AtomicEdge>();
  for (const rawSegment of rawSegments) {
    const { wire, start, end } = rawSegment;
      if (pointsEqual(start, end, 0.001)) {
        continue;
      }
      const candidates = [...pointsByKey.entries()]
        .filter(([, point]) => pointOnSegment(point, start, end, 0.5))
        .sort(([aKey, a], [bKey, b]) => {
          const aValue = start.x === end.x ? a.y : a.x;
          const bValue = start.x === end.x ? b.y : b.x;
          return aValue - bValue || aKey.localeCompare(bKey);
        });
      for (let candidateIndex = 1; candidateIndex < candidates.length; candidateIndex += 1) {
        const [aKey, a] = candidates[candidateIndex - 1]!;
        const [bKey, b] = candidates[candidateIndex]!;
        if (pointsEqual(a, b, 0.001)) {
          continue;
        }
        const key = edgeKey(aKey, bKey);
        const existing = edges.get(key);
        if (existing) {
          existing.sourceWireIds.add(wire.id);
        } else {
          edges.set(key, {
            id: `edge_${key}`,
            a: aKey,
            b: bKey,
            points: new Map([
              [aKey, { ...a }],
              [bKey, { ...b }],
            ]),
            sourceWireIds: new Set([wire.id]),
          });
        }
      }
  }

  const nodes = new Map<string, GraphNode>();
  const addNode = (key: string, point: Point): GraphNode => {
    const node = nodes.get(key) ?? {
      key,
      point: { ...point },
      edges: new Set<string>(),
      pins: [],
    };
    nodes.set(key, node);
    return node;
  };
  for (const [key, point] of pointsByKey) {
    addNode(key, point);
  }
  for (const [key, edge] of edges) {
    addNode(edge.a, edge.points.get(edge.a)!).edges.add(key);
    addNode(edge.b, edge.points.get(edge.b)!).edges.add(key);
  }
  collectPinEndpoints(net, nodes);
  return { nodes, edges };
}

function endpointForNode(
  node: GraphNode,
  junctionId: string | undefined,
): WireEndpoint {
  if (node.pins[0]) {
    return { ...node.pins[0] };
  }
  if (junctionId) {
    return { kind: "junction", junctionId };
  }
  return { kind: "open" };
}

function netSegments(net: Net): Array<{
  wire: Wire;
  index: number;
  start: Point;
  end: Point;
}> {
  return net.wires.flatMap((wire) =>
    wire.points.slice(1).map((end, index) => ({
      wire,
      index,
      start: wire.points[index]!,
      end,
    })),
  );
}

function collinearSegmentOverlap(
  a: { wire: Wire; index: number; start: Point; end: Point },
  b: { wire: Wire; index: number; start: Point; end: Point },
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

export function findNetGraphViolations(
  page: DrawingPage,
): NetGraphViolation[] {
  const violations: NetGraphViolation[] = [];
  for (const net of page.nets) {
    const junctions = new Map(
      net.junctions.map((junction) => [junction.id, junction]),
    );
    const degree = new Map<string, number>(
      net.junctions.map((junction) => [junction.id, 0]),
    );
    const endpointPairs = new Map<string, string>();
    for (const wire of net.wires) {
      for (const endpoint of [wire.start, wire.end]) {
        if (endpoint.kind !== "junction") {
          continue;
        }
        if (!junctions.has(endpoint.junctionId)) {
          violations.push({
            code: "invalid-junction-reference",
            netId: net.id,
            itemId: wire.id,
            message: `${wire.id} references missing junction ${endpoint.junctionId}.`,
          });
        } else {
          degree.set(
            endpoint.junctionId,
            (degree.get(endpoint.junctionId) ?? 0) + 1,
          );
        }
      }
      const ends = [
        wireEndpointKey(wire, "start"),
        wireEndpointKey(wire, "end"),
      ].sort();
      const pair = ends.join("|");
      const duplicate = endpointPairs.get(pair);
      if (duplicate) {
        violations.push({
          code: "duplicate-endpoints",
          netId: net.id,
          itemId: wire.id,
          message: `${wire.id} duplicates the endpoint pair of ${duplicate}.`,
        });
      } else {
        endpointPairs.set(pair, wire.id);
      }
    }
    for (const junction of net.junctions) {
      if ((degree.get(junction.id) ?? 0) < 3) {
        violations.push({
          code: "low-degree-junction",
          netId: net.id,
          itemId: junction.id,
          message: `${junction.id} has degree ${degree.get(junction.id) ?? 0}.`,
        });
      }
      for (const segment of netSegments(net)) {
        if (
          pointOnSegment(
            junction.point,
            segment.start,
            segment.end,
            0.5,
          ) &&
          !pointsEqual(junction.point, segment.start, 0.5) &&
          !pointsEqual(junction.point, segment.end, 0.5)
        ) {
          violations.push({
            code: "junction-crosses-wire",
            netId: net.id,
            itemId: junction.id,
            message: `${junction.id} lies inside ${segment.wire.id}.`,
          });
        }
      }
    }
    for (const wire of net.wires) {
      for (const [side, point] of [
        ["start", wire.points[0]!],
        ["end", wire.points.at(-1)!],
      ] as const) {
        for (const other of net.wires) {
          if (other.id === wire.id) {
            continue;
          }
          for (let index = 1; index < other.points.length; index += 1) {
            const start = other.points[index - 1]!;
            const end = other.points[index]!;
            if (
              pointOnSegment(point, start, end, 0.5) &&
              !pointsEqual(point, start, 0.5) &&
              !pointsEqual(point, end, 0.5)
            ) {
              violations.push({
                code: "endpoint-crosses-wire",
                netId: net.id,
                itemId: wire.id,
                message: `${wire.id} ${side} lies inside ${other.id}.`,
              });
            }
          }
        }
      }
    }
    const segments = netSegments(net);
    for (let left = 0; left < segments.length; left += 1) {
      for (let right = left + 1; right < segments.length; right += 1) {
        const a = segments[left]!;
        const b = segments[right]!;
        if (a.wire.id === b.wire.id) {
          continue;
        }
        const overlap = collinearSegmentOverlap(a, b);
        if (overlap) {
          violations.push({
            code: "overlapping-segments",
            netId: net.id,
            itemId: a.wire.id,
            message: `${a.wire.id} overlaps ${b.wire.id}.`,
          });
          continue;
        }
        const intersection = segmentIntersection(
          a.start,
          a.end,
          b.start,
          b.end,
        );
        if (
          intersection &&
          !pointsEqual(intersection, a.start, 0.5) &&
          !pointsEqual(intersection, a.end, 0.5) &&
          !pointsEqual(intersection, b.start, 0.5) &&
          !pointsEqual(intersection, b.end, 0.5) &&
          !net.junctions.some((junction) =>
            pointsEqual(junction.point, intersection, 0.5),
          )
        ) {
          violations.push({
            code: "crossing-without-junction",
            netId: net.id,
            itemId: a.wire.id,
            message: `${a.wire.id} and ${b.wire.id} cross without a junction at (${intersection.x}, ${intersection.y}).`,
          });
        }
      }
    }
  }
  return violations;
}

function canonicalizeNetGraph(net: Net): Net {
  const { nodes, edges } = buildAtomicGraph(net);
  const existingJunctions = new Map(
    net.junctions.map((junction) => [pointKey(junction.point), junction]),
  );
  const junctions: Junction[] = [];
  const junctionByNode = new Map<string, string>();
  for (const node of nodes.values()) {
    if (node.edges.size < 3 || node.pins.length > 0) {
      continue;
    }
    const existing = existingJunctions.get(node.key);
    const junction: Junction = existing ?? {
      id: createIdentifier("junction"),
      point: { ...node.point },
    };
    junctions.push(junction);
    junctionByNode.set(node.key, junction.id);
  }

  const isTerminal = (node: GraphNode): boolean =>
    node.edges.size !== 2 || node.pins.length > 0 || node.edges.size >= 3;
  const visited = new Set<string>();
  const canonicalWires: Wire[] = [];
  const usedWireIds = new Set<string>();
  const sourceOrder = new Map(
    net.wires.map((wire, index) => [wire.id, index]),
  );

  const nextWireId = (edgeIds: readonly string[]): string => {
    const candidates = [
      ...new Set(
        edgeIds.flatMap((edgeId) => [
          ...(edges.get(edgeId)?.sourceWireIds ?? []),
        ]),
      ),
    ].sort(
      (a, b) =>
        (sourceOrder.get(a) ?? Number.MAX_SAFE_INTEGER) -
          (sourceOrder.get(b) ?? Number.MAX_SAFE_INTEGER) ||
        a.localeCompare(b),
    );
    const available = candidates.find((id) => !usedWireIds.has(id));
    const id = available ?? createIdentifier("wire");
    usedWireIds.add(id);
    return id;
  };

  const walkPath = (start: GraphNode, firstEdgeId: string): void => {
    const edgeIds: string[] = [];
    const points: Point[] = [{ ...start.point }];
    let current = start;
    let edgeId: string | undefined = firstEdgeId;
    while (edgeId && !visited.has(edgeId)) {
      visited.add(edgeId);
      edgeIds.push(edgeId);
      const edge = edges.get(edgeId)!;
      const nextKey = edge.a === current.key ? edge.b : edge.a;
      const next = nodes.get(nextKey)!;
      points.push({ ...next.point });
      if (next !== start && isTerminal(next)) {
        canonicalWires.push({
          id: nextWireId(edgeIds),
          points: simplifyOrthogonalPath(points),
          start: endpointForNode(
            start,
            junctionByNode.get(start.key),
          ),
          end: endpointForNode(next, junctionByNode.get(next.key)),
        });
        return;
      }
      current = next;
      const remaining = [...current.edges].filter(
        (candidate) => !visited.has(candidate),
      );
      edgeId = remaining[0];
      if (!edgeId) {
        return;
      }
    }
  };

  const terminals = [...nodes.values()]
    .filter(isTerminal)
    .sort((a, b) => a.key.localeCompare(b.key));
  for (const terminal of terminals) {
    for (const edgeId of [...terminal.edges].sort()) {
      if (!visited.has(edgeId)) {
        walkPath(terminal, edgeId);
      }
    }
  }

  for (const edgeId of [...edges.keys()].sort()) {
    if (visited.has(edgeId)) {
      continue;
    }
    const edge = edges.get(edgeId)!;
    const start = nodes.get(edge.a)!;
    const points = [{ ...start.point }];
    let current = start;
    let cursor: string | undefined = edgeId;
    while (cursor && !visited.has(cursor)) {
      visited.add(cursor);
      const currentEdge = edges.get(cursor)!;
      const nextKey =
        currentEdge.a === current.key ? currentEdge.b : currentEdge.a;
      const next = nodes.get(nextKey)!;
      points.push({ ...next.point });
      current = next;
      cursor = [...current.edges].find(
        (candidate) => !visited.has(candidate),
      );
    }
    canonicalWires.push({
      id: nextWireId([edgeId]),
      points: simplifyOrthogonalPath(points),
      start: { kind: "open" },
      end: { kind: "open" },
    });
  }

  canonicalWires.sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  junctions.sort((a, b) => a.id.localeCompare(b.id));
  const next: Net = {
    id: net.id,
    ...(net.name ? { name: net.name } : {}),
    wires: canonicalWires,
    junctions,
  };
  return JSON.stringify(next) === JSON.stringify(net) ? net : next;
}

class NetDisjointSet {
  private readonly parent = new Map<string, string>();

  find(key: string): string {
    const parent = this.parent.get(key) ?? key;
    if (parent === key) {
      this.parent.set(key, key);
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
}

function mergeNets(page: DrawingPage): DrawingPage {
  const graph = new NetDisjointSet();
  const pinToNet = new Map<string, string>();
  const nameToNet = new Map<string, string>();
  for (const net of page.nets) {
    graph.find(net.id);
    const name = net.name?.trim();
    if (name) {
      const existing = nameToNet.get(name);
      if (existing) {
        graph.union(existing, net.id);
      } else {
        nameToNet.set(name, net.id);
      }
    }
    for (const wire of net.wires) {
      for (const endpoint of [wire.start, wire.end]) {
        if (endpoint.kind !== "pin") {
          continue;
        }
        const key = pinKey(endpoint);
        const existing = pinToNet.get(key);
        if (existing) {
          graph.union(existing, net.id);
        } else {
          pinToNet.set(key, net.id);
        }
      }
    }
  }
  const groups = new Map<string, Net[]>();
  for (const net of page.nets) {
    const root = graph.find(net.id);
    const group = groups.get(root) ?? [];
    group.push(net);
    groups.set(root, group);
  }
  if (groups.size === page.nets.length) {
    return page;
  }
  const netIdMap = new Map<string, string>();
  const nets = [...groups.values()].map((group) => {
    const primary = group[0]!;
    const name = group.map((net) => net.name?.trim()).find(Boolean);
    for (const net of group) {
      netIdMap.set(net.id, primary.id);
    }
    return {
      id: primary.id,
      ...(name ? { name } : {}),
      wires: group.flatMap((net) => net.wires),
      junctions: group.flatMap((net) => net.junctions),
    };
  });
  return {
    ...page,
    nets,
    annotations: page.annotations.map((annotation) =>
      annotation.netId && netIdMap.has(annotation.netId)
        ? { ...annotation, netId: netIdMap.get(annotation.netId)! }
        : annotation,
    ),
  };
}

function annotationNearWire(
  x: number,
  y: number,
  wire: Wire,
): boolean {
  return wire.points.some((point, index) => {
    if (index === 0) {
      return false;
    }
    return pointOnSegment(
      { x, y },
      wire.points[index - 1]!,
      point,
      8,
    );
  });
}

function reconcileNetLabels(page: DrawingPage): DrawingPage {
  let changed = false;
  const annotations = page.annotations.map((annotation) => {
    if (annotation.kind !== "net" || !annotation.netId) {
      return annotation;
    }
    const net = page.nets.find((candidate) => candidate.id === annotation.netId);
    if (!net) {
      return annotation;
    }
    const replacement =
      net.wires.find((wire) =>
        annotationNearWire(annotation.x, annotation.y, wire),
      ) ??
      net.wires.find((wire) => wire.id === annotation.wireId);
    if (!replacement || replacement.id === annotation.wireId) {
      return annotation;
    }
    changed = true;
    return { ...annotation, wireId: replacement.id };
  });
  return changed ? { ...page, annotations } : page;
}

export function canonicalizePageNetGraph(page: DrawingPage): DrawingPage {
  let current = page;
  for (let pass = 0; pass < 4; pass += 1) {
    const nets = current.nets.map(canonicalizeNetGraph);
    const canonical: DrawingPage =
      nets.some((net, index) => net !== current.nets[index])
        ? { ...current, nets }
        : current;
    const merged = mergeNets(canonical);
    const next = reconcileNetLabels(merged);
    if (next === current) {
      return current;
    }
    current = next;
  }
  return current;
}

export function canonicalizeDocumentNetGraph(
  document: DrawicDocument,
): DrawicDocument {
  let changed = false;
  const pages = document.pages.map((page) => {
    const next = canonicalizePageNetGraph(page);
    if (next !== page) {
      changed = true;
    }
    return next;
  });
  return changed ? { ...document, pages } : document;
}

export function wireNetId(page: DrawingPage, wireId: string): string | null {
  return allWires(page).find(({ wire }) => wire.id === wireId)?.net.id ?? null;
}

export function junctionNetId(
  page: DrawingPage,
  junctionId: string,
): string | null {
  return (
    allJunctions(page).find(({ junction }) => junction.id === junctionId)?.net
      .id ?? null
  );
}
