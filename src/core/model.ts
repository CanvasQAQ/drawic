export const DOCUMENT_SCHEMA_VERSION = 2 as const;
export const DOCUMENT_KIND = "drawic-drawing" as const;

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
  x?: number;
  y?: number;
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
  viewBox?: string;
  labelAnchors?: {
    reference: { x: number; y: number; anchor: "start" | "middle" | "end" };
    value: { x: number; y: number; anchor: "start" | "middle" | "end" };
  };
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
  labelLayout?: Partial<Record<NodeLabelKind, NodeLabelLayout>>;
}

export type NodeLabelKind = "reference" | "value";

export interface NodeLabelLayout {
  offset: Point;
  hidden: boolean;
}

export interface ConnectionAnchor {
  deviceId: string;
  pinId: string;
}

export interface Wire {
  id: string;
  points: Point[];
  name?: string;
  startAnchor?: ConnectionAnchor;
  endAnchor?: ConnectionAnchor;
}

export interface Annotation {
  id: string;
  kind: "text" | "net";
  text: string;
  x: number;
  y: number;
  size: number;
  wireId?: string;
}

export type ShapeKind = "rectangle" | "ellipse";

export interface DrawingShape {
  id: string;
  kind: ShapeKind;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: Rotation;
  stroke: string;
  fill: string;
  text?: string;
}

export interface DrawingPage {
  id: string;
  name: string;
  nodes: ComponentNode[];
  wires: Wire[];
  junctions: Point[];
  annotations: Annotation[];
  shapes: DrawingShape[];
}

export interface DrawicDocument {
  schemaVersion: typeof DOCUMENT_SCHEMA_VERSION;
  kind: typeof DOCUMENT_KIND;
  id: string;
  title: string;
  createdAt: string;
  modifiedAt: string;
  pages: DrawingPage[];
}

export type SelectionKind =
  | "node"
  | "node-label"
  | "wire"
  | "junction"
  | "annotation"
  | "shape";

export interface SelectionRef {
  kind: SelectionKind;
  id: string;
  label?: NodeLabelKind;
}

export function junctionSelectionId(point: Point): string {
  return `junction:${point.x.toFixed(3)}:${point.y.toFixed(3)}`;
}

export function junctionPointFromSelectionId(id: string): Point | null {
  const [kind, x, y] = id.split(":");
  if (kind !== "junction" || x === undefined || y === undefined) {
    return null;
  }
  const point = { x: Number(x), y: Number(y) };
  return Number.isFinite(point.x) && Number.isFinite(point.y) ? point : null;
}

export type DiagnosticSeverity = "error" | "warning";

export interface Diagnostic {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  pageId: string;
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

export function defaultWireName(index: number): string {
  return `N${String(Math.max(1, index + 1)).padStart(3, "0")}`;
}

export function defaultNetName(index: number): string {
  return defaultWireName(index);
}

export function wireDisplayName(
  wire: Pick<Wire, "name">,
  index: number,
): string {
  return wire.name?.trim() || defaultWireName(index);
}

export function createEmptyPage(
  name = "Page 1",
  id = createIdentifier("page"),
): DrawingPage {
  return {
    id,
    name,
    nodes: [],
    wires: [],
    junctions: [],
    annotations: [],
    shapes: [],
  };
}

export function createDocument(options?: {
  title?: string;
  now?: string;
  id?: string;
  pageId?: string;
}): DrawicDocument {
  const now = options?.now ?? new Date().toISOString();
  const page = createEmptyPage("Page 1", options?.pageId ?? createIdentifier("page"));
  return {
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    kind: DOCUMENT_KIND,
    id: options?.id ?? createIdentifier("project"),
    title: options?.title ?? "Untitled",
    createdAt: now,
    modifiedAt: now,
    pages: [page],
  };
}

export function pageById(document: DrawicDocument, pageId: string): DrawingPage {
  const page = document.pages.find((candidate) => candidate.id === pageId);
  if (!page) {
    throw new ProjectFormatError("page-missing", "The selected page does not exist.");
  }
  return page;
}

export function touchDocument(
  document: DrawicDocument,
  now = new Date().toISOString(),
): DrawicDocument {
  return { ...document, modifiedAt: now };
}

export function replacePage(
  document: DrawicDocument,
  page: DrawingPage,
  now = new Date().toISOString(),
): DrawicDocument {
  if (!document.pages.some((candidate) => candidate.id === page.id)) {
    return document;
  }
  return touchDocument(
    {
      ...document,
      pages: document.pages.map((candidate) =>
        candidate.id === page.id ? page : candidate,
      ),
    },
    now,
  );
}

export function selectionEquals(a: SelectionRef, b: SelectionRef): boolean {
  return a.kind === b.kind && a.id === b.id && a.label === b.label;
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

function expectRotation(value: unknown, field: string): Rotation {
  const rotation = expectFinite(value, field);
  if (![0, 90, 180, 270].includes(rotation)) {
    throw new ProjectFormatError("invalid-field", `${field} is not supported.`);
  }
  return rotation as Rotation;
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

function parseAnchor(value: unknown, field: string): ConnectionAnchor | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new ProjectFormatError("invalid-field", `${field} must be a connection anchor.`);
  }
  return {
    deviceId: expectString(value.deviceId, `${field}.deviceId`),
    pinId: expectString(value.pinId, `${field}.pinId`),
  };
}

function parseNode(value: unknown, index: number): ComponentNode {
  const field = `pages[].nodes[${index}]`;
  if (!isRecord(value)) {
    throw new ProjectFormatError("invalid-field", `${field} must be an object.`);
  }
  if (typeof value.mirrored !== "boolean") {
    throw new ProjectFormatError("invalid-field", `${field}.mirrored must be boolean.`);
  }
  const labelLayout = parseNodeLabelLayout(value.labelLayout, `${field}.labelLayout`);
  return {
    id: expectString(value.id, `${field}.id`),
    symbolId: expectString(value.symbolId, `${field}.symbolId`),
    reference: expectString(value.reference, `${field}.reference`),
    value: expectString(value.value, `${field}.value`),
    x: expectFinite(value.x, `${field}.x`),
    y: expectFinite(value.y, `${field}.y`),
    rotation: expectRotation(value.rotation, `${field}.rotation`),
    mirrored: value.mirrored,
    ...(labelLayout ? { labelLayout } : {}),
  };
}

function parseNodeLabelLayout(
  value: unknown,
  field: string,
): ComponentNode["labelLayout"] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new ProjectFormatError("invalid-field", `${field} must be an object.`);
  }
  const result: NonNullable<ComponentNode["labelLayout"]> = {};
  for (const kind of ["reference", "value"] as const) {
    const candidate = value[kind];
    if (candidate === undefined) {
      continue;
    }
    if (!isRecord(candidate) || !isRecord(candidate.offset)) {
      throw new ProjectFormatError(
        "invalid-field",
        `${field}.${kind} must contain an offset and visibility.`,
      );
    }
    if (typeof candidate.hidden !== "boolean") {
      throw new ProjectFormatError(
        "invalid-field",
        `${field}.${kind}.hidden must be boolean.`,
      );
    }
    result[kind] = {
      offset: parsePoint(candidate.offset, `${field}.${kind}.offset`),
      hidden: candidate.hidden,
    };
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function parseWire(value: unknown, index: number): Wire {
  const field = `pages[].wires[${index}]`;
  if (!isRecord(value) || !Array.isArray(value.points)) {
    throw new ProjectFormatError("invalid-field", `${field} must contain a points array.`);
  }
  const startAnchor = parseAnchor(value.startAnchor, `${field}.startAnchor`);
  const endAnchor = parseAnchor(value.endAnchor, `${field}.endAnchor`);
  const name =
    value.name === undefined
      ? undefined
      : expectString(value.name, `${field}.name`);
  return {
    id: expectString(value.id, `${field}.id`),
    points: value.points.map((point, pointIndex) =>
      parsePoint(point, `${field}.points[${pointIndex}]`),
    ),
    ...(name ? { name } : {}),
    ...(startAnchor ? { startAnchor } : {}),
    ...(endAnchor ? { endAnchor } : {}),
  };
}

function parseAnnotation(value: unknown, index: number): Annotation {
  const field = `pages[].annotations[${index}]`;
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
    ...(value.wireId === undefined
      ? {}
      : { wireId: expectString(value.wireId, `${field}.wireId`) }),
  };
}

