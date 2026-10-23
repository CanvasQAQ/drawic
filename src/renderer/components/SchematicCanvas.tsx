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
  distance,
  nodeBounds,
  nodePinPosition,
  orthogonalPath,
  pointsEqual,
  roundToGrid,
  snapPoint,
  symbolLabelPosition,
  symbolTransform,
} from "../../core/geometry";
import type {
  Annotation,
  ComponentNode,
  ConnectionAnchor,
  DrawingPage,
  DrawingShape,
  Point,
  SelectionRef,
  ShapeKind,
  SymbolDefinition,
  Wire,
} from "../../core/model";
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
  ) => void;
  onUpdateWire: (wireId: string, points: Point[]) => void;
  onAddJunction: (point: Point) => void;
  onAddAnnotation: (kind: Annotation["kind"], point: Point) => void;
  onAddShape: (kind: ShapeKind, bounds: { x: number; y: number; width: number; height: number }) => void;
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

interface WireDraft {
  start: Point;
  current: Point;
  startAnchor?: ConnectionAnchor;
  endAnchor?: ConnectionAnchor;
}

interface SegmentDrag {
  wire: Wire;
  segmentIndex: number;
  origin: Point;
  delta: Point;
}

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
}

function isSelected(selection: readonly SelectionRef[], kind: SelectionRef["kind"], id: string) {
  return selection.some((item) => item.kind === kind && item.id === id);
}

