import type { DrawingPage } from "./model";

/** One paintable object on a page. Nets are containers and are not painted. */
export type PaintEntry =
  | { kind: "shape"; id: string }
  | { kind: "wire"; id: string }
  | { kind: "node"; id: string }
  | { kind: "annotation"; id: string };

/**
 * Arrange operations, matching the four documented stacking commands:
 * to the front, one step forward, one step backward, to the back.
 */
export type LayerDirection = "front" | "forward" | "backward" | "back";

/**
 * Stacking order used by documents without an explicit one. It reproduces the
 * legacy fixed bands: drawing shapes at the bottom, then wires, components,
 * Notes, and finally free text.
 */
export function defaultPaintOrder(page: DrawingPage): PaintEntry[] {
  return [
    ...page.shapes
      .filter((shape) => shape.kind !== "note")
      .map((shape) => ({ kind: "shape" as const, id: shape.id })),
    ...page.nets.flatMap((net) =>
      net.wires.map((wire) => ({ kind: "wire" as const, id: wire.id })),
    ),
    ...page.nodes.map((node) => ({ kind: "node" as const, id: node.id })),
    ...page.shapes
      .filter((shape) => shape.kind === "note")
      .map((shape) => ({ kind: "shape" as const, id: shape.id })),
    ...page.annotations.map((annotation) => ({
      kind: "annotation" as const,
      id: annotation.id,
    })),
  ];
}

/** Every paintable object on the page, keyed by id. */
export function paintEntriesById(
  page: DrawingPage,
): Map<string, PaintEntry> {
  return new Map(defaultPaintOrder(page).map((entry) => [entry.id, entry]));
}

/**
 * The stored stacking order with stale ids dropped, duplicates removed, and
 * any object missing from it appended in the legacy band order. Documents
 * without a stored order simply use the legacy order.
 */
export function resolvePaintOrder(page: DrawingPage): PaintEntry[] {
  const entries = paintEntriesById(page);
  const ordered: PaintEntry[] = [];
  const seen = new Set<string>();
  for (const id of page.zOrder ?? []) {
    const entry = entries.get(id);
    if (entry !== undefined && !seen.has(id)) {
      ordered.push(entry);
      seen.add(id);
    }
  }
  for (const entry of entries.values()) {
    if (!seen.has(entry.id)) {
      ordered.push(entry);
    }
  }
  return ordered;
}

export function paintOrderIds(page: DrawingPage): string[] {
  return resolvePaintOrder(page).map((entry) => entry.id);
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((id, index) => id === right[index])
  );
}

/**
 * Places a newly created object directly above the last object of its own
 * kind, so untidied pages keep their familiar grouping. Falls back to the top.
 */
export function withPaintEntry(
  page: DrawingPage,
  entry: PaintEntry,
): DrawingPage {
  const order = paintOrderIds(page).filter((id) => id !== entry.id);
  const entries = paintEntriesById(page);
  entries.set(entry.id, entry);
  let insertAt = order.length;
  for (let index = order.length - 1; index >= 0; index -= 1) {
    const candidate = entries.get(order[index]!);
    if (candidate?.kind === entry.kind) {
      insertAt = index + 1;
      break;
    }
  }
  order.splice(insertAt, 0, entry.id);
  return { ...page, zOrder: order };
}

export function withoutPaintEntries(
  page: DrawingPage,
  ids: Iterable<string>,
): DrawingPage {
  if (page.zOrder === undefined) {
    return page;
  }
  const removed = new Set(ids);
  const zOrder = page.zOrder.filter((id) => !removed.has(id));
  return zOrder.length === page.zOrder.length ? page : { ...page, zOrder };
}

/** Drops stored ids whose object no longer exists (for example pruned labels). */
export function prunePaintOrder(page: DrawingPage): DrawingPage {
  if (page.zOrder === undefined) {
    return page;
  }
  const live = new Set<string>([
    ...page.nodes.map((node) => node.id),
    ...page.nets.flatMap((net) => net.wires.map((wire) => wire.id)),
    ...page.annotations.map((annotation) => annotation.id),
    ...page.shapes.map((shape) => shape.id),
  ]);
  const zOrder = page.zOrder.filter((id) => live.has(id));
  return zOrder.length === page.zOrder.length ? page : { ...page, zOrder };
}

/**
 * Applies one arrange operation to the selected objects. Front/back accept a
 * multi-selection; stepping moves the selection as one block.
 */
export function reorderPaintEntries(
  page: DrawingPage,
  ids: readonly string[],
  direction: LayerDirection,
): DrawingPage {
  const current = paintOrderIds(page);
  const known = new Set(current);
  const selected = new Set(ids.filter((id) => known.has(id)));
  if (selected.size === 0) {
    return page;
  }
  const next = [...current];
  if (direction === "front" || direction === "back") {
    const moving = next.filter((id) => selected.has(id));
    const rest = next.filter((id) => !selected.has(id));
    next.splice(0, next.length, ...(direction === "front" ? [...rest, ...moving] : [...moving, ...rest]));
  } else if (direction === "forward") {
    for (let index = next.length - 2; index >= 0; index -= 1) {
      const currentId = next[index]!;
      const aboveId = next[index + 1]!;
      if (selected.has(currentId) && !selected.has(aboveId)) {
        next[index] = aboveId;
        next[index + 1] = currentId;
      }
    }
  } else {
    for (let index = 1; index < next.length; index += 1) {
      const currentId = next[index]!;
      const belowId = next[index - 1]!;
      if (selected.has(currentId) && !selected.has(belowId)) {
        next[index] = belowId;
        next[index - 1] = currentId;
      }
    }
  }
  return sameIds(next, current) ? page : { ...page, zOrder: next };
}
