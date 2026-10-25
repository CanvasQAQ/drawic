import {
  allJunctions,
  allWires,
  createEmptyNet,
  createIdentifier,
  findJunction,
  findWire,
  junctionSelectionId,
  normalizeNetColor,
  pinEndpoint,
  pageById,
  replacePage,
  touchDocument,
  type Annotation,
  type ComponentNode,
  type ConnectionAnchor,
  type DrawingPage,
  type DrawingShape,
  type DocumentTypography,
  type DrawicDocument,
  type Junction,
  type Net,
  type NodeLabelKind,
  type NodeLabelLayout,
  type RichTextRun,
  type Point,
  type Rotation,
  type SelectionRef,
  type SymbolDefinition,
  type Wire,
  type WireEndpoint,
} from "./model";
import { defaultDeviceValue, suggestedReference } from "./library";
import {
  DEFAULT_TYPOGRAPHY,
  layoutNodeLabels,
  reflowDefaultNodeLabels,
  translateNodeLabelLayouts,
} from "./labels";
import {
  pathProjectionRatio,
  planNodeMirror,
  planNodeMirrorVertical,
  planNodeMove,
  planNodeRotation,
  pointAtPathRatio,
} from "./wireMotion";
import {
  pointOnSegment,
  pointsEqual,
  simplifyOrthogonalPath,
} from "./geometry";
import { canonicalizePageNetGraph } from "./netGraph";

type LibraryOrTimestamp = readonly SymbolDefinition[] | string;

function resolveLibraryAndTimestamp(
  libraryOrTimestamp: LibraryOrTimestamp | undefined,
  timestamp: string | undefined,
): { library?: readonly SymbolDefinition[]; now: string } {
  return {
    ...(Array.isArray(libraryOrTimestamp)
      ? { library: libraryOrTimestamp }
      : {}),
    now:
      typeof libraryOrTimestamp === "string"
        ? libraryOrTimestamp
        : timestamp ?? new Date().toISOString(),
  };
}

function endpointFromAnchor(anchor?: ConnectionAnchor): WireEndpoint {
  return anchor ? pinEndpoint(anchor) : { kind: "open" };
}

function pinEndpoints(wire: Wire): ConnectionAnchor[] {
  return [wire.start, wire.end].flatMap((endpoint) =>
    endpoint.kind === "pin"
      ? [{ deviceId: endpoint.deviceId, pinId: endpoint.pinId }]
      : [],
  );
}

function netIdsForPin(
  page: DrawingPage,
  anchor: ConnectionAnchor | undefined,
): string[] {
  if (!anchor) {
    return [];
  }
  return allWires(page).flatMap(({ net, wire }) =>
    pinEndpoints(wire).some(
      (endpoint) =>
        endpoint.deviceId === anchor.deviceId &&
        endpoint.pinId === anchor.pinId,
    )
      ? [net.id]
      : [],
  );
}

function mergeNetIds(
  page: DrawingPage,
  netIds: readonly string[],
  preferredName?: string,
): { page: DrawingPage; netId: string } {
  const wanted = new Set(netIds);
  const selected = page.nets.filter((net) => wanted.has(net.id));
  const primary =
    selected[0] ??
    createEmptyNet(createIdentifier("net"), preferredName?.trim() || undefined);
  const mergedName =
    preferredName?.trim() || selected.find((net) => net.name)?.name;
  const mergedColor = selected.map((net) => net.color).find(Boolean);
  const merged: Net = {
    id: primary.id,
    ...(mergedName ? { name: mergedName } : {}),
    ...(mergedColor ? { color: mergedColor } : {}),
    wires: [
      ...primary.wires,
      ...selected.slice(1).flatMap((net) => net.wires),
    ],
    junctions: [
      ...primary.junctions,
      ...selected.slice(1).flatMap((net) => net.junctions),
    ],
  };
  const remap = new Map(
    selected.map((net) => [net.id, primary.id] as const),
  );
  return {
    netId: primary.id,
    page: {
      ...page,
      nets: [
        ...page.nets.filter(
          (net) => net.id !== primary.id && !remap.has(net.id),
        ),
        merged,
      ],
      annotations: page.annotations.map((annotation) =>
        annotation.netId && remap.has(annotation.netId)
          ? { ...annotation, netId: primary.id }
          : annotation,
      ),
    },
  };
}

interface JunctionSplit {
  page: DrawingPage;
  netId: string;
  junction: Junction | null;
}

