import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { buildConnectivity, selectedNetworkIds } from "../../core/connectivity";
import {
  GRID_SIZE,
  distance,
  nodeBounds,
  nodeSelectionBounds,
  nodeLabelVisible,
  nodePinPosition,
  pointsEqual,
  roundToGrid,
  snapPoint,
  symbolLabelPosition,
  symbolTransform,
} from "../../core/geometry";
import {
  referenceFromRichTextRuns,
  richTextRunsForReference,
} from "../../core/richText";
import { routeWireGeometry } from "../../core/routing";
import {
  pathInkBounds,
  planNodeMove,
  resolveWirePoints,
} from "../../core/wireMotion";
import { wireHops, wireOverlaps, wirePathData } from "../../core/wireHops";
import {
  NOTE_PADDING,
  NOTE_TEXT_TOP,
  clampNoteTextOffset,
  layoutNoteRichText,
  noteContentHeight,
  type NoteTextOffset,
} from "../../core/noteText";
import {
  annotationTextRuns,
  runsToPlainText,
  shapeTextRuns,
  splitRichTextRunsByLine,
} from "../../core/textRuns";
import { resolvePaintOrder, type LayerDirection } from "../../core/zOrder";
import {
  effectiveNameFontSize,
  effectiveValueFontSize,
  labelTextBounds,
  translateNodeLabelLayouts,
} from "../../core/labels";
import type {
  Annotation,
  ComponentNode,
  ConnectionAnchor,
  DrawingPage,
  DrawingShape,
  DocumentTypography,
  Junction,
  NodeLabelKind,
  Point,
  Rotation,
  SelectionRef,
  ShapeKind,
  SymbolDefinition,
  Wire,
} from "../../core/model";
import {
  allJunctions,
  allWires,
  DEFAULT_ANNOTATION_TEXT_COLOR,
  DEFAULT_NET_LABEL_COLOR,
  DEFAULT_NOTE_FILL,
  DEFAULT_NOTE_FILL_OPACITY,
  DEFAULT_NOTE_HEIGHT,
  DEFAULT_NOTE_STROKE,
  DEFAULT_NOTE_STROKE_WIDTH,
  DEFAULT_NOTE_TEXT_COLOR,
  DEFAULT_NOTE_WIDTH,
  DEFAULT_SHAPE_STROKE_WIDTH,
  DEFAULT_SHAPE_TEXT_ALIGN,
  DEFAULT_SHAPE_TEXT_COLOR,
  DEFAULT_SHAPE_TEXT_SIZE,
  junctionSelectionId,
  NET_LABEL_BASELINE_OFFSET,
} from "../../core/model";
import type { EditorTool } from "./Toolbar";
import { CanvasRichTextInlineEditor } from "./CanvasRichTextInlineEditor";
import { ComponentTextLabel } from "./ComponentTextLabel";
import { ContextMenu, type ContextMenuEntry } from "./ContextMenu";
import { RichTextTspans } from "./RichTextTspans";
import { COLOR_SWATCHES, SHAPE_PALETTE } from "../quickPalette";

const BASE_WIDTH = 1600;
const BASE_HEIGHT = 1000;
const MIN_VIEW_WIDTH = 320;
const MAX_VIEW_WIDTH = 5200;
const RICH_INLINE_TOOLBAR_HEIGHT = 34;
// Toolbar plus one line box: enough for the 12px/1.35 editor text plus padding
// and the 1px border, so a single-line edit is never clipped.
const RICH_INLINE_TEXT_HEIGHT = 26;
const SNAP_PIXELS = 13;

function netLabelPoint(point: Point): Point {
  return { x: point.x, y: point.y - NET_LABEL_BASELINE_OFFSET };
}

export interface CanvasInlineEditingTarget {
  kind: "annotation" | "shape" | "node-label";
  id: string;
}

export interface Viewport {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SchematicCanvasProps {
  page: DrawingPage;
  typography?: DocumentTypography | undefined;
  library: readonly SymbolDefinition[];
  tool: EditorTool;
  placementSymbol: SymbolDefinition | null;
  selection: readonly SelectionRef[];
  onSelectionChange: (selection: SelectionRef[]) => void;
  onPlace: (point: Point, rotation: Rotation) => void;
  onDuplicateNode: (nodeId: string, delta: Point, rotation: Rotation) => void;
  onAddWire: (
    points: Point[],
    anchors?: {
      startAnchor?: ConnectionAnchor;
      endAnchor?: ConnectionAnchor;
    },
    junctionPoints?: Point[],
  ) => void;
  onUpdateWire: (wireId: string, points: Point[]) => void;
  onUpdateNode: (
    nodeId: string,
    patch: Partial<Pick<ComponentNode, "reference" | "value">>,
  ) => void;
  onMoveNodeLabel: (nodeId: string, label: NodeLabelKind, delta: Point) => void;
  onUpdateNodeReferenceLabel?: (
    nodeId: string,
    reference: string,
    runs: readonly import("../../core/model").RichTextRun[],
  ) => void;
  onAddJunction: (point: Point) => void;
  onAddAnnotation: (
    kind: Annotation["kind"],
    point: Point,
    wireId?: string,
  ) => void;
  onUpdateAnnotation: (
    annotationId: string,
    patch: Partial<
      Pick<
        Annotation,
        | "text"
        | "x"
        | "y"
        | "size"
        | "color"
        | "align"
        | "bold"
        | "italic"
        | "rotation"
        | "richText"
      >
    >,
  ) => void;
  onAddShape: (kind: ShapeKind, bounds: { x: number; y: number; width: number; height: number }) => void;
  onUpdateShape: (
    shapeId: string,
    patch: Partial<
      Pick<
        DrawingShape,
        | "x"
        | "y"
        | "width"
        | "height"
        | "text"
        | "stroke"
        | "fill"
        | "strokeWidth"
        | "dash"
        | "opacity"
        | "fillOpacity"
        | "textSize"
        | "textColor"
        | "textAlign"
        | "textBold"
        | "textOffset"
        | "richText"
      >
    >,
  ) => void;
  onMoveSelected: (delta: Point) => void;
  onReorderObjects: (direction: LayerDirection) => void;
  onDuplicateSelection: () => void;
  onDeleteSelection: () => void;
  initialEditAnnotationId?: string | null;
  onInitialEditConsumed?: (() => void) | undefined;
  initialEditShapeId?: string | null;
  onInitialEditShapeConsumed?: (() => void) | undefined;
  onNoteEditingFinished?: (() => void) | undefined;
  onTextEditingFinished?: (() => void) | undefined;
  onInlineEditingChange?: (target: CanvasInlineEditingTarget | null) => void;
}

interface DragState {
  origin: Point;
  current: Point;
  nodeIds: string[];
  delta: Point;
  duplicate: boolean;
}

interface MarqueeState {
  start: Point;
  current: Point;
  base: SelectionRef[];
}

interface ViewportMarqueeState {
  start: Point;
  current: Point;
}

interface WireDraft {
  start: Point;
  current: Point;
  startAnchor?: ConnectionAnchor;
  endAnchor?: ConnectionAnchor;
  startWireId?: string;
}

interface SegmentDrag {
  wire: Wire;
  segmentIndex: number;
  origin: Point;
  delta: Point;
}

interface LabelDragState {
  nodeId: string;
  label: NodeLabelKind;
  origin: Point;
  delta: Point;
}

interface AnnotationDragState {
  annotation: Annotation;
  origin: Point;
  delta: Point;
}

interface ShapeDragState {
  shape: DrawingShape;
  origin: Point;
  delta: Point;
}

type ShapeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

interface ShapeResizeModifiers {
  aspectRatio: boolean;
  fromCenter: boolean;
}

interface ShapeResizeState {
  shape: DrawingShape;
  corner: ShapeHandle;
  origin: Point;
  delta: Point;
  modifiers: ShapeResizeModifiers;
}

interface NoteTextDragState {
  shape: DrawingShape;
  origin: Point;
  startOffset: NoteTextOffset;
  offset: NoteTextOffset;
}

type InlineEditorState =
  | { kind: "annotation"; id: string; value: string }
  | { kind: "node-label"; nodeId: string; label: NodeLabelKind; value: string }
  | { kind: "shape"; id: string; value: string };

interface ShapeDraft {
  kind: ShapeKind;
  start: Point;
  current: Point;
  modifiers: {
    square: boolean;
    centered: boolean;
  };
}

function shapeDraftBounds(draft: ShapeDraft): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const dx = draft.current.x - draft.start.x;
  const dy = draft.current.y - draft.start.y;
  let width = Math.abs(dx);
  let height = Math.abs(dy);
  if (draft.modifiers.square) {
    width = Math.max(width, height);
    height = width;
  }
  if (draft.modifiers.centered) {
    width *= 2;
    height *= 2;
    return {
      x: draft.start.x - width / 2,
      y: draft.start.y - height / 2,
      width,
      height,
    };
  }
  return {
    x: dx >= 0 ? draft.start.x : draft.start.x - width,
    y: dy >= 0 ? draft.start.y : draft.start.y - height,
    width,
    height,
  };
}

interface PanState {
  clientX: number;
  clientY: number;
  view: Viewport;
}

interface SnapResult {
  point: Point;
  anchor?: ConnectionAnchor;
  wireId?: string;
}

function isSelected(
  selection: readonly SelectionRef[],
  kind: SelectionRef["kind"],
  id: string,
  label?: NodeLabelKind,
) {
  return selection.some(
    (item) => item.kind === kind && item.id === id && item.label === label,
  );
}

function selectionWith(
  selection: readonly SelectionRef[],
  item: SelectionRef,
  additive: boolean,
): SelectionRef[] {
  const exists = isSelected(selection, item.kind, item.id, item.label);
  if (additive) {
    return exists
      ? selection.filter(
          (entry) =>
            !(
              entry.kind === item.kind &&
              entry.id === item.id &&
              entry.label === item.label
            ),
        )
      : [...selection, item];
  }
  return exists ? [...selection] : [item];
}

function pathData(points: readonly Point[]): string {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function nearestPointOnWireSegments(
  point: Point,
  segments: ReadonlyArray<{ start: Point; end: Point }>,
): Point | null {
  let best: Point | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const segment of segments) {
    const dx = segment.end.x - segment.start.x;
    const dy = segment.end.y - segment.start.y;
    const lengthSquared = dx * dx + dy * dy;
    const ratio =
      lengthSquared === 0
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
      x: segment.start.x + ratio * dx,
      y: segment.start.y + ratio * dy,
    };
    const candidateDistance = distance(point, candidate);
    if (candidateDistance < bestDistance) {
      best = candidate;
      bestDistance = candidateDistance;
    }
  }
  return best;
}

