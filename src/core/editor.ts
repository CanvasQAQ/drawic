import {
  pageById,
  replacePage,
  type Annotation,
  type ComponentNode,
  type ConnectionAnchor,
  type DrawingPage,
  type DrawingShape,
  type DrawicDocument,
  type Point,
  type Rotation,
  type SelectionRef,
  type SymbolDefinition,
  type Wire,
} from "./model";

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
    startAnchor?: ConnectionAnchor;
    endAnchor?: ConnectionAnchor;
    now?: string;
  },
): DrawicDocument {
  if (request.points.length < 2) {
    return document;
  }
  return updatePage(
    document,
    pageId,
    (page) => ({
      ...page,
      wires: [
        ...page.wires,
        {
          id: request.id,
          points: request.points,
          ...(request.startAnchor ? { startAnchor: request.startAnchor } : {}),
          ...(request.endAnchor ? { endAnchor: request.endAnchor } : {}),
        },
      ],
    }),
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
  return updatePage(
    document,
    pageId,
    (page) => ({
      ...page,
      nodes: page.nodes.filter((node) => !nodeIds.has(node.id)),
      wires: page.wires
        .filter((wire) => !wireIds.has(wire.id))
        .map((wire) => {
          const removeStart = Boolean(
            wire.startAnchor && nodeIds.has(wire.startAnchor.deviceId),
          );
          const removeEnd = Boolean(wire.endAnchor && nodeIds.has(wire.endAnchor.deviceId));
          return {
            id: wire.id,
            points: wire.points,
            ...(wire.startAnchor && !removeStart ? { startAnchor: wire.startAnchor } : {}),
            ...(wire.endAnchor && !removeEnd ? { endAnchor: wire.endAnchor } : {}),
          };
        }),
      annotations: page.annotations.filter((annotation) => !annotationIds.has(annotation.id)),
      shapes: page.shapes.filter((shape) => !shapeIds.has(shape.id)),
    }),
    now,
  );
}

function moveAttachedWire(
  wire: Wire,
  selectedNodeIds: ReadonlySet<string>,
  delta: Point,
): Wire {
  const points = wire.points.map((point) => ({ ...point }));
  const moveStart = wire.startAnchor && selectedNodeIds.has(wire.startAnchor.deviceId);
  const moveEnd = wire.endAnchor && selectedNodeIds.has(wire.endAnchor.deviceId);
  if (!moveStart && !moveEnd) {
    return wire;
  }
  if (moveStart && points[0]) {
    const previous = { ...points[0] };
    points[0] = { x: points[0].x + delta.x, y: points[0].y + delta.y };
    if (points[1]) {
      if (previous.x === points[1].x) {
        points[1] = { ...points[1], x: points[1].x + delta.x };
      } else {
        points[1] = { ...points[1], y: points[1].y + delta.y };
      }
    }
  }
  if (moveEnd && points.length > 1) {
    const lastIndex = points.length - 1;
    const last = points[lastIndex]!;
    points[lastIndex] = { x: last.x + delta.x, y: last.y + delta.y };
    if (lastIndex > 0) {
      const neighbor = points[lastIndex - 1]!;
      if (last.x === neighbor.x) {
        points[lastIndex - 1] = { ...neighbor, x: neighbor.x + delta.x };
      } else {
        points[lastIndex - 1] = { ...neighbor, y: neighbor.y + delta.y };
      }
    }
  }
  return { ...wire, points };
}

export function moveNodes(
  document: DrawicDocument,
  pageId: string,
  nodeIds: readonly string[],
  delta: Point,
  now = new Date().toISOString(),
): DrawicDocument {
  if (nodeIds.length === 0 || (delta.x === 0 && delta.y === 0)) {
    return document;
  }
  const ids = new Set(nodeIds);
  return updatePage(
    document,
    pageId,
    (page) => ({
      ...page,
      nodes: page.nodes.map((node) =>
        ids.has(node.id)
          ? { ...node, x: node.x + delta.x, y: node.y + delta.y }
          : node,
      ),
      wires: page.wires.map((wire) => moveAttachedWire(wire, ids, delta)),
    }),
    now,
  );
}

export function rotateSelection(
  document: DrawicDocument,
  pageId: string,
  selection: readonly SelectionRef[],
  now = new Date().toISOString(),
): DrawicDocument {
  const ids = new Set(selection.filter((item) => item.kind === "node").map((item) => item.id));
  const shapeIds = new Set(
    selection.filter((item) => item.kind === "shape").map((item) => item.id),
  );
  if (ids.size === 0 && shapeIds.size === 0) {
    return document;
  }
  return updatePage(
    document,
    pageId,
    (page) => ({
      ...page,
      nodes: page.nodes.map((node) =>
        ids.has(node.id)
          ? { ...node, rotation: ((node.rotation + 90) % 360) as Rotation }
          : node,
      ),
      shapes: page.shapes.map((shape) =>
        shapeIds.has(shape.id)
          ? { ...shape, rotation: ((shape.rotation + 90) % 360) as Rotation }
          : shape,
      ),
    }),
    now,
  );
}

export function mirrorSelection(
  document: DrawicDocument,
  pageId: string,
  selection: readonly SelectionRef[],
  now = new Date().toISOString(),
): DrawicDocument {
  const ids = new Set(selection.filter((item) => item.kind === "node").map((item) => item.id));
  if (ids.size === 0) {
    return document;
  }
  return updatePage(
    document,
    pageId,
    (page) => ({
      ...page,
      nodes: page.nodes.map((node) =>
        ids.has(node.id) ? { ...node, mirrored: !node.mirrored } : node,
      ),
    }),
    now,
  );
}

export function updateNode(
  document: DrawicDocument,
  pageId: string,
  nodeId: string,
  patch: Partial<Pick<ComponentNode, "reference" | "value" | "x" | "y">>,
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
      const next = { ...target, ...patch };
      if (
        next.reference === target.reference &&
        next.value === target.value &&
        next.x === target.x &&
        next.y === target.y
      ) {
        return page;
      }
      return {
        ...page,
        nodes: page.nodes.map((node) => (node.id === nodeId ? next : node)),
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
      return {
        ...page,
        wires: page.wires.map((wire) =>
          wire.id === wireId ? { ...wire, points } : wire,
        ),
      };
    },
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