function splitWireAtPoint(
  page: DrawingPage,
  point: Point,
): JunctionSplit | null {
  for (const net of page.nets) {
    for (const wire of net.wires) {
      const startMatch = pointsEqual(wire.points[0]!, point, 0.5);
      const endMatch = pointsEqual(wire.points.at(-1)!, point, 0.5);
      if (startMatch || endMatch) {
        const endpoint = startMatch ? wire.start : wire.end;
        if (endpoint.kind === "junction") {
          const junction = net.junctions.find(
            (candidate) => candidate.id === endpoint.junctionId,
          );
          return junction ? { page, netId: net.id, junction } : null;
        }
        if (endpoint.kind === "pin") {
          return { page, netId: net.id, junction: null };
        }
        const junction: Junction = {
          id: createIdentifier("junction"),
          point: { ...point },
        };
        return {
          netId: net.id,
          junction,
          page: {
            ...page,
            nets: page.nets.map((candidate) =>
              candidate.id === net.id
                ? {
                    ...candidate,
                    junctions: [...candidate.junctions, junction],
                    wires: candidate.wires.map((entry) =>
                      entry.id === wire.id
                        ? {
                            ...entry,
                            start: startMatch
                              ? {
                                  kind: "junction",
                                  junctionId: junction.id,
                                }
                              : entry.start,
                            end: endMatch
                              ? {
                                  kind: "junction",
                                  junctionId: junction.id,
                                }
                              : entry.end,
                          }
                        : entry,
                    ),
                  }
                : candidate,
            ),
          },
        };
      }

      let splitIndex = wire.points.findIndex((candidate) =>
        pointsEqual(candidate, point, 0.5),
      );
      if (splitIndex <= 0 || splitIndex >= wire.points.length - 1) {
        splitIndex = -1;
        for (let index = 1; index < wire.points.length; index += 1) {
          if (
            pointOnSegment(
              point,
              wire.points[index - 1]!,
              wire.points[index]!,
              0.5,
            )
          ) {
            splitIndex = index;
            break;
          }
        }
      }
      if (splitIndex < 1) {
        continue;
      }
      const junction: Junction = {
        id: createIdentifier("junction"),
        point: { ...point },
      };
      const leftPoints = simplifyOrthogonalPath([
        ...wire.points.slice(0, splitIndex),
        { ...point },
      ]);
      const rightPoints = simplifyOrthogonalPath([
        { ...point },
        ...wire.points.slice(splitIndex),
      ]);
      const left: Wire = {
        id: wire.id,
        points: leftPoints,
        start: wire.start,
        end: { kind: "junction", junctionId: junction.id },
      };
      const right: Wire = {
        id: createIdentifier("wire"),
        points: rightPoints,
        start: { kind: "junction", junctionId: junction.id },
        end: wire.end,
      };
      return {
        page: {
          ...page,
          nets: page.nets.map((candidate) =>
            candidate.id === net.id
              ? {
                  ...candidate,
                  junctions: [...candidate.junctions, junction],
                  wires: candidate.wires.flatMap((entry) =>
                    entry.id === wire.id ? [left, right] : [entry],
                  ),
                }
              : candidate,
          ),
          annotations: page.annotations.map((annotation) =>
            annotation.wireId === wire.id
              ? { ...annotation, wireId: left.id }
              : annotation,
          ),
        },
        netId: net.id,
        junction,
      };
    }
  }
  return null;
}

function updatePage(
  document: DrawicDocument,
  pageId: string,
  transform: (page: DrawingPage) => DrawingPage,
  now = new Date().toISOString(),
): DrawicDocument {
  const page = pageById(document, pageId);
  const next = transform(page);
  return next === page ? document : replacePage(document, next, now);
}

export function addComponent(
  document: DrawicDocument,
  pageId: string,
  request: {
    symbol: SymbolDefinition;
    reference?: string;
    value?: string;
    point: Point;
    id: string;
    showReference?: boolean;
    showValue?: boolean;
    placementMode?: "gui" | "agent";
    library?: readonly SymbolDefinition[];
    rotation?: Rotation;
    now?: string;
  },
): DrawicDocument {
  const point = { x: Math.round(request.point.x), y: Math.round(request.point.y) };
  return updatePage(
    document,
    pageId,
    (page) => {
      const existingReferences = page.nodes.map((node) => node.reference.trim());
      const requestedReference = request.reference?.trim();
      const reference =
        requestedReference === undefined
          ? suggestedReference(request.symbol, existingReferences)
          : requestedReference === "" ||
              !existingReferences.includes(requestedReference)
            ? requestedReference
            : suggestedReference(request.symbol, existingReferences);
      const component: ComponentNode = {
        id: request.id,
        symbolId: request.symbol.id,
        reference,
        value: request.value ?? defaultDeviceValue(request.symbol.id, request.symbol),
        x: point.x,
        y: point.y,
        rotation: request.rotation ?? 0,
        mirrored: false,
      };
      const labelLayout = layoutNodeLabels(
        component,
        request.symbol,
        page,
        {
          typography: document.typography ?? DEFAULT_TYPOGRAPHY,
          automatic: request.placementMode === "agent",
          showReference:
            request.showReference !== false &&
            request.symbol.referenceLabel !== false,
          showValue: request.showValue === true,
          library: request.library ?? [request.symbol],
        },
      );
      if (component.value.trim() && request.showValue !== true) {
        labelLayout.value = {
          ...layoutNodeLabels(component, request.symbol, page, {
            typography: document.typography ?? DEFAULT_TYPOGRAPHY,
            showReference: false,
            showValue: true,
          }).value,
          offset: { x: 0, y: 0 },
          hidden: true,
          placement: "default",
        };
      }
      return {
        ...page,
        nodes: [
          ...page.nodes,
          Object.keys(labelLayout).length > 0
            ? { ...component, labelLayout }
            : component,
        ],
      };
    },
    request.now,
  );
}

