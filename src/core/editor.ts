import {
  defaultWireName,
  junctionSelectionId,
  pageById,
  replacePage,
  type Annotation,
  type ComponentNode,
  type ConnectionAnchor,
  type DrawingPage,
  type DrawingShape,
  type DrawicDocument,
  type NodeLabelKind,
  type Point,
  type Rotation,
  type SelectionRef,
  type SymbolDefinition,
  type Wire,
  wireDisplayName,
} from "./model";
import {
  pathProjectionRatio,
  planNodeMirror,
  planNodeMove,
  planNodeRotation,
  pointAtPathRatio,
} from "./wireMotion";
import {
  pointOnSegment,
  pointsEqual,
  simplifyOrthogonalPath,
} from "./geometry";
import { normalizePageWireOverlaps } from "./wireMerge";

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
    reference: string;
    value: string;
    point: Point;
    id: string;
    now?: string;
  },
): DrawicDocument {
  const point = { x: Math.round(request.point.x), y: Math.round(request.point.y) };
  return updatePage(
    document,
    pageId,
    (page) => ({
      ...page,
      nodes: [
        ...page.nodes,
        {
          id: request.id,
          symbolId: request.symbol.id,
          reference: request.reference,
          value: request.value,
          x: point.x,
          y: point.y,
          rotation: 0,
          mirrored: false,
        },
      ],
    }),
    request.now,
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
      const junctions = [...page.junctions];
      for (const point of request.junctionPoints ?? []) {
        if (
          !junctions.some(
            (junction) =>
              Math.abs(junction.x - point.x) <= 0.5 &&
              Math.abs(junction.y - point.y) <= 0.5,
          )
        ) {
          junctions.push({ ...point });
        }
      }
      return normalizePageWireOverlaps({
        ...page,
        wires: [
          ...page.wires,
          {
            id: request.id,
            points: request.points,
            ...(request.name ? { name: request.name } : {}),
            ...(request.startAnchor ? { startAnchor: request.startAnchor } : {}),
            ...(request.endAnchor ? { endAnchor: request.endAnchor } : {}),
          },
        ],
        junctions,
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
    (page) => ({
      ...page,
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
        },
      ],
    }),
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
      .map((item) => item.id),
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
    (page) => ({
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
      wires: page.wires
        .filter((wire) => !wireIds.has(wire.id))
        .map((wire) => {
          const removeStart = Boolean(
            wire.startAnchor && nodeIds.has(wire.startAnchor.deviceId),
          );
          const removeEnd = Boolean(wire.endAnchor && nodeIds.has(wire.endAnchor.deviceId));
          const next = { ...wire };
          if (removeStart) {
            delete next.startAnchor;
          }
          if (removeEnd) {
            delete next.endAnchor;
          }
          return next;
        }),
      annotations: page.annotations.filter(
        (annotation) =>
          !annotationIds.has(annotation.id) &&
          !(annotation.wireId && wireIds.has(annotation.wireId)),
      ),
      junctions: page.junctions.filter(
        (junction) => !junctionIds.has(junctionSelectionId(junction)),
      ),
      shapes: page.shapes.filter((shape) => !shapeIds.has(shape.id)),
    }),
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
    wire.startAnchor && selectedNodeIds.has(wire.startAnchor.deviceId),
  );
  const moveEnd = Boolean(
    wire.endAnchor && selectedNodeIds.has(wire.endAnchor.deviceId),
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
    wire.startAnchor && selectedNodeIds.has(wire.startAnchor.deviceId)
      ? nodes.get(wire.startAnchor.deviceId)
      : undefined;
  const endNode =
    wire.endAnchor && selectedNodeIds.has(wire.endAnchor.deviceId)
      ? nodes.get(wire.endAnchor.deviceId)
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
      return {
        ...page,
        nodes: page.nodes.map((node) =>
          ids.has(node.id)
            ? { ...node, x: node.x + delta.x, y: node.y + delta.y }
            : node,
        ),
        wires: page.wires.map((wire) =>
          moveAttachedWireLegacy(wire, ids, delta),
        ),
      };
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
              wires: page.wires.map((wire) =>
                transformAttachedWireLegacy(wire, nodes, ids, (point, node) =>
                  rotatePointAround(point, { x: node.x, y: node.y }, 90),
                ),
              ),
            };
          })();
      return {
        ...planned,
        shapes: page.shapes.map((shape) =>
          shapeIds.has(shape.id)
            ? { ...shape, rotation: ((shape.rotation + 90) % 360) as Rotation }
            : shape,
        ),
      };
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
        return planNodeMirror(page, library, ids);
      }
      const nodes = new Map(page.nodes.map((node) => [node.id, node]));
      return {
        ...page,
        nodes: page.nodes.map((node) =>
          ids.has(node.id) ? { ...node, mirrored: !node.mirrored } : node,
        ),
        wires: page.wires.map((wire) =>
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
      };
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
      return {
        ...page,
        annotations: page.annotations.map((annotation) =>
          annotation.id === annotationId ? next : annotation,
        ),
      };
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
  patch: { offset?: Point; hidden?: boolean },
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
      const nextLayout = {
        offset: patch.offset ?? current?.offset ?? { x: 0, y: 0 },
        hidden: patch.hidden ?? current?.hidden ?? false,
      };
      if (
        current?.hidden === nextLayout.hidden &&
        current.offset.x === nextLayout.offset.x &&
        current.offset.y === nextLayout.offset.y
      ) {
        return page;
      }
      return {
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
    },
    now,
  );
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
      const target = page.wires.find((wire) => wire.id === wireId);
      if (!target) {
        return page;
      }
      const junctionMoves: Array<{ from: Point; to: Point }> = [];
      const junctions = page.junctions.map((junction) => {
        const touchesPath = target.points.some((point, index) => {
          const next = target.points[index + 1];
          return (
            pointsEqual(junction, point, 0.5) ||
            (next ? pointOnSegment(junction, point, next, 0.7) : false)
          );
        });
        if (!touchesPath) {
          return junction;
        }
        const next = pointAtPathRatio(
          points,
          pathProjectionRatio(junction, target.points),
        );
        junctionMoves.push({ from: junction, to: next });
        return next;
      });
      const wires = page.wires.map((wire) => {
        if (wire.id === wireId) {
          return { ...wire, points };
        }
        let nextPoints = wire.points.map((point) => ({ ...point }));
        let moveStart = false;
        let moveEnd = false;
        for (const move of junctionMoves) {
          if (
            !wire.startAnchor &&
            nextPoints[0] &&
            pointsEqual(nextPoints[0], move.from, 0.5)
          ) {
            nextPoints[0] = { ...move.to };
            moveStart = true;
          }
          if (
            !wire.endAnchor &&
            nextPoints.at(-1) &&
            pointsEqual(nextPoints.at(-1)!, move.from, 0.5)
          ) {
            nextPoints[nextPoints.length - 1] = { ...move.to };
            moveEnd = true;
          }
        }
        if (moveStart || moveEnd) {
          nextPoints = makeEndpointSegmentsOrthogonal(
            nextPoints,
            moveStart,
            moveEnd,
          );
        }
        return moveStart || moveEnd
          ? { ...wire, points: nextPoints }
          : wire;
      });
      return normalizePageWireOverlaps({
        ...page,
        wires,
        junctions,
      });
    },
    now,
  );
}