function parseShape(value: unknown, index: number): DrawingShape {
  const field = `pages[].shapes[${index}]`;
  if (!isRecord(value) || (value.kind !== "rectangle" && value.kind !== "ellipse")) {
    throw new ProjectFormatError("invalid-field", `${field} has an invalid shape.`);
  }
  return {
    id: expectString(value.id, `${field}.id`),
    kind: value.kind,
    x: expectFinite(value.x, `${field}.x`),
    y: expectFinite(value.y, `${field}.y`),
    width: expectFinite(value.width, `${field}.width`),
    height: expectFinite(value.height, `${field}.height`),
    rotation: expectRotation(value.rotation, `${field}.rotation`),
    stroke: expectString(value.stroke, `${field}.stroke`),
    fill: expectString(value.fill, `${field}.fill`),
    ...(value.text === undefined
      ? {}
      : { text: expectString(value.text, `${field}.text`) }),
  };
}

function parsePage(value: unknown, index: number): DrawingPage {
  const field = `pages[${index}]`;
  if (
    !isRecord(value) ||
    !Array.isArray(value.nodes) ||
    !Array.isArray(value.wires) ||
    !Array.isArray(value.junctions) ||
    !Array.isArray(value.annotations) ||
    !Array.isArray(value.shapes)
  ) {
    throw new ProjectFormatError("invalid-field", `${field} has an invalid shape.`);
  }
  return {
    id: expectString(value.id, `${field}.id`),
    name: expectString(value.name, `${field}.name`),
    nodes: value.nodes.map(parseNode),
    wires: value.wires.map(parseWire),
    junctions: value.junctions.map((point, pointIndex) =>
      parsePoint(point, `${field}.junctions[${pointIndex}]`),
    ),
    annotations: value.annotations.map(parseAnnotation),
    shapes: value.shapes.map(parseShape),
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
      "This project uses a retired Drawic format. Create a new Drawic 0.2 drawing.",
    );
  }
  if (raw.kind !== DOCUMENT_KIND) {
    throw new ProjectFormatError("invalid-kind", "This JSON file is not a Drawic drawing.");
  }
  if (!Array.isArray(raw.pages) || raw.pages.length === 0) {
    throw new ProjectFormatError("invalid-field", "The drawing must contain at least one page.");
  }

  const document: DrawicDocument = {
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    kind: DOCUMENT_KIND,
    id: expectString(raw.id, "id"),
    title: expectString(raw.title, "title"),
    createdAt: expectString(raw.createdAt, "createdAt"),
    modifiedAt: expectString(raw.modifiedAt, "modifiedAt"),
    pages: raw.pages.map(parsePage),
  };

  const ids = new Set<string>();
  for (const id of [
    document.id,
    ...document.pages.flatMap((page) => [
      page.id,
      ...page.nodes.map((node) => node.id),
      ...page.wires.map((wire) => wire.id),
      ...page.annotations.map((annotation) => annotation.id),
      ...page.shapes.map((shape) => shape.id),
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