export function duplicateNode(
  document: DrawicDocument,
  pageId: string,
  nodeId: string,
  delta: Point,
  library: readonly SymbolDefinition[],
  newNodeId = createIdentifier("node"),
  now = new Date().toISOString(),
  rotation?: Rotation,
): DrawicDocument {
  return updatePage(
    document,
    pageId,
    (page) => {
      const source = page.nodes.find((node) => node.id === nodeId);
      const symbol = source
        ? library.find((candidate) => candidate.id === source.symbolId)
        : undefined;
      if (!source || !symbol) {
        return page;
      }
      const reference = suggestedReference(
        symbol,
        page.nodes.map((node) => node.reference.trim()),
      );
      const moved = translateNodeLabelLayouts(
        {
          ...source,
          id: newNodeId,
          reference,
          x: source.x + delta.x,
          y: source.y + delta.y,
          ...(rotation === undefined ? {} : { rotation }),
        },
        delta,
      );
      return {
        ...page,
        nodes: [...page.nodes, moved],
      };
    },
    now,
  );
}

export function addWire(
  document: DrawicDocument,
  pageId: string,
  request: {
    points: Point[];
    id: string;
    name?: string;
    startAnchor?: ConnectionAnchor;
    endAnchor?: ConnectionAnchor;
    junctionPoints?: Point[];
    now?: string;
  },
): DrawicDocument {
  if (request.points.length < 2) {
    return document;
  }
  return updatePage(
    document,
    pageId,
    (page) => {
      let next = page;
      let start = endpointFromAnchor(request.startAnchor);
      let end = endpointFromAnchor(request.endAnchor);
      const netIds = [
        ...netIdsForPin(page, request.startAnchor),
        ...netIdsForPin(page, request.endAnchor),
      ];
      for (const point of request.junctionPoints ?? []) {
        const split = splitWireAtPoint(next, point);
        if (!split) {
          continue;
        }
        next = split.page;
        netIds.push(split.netId);
        if (split.junction) {
          const junctionEndpoint: WireEndpoint = {
            kind: "junction",
            junctionId: split.junction.id,
          };
          if (pointsEqual(request.points[0]!, point, 0.5)) {
            start = junctionEndpoint;
          }
          if (pointsEqual(request.points.at(-1)!, point, 0.5)) {
            end = junctionEndpoint;
          }
        }
      }
      const merged = mergeNetIds(next, netIds, request.name);
      next = merged.page;
      const wire: Wire = {
        id: request.id,
        points: request.points.map((point) => ({ ...point })),
        start,
        end,
      };
      return canonicalizePageNetGraph({
        ...next,
        nets: next.nets.map((net) =>
          net.id === merged.netId
            ? {
                ...net,
                ...(request.name?.trim()
                  ? { name: request.name.trim() }
                  : {}),
                wires: [...net.wires, wire],
              }
            : net,
        ),
      });
    },
    request.now,
  );
}

export function addAnnotation(
  document: DrawicDocument,
  pageId: string,
  request: {
    kind: Annotation["kind"];
    text: string;
    point: Point;
    id: string;
    wireId?: string;
    now?: string;
  },
): DrawicDocument {
  return updatePage(
    document,
    pageId,
    (page) => {
      const located = request.wireId
        ? findWire(page, request.wireId)
        : null;
      const netName =
        request.kind === "net" ? request.text.trim() : "";
      return canonicalizePageNetGraph({
        ...page,
        nets:
          located && netName
            ? page.nets.map((net) =>
                net.id === located.net.id ? { ...net, name: netName } : net,
              )
            : page.nets,
        annotations: [
          ...page.annotations,
          {
            id: request.id,
            kind: request.kind,
            text: request.text,
            x: Math.round(request.point.x),
            y: Math.round(request.point.y),
            size: 16,
            ...(request.wireId ? { wireId: request.wireId } : {}),
            ...(located ? { netId: located.net.id } : {}),
          },
        ],
      });
    },
    request.now,
  );
}

export function addShape(
  document: DrawicDocument,
  pageId: string,
  request: {
    kind: DrawingShape["kind"];
    x: number;
    y: number;
    width: number;
    height: number;
    id: string;
    now?: string;
  },
): DrawicDocument {
  if (request.width < 2 || request.height < 2) {
    return document;
  }
  return updatePage(
    document,
    pageId,
    (page) => ({
      ...page,
      shapes: [
        ...page.shapes,
        {
          id: request.id,
          kind: request.kind,
          x: request.x,
          y: request.y,
          width: request.width,
          height: request.height,
          rotation: 0,
          stroke: "#263d48",
          fill: "transparent",
        },
      ],
    }),
    request.now,
  );
}

