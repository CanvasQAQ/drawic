import { activeCell, replaceActiveCell, touchDocument, type DrawicDocument, type Point } from "./model";
import { isOrthogonalPath } from "./geometry";

export type DocumentClock = () => string;

const nowIso: DocumentClock = () => new Date().toISOString();

export function mutateActiveCell(
  document: DrawicDocument,
  mutate: (cell: ReturnType<typeof activeCell>) => ReturnType<typeof activeCell>,
  clock: DocumentClock = nowIso,
): DrawicDocument {
  const cell = activeCell(document);
  const nextCell = mutate(cell);
  if (nextCell === cell) {
    return document;
  }
  return replaceActiveCell(document, nextCell, clock());
}

export function renameCell(
  document: DrawicDocument,
  cellId: string,
  name: string,
  clock: DocumentClock = nowIso,
): DrawicDocument {
  const clean = name.trim();
  if (!clean) {
    return document;
  }
  return touchDocument(
    {
      ...document,
      cells: document.cells.map((cell) => (cell.id === cellId ? { ...cell, name: clean } : cell)),
    },
    clock(),
  );
}

export function setActiveCell(document: DrawicDocument, cellId: string): DrawicDocument {
  if (!document.cells.some((cell) => cell.id === cellId)) {
    return document;
  }
  return { ...document, activeCellId: cellId };
}

export function setTopCell(
  document: DrawicDocument,
  cellId: string,
  clock: DocumentClock = nowIso,
): DrawicDocument {
  if (!document.cells.some((cell) => cell.id === cellId)) {
    return document;
  }
  return touchDocument(
    {
      ...document,
      cells: document.cells.map((cell) => ({ ...cell, isTop: cell.id === cellId })),
    },
    clock(),
  );
}

export function addCell(
  document: DrawicDocument,
  cell: ReturnType<typeof activeCell>,
  clock: DocumentClock = nowIso,
): DrawicDocument {
  return touchDocument(
    {
      ...document,
      activeCellId: cell.id,
      cells: [...document.cells, { ...cell, isTop: false }],
    },
    clock(),
  );
}

export function deleteCell(
  document: DrawicDocument,
  cellId: string,
  clock: DocumentClock = nowIso,
): DrawicDocument {
  if (document.cells.length <= 1) {
    return document;
  }
  const target = document.cells.find((cell) => cell.id === cellId);
  if (!target) {
    return document;
  }
  const remaining = document.cells.filter((cell) => cell.id !== cellId);
  const fallback = target.isTop ? remaining[0] : undefined;
  const cells = remaining.map((cell) =>
    cell.id === fallback?.id ? { ...cell, isTop: true } : cell,
  );
  const activeCellId =
    document.activeCellId === cellId ? (cells[0]?.id ?? document.activeCellId) : document.activeCellId;
  return touchDocument({ ...document, cells, activeCellId }, clock());
}

export function addJunction(
  document: DrawicDocument,
  point: Point,
  clock: DocumentClock = nowIso,
): DrawicDocument {
  return mutateActiveCell(
    document,
    (cell) => {
      if (cell.junctions.some((junction) => junction.x === point.x && junction.y === point.y)) {
        return cell;
      }
      return { ...cell, junctions: [...cell.junctions, point] };
    },
    clock,
  );
}

export function validateWirePoints(points: Point[]): boolean {
  return points.length >= 2 && isOrthogonalPath(points);
}
