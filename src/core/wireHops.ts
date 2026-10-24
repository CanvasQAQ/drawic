import { segmentIntersection } from "./geometry";
import type { ConnectivityResult } from "./connectivity";
import type { Point } from "./model";

export const WIRE_HOP_RADIUS = 5;

export interface WireOverlap {
  segmentIndex: number;
  start: number;
  end: number;
}

export function wireOverlaps(
  connectivity: ConnectivityResult,
): Map<string, WireOverlap[]> {
  const overlaps = new Map<string, WireOverlap[]>();
  const segments = connectivity.segments;
  for (let left = 0; left < segments.length; left += 1) {
    const a = segments[left]!;
    for (let right = left + 1; right < segments.length; right += 1) {
      const b = segments[right]!;
      if (
        a.wireId === b.wireId ||
        connectivity.networkIdByWire.get(a.wireId) !==
          connectivity.networkIdByWire.get(b.wireId)
      ) {
        continue;
      }
      const horizontal =
        a.start.y === a.end.y && b.start.y === b.end.y && a.start.y === b.start.y;
      const vertical =
        a.start.x === a.end.x && b.start.x === b.end.x && a.start.x === b.start.x;
      if (!horizontal && !vertical) {
        continue;
      }
      const aStart = horizontal ? a.start.x : a.start.y;
      const aEnd = horizontal ? a.end.x : a.end.y;
      const bStart = horizontal ? b.start.x : b.start.y;
      const bEnd = horizontal ? b.end.x : b.end.y;
      const lower = Math.max(Math.min(aStart, aEnd), Math.min(bStart, bEnd));
      const upper = Math.min(Math.max(aStart, aEnd), Math.max(bStart, bEnd));
      if (upper - lower < 0.1) {
        continue;
      }
      const hidden = a.wireId > b.wireId ? a : b;
      const hiddenStart = horizontal ? hidden.start.x : hidden.start.y;
      const hiddenEnd = horizontal ? hidden.end.x : hidden.end.y;
      const start = (lower - hiddenStart) / (hiddenEnd - hiddenStart);
      const end = (upper - hiddenStart) / (hiddenEnd - hiddenStart);
      const ranges = overlaps.get(hidden.wireId) ?? [];
      ranges.push({
        segmentIndex: hidden.segmentIndex,
        start: Math.min(start, end),
        end: Math.max(start, end),
      });
      overlaps.set(
        hidden.wireId,
        ranges,
      );
    }
  }
  for (const ranges of overlaps.values()) {
    ranges.sort((a, b) => a.segmentIndex - b.segmentIndex || a.start - b.start);
  }
  return overlaps;
}

export function wireHops(
  connectivity: ConnectivityResult,
): Map<string, Point[]> {
  const hops = new Map<string, Point[]>();
  const segments = connectivity.segments;
  for (let left = 0; left < segments.length; left += 1) {
    for (let right = left + 1; right < segments.length; right += 1) {
      const a = segments[left]!;
      const b = segments[right]!;
      if (a.wireId === b.wireId) {
        continue;
      }
      const aHorizontal = a.start.y === a.end.y && a.start.x !== a.end.x;
      const bHorizontal = b.start.y === b.end.y && b.start.x !== b.end.x;
      const aVertical = a.start.x === a.end.x && a.start.y !== a.end.y;
      const bVertical = b.start.x === b.end.x && b.start.y !== b.end.y;
      const horizontal = aHorizontal ? a : bHorizontal ? b : null;
      const vertical = aVertical ? a : bVertical ? b : null;
      if (!horizontal || !vertical) {
        continue;
      }
      if (
        connectivity.networkIdByWire.get(horizontal.wireId) ===
        connectivity.networkIdByWire.get(vertical.wireId)
      ) {
        continue;
      }
      const intersection = segmentIntersection(
        horizontal.start,
        horizontal.end,
        vertical.start,
        vertical.end,
      );
      if (!intersection) {
        continue;
      }
      const horizontalInterior =
        intersection.x > Math.min(horizontal.start.x, horizontal.end.x) + WIRE_HOP_RADIUS &&
        intersection.x < Math.max(horizontal.start.x, horizontal.end.x) - WIRE_HOP_RADIUS;
      const verticalInterior =
        intersection.y > Math.min(vertical.start.y, vertical.end.y) + WIRE_HOP_RADIUS &&
        intersection.y < Math.max(vertical.start.y, vertical.end.y) - WIRE_HOP_RADIUS;
      const target = horizontalInterior
        ? horizontal
        : verticalInterior
          ? vertical
          : null;
      if (!target) {
        continue;
      }
      const wireHopsForWire = hops.get(target.wireId) ?? [];
      if (
        !wireHopsForWire.some(
          (hop) =>
            Math.hypot(
              hop.x - intersection.x,
              hop.y - intersection.y,
            ) < WIRE_HOP_RADIUS * 2,
        )
      ) {
        wireHopsForWire.push(intersection);
        hops.set(target.wireId, wireHopsForWire);
      }
    }
  }
  return hops;
}