export function removeSelection(
  document: DrawicDocument,
  pageId: string,
  selection: readonly SelectionRef[],
  now = new Date().toISOString(),
): DrawicDocument {
  if (selection.length === 0) {
    return document;
  }
  const nodeIds = new Set(selection.filter((item) => item.kind === "node").map((item) => item.id));
  const wireIds = new Set(selection.filter((item) => item.kind === "wire").map((item) => item.id));
  const annotationIds = new Set(
    selection.filter((item) => item.kind === "annotation").map((item) => item.id),
  );
  const shapeIds = new Set(selection.filter((item) => item.kind === "shape").map((item) => item.id));
  const junctionIds = new Set(
    selection
      .filter((item) => item.kind === "junction")
      .map((item) => item.id.replace(/^junction:/, "")),
  );
  const hiddenLabels = new Map<string, Set<NodeLabelKind>>();
  for (const item of selection) {
    if (item.kind !== "node-label" || !item.label) {
      continue;
    }
    const labels = hiddenLabels.get(item.id) ?? new Set<NodeLabelKind>();
    labels.add(item.label);
    hiddenLabels.set(item.id, labels);
  }
  return updatePage(
    document,
    pageId,
    (page) => {
      const nets = page.nets
        .map((net) => ({
          ...net,
          wires: net.wires
            .filter((wire) => !wireIds.has(wire.id))
            .map((wire) => ({
              ...wire,
              start:
                (wire.start.kind === "pin" &&
                  nodeIds.has(wire.start.deviceId)) ||
                (wire.start.kind === "junction" &&
                  junctionIds.has(wire.start.junctionId))
                  ? ({ kind: "open" } as const)
                  : wire.start,
              end:
                (wire.end.kind === "pin" &&
                  nodeIds.has(wire.end.deviceId)) ||
                (wire.end.kind === "junction" &&
                  junctionIds.has(wire.end.junctionId))
                  ? ({ kind: "open" } as const)
                  : wire.end,
            })),
          junctions: net.junctions.filter(
            (junction) => !junctionIds.has(junction.id),
          ),
        }))
        .filter((net) => net.wires.length > 0 || net.junctions.length > 0);
      const remainingNetIds = new Set(nets.map((net) => net.id));
      return canonicalizePageNetGraph({
        ...page,
        nodes: page.nodes
          .filter((node) => !nodeIds.has(node.id))
          .map((node) => {
            const labels = hiddenLabels.get(node.id);
            if (!labels) {
              return node;
            }
            const labelLayout = { ...node.labelLayout };
            for (const label of labels) {
              const current = labelLayout[label];
              labelLayout[label] = {
                offset: current?.offset ?? { x: 0, y: 0 },
                hidden: true,
              };
            }
            return { ...node, labelLayout };
          }),
        nets,
        annotations: page.annotations.filter(
          (annotation) =>
            !annotationIds.has(annotation.id) &&
            !(annotation.wireId && wireIds.has(annotation.wireId)) &&
            (!annotation.netId || remainingNetIds.has(annotation.netId)),
        ),
        shapes: page.shapes.filter((shape) => !shapeIds.has(shape.id)),
      });
    },
    now,
  );
}

function moveAttachedWireLegacy(
  wire: Wire,
  selectedNodeIds: ReadonlySet<string>,
  delta: Point,
): Wire {
  const points = wire.points.map((point) => ({ ...point }));
  const moveStart = Boolean(
    wire.start.kind === "pin" && selectedNodeIds.has(wire.start.deviceId),
  );
  const moveEnd = Boolean(
    wire.end.kind === "pin" && selectedNodeIds.has(wire.end.deviceId),
  );
  if (!moveStart && !moveEnd) {
    return wire;
  }
  if (moveStart && points[0]) {
    const previous = { ...points[0] };
    points[0] = { x: points[0].x + delta.x, y: points[0].y + delta.y };
    if (points[1]) {
      points[1] =
        previous.x === points[1].x
          ? { ...points[1], x: points[1].x + delta.x }
          : { ...points[1], y: points[1].y + delta.y };
    }
  }
  if (moveEnd && points.length > 1) {
    const lastIndex = points.length - 1;
    const last = points[lastIndex]!;
    points[lastIndex] = { x: last.x + delta.x, y: last.y + delta.y };
    const neighbor = points[lastIndex - 1]!;
    points[lastIndex - 1] =
      last.x === neighbor.x
        ? { ...neighbor, x: neighbor.x + delta.x }
        : { ...neighbor, y: neighbor.y + delta.y };
  }
  return { ...wire, points };
}

function rotatePointAround(point: Point, center: Point, rotation: Rotation): Point {
  const x = point.x - center.x;
  const y = point.y - center.y;
  switch (rotation) {
    case 0:
      return { ...point };
    case 90:
      return { x: center.x - y, y: center.y + x };
    case 180:
      return { x: center.x - x, y: center.y - y };
    case 270:
      return { x: center.x + y, y: center.y - x };
  }
}

function mirrorPointAround(point: Point, center: Point): Point {
  return { x: center.x - (point.x - center.x), y: point.y };
}

function makeEndpointSegmentsOrthogonal(
  points: Point[],
  startMoved: boolean,
  endMoved: boolean,
): Point[] {
  const result = points.map((point) => ({ ...point }));
  if (startMoved && result.length >= 2) {
    const start = result[0]!;
    const next = result[1]!;
    if (start.x !== next.x && start.y !== next.y) {
      result.splice(1, 0, { x: next.x, y: start.y });
    }
  }
  if (endMoved && result.length >= 2) {
    const end = result.at(-1)!;
    const previous = result.at(-2)!;
    if (end.x !== previous.x && end.y !== previous.y) {
      result.splice(-1, 0, { x: end.x, y: previous.y });
    }
  }
  return simplifyOrthogonalPath(result);
}