function trySetPointerCapture(element: Element, pointerId: number): void {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // Synthetic events and already-released pointers do not own capture.
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function dragSegment(wire: Wire, segmentIndex: number, delta: Point): Point[] {
  const points = wire.points.map((point) => ({ ...point }));
  const start = points[segmentIndex];
  const end = points[segmentIndex + 1];
  if (!start || !end) {
    return points;
  }
  const startAnchored = segmentIndex === 0 && wire.start.kind !== "open";
  const endAnchored =
    segmentIndex === wire.points.length - 2 && wire.end.kind !== "open";
  if (start.y === end.y) {
    const y = roundToGrid(start.y + delta.y);
    if (startAnchored && endAnchored) {
      points.splice(segmentIndex + 1, 0, { x: start.x, y }, { x: end.x, y });
    } else if (startAnchored) {
      end.y = y;
      points.splice(segmentIndex + 1, 0, { x: start.x, y });
    } else if (endAnchored) {
      start.y = y;
      points.splice(segmentIndex + 1, 0, { x: end.x, y });
    } else {
      start.y = y;
      end.y = y;
    }
  } else if (start.x === end.x) {
    const x = roundToGrid(start.x + delta.x);
    if (startAnchored && endAnchored) {
      points.splice(segmentIndex + 1, 0, { x, y: start.y }, { x, y: end.y });
    } else if (startAnchored) {
      end.x = x;
      points.splice(segmentIndex + 1, 0, { x, y: start.y });
    } else if (endAnchored) {
      start.x = x;
      points.splice(segmentIndex + 1, 0, { x, y: end.y });
    } else {
      start.x = x;
      end.x = x;
    }
  }
  return points.filter((point, index) => {
    if (index === 0) {
      return true;
    }
    return !pointsEqual(points[index - 1]!, point, 0.01);
  });
}

export function zoomViewport(view: Viewport, center: Point, factor: number): Viewport {
  const width = clamp(view.width * factor, MIN_VIEW_WIDTH, MAX_VIEW_WIDTH);
  const scale = width / view.width;
  const height = view.height * scale;
  const ratioX = (center.x - view.x) / view.width;
  const ratioY = (center.y - view.y) / view.height;
  return {
    x: center.x - ratioX * width,
    y: center.y - ratioY * height,
    width,
    height,
  };
}

export function resizeViewportToElement(
  view: Viewport,
  previousSize: { width: number; height: number },
  nextSize: { width: number; height: number },
): Viewport {
  if (
    previousSize.width <= 0 ||
    previousSize.height <= 0 ||
    nextSize.width <= 0 ||
    nextSize.height <= 0
  ) {
    return view;
  }
  const center = {
    x: view.x + view.width / 2,
    y: view.y + view.height / 2,
  };
  const width = view.width * (nextSize.width / previousSize.width);
  const height = view.height * (nextSize.height / previousSize.height);
  return {
    x: center.x - width / 2,
    y: center.y - height / 2,
    width,
    height,
  };
}

export function fitViewportToAspect(view: Viewport, aspectRatio: number): Viewport {
  if (aspectRatio <= 0 || !Number.isFinite(aspectRatio)) {
    return view;
  }
  const center = {
    x: view.x + view.width / 2,
    y: view.y + view.height / 2,
  };
  const height = view.width / aspectRatio;
  return {
    x: view.x,
    y: center.y - height / 2,
    width: view.width,
    height,
  };
}

export function fitViewportToBounds(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  aspectRatio: number,
  padding = 64,
): Viewport {
  const contentWidth = Math.max(GRID_SIZE * 8, bounds.maxX - bounds.minX + padding * 2);
  const contentHeight = Math.max(GRID_SIZE * 8, bounds.maxY - bounds.minY + padding * 2);
  let width = contentWidth;
  let height = width / Math.max(0.1, aspectRatio);
  if (height < contentHeight) {
    height = contentHeight;
    width = height * aspectRatio;
  }
  width = Math.max(MIN_VIEW_WIDTH, width);
  height = width / Math.max(0.1, aspectRatio);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  return {
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
  };
}

export function focusViewportToMarquee(
  start: Point,
  current: Point,
  aspectRatio: number,
): Viewport {
  return fitViewportToBounds(
    {
      minX: Math.min(start.x, current.x),
      minY: Math.min(start.y, current.y),
      maxX: Math.max(start.x, current.x),
      maxY: Math.max(start.y, current.y),
    },
    aspectRatio,
    8,
  );
}

function pageBounds(
  page: DrawingPage,
  library: readonly SymbolDefinition[],
  typography?: DocumentTypography,
) {
  const symbols = new Map(library.map((symbol) => [symbol.id, symbol]));
  const nodeBoxes = page.nodes.flatMap((node) => {
    const symbol = symbols.get(node.symbolId);
    return symbol ? [nodeBounds(node, symbol)] : [];
  });
  const nodeLabelBoxes = page.nodes.flatMap((node) => {
    const symbol = symbols.get(node.symbolId);
    if (!symbol) {
      return [];
    }
    const boxes = [];
    if (
      symbol.referenceLabel !== false &&
      nodeLabelVisible(node, "reference") &&
      node.reference.trim()
    ) {
      const label = symbolLabelPosition(node, symbol, "reference");
      boxes.push(
        labelTextBounds(
          label.point,
          label.anchor,
          node.reference,
          effectiveNameFontSize(node.labelLayout?.reference, typography),
          true,
        ),
      );
    }
    if (nodeLabelVisible(node, "value") && node.value.trim()) {
      const label = symbolLabelPosition(node, symbol, "value");
      boxes.push(
        labelTextBounds(
          label.point,
          label.anchor,
          node.value,
          effectiveValueFontSize(node.labelLayout?.value, typography),
        ),
      );
    }
    return boxes;
  });
  const shapeBoxes = page.shapes.map(rotatedShapeBounds);
  const wireBoxes = allWires(page).flatMap(({ wire }) => {
    const points = resolveWirePoints(page, library, wire);
    const bounds = points ? pathInkBounds(points) : null;
    return bounds ? [bounds] : [];
  });
  const points = [
    ...allJunctions(page).map(({ junction }) => junction.point),
    ...page.annotations.flatMap((annotation) => {
      const lines = annotation.text.split(/\r?\n/);
      const width =
        Math.max(1, ...lines.map((line) => line.length)) * annotation.size * 0.62;
      const height = Math.max(1, lines.length) * annotation.size * 1.2;
      const origin = { x: annotation.x, y: annotation.y };
      return [
        { x: annotation.x, y: annotation.y },
        { x: annotation.x + width, y: annotation.y },
        { x: annotation.x + width, y: annotation.y - height },
        { x: annotation.x, y: annotation.y - height },
      ].map((corner) =>
        rotatePointAround(corner, origin, annotation.rotation ?? 0),
      );
    }),
  ];
  const boxes = [...nodeBoxes, ...nodeLabelBoxes, ...shapeBoxes, ...wireBoxes];
  if (boxes.length === 0 && points.length === 0) {
    return { minX: 0, minY: 0, maxX: BASE_WIDTH, maxY: BASE_HEIGHT };
  }
  return {
    minX: Math.min(...boxes.map((box) => box.minX), ...points.map((point) => point.x)),
    minY: Math.min(...boxes.map((box) => box.minY), ...points.map((point) => point.y)),
    maxX: Math.max(...boxes.map((box) => box.maxX), ...points.map((point) => point.x)),
    maxY: Math.max(...boxes.map((box) => box.maxY), ...points.map((point) => point.y)),
  };
}

function rotatedShapeBounds(shape: DrawingShape): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  const centerX = shape.x + shape.width / 2;
  const centerY = shape.y + shape.height / 2;
  const corners = [
    { x: shape.x, y: shape.y },
    { x: shape.x + shape.width, y: shape.y },
    { x: shape.x, y: shape.y + shape.height },
    { x: shape.x + shape.width, y: shape.y + shape.height },
  ].map((point) => {
    const x = point.x - centerX;
    const y = point.y - centerY;
    switch (shape.rotation) {
      case 0:
        return point;
      case 90:
        return { x: centerX - y, y: centerY + x };
      case 180:
        return { x: centerX - x, y: centerY - y };
      case 270:
        return { x: centerX + y, y: centerY - x };
    }
  });
  return {
    minX: Math.min(...corners.map((point) => point.x)),
    minY: Math.min(...corners.map((point) => point.y)),
    maxX: Math.max(...corners.map((point) => point.x)),
    maxY: Math.max(...corners.map((point) => point.y)),
  };
}

function rotatePointAround(point: Point, center: Point, rotation: Rotation): Point {
  const x = point.x - center.x;
  const y = point.y - center.y;
  switch (rotation) {
    case 0:
      return point;
    case 90:
      return { x: center.x - y, y: center.y + x };
    case 180:
      return { x: center.x - x, y: center.y - y };
    case 270:
      return { x: center.x + y, y: center.y - x };
  }
}

function resizeShape(
  shape: DrawingShape,
  handle: ShapeHandle,
  delta: Point,
  modifiers: ShapeResizeModifiers = { aspectRatio: false, fromCenter: false },
): Pick<DrawingShape, "x" | "y" | "width" | "height"> {
  let dx = delta.x;
  let dy = delta.y;
  switch (shape.rotation) {
    case 90:
      [dx, dy] = [dy, -dx];
      break;
    case 180:
      [dx, dy] = [-dx, -dy];
      break;
    case 270:
      [dx, dy] = [-dy, dx];
      break;
  }

  const west = handle.includes("w");
  const east = handle.includes("e");
  const north = handle.includes("n");
  const south = handle.includes("s");
  const hasHorizontal = west || east;
  const hasVertical = north || south;
  const centerX = shape.x + shape.width / 2;
  const centerY = shape.y + shape.height / 2;

  let width =
    shape.width +
    (east ? dx : west ? -dx : 0) * (modifiers.fromCenter ? 2 : 1);
  let height =
    shape.height +
    (south ? dy : north ? -dy : 0) * (modifiers.fromCenter ? 2 : 1);

  if (modifiers.aspectRatio && hasHorizontal && hasVertical) {
    const ratio = shape.width / shape.height;
    const scaleX = width / shape.width;
    const scaleY = height / shape.height;
    const scale =
      Math.abs(scaleX - 1) >= Math.abs(scaleY - 1) ? scaleX : scaleY;
    width = shape.width * scale;
    height = shape.height * scale;
  } else if (modifiers.aspectRatio && hasHorizontal) {
    height = width / (shape.width / shape.height);
  } else if (modifiers.aspectRatio && hasVertical) {
    width = height * (shape.width / shape.height);
  }

  width = Math.max(GRID_SIZE, width);
  height = Math.max(GRID_SIZE, height);

  const left = modifiers.fromCenter
    ? centerX - width / 2
    : west
      ? shape.x + shape.width - width
      : shape.x;
  const top = modifiers.fromCenter
    ? centerY - height / 2
    : north
      ? shape.y + shape.height - height
      : shape.y;

  const result = { x: left, y: top, width, height };
  if (modifiers.fromCenter || shape.rotation === 0 || (!hasHorizontal && !hasVertical)) {
    return result;
  }

  // Keep the opposite corner/edge anchored in world space after rotation.
  const fixedOld = {
    x: west ? shape.x + shape.width : east ? shape.x : centerX,
    y: north ? shape.y + shape.height : south ? shape.y : centerY,
  };
  const fixedNew = {
    x: west ? left + width : east ? left : left + width / 2,
    y: north ? top + height : south ? top : top + height / 2,
  };
  const oldCenter = { x: centerX, y: centerY };
  const newCenter = { x: left + width / 2, y: top + height / 2 };
  const worldOld = rotatePointAround(fixedOld, oldCenter, shape.rotation);
  const worldNew = rotatePointAround(fixedNew, newCenter, shape.rotation);
  return {
    ...result,
    x: left + worldOld.x - worldNew.x,
    y: top + worldOld.y - worldNew.y,
  };
}

function CanvasInlineEditor({
  x,
  y,
  width,
  height,
  value,
  multiline,
  onCommit,
  onCancel,
  onOutsidePointerDown,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  value: string;
  multiline: boolean;
  onCommit: (value: string) => void;
  onCancel: () => void;
  onOutsidePointerDown?: (() => void) | undefined;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const finish = (): void => {
    if (draft !== value) {
      onCommit(draft);
    } else {
      onCancel();
    }
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;
  const outsideRef = useRef(onOutsidePointerDown);
  outsideRef.current = onOutsidePointerDown;
  useEffect(() => {
    const handleOutsidePointerDown = (event: PointerEvent): void => {
      const target = event.target as Element | null;
      if (target?.closest?.(".canvas-inline-editor-object")) {
        return;
      }
      if (!target?.closest?.("svg.schematic-canvas")) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      finishRef.current();
      outsideRef.current?.();
    };
    window.addEventListener("pointerdown", handleOutsidePointerDown, true);
    return () =>
      window.removeEventListener("pointerdown", handleOutsidePointerDown, true);
  }, []);
  return (
    <foreignObject
      x={x}
      y={y}
      width={width}
      height={height}
      className="canvas-inline-editor-object"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="canvas-inline-editor">
        {multiline ? (
          <textarea
            autoFocus
            value={draft}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={finish}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Escape") {
                event.preventDefault();
                onCancel();
              } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
          />
        ) : (
          <input
            autoFocus
            value={draft}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={finish}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Escape") {
                event.preventDefault();
                onCancel();
              } else if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
          />
        )}
      </div>
    </foreignObject>
  );
}

