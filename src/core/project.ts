import { isOrthogonalPath } from "./geometry";
import {
  createIdentifier,
  pageById,
  replacePage,
  touchDocument,
  type ConnectionAnchor,
  type DrawingPage,
  type DrawicDocument,
  type Point,
} from "./model";

export type DocumentClock = () => string;

const nowIso: DocumentClock = () => new Date().toISOString();

export function mutatePage(
  document: DrawicDocument,
  pageId: string,
  mutate: (page: DrawingPage) => DrawingPage,
  clock: DocumentClock = nowIso,
): DrawicDocument {
  const page = pageById(document, pageId);
  const nextPage = mutate(page);
  if (nextPage === page) {
    return document;
  }
  return replacePage(document, nextPage, clock());
}

export function renamePage(
  document: DrawicDocument,
  pageId: string,
  name: string,
  clock: DocumentClock = nowIso,
): DrawicDocument {
  const clean = name.trim();
  if (!clean) {
    return document;
  }
  return mutatePage(
    document,
    pageId,
    (page) => (page.name === clean ? page : { ...page, name: clean }),
    clock,
  );
}

export function addPage(
  document: DrawicDocument,
  page: DrawingPage,
  clock: DocumentClock = nowIso,
): DrawicDocument {
  if (document.pages.some((candidate) => candidate.id === page.id)) {
    return document;
  }
  return touchDocument(
    {
      ...document,
      pages: [...document.pages, page],
    },
    clock(),
  );
}

export function deletePage(
  document: DrawicDocument,
  pageId: string,
  clock: DocumentClock = nowIso,
): DrawicDocument {
  if (document.pages.length <= 1 || !document.pages.some((page) => page.id === pageId)) {
    return document;
  }
  return touchDocument(
    {
      ...document,
      pages: document.pages.filter((page) => page.id !== pageId),
    },
    clock(),
  );
}

export function movePage(
  document: DrawicDocument,
  pageId: string,
  direction: -1 | 1,
  clock: DocumentClock = nowIso,
): DrawicDocument {
  const index = document.pages.findIndex((page) => page.id === pageId);
  const targetIndex = index + direction;
  if (index < 0 || targetIndex < 0 || targetIndex >= document.pages.length) {
    return document;
  }
  const pages = [...document.pages];
  const [page] = pages.splice(index, 1);
  if (!page) {
    return document;
  }
  pages.splice(targetIndex, 0, page);
  return touchDocument({ ...document, pages }, clock());
}

function remapAnchor(
  anchor: ConnectionAnchor | undefined,
  nodeIds: ReadonlyMap<string, string>,
): ConnectionAnchor | undefined {
  if (!anchor) {
    return undefined;
  }
  return {
    deviceId: nodeIds.get(anchor.deviceId) ?? anchor.deviceId,
    pinId: anchor.pinId,
  };
}

export function duplicatePage(
  document: DrawicDocument,
  pageId: string,
  options?: {
    idFactory?: (prefix: string) => string;
    pageId?: string;
    name?: string;
    clock?: DocumentClock;
  },
): DrawicDocument {
  const source = pageById(document, pageId);
  const makeId = options?.idFactory ?? createIdentifier;
  const nodeIds = new Map(source.nodes.map((node) => [node.id, makeId("node")]));
  const wireIds = new Map(source.wires.map((wire) => [wire.id, makeId("wire")]));
  const page: DrawingPage = {
    id: options?.pageId ?? makeId("page"),
    name: options?.name ?? `${source.name} copy`,
    nodes: source.nodes.map((node) => ({
      ...node,
      id: nodeIds.get(node.id)!,
    })),
    wires: source.wires.map((wire) => {
      const startAnchor = remapAnchor(wire.startAnchor, nodeIds);
      const endAnchor = remapAnchor(wire.endAnchor, nodeIds);
      return {
        id: wireIds.get(wire.id)!,
        points: wire.points.map((point) => ({ ...point })),
        ...(wire.name ? { name: wire.name } : {}),
        ...(startAnchor ? { startAnchor } : {}),
        ...(endAnchor ? { endAnchor } : {}),
      };
    }),
    junctions: source.junctions.map((point) => ({ ...point })),
    annotations: source.annotations.map((annotation) => {
      const next = { ...annotation, id: makeId("annotation") };
      if (annotation.wireId) {
        const mappedWireId = wireIds.get(annotation.wireId);
        if (mappedWireId) {
          next.wireId = mappedWireId;
        } else {
          delete next.wireId;
        }
      }
      return next;
    }),
    shapes: source.shapes.map((shape) => ({
      ...shape,
      id: makeId("shape"),
    })),
  };
  return addPage(document, page, options?.clock ?? nowIso);
}

export function addJunction(
  document: DrawicDocument,
  pageId: string,
  point: Point,
  clock: DocumentClock = nowIso,
): DrawicDocument {
  return mutatePage(
    document,
    pageId,
    (page) => {
      if (page.junctions.some((junction) => junction.x === point.x && junction.y === point.y)) {
        return page;
      }
      return { ...page, junctions: [...page.junctions, point] };
    },
    clock,
  );
}

export function validateWirePoints(points: Point[]): boolean {
  return points.length >= 2 && isOrthogonalPath(points);
}