function transformAttachedWireLegacy(
  wire: Wire,
  nodes: ReadonlyMap<string, ComponentNode>,
  selectedNodeIds: ReadonlySet<string>,
  transform: (point: Point, node: ComponentNode) => Point,
): Wire {
  const startNode =
    wire.start.kind === "pin" && selectedNodeIds.has(wire.start.deviceId)
      ? nodes.get(wire.start.deviceId)
      : undefined;
  const endNode =
    wire.end.kind === "pin" && selectedNodeIds.has(wire.end.deviceId)
      ? nodes.get(wire.end.deviceId)
      : undefined;
  if (!startNode && !endNode) {
    return wire;
  }
  const points = wire.points.map((point) => ({ ...point }));
  if (startNode && points[0]) {
    points[0] = transform(points[0], startNode);
  }
  if (endNode && points.at(-1)) {
    points[points.length - 1] = transform(points.at(-1)!, endNode);
  }
  return {
    ...wire,
    points: makeEndpointSegmentsOrthogonal(
      points,
      Boolean(startNode),
      Boolean(endNode),
    ),
  };
}

export function moveNodes(
  document: DrawicDocument,
  pageId: string,
  nodeIds: readonly string[],
  delta: Point,
  now?: string,
): DrawicDocument;
export function moveNodes(
  document: DrawicDocument,
  pageId: string,
  nodeIds: readonly string[],
  delta: Point,
  library: readonly SymbolDefinition[],
  now?: string,
): DrawicDocument;
export function moveNodes(
  document: DrawicDocument,
  pageId: string,
  nodeIds: readonly string[],
  delta: Point,
  libraryOrTimestamp?: LibraryOrTimestamp,
  timestamp?: string,
): DrawicDocument {
  if (nodeIds.length === 0 || (delta.x === 0 && delta.y === 0)) {
    return document;
  }
  const { library, now } = resolveLibraryAndTimestamp(
    libraryOrTimestamp,
    timestamp,
  );
  return updatePage(
    document,
    pageId,
    (page) => {
      if (library) {
        return planNodeMove(page, library, new Set(nodeIds), delta);
      }
      const ids = new Set(nodeIds);
      return canonicalizePageNetGraph({
        ...page,
        nodes: page.nodes.map((node) =>
          ids.has(node.id)
            ? translateNodeLabelLayouts(
                { ...node, x: node.x + delta.x, y: node.y + delta.y },
                delta,
              )
            : node,
        ),
        nets: page.nets.map((net) => ({
          ...net,
          wires: net.wires.map((wire) =>
            moveAttachedWireLegacy(wire, ids, delta),
          ),
        })),
      });
    },
    now,
  );
}

export function rotateSelection(
  document: DrawicDocument,
  pageId: string,
  selection: readonly SelectionRef[],
  now?: string,
): DrawicDocument;
export function rotateSelection(
  document: DrawicDocument,
  pageId: string,
  selection: readonly SelectionRef[],
  library: readonly SymbolDefinition[],
  now?: string,
): DrawicDocument;
export function rotateSelection(
  document: DrawicDocument,
  pageId: string,
  selection: readonly SelectionRef[],
  libraryOrTimestamp?: LibraryOrTimestamp,
  timestamp?: string,
): DrawicDocument {
  const ids = new Set(selection.filter((item) => item.kind === "node").map((item) => item.id));
  const shapeIds = new Set(
    selection.filter((item) => item.kind === "shape").map((item) => item.id),
  );
  if (ids.size === 0 && shapeIds.size === 0) {
    return document;
  }
  const { library, now } = resolveLibraryAndTimestamp(
    libraryOrTimestamp,
    timestamp,
  );
  return updatePage(
    document,
    pageId,
    (page) => {
      const planned = library
        ? planNodeRotation(page, library, ids)
        : (() => {
            const nodes = new Map(page.nodes.map((node) => [node.id, node]));
            return {
              ...page,
              nodes: page.nodes.map((node) =>
                ids.has(node.id)
                  ? {
                      ...node,
                      rotation: ((node.rotation + 90) % 360) as Rotation,
                    }
                  : node,
              ),
              nets: page.nets.map((net) => ({
                ...net,
                wires: net.wires.map((wire) =>
                  transformAttachedWireLegacy(wire, nodes, ids, (point, node) =>
                    rotatePointAround(point, { x: node.x, y: node.y }, 90),
                  ),
                ),
              })),
            };
          })();
      const withShapes: DrawingPage = {
        ...planned,
        shapes: page.shapes.map((shape) =>
          shapeIds.has(shape.id)
            ? { ...shape, rotation: ((shape.rotation + 90) % 360) as Rotation }
            : shape,
        ),
      };
      return library
        ? reflowDefaultNodeLabels(
            withShapes,
            library,
            document.typography ?? DEFAULT_TYPOGRAPHY,
            ids,
          )
        : withShapes;
    },
    now,
  );
}

export function mirrorSelection(
  document: DrawicDocument,
  pageId: string,
  selection: readonly SelectionRef[],
  now?: string,
): DrawicDocument;
export function mirrorSelection(
  document: DrawicDocument,
  pageId: string,
  selection: readonly SelectionRef[],
  library: readonly SymbolDefinition[],
  now?: string,
): DrawicDocument;
export function mirrorSelection(
  document: DrawicDocument,
  pageId: string,
  selection: readonly SelectionRef[],
  libraryOrTimestamp?: LibraryOrTimestamp,
  timestamp?: string,
): DrawicDocument {
  const ids = new Set(selection.filter((item) => item.kind === "node").map((item) => item.id));
  if (ids.size === 0) {
    return document;
  }
  const { library, now } = resolveLibraryAndTimestamp(
    libraryOrTimestamp,
    timestamp,
  );
  return updatePage(
    document,
    pageId,
    (page) => {
      if (library) {
        return reflowDefaultNodeLabels(
          planNodeMirror(page, library, ids),
          library,
          document.typography ?? DEFAULT_TYPOGRAPHY,
          ids,
        );
      }
      const nodes = new Map(page.nodes.map((node) => [node.id, node]));
      return {
        ...page,
        nodes: page.nodes.map((node) =>
          ids.has(node.id) ? { ...node, mirrored: !node.mirrored } : node,
        ),
        nets: page.nets.map((net) => ({
          ...net,
          wires: net.wires.map((wire) =>
            transformAttachedWireLegacy(wire, nodes, ids, (point, node) => {
              const unrotated = rotatePointAround(
                point,
                { x: node.x, y: node.y },
                (360 - node.rotation) as Rotation,
              );
              const mirrored = mirrorPointAround(unrotated, {
                x: node.x,
                y: node.y,
              });
              return rotatePointAround(
                mirrored,
                { x: node.x, y: node.y },
                node.rotation,
              );
            }),
          ),
        })),
      };
    },
    now,
  );
}

