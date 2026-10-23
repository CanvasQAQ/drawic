export const DOCUMENT_SCHEMA_VERSION = 1 as const;
export const DOCUMENT_KIND = "drawic-schematic" as const;

export type Rotation = 0 | 90 | 180 | 270;
export type SymbolSide = "north" | "east" | "south" | "west";

export interface Point {
  x: number;
  y: number;
}

export interface SymbolPin {
  key: string;
  role: string;
  side: SymbolSide;
}

export interface SymbolFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SymbolDefinition {
  id: string;
  label: string;
  category: string;
  electrical: boolean;
  palette: boolean;
  frame: SymbolFrame;
  pins: SymbolPin[];
  file: string;
  svgBody: string;
}

export interface ComponentNode {
  id: string;
  symbolId: string;
  reference: string;
  value: string;
  x: number;
  y: number;
  rotation: Rotation;
  mirrored: boolean;
}

export interface Wire {
  id: string;
  points: Point[];
}

export interface Annotation {
  id: string;
  kind: "text" | "net";
  text: string;
  x: number;
  y: number;
  size: number;
}

export interface SchematicCell {
  id: string;
  name: string;
  isTop: boolean;
  nodes: ComponentNode[];
  wires: Wire[];
  junctions: Point[];
  annotations: Annotation[];
}

export interface DrawicDocument {
  schemaVersion: typeof DOCUMENT_SCHEMA_VERSION;
  kind: typeof DOCUMENT_KIND;
  id: string;
  title: string;
  createdAt: string;
  modifiedAt: string;
  activeCellId: string;
  cells: SchematicCell[];
}

export type SelectionKind = "node" | "wire" | "annotation";

export interface SelectionRef {
  kind: SelectionKind;
  id: string;
}

export type DiagnosticSeverity = "error" | "warning";

export interface Diagnostic {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  cellId: string;
  itemId?: string;
}

export type ProjectValidation<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export class ProjectFormatError extends Error {
  readonly reason: string;

  constructor(reason: string, message: string) {
    super(message);
    this.name = "ProjectFormatError";
    this.reason = reason;
  }
}

export function createIdentifier(prefix: string): string {
  return `${prefix}_${globalThis.crypto.randomUUID()}`;
}

export function createEmptyCell(
  name = "Cell 1",
  isTop = true,
  id = createIdentifier("cell"),
): SchematicCell {
  return {
    id,
    name,
    isTop,
    nodes: [],
    wires: [],
    junctions: [],
    annotations: [],
  };
}

export function createDocument(options?: {
  title?: string;
  now?: string;
  id?: string;
  cellId?: string;
}): DrawicDocument {
  const now = options?.now ?? new Date().toISOString();
  const cell = createEmptyCell("Cell 1", true, options?.cellId ?? createIdentifier("cell"));
  return {
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    kind: DOCUMENT_KIND,
    id: options?.id ?? createIdentifier("project"),
    title: options?.title ?? "Untitled",
    createdAt: now,
    modifiedAt: now,
    activeCellId: cell.id,
    cells: [cell],
  };
}

export function activeCell(document: DrawicDocument): SchematicCell {
  const cell = document.cells.find((candidate) => candidate.id === document.activeCellId);
  if (!cell) {
    throw new ProjectFormatError("active-cell-missing", "The active cell does not exist.");
  }
  return cell;
}

export function touchDocument(
  document: DrawicDocument,
  now = new Date().toISOString(),
): DrawicDocument {
  return { ...document, modifiedAt: now };
}

export function replaceActiveCell(
  document: DrawicDocument,
  cell: SchematicCell,
  now = new Date().toISOString(),
): DrawicDocument {
  return touchDocument(
    {
      ...document,
      cells: document.cells.map((candidate) => (candidate.id === cell.id ? cell : candidate)),
    },
    now,
  );
}

export function selectionEquals(a: SelectionRef, b: SelectionRef): boolean {
  return a.kind === b.kind && a.id === b.id;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expectString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new ProjectFormatError("invalid-field", `${field} must be a string.`);
  }
  return value;
}

function expectFinite(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ProjectFormatError("invalid-field", `${field} must be a finite number.`);
  }
  return value;
}

function parsePoint(value: unknown, field: string): Point {
  if (!isRecord(value)) {
    throw new ProjectFormatError("invalid-field", `${field} must be a point.`);
  }
  return {
    x: expectFinite(value.x, `${field}.x`),
    y: expectFinite(value.y, `${field}.y`),
  };
}

function parseNode(value: unknown, index: number): ComponentNode {
  const field = `cells[].nodes[${index}]`;
  if (!isRecord(value)) {
    throw new ProjectFormatError("invalid-field", `${field} must be an object.`);
  }
  const rotation = expectFinite(value.rotation, `${field}.rotation`);
  if (![0, 90, 180, 270].includes(rotation)) {
    throw new ProjectFormatError("invalid-field", `${field}.rotation is not supported.`);
  }
  if (typeof value.mirrored !== "boolean") {
    throw new ProjectFormatError("invalid-field", `${field}.mirrored must be boolean.`);
  }
  return {
    id: expectString(value.id, `${field}.id`),
    symbolId: expectString(value.symbolId, `${field}.symbolId`),
    reference: expectString(value.reference, `${field}.reference`),
    value: expectString(value.value, `${field}.value`),
    x: expectFinite(value.x, `${field}.x`),
    y: expectFinite(value.y, `${field}.y`),
    rotation: rotation as Rotation,
    mirrored: value.mirrored,
  };
}

