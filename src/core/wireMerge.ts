import {
  pointOnSegment,
  pointsEqual,
  simplifyOrthogonalPath,
} from "./geometry";
import {
  wireDisplayName,
  type DrawingPage,
  type DrawicDocument,
  type Point,
  type Wire,
} from "./model";

interface Segment {
  start: Point;
  end: Point;
}

function segments(wire: Wire): Segment[] {
  return wire.points.slice(1).map((end, index) => ({
    start: wire.points[index]!,
    end,
  }));
}

function collinearOverlap(a: Segment, b: Segment): Segment | null {
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

function pointOnWire(point: Point, wire: Wire): boolean {
  return segments(wire).some(
    (segment) =>
      pointsEqual(point, segment.start, 0.5) ||
      pointsEqual(point, segment.end, 0.5) ||
      pointOnSegment(point, segment.start, segment.end, 0.5),
  );
}

function annotationPointOnWire(point: Point, wire: Wire): Point {
  let closest = point;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const segment of segments(wire)) {
    const dx = segment.end.x - segment.start.x;
    const dy = segment.end.y - segment.start.y;
    const lengthSquared = dx * dx + dy * dy;
    const t =
      lengthSquared <= 0.000001
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              ((point.x - segment.start.x) * dx +
                (point.y - segment.start.y) * dy) /
                lengthSquared,
            ),
          );
    const candidate = {
      x: segment.start.x + dx * t,
      y: segment.start.y + t * dy,
    };
    const distance = Math.hypot(point.x - candidate.x, point.y - candidate.y);
    if (distance < closestDistance) {
      closest = candidate;
      closestDistance = distance;
    }
  }
  return closest;
}