export function mirrorSelectionVertical(
  document: DrawicDocument,
  pageId: string,
  selection: readonly SelectionRef[],
  library: readonly SymbolDefinition[],
  now = new Date().toISOString(),
): DrawicDocument {
  const ids = new Set(
    selection
      .filter((item) => item.kind === "node")
      .map((item) => item.id),
  );
  if (ids.size === 0) {
    return document;
  }
  return updatePage(
    document,
    pageId,
    (page) => {
      const mirrored = planNodeMirrorVertical(page, library, ids);
      return reflowDefaultNodeLabels(
        mirrored,
        library,
        document.typography ?? DEFAULT_TYPOGRAPHY,
        ids,
      );
    },
    now,
  );
}

export function updateNode(
  document: DrawicDocument,
  pageId: string,
  nodeId: string,
  patch: Partial<Pick<ComponentNode, "reference" | "value" | "x" | "y">>,
  now?: string,
): DrawicDocument;
export function updateNode(
  document: DrawicDocument,
  pageId: string,
  nodeId: string,
  patch: Partial<Pick<ComponentNode, "reference" | "value" | "x" | "y">>,
  library: readonly SymbolDefinition[],
  now?: string,
): DrawicDocument;
export function updateNode(
  document: DrawicDocument,
  pageId: string,
  nodeId: string,
  patch: Partial<Pick<ComponentNode, "reference" | "value" | "x" | "y">>,
  libraryOrTimestamp?: LibraryOrTimestamp,
  timestamp?: string,
): DrawicDocument {
  const { library, now } = resolveLibraryAndTimestamp(
    libraryOrTimestamp,
    timestamp,
  );
  return updatePage(
    document,
    pageId,
    (page) => {
      const target = page.nodes.find((node) => node.id === nodeId);
      if (!target) {
        return page;
      }
      const next = { ...target, ...patch };
      const delta = { x: next.x - target.x, y: next.y - target.y };
      if (
        next.reference === target.reference &&
        next.value === target.value &&
        delta.x === 0 &&
        delta.y === 0
      ) {
        return page;
      }
      if (!library) {
        return {
          ...page,
          nodes: page.nodes.map((node) =>
            node.id === nodeId ? next : node,
          ),
        };
      }
      const moved =
        delta.x === 0 && delta.y === 0
          ? page
          : planNodeMove(page, library, new Set([nodeId]), delta);
      return {
        ...moved,
        nodes: moved.nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                reference: next.reference,
                value: next.value,
              }
            : node,
        ),
      };
    },
    now,
  );
}

export function updateAnnotation(
  document: DrawicDocument,
  pageId: string,
  annotationId: string,
  patch: Partial<Pick<Annotation, "text" | "kind" | "x" | "y" | "size">>,
  now = new Date().toISOString(),
): DrawicDocument {
  return updatePage(
    document,
    pageId,
    (page) => {
      const target = page.annotations.find((annotation) => annotation.id === annotationId);
      if (!target) {
        return page;
      }
      const next = { ...target, ...patch };
      if (
        next.text === target.text &&
        next.kind === target.kind &&
        next.x === target.x &&
        next.y === target.y &&
        next.size === target.size
      ) {
        return page;
      }
      return canonicalizePageNetGraph({
        ...page,
        nets:
          next.kind === "net" && next.netId && next.text.trim()
            ? page.nets.map((net) =>
                net.id === next.netId
                  ? { ...net, name: next.text.trim() }
                  : net,
              )
            : page.nets,
        annotations: page.annotations.map((annotation) =>
          annotation.id === annotationId
            ? next
            : next.kind === "net" &&
                next.netId &&
                annotation.kind === "net" &&
                annotation.netId === next.netId
              ? { ...annotation, text: next.text }
              : annotation,
        ),
      });
    },
    now,
  );
}

export function moveAnnotations(
  document: DrawicDocument,
  pageId: string,
  annotationIds: readonly string[],
  delta: Point,
  now = new Date().toISOString(),
): DrawicDocument {
  const ids = new Set(annotationIds);
  if (ids.size === 0 || (delta.x === 0 && delta.y === 0)) {
    return document;
  }
  return updatePage(
    document,
    pageId,
    (page) => ({
      ...page,
      annotations: page.annotations.map((annotation) =>
        ids.has(annotation.id)
          ? { ...annotation, x: annotation.x + delta.x, y: annotation.y + delta.y }
          : annotation,
      ),
    }),
    now,
  );
}