function selectionWith(
  selection: readonly SelectionRef[],
  item: SelectionRef,
  additive: boolean,
): SelectionRef[] {
  const exists = isSelected(selection, item.kind, item.id);
  if (additive) {
    return exists
      ? selection.filter((entry) => !(entry.kind === item.kind && entry.id === item.id))
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

function shapeBounds(shape: DrawingShape) {
  return {
    minX: Math.min(shape.x, shape.x + shape.width),
    minY: Math.min(shape.y, shape.y + shape.height),
    maxX: Math.max(shape.x, shape.x + shape.width),
    maxY: Math.max(shape.y, shape.y + shape.height),
  };
}

export function dragSegment(wire: Wire, segmentIndex: number, delta: Point): Point[] {
  const points = wire.points.map((point) => ({ ...point }));
  const start = points[segmentIndex];
  const end = points[segmentIndex + 1];
  if (!start || !end) {
    return points;
  }
  if (start.y === end.y) {
    start.y = roundToGrid(start.y + delta.y);
    end.y = roundToGrid(end.y + delta.y);
  } else if (start.x === end.x) {
    start.x = roundToGrid(start.x + delta.x);
    end.x = roundToGrid(end.x + delta.x);
  }
  return points;
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
  onAddJunction,
  onAddAnnotation,
  onAddShape,
  onMoveSelected,
}: SchematicCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<Viewport>({
    x: 0,
    y: 0,
    width: BASE_WIDTH,
    height: BASE_HEIGHT,
  });
  const [pointer, setPointer] = useState<Point>({ x: 0, y: 0 });
  const [drag, setDrag] = useState<DragState | null>(null);
  const [marquee, setMarquee] = useState<MarqueeState | null>(null);
  const [wireDraft, setWireDraft] = useState<WireDraft | null>(null);
  const [segmentDrag, setSegmentDrag] = useState<SegmentDrag | null>(null);
  const [shapeDraft, setShapeDraft] = useState<ShapeDraft | null>(null);
  const [pan, setPan] = useState<PanState | null>(null);
  const [spacePressed, setSpacePressed] = useState(false);
  const [hovered, setHovered] = useState<SelectionRef | null>(null);
  const symbols = useMemo(() => new Map(library.map((symbol) => [symbol.id, symbol])), [library]);
  const connectivity = useMemo(() => buildConnectivity(page, library), [page, library]);

  const highlightedNetworks = useMemo(() => {
    const networks = selectedNetworkIds(connectivity, selection);
    const relevant = hovered ? [...selection, hovered] : selection;
    for (const item of relevant) {
      if (item.kind !== "node") {
        continue;
      }
      const node = page.nodes.find((candidate) => candidate.id === item.id);
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
  }, [connectivity, selection, hovered, page.nodes, symbols]);

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
      if ((event.ctrlKey || event.metaKey) && event.key === "0") {
        event.preventDefault();
        setView({ x: 0, y: 0, width: BASE_WIDTH, height: BASE_HEIGHT });
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
  }, []);

  useEffect(() => {
    setWireDraft(null);
    setSegmentDrag(null);
    setShapeDraft(null);
    setMarquee(null);
  }, [page.id]);

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

    let closest: { point: Point; distance: number } | null = null;
    for (const segment of connectivity.segments) {
      const dx = segment.end.x - segment.start.x;
      const dy = segment.end.y - segment.start.y;
      let candidate: Point | null = null;
      if (Math.abs(dx) < 0.001) {
        if (Math.abs(point.x - segment.start.x) <= tolerance) {
          candidate = {
            x: segment.start.x,
            y: clamp(point.y, Math.min(segment.start.y, segment.end.y), Math.max(segment.start.y, segment.end.y)),
          };
        }
      } else if (Math.abs(dy) < 0.001 && Math.abs(point.y - segment.start.y) <= tolerance) {
        candidate = {
          x: clamp(point.x, Math.min(segment.start.x, segment.end.x), Math.max(segment.start.x, segment.end.x)),
          y: segment.start.y,
        };
      }
      if (candidate) {
        const candidateDistance = distance(point, candidate);
        if (candidateDistance <= tolerance && (!closest || candidateDistance < closest.distance)) {
          closest = { point: candidate, distance: candidateDistance };
        }
      }
    }
    return { point: closest ? { ...closest.point } : snapPoint(point) };
  }

  function finishWire(current: Point, endAnchor?: ConnectionAnchor): void {
    if (!wireDraft) {
      return;
    }
    if (!pointsEqual(wireDraft.start, current, 0.1)) {
      onAddWire(orthogonalPath(wireDraft.start, current), {
        ...(wireDraft.startAnchor ? { startAnchor: wireDraft.startAnchor } : {}),
        ...(endAnchor ? { endAnchor } : {}),
      });
    }
    setWireDraft(null);
  }

  function beginWireAt(point: Point): void {
    const snapped = snapWirePoint(point);
    if (wireDraft) {
      finishWire(snapped.point, snapped.anchor);
      return;
    }
    setWireDraft({
      start: snapped.point,
      current: snapped.point,
      ...(snapped.anchor ? { startAnchor: snapped.anchor } : {}),
    });
  }

  function beginPinPointer(
    event: ReactPointerEvent<SVGCircleElement>,
    node: ComponentNode,
    pinIndex: number,
  ): void {
    if (event.button !== 0 || spacePressed) {
      return;
    }
    event.stopPropagation();
    const symbol = symbols.get(node.symbolId);
    if (!symbol) {
      return;
    }
    const point = nodePinPosition(node, symbol, pinIndex);
    if (placementSymbol) {
      onPlace(point);
      return;
    }
    if (tool === "wire") {
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
      onAddAnnotation("net", snapWirePoint(point).point);
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

  function beginCanvasPointer(event: ReactPointerEvent<SVGSVGElement>): void {
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
      onAddAnnotation("net", snapWirePoint(point).point);
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
      setWireDraft({
        ...wireDraft,
        current: snapped.point,
        ...(snapped.anchor ? { endAnchor: snapped.anchor } : {}),
      });
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
    if (shapeDraft) {
      setShapeDraft({ ...shapeDraft, current: snapPoint(point) });
      return;
    }
    if (marquee) {
      setMarquee({ ...marquee, current: point });
    }
  }

  function endPointer(): void {
    if (pan) {
      setPan(null);
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
      if (
        wire.points.some(
          (point) => point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY,
        )
      ) {
        add({ kind: "wire", id: wire.id });
      }
    }
    for (const annotation of page.annotations) {
      if (annotation.x >= minX && annotation.x <= maxX && annotation.y >= minY && annotation.y <= maxY) {
        add({ kind: "annotation", id: annotation.id });
      }
    }
    for (const shape of page.shapes) {
      const bounds = shapeBounds(shape);
      if (bounds.maxX >= minX && bounds.minX <= maxX && bounds.maxY >= minY && bounds.minY <= maxY) {
        add({ kind: "shape", id: shape.id });
      }
    }
    onSelectionChange(next);
  }

  const dragDelta = drag ? drag.delta : { x: 0, y: 0 };
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
        onPointerCancel={endPointer}
        onWheel={(event: ReactWheelEvent<SVGSVGElement>) => {
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            zoomAt(event.clientX, event.clientY, Math.exp(event.deltaY * 0.0015));
          }
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          setWireDraft(null);
          setMarquee(null);
          setShapeDraft(null);
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
          <filter id="net-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
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
            const centerX = shape.x + shape.width / 2;
            const centerY = shape.y + shape.height / 2;
            const transform =
              shape.rotation === 0
                ? undefined
                : `rotate(${shape.rotation} ${centerX} ${centerY})`;
            return (
              <g
                key={shape.id}
                className={`drawing-shape${isSelected(selection, "shape", shape.id) ? " is-selected" : ""}`}
                onPointerDown={(event) => {
                  if (tool !== "select" || placementSymbol) {
                    return;
                  }
                  event.stopPropagation();
                  onSelectionChange(
                    selectionWith(selection, { kind: "shape", id: shape.id }, event.shiftKey),
                  );
                }}
              >
                {shape.kind === "ellipse" ? (
                  <ellipse
                    cx={centerX}
                    cy={centerY}
                    rx={shape.width / 2}
                    ry={shape.height / 2}
                    fill={shape.fill}
                    stroke={shape.stroke}
                    transform={transform}
                  />
                ) : (
                  <rect
                    x={shape.x}
                    y={shape.y}
                    width={shape.width}
                    height={shape.height}
                    fill={shape.fill}
                    stroke={shape.stroke}
                    transform={transform}
                  />
                )}
              </g>
            );
          })}
        </g>

        <g className="wire-layer">
          {page.wires.map((wire) => {
            const networkId = connectivity.networkIdByWire.get(wire.id);
            const highlighted = networkId ? highlightedNetworks.has(networkId) : false;
            const selected = isSelected(selection, "wire", wire.id);
            const previewPoints =
              segmentDrag?.wire.id === wire.id
                ? dragSegment(segmentDrag.wire, segmentDrag.segmentIndex, segmentDrag.delta)
                : wire.points;
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
                    onAddAnnotation("net", snapWirePoint(clientToSvg(event)).point);
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
                <path className="wire-hit" d={pathData(previewPoints)} fill="none" stroke="transparent" strokeWidth="16" />
                <path
                  className="wire-visible"
                  d={pathData(previewPoints)}
                  fill="none"
                  strokeWidth={highlighted ? 3.4 : 2.2}
                />
                {selected ? (
                  <path
                    className="wire-selection-outline"
                    d={pathData(previewPoints)}
                    fill="none"
                    strokeWidth="7"
                  />
                ) : null}
                {selected
                  ? wire.points.slice(0, -1).map((start, index) => {
                    const end = wire.points[index + 1]!;
                    const endpointAnchored =
                      (index === 0 && wire.startAnchor) ||
                      (index === wire.points.length - 2 && wire.endAnchor);
                    if (endpointAnchored) {
                      return null;
                    }
                    return (
                      <circle
                        key={`${wire.id}-handle-${index}`}
                        className="wire-segment-handle"
                        cx={(start.x + end.x) / 2}
                        cy={(start.y + end.y) / 2}
                        r="5"
                        onPointerDown={(event) => beginSegmentDrag(event, wire, index)}
                      />
                    );
                  })
                  : null}
              </g>
            );
          })}
        </g>

        <g className="component-layer">
          {page.nodes.map((node) => {
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
            const networkHighlighted = symbol.pins.some((_pin, pinIndex) => {
              const network = connectivity.networkIdByPin.get(`pin:${node.id}:${pinIndex}`);
              return network ? highlightedNetworks.has(network) : false;
            });
            return (
              <g
                key={node.id}
                className={`component-node${selected ? " is-selected" : ""}${networkHighlighted ? " is-net-highlighted" : ""}${moving ? " is-moving" : ""}`}
                data-node-id={node.id}
                transform={moving ? `translate(${dragDelta.x} ${dragDelta.y})` : undefined}
                onPointerDown={(event) => beginNodePointer(event, node.id)}
                onPointerEnter={() => setHovered({ kind: "node", id: node.id })}
                onPointerLeave={() => setHovered(null)}
              >
                <rect
                  className="component-hit"
                  x={bounds.minX - 5}
                  y={bounds.minY - 5}
                  width={bounds.maxX - bounds.minX + 10}
                  height={bounds.maxY - bounds.minY + 10}
                />
                <g
                  className="component-art"
                  transform={symbolTransform(node, symbol)}
                  dangerouslySetInnerHTML={{ __html: symbol.svgBody }}
                />
                <text
                  className="component-reference"
                  x={reference.point.x}
                  y={reference.point.y}
                  textAnchor={reference.anchor}
                >
                  {node.reference || "?"}
                </text>
                {node.value ? (
                  <text
                    className="component-value"
                    x={value.point.x}
                    y={value.point.y}
                    textAnchor={value.anchor}
                  >
                    {node.value}
                  </text>
                ) : null}
                {symbol.pins.map((pin, pinIndex) => {
                  const point = nodePinPosition(node, symbol, pinIndex);
                  return (
                    <circle
                      key={pin.key}
                      className={`port-pin${wireDraft ? " is-snapping" : ""}`}
                      cx={point.x}
                      cy={point.y}
                      r="6"
                      data-pin-id={pin.key}
                      onPointerDown={(event) => beginPinPointer(event, node, pinIndex)}
                    />
                  );
                })}
                {networkHighlighted
                  ? symbol.pins.map((pin, pinIndex) => {
                    const point = nodePinPosition(node, symbol, pinIndex);
                    return <circle key={`net-${pin.key}`} className="net-pin" cx={point.x} cy={point.y} r="4" />;
                  })
                  : null}
              </g>
            );
          })}
        </g>

        <g className="junction-layer">
          {connectivity.junctionPoints.map((point, index) => {
            const explicit = page.junctions.some((junction) => pointsEqual(junction, point, 0.5));
            return (
              <g key={`${point.x}_${point.y}_${index}`} className="junction">
                {explicit ? (
                  <circle className="junction-ring" cx={point.x} cy={point.y} r="7" />
                ) : null}
                <circle
                  cx={point.x}
                  cy={point.y}
                  r="4.4"
                  className={explicit ? "junction-explicit" : "junction-auto"}
                />
              </g>
            );
          })}
        </g>

        <g className="annotation-layer">
          {page.annotations.map((annotation) => {
            const network = connectivity.networkIdByAnnotation.get(annotation.id);
            const highlighted = network ? highlightedNetworks.has(network) : false;
            return (
              <text
                key={annotation.id}
                className={`annotation annotation-${annotation.kind}${isSelected(selection, "annotation", annotation.id) ? " is-selected" : ""}${highlighted ? " is-net-highlighted" : ""}`}
                x={annotation.x}
                y={annotation.y}
                fontSize={annotation.size}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  if (placementSymbol) {
                    onPlace(snapPoint(clientToSvg(event)));
                  } else if (tool === "select") {
                    onSelectionChange(
                      selectionWith(selection, { kind: "annotation", id: annotation.id }, event.shiftKey),
                    );
                  }
                }}
                onPointerEnter={() => setHovered({ kind: "annotation", id: annotation.id })}
                onPointerLeave={() => setHovered(null)}
              >
                {annotation.kind === "net" ? `⌁ ${annotation.text}` : annotation.text}
              </text>
            );
          })}
        </g>

        {wireDraft ? (
          <g className="wire-draft" pointerEvents="none">
            <path d={pathData(orthogonalPath(wireDraft.start, wireDraft.current))} fill="none" />
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
      </svg>
      <div className="canvas-controls" aria-label="Canvas view controls">
        <button type="button" onClick={() => zoomAt(window.innerWidth / 2, window.innerHeight / 2, 1.2)}>
          Zoom in
        </button>
        <button type="button" onClick={() => setView({ x: 0, y: 0, width: BASE_WIDTH, height: BASE_HEIGHT })}>
          {zoomPercent}%
        </button>
        <button type="button" onClick={() => zoomAt(window.innerWidth / 2, window.innerHeight / 2, 1 / 1.2)}>
          Zoom out
        </button>
      </div>
      <div className="canvas-axis-label">Grid 10 · Ctrl+wheel zoom · Space drag</div>
    </div>
  );
}