function parseWire(value: unknown, index: number): Wire {
  const field = `cells[].wires[${index}]`;
  if (!isRecord(value) || !Array.isArray(value.points)) {
    throw new ProjectFormatError("invalid-field", `${field} must contain a points array.`);
  }
  return {
    id: expectString(value.id, `${field}.id`),
    points: value.points.map((point, pointIndex) =>
      parsePoint(point, `${field}.points[${pointIndex}]`),
    ),
  };
}

function parseAnnotation(value: unknown, index: number): Annotation {
  const field = `cells[].annotations[${index}]`;
  if (!isRecord(value)) {
    throw new ProjectFormatError("invalid-field", `${field} must be an object.`);
  }
  if (value.kind !== "text" && value.kind !== "net") {
    throw new ProjectFormatError("invalid-field", `${field}.kind is not supported.`);
  }
  return {
    id: expectString(value.id, `${field}.id`),
    kind: value.kind,
    text: expectString(value.text, `${field}.text`),
    x: expectFinite(value.x, `${field}.x`),
    y: expectFinite(value.y, `${field}.y`),
    size: expectFinite(value.size, `${field}.size`),
  };
}

function parseCell(value: unknown, index: number): SchematicCell {
  const field = `cells[${index}]`;
  if (
    !isRecord(value) ||
    !Array.isArray(value.nodes) ||
    !Array.isArray(value.wires) ||
    !Array.isArray(value.junctions) ||
    !Array.isArray(value.annotations)
  ) {
    throw new ProjectFormatError("invalid-field", `${field} has an invalid shape.`);
  }
  if (typeof value.isTop !== "boolean") {
    throw new ProjectFormatError("invalid-field", `${field}.isTop must be boolean.`);
  }
  return {
    id: expectString(value.id, `${field}.id`),
    name: expectString(value.name, `${field}.name`),
    isTop: value.isTop,
    nodes: value.nodes.map(parseNode),
    wires: value.wires.map(parseWire),
    junctions: value.junctions.map((point, pointIndex) =>
      parsePoint(point, `${field}.junctions[${pointIndex}]`),
    ),
    annotations: value.annotations.map(parseAnnotation),
  };
}

export function parseProjectText(text: string): DrawicDocument {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ProjectFormatError("invalid-json", "This file is not valid JSON.");
  }

  if (!isRecord(raw)) {
    throw new ProjectFormatError("invalid-root", "The project root must be an object.");
  }
  if (raw.schemaVersion !== DOCUMENT_SCHEMA_VERSION) {
    if (typeof raw.schemaVersion === "number" && raw.schemaVersion > DOCUMENT_SCHEMA_VERSION) {
      throw new ProjectFormatError(
        "future-schema",
        "This project was created by a newer Drawic format and cannot be opened safely.",
      );
    }
    throw new ProjectFormatError(
      "unsupported-schema",
      "This project format version is not supported by Drawic 0.1.",
    );
  }
  if (raw.kind !== DOCUMENT_KIND) {
    throw new ProjectFormatError("invalid-kind", "This JSON file is not a Drawic schematic.");
  }
  if (!Array.isArray(raw.cells) || raw.cells.length === 0) {
    throw new ProjectFormatError("invalid-field", "The project must contain at least one cell.");
  }

  const document: DrawicDocument = {
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    kind: DOCUMENT_KIND,
    id: expectString(raw.id, "id"),
    title: expectString(raw.title, "title"),
    createdAt: expectString(raw.createdAt, "createdAt"),
    modifiedAt: expectString(raw.modifiedAt, "modifiedAt"),
    activeCellId: expectString(raw.activeCellId, "activeCellId"),
    cells: raw.cells.map(parseCell),
  };

  if (!document.cells.some((cell) => cell.id === document.activeCellId)) {
    throw new ProjectFormatError("active-cell-missing", "The active cell does not exist.");
  }
  if (document.cells.filter((cell) => cell.isTop).length !== 1) {
    throw new ProjectFormatError("top-cell-count", "Exactly one cell must be marked as Top.");
  }

  const ids = new Set<string>();
  for (const id of [
    document.id,
    ...document.cells.flatMap((cell) => [
      cell.id,
      ...cell.nodes.map((node) => node.id),
      ...cell.wires.map((wire) => wire.id),
      ...cell.annotations.map((annotation) => annotation.id),
    ]),
  ]) {
    if (ids.has(id)) {
      throw new ProjectFormatError("duplicate-id", `Duplicate stable identifier: ${id}`);
    }
    ids.add(id);
  }

  return document;
}

export function serializeProject(document: DrawicDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}