export function updateNodeLabel(
  document: DrawicDocument,
  pageId: string,
  nodeId: string,
  label: NodeLabelKind,
  patch: Partial<NodeLabelLayout>,
  library?: readonly SymbolDefinition[],
  now = new Date().toISOString(),
): DrawicDocument {
  return updatePage(
    document,
    pageId,
    (page) => {
      const target = page.nodes.find((node) => node.id === nodeId);
      if (!target) {
        return page;
      }
      const current = target.labelLayout?.[label];
      const nextLayout: NodeLabelLayout = {
        ...current,
        offset: patch.offset ?? current?.offset ?? { x: 0, y: 0 },
        hidden: patch.hidden ?? current?.hidden ?? false,
        ...patch,
      };
      if (JSON.stringify(current) === JSON.stringify(nextLayout)) {
        return page;
      }
      const updated: DrawingPage = {
        ...page,
        nodes: page.nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                labelLayout: {
                  ...node.labelLayout,
                  [label]: nextLayout,
                },
              }
            : node,
        ),
      };
      return labelLayoutMovesDefault(target, label)
        && library
        ? reflowDefaultNodeLabels(
            updated,
            library,
            document.typography ?? DEFAULT_TYPOGRAPHY,
            new Set([nodeId]),
          )
        : updated;
    },
    now,
  );
}

export function updateDocumentTypography(
  document: DrawicDocument,
  patch: Partial<DocumentTypography>,
  now = new Date().toISOString(),
): DrawicDocument {
  const current = document.typography ?? {
    family: "sans" as const,
    scale: 1,
  };
  const next: DocumentTypography = {
    family: patch.family ?? current.family,
    scale: patch.scale ?? current.scale,
  };
  if (
    !Number.isFinite(next.scale) ||
    next.scale <= 0 ||
    (next.family !== "sans" && next.family !== "serif")
  ) {
    return document;
  }
  if (next.family === current.family && next.scale === current.scale) {
    return document;
  }
  return touchDocument({ ...document, typography: next }, now);
}

export function updateNodeReferenceLabel(
  document: DrawicDocument,
  pageId: string,
  nodeId: string,
  reference: string,
  richText: readonly RichTextRun[],
  now = new Date().toISOString(),
): DrawicDocument {
  return updatePage(
    document,
    pageId,
    (page) => {
      const target = page.nodes.find((node) => node.id === nodeId);
      if (!target) {
        return page;
      }
      const current = target.labelLayout?.reference;
      const nextLayout: NodeLabelLayout = {
        offset: current?.offset ?? { x: 0, y: 0 },
        hidden: current?.hidden ?? false,
        ...current,
        richText: richText.map((run) => ({ ...run })),
        placement: current?.placement ?? "default",
      };
      return {
        ...page,
        nodes: page.nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                reference,
                labelLayout: {
                  ...node.labelLayout,
                  reference: nextLayout,
                },
              }
            : node,
        ),
      };
    },
    now,
  );
}

export function resetNodeLabelStyle(
  document: DrawicDocument,
  pageId: string,
  nodeId: string,
  label: NodeLabelKind,
  library?: readonly SymbolDefinition[],
  now = new Date().toISOString(),
): DrawicDocument {
  return updatePage(
    document,
    pageId,
    (page) => {
      const target = page.nodes.find((node) => node.id === nodeId);
      const layout = target?.labelLayout?.[label];
      if (!target || !layout) {
        return page;
      }
      const {
        fontSizeScale: _fontSizeScale,
        color: _color,
        fontWeight: _fontWeight,
        fontStyle: _fontStyle,
        script: _script,
        ...base
      } = layout;
      const updated: DrawingPage = {
        ...page,
        nodes: page.nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                labelLayout: {
                  ...node.labelLayout,
                  [label]: base,
                },
              }
            : node,
        ),
      };
      return library && base.placement === "default"
        ? reflowDefaultNodeLabels(
            updated,
            library,
            document.typography ?? DEFAULT_TYPOGRAPHY,
            new Set([nodeId]),
          )
        : updated;
    },
    now,
  );
}

function labelLayoutMovesDefault(
  node: ComponentNode,
  label: NodeLabelKind,
): boolean {
  return node.labelLayout?.[label]?.placement === "default";
}

export function updateShape(
  document: DrawicDocument,
  pageId: string,
  shapeId: string,
  patch: Partial<
    Pick<
      DrawingShape,
      "x" | "y" | "width" | "height" | "rotation" | "stroke" | "fill" | "text"
    >
  >,
  now = new Date().toISOString(),
): DrawicDocument {
  return updatePage(
    document,
    pageId,
    (page) => {
      const target = page.shapes.find((shape) => shape.id === shapeId);
      if (!target) {
        return page;
      }
      const next = { ...target, ...patch };
      if (
        next.x === target.x &&
        next.y === target.y &&
        next.width === target.width &&
        next.height === target.height &&
        next.rotation === target.rotation &&
        next.stroke === target.stroke &&
        next.fill === target.fill &&
        next.text === target.text
      ) {
        return page;
      }
      return {
        ...page,
        shapes: page.shapes.map((shape) => (shape.id === shapeId ? next : shape)),
      };
    },
    now,
  );
}