export function SchematicCanvas({
  page,
  typography,
  library,
  tool,
  placementSymbol,
  selection,
  onSelectionChange,
  onPlace,
  onDuplicateNode,
  onAddWire,
  onUpdateWire,
  onUpdateNode,
  onMoveNodeLabel,
  onUpdateNodeReferenceLabel,
  onAddJunction,
  onAddAnnotation,
  onUpdateAnnotation,
  onAddShape,
  onUpdateShape,
  onMoveSelected,
  onReorderObjects,
  onDuplicateSelection,
  onDeleteSelection,
  initialEditAnnotationId,
  onInitialEditConsumed,
  initialEditShapeId,
  onInitialEditShapeConsumed,
  onNoteEditingFinished,
  onTextEditingFinished,
  onInlineEditingChange,
}: SchematicCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const viewportSizeRef = useRef<{ width: number; height: number } | null>(null);
  const viewportMarqueeRef = useRef<ViewportMarqueeState | null>(null);
  const viewportMoveCleanupRef = useRef<(() => void) | null>(null);
  const [view, setView] = useState<Viewport>({
    x: 0,
    y: 0,
    width: BASE_WIDTH,
    height: BASE_HEIGHT,
  });
  const [pointer, setPointer] = useState<Point>({ x: 0, y: 0 });
  const [drag, setDrag] = useState<DragState | null>(null);
  const [marquee, setMarquee] = useState<MarqueeState | null>(null);
  const [viewportMarquee, setViewportMarquee] =
    useState<ViewportMarqueeState | null>(null);
  const [wireDraft, setWireDraft] = useState<WireDraft | null>(null);
  const [segmentDrag, setSegmentDrag] = useState<SegmentDrag | null>(null);
  const [shapeDraft, setShapeDraft] = useState<ShapeDraft | null>(null);
  const [labelDrag, setLabelDrag] = useState<LabelDragState | null>(null);
  const [annotationDrag, setAnnotationDrag] = useState<AnnotationDragState | null>(null);
  const [shapeDrag, setShapeDrag] = useState<ShapeDragState | null>(null);
  const [shapeResize, setShapeResize] = useState<ShapeResizeState | null>(null);
  const [noteTextDrag, setNoteTextDrag] = useState<NoteTextDragState | null>(null);
  const [inlineEditor, setInlineEditor] = useState<InlineEditorState | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    selection: SelectionRef[];
  } | null>(null);
  const rightClickRef = useRef<{
    clientX: number;
    clientY: number;
    moved: boolean;
    target: SelectionRef | null;
  } | null>(null);

  useEffect(() => {
    onInlineEditingChange?.(
      inlineEditor === null
        ? null
        : inlineEditor.kind === "node-label"
          ? { kind: inlineEditor.kind, id: inlineEditor.nodeId }
          : { kind: inlineEditor.kind, id: inlineEditor.id },
    );
  }, [inlineEditor, onInlineEditingChange]);

  useEffect(() => {
    setContextMenu(null);
  }, [page.id]);
  const [gridVisible, setGridVisible] = useState(() => {
    try {
      return window.localStorage.getItem("drawic-canvas-grid") !== "off";
    } catch {
      return true;
    }
  });
  const [pan, setPan] = useState<PanState | null>(null);
  const [spacePressed, setSpacePressed] = useState(false);
  const [hovered, setHovered] = useState<SelectionRef | null>(null);
  const [duplicateSourceId, setDuplicateSourceId] = useState<string | null>(null);
  const [duplicatePointerActive, setDuplicatePointerActive] = useState(false);
  const [placementRotation, setPlacementRotation] = useState<Rotation>(0);
  const [duplicateRotationOffset, setDuplicateRotationOffset] = useState<Rotation>(0);
  const previousToolRef = useRef(tool);
  const activeDuplicateSourceId =
    tool === "duplicate" ? duplicateSourceId : null;
  const symbols = useMemo(() => new Map(library.map((symbol) => [symbol.id, symbol])), [library]);
  const netColorById = useMemo(
    () => new Map(page.nets.map((net) => [net.id, net.color])),
    [page.nets],
  );
  const consumedInitialEditRef = useRef<string | null>(null);
  const consumedInitialShapeEditRef = useRef<string | null>(null);
  const movingNodeIds = useMemo(
    () => new Set(drag && !drag.duplicate ? drag.nodeIds : []),
    [drag],
  );
  const displayPage = useMemo(
    () => {
      if (drag && !drag.duplicate) {
        return planNodeMove(page, library, movingNodeIds, drag.delta);
      }
      const sourceId = drag?.duplicate
        ? drag.nodeIds[0]
        : tool === "duplicate" && duplicatePointerActive
          ? activeDuplicateSourceId
          : null;
      const source = sourceId
        ? page.nodes.find((node) => node.id === sourceId)
        : undefined;
      const delta = drag?.duplicate
        ? drag.delta
        : source
          ? {
              x: snapPoint(pointer).x - source.x,
              y: snapPoint(pointer).y - source.y,
            }
          : { x: 0, y: 0 };
      return source
        ? {
            ...page,
            nodes: [
              ...page.nodes,
              translateNodeLabelLayouts(
                {
                  ...source,
                  id: `${source.id}__duplicate_preview`,
                  x: source.x + delta.x,
                  y: source.y + delta.y,
                  rotation: drag?.duplicate
                    ? source.rotation
                    : ((source.rotation + duplicateRotationOffset) % 360) as Rotation,
                },
                delta,
              ),
            ],
          }
        : page;
    },
    [
      drag,
      duplicatePointerActive,
      activeDuplicateSourceId,
      duplicateRotationOffset,
      library,
      movingNodeIds,
      page,
      pointer,
      tool,
    ],
  );
  const connectivity = useMemo(
    () => buildConnectivity(displayPage, library),
    [displayPage, library],
  );
  const wireSnapSegments = useMemo(
    () =>
      allWires(page).flatMap(({ wire }) => {
        const points = resolveWirePoints(page, library, wire);
        return points
          ? points.slice(0, -1).map((start, index) => ({
              wireId: wire.id,
              start,
              end: points[index + 1]!,
            }))
          : [];
      }),
    [library, page],
  );
  const hopPositions = useMemo(() => wireHops(connectivity), [connectivity]);
  const overlapRanges = useMemo(() => wireOverlaps(connectivity), [connectivity]);

  const highlightedNetworks = useMemo(() => {
    const networks = selectedNetworkIds(connectivity, selection);
    const relevant = hovered ? [...selection, hovered] : selection;
    for (const item of relevant) {
      if (item.kind !== "node") {
        continue;
      }
      const node = displayPage.nodes.find((candidate) => candidate.id === item.id);
      const symbol = node ? symbols.get(node.symbolId) : undefined;
      if (!node || !symbol) {
        continue;
      }
      symbol.pins.forEach((_pin, pinIndex) => {
        const network = connectivity.networkIdByPin.get(`pin:${node.id}:${pinIndex}`);
        if (network) {
          networks.add(network);
        }
      });
    }
    return networks;
  }, [connectivity, selection, hovered, displayPage.nodes, symbols]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;
      if (isTyping) {
        return;
      }
      if (event.code === "Space") {
        setSpacePressed(true);
        event.preventDefault();
      }
      if (event.key === "Escape") {
        setDrag(null);
        setMarquee(null);
        setViewportMarquee(null);
        viewportMarqueeRef.current = null;
        stopViewportMoveTracking();
        setWireDraft(null);
        setSegmentDrag(null);
        setShapeDraft(null);
        setLabelDrag(null);
        setAnnotationDrag(null);
        setShapeDrag(null);
        setShapeResize(null);
        setNoteTextDrag(null);
        setInlineEditor(null);
        setPan(null);
      } else if ((event.ctrlKey || event.metaKey) && event.key === "0") {
        event.preventDefault();
        setView({ x: 0, y: 0, width: BASE_WIDTH, height: BASE_HEIGHT });
      } else if (event.key.toLowerCase() === "r" && placementSymbol) {
        event.preventDefault();
        setPlacementRotation(
          ((placementRotation + 90) % 360) as Rotation,
        );
      } else if (
        event.key.toLowerCase() === "r" &&
        tool === "duplicate" &&
        activeDuplicateSourceId
      ) {
        event.preventDefault();
        setDuplicateRotationOffset(
          ((duplicateRotationOffset + 90) % 360) as Rotation,
        );
      } else if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        fitPageToContent();
      } else if (
        event.key.toLowerCase() === "g" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        const target = event.target as HTMLElement | null;
        if (
          target?.tagName === "INPUT" ||
          target?.tagName === "TEXTAREA" ||
          target?.tagName === "SELECT" ||
          target?.isContentEditable
        ) {
          return;
        }
        event.preventDefault();
        setGridVisible((visible) => !visible);
      }
    };
    const handleKeyUp = (event: KeyboardEvent): void => {
      if (event.code === "Space") {
        setSpacePressed(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [
    duplicateRotationOffset,
    activeDuplicateSourceId,
    page,
    placementRotation,
    placementSymbol,
    symbols,
    tool,
  ]);

  useEffect(() => {
    setWireDraft(null);
    setSegmentDrag(null);
    setShapeDraft(null);
    setLabelDrag(null);
    setAnnotationDrag(null);
    setShapeDrag(null);
    setShapeResize(null);
    setNoteTextDrag(null);
    setInlineEditor(null);
    setMarquee(null);
    setViewportMarquee(null);
    viewportMarqueeRef.current = null;
    stopViewportMoveTracking();
    setDuplicateSourceId(null);
    setDuplicatePointerActive(false);
    setDuplicateRotationOffset(0);
    setPlacementRotation(0);
  }, [page.id]);

  useEffect(() => {
    if (
      !initialEditAnnotationId ||
      consumedInitialEditRef.current === initialEditAnnotationId
    ) {
      return;
    }
    const annotation = page.annotations.find(
      (candidate) => candidate.id === initialEditAnnotationId,
    );
    if (!annotation) {
      return;
    }
    consumedInitialEditRef.current = initialEditAnnotationId;
    setInlineEditor({
      kind: "annotation",
      id: annotation.id,
      value: annotation.text,
    });
    onInitialEditConsumed?.();
  }, [initialEditAnnotationId, onInitialEditConsumed, page.annotations]);

  useEffect(() => {
    try {
      window.localStorage.setItem("drawic-canvas-grid", gridVisible ? "on" : "off");
    } catch {
      // Local storage is optional; keep the toggle working for this session.
    }
  }, [gridVisible]);

  useEffect(() => {
    if (
      !initialEditShapeId ||
      consumedInitialShapeEditRef.current === initialEditShapeId
    ) {
      return;
    }
    const shape = page.shapes.find(
      (candidate) => candidate.id === initialEditShapeId,
    );
    if (!shape) {
      return;
    }
    consumedInitialShapeEditRef.current = initialEditShapeId;
    setInlineEditor({
      kind: "shape",
      id: shape.id,
      value: shape.text ?? "",
    });
    onInitialEditShapeConsumed?.();
  }, [initialEditShapeId, onInitialEditShapeConsumed, page.shapes]);

  useEffect(() => {
    setPlacementRotation(0);
  }, [placementSymbol?.id]);

  useEffect(() => {
    const enteringDuplicate =
      tool === "duplicate" && previousToolRef.current !== "duplicate";
    previousToolRef.current = tool;
    if (tool !== "duplicate" || enteringDuplicate) {
      setDuplicateSourceId(null);
      setDuplicatePointerActive(false);
      setDuplicateRotationOffset(0);
    }
  }, [tool]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) {
      return;
    }
    const updateForSize = (width: number, height: number): void => {
      if (width <= 0 || height <= 0) {
        return;
      }
      const previousSize = viewportSizeRef.current;
      viewportSizeRef.current = { width, height };
      setView((current) =>
        previousSize
          ? resizeViewportToElement(current, previousSize, { width, height })
          : fitViewportToAspect(current, width / height),
      );
    };
    const initial = svg.getBoundingClientRect();
    updateForSize(initial.width, initial.height);

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry) {
          updateForSize(entry.contentRect.width, entry.contentRect.height);
        }
      });
      observer.observe(svg);
      return () => observer.disconnect();
    }

    const handleResize = (): void => {
      const rect = svg.getBoundingClientRect();
      updateForSize(rect.width, rect.height);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => stopViewportMoveTracking, []);

  function clientToSvg(event: { clientX: number; clientY: number }): Point {
    const svg = svgRef.current;
    if (!svg) {
      return { x: 0, y: 0 };
    }
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const matrix = svg.getScreenCTM();
    return matrix ? point.matrixTransform(matrix.inverse()) : { x: point.x, y: point.y };
  }

  function zoomAt(clientX: number, clientY: number, factor: number): void {
    const svg = svgRef.current;
    if (!svg) {
      return;
    }
    const center = clientToSvg({ clientX, clientY });
    setView((current) => zoomViewport(current, center, factor));
  }

  function zoomAtCanvasCenter(factor: number): void {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
  }

  function fitPageToContent(): void {
    const rect = svgRef.current?.getBoundingClientRect();
    const aspectRatio = rect?.width && rect.height ? rect.width / rect.height : BASE_WIDTH / BASE_HEIGHT;
    setView(fitViewportToBounds(pageBounds(page, library, typography), aspectRatio));
  }

  function snapWirePoint(point: Point): SnapResult {
    const svg = svgRef.current;
    const rect = svg?.getBoundingClientRect();
    const tolerance = rect?.width
      ? Math.max(8, (SNAP_PIXELS * view.width) / rect.width)
      : SNAP_PIXELS;
    let closestPin: { point: Point; anchor: ConnectionAnchor; distance: number } | null = null;
    for (const node of page.nodes) {
      const symbol = symbols.get(node.symbolId);
      if (!symbol) {
        continue;
      }
      for (let index = 0; index < symbol.pins.length; index += 1) {
        const pin = symbol.pins[index]!;
        const pinPoint = nodePinPosition(node, symbol, index);
        const candidateDistance = distance(point, pinPoint);
        if (
          candidateDistance <= tolerance &&
          (!closestPin || candidateDistance < closestPin.distance)
        ) {
          closestPin = {
            point: pinPoint,
            anchor: { deviceId: node.id, pinId: pin.key },
            distance: candidateDistance,
          };
        }
      }
    }
    if (closestPin) {
      return { point: closestPin.point, anchor: closestPin.anchor };
    }

    let closest: { point: Point; distance: number; wireId: string } | null = null;
    for (const segment of connectivity.segments) {
      const dx = segment.end.x - segment.start.x;
      const dy = segment.end.y - segment.start.y;
      let candidate: Point | null = null;
      if (Math.abs(dx) < 0.001) {
        if (Math.abs(point.x - segment.start.x) <= tolerance) {
          const minimumY = Math.min(segment.start.y, segment.end.y);
          const maximumY = Math.max(segment.start.y, segment.end.y);
          candidate = {
            x: segment.start.x,
            y: clamp(
              roundToGrid(clamp(point.y, minimumY, maximumY)),
              minimumY,
              maximumY,
            ),
          };
        }
      } else if (Math.abs(dy) < 0.001 && Math.abs(point.y - segment.start.y) <= tolerance) {
        const minimumX = Math.min(segment.start.x, segment.end.x);
        const maximumX = Math.max(segment.start.x, segment.end.x);
        candidate = {
          x: clamp(
            roundToGrid(clamp(point.x, minimumX, maximumX)),
            minimumX,
            maximumX,
          ),
          y: segment.start.y,
        };
      }
      if (candidate) {
        const candidateDistance = distance(point, candidate);
        if (candidateDistance <= tolerance && (!closest || candidateDistance < closest.distance)) {
          closest = {
            point: candidate,
            distance: candidateDistance,
            wireId: segment.wireId,
          };
        }
      }
    }
    return closest
      ? { point: { ...closest.point }, wireId: closest.wireId }
      : { point: snapPoint(point) };
  }

  function currentSnapTolerance(): number {
    const rect = svgRef.current?.getBoundingClientRect();
    return rect?.width
      ? Math.max(8, (SNAP_PIXELS * view.width) / rect.width)
      : SNAP_PIXELS;
  }

  function snapNodeOriginToWire(
    origin: Point,
    symbol: SymbolDefinition,
    rotation: Rotation,
  ): Point {
    const tolerance = currentSnapTolerance();
    const previewNode: ComponentNode = {
      id: "pin-wire-snap",
      symbolId: symbol.id,
      reference: "",
      value: "",
      x: origin.x,
      y: origin.y,
      rotation,
      mirrored: false,
    };
    let closest:
      | { pin: Point; contact: Point; distance: number }
      | undefined;
    for (let pinIndex = 0; pinIndex < symbol.pins.length; pinIndex += 1) {
      const pin = nodePinPosition(previewNode, symbol, pinIndex);
      const contact = nearestPointOnWireSegments(pin, wireSnapSegments);
      if (!contact) {
        continue;
      }
      const pinDistance = distance(pin, contact);
      if (pinDistance <= tolerance && (!closest || pinDistance < closest.distance)) {
        closest = { pin, contact, distance: pinDistance };
      }
    }
    return closest
      ? {
          x: origin.x + closest.contact.x - closest.pin.x,
          y: origin.y + closest.contact.y - closest.pin.y,
        }
      : origin;
  }

  function snapNodeMoveDelta(
    delta: Point,
    nodeIds: readonly string[],
  ): Point {
    const moving = new Set(nodeIds);
    const excludedWires = new Set(
      allWires(page)
        .filter(({ wire }) =>
          [wire.start, wire.end].some(
            (endpoint) =>
              endpoint.kind === "pin" && moving.has(endpoint.deviceId),
          ),
        )
        .map(({ wire }) => wire.id),
    );
    const tolerance = currentSnapTolerance();
    let closest:
      | { pin: Point; contact: Point; distance: number }
      | undefined;
    for (const node of page.nodes.filter((candidate) => moving.has(candidate.id))) {
      const symbol = symbols.get(node.symbolId);
      if (!symbol) {
        continue;
      }
      const movedNode: ComponentNode = {
        ...node,
        x: node.x + delta.x,
        y: node.y + delta.y,
      };
      for (let pinIndex = 0; pinIndex < symbol.pins.length; pinIndex += 1) {
        const pin = nodePinPosition(movedNode, symbol, pinIndex);
        const contact = nearestPointOnWireSegments(
          pin,
          wireSnapSegments.filter(
            (segment) => !excludedWires.has(segment.wireId),
          ),
        );
        if (!contact) {
          continue;
        }
        const pinDistance = distance(pin, contact);
        if (pinDistance <= tolerance && (!closest || pinDistance < closest.distance)) {
          closest = { pin, contact, distance: pinDistance };
        }
      }
    }
    return closest
      ? {
          x: delta.x + closest.contact.x - closest.pin.x,
          y: delta.y + closest.contact.y - closest.pin.y,
        }
      : delta;
  }

  function finishWire(
    current: Point,
    endAnchor?: ConnectionAnchor,
    endWireId?: string,
  ): void {
    if (!wireDraft) {
      return;
    }
    if (!pointsEqual(wireDraft.start, current, 0.1)) {
      onAddWire(
        routeWireGeometry(
          page,
          library,
          wireDraft.start,
          current,
          wireDraft.startAnchor,
          endAnchor,
        ),
        {
          ...(wireDraft.startAnchor ? { startAnchor: wireDraft.startAnchor } : {}),
          ...(endAnchor ? { endAnchor } : {}),
        },
        [
          ...(wireDraft.startWireId ? [wireDraft.start] : []),
          ...(endWireId ? [current] : []),
        ],
      );
    }
    setWireDraft(null);
  }

  function beginWireAt(point: Point): void {
    const snapped = snapWirePoint(point);
    if (wireDraft) {
      finishWire(snapped.point, snapped.anchor, snapped.wireId);
      return;
    }
    setWireDraft({
      start: snapped.point,
      current: snapped.point,
      ...(snapped.anchor ? { startAnchor: snapped.anchor } : {}),
      ...(snapped.wireId ? { startWireId: snapped.wireId } : {}),
    });
  }

  function beginPinPointer(
    event: ReactPointerEvent<SVGGElement>,
    node: ComponentNode,
    pinIndex: number,
  ): void {
    if (event.button !== 0 || spacePressed) {
      return;
    }
    const symbol = symbols.get(node.symbolId);
    if (!symbol) {
      return;
    }
    const point = nodePinPosition(node, symbol, pinIndex);
    if (placementSymbol) {
      event.stopPropagation();
      onPlace(
        snapNodeOriginToWire(point, placementSymbol, placementRotation),
        placementRotation,
      );
      return;
    }
    if (tool === "wire") {
      event.stopPropagation();
      const anchor = { deviceId: node.id, pinId: symbol.pins[pinIndex]!.key };
      if (wireDraft) {
        finishWire(point, anchor);
      } else {
        setWireDraft({ start: point, current: point, startAnchor: anchor });
      }
    }
  }

  function beginNodePointer(event: ReactPointerEvent<SVGGElement>, nodeId: string): void {
    if (event.button !== 0 || spacePressed) {
      return;
    }
    event.stopPropagation();
    const point = clientToSvg(event);
    if (placementSymbol) {
      onPlace(
        snapNodeOriginToWire(
          snapPoint(point),
          placementSymbol,
          placementRotation,
        ),
        placementRotation,
      );
      return;
    }
    if (tool === "rectangle" || tool === "ellipse" || tool === "note") {
      beginShapeDraftFor(tool, event, point);
      return;
    }
    if (tool === "wire") {
      beginWireAt(point);
      return;
    }
    if (tool === "junction") {
      onAddJunction(snapPoint(point));
      return;
    }
    if (tool === "net-label") {
      const snapped = snapWirePoint(point);
      if (snapped.wireId) {
        onAddAnnotation("net", netLabelPoint(snapped.point), snapped.wireId);
      }
      return;
    }
    if (tool === "text") {
      onAddAnnotation("text", snapPoint(point));
      return;
    }
    if (tool === "duplicate") {
      if (!activeDuplicateSourceId) {
        setDuplicateSourceId(nodeId);
        onSelectionChange([{ kind: "node", id: nodeId }]);
        return;
      }
      const source = page.nodes.find(
        (candidate) => candidate.id === activeDuplicateSourceId,
      );
      if (source) {
        const snapped = snapPoint(point);
        onDuplicateNode(activeDuplicateSourceId, {
          x: snapped.x - source.x,
          y: snapped.y - source.y,
        }, ((source.rotation + duplicateRotationOffset) % 360) as Rotation);
        setDuplicateSourceId(null);
      }
      return;
    }
    if (tool !== "select") {
      return;
    }
    const additive = event.shiftKey;
    const item: SelectionRef = { kind: "node", id: nodeId };
    const priorSelected = isSelected(selection, "node", nodeId);
    const next = selectionWith(selection, item, additive);
    onSelectionChange(next);
    if (additive && priorSelected) {
      return;
    }
    const nodeIds =
      additive || priorSelected
        ? next.filter((entry) => entry.kind === "node").map((entry) => entry.id)
        : [nodeId];
    trySetPointerCapture(event.currentTarget, event.pointerId);
    setDrag({
      origin: point,
      current: point,
      nodeIds: event.ctrlKey || event.metaKey ? [nodeId] : nodeIds,
      delta: { x: 0, y: 0 },
      duplicate: event.ctrlKey || event.metaKey,
    });
  }

  function beginSegmentDrag(
    event: ReactPointerEvent<SVGCircleElement>,
    wire: Wire,
    segmentIndex: number,
  ): void {
    event.stopPropagation();
    trySetPointerCapture(event.currentTarget, event.pointerId);
    setSegmentDrag({
      wire,
      segmentIndex,
      origin: clientToSvg(event),
      delta: { x: 0, y: 0 },
    });
  }

  function beginNodeLabelPointer(
    event: ReactPointerEvent<SVGTextElement>,
    nodeId: string,
    label: NodeLabelKind,
  ): void {
    if (event.button !== 0 || spacePressed) {
      return;
    }
    if (tool !== "select" || placementSymbol) {
      return;
    }
    event.stopPropagation();
    const item: SelectionRef = { kind: "node-label", id: nodeId, label };
    const next = selectionWith(selection, item, event.shiftKey);
    onSelectionChange(next);
    if (event.shiftKey && isSelected(selection, "node-label", nodeId, label)) {
      return;
    }
    trySetPointerCapture(event.currentTarget, event.pointerId);
    setLabelDrag({
      nodeId,
      label,
      origin: clientToSvg(event),
      delta: { x: 0, y: 0 },
    });
  }

  function beginAnnotationPointer(
    event: ReactPointerEvent<SVGTextElement>,
    annotation: Annotation,
  ): void {
    if (event.button !== 0 || spacePressed || tool !== "select" || placementSymbol) {
      return;
    }
    event.stopPropagation();
    const item: SelectionRef = { kind: "annotation", id: annotation.id };
    const next = selectionWith(selection, item, event.shiftKey);
    onSelectionChange(next);
    if (event.shiftKey && isSelected(selection, "annotation", annotation.id)) {
      return;
    }
    trySetPointerCapture(event.currentTarget, event.pointerId);
    setAnnotationDrag({
      annotation,
      origin: clientToSvg(event),
      delta: { x: 0, y: 0 },
    });
  }

  function beginShapeDraftFor(
    kind: ShapeKind,
    event: ReactPointerEvent<Element>,
    point: Point,
  ): void {
    trySetPointerCapture(event.currentTarget, event.pointerId);
    const snapped = snapPoint(point);
    setShapeDraft({
      kind,
      start: snapped,
      current: snapped,
      modifiers: { square: event.shiftKey, centered: event.altKey },
    });
  }

  function beginShapePointer(
    event: ReactPointerEvent<SVGGElement>,
    shape: DrawingShape,
  ): void {
    if (event.button !== 0 || spacePressed || tool !== "select" || placementSymbol) {
      return;
    }
    event.stopPropagation();
    const item: SelectionRef = { kind: "shape", id: shape.id };
    const next = selectionWith(selection, item, event.shiftKey);
    onSelectionChange(next);
    if (event.shiftKey && isSelected(selection, "shape", shape.id)) {
      return;
    }
    trySetPointerCapture(event.currentTarget, event.pointerId);
    setShapeDrag({
      shape,
      origin: clientToSvg(event),
      delta: { x: 0, y: 0 },
    });
  }

  function beginNoteTextPointer(
    event: ReactPointerEvent<SVGTextElement>,
    shape: DrawingShape,
  ): void {
    if (event.button !== 0 || spacePressed || tool !== "select" || placementSymbol) {
      return;
    }
    event.stopPropagation();
    const item: SelectionRef = { kind: "shape", id: shape.id };
    const next = selectionWith(selection, item, event.shiftKey);
    onSelectionChange(next);
    if (event.shiftKey && isSelected(selection, "shape", shape.id)) {
      return;
    }
    trySetPointerCapture(event.currentTarget, event.pointerId);
    const startOffset = shape.textOffset ?? { x: 0, y: 0 };
    setNoteTextDrag({
      shape,
      origin: clientToSvg(event),
      startOffset,
      offset: startOffset,
    });
  }

  function beginShapeResize(
    event: ReactPointerEvent<SVGRectElement>,
    shape: DrawingShape,
    handle: ShapeHandle,
  ): void {
    event.stopPropagation();
    trySetPointerCapture(event.currentTarget, event.pointerId);
    setShapeResize({
      shape,
      corner: handle,
      origin: clientToSvg(event),
      delta: { x: 0, y: 0 },
      modifiers: {
        aspectRatio: event.shiftKey,
        fromCenter: event.altKey,
      },
    });
  }

  function beginJunctionPointer(
    event: ReactPointerEvent<SVGGElement>,
    junction: Junction,
  ): void {
    if (event.button !== 0 || spacePressed || tool !== "select") {
      return;
    }
    event.stopPropagation();
    const item: SelectionRef = {
      kind: "junction",
      id: junctionSelectionId(junction),
    };
    onSelectionChange(selectionWith(selection, item, event.shiftKey));
  }

  /** Maps a DOM target back to the selectable object that owns it. */
  function selectionRefFromTarget(target: EventTarget | null): SelectionRef | null {
    if (!(target instanceof Element)) {
      return null;
    }
    const nodeElement = target.closest("[data-node-id]");
    if (nodeElement) {
      return { kind: "node", id: nodeElement.getAttribute("data-node-id") ?? "" };
    }
    const shapeElement = target.closest("[data-shape-id]");
    if (shapeElement) {
      return { kind: "shape", id: shapeElement.getAttribute("data-shape-id") ?? "" };
    }
    const annotationElement = target.closest("[data-annotation-id]");
    if (annotationElement) {
      return {
        kind: "annotation",
        id: annotationElement.getAttribute("data-annotation-id") ?? "",
      };
    }
    const wireElement = target.closest("[data-wire-id]");
    if (wireElement) {
      return { kind: "wire", id: wireElement.getAttribute("data-wire-id") ?? "" };
    }
    const junctionElement = target.closest("[data-junction-id]");
    if (junctionElement) {
      return {
        kind: "junction",
        id: junctionElement.getAttribute("data-junction-id") ?? "",
      };
    }
    return null;
  }

  function openContextMenuAt(
    clientX: number,
    clientY: number,
    target: SelectionRef | null,
  ): void {
    if (!target) {
      return;
    }
    const alreadySelected = selection.some(
      (item) => item.kind === target.kind && item.id === target.id,
    );
    const nextSelection = alreadySelected ? [...selection] : [target];
    if (!alreadySelected) {
      onSelectionChange(nextSelection);
    }
    setWireDraft(null);
    setShapeDraft(null);
    setAnnotationDrag(null);
    setShapeDrag(null);
    setShapeResize(null);
    setNoteTextDrag(null);
    setInlineEditor(null);
    setContextMenu({ x: clientX, y: clientY, selection: nextSelection });
  }

  function contextMenuEntriesFor(
    menuSelection: readonly SelectionRef[],
  ): ContextMenuEntry[] {
    const order = resolvePaintOrder(page).map((entry) => entry.id);
    const ids = menuSelection
      .filter(
        (item) =>
          item.kind === "node" ||
          item.kind === "wire" ||
          item.kind === "annotation" ||
          item.kind === "shape",
      )
      .map((item) => item.id);
    const indexes = ids
      .map((id) => order.indexOf(id))
      .filter((index) => index >= 0);
    const lowest = indexes.length > 0 ? Math.min(...indexes) : -1;
    const highest = indexes.length > 0 ? Math.max(...indexes) : -1;
    const shapeIds = menuSelection
      .filter((item) => item.kind === "shape")
      .map((item) => item.id);
    const textIds = menuSelection
      .filter(
        (item) =>
          item.kind === "annotation" &&
          page.annotations.find((annotation) => annotation.id === item.id)
            ?.kind === "text",
      )
      .map((item) => item.id);
    const duplicable =
      menuSelection.some((item) => item.kind === "node" || item.kind === "shape") ||
      textIds.length > 0;

    const entries: ContextMenuEntry[] = [
      {
        kind: "item",
        id: "front",
        label: "Bring to front",
        disabled: ids.length === 0 || highest >= order.length - 1,
        onSelect: () => onReorderObjects("front"),
      },
      {
        kind: "item",
        id: "forward",
        label: "Bring forward",
        disabled: ids.length !== 1 || highest >= order.length - 1,
        onSelect: () => onReorderObjects("forward"),
      },
      {
        kind: "item",
        id: "backward",
        label: "Send backward",
        disabled: ids.length !== 1 || lowest <= 0,
        onSelect: () => onReorderObjects("backward"),
      },
      {
        kind: "item",
        id: "back",
        label: "Send to back",
        disabled: ids.length === 0 || lowest <= 0,
        onSelect: () => onReorderObjects("back"),
      },
      "separator",
      {
        kind: "item",
        id: "duplicate",
        label: "Duplicate",
        disabled: !duplicable,
        onSelect: () => onDuplicateSelection(),
      },
      {
        kind: "item",
        id: "delete",
        label: "Delete",
        onSelect: () => onDeleteSelection(),
      },
    ];

    if (shapeIds.length > 0) {
      entries.push("separator", {
        kind: "swatches",
        id: "shape-palette",
        label: "Quick colors",
        colors: SHAPE_PALETTE.map((preset) => ({
          value: preset.fill,
          label: preset.label,
        })),
        onSelect: (fill) => {
          const preset = SHAPE_PALETTE.find((candidate) => candidate.fill === fill);
          if (!preset) {
            return;
          }
          for (const id of shapeIds) {
            onUpdateShape(id, {
              fill: preset.fill,
              stroke: preset.stroke,
              textColor: preset.text,
            });
          }
        },
      });
    }
    if (textIds.length > 0) {
      entries.push("separator", {
        kind: "swatches",
        id: "text-palette",
        label: "Text colors",
        colors: COLOR_SWATCHES,
        onSelect: (color) => {
          for (const id of textIds) {
            onUpdateAnnotation(id, { color });
          }
        },
      });
    }
    return entries;
  }

  function beginCanvasPointer(event: ReactPointerEvent<SVGSVGElement>): void {
    if ((event.target as Element).closest?.(".canvas-inline-editor-object")) {
      return;
    }
    if (inlineEditor) {
      return;
    }
    const point = clientToSvg(event);
    setPointer(point);
    if (event.button === 1 || spacePressed) {
      event.preventDefault();
      trySetPointerCapture(event.currentTarget, event.pointerId);
      setPan({
        clientX: event.clientX,
        clientY: event.clientY,
        view,
      });
      return;
    }
    if (event.button === 2) {
      event.preventDefault();
      setContextMenu(null);
      const target = selectionRefFromTarget(event.target);
      if (target) {
        // Remember the press so a stationary right-click can open the object
        // menu on release; a right-drag keeps its viewport behavior.
        rightClickRef.current = {
          clientX: event.clientX,
          clientY: event.clientY,
          moved: false,
          target,
        };
        return;
      }
      rightClickRef.current = null;
      trySetPointerCapture(event.currentTarget, event.pointerId);
      const next = { start: point, current: point };
      viewportMarqueeRef.current = next;
      setViewportMarquee(next);
      stopViewportMoveTracking();
      const handleMouseMove = (moveEvent: MouseEvent): void => {
        updateViewportMarquee(clientToSvg(moveEvent));
      };
      const handlePointerMove = (moveEvent: PointerEvent): void => {
        updateViewportMarquee(clientToSvg(moveEvent));
      };
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("pointermove", handlePointerMove);
      viewportMoveCleanupRef.current = () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("pointermove", handlePointerMove);
      };
      return;
    }
    if (event.button !== 0) {
      return;
    }
    if (placementSymbol) {
      onPlace(
        snapNodeOriginToWire(
          snapPoint(point),
          placementSymbol,
          placementRotation,
        ),
        placementRotation,
      );
      return;
    }
    if (tool === "wire") {
      beginWireAt(point);
      return;
    }
    if (tool === "junction") {
      onAddJunction(snapPoint(point));
      return;
    }
    if (tool === "net-label") {
      const snapped = snapWirePoint(point);
      if (snapped.wireId) {
        onAddAnnotation("net", netLabelPoint(snapped.point), snapped.wireId);
      }
      return;
    }
    if (tool === "text") {
      onAddAnnotation("text", snapPoint(point));
      return;
    }
    if (tool === "duplicate") {
      const source = activeDuplicateSourceId
        ? page.nodes.find((node) => node.id === activeDuplicateSourceId)
        : undefined;
      if (source) {
        const snapped = snapPoint(point);
        onDuplicateNode(activeDuplicateSourceId!, {
          x: snapped.x - source.x,
          y: snapped.y - source.y,
        }, ((source.rotation + duplicateRotationOffset) % 360) as Rotation);
        setDuplicateSourceId(null);
      } else if (!event.shiftKey) {
        onSelectionChange([]);
      }
      return;
    }
    if (tool === "rectangle" || tool === "ellipse" || tool === "note") {
      beginShapeDraftFor(tool, event, point);
      return;
    }
    if (!event.shiftKey) {
      onSelectionChange([]);
    }
    trySetPointerCapture(event.currentTarget, event.pointerId);
    setMarquee({
      start: point,
      current: point,
      base: event.shiftKey ? [...selection] : [],
    });
  }

  function movePointer(event: ReactPointerEvent<SVGSVGElement>): void {
    const point = clientToSvg(event);
    const rightClick = rightClickRef.current;
    if (
      rightClick &&
      Math.hypot(
        event.clientX - rightClick.clientX,
        event.clientY - rightClick.clientY,
      ) > 4
    ) {
      rightClick.moved = true;
    }
    setPointer(point);
    if (tool === "duplicate") {
      setDuplicatePointerActive(true);
    }
    if (pan) {
      const svg = svgRef.current;
      const rect = svg?.getBoundingClientRect();
      const scaleX = rect?.width ? pan.view.width / rect.width : 1;
      const scaleY = rect?.height ? pan.view.height / rect.height : 1;
      setView({
        ...pan.view,
        x: pan.view.x - (event.clientX - pan.clientX) * scaleX,
        y: pan.view.y - (event.clientY - pan.clientY) * scaleY,
      });
      return;
    }
    if (drag) {
      let delta = {
        x: roundToGrid(point.x - drag.origin.x),
        y: roundToGrid(point.y - drag.origin.y),
      };
      if (event.shiftKey) {
        delta =
          Math.abs(delta.x) >= Math.abs(delta.y)
            ? { x: delta.x, y: 0 }
            : { x: 0, y: delta.y };
      }
      if (!drag.duplicate) {
        delta = snapNodeMoveDelta(delta, drag.nodeIds);
      }
      setDrag({ ...drag, current: point, delta });
      return;
    }
    if (wireDraft) {
      const snapped = snapWirePoint(point);
      const nextDraft: WireDraft = {
        ...wireDraft,
        current: snapped.point,
      };
      if (snapped.anchor) {
        nextDraft.endAnchor = snapped.anchor;
      } else {
        delete nextDraft.endAnchor;
      }
      setWireDraft(nextDraft);
      return;
    }
    if (segmentDrag) {
      setSegmentDrag({
        ...segmentDrag,
        delta: {
          x: roundToGrid(point.x - segmentDrag.origin.x),
          y: roundToGrid(point.y - segmentDrag.origin.y),
        },
      });
      return;
    }
    if (labelDrag) {
      setLabelDrag({
        ...labelDrag,
        delta: {
          x: roundToGrid(point.x - labelDrag.origin.x),
          y: roundToGrid(point.y - labelDrag.origin.y),
        },
      });
      return;
    }
    if (annotationDrag) {
      setAnnotationDrag({
        ...annotationDrag,
        delta: {
          x: roundToGrid(point.x - annotationDrag.origin.x),
          y: roundToGrid(point.y - annotationDrag.origin.y),
        },
      });
      return;
    }
    if (shapeDrag) {
      setShapeDrag({
        ...shapeDrag,
        delta: {
          x: roundToGrid(point.x - shapeDrag.origin.x),
          y: roundToGrid(point.y - shapeDrag.origin.y),
        },
      });
      return;
    }
    if (noteTextDrag) {
      setNoteTextDrag({
        ...noteTextDrag,
        offset: {
          x: noteTextDrag.startOffset.x + Math.round(point.x - noteTextDrag.origin.x),
          y: noteTextDrag.startOffset.y + Math.round(point.y - noteTextDrag.origin.y),
        },
      });
      return;
    }
    if (shapeResize) {
      setShapeResize({
        ...shapeResize,
        delta: {
          x: roundToGrid(point.x - shapeResize.origin.x),
          y: roundToGrid(point.y - shapeResize.origin.y),
        },
        modifiers: {
          aspectRatio: event.shiftKey,
          fromCenter: event.altKey,
        },
      });
      return;
    }
    if (shapeDraft) {
      setShapeDraft({
        ...shapeDraft,
        current: snapPoint(point),
        modifiers: { square: event.shiftKey, centered: event.altKey },
      });
      return;
    }
    if (marquee) {
      setMarquee({ ...marquee, current: point });
    }
  }

  function updateViewportMarquee(point: Point): void {
    if (!viewportMarqueeRef.current) {
      return;
    }
    if (pointsEqual(viewportMarqueeRef.current.current, point, 0.1)) {
      return;
    }
    const next = { ...viewportMarqueeRef.current, current: point };
    viewportMarqueeRef.current = next;
    setViewportMarquee(next);
  }

  function stopViewportMoveTracking(): void {
    viewportMoveCleanupRef.current?.();
    viewportMoveCleanupRef.current = null;
  }

  function endPointer(event?: ReactPointerEvent<SVGSVGElement>): void {
    const rightClick = rightClickRef.current;
    if (rightClick) {
      rightClickRef.current = null;
      if (!rightClick.moved && rightClick.target) {
        event?.preventDefault();
        openContextMenuAt(
          rightClick.clientX,
          rightClick.clientY,
          rightClick.target,
        );
      }
      return;
    }
    if (pan) {
      setPan(null);
      return;
    }
    if (viewportMarqueeRef.current) {
      const activeMarquee = viewportMarqueeRef.current;
      const minX = Math.min(activeMarquee.start.x, activeMarquee.current.x);
      const minY = Math.min(activeMarquee.start.y, activeMarquee.current.y);
      const maxX = Math.max(activeMarquee.start.x, activeMarquee.current.x);
      const maxY = Math.max(activeMarquee.start.y, activeMarquee.current.y);
      if (maxX - minX >= 6 && maxY - minY >= 6) {
        const rect = svgRef.current?.getBoundingClientRect();
        const aspectRatio =
          rect?.width && rect.height
            ? rect.width / rect.height
            : BASE_WIDTH / BASE_HEIGHT;
        setView(
          focusViewportToMarquee(
            activeMarquee.start,
            activeMarquee.current,
            aspectRatio,
          ),
        );
      }
      viewportMarqueeRef.current = null;
      stopViewportMoveTracking();
      setViewportMarquee(null);
      return;
    }
    if (drag) {
      if (drag.duplicate) {
        const delta = event
          ? {
              x: roundToGrid(clientToSvg(event).x - drag.origin.x),
              y: roundToGrid(clientToSvg(event).y - drag.origin.y),
            }
          : drag.delta;
        const source = page.nodes.find(
          (node) => node.id === drag.nodeIds[0],
        );
        if (source) {
          onDuplicateNode(drag.nodeIds[0]!, delta, source.rotation);
        }
      } else if (drag.delta.x !== 0 || drag.delta.y !== 0) {
        onMoveSelected(drag.delta);
      }
      setDrag(null);
      return;
    }
    if (segmentDrag) {
      if (segmentDrag.delta.x !== 0 || segmentDrag.delta.y !== 0) {
        onUpdateWire(
          segmentDrag.wire.id,
          dragSegment(segmentDrag.wire, segmentDrag.segmentIndex, segmentDrag.delta),
        );
      }
      setSegmentDrag(null);
      return;
    }
    if (labelDrag) {
      if (labelDrag.delta.x !== 0 || labelDrag.delta.y !== 0) {
        onMoveNodeLabel(labelDrag.nodeId, labelDrag.label, labelDrag.delta);
      }
      setLabelDrag(null);
      return;
    }
    if (annotationDrag) {
      if (annotationDrag.delta.x !== 0 || annotationDrag.delta.y !== 0) {
        onUpdateAnnotation(annotationDrag.annotation.id, {
          x: annotationDrag.annotation.x + annotationDrag.delta.x,
          y: annotationDrag.annotation.y + annotationDrag.delta.y,
        });
      }
      setAnnotationDrag(null);
      return;
    }
    if (shapeDrag) {
      if (shapeDrag.delta.x !== 0 || shapeDrag.delta.y !== 0) {
        onUpdateShape(shapeDrag.shape.id, {
          x: shapeDrag.shape.x + shapeDrag.delta.x,
          y: shapeDrag.shape.y + shapeDrag.delta.y,
        });
      }
      setShapeDrag(null);
      return;
    }
    if (noteTextDrag) {
      if (
        noteTextDrag.offset.x !== noteTextDrag.startOffset.x ||
        noteTextDrag.offset.y !== noteTextDrag.startOffset.y
      ) {
        const fontSize = noteTextDrag.shape.textSize ?? DEFAULT_SHAPE_TEXT_SIZE;
        const offset = clampNoteTextOffset(
          noteTextDrag.offset,
          noteTextDrag.shape.text ?? "",
          noteTextDrag.shape.width,
          noteTextDrag.shape.height,
          fontSize,
        );
        onUpdateShape(noteTextDrag.shape.id, {
          textOffset: { x: Math.round(offset.x), y: Math.round(offset.y) },
        });
      }
      setNoteTextDrag(null);
      return;
    }
    if (shapeResize) {
      if (shapeResize.delta.x !== 0 || shapeResize.delta.y !== 0) {
        const patch = resizeShape(
          shapeResize.shape,
          shapeResize.corner,
          shapeResize.delta,
          shapeResize.modifiers,
        );
        if (shapeResize.shape.kind === "note") {
          const requiredHeight = noteContentHeight(
            shapeResize.shape.text ?? "",
            patch.width,
            shapeResize.shape.textSize ?? DEFAULT_SHAPE_TEXT_SIZE,
          );
          if (requiredHeight > patch.height) {
            patch.height = requiredHeight;
          }
        }
        onUpdateShape(shapeResize.shape.id, patch);
      }
      setShapeResize(null);
      return;
    }
    if (shapeDraft) {
      const bounds = shapeDraftBounds(shapeDraft);
      if (bounds.width >= 10 && bounds.height >= 10) {
        onAddShape(shapeDraft.kind, bounds);
      } else if (shapeDraft.kind === "note") {
        onAddShape(shapeDraft.kind, {
          x: shapeDraft.start.x,
          y: shapeDraft.start.y,
          width: DEFAULT_NOTE_WIDTH,
          height: DEFAULT_NOTE_HEIGHT,
        });
      }
      setShapeDraft(null);
      return;
    }
    if (marquee) {
      finishMarquee(marquee);
      setMarquee(null);
    }
  }

  function cancelPointer(): void {
    rightClickRef.current = null;
    setDrag(null);
    setMarquee(null);
    setViewportMarquee(null);
    viewportMarqueeRef.current = null;
    stopViewportMoveTracking();
    setWireDraft(null);
    setSegmentDrag(null);
    setShapeDraft(null);
    setLabelDrag(null);
    setAnnotationDrag(null);
    setShapeDrag(null);
    setShapeResize(null);
    setNoteTextDrag(null);
    setPan(null);
  }

  function finishMarquee(box: MarqueeState): void {
    const minX = Math.min(box.start.x, box.current.x);
    const maxX = Math.max(box.start.x, box.current.x);
    const minY = Math.min(box.start.y, box.current.y);
    const maxY = Math.max(box.start.y, box.current.y);
    if (Math.abs(maxX - minX) < 3 && Math.abs(maxY - minY) < 3) {
      return;
    }
    const next = [...box.base];
    const add = (item: SelectionRef): void => {
      if (!isSelected(next, item.kind, item.id)) {
        next.push(item);
      }
    };
    for (const node of page.nodes) {
      const symbol = symbols.get(node.symbolId);
      if (!symbol) {
        continue;
      }
      const bounds = nodeSelectionBounds(node, symbol);
      if (bounds.maxX >= minX && bounds.minX <= maxX && bounds.maxY >= minY && bounds.minY <= maxY) {
        add({ kind: "node", id: node.id });
      }
    }
    for (const { wire } of allWires(page)) {
      const points = resolveWirePoints(page, library, wire);
      if (
        points?.some(
          (point) => point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY,
        )
      ) {
        add({ kind: "wire", id: wire.id });
      }
    }
    for (const { junction } of allJunctions(page)) {
      if (
        junction.point.x >= minX &&
        junction.point.x <= maxX &&
        junction.point.y >= minY &&
        junction.point.y <= maxY
      ) {
        add({ kind: "junction", id: junctionSelectionId(junction) });
      }
    }
    for (const annotation of page.annotations) {
      if (annotation.x >= minX && annotation.x <= maxX && annotation.y >= minY && annotation.y <= maxY) {
        add({ kind: "annotation", id: annotation.id });
      }
    }
    for (const shape of page.shapes) {
      const bounds = rotatedShapeBounds(shape);
      if (bounds.maxX >= minX && bounds.minX <= maxX && bounds.maxY >= minY && bounds.minY <= maxY) {
        add({ kind: "shape", id: shape.id });
      }
    }
    onSelectionChange(next);
  }

  const placementPoint = placementSymbol
    ? snapNodeOriginToWire(
        snapPoint(pointer),
        placementSymbol,
        placementRotation,
      )
    : snapPoint(pointer);
  const zoomPercent = Math.round((BASE_WIDTH / view.width) * 100);
  const viewportPixelWidth = viewportSizeRef.current?.width ?? 0;
  const unitsPerPixel =
    viewportPixelWidth > 0 ? view.width / viewportPixelWidth : 1;
  const canvasClassName = `schematic-canvas tool-${tool}${placementSymbol ? " is-placing" : ""}${pan || spacePressed ? " is-panning" : ""}`;

  return (
    <div className="canvas-shell" data-testid="schematic-canvas">
      <div className="canvas-ruler canvas-ruler-x" aria-hidden="true">
        <span>{Math.round(view.x)}</span>
        <span>{Math.round(view.x + view.width / 2)}</span>
        <span>{Math.round(view.x + view.width)}</span>
      </div>
      <svg
        ref={svgRef}
        className={canvasClassName}
        viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
        role="application"
        aria-label={`${page.name} drawing canvas`}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "F10" && event.shiftKey && selection.length > 0) {
            event.preventDefault();
            const rect = svgRef.current?.getBoundingClientRect();
            if (rect) {
              setContextMenu({
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2,
                selection: [...selection],
              });
            }
          }
        }}
        onPointerDown={beginCanvasPointer}
        onPointerMove={movePointer}
        onPointerUp={endPointer}
        onPointerCancel={cancelPointer}
        onWheel={(event: ReactWheelEvent<SVGSVGElement>) => {
          event.preventDefault();
          setContextMenu(null);
          zoomAt(event.clientX, event.clientY, Math.exp(event.deltaY * 0.0015));
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          if (viewportMarqueeRef.current) {
            return;
          }
          setWireDraft(null);
          setMarquee(null);
          setViewportMarquee(null);
          viewportMarqueeRef.current = null;
          stopViewportMoveTracking();
          setShapeDraft(null);
          setLabelDrag(null);
          setAnnotationDrag(null);
          setShapeDrag(null);
          setShapeResize(null);
          setNoteTextDrag(null);
          setInlineEditor(null);
        }}
      >
        <defs>
          {gridVisible ? (
            <>
              <pattern id="grid-small" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#dbe2e3" strokeWidth="0.7" />
              </pattern>
              <pattern id="grid-large" width="100" height="100" patternUnits="userSpaceOnUse">
                <rect width="100" height="100" fill="url(#grid-small)" />
                <path d="M 100 0 L 0 0 0 100" fill="none" stroke="#c6d0d2" strokeWidth="1" />
              </pattern>
            </>
          ) : null}
        </defs>
        <rect
          x={view.x}
          y={view.y}
          width={view.width}
          height={view.height}
          fill="#f5f3ec"
        />
        {gridVisible ? (
          <rect
            x={view.x}
            y={view.y}
            width={view.width}
            height={view.height}
            fill="url(#grid-large)"
          />
        ) : null}

        {(() => {
          const painted: Array<React.JSX.Element | null> = [
            ...page.shapes.filter((shape) => shape.kind !== "note").map((shape) => {
            const draggedShape =
              shapeDrag?.shape.id === shape.id
                ? {
                    ...shape,
                    x: shape.x + shapeDrag.delta.x,
                    y: shape.y + shapeDrag.delta.y,
                  }
                : shapeResize?.shape.id === shape.id
                  ? {
                      ...shape,
                      ...resizeShape(
                        shapeResize.shape,
                        shapeResize.corner,
                        shapeResize.delta,
                        shapeResize.modifiers,
                      ),
                    }
                  : shape;
            const centerX = draggedShape.x + draggedShape.width / 2;
            const centerY = draggedShape.y + draggedShape.height / 2;
            const transform =
              draggedShape.rotation === 0
                ? undefined
                : `rotate(${draggedShape.rotation} ${centerX} ${centerY})`;
            const selected = isSelected(selection, "shape", shape.id);
            const editing =
              inlineEditor?.kind === "shape" && inlineEditor.id === shape.id
                ? inlineEditor
                : null;
            const strokeWidth = draggedShape.strokeWidth ?? DEFAULT_SHAPE_STROKE_WIDTH;
            const dashArray =
              draggedShape.dash === "dashed"
                ? "7 5"
                : draggedShape.dash === "dotted"
                  ? "2 4"
                  : undefined;
            const shapeOpacity = draggedShape.opacity ?? 1;
            const textSize = draggedShape.textSize ?? DEFAULT_SHAPE_TEXT_SIZE;
            const textColor = draggedShape.textColor ?? DEFAULT_SHAPE_TEXT_COLOR;
            const textAlign = draggedShape.textAlign ?? DEFAULT_SHAPE_TEXT_ALIGN;
            const textBold = draggedShape.textBold ?? true;
            const shapeRuns = shapeTextRuns(draggedShape);
            const shapeLines =
              shapeRuns.length > 0 ? splitRichTextRunsByLine(shapeRuns) : [];
            const textX =
              textAlign === "middle"
                ? centerX
                : textAlign === "end"
                  ? draggedShape.x + draggedShape.width - 8
                  : draggedShape.x + 8;
            const textLineHeight = textSize * 1.25;
            const textFirstY =
              centerY - ((shapeLines.length - 1) * textLineHeight) / 2;
            const handles: Array<{ handle: ShapeHandle; x: number; y: number }> = [
              { handle: "nw", x: draggedShape.x, y: draggedShape.y },
              { handle: "n", x: centerX, y: draggedShape.y },
              {
                handle: "ne",
                x: draggedShape.x + draggedShape.width,
                y: draggedShape.y,
              },
              {
                handle: "e",
                x: draggedShape.x + draggedShape.width,
                y: centerY,
              },
              {
                handle: "se",
                x: draggedShape.x + draggedShape.width,
                y: draggedShape.y + draggedShape.height,
              },
              { handle: "s", x: centerX, y: draggedShape.y + draggedShape.height },
              {
                handle: "sw",
                x: draggedShape.x,
                y: draggedShape.y + draggedShape.height,
              },
              { handle: "w", x: draggedShape.x, y: centerY },
            ];
            return (
              <g
                key={shape.id}
                data-shape-id={shape.id}
                className={`drawing-shape${selected ? " is-selected" : ""}`}
                onPointerDown={(event) => beginShapePointer(event, shape)}
                onDoubleClick={(event) => {
                  if (tool !== "select") {
                    return;
                  }
                  event.stopPropagation();
                  setInlineEditor({
                    kind: "shape",
                    id: shape.id,
                    value: shape.text ?? "",
                  });
                }}
              >
                <g transform={transform}>
                  {draggedShape.kind === "ellipse" ? (
                    <ellipse
                      className="shape-body"
                      cx={centerX}
                      cy={centerY}
                      rx={draggedShape.width / 2}
                      ry={draggedShape.height / 2}
                      fill={draggedShape.fill}
                      stroke={draggedShape.stroke}
                      strokeWidth={strokeWidth}
                      strokeDasharray={dashArray}
                      opacity={shapeOpacity}
                      fillOpacity={draggedShape.fillOpacity ?? 1}
                    />
                  ) : (
                    <rect
                      className="shape-body"
                      x={draggedShape.x}
                      y={draggedShape.y}
                      width={draggedShape.width}
                      height={draggedShape.height}
                      fill={draggedShape.fill}
                      stroke={draggedShape.stroke}
                      strokeWidth={strokeWidth}
                      strokeDasharray={dashArray}
                      opacity={shapeOpacity}
                      fillOpacity={draggedShape.fillOpacity ?? 1}
                    />
                  )}
                    {shapeLines.length > 0 && !editing ? (
                      <text
                        className="shape-text"
                        x={textX}
                        y={textFirstY}
                        textAnchor={textAlign}
                        dominantBaseline="central"
                        fontSize={textSize}
                        fontFamily="Arial, sans-serif"
                        fontWeight={textBold ? 600 : 400}
                        fill={textColor}
                      >
                        {shapeLines.map((lineRuns, index) => (
                          <tspan
                            key={`${shape.id}-text-${index}`}
                            x={textX}
                            dy={index === 0 ? 0 : textLineHeight}
                          >
                            <RichTextTspans
                              runs={lineRuns}
                              baseFontSize={textSize}
                              boldWeight={600}
                            />
                          </tspan>
                        ))}
                      </text>
                    ) : null}
                  {selected && tool === "select"
                    ? handles.map((handle) => (
                        <rect
                          key={handle.handle}
                          className={`shape-resize-handle shape-resize-${handle.handle}`}
                          x={handle.x - 5 * unitsPerPixel}
                          y={handle.y - 5 * unitsPerPixel}
                          width={10 * unitsPerPixel}
                          height={10 * unitsPerPixel}
                          onPointerDown={(event) =>
                            beginShapeResize(event, shape, handle.handle)
                          }
                        />
                      ))
                    : null}
                  {editing ? (
                    <CanvasRichTextInlineEditor
                      x={draggedShape.x + 6}
                      y={centerY - 18}
                      width={Math.max(220, draggedShape.width - 12)}
                      height={
                        Math.max(
                          36,
                          editing.value.split(/\r?\n/).length * 20 + 14,
                        ) + RICH_INLINE_TOOLBAR_HEIGHT
                      }
                      initialRuns={shapeTextRuns(draggedShape)}
                      multiline
                      ariaLabel="Editable shape label"
                      initialFormat={
                        (draggedShape.text ?? "").trim() ||
                        (!draggedShape.textBold && draggedShape.kind !== "note")
                          ? undefined
                          : "bold"
                      }
                      onCommit={(runs) => {
                        onUpdateShape(shape.id, {
                          text: runsToPlainText(runs),
                          richText: runs,
                        });
                      }}
                      onClose={() => setInlineEditor(null)}
                    />
                  ) : null}
                </g>
              </g>
            );
            }),
            ...allWires(displayPage).map(({ net, wire }) => {
            const points = resolveWirePoints(displayPage, library, wire);
            if (!points) {
              return null;
            }
            const networkId = connectivity.networkIdByWire.get(wire.id);
            const highlighted = networkId ? highlightedNetworks.has(networkId) : false;
            const selected = isSelected(selection, "wire", wire.id);
            const previewPoints =
              segmentDrag && segmentDrag.wire.id === wire.id
                ? dragSegment(
                    { ...segmentDrag.wire, points },
                    segmentDrag.segmentIndex,
                    segmentDrag.delta,
                  )
                : points;
            return (
              <g
                key={wire.id}
                data-wire-id={wire.id}
                className={`wire-group${selected ? " is-selected" : ""}${highlighted ? " is-net-highlighted" : ""}`}
                style={
                  net.color
                    ? ({ "--net-color": net.color } as React.CSSProperties)
                    : undefined
                }
                onPointerDown={(event) => {
                  if (event.button !== 0 || spacePressed) {
                    return;
                  }
                  event.stopPropagation();
                  if (placementSymbol) {
                    onPlace(
                      snapNodeOriginToWire(
                        snapPoint(clientToSvg(event)),
                        placementSymbol,
                        placementRotation,
                      ),
                      placementRotation,
                    );
                  } else if (
                    tool === "rectangle" ||
                    tool === "ellipse" ||
                    tool === "note"
                  ) {
                    beginShapeDraftFor(tool, event, clientToSvg(event));
                  } else if (tool === "wire") {
                    beginWireAt(clientToSvg(event));
                  } else if (tool === "junction") {
                    onAddJunction(snapPoint(clientToSvg(event)));
                  } else if (tool === "net-label") {
                    const snapped = snapWirePoint(clientToSvg(event));
                    onAddAnnotation("net", netLabelPoint(snapped.point), wire.id);
                  } else if (tool === "text") {
                    onAddAnnotation("text", snapPoint(clientToSvg(event)));
                  } else if (tool === "select") {
                    onSelectionChange(
                      selectionWith(selection, { kind: "wire", id: wire.id }, event.shiftKey),
                    );
                  }
                }}
                onPointerEnter={() => setHovered({ kind: "wire", id: wire.id })}
                onPointerLeave={() => setHovered(null)}
              >
                <path
                  className="wire-hit"
                  d={wirePathData(
                    previewPoints,
                    hopPositions.get(wire.id) ?? [],
                    overlapRanges.get(wire.id) ?? [],
                  )}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="16"
                />
                <path
                  className="wire-visible"
                  d={wirePathData(
                    previewPoints,
                    hopPositions.get(wire.id) ?? [],
                    overlapRanges.get(wire.id) ?? [],
                  )}
                  fill="none"
                  strokeWidth={highlighted ? 3.4 : 2.2}
                />
                {selected ? (
                  <path
                    className="wire-selection-outline"
                    d={wirePathData(
                      previewPoints,
                      hopPositions.get(wire.id) ?? [],
                      overlapRanges.get(wire.id) ?? [],
                    )}
                    fill="none"
                    strokeWidth="7"
                  />
                ) : null}
                {selected
                  ? previewPoints.slice(0, -1).map((start, index) => {
                    const end = previewPoints[index + 1]!;
                    return (
                      <circle
                        key={`${wire.id}-handle-${index}`}
                        className="wire-segment-handle"
                        cx={(start.x + end.x) / 2}
                        cy={(start.y + end.y) / 2}
                        r={5 * unitsPerPixel}
                        onPointerDown={(event) =>
                          beginSegmentDrag(
                            event,
                            { ...wire, points },
                            index,
                          )
                        }
                      />
                    );
                  })
                  : null}
              </g>
            );
            }),
            ...displayPage.nodes.map((node) => {
            const symbol = symbols.get(node.symbolId);
            if (!symbol) {
              return (
                <g key={node.id} className="missing-symbol" transform={`translate(${node.x} ${node.y})`}>
                  <rect x="-30" y="-20" width="60" height="40" />
                  <text textAnchor="middle" y="5">Missing symbol</text>
                </g>
              );
            }
            const moving = drag?.nodeIds.includes(node.id) ?? false;
            const selected = isSelected(selection, "node", node.id);
            const bounds = nodeSelectionBounds(node, symbol);
            const reference = symbolLabelPosition(node, symbol, "reference");
            const value = symbolLabelPosition(node, symbol, "value");
            const referenceVisible =
              symbol.referenceLabel !== false &&
              nodeLabelVisible(node, "reference");
            const valueVisible = nodeLabelVisible(node, "value");
            const referenceDelta =
              labelDrag?.nodeId === node.id && labelDrag.label === "reference"
                ? labelDrag.delta
                : { x: 0, y: 0 };
            const valueDelta =
              labelDrag?.nodeId === node.id && labelDrag.label === "value"
                ? labelDrag.delta
                : { x: 0, y: 0 };
            const editingReference =
              inlineEditor?.kind === "node-label" &&
              inlineEditor.nodeId === node.id &&
              inlineEditor.label === "reference"
                ? inlineEditor
                : null;
            const editingValue =
              inlineEditor?.kind === "node-label" &&
              inlineEditor.nodeId === node.id &&
              inlineEditor.label === "value"
                ? inlineEditor
                : null;
            const networkHighlighted = symbol.pins.some((_pin, pinIndex) => {
              const network = connectivity.networkIdByPin.get(`pin:${node.id}:${pinIndex}`);
              return network ? highlightedNetworks.has(network) : false;
            });
            return (
              <g
                key={node.id}
                className={`component-node${selected ? " is-selected" : ""}${networkHighlighted ? " is-net-highlighted" : ""}${moving ? " is-moving" : ""}${node.id.endsWith("__duplicate_preview") ? " is-duplicate-preview" : ""}`}
                data-node-id={node.id}
                onPointerDown={(event) => beginNodePointer(event, node.id)}
                onPointerEnter={() => setHovered({ kind: "node", id: node.id })}
                onPointerLeave={() => setHovered(null)}
              >
                <rect
                  className="component-hit"
                  x={bounds.minX}
                  y={bounds.minY}
                  width={bounds.maxX - bounds.minX}
                  height={bounds.maxY - bounds.minY}
                />
                <g
                  className="component-art"
                  transform={symbolTransform(node, symbol)}
                  dangerouslySetInnerHTML={{ __html: symbol.svgBody }}
                />
                {referenceVisible && !editingReference ? (
                  <ComponentTextLabel
                    className={`component-reference${isSelected(selection, "node-label", node.id, "reference") ? " is-selected" : ""}`}
                    kind="reference"
                    text={node.reference}
                    point={{
                      x: reference.point.x + referenceDelta.x,
                      y: reference.point.y + referenceDelta.y,
                    }}
                    anchor={reference.anchor}
                    layout={node.labelLayout?.reference}
                    typography={typography}
                    onPointerDown={(event) =>
                      beginNodeLabelPointer(event, node.id, "reference")
                    }
                    onDoubleClick={(event) => {
                      if (tool !== "select") {
                        return;
                      }
                      event.stopPropagation();
                      setInlineEditor({
                        kind: "node-label",
                        nodeId: node.id,
                        label: "reference",
                        value: node.reference,
                      });
                    }}
                    onPointerEnter={() => setHovered({ kind: "node", id: node.id })}
                    onPointerLeave={() => setHovered(null)}
                  />
                ) : null}
                {editingReference ? (
                  <CanvasRichTextInlineEditor
                    x={reference.point.x - 4}
                    y={reference.point.y - 17}
                    width={Math.max(220, 110)}
                    height={RICH_INLINE_TEXT_HEIGHT + RICH_INLINE_TOOLBAR_HEIGHT}
                    initialRuns={richTextRunsForReference(
                      node.reference,
                      node.labelLayout?.reference?.richText,
                    )}
                    multiline={false}
                    ariaLabel="Editable component Name"
                    onCommit={(runs) => {
                      const text = referenceFromRichTextRuns(runs);
                      if (!text) {
                        return;
                      }
                      if (onUpdateNodeReferenceLabel) {
                        onUpdateNodeReferenceLabel(node.id, text, runs);
                      } else {
                        onUpdateNode(node.id, { reference: text });
                      }
                    }}
                    onClose={() => setInlineEditor(null)}
                  />
                ) : null}
                {valueVisible && node.value && !editingValue ? (
                  <ComponentTextLabel
                    className={`component-value${isSelected(selection, "node-label", node.id, "value") ? " is-selected" : ""}`}
                    kind="value"
                    text={node.value}
                    point={{
                      x: value.point.x + valueDelta.x,
                      y: value.point.y + valueDelta.y,
                    }}
                    anchor={value.anchor}
                    layout={node.labelLayout?.value}
                    typography={typography}
                    onPointerDown={(event) =>
                      beginNodeLabelPointer(event, node.id, "value")
                    }
                    onDoubleClick={(event) => {
                      if (tool !== "select") {
                        return;
                      }
                      event.stopPropagation();
                      setInlineEditor({
                        kind: "node-label",
                        nodeId: node.id,
                        label: "value",
                        value: node.value,
                      });
                    }}
                    onPointerEnter={() => setHovered({ kind: "node", id: node.id })}
                    onPointerLeave={() => setHovered(null)}
                  />
                ) : null}
                {editingValue ? (
                  <CanvasInlineEditor
                    x={value.point.x - 4}
                    y={value.point.y - 17}
                    width={120}
                    height={24}
                    value={editingValue.value}
                    multiline={false}
                    onCommit={(text) => {
                      onUpdateNode(node.id, { value: text });
                      setInlineEditor(null);
                    }}
                    onCancel={() => setInlineEditor(null)}
                  />
                ) : null}
                {symbol.pins.map((pin, pinIndex) => {
                  const point = nodePinPosition(node, symbol, pinIndex);
                  const snapping =
                    wireDraft?.endAnchor?.deviceId === node.id &&
                    wireDraft.endAnchor.pinId === pin.key;
                  return (
                    <g
                      key={pin.key}
                      className="port-pin"
                      data-pin-id={pin.key}
                      onPointerDown={(event) => beginPinPointer(event, node, pinIndex)}
                    >
                      <circle
                        className="port-pin-hit-area"
                        cx={point.x}
                        cy={point.y}
                        r="6"
                      />
                      <circle
                        className={`port-pin-indicator${snapping ? " is-snapping" : ""}`}
                        cx={point.x}
                        cy={point.y}
                        r="3"
                      />
                    </g>
                  );
                })}
                {tool === "wire" && networkHighlighted
                  ? symbol.pins.map((pin, pinIndex) => {
                    const point = nodePinPosition(node, symbol, pinIndex);
                    const network = connectivity.networkIdByPin.get(`pin:${node.id}:${pinIndex}`);
                    if (!network || !highlightedNetworks.has(network)) {
                      return null;
                    }
                    return <circle key={`net-${pin.key}`} className="net-pin" cx={point.x} cy={point.y} r="3.2" />;
                  })
                  : null}
              </g>
            );
            }),
            ...page.shapes
              .filter((shape) => shape.kind === "note")
              .map((shape) => {
              const draggedShape =
                shapeDrag?.shape.id === shape.id
                  ? {
                      ...shape,
                      x: shape.x + shapeDrag.delta.x,
                      y: shape.y + shapeDrag.delta.y,
                    }
                  : shapeResize?.shape.id === shape.id
                    ? {
                        ...shape,
                        ...resizeShape(
                          shapeResize.shape,
                          shapeResize.corner,
                          shapeResize.delta,
                          shapeResize.modifiers,
                        ),
                      }
                    : shape;
              const centerX = draggedShape.x + draggedShape.width / 2;
              const centerY = draggedShape.y + draggedShape.height / 2;
              const transform =
                draggedShape.rotation === 0
                  ? undefined
                  : `rotate(${draggedShape.rotation} ${centerX} ${centerY})`;
              const selected = isSelected(selection, "shape", shape.id);
              const editing =
                inlineEditor?.kind === "shape" && inlineEditor.id === shape.id
                  ? inlineEditor
                  : null;
              const strokeWidth =
                draggedShape.strokeWidth ?? DEFAULT_NOTE_STROKE_WIDTH;
              const noteOpacity = draggedShape.opacity ?? 1;
              const fillOpacity =
                draggedShape.fillOpacity ?? DEFAULT_NOTE_FILL_OPACITY;
              const textSize = draggedShape.textSize ?? DEFAULT_SHAPE_TEXT_SIZE;
              const textColor =
                draggedShape.textColor ?? DEFAULT_NOTE_TEXT_COLOR;
              const textAlign = draggedShape.textAlign ?? "start";
              const noteLines = layoutNoteRichText(
                shapeTextRuns(draggedShape),
                draggedShape.width,
                textSize,
              );
              const rawOffset =
                noteTextDrag?.shape.id === shape.id
                  ? noteTextDrag.offset
                  : draggedShape.textOffset ?? { x: 0, y: 0 };
              const clampedOffset = clampNoteTextOffset(
                rawOffset,
                draggedShape.text ?? "",
                draggedShape.width,
                draggedShape.height,
                textSize,
              );
              const noteTextLeft = draggedShape.x + NOTE_PADDING;
              const noteTextBaseY =
                draggedShape.y + NOTE_TEXT_TOP + clampedOffset.y;
              let noteTextOffset = 0;
              const positionedNoteLines = noteLines.map((line) => {
                const y = noteTextBaseY + noteTextOffset;
                noteTextOffset += line.lineHeight;
                return { ...line, y };
              });
              const textX =
                textAlign === "middle"
                  ? draggedShape.x + draggedShape.width / 2 + clampedOffset.x
                  : textAlign === "end"
                    ? draggedShape.x +
                      draggedShape.width -
                      NOTE_PADDING +
                      clampedOffset.x
                    : noteTextLeft + clampedOffset.x;
              const handles: Array<{ handle: ShapeHandle; x: number; y: number }> = [
                { handle: "nw", x: draggedShape.x, y: draggedShape.y },
                { handle: "n", x: centerX, y: draggedShape.y },
                {
                  handle: "ne",
                  x: draggedShape.x + draggedShape.width,
                  y: draggedShape.y,
                },
                {
                  handle: "e",
                  x: draggedShape.x + draggedShape.width,
                  y: centerY,
                },
                {
                  handle: "se",
                  x: draggedShape.x + draggedShape.width,
                  y: draggedShape.y + draggedShape.height,
                },
                { handle: "s", x: centerX, y: draggedShape.y + draggedShape.height },
                {
                  handle: "sw",
                  x: draggedShape.x,
                  y: draggedShape.y + draggedShape.height,
                },
                { handle: "w", x: draggedShape.x, y: centerY },
              ];
              return (
                <g
                  key={shape.id}
                  data-shape-id={shape.id}
                  className={`drawing-shape note${selected ? " is-selected" : ""}`}
                  onPointerDown={(event) => beginShapePointer(event, shape)}
                  onDoubleClick={(event) => {
                    if (tool !== "select") {
                      return;
                    }
                    event.stopPropagation();
                    setInlineEditor({
                      kind: "shape",
                      id: shape.id,
                      value: shape.text ?? "",
                    });
                  }}
                >
                  <g transform={transform}>
                    <rect
                      className={`shape-body note-body${selected && tool === "select" ? " is-selected" : ""}`}
                      x={draggedShape.x}
                      y={draggedShape.y}
                      width={draggedShape.width}
                      height={draggedShape.height}
                      rx={Math.min(10, draggedShape.width / 2, draggedShape.height / 2)}
                      fill={draggedShape.fill}
                      fillOpacity={fillOpacity}
                      stroke={draggedShape.stroke}
                      strokeWidth={strokeWidth}
                      opacity={noteOpacity}
                    />
                    <rect
                      className="note-border"
                      x={draggedShape.x}
                      y={draggedShape.y}
                      width={draggedShape.width}
                      height={draggedShape.height}
                      rx={Math.min(10, draggedShape.width / 2, draggedShape.height / 2)}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={Math.max(8, strokeWidth * 2)}
                    />
                    <rect
                      className="note-hit"
                      x={draggedShape.x}
                      y={draggedShape.y}
                      width={draggedShape.width}
                      height={Math.min(20, draggedShape.height)}
                    />
                    {positionedNoteLines.length > 0 && !editing ? (
                      <text
                        className="note-text"
                        x={textX}
                        textAnchor={textAlign}
                        fill={textColor}
                        fontFamily="Arial, sans-serif"
                        onPointerDown={(event) => beginNoteTextPointer(event, shape)}
                        onDoubleClick={(event) => {
                          if (tool !== "select") {
                            return;
                          }
                          event.stopPropagation();
                          setInlineEditor({
                            kind: "shape",
                            id: shape.id,
                            value: shape.text ?? "",
                          });
                        }}
                      >
                        {positionedNoteLines.map((line, index) => (
                          <tspan
                            key={`${shape.id}-note-${index}`}
                            x={textX}
                            y={line.y}
                            fontSize={line.fontSize}
                          >
                            <RichTextTspans
                              runs={line.runs}
                              baseFontSize={line.fontSize}
                            />
                          </tspan>
                        ))}
                      </text>
                    ) : null}
                    {selected && tool === "select"
                      ? handles.map((handle) => (
                          <rect
                            key={handle.handle}
                            className={`shape-resize-handle shape-resize-${handle.handle}`}
                            x={handle.x - 5 * unitsPerPixel}
                            y={handle.y - 5 * unitsPerPixel}
                            width={10 * unitsPerPixel}
                            height={10 * unitsPerPixel}
                            onPointerDown={(event) =>
                              beginShapeResize(event, shape, handle.handle)
                            }
                          />
                        ))
                      : null}
                    {editing ? (
                      <CanvasRichTextInlineEditor
                        x={noteTextLeft + clampedOffset.x - 6}
                        y={noteTextBaseY - textSize - 6}
                        width={Math.max(
                          220,
                          draggedShape.width - NOTE_PADDING * 2,
                        )}
                        height={
                          Math.max(
                            36,
                            noteLines.length * textSize * 1.5 + 16,
                          ) + RICH_INLINE_TOOLBAR_HEIGHT
                        }
                        initialRuns={shapeTextRuns(draggedShape)}
                        multiline
                        ariaLabel="Editable note text"
                        initialFormat={
                          (draggedShape.text ?? "").trim() ? undefined : "bold"
                        }
                        clearFormatOnNewParagraph
                        onCommit={(runs) => {
                          const text = runsToPlainText(runs);
                          const height = Math.max(
                            shape.height,
                            noteContentHeight(text, shape.width, textSize),
                          );
                          onUpdateShape(shape.id, {
                            text,
                            richText: runs,
                            height,
                          });
                        }}
                        onClose={() => {
                          setInlineEditor(null);
                          onNoteEditingFinished?.();
                        }}
                      />
                    ) : null}
                  </g>
                </g>
              );
            }),
            ...page.annotations.map((annotation) => {
            const network = connectivity.networkIdByAnnotation.get(annotation.id);
            const highlighted = network ? highlightedNetworks.has(network) : false;
            const delta =
              annotationDrag?.annotation.id === annotation.id
                ? annotationDrag.delta
                : { x: 0, y: 0 };
            const editing =
              inlineEditor?.kind === "annotation" && inlineEditor.id === annotation.id
                ? inlineEditor
                : null;
            const x = annotation.x + delta.x;
            const y = annotation.y + delta.y;
            const lines = splitRichTextRunsByLine(
              annotationTextRuns(annotation),
            );
            const lineHeight = annotation.size * 1.2;
            const rotation = annotation.rotation ?? 0;
            const color =
              annotation.kind === "net"
                ? (annotation.netId ? netColorById.get(annotation.netId) : undefined) ??
                  annotation.color ??
                  DEFAULT_NET_LABEL_COLOR
                : annotation.color ?? DEFAULT_ANNOTATION_TEXT_COLOR;
            return (
              <text
                key={annotation.id}
                data-annotation-id={annotation.id}
                className={`annotation annotation-${annotation.kind}${isSelected(selection, "annotation", annotation.id) ? " is-selected" : ""}${highlighted ? " is-net-highlighted" : ""}`}
                x={x}
                y={y}
                fontSize={annotation.size}
                textAnchor={annotation.align ?? "start"}
                fontWeight={annotation.kind === "net" ? 700 : annotation.bold ? 700 : 400}
                fontStyle={annotation.italic ? "italic" : undefined}
                transform={
                  rotation === 0 ? undefined : `rotate(${rotation} ${x} ${y})`
                }
                style={{ "--annotation-color": color } as React.CSSProperties}
                onPointerDown={(event) => beginAnnotationPointer(event, annotation)}
                onDoubleClick={(event) => {
                  if (tool !== "select" || placementSymbol) {
                    return;
                  }
                  event.stopPropagation();
                  setInlineEditor({
                    kind: "annotation",
                    id: annotation.id,
                    value: annotation.text,
                  });
                }}
                onPointerEnter={() => setHovered({ kind: "annotation", id: annotation.id })}
                onPointerLeave={() => setHovered(null)}
              >
                {editing
                  ? ""
                  : lines.map((lineRuns, index) => (
                      <tspan
                        key={`${annotation.id}-line-${index}`}
                        x={x}
                        dy={index === 0 ? 0 : lineHeight}
                      >
                        <RichTextTspans
                          runs={lineRuns}
                          baseFontSize={annotation.size}
                        />
                      </tspan>
                    ))}
              </text>
            );
            }),
          ];
          const paintedById = new Map<string, React.JSX.Element>();
          for (const element of painted) {
            if (element !== null && element.key !== null) {
              paintedById.set(String(element.key), element);
            }
          }
          return (
            <>
              {resolvePaintOrder(displayPage).map(
                (entry) => paintedById.get(entry.id) ?? null,
              )}
              <g className="junction-layer">
                {allJunctions(displayPage).map(({ net, junction }) => {
                  const point = junction.point;
                  const selected = isSelected(
                    selection,
                    "junction",
                    junctionSelectionId(junction),
                  );
                  return (
                    <g
                      key={junction.id}
                      className={`junction${selected ? " is-selected" : ""}`}
                      data-junction-id={junctionSelectionId(junction)}
                      style={
                        net.color
                          ? ({
                              "--junction-color": net.color,
                            } as React.CSSProperties)
                          : undefined
                      }
                      onPointerDown={(event) =>
                        beginJunctionPointer(event, junction)
                      }
                    >
                      {selected ? (
                        <circle
                          className="junction-ring"
                          cx={point.x}
                          cy={point.y}
                          r="5.5"
                        />
                      ) : null}
                      <circle
                        className="junction-hit"
                        cx={point.x}
                        cy={point.y}
                        r="9"
                      />
                      <circle
                        cx={point.x}
                        cy={point.y}
                        r="3.2"
                        className="junction-dot junction-explicit"
                      />
                    </g>
                  );
                })}
              </g>
            </>
          );
        })()}

        <g className="annotation-layer">
          {inlineEditor?.kind === "annotation"
            ? (() => {
                const annotation = page.annotations.find(
                  (candidate) => candidate.id === inlineEditor.id,
                );
                if (!annotation) {
                  return null;
                }
                const lines = inlineEditor.value.split(/\r?\n/);
                const longest = lines.reduce(
                  (length, line) => Math.max(length, line.length),
                  0,
                );
                const width = Math.max(
                  annotation.kind === "net" ? 110 : 160,
                  (longest + 2) * annotation.size * 0.68,
                );
                const height =
                  annotation.kind === "net"
                    ? 28
                    : Math.max(84, lines.length * annotation.size * 1.4 + 24);
                const align = annotation.align ?? "start";
                const editorX =
                  align === "middle"
                    ? annotation.x - width / 2
                    : align === "end"
                      ? annotation.x - width
                      : annotation.x - 6;
                if (annotation.kind === "text") {
                  return (
                    <CanvasRichTextInlineEditor
                      x={editorX}
                      y={annotation.y - annotation.size - 6}
                      width={Math.max(220, width)}
                      height={height + RICH_INLINE_TOOLBAR_HEIGHT}
                      initialRuns={annotationTextRuns(annotation)}
                      multiline
                      ariaLabel="Editable text annotation"
                      onCommit={(runs) => {
                        onUpdateAnnotation(annotation.id, {
                          text: runsToPlainText(runs),
                          richText: runs,
                        });
                      }}
                      onClose={() => {
                        setInlineEditor(null);
                        onTextEditingFinished?.();
                      }}
                      onOutsidePointerDown={() =>
                        onTextEditingFinished?.()
                      }
                    />
                  );
                }
                return (
                  <CanvasInlineEditor
                    x={editorX}
                    y={annotation.y - annotation.size - 6}
                    width={width}
                    height={height}
                    value={inlineEditor.value}
                    multiline={false}
                    onCommit={(text) => {
                      onUpdateAnnotation(annotation.id, { text });
                      setInlineEditor(null);
                      onTextEditingFinished?.();
                    }}
                    onCancel={() => {
                      setInlineEditor(null);
                      onTextEditingFinished?.();
                    }}
                    onOutsidePointerDown={() => onTextEditingFinished?.()}
                  />
                );
              })()
            : null}
        </g>

        {wireDraft ? (
          <g className="wire-draft" pointerEvents="none">
            <path
              d={pathData(
                routeWireGeometry(
                  page,
                  library,
                  wireDraft.start,
                  wireDraft.current,
                  wireDraft.startAnchor,
                  wireDraft.endAnchor,
                ),
              )}
              fill="none"
            />
            <circle cx={wireDraft.start.x} cy={wireDraft.start.y} r="5" />
            <circle cx={wireDraft.current.x} cy={wireDraft.current.y} r="5" />
            <text x={wireDraft.current.x + 9} y={wireDraft.current.y - 9}>
              {wireDraft.endAnchor ? "connect" : "wire"}
            </text>
          </g>
        ) : null}

        {placementSymbol ? (
          <g className="placement-ghost" pointerEvents="none">
            <g transform={symbolTransform(
              {
                id: "placement-preview",
                symbolId: placementSymbol.id,
                reference: "",
                value: "",
                x: placementPoint.x,
                y: placementPoint.y,
                rotation: placementRotation,
                mirrored: false,
              },
              placementSymbol,
            )}>
              <g dangerouslySetInnerHTML={{ __html: placementSymbol.svgBody }} />
            </g>
            {placementSymbol.pins.map((pin, pinIndex) => {
              const point = nodePinPosition(
                {
                  id: "placement-preview",
                  symbolId: placementSymbol.id,
                  reference: "",
                  value: "",
                  x: placementPoint.x,
                  y: placementPoint.y,
                  rotation: placementRotation,
                  mirrored: false,
                },
                placementSymbol,
                pinIndex,
              );
              return <circle key={pin.key} cx={point.x} cy={point.y} r="4" />;
            })}
            <text x={placementPoint.x} y={placementPoint.y - 34} textAnchor="middle">
              {placementSymbol.label}
            </text>
          </g>
        ) : null}

        {shapeDraft ? (
          (() => {
            const bounds = shapeDraftBounds(shapeDraft);
            return (
              <g
                className={`shape-draft${shapeDraft.kind === "note" ? " note-draft" : ""}`}
                pointerEvents="none"
              >
                {shapeDraft.kind === "ellipse" ? (
                  <ellipse
                    cx={bounds.x + bounds.width / 2}
                    cy={bounds.y + bounds.height / 2}
                    rx={bounds.width / 2}
                    ry={bounds.height / 2}
                  />
                ) : (
                  <rect
                    className={shapeDraft.kind === "note" ? "note-draft-body" : undefined}
                    x={bounds.x}
                    y={bounds.y}
                    width={bounds.width}
                    height={bounds.height}
                    rx={shapeDraft.kind === "note" ? 10 : 0}
                    fill={shapeDraft.kind === "note" ? DEFAULT_NOTE_FILL : "none"}
                    fillOpacity={shapeDraft.kind === "note" ? 0.22 : 1}
                    stroke={shapeDraft.kind === "note" ? DEFAULT_NOTE_STROKE : undefined}
                  />
                )}
              </g>
            );
          })()
        ) : null}

        {marquee ? (
          <rect
            className="selection-marquee"
            x={Math.min(marquee.start.x, marquee.current.x)}
            y={Math.min(marquee.start.y, marquee.current.y)}
            width={Math.abs(marquee.current.x - marquee.start.x)}
            height={Math.abs(marquee.current.y - marquee.start.y)}
            pointerEvents="none"
          />
        ) : null}

        {viewportMarquee ? (
          <rect
            className="viewport-marquee"
            x={Math.min(viewportMarquee.start.x, viewportMarquee.current.x)}
            y={Math.min(viewportMarquee.start.y, viewportMarquee.current.y)}
            width={Math.abs(viewportMarquee.current.x - viewportMarquee.start.x)}
            height={Math.abs(viewportMarquee.current.y - viewportMarquee.start.y)}
            pointerEvents="none"
          />
        ) : null}
      </svg>
      <div className="canvas-controls" aria-label="Canvas view controls">
        <button type="button" onClick={() => zoomAtCanvasCenter(1.2)}>
          Zoom in
        </button>
        <button type="button" onClick={() => setView({ x: 0, y: 0, width: BASE_WIDTH, height: BASE_HEIGHT })}>
          {zoomPercent}%
        </button>
        <button type="button" onClick={() => zoomAtCanvasCenter(1 / 1.2)}>
          Zoom out
        </button>
        <button type="button" onClick={fitPageToContent}>
          Fit
        </button>
        <button
          type="button"
          aria-pressed={gridVisible}
          title="Toggle grid (G)"
          onClick={() => setGridVisible((visible) => !visible)}
        >
          Grid
        </button>
      </div>
      <div className="canvas-axis-label">
        {gridVisible ? `Grid ${GRID_SIZE}` : "Grid off"} · Wheel zoom · F fit · G grid · Space drag
      </div>
      {contextMenu ? (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          label="Object actions"
          entries={contextMenuEntriesFor(contextMenu.selection)}
          onClose={() => setContextMenu(null)}
        />
      ) : null}
    </div>
  );
}
