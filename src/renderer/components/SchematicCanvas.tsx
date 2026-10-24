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
  nodeLabelVisible,
  nodePinPosition,
  pointsEqual,
  roundToGrid,
  snapPoint,
  symbolLabelPosition,
  symbolTransform,
} from "../../core/geometry";
import { routeWireGeometry } from "../../core/routing";
import {
  pathInkBounds,
  planNodeMove,
  resolveWirePoints,
} from "../../core/wireMotion";
import { wireHops, wireOverlaps, wirePathData } from "../../core/wireHops";
import type {
  Annotation,
  ComponentNode,
  ConnectionAnchor,
  DrawingPage,
  DrawingShape,
  NodeLabelKind,
  Point,
  SelectionRef,
  ShapeKind,
  SymbolDefinition,
  Wire,
} from "../../core/model";
import { junctionSelectionId } from "../../core/model";
import type { EditorTool } from "./Toolbar";

const BASE_WIDTH = 1600;
const BASE_HEIGHT = 1000;
const MIN_VIEW_WIDTH = 320;
const MAX_VIEW_WIDTH = 5200;
const SNAP_PIXELS = 13;

export interface Viewport {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SchematicCanvasProps {
  page: DrawingPage;
  library: readonly SymbolDefinition[];
  tool: EditorTool;
  placementSymbol: SymbolDefinition | null;
  selection: readonly SelectionRef[];
  onSelectionChange: (selection: SelectionRef[]) => void;
  onPlace: (point: Point) => void;
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
  onAddJunction: (point: Point) => void;
  onAddAnnotation: (
    kind: Annotation["kind"],
    point: Point,
    wireId?: string,
  ) => void;
  onUpdateAnnotation: (
    annotationId: string,
    patch: Partial<Pick<Annotation, "text" | "x" | "y" | "size">>,
  ) => void;
  onAddShape: (kind: ShapeKind, bounds: { x: number; y: number; width: number; height: number }) => void;
  onUpdateShape: (
    shapeId: string,
    patch: Partial<Pick<DrawingShape, "x" | "y" | "width" | "height" | "text">>,
  ) => void;
  onMoveSelected: (delta: Point) => void;
}

interface DragState {
  origin: Point;
  current: Point;
  nodeIds: string[];
  delta: Point;
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

type ShapeCorner = "nw" | "ne" | "sw" | "se";

interface ShapeResizeState {
  shape: DrawingShape;
  corner: ShapeCorner;
  origin: Point;
  delta: Point;
}

type InlineEditorState =
  | { kind: "annotation"; id: string; value: string }
  | { kind: "node-label"; nodeId: string; label: NodeLabelKind; value: string }
  | { kind: "shape"; id: string; value: string };

interface ShapeDraft {
  kind: ShapeKind;
  start: Point;
  current: Point;
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
  const startAnchored = segmentIndex === 0 && Boolean(wire.startAnchor);
  const endAnchored =
    segmentIndex === wire.points.length - 2 && Boolean(wire.endAnchor);
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
) {
  const symbols = new Map(library.map((symbol) => [symbol.id, symbol]));
  const nodeBoxes = page.nodes.flatMap((node) => {
    const symbol = symbols.get(node.symbolId);
    return symbol ? [nodeBounds(node, symbol)] : [];
  });
  const shapeBoxes = page.shapes.map(rotatedShapeBounds);
  const wireBoxes = page.wires.flatMap((wire) => {
    const points = resolveWirePoints(page, library, wire);
    const bounds = points ? pathInkBounds(points) : null;
    return bounds ? [bounds] : [];
  });
  const points = [
    ...page.junctions,
    ...page.annotations.map((annotation) => ({ x: annotation.x, y: annotation.y })),
    ...page.annotations.flatMap((annotation) => [
      { x: annotation.x - annotation.size, y: annotation.y - annotation.size },
      {
        x: annotation.x + Math.max(8, annotation.text.length * annotation.size * 0.65),
        y: annotation.y + annotation.size * 0.35,
      },
    ]),
  ];
  const boxes = [...nodeBoxes, ...shapeBoxes, ...wireBoxes];
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

function resizeShape(
  shape: DrawingShape,
  corner: ShapeCorner,
  delta: Point,
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
  let left = shape.x;
  let top = shape.y;
  let right = shape.x + shape.width;
  let bottom = shape.y + shape.height;
  if (corner.includes("w")) {
    left = Math.min(right - GRID_SIZE, left + dx);
  } else {
    right = Math.max(left + GRID_SIZE, right + dx);
  }
  if (corner.includes("n")) {
    top = Math.min(bottom - GRID_SIZE, top + dy);
  } else {
    bottom = Math.max(top + GRID_SIZE, bottom + dy);
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
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
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  value: string;
  multiline: boolean;
  onCommit: (value: string) => void;
  onCancel: () => void;
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
  library,
  tool,
  placementSymbol,
  selection,
  onSelectionChange,
  onPlace,
  onAddWire,
  onUpdateWire,
  onUpdateNode,
  onMoveNodeLabel,
  onAddJunction,
  onAddAnnotation,
  onUpdateAnnotation,
  onAddShape,
  onUpdateShape,
  onMoveSelected,
}: SchematicCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
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
  const [inlineEditor, setInlineEditor] = useState<InlineEditorState | null>(null);
  const [pan, setPan] = useState<PanState | null>(null);
  const [spacePressed, setSpacePressed] = useState(false);
  const [hovered, setHovered] = useState<SelectionRef | null>(null);
  const symbols = useMemo(() => new Map(library.map((symbol) => [symbol.id, symbol])), [library]);
  const movingNodeIds = useMemo(() => new Set(drag?.nodeIds ?? []), [drag?.nodeIds]);
  const displayPage = useMemo(
    () =>
      drag
        ? planNodeMove(page, library, movingNodeIds, drag.delta)
        : page,
    [drag, library, movingNodeIds, page],
  );
  const connectivity = useMemo(
    () => buildConnectivity(displayPage, library),
    [displayPage, library],
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
        setInlineEditor(null);
        setPan(null);
      } else if ((event.ctrlKey || event.metaKey) && event.key === "0") {
        event.preventDefault();
        setView({ x: 0, y: 0, width: BASE_WIDTH, height: BASE_HEIGHT });
      } else if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        fitPageToContent();
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
  }, [page, symbols]);

