import {
  activeCell,
  replaceActiveCell,
  touchDocument,
  type Annotation,
  type ComponentNode,
  type DrawicDocument,
  type Point,
  type Rotation,
  type SchematicCell,
  type SelectionRef,
  type SymbolDefinition,
  type Wire,
} from "./model";

export interface EditorIdentifiers {
  node: () => string;
  wire: () => string;
  annotation: () => string;
}

export function addComponent(
  document: DrawicDocument,
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
  return {
    ...touchDocument(document, request.now),
    cells: document.cells.map((cell) =>
      cell.id === document.activeCellId
        ? {
            ...cell,
            nodes: [
              ...cell.nodes,
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
          }
        : cell,
    ),
  };
}

export function addWire(
  document: DrawicDocument,
  request: { points: Point[]; id: string; now?: string },
): DrawicDocument {
  if (request.points.length < 2) {
    return document;
  }
  return {
    ...touchDocument(document, request.now),
    cells: document.cells.map((cell) =>
      cell.id === document.activeCellId
        ? { ...cell, wires: [...cell.wires, { id: request.id, points: request.points }] }
        : cell,
    ),
  };
}

export function addAnnotation(
  document: DrawicDocument,
  request: {
    kind: Annotation["kind"];
    text: string;
    point: Point;
    id: string;
    now?: string;
  },
): DrawicDocument {
  return {
    ...touchDocument(document, request.now),
    cells: document.cells.map((cell) =>
      cell.id === document.activeCellId
        ? {
            ...cell,
            annotations: [
              ...cell.annotations,
              {
                id: request.id,
                kind: request.kind,
                text: request.text,
                x: Math.round(request.point.x),
                y: Math.round(request.point.y),
                size: 16,
              },
            ],
          }
        : cell,
    ),
  };
}

export function removeSelection(
  document: DrawicDocument,
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
  const cell = activeCell(document);
  return replaceActiveCell(
    document,
    {
      ...cell,
      nodes: cell.nodes.filter((node) => !nodeIds.has(node.id)),
      wires: cell.wires.filter((wire) => !wireIds.has(wire.id)),
      annotations: cell.annotations.filter((annotation) => !annotationIds.has(annotation.id)),
    },
    now,
  );
}

export function moveNodes(
  document: DrawicDocument,
  nodeIds: readonly string[],
  delta: Point,
  now = new Date().toISOString(),
): DrawicDocument {
  if (nodeIds.length === 0 || (delta.x === 0 && delta.y === 0)) {
    return document;
  }
  const ids = new Set(nodeIds);
  const cell = activeCell(document);
  return replaceActiveCell(
    document,
    {
      ...cell,
      nodes: cell.nodes.map((node) =>
        ids.has(node.id)
          ? { ...node, x: node.x + delta.x, y: node.y + delta.y }
          : node,
      ),
    },
    now,
  );
}

export function rotateSelection(
  document: DrawicDocument,
  selection: readonly SelectionRef[],
  now = new Date().toISOString(),
): DrawicDocument {
  const ids = new Set(selection.filter((item) => item.kind === "node").map((item) => item.id));
  if (ids.size === 0) {
    return document;
  }
  const cell = activeCell(document);
  return replaceActiveCell(
    document,
    {
      ...cell,
      nodes: cell.nodes.map((node) =>
        ids.has(node.id)
          ? { ...node, rotation: ((node.rotation + 90) % 360) as Rotation }
          : node,
      ),
    },
    now,
  );
}

export function mirrorSelection(
  document: DrawicDocument,
  selection: readonly SelectionRef[],
  now = new Date().toISOString(),
): DrawicDocument {
  const ids = new Set(selection.filter((item) => item.kind === "node").map((item) => item.id));
  if (ids.size === 0) {
    return document;
  }
  const cell = activeCell(document);
  return replaceActiveCell(
    document,
    {
      ...cell,
      nodes: cell.nodes.map((node) =>
        ids.has(node.id) ? { ...node, mirrored: !node.mirrored } : node,
      ),
    },
    now,
  );
}

export function updateNode(
  document: DrawicDocument,
  nodeId: string,
  patch: Partial<Pick<ComponentNode, "reference" | "value" | "x" | "y">>,
  now = new Date().toISOString(),
): DrawicDocument {
  const cell = activeCell(document);
  const target = cell.nodes.find((node) => node.id === nodeId);
  if (!target) {
    return document;
  }
  const next = { ...target, ...patch };
  if (
    next.reference === target.reference &&
    next.value === target.value &&
    next.x === target.x &&
    next.y === target.y
  ) {
    return document;
  }
  return replaceActiveCell(
    document,
    {
      ...cell,
      nodes: cell.nodes.map((node) => (node.id === nodeId ? next : node)),
    },
    now,
  );
}

export function updateAnnotation(
  document: DrawicDocument,
  annotationId: string,
  patch: Partial<Pick<Annotation, "text" | "kind" | "x" | "y" | "size">>,
  now = new Date().toISOString(),
): DrawicDocument {
  const cell = activeCell(document);
  const target = cell.annotations.find((annotation) => annotation.id === annotationId);
  if (!target) {
    return document;
  }
  const next = { ...target, ...patch };
  if (
    next.text === target.text &&
    next.kind === target.kind &&
    next.x === target.x &&
    next.y === target.y &&
    next.size === target.size
  ) {
    return document;
  }
  return replaceActiveCell(
    document,
    {
      ...cell,
      annotations: cell.annotations.map((annotation) =>
        annotation.id === annotationId ? next : annotation,
      ),
    },
    now,
  );
}

export function updateWirePoints(
  document: DrawicDocument,
  wireId: string,
  points: Point[],
  now = new Date().toISOString(),
): DrawicDocument {
  const cell = activeCell(document);
  const target = cell.wires.find((wire) => wire.id === wireId);
  if (!target) {
    return document;
  }
  return replaceActiveCell(
    document,
    {
      ...cell,
      wires: cell.wires.map((wire) => (wire.id === wireId ? { ...wire, points } : wire)),
    },
    now,
  );
}

export function replaceCellContent(
  document: DrawicDocument,
  cellId: string,
  transform: (cell: SchematicCell) => SchematicCell,
  now = new Date().toISOString(),
): DrawicDocument {
  return touchDocument(
    {
      ...document,
      cells: document.cells.map((cell) => (cell.id === cellId ? transform(cell) : cell)),
    },
    now,
  );
}

export function createWireFromPath(id: string, points: Point[]): Wire {
  return { id, points };
}
