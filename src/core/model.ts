export const DOCUMENT_SCHEMA_VERSION = 3 as const;
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
  variantOf?: string;
  variantId?: string;
  label: string;
  category: string;
  electrical: boolean;
  palette: boolean;
  frame: SymbolFrame;
  selectionBox?: SymbolFrame;
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

export interface PinEndpoint {
  kind: "pin";
  deviceId: string;
  pinId: string;
}

export interface JunctionEndpoint {
  kind: "junction";
  junctionId: string;
}

export interface OpenEndpoint {
  kind: "open";
}

export type WireEndpoint = PinEndpoint | JunctionEndpoint | OpenEndpoint;

export function pinEndpoint(anchor: ConnectionAnchor): PinEndpoint {
  return { kind: "pin", deviceId: anchor.deviceId, pinId: anchor.pinId };
}

export function endpointAnchor(
  endpoint: WireEndpoint,
): ConnectionAnchor | undefined {
  return endpoint.kind === "pin"
    ? { deviceId: endpoint.deviceId, pinId: endpoint.pinId }
    : undefined;
}

export interface Wire {
  id: string;
  points: Point[];
  start: WireEndpoint;
  end: WireEndpoint;
}

export interface Junction {
  id: string;
  point: Point;
}

export interface Net {
  id: string;
  name?: string;
  wires: Wire[];
  junctions: Junction[];
}

export interface Annotation {
  id: string;
  kind: "text" | "net";
  text: string;
  x: number;
  y: number;
  size: number;
  wireId?: string;
  netId?: string;
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
  nets: Net[];
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

export function junctionSelectionId(junction: Pick<Junction, "id"> | string): string {
  return `junction:${typeof junction === "string" ? junction : junction.id}`;
}

export function junctionIdFromSelectionId(id: string): string | null {
  const [kind, junctionId] = id.split(":");
  if (kind !== "junction" || !junctionId) {
    return null;
  }
  return junctionId;
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

export function defaultNetName(index: number): string {
  return `N${String(Math.max(1, index + 1)).padStart(3, "0")}`;
}

export function createEmptyNet(
  id = createIdentifier("net"),
  name?: string,
): Net {
  return {
    id,
    ...(name ? { name } : {}),
    wires: [],
    junctions: [],
  };
}

export interface LocatedWire {
  net: Net;
  wire: Wire;
}

export interface LocatedJunction {
  net: Net;
  junction: Junction;
}

export function allWires(page: DrawingPage): LocatedWire[] {
  return page.nets.flatMap((net) =>
    net.wires.map((wire) => ({ net, wire })),
  );
}

export function allJunctions(page: DrawingPage): LocatedJunction[] {
  return page.nets.flatMap((net) =>
    net.junctions.map((junction) => ({ net, junction })),
  );
}

export function findWire(page: DrawingPage, wireId: string): LocatedWire | null {
  for (const net of page.nets) {
    const wire = net.wires.find((candidate) => candidate.id === wireId);
    if (wire) {
      return { net, wire };
    }
  }
  return null;
}

export function findJunction(
  page: DrawingPage,
  junctionId: string,
): LocatedJunction | null {
  for (const net of page.nets) {
    const junction = net.junctions.find(
      (candidate) => candidate.id === junctionId,
    );
    if (junction) {
      return { net, junction };
    }
  }
  return null;
}

export function createEmptyPage(
  name = "Page 1",
  id = createIdentifier("page"),
): DrawingPage {
  return {
    id,
    name,
    nodes: [],
    nets: [],
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

function parseWireEndpoint(value: unknown, field: string): WireEndpoint {
  if (!isRecord(value)) {
    throw new ProjectFormatError("invalid-field", `${field} must be a wire endpoint.`);
  }
  switch (value.kind) {
    case "pin":
      return {
        kind: "pin",
        deviceId: expectString(value.deviceId, `${field}.deviceId`),
        pinId: expectString(value.pinId, `${field}.pinId`),
      };
    case "junction":
      return {
        kind: "junction",
        junctionId: expectString(value.junctionId, `${field}.junctionId`),
      };
    case "open":
      return { kind: "open" };
    default:
      throw new ProjectFormatError(
        "invalid-field",
        `${field}.kind is not supported.`,
      );
  }
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
  const field = `pages[].nets[].wires[${index}]`;
  if (!isRecord(value) || !Array.isArray(value.points)) {
    throw new ProjectFormatError("invalid-field", `${field} must contain a points array.`);
  }
  if (value.points.length < 2) {
    throw new ProjectFormatError(
      "invalid-field",
      `${field}.points must contain at least two points.`,
    );
  }
  return {
    id: expectString(value.id, `${field}.id`),
    points: value.points.map((point, pointIndex) =>
      parsePoint(point, `${field}.points[${pointIndex}]`),
    ),
    start: parseWireEndpoint(value.start, `${field}.start`),
    end: parseWireEndpoint(value.end, `${field}.end`),
  };
}

function parseJunction(value: unknown, index: number): Junction {
  const field = `pages[].nets[].junctions[${index}]`;
  if (!isRecord(value)) {
    throw new ProjectFormatError("invalid-field", `${field} must be an object.`);
  }
  return {
    id: expectString(value.id, `${field}.id`),
    point: parsePoint(value.point, `${field}.point`),
  };
}

function parseNet(value: unknown, index: number): Net {
  const field = `pages[].nets[${index}]`;
  if (
    !isRecord(value) ||
    !Array.isArray(value.wires) ||
    !Array.isArray(value.junctions)
  ) {
    throw new ProjectFormatError(
      "invalid-field",
      `${field} must contain wires and junctions arrays.`,
    );
  }
  const junctionIds = new Set(
    value.junctions.map((junction, junctionIndex) => {
      if (!isRecord(junction)) {
        throw new ProjectFormatError(
          "invalid-field",
          `${field}.junctions[${junctionIndex}] must be an object.`,
        );
      }
      return expectString(
        junction.id,
        `${field}.junctions[${junctionIndex}].id`,
      );
    }),
  );
  const wires = value.wires.map(parseWire);
  for (const wire of wires) {
    for (const endpoint of [wire.start, wire.end]) {
      if (
        endpoint.kind === "junction" &&
        !junctionIds.has(endpoint.junctionId)
      ) {
        throw new ProjectFormatError(
          "invalid-field",
          `${field}.wires contains a reference to unknown junction ${endpoint.junctionId}.`,
        );
      }
    }
  }
  const name =
    value.name === undefined
      ? undefined
      : expectString(value.name, `${field}.name`).trim();
  return {
    id: expectString(value.id, `${field}.id`),
    ...(name ? { name } : {}),
    wires,
    junctions: value.junctions.map(parseJunction),
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
    ...(value.netId === undefined
      ? {}
      : { netId: expectString(value.netId, `${field}.netId`) }),
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
    !Array.isArray(value.nets) ||
    !Array.isArray(value.annotations) ||
    !Array.isArray(value.shapes)
  ) {
    throw new ProjectFormatError("invalid-field", `${field} has an invalid shape.`);
  }
  return {
    id: expectString(value.id, `${field}.id`),
    name: expectString(value.name, `${field}.name`),
    nodes: value.nodes.map(parseNode),
    nets: value.nets.map(parseNet),
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
      ...page.nets.map((net) => net.id),
      ...page.nets.flatMap((net) => net.wires.map((wire) => wire.id)),
      ...page.nets.flatMap((net) =>
        net.junctions.map((junction) => junction.id),
      ),
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
