import { isOrthogonalPath, pointOnSegment, pointsEqual } from "./geometry";
import {
  allJunctions,
  allWires,
  createIdentifier,
  pageById,
  replacePage,
  touchDocument,
  type ConnectionAnchor,
  type DrawingPage,
  type DrawicDocument,
  type Point,
  type Wire,
} from "./model";
import { canonicalizePageNetGraph } from "./netGraph";

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

export function movePageToIndex(
  document: DrawicDocument,
  pageId: string,
  targetIndex: number,
  clock: DocumentClock = nowIso,
): DrawicDocument {
  const index = document.pages.findIndex((page) => page.id === pageId);
  if (index < 0) {
    return document;
  }
  const clamped = Math.max(
    0,
    Math.min(document.pages.length - 1, Math.round(targetIndex)),
  );
  if (clamped === index) {
    return document;
  }
  const pages = [...document.pages];
  const [page] = pages.splice(index, 1);
  if (!page) {
    return document;
  }
  pages.splice(clamped, 0, page);
  return touchDocument({ ...document, pages }, clock());
}

export function movePage(
  document: DrawicDocument,
  pageId: string,
  direction: -1 | 1,
  clock: DocumentClock = nowIso,
): DrawicDocument {
  const index = document.pages.findIndex((page) => page.id === pageId);
  if (index < 0) {
    return document;
  }
  return movePageToIndex(document, pageId, index + direction, clock);
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
  const netIds = new Map(source.nets.map((net) => [net.id, makeId("net")]));
  const wireIds = new Map(
    source.nets.flatMap((net) =>
      net.wires.map((wire) => [wire.id, makeId("wire")] as const),
    ),
  );
  const junctionIds = new Map(
    source.nets.flatMap((net) =>
      net.junctions.map(
        (junction) => [junction.id, makeId("junction")] as const,
      ),
    ),
  );
  const annotationIds = new Map<string, string>();
  const shapeIds = new Map<string, string>();
  const page: DrawingPage = {
    id: options?.pageId ?? makeId("page"),
    name: options?.name ?? `${source.name} copy`,
    nodes: source.nodes.map((node) => ({
      ...node,
      id: nodeIds.get(node.id)!,
    })),
    nets: source.nets.map((net) => ({
      ...(net.name ? { name: net.name } : {}),
      ...(net.color ? { color: net.color } : {}),
      id: netIds.get(net.id)!,
      wires: net.wires.map((wire) => ({
        id: wireIds.get(wire.id)!,
        points: wire.points.map((point) => ({ ...point })),
        start:
          wire.start.kind === "pin"
            ? {
                kind: "pin",
                deviceId:
                  nodeIds.get(wire.start.deviceId) ?? wire.start.deviceId,
                pinId: wire.start.pinId,
              }
            : wire.start.kind === "junction"
              ? {
                  kind: "junction",
                  junctionId:
                    junctionIds.get(wire.start.junctionId) ??
                    wire.start.junctionId,
                }
              : { kind: "open" },
        end:
          wire.end.kind === "pin"
            ? {
                kind: "pin",
                deviceId: nodeIds.get(wire.end.deviceId) ?? wire.end.deviceId,
                pinId: wire.end.pinId,
              }
            : wire.end.kind === "junction"
              ? {
                  kind: "junction",
                  junctionId:
                    junctionIds.get(wire.end.junctionId) ??
                    wire.end.junctionId,
                }
              : { kind: "open" },
      })),
      junctions: net.junctions.map((junction) => ({
        id: junctionIds.get(junction.id)!,
        point: { ...junction.point },
      })),
    })),
    annotations: source.annotations.map((annotation) => {
      const nextId = makeId("annotation");
      annotationIds.set(annotation.id, nextId);
      const next = { ...annotation, id: nextId };
      if (annotation.wireId) {
        const mappedWireId = wireIds.get(annotation.wireId);
        if (mappedWireId) {
          next.wireId = mappedWireId;
        } else {
          delete next.wireId;
        }
      }
      if (annotation.netId) {
        const mappedNetId = netIds.get(annotation.netId);
        if (mappedNetId) {
          next.netId = mappedNetId;
        } else {
          delete next.netId;
        }
      }
      return next;
    }),
    shapes: source.shapes.map((shape) => {
      const nextId = makeId("shape");
      shapeIds.set(shape.id, nextId);
      return { ...shape, id: nextId };
    }),
  };
  if (source.zOrder) {
    page.zOrder = source.zOrder
      .map(
        (id) =>
          nodeIds.get(id) ??
          wireIds.get(id) ??
          annotationIds.get(id) ??
          shapeIds.get(id),
      )
      .filter((id): id is string => id !== undefined);
  }
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
      const hits = allWires(page).filter(({ wire }) =>
        wire.points.some((candidate, index) => {
          if (pointsEqual(candidate, point, 0.5)) {
            return true;
          }
          const next = wire.points[index + 1];
          return next ? pointOnSegment(point, candidate, next, 0.5) : false;
        }),
      );
      if (hits.length === 0) {
        return page;
      }
      const netIds = new Set(hits.map(({ net }) => net.id));
      if (netIds.size < 2) {
        return page;
      }
      const primary = hits[0]!.net;
      const mergedName = page.nets
        .filter((net) => netIds.has(net.id))
        .find((net) => net.name)?.name;
      const mergedColor = page.nets
        .filter((net) => netIds.has(net.id))
        .map((net) => net.color)
        .find(Boolean);
      const junction = {
        id: createIdentifier("junction"),
        point: { ...point },
      };
      const mergedWires: Wire[] = [];
      for (const { net, wire } of hits) {
        const startMatch = pointsEqual(wire.points[0]!, point, 0.5);
        const endMatch = pointsEqual(wire.points.at(-1)!, point, 0.5);
        if (startMatch || endMatch) {
          mergedWires.push({
            ...wire,
            start: startMatch
              ? { kind: "junction", junctionId: junction.id }
              : wire.start,
            end: endMatch
              ? { kind: "junction", junctionId: junction.id }
              : wire.end,
          });
          continue;
        }
        let splitIndex = wire.points.findIndex((candidate) =>
          pointsEqual(candidate, point, 0.5),
        );
        if (splitIndex < 1) {
          splitIndex = wire.points.findIndex(
            (_candidate, index) =>
              index > 0 &&
              pointOnSegment(
                point,
                wire.points[index - 1]!,
                wire.points[index]!,
                0.5,
              ),
          );
        }
        if (splitIndex < 1) {
          mergedWires.push(wire);
          continue;
        }
        mergedWires.push(
          {
            id: wire.id,
            points: [...wire.points.slice(0, splitIndex), { ...point }],
            start: wire.start,
            end: { kind: "junction", junctionId: junction.id },
          },
          {
            id: createIdentifier("wire"),
            points: [{ ...point }, ...wire.points.slice(splitIndex)],
            start: { kind: "junction", junctionId: junction.id },
            end: wire.end,
          },
        );
      }
      const netIdRemap = new Map(
        [...netIds].map((netId) => [netId, primary.id] as const),
      );
      const hitWireIds = new Set(hits.map(({ wire }) => wire.id));
      const untouchedWires = page.nets
        .filter((net) => netIds.has(net.id))
        .flatMap((net) =>
          net.wires.filter((wire) => !hitWireIds.has(wire.id)),
        );
      return canonicalizePageNetGraph({
        ...page,
        nets: [
          ...page.nets.filter((net) => !netIds.has(net.id)),
          {
            id: primary.id,
            ...(mergedName ? { name: mergedName } : {}),
            ...(mergedColor ? { color: mergedColor } : {}),
            wires: [...untouchedWires, ...mergedWires],
            junctions: [junction],
          },
        ],
        annotations: page.annotations.map((annotation) =>
          annotation.netId && netIdRemap.has(annotation.netId)
            ? { ...annotation, netId: primary.id }
            : annotation,
        ),
      });
    },
    clock,
  );
}

export function validateWirePoints(points: Point[]): boolean {
  return points.length >= 2 && isOrthogonalPath(points);
}