export function updateWirePoints(
  document: DrawicDocument,
  pageId: string,
  wireId: string,
  points: Point[],
  now = new Date().toISOString(),
): DrawicDocument {
  return updatePage(
    document,
    pageId,
    (page) => {
      const located = findWire(page, wireId);
      if (!located) {
        return page;
      }
      const junctionMoves = new Map<string, Point>();
      if (located.wire.start.kind === "junction") {
        junctionMoves.set(located.wire.start.junctionId, points[0]!);
      }
      if (located.wire.end.kind === "junction") {
        junctionMoves.set(located.wire.end.junctionId, points.at(-1)!);
      }
      const nets = page.nets.map((net) =>
        net.id === located.net.id
          ? {
              ...net,
              junctions: net.junctions.map((junction) =>
                junctionMoves.has(junction.id)
                  ? {
                      ...junction,
                      point: { ...junctionMoves.get(junction.id)! },
                    }
                  : junction,
              ),
              wires: net.wires.map((wire) => {
                if (wire.id === wireId) {
                  return {
                    ...wire,
                    points: points.map((point) => ({ ...point })),
                  };
                }
                let changed = false;
                const nextPoints = wire.points.map((point) => ({ ...point }));
                if (
                  wire.start.kind === "junction" &&
                  junctionMoves.has(wire.start.junctionId)
                ) {
                  nextPoints[0] = {
                    ...junctionMoves.get(wire.start.junctionId)!,
                  };
                  changed = true;
                }
                if (
                  wire.end.kind === "junction" &&
                  junctionMoves.has(wire.end.junctionId)
                ) {
                  nextPoints[nextPoints.length - 1] = {
                    ...junctionMoves.get(wire.end.junctionId)!,
                  };
                  changed = true;
                }
                return changed ? { ...wire, points: nextPoints } : wire;
              }),
            }
          : net,
      );
      return canonicalizePageNetGraph({
        ...page,
        nets,
      });
    },
    now,
  );
}

export function updateNetNameForWire(
  document: DrawicDocument,
  pageId: string,
  wireId: string,
  name: string,
  now = new Date().toISOString(),
): DrawicDocument {
  return updatePage(
    document,
    pageId,
    (page) => {
      const nextName = name.trim();
      const located = findWire(page, wireId);
      if (!located) {
        return page;
      }
      if ((located.net.name ?? "") === nextName) {
        return page;
      }
      return canonicalizePageNetGraph({
        ...page,
        nets: page.nets.map((net) => {
          if (net.id !== located.net.id) {
            return net;
          }
          const next = { ...net };
          if (nextName) {
            next.name = nextName;
          } else {
            delete next.name;
          }
          return next;
        }),
        annotations: page.annotations.map((annotation) =>
          annotation.kind === "net" &&
          annotation.netId === located.net.id
            ? { ...annotation, text: nextName }
            : annotation,
        ),
      });
    },
    now,
  );
}

export function updateNetColorForWire(
  document: DrawicDocument,
  pageId: string,
  wireId: string,
  color: string | null,
  now = new Date().toISOString(),
): DrawicDocument {
  const nextColor = color === null ? undefined : normalizeNetColor(color);
  if (color !== null && !nextColor) {
    return document;
  }
  return updatePage(
    document,
    pageId,
    (page) => {
      const located = findWire(page, wireId);
      if (!located || located.net.color === nextColor) {
        return page;
      }
      return canonicalizePageNetGraph({
        ...page,
        nets: page.nets.map((net) => {
          if (net.id !== located.net.id) {
            return net;
          }
          const next = { ...net };
          if (nextColor) {
            next.color = nextColor;
          } else {
            delete next.color;
          }
          return next;
        }),
      });
    },
    now,
  );
}

export function renameNet(
  document: DrawicDocument,
  pageId: string,
  wireIds: readonly string[],
  annotationIds: readonly string[],
  name: string,
  now = new Date().toISOString(),
): DrawicDocument {
  const clean = name.trim();
  if (!clean || wireIds.length === 0) {
    return document;
  }
  const netIds = new Set(
    wireIds.flatMap((wireId) => {
      const located = pageById(document, pageId);
      const net = findWire(located, wireId)?.net;
      return net ? [net.id] : [];
    }),
  );
  const annotationIdSet = new Set(annotationIds);
  return updatePage(
    document,
    pageId,
    (page) => canonicalizePageNetGraph({
      ...page,
      nets: page.nets.map((net) =>
        netIds.has(net.id) ? { ...net, name: clean } : net,
      ),
      annotations: page.annotations.map((annotation) =>
        (annotationIdSet.has(annotation.id) ||
          (annotation.netId && netIds.has(annotation.netId))) &&
        annotation.kind === "net"
          ? { ...annotation, text: clean }
          : annotation,
      ),
    }),
    now,
  );
}

export function replacePageContent(
  document: DrawicDocument,
  pageId: string,
  transform: (page: DrawingPage) => DrawingPage,
  now = new Date().toISOString(),
): DrawicDocument {
  return updatePage(document, pageId, transform, now);
}

export function createWireFromPath(
  id: string,
  points: Point[],
  anchors?: { startAnchor?: ConnectionAnchor; endAnchor?: ConnectionAnchor },
): Wire {
  return {
    id,
    points,
    start: endpointFromAnchor(anchors?.startAnchor),
    end: endpointFromAnchor(anchors?.endAnchor),
  };
}