export function wirePathData(
  points: readonly Point[],
  hops: readonly Point[] = [],
  overlaps: readonly WireOverlap[] = [],
): string {
  if (points.length === 0) {
    return "";
  }
  let path = "";
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1]!;
    const end = points[index]!;
    const hiddenRanges = overlaps
      .filter((range) => range.segmentIndex === index - 1)
      .sort((a, b) => a.start - b.start);
    const visibleRanges: Array<{ start: number; end: number }> = [];
    let cursor = 0;
    for (const range of hiddenRanges) {
      if (range.start > cursor) {
        visibleRanges.push({ start: cursor, end: range.start });
      }
      cursor = Math.max(cursor, range.end);
    }
    if (cursor < 1) {
      visibleRanges.push({ start: cursor, end: 1 });
    }
    const horizontal = start.y === end.y && start.x !== end.x;
    for (const visible of visibleRanges) {
      const visibleStart = {
        x: start.x + (end.x - start.x) * visible.start,
        y: start.y + (end.y - start.y) * visible.start,
      };
      const visibleEnd = {
        x: start.x + (end.x - start.x) * visible.end,
        y: start.y + (end.y - start.y) * visible.end,
      };
      path += ` M ${visibleStart.x} ${visibleStart.y}`;
      const segmentHops = hops
        .filter((hop) =>
          horizontal
            ? Math.abs(hop.y - start.y) < 0.5
            : Math.abs(hop.x - start.x) < 0.5,
        )
        .filter((hop) => {
          const t = horizontal
            ? (hop.x - start.x) / (end.x - start.x)
            : (hop.y - start.y) / (end.y - start.y);
          return t > visible.start + 0.001 && t < visible.end - 0.001;
        })
        .sort((a, b) =>
          horizontal
            ? start.x < end.x
              ? a.x - b.x
              : b.x - a.x
            : start.y < end.y
              ? a.y - b.y
              : b.y - a.y,
        );
      for (const hop of segmentHops) {
        if (horizontal) {
          if (start.x < end.x) {
            path += ` L ${hop.x - WIRE_HOP_RADIUS} ${hop.y}`;
            path += ` Q ${hop.x} ${hop.y - WIRE_HOP_RADIUS * 2} ${hop.x + WIRE_HOP_RADIUS} ${hop.y}`;
          } else {
            path += ` L ${hop.x + WIRE_HOP_RADIUS} ${hop.y}`;
            path += ` Q ${hop.x} ${hop.y - WIRE_HOP_RADIUS * 2} ${hop.x - WIRE_HOP_RADIUS} ${hop.y}`;
          }
        } else if (start.y < end.y) {
          path += ` L ${hop.x} ${hop.y - WIRE_HOP_RADIUS}`;
          path += ` Q ${hop.x + WIRE_HOP_RADIUS * 2} ${hop.y} ${hop.x} ${hop.y + WIRE_HOP_RADIUS}`;
        } else {
          path += ` L ${hop.x} ${hop.y + WIRE_HOP_RADIUS}`;
          path += ` Q ${hop.x + WIRE_HOP_RADIUS * 2} ${hop.y} ${hop.x} ${hop.y - WIRE_HOP_RADIUS}`;
        }
      }
      path += ` L ${visibleEnd.x} ${visibleEnd.y}`;
    }
  }
  return path.trim();
}