export function updateWireName(
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
      const target = page.wires.find((wire) => wire.id === wireId);
      const nextName = name.trim();
      if (!target) {
        return page;
      }
      const wireIndex = page.wires.findIndex((wire) => wire.id === wireId);
      const previousName = wireDisplayName(target, wireIndex);
      const displayName = nextName || defaultWireName(wireIndex);
      if (previousName === displayName) {
        return page;
      }
      return {
        ...page,
        wires: page.wires.map((wire) => {
          if (wire.id !== wireId) {
            return wire;
          }
          const next = { ...wire };
          if (nextName) {
            next.name = nextName;
          } else {
            delete next.name;
          }
          return next;
        }),
        annotations: page.annotations.map((annotation) =>
          annotation.kind === "net" &&
          annotation.wireId === wireId &&
          annotation.text.trim() === previousName
            ? { ...annotation, text: displayName }
            : annotation,
        ),
      };
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
  const wireIdSet = new Set(wireIds);
  const annotationIdSet = new Set(annotationIds);
  return updatePage(
    document,
    pageId,
    (page) => ({
      ...page,
      wires: page.wires.map((wire) =>
        wireIdSet.has(wire.id) ? { ...wire, name: clean } : wire,
      ),
      annotations: page.annotations.map((annotation) =>
        annotationIdSet.has(annotation.id) && annotation.kind === "net"
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
  return { id, points, ...anchors };
}