function mergeLeadingOverlap(
  page: DrawingPage,
  wireIndex: number,
  existingIndex: number,
): DrawingPage | null {
  const wire = page.wires[wireIndex];
  const existing = page.wires[existingIndex];
  if (!wire || !existing || wire.points.length < 2 || existing.points.length < 2) {
    return null;
  }
  const firstSegment = {
    start: wire.points[0]!,
    end: wire.points[1]!,
  };
  let overlap: Segment | null = null;
  let junctionInOverlap = false;
  for (const segment of segments(existing)) {
    const candidate = collinearOverlap(firstSegment, segment);
    if (
      candidate &&
      pointOnSegment(wire.points[0]!, candidate.start, candidate.end, 0.5) &&
      page.junctions.some((junction) =>
        pointOnSegment(junction, candidate.start, candidate.end, 0.5),
      )
    ) {
      overlap = candidate;
      junctionInOverlap = true;
      break;
    }
  }
  if (!overlap || !junctionInOverlap) {
    return null;
  }

  const horizontal = wire.points[0]!.y === wire.points[1]!.y;
  const startValue = horizontal ? wire.points[0]!.x : wire.points[0]!.y;
  const endValue = horizontal ? wire.points[1]!.x : wire.points[1]!.y;
  const overlapStart = horizontal ? overlap.start.x : overlap.start.y;
  const overlapEnd = horizontal ? overlap.end.x : overlap.end.y;
  const handoffValue =
    endValue >= startValue
      ? Math.max(overlapStart, overlapEnd)
      : Math.min(overlapStart, overlapEnd);
  const span = endValue - startValue;
  const t = Math.abs(span) < 0.0001 ? 1 : (handoffValue - startValue) / span;
  const handoff = {
    x: wire.points[0]!.x + (wire.points[1]!.x - wire.points[0]!.x) * t,
    y: wire.points[0]!.y + (wire.points[1]!.y - wire.points[0]!.y) * t,
  };
  const remaining = simplifyOrthogonalPath([
    handoff,
    ...wire.points.slice(1),
  ]);
  const existingLabel = page.annotations.find(
    (annotation) =>
      annotation.kind === "net" &&
      annotation.wireId === existing.id &&
      annotation.text.trim(),
  )?.text.trim();
  const mergedName =
    existingLabel || wireDisplayName(existing, existingIndex);
  const junctions = page.junctions.filter(
    (junction) =>
      !pointOnSegment(junction, overlap.start, overlap.end, 0.5),
  );
  const throughSegment = segments(existing).find(
    (segment) =>
      pointOnSegment(handoff, segment.start, segment.end, 0.5) &&
      !pointsEqual(handoff, segment.start, 0.5) &&
      !pointsEqual(handoff, segment.end, 0.5),
  );
  const next = remaining[1];
  const throughHorizontal =
    throughSegment?.start.y === throughSegment?.end.y;
  const nextHorizontal = next
    ? remaining[0]!.y === next.y
    : false;
  const branch =
    Boolean(throughSegment && next) &&
    throughHorizontal !== nextHorizontal;
  if (branch) {
    junctions.push({ ...handoff });
  }

  const handoffAtExistingEnd = pointsEqual(
    handoff,
    existing.points.at(-1)!,
    0.5,
  );
  const handoffAtExistingStart = pointsEqual(
    handoff,
    existing.points[0]!,
    0.5,
  );
  const mergeContinuation =
    !branch &&
    remaining.length >= 2 &&
    ((handoffAtExistingEnd && !existing.endAnchor) ||
      (handoffAtExistingStart && !existing.startAnchor));
  let mergedExisting = existing;
  if (mergeContinuation && handoffAtExistingEnd) {
    mergedExisting = {
      ...existing,
      name: mergedName,
      points: simplifyOrthogonalPath([
        ...existing.points,
        ...remaining.slice(1),
      ]),
      ...(wire.endAnchor ? { endAnchor: wire.endAnchor } : {}),
    };
  } else if (mergeContinuation && handoffAtExistingStart) {
    const reversed = remaining.slice().reverse();
    mergedExisting = {
      ...existing,
      name: mergedName,
      points: simplifyOrthogonalPath([
        ...reversed.slice(0, -1),
        ...existing.points,
      ]),
      ...(wire.endAnchor ? { startAnchor: wire.endAnchor } : {}),
    };
  }

  const wires = page.wires
    .map((candidate, index) => {
      if (index === existingIndex) {
        return mergeContinuation
          ? mergedExisting
          : { ...candidate, name: mergedName };
      }
      if (index !== wireIndex) {
        return candidate;
      }
      return {
        ...candidate,
        name: mergedName,
        points: remaining,
      };
    })
    .filter(
      (candidate, index) =>
        index !== wireIndex ||
        (!mergeContinuation && candidate.points.length >= 2),
    );
  const wireStillExists = !mergeContinuation && remaining.length >= 2;
  const annotations = page.annotations.map((annotation) => {
    if (annotation.kind !== "net") {
      return annotation;
    }
    if (annotation.wireId === wire.id || annotation.wireId === existing.id) {
      const attachedWire =
        annotation.wireId === wire.id && wireStillExists
          ? wire
          : mergedExisting;
      const point = annotationPointOnWire(annotation, attachedWire);
      return {
        ...annotation,
        wireId: wireStillExists && annotation.wireId === wire.id
          ? wire.id
          : existing.id,
        text: mergedName,
        x: point.x,
        y: point.y,
      };
    }
    return annotation;
  });
  return {
    ...page,
    wires,
    junctions,
    annotations,
  };
}

export function normalizePageWireOverlaps(page: DrawingPage): DrawingPage {
  let current = page;
  let wireIndex = 1;
  while (wireIndex < current.wires.length) {
    const wireId = current.wires[wireIndex]!.id;
    let merged = false;
    let existingIndex = 0;
    while (existingIndex < wireIndex) {
      const next = mergeLeadingOverlap(current, wireIndex, existingIndex);
      if (next) {
        current = next;
        merged = true;
        break;
      }
      existingIndex += 1;
    }
    const wireStillExists = current.wires.some((wire) => wire.id === wireId);
    if (!wireStillExists) {
      continue;
    }
    wireIndex += merged ? 0 : 1;
  }
  return current;
}

export function normalizeDocumentWireOverlaps(
  document: DrawicDocument,
): DrawicDocument {
  let changed = false;
  const pages = document.pages.map((page) => {
    const next = normalizePageWireOverlaps(page);
    if (next !== page) {
      changed = true;
    }
    return next;
  });
  return changed ? { ...document, pages } : document;
}
