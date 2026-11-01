import type { Point, SymbolSide } from "./model";

export const DEVICE_STROKE_WIDTH = 1.6;
export const MIN_DEVICE_FRAME_SIZE = 8;

interface DeviceShapeBase {
  id: string;
  strokeWidth?: number;
}

export interface DeviceLineShape extends DeviceShapeBase {
  kind: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface DevicePolylineShape extends DeviceShapeBase {
  kind: "polyline";
  points: Point[];
  closed?: boolean;
}

export interface DeviceRectShape extends DeviceShapeBase {
  kind: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DeviceCircleShape extends DeviceShapeBase {
  kind: "circle";
  cx: number;
  cy: number;
  r: number;
}

export interface DeviceEllipseShape extends DeviceShapeBase {
  kind: "ellipse";
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export interface DeviceArcShape extends DeviceShapeBase {
  kind: "arc";
  cx: number;
  cy: number;
  r: number;
  startAngle: number;
  endAngle: number;
}

export interface DeviceTextShape extends DeviceShapeBase {
  kind: "text";
  x: number;
  y: number;
  text: string;
  fontSize?: number;
  anchor?: "start" | "middle" | "end";
}

export type DeviceArtworkShape =
  | DeviceLineShape
  | DevicePolylineShape
  | DeviceRectShape
  | DeviceCircleShape
  | DeviceEllipseShape
  | DeviceArcShape
  | DeviceTextShape;

export interface DeviceFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DeviceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DevicePinLike {
  id: string;
  key: string;
  name: string;
  role: string;
  direction: SymbolSide;
  side: SymbolSide;
  x: number;
  y: number;
}

export interface DeviceArtworkValidationOptions {
  requireShapes?: boolean;
  pinGrid?: number;
  shapeGrid?: number;
  pinGridExemptIds?: ReadonlySet<string>;
}

/** Keep editable geometry on the artwork grid, including after resizing. */
export function snapArtworkShape(shape: DeviceArtworkShape): DeviceArtworkShape {
  const unit = (value: number) => Math.round(value);
  const size = (value: number) => Math.max(1, unit(value));
  switch (shape.kind) {
    case "line": return { ...shape, x1: unit(shape.x1), y1: unit(shape.y1), x2: unit(shape.x2), y2: unit(shape.y2) };
    case "polyline": return { ...shape, points: shape.points.map(point => ({ x: unit(point.x), y: unit(point.y) })) };
    case "rect": return { ...shape, x: unit(shape.x), y: unit(shape.y), width: size(shape.width), height: size(shape.height) };
    case "circle": return { ...shape, cx: unit(shape.cx), cy: unit(shape.cy), r: size(shape.r) };
    case "ellipse": return { ...shape, cx: unit(shape.cx), cy: unit(shape.cy), rx: size(shape.rx), ry: size(shape.ry) };
    case "arc": return { ...shape, cx: unit(shape.cx), cy: unit(shape.cy), r: size(shape.r) };
    case "text": return { ...shape, x: unit(shape.x), y: unit(shape.y) };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expectString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string.`);
  }
  return value;
}

function expectNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number.`);
  }
  return value;
}

function expectOptionalNumber(value: unknown, field: string): number | undefined {
  return value === undefined ? undefined : expectNumber(value, field);
}

export function formatArtworkNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error("Device artwork coordinates must be finite.");
  }
  const rounded = Math.round(value * 1000) / 1000;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

export function escapeSvgText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function arcPath(shape: DeviceArcShape): string {
  const startRadians = (shape.startAngle * Math.PI) / 180;
  const endRadians = (shape.endAngle * Math.PI) / 180;
  const start = {
    x: shape.cx + shape.r * Math.cos(startRadians),
    y: shape.cy + shape.r * Math.sin(startRadians),
  };
  const end = {
    x: shape.cx + shape.r * Math.cos(endRadians),
    y: shape.cy + shape.r * Math.sin(endRadians),
  };
  const largeArc = Math.abs(shape.endAngle - shape.startAngle) > 180 ? 1 : 0;
  const sweep = shape.endAngle >= shape.startAngle ? 1 : 0;
  return [
    `M ${formatArtworkNumber(start.x)} ${formatArtworkNumber(start.y)}`,
    `A ${formatArtworkNumber(shape.r)} ${formatArtworkNumber(shape.r)} 0 ${largeArc} ${sweep} ${formatArtworkNumber(end.x)} ${formatArtworkNumber(end.y)}`,
  ].join(" ");
}

function shapeMarkup(shape: DeviceArtworkShape): string {
  const strokeWidth =
    shape.strokeWidth === undefined
      ? DEVICE_STROKE_WIDTH
      : shape.strokeWidth;
  const stroke = ` stroke-width="${formatArtworkNumber(strokeWidth)}"`;
  switch (shape.kind) {
    case "line":
      return `<line x1="${formatArtworkNumber(shape.x1)}" y1="${formatArtworkNumber(shape.y1)}" x2="${formatArtworkNumber(shape.x2)}" y2="${formatArtworkNumber(shape.y2)}"${stroke}/>`;
    case "polyline": {
      const points = shape.points
        .map(
          (point) =>
            `${formatArtworkNumber(point.x)},${formatArtworkNumber(point.y)}`,
        )
        .join(" ");
      const tag = shape.closed ? "polygon" : "polyline";
      return `<${tag} points="${points}"${stroke}/>`;
    }
    case "rect":
      return `<rect x="${formatArtworkNumber(shape.x)}" y="${formatArtworkNumber(shape.y)}" width="${formatArtworkNumber(shape.width)}" height="${formatArtworkNumber(shape.height)}"${stroke}/>`;
    case "circle":
      return `<circle cx="${formatArtworkNumber(shape.cx)}" cy="${formatArtworkNumber(shape.cy)}" r="${formatArtworkNumber(shape.r)}"${stroke}/>`;
    case "ellipse":
      return `<ellipse cx="${formatArtworkNumber(shape.cx)}" cy="${formatArtworkNumber(shape.cy)}" rx="${formatArtworkNumber(shape.rx)}" ry="${formatArtworkNumber(shape.ry)}"${stroke}/>`;
    case "arc":
      return `<path d="${arcPath(shape)}"${stroke}/>`;
    case "text": {
      const fontSize = shape.fontSize ?? 10;
      const anchor = shape.anchor ?? "middle";
      return `<text x="${formatArtworkNumber(shape.x)}" y="${formatArtworkNumber(shape.y)}" font-size="${formatArtworkNumber(fontSize)}" text-anchor="${anchor}" fill="currentColor" stroke="none">${escapeSvgText(shape.text)}</text>`;
    }
  }
}

export function serializeDeviceArtwork(
  shapes: readonly DeviceArtworkShape[],
): string {
  if (shapes.length === 0) {
    return "";
  }
  return `<g fill="none" stroke="currentColor" stroke-linecap="butt" stroke-linejoin="miter">${shapes
    .map(shapeMarkup)
    .join("")}</g>`;
}

function parsePoint(value: unknown, field: string): Point {
  if (!isRecord(value)) {
    throw new Error(`${field} must be an object.`);
  }
  return {
    x: expectNumber(value.x, `${field}.x`),
    y: expectNumber(value.y, `${field}.y`),
  };
}

function parseShape(value: unknown, index: number): DeviceArtworkShape {
  const field = `artwork.shapes[${index}]`;
  if (!isRecord(value)) {
    throw new Error(`${field} must be an object.`);
  }
  const id = expectString(value.id, `${field}.id`);
  if (!id) {
    throw new Error(`${field}.id must not be empty.`);
  }
  const base = {
    id,
    ...(value.strokeWidth === undefined
      ? {}
      : { strokeWidth: expectNumber(value.strokeWidth, `${field}.strokeWidth`) }),
  };
  switch (value.kind) {
    case "line":
      return {
        ...base,
        kind: "line",
        x1: expectNumber(value.x1, `${field}.x1`),
        y1: expectNumber(value.y1, `${field}.y1`),
        x2: expectNumber(value.x2, `${field}.x2`),
        y2: expectNumber(value.y2, `${field}.y2`),
      };
    case "polyline": {
      if (!Array.isArray(value.points) || value.points.length < 2) {
        throw new Error(`${field}.points must contain at least two points.`);
      }
      return {
        ...base,
        kind: "polyline",
        points: value.points.map((point, pointIndex) =>
          parsePoint(point, `${field}.points[${pointIndex}]`),
        ),
        ...(value.closed === undefined
          ? {}
          : { closed: value.closed === true }),
      };
    }
    case "rect": {
      const width = expectNumber(value.width, `${field}.width`);
      const height = expectNumber(value.height, `${field}.height`);
      if (width <= 0 || height <= 0) {
        throw new Error(`${field} must have a positive size.`);
      }
      return {
        ...base,
        kind: "rect",
        x: expectNumber(value.x, `${field}.x`),
        y: expectNumber(value.y, `${field}.y`),
        width,
        height,
      };
    }
    case "circle": {
      const r = expectNumber(value.r, `${field}.r`);
      if (r <= 0) {
        throw new Error(`${field}.r must be positive.`);
      }
      return {
        ...base,
        kind: "circle",
        cx: expectNumber(value.cx, `${field}.cx`),
        cy: expectNumber(value.cy, `${field}.cy`),
        r,
      };
    }
    case "ellipse": {
      const rx = expectNumber(value.rx, `${field}.rx`);
      const ry = expectNumber(value.ry, `${field}.ry`);
      if (rx <= 0 || ry <= 0) {
        throw new Error(`${field} must have positive radii.`);
      }
      return {
        ...base,
        kind: "ellipse",
        cx: expectNumber(value.cx, `${field}.cx`),
        cy: expectNumber(value.cy, `${field}.cy`),
        rx,
        ry,
      };
    }
    case "arc": {
      const r = expectNumber(value.r, `${field}.r`);
      if (r <= 0) {
        throw new Error(`${field}.r must be positive.`);
      }
      return {
        ...base,
        kind: "arc",
        cx: expectNumber(value.cx, `${field}.cx`),
        cy: expectNumber(value.cy, `${field}.cy`),
        r,
        startAngle: expectNumber(value.startAngle, `${field}.startAngle`),
        endAngle: expectNumber(value.endAngle, `${field}.endAngle`),
      };
    }
    case "text": {
      const text = expectString(value.text, `${field}.text`);
      if (!text) {
        throw new Error(`${field}.text must not be empty.`);
      }
      const fontSize = expectOptionalNumber(value.fontSize, `${field}.fontSize`);
      const anchor = value.anchor;
      if (
        anchor !== undefined &&
        anchor !== "start" &&
        anchor !== "middle" &&
        anchor !== "end"
      ) {
        throw new Error(`${field}.anchor is invalid.`);
      }
      return {
        ...base,
        kind: "text",
        x: expectNumber(value.x, `${field}.x`),
        y: expectNumber(value.y, `${field}.y`),
        text,
        ...(fontSize === undefined ? {} : { fontSize }),
        ...(anchor === undefined ? {} : { anchor }),
      };
    }
    default:
      throw new Error(`${field}.kind is unsupported.`);
  }
}

export function parseDeviceArtworkShapes(
  value: unknown,
  field = "artwork.shapes",
): DeviceArtworkShape[] {
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array.`);
  }
  const shapes = value.map(parseShape);
  const ids = new Set<string>();
  for (const shape of shapes) {
    if (ids.has(shape.id)) {
      throw new Error(`${field} contains duplicate id ${shape.id}.`);
    }
    ids.add(shape.id);
  }
  if (shapes.length === 0) {
    throw new Error(`${field} must contain at least one shape.`);
  }
  return shapes;
}

function shapeInkBounds(shape: DeviceArtworkShape): DeviceBox {
  const stroke = (shape.strokeWidth ?? DEVICE_STROKE_WIDTH) / 2;
  switch (shape.kind) {
    case "line":
      return boxFromPoints(
        [
          { x: shape.x1, y: shape.y1 },
          { x: shape.x2, y: shape.y2 },
        ],
        stroke,
      );
    case "polyline":
      return boxFromPoints(shape.points, stroke);
    case "rect":
      return {
        x: shape.x - stroke,
        y: shape.y - stroke,
        width: shape.width + stroke * 2,
        height: shape.height + stroke * 2,
      };
    case "circle":
      return {
        x: shape.cx - shape.r - stroke,
        y: shape.cy - shape.r - stroke,
        width: shape.r * 2 + stroke * 2,
        height: shape.r * 2 + stroke * 2,
      };
    case "ellipse":
      return {
        x: shape.cx - shape.rx - stroke,
        y: shape.cy - shape.ry - stroke,
        width: shape.rx * 2 + stroke * 2,
        height: shape.ry * 2 + stroke * 2,
      };
    case "arc":
      return {
        x: shape.cx - shape.r - stroke,
        y: shape.cy - shape.r - stroke,
        width: shape.r * 2 + stroke * 2,
        height: shape.r * 2 + stroke * 2,
      };
    case "text": {
      const fontSize = shape.fontSize ?? 10;
      const width = Math.max(fontSize * 0.6, shape.text.length * fontSize * 0.6);
      const anchor = shape.anchor ?? "middle";
      const left =
        anchor === "start"
          ? shape.x
          : anchor === "end"
            ? shape.x - width
            : shape.x - width / 2;
      return {
        x: left,
        y: shape.y - fontSize,
        width,
        height: fontSize * 1.2,
      };
    }
  }
}

function boxFromPoints(points: readonly Point[], padding = 0): DeviceBox {  if (points.length === 0) {
    return { x: -padding, y: -padding, width: padding * 2, height: padding * 2 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return {
    x: minX - padding,
    y: minY - padding,
    width: Math.max(0, maxX - minX) + padding * 2,
    height: Math.max(0, maxY - minY) + padding * 2,
  };
}

export function unionBoxes(boxes: readonly DeviceBox[]): DeviceBox | null {
  if (boxes.length === 0) {
    return null;
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const box of boxes) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function artworkInkBounds(
  shapes: readonly DeviceArtworkShape[],
): DeviceBox | null {
  return unionBoxes(shapes.map(shapeInkBounds));
}

export function deviceShapeBounds(shape: DeviceArtworkShape): DeviceBox {
  return shapeInkBounds(shape);
}

export function pinAbsolutePoint(
  center: Point,
  pin: Pick<DevicePinLike, "x" | "y">,
): Point {
  return { x: center.x + pin.x, y: center.y + pin.y };
}

export function artworkFullBounds(
  shapes: readonly DeviceArtworkShape[],
  pins: readonly DevicePinLike[],
  center: Point,
): DeviceBox | null {
  const boxes = shapes.map(shapeInkBounds);
  for (const pin of pins) {
    const point = pinAbsolutePoint(center, pin);
    boxes.push({ x: point.x, y: point.y, width: 0, height: 0 });
  }
  return unionBoxes(boxes);
}

export function selectionBoxForArtwork(
  shapes: readonly DeviceArtworkShape[],
  pins: readonly DevicePinLike[],
  center: Point,
  padding = 2,
): DeviceBox {
  const bounds = artworkFullBounds(shapes, pins, center) ?? {
    x: center.x - 10,
    y: center.y - 10,
    width: 20,
    height: 20,
  };
  return {
    x: bounds.x - padding,
    y: bounds.y - padding,
    width: Math.max(4, bounds.width) + padding * 2,
    height: Math.max(4, bounds.height) + padding * 2,
  };
}

export function labelBoundsForArtwork(
  shapes: readonly DeviceArtworkShape[],
  center: Point,
): DeviceBox | null {
  return artworkInkBounds(shapes) ?? null;
}

export function defaultLabelAnchors(box: DeviceBox) {
  return {
    reference: {
      x: box.x + box.width + 6,
      y: box.y + box.height * 0.36,
      anchor: "start" as const,
    },
    value: {
      x: box.x + box.width + 6,
      y: box.y + box.height * 0.72,
      anchor: "start" as const,
    },
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function snapInsideGrid(
  value: number,
  min: number,
  max: number,
  grid: number,
): number {
  if (grid <= 0) {
    return clamp(value, min, max);
  }
  const minMultiple = Math.ceil(min / grid) * grid;
  const maxMultiple = Math.floor(max / grid) * grid;
  if (minMultiple > maxMultiple) {
    return clamp(value, min, max);
  }
  return clamp(Math.round(value / grid) * grid, minMultiple, maxMultiple);
}

export function snapPinToFrame(
  point: Point,
  frame: DeviceFrame,
  grid = 10,
): { x: number; y: number; direction: SymbolSide } {
  const left = frame.x;
  const right = frame.x + frame.width;
  const top = frame.y;
  const bottom = frame.y + frame.height;
  const distances: { side: SymbolSide; distance: number }[] = [
    { side: "west", distance: Math.abs(point.x - left) },
    { side: "east", distance: Math.abs(point.x - right) },
    { side: "north", distance: Math.abs(point.y - top) },
    { side: "south", distance: Math.abs(point.y - bottom) },
  ];
  distances.sort((leftDistance, rightDistance) => leftDistance.distance - rightDistance.distance);
  const side = distances[0]!.side;
  const x = snapInsideGrid(point.x, left, right, grid);
  const y = snapInsideGrid(point.y, top, bottom, grid);
  const center = {
    x: frame.x + frame.width / 2,
    y: frame.y + frame.height / 2,
  };
  const relativeX = x - center.x;
  const relativeY = y - center.y;
  return {
    x: relativeX === 0 ? 0 : relativeX,
    y: relativeY === 0 ? 0 : relativeY,
    direction: side,
  };
}

export function nextShapeId(shapes: readonly DeviceArtworkShape[]): string {
  const ids = new Set(shapes.map((shape) => shape.id));
  let index = shapes.length + 1;
  while (ids.has(`shape-${index}`)) {
    index += 1;
  }
  return `shape-${index}`;
}

export function nextPinId(pins: readonly DevicePinLike[]): string {
  const ids = new Set(pins.map((pin) => pin.id));
  let index = pins.length + 1;
  while (ids.has(`pin-${index}`)) {
    index += 1;
  }
  return `pin-${index}`;
}

export function moveShape(
  shape: DeviceArtworkShape,
  delta: Point,
): DeviceArtworkShape {
  switch (shape.kind) {
    case "line":
      return {
        ...shape,
        x1: shape.x1 + delta.x,
        y1: shape.y1 + delta.y,
        x2: shape.x2 + delta.x,
        y2: shape.y2 + delta.y,
      };
    case "polyline":
      return {
        ...shape,
        points: shape.points.map((point) => ({
          x: point.x + delta.x,
          y: point.y + delta.y,
        })),
      };
    case "rect":
      return { ...shape, x: shape.x + delta.x, y: shape.y + delta.y };
    case "circle":
    case "ellipse":
    case "arc":
      return { ...shape, cx: shape.cx + delta.x, cy: shape.cy + delta.y };
    case "text":
      return { ...shape, x: shape.x + delta.x, y: shape.y + delta.y };
  }
}

function scaleValue(value: number, origin: number, factor: number): number {
  return origin + (value - origin) * factor;
}

export function scaleShape(
  shape: DeviceArtworkShape,
  origin: Point,
  scaleX: number,
  scaleY: number,
): DeviceArtworkShape {
  switch (shape.kind) {
    case "line":
      return {
        ...shape,
        x1: scaleValue(shape.x1, origin.x, scaleX),
        y1: scaleValue(shape.y1, origin.y, scaleY),
        x2: scaleValue(shape.x2, origin.x, scaleX),
        y2: scaleValue(shape.y2, origin.y, scaleY),
      };
    case "polyline":
      return {
        ...shape,
        points: shape.points.map((point) => ({
          x: scaleValue(point.x, origin.x, scaleX),
          y: scaleValue(point.y, origin.y, scaleY),
        })),
      };
    case "rect":
      return {
        ...shape,
        x: scaleValue(shape.x, origin.x, scaleX),
        y: scaleValue(shape.y, origin.y, scaleY),
        width: Math.max(0.1, shape.width * scaleX),
        height: Math.max(0.1, shape.height * scaleY),
      };
    case "circle":
      return {
        ...shape,
        cx: scaleValue(shape.cx, origin.x, scaleX),
        cy: scaleValue(shape.cy, origin.y, scaleY),
        r: Math.max(0.1, shape.r * Math.max(scaleX, scaleY)),
      };
    case "ellipse":
      return {
        ...shape,
        cx: scaleValue(shape.cx, origin.x, scaleX),
        cy: scaleValue(shape.cy, origin.y, scaleY),
        rx: Math.max(0.1, shape.rx * scaleX),
        ry: Math.max(0.1, shape.ry * scaleY),
      };
    case "arc":
      return {
        ...shape,
        cx: scaleValue(shape.cx, origin.x, scaleX),
        cy: scaleValue(shape.cy, origin.y, scaleY),
        r: Math.max(0.1, shape.r * Math.max(scaleX, scaleY)),
      };
    case "text":
      return {
        ...shape,
        x: scaleValue(shape.x, origin.x, scaleX),
        y: scaleValue(shape.y, origin.y, scaleY),
        fontSize: Math.max(
          2,
          (shape.fontSize ?? 10) * Math.max(scaleX, scaleY),
        ),
      };
  }
}

export function translatePin(
  pin: DevicePinLike,
  delta: Point,
): DevicePinLike {
  return { ...pin, x: pin.x + delta.x, y: pin.y + delta.y };
}

export function validateDeviceArtwork(
  shapes: readonly DeviceArtworkShape[],
  pins: readonly DevicePinLike[],
  frame: DeviceFrame,
  options: DeviceArtworkValidationOptions = {},
): string[] {
  const errors: string[] = [];
  if (frame.width < MIN_DEVICE_FRAME_SIZE || frame.height < MIN_DEVICE_FRAME_SIZE) {
    errors.push(
      `Frame must be at least ${MIN_DEVICE_FRAME_SIZE} × ${MIN_DEVICE_FRAME_SIZE}.`,
    );
  }
  if ((options.requireShapes ?? true) && shapes.length === 0) {
    errors.push("Draw at least one artwork shape.");
  }
  if (pins.length === 0) {
    errors.push("Add at least one pin.");
  }
  const shapeIds = new Set<string>();
  for (const shape of shapes) {
    if (shapeIds.has(shape.id)) {
      errors.push(`Duplicate artwork shape id ${shape.id}.`);
    }
    shapeIds.add(shape.id);
    for (const value of shapeNumbers(shape)) {
      if (!Number.isFinite(value)) {
        errors.push(`Shape ${shape.id} has a non-finite coordinate.`);
        break;
      }
    }
    if (options.shapeGrid && shapeCoordinates(shape).some(value =>
      Math.abs(value / options.shapeGrid! - Math.round(value / options.shapeGrid!)) > 1e-6)) {
      errors.push(`Shape ${shape.id} must sit on the ${options.shapeGrid}-unit grid.`);
    }
  }
  const pinIds = new Set<string>();
  const pinPoints = new Set<string>();
  const halfWidth = frame.width / 2;
  const halfHeight = frame.height / 2;
  const pinGrid = options.pinGrid ?? 0;
  for (const pin of pins) {
    if (pinIds.has(pin.id)) {
      errors.push(`Duplicate pin id ${pin.id}.`);
    }
    pinIds.add(pin.id);
    if (!pin.id.trim()) {
      errors.push("Every pin needs an id.");
    }
    if (!pin.name.trim()) {
      errors.push(`Pin ${pin.id} needs a name.`);
    }
    if (
      !Number.isFinite(pin.x) ||
      !Number.isFinite(pin.y) ||
      Math.abs(pin.x) > halfWidth + 0.01 ||
      Math.abs(pin.y) > halfHeight + 0.01
    ) {
      errors.push(`Pin ${pin.id} is outside the frame.`);
    }
    if (
      pinGrid > 0 && !options.pinGridExemptIds?.has(pin.id) &&
      (Math.abs(pin.x / pinGrid - Math.round(pin.x / pinGrid)) > 1e-6 ||
        Math.abs(pin.y / pinGrid - Math.round(pin.y / pinGrid)) > 1e-6)
    ) {
      errors.push(`Pin ${pin.id} must sit on the ${pinGrid}-unit grid.`);
    }
    const pointKey = `${pin.x.toFixed(3)},${pin.y.toFixed(3)}`;
    if (pinPoints.has(pointKey)) {
      errors.push(`Pin ${pin.id} shares a contact point with another pin.`);
    }
    pinPoints.add(pointKey);
  }
  return errors;
}

function shapeCoordinates(shape: DeviceArtworkShape): number[] {
  if (shape.kind === "arc") return [shape.cx, shape.cy, shape.r];
  if (shape.kind === "text") return [shape.x, shape.y];
  return shapeNumbers(shape);
}

function shapeNumbers(shape: DeviceArtworkShape): number[] {
  switch (shape.kind) {
    case "line":
      return [shape.x1, shape.y1, shape.x2, shape.y2];
    case "polyline":
      return shape.points.flatMap((point) => [point.x, point.y]);
    case "rect":
      return [shape.x, shape.y, shape.width, shape.height];
    case "circle":
      return [shape.cx, shape.cy, shape.r];
    case "ellipse":
      return [shape.cx, shape.cy, shape.rx, shape.ry];
    case "arc":
      return [shape.cx, shape.cy, shape.r, shape.startAngle, shape.endAngle];
    case "text":
      return [shape.x, shape.y, shape.fontSize ?? 10];
  }
}