  useEffect(() => {
    setWireDraft(null);
    setSegmentDrag(null);
    setShapeDraft(null);
    setLabelDrag(null);
    setAnnotationDrag(null);
    setShapeDrag(null);
    setShapeResize(null);
    setInlineEditor(null);
    setMarquee(null);
    setViewportMarquee(null);
    viewportMarqueeRef.current = null;
    stopViewportMoveTracking();
  }, [page.id]);

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
    setView(fitViewportToBounds(pageBounds(page, library), aspectRatio));
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
      onPlace(point);
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
      onPlace(snapPoint(point));
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
        onAddAnnotation("net", snapped.point, snapped.wireId);
      }
      return;
    }
    if (tool === "text") {
      onAddAnnotation("text", snapPoint(point));
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
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      origin: point,
      current: point,
      nodeIds,
      delta: { x: 0, y: 0 },
    });
  }

  function beginSegmentDrag(
    event: ReactPointerEvent<SVGCircleElement>,
    wire: Wire,
    segmentIndex: number,
  ): void {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
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
    event.currentTarget.setPointerCapture(event.pointerId);
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
    event.currentTarget.setPointerCapture(event.pointerId);
    setAnnotationDrag({
      annotation,
      origin: clientToSvg(event),
      delta: { x: 0, y: 0 },
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
    event.currentTarget.setPointerCapture(event.pointerId);
    setShapeDrag({
      shape,
      origin: clientToSvg(event),
      delta: { x: 0, y: 0 },
    });
  }

  function beginShapeResize(
    event: ReactPointerEvent<SVGRectElement>,
    shape: DrawingShape,
    corner: ShapeCorner,
  ): void {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setShapeResize({
      shape,
      corner,
      origin: clientToSvg(event),
      delta: { x: 0, y: 0 },
    });
  }

  function beginJunctionPointer(
    event: ReactPointerEvent<SVGGElement>,
    point: Point,
  ): void {
    if (event.button !== 0 || spacePressed || tool !== "select") {
      return;
    }
    event.stopPropagation();
    const item: SelectionRef = {
      kind: "junction",
      id: junctionSelectionId(point),
    };
    onSelectionChange(selectionWith(selection, item, event.shiftKey));
  }

  function beginCanvasPointer(event: ReactPointerEvent<SVGSVGElement>): void {
    if ((event.target as Element).closest?.(".canvas-inline-editor-object")) {
      return;
    }
    const point = clientToSvg(event);
    setPointer(point);
    if (event.button === 1 || spacePressed) {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      setPan({
        clientX: event.clientX,
        clientY: event.clientY,
        view,
      });
      return;
    }
    if (event.button === 2) {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
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
      onPlace(snapPoint(point));
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
        onAddAnnotation("net", snapped.point, snapped.wireId);
      }
      return;
    }
    if (tool === "text") {
      onAddAnnotation("text", snapPoint(point));
      return;
    }
    if (tool === "rectangle" || tool === "ellipse") {
      event.currentTarget.setPointerCapture(event.pointerId);
      const snapped = snapPoint(point);
      setShapeDraft({ kind: tool, start: snapped, current: snapped });
      return;
    }
    if (!event.shiftKey) {
      onSelectionChange([]);
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setMarquee({
      start: point,
      current: point,
      base: event.shiftKey ? [...selection] : [],
    });
  }

  function movePointer(event: ReactPointerEvent<SVGSVGElement>): void {
    const point = clientToSvg(event);
    setPointer(point);
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
    if (shapeResize) {
      setShapeResize({
        ...shapeResize,
        delta: {
          x: roundToGrid(point.x - shapeResize.origin.x),
          y: roundToGrid(point.y - shapeResize.origin.y),
        },
      });
      return;
    }
    if (shapeDraft) {
      setShapeDraft({ ...shapeDraft, current: snapPoint(point) });
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

  function endPointer(): void {
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
      if (drag.delta.x !== 0 || drag.delta.y !== 0) {
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
    if (shapeResize) {
      if (shapeResize.delta.x !== 0 || shapeResize.delta.y !== 0) {
        onUpdateShape(
          shapeResize.shape.id,
          resizeShape(shapeResize.shape, shapeResize.corner, shapeResize.delta),
        );
      }
      setShapeResize(null);
      return;
    }
    if (shapeDraft) {
      const x = Math.min(shapeDraft.start.x, shapeDraft.current.x);
      const y = Math.min(shapeDraft.start.y, shapeDraft.current.y);
      const width = Math.abs(shapeDraft.current.x - shapeDraft.start.x);
      const height = Math.abs(shapeDraft.current.y - shapeDraft.start.y);
      if (width >= 10 && height >= 10) {
        onAddShape(shapeDraft.kind, { x, y, width, height });
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
      const bounds = nodeBounds(node, symbol);
      if (bounds.maxX >= minX && bounds.minX <= maxX && bounds.maxY >= minY && bounds.minY <= maxY) {
        add({ kind: "node", id: node.id });
      }
    }
    for (const wire of page.wires) {
      const points = resolveWirePoints(page, library, wire);
      if (
        points?.some(
          (point) => point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY,
        )
      ) {
        add({ kind: "wire", id: wire.id });
      }
    }
    for (const junction of page.junctions) {
      if (
        junction.x >= minX &&
        junction.x <= maxX &&
        junction.y >= minY &&
        junction.y <= maxY
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

  const placementPoint = snapPoint(pointer);
  const zoomPercent = Math.round((BASE_WIDTH / view.width) * 100);
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
        onPointerDown={beginCanvasPointer}
        onPointerMove={movePointer}
        onPointerUp={endPointer}
        onPointerCancel={cancelPointer}
        onWheel={(event: ReactWheelEvent<SVGSVGElement>) => {
          event.preventDefault();
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
          setInlineEditor(null);
        }}
      >
        <defs>
          <pattern id="grid-small" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#dbe2e3" strokeWidth="0.7" />
          </pattern>
          <pattern id="grid-large" width="100" height="100" patternUnits="userSpaceOnUse">
            <rect width="100" height="100" fill="url(#grid-small)" />
            <path d="M 100 0 L 0 0 0 100" fill="none" stroke="#c6d0d2" strokeWidth="1" />
          </pattern>
        </defs>
        <rect
          x={view.x}
          y={view.y}
          width={view.width}
          height={view.height}
          fill="#f5f3ec"
        />
        <rect
          x={view.x}
          y={view.y}
          width={view.width}
          height={view.height}
          fill="url(#grid-large)"
        />

        <g className="shape-layer">
          {page.shapes.map((shape) => {
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
                      ...resizeShape(shapeResize.shape, shapeResize.corner, shapeResize.delta),
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
            return (
              <g
                key={shape.id}
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
                    />
                  )}
                  {draggedShape.text && !editing ? (
                    <text
                      className="shape-text"
                      x={centerX}
                      y={centerY}
                      textAnchor="middle"
                      dominantBaseline="central"
                    >
                      {draggedShape.text}
                    </text>
                  ) : null}
                  {selected && tool === "select"
                    ? [
                        { corner: "nw" as const, x: draggedShape.x, y: draggedShape.y },
                        {
                          corner: "ne" as const,
                          x: draggedShape.x + draggedShape.width,
                          y: draggedShape.y,
                        },
                        {
                          corner: "sw" as const,
                          x: draggedShape.x,
                          y: draggedShape.y + draggedShape.height,
                        },
                        {
                          corner: "se" as const,
                          x: draggedShape.x + draggedShape.width,
                          y: draggedShape.y + draggedShape.height,
                        },
                      ].map((handle) => (
                        <rect
                          key={handle.corner}
                          className={`shape-resize-handle shape-resize-${handle.corner}`}
                          x={handle.x - 5}
                          y={handle.y - 5}
                          width={10}
                          height={10}
                          onPointerDown={(event) =>
                            beginShapeResize(event, shape, handle.corner)
                          }
                        />
                      ))
                    : null}
                  {editing ? (
                    <CanvasInlineEditor
                      x={draggedShape.x + 6}
                      y={centerY - 18}
                      width={Math.max(60, draggedShape.width - 12)}
                      height={36}
                      value={editing.value}
                      multiline={false}
                      onCommit={(text) => {
                        onUpdateShape(shape.id, { text });
                        setInlineEditor(null);
                      }}
                      onCancel={() => setInlineEditor(null)}
                    />
                  ) : null}
                </g>
              </g>
            );
          })}
        </g>

        <g className="wire-layer">
          {displayPage.wires.map((wire) => {
            const points = resolveWirePoints(displayPage, library, wire);
            if (!points) {
              return null;
            }
            const networkId = connectivity.networkIdByWire.get(wire.id);
            const highlighted = networkId ? highlightedNetworks.has(networkId) : false;
            const selected = isSelected(selection, "wire", wire.id);
            const previewPoints =
              segmentDrag?.wire.id === wire.id
                ? dragSegment(
                    { ...segmentDrag.wire, points },
                    segmentDrag.segmentIndex,
                    segmentDrag.delta,
                  )
                : points;
            return (
              <g
                key={wire.id}
                className={`wire-group${selected ? " is-selected" : ""}${highlighted ? " is-net-highlighted" : ""}`}
                onPointerDown={(event) => {
                  if (event.button !== 0 || spacePressed) {
                    return;
                  }
                  event.stopPropagation();
                  if (placementSymbol) {
                    onPlace(snapPoint(clientToSvg(event)));
                  } else if (tool === "wire") {
                    beginWireAt(clientToSvg(event));
                  } else if (tool === "junction") {
                    onAddJunction(snapPoint(clientToSvg(event)));
                  } else if (tool === "net-label") {
                    const snapped = snapWirePoint(clientToSvg(event));
                    onAddAnnotation("net", snapped.point, wire.id);
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
                        r="5"
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
          })}
        </g>

        <g className="component-layer">
          {displayPage.nodes.map((node) => {
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
            const bounds = nodeBounds(node, symbol);
            const reference = symbolLabelPosition(node, symbol, "reference");
            const value = symbolLabelPosition(node, symbol, "value");
            const referenceVisible = nodeLabelVisible(node, "reference");
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
                className={`component-node${selected ? " is-selected" : ""}${networkHighlighted ? " is-net-highlighted" : ""}${moving ? " is-moving" : ""}`}
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
                  <text
                    className={`component-reference${isSelected(selection, "node-label", node.id, "reference") ? " is-selected" : ""}`}
                    x={reference.point.x + referenceDelta.x}
                    y={reference.point.y + referenceDelta.y}
                    textAnchor={reference.anchor}
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
                  >
                    {node.reference || "?"}
                  </text>
                ) : null}
                {editingReference ? (
                  <CanvasInlineEditor
                    x={reference.point.x - 4}
                    y={reference.point.y - 17}
                    width={110}
                    height={24}
                    value={editingReference.value}
                    multiline={false}
                    onCommit={(text) => {
                      onUpdateNode(node.id, { reference: text });
                      setInlineEditor(null);
                    }}
                    onCancel={() => setInlineEditor(null)}
                  />
                ) : null}
                {valueVisible && node.value && !editingValue ? (
                  <text
                    className={`component-value${isSelected(selection, "node-label", node.id, "value") ? " is-selected" : ""}`}
                    x={value.point.x + valueDelta.x}
                    y={value.point.y + valueDelta.y}
                    textAnchor={value.anchor}
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
                  >
                    {node.value}
                  </text>
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
          })}
        </g>

        <g className="junction-layer">
          {connectivity.junctionPoints.map((point, index) => {
            const explicit = displayPage.junctions.some((junction) =>
              pointsEqual(junction, point, 0.5),
            );
            const selected =
              explicit &&
              isSelected(
                selection,
                "junction",
                junctionSelectionId(point),
              );
            return (
              <g
                key={`${point.x}_${point.y}_${index}`}
                className={`junction${selected ? " is-selected" : ""}`}
                data-junction-id={
                  explicit ? junctionSelectionId(point) : undefined
                }
                onPointerDown={
                  explicit
                    ? (event) => beginJunctionPointer(event, point)
                    : undefined
                }
              >
                {explicit ? (
                  <>
                    <circle
                      className="junction-hit"
                      cx={point.x}
                      cy={point.y}
                      r="9"
                    />
                    <circle className="junction-ring" cx={point.x} cy={point.y} r="5.5" />
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r="3.2"
                      className="junction-explicit"
                    />
                  </>
                ) : (
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r="2.6"
                    className="junction-auto"
                  />
                )}
              </g>
            );
          })}
        </g>

        <g className="annotation-layer">
          {page.annotations.map((annotation) => {
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
            return (
              <text
                key={annotation.id}
                className={`annotation annotation-${annotation.kind}${isSelected(selection, "annotation", annotation.id) ? " is-selected" : ""}${highlighted ? " is-net-highlighted" : ""}`}
                x={annotation.x + delta.x}
                y={annotation.y + delta.y}
                fontSize={annotation.size}
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
                  : annotation.kind === "net"
                    ? `⌁ ${annotation.text}`
                    : annotation.text}
              </text>
            );
          })}
          {inlineEditor?.kind === "annotation"
            ? (() => {
                const annotation = page.annotations.find(
                  (candidate) => candidate.id === inlineEditor.id,
                );
                if (!annotation) {
                  return null;
                }
                return (
                  <CanvasInlineEditor
                    x={annotation.x - 6}
                    y={annotation.y - annotation.size - 6}
                    width={Math.max(
                      110,
                      (inlineEditor.value.length + 2) * annotation.size * 0.7,
                    )}
                    height={annotation.kind === "text" ? 84 : 28}
                    value={inlineEditor.value}
                    multiline={annotation.kind === "text"}
                    onCommit={(text) => {
                      onUpdateAnnotation(annotation.id, { text });
                      setInlineEditor(null);
                    }}
                    onCancel={() => setInlineEditor(null)}
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
                rotation: 0,
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
                  rotation: 0,
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
          <g className="shape-draft" pointerEvents="none">
            {shapeDraft.kind === "ellipse" ? (
              <ellipse
                cx={(shapeDraft.start.x + shapeDraft.current.x) / 2}
                cy={(shapeDraft.start.y + shapeDraft.current.y) / 2}
                rx={Math.abs(shapeDraft.current.x - shapeDraft.start.x) / 2}
                ry={Math.abs(shapeDraft.current.y - shapeDraft.start.y) / 2}
              />
            ) : (
              <rect
                x={Math.min(shapeDraft.start.x, shapeDraft.current.x)}
                y={Math.min(shapeDraft.start.y, shapeDraft.current.y)}
                width={Math.abs(shapeDraft.current.x - shapeDraft.start.x)}
                height={Math.abs(shapeDraft.current.y - shapeDraft.start.y)}
              />
            )}
          </g>
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
      </div>
      <div className="canvas-axis-label">Grid {GRID_SIZE} · Wheel zoom · F fit · Space drag</div>
    </div>
  );
}
