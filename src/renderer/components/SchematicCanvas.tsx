import {
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  buildConnectivity,
  selectedNetworkIds,
} from "../../core/connectivity";
import {
  distance,
  nodeBounds,
  nodePinPosition,
  orthogonalPath,
  pointsEqual,
  roundToGrid,
  segmentIntersection,
  snapPoint,
  symbolTransform,
} from "../../core/geometry";
import type {
  Annotation,
  Point,
  SchematicCell,
  SelectionRef,
  SymbolDefinition,
} from "../../core/model";
import type { EditorTool } from "./Toolbar";

const VIEW_WIDTH = 1600;
const VIEW_HEIGHT = 1000;
const SNAP_PIXELS = 13;

interface SchematicCanvasProps {
  cell: SchematicCell;
  library: readonly SymbolDefinition[];
  tool: EditorTool;
  placementSymbol: SymbolDefinition | null;
  selection: readonly SelectionRef[];
  onSelectionChange: (selection: SelectionRef[]) => void;
  onPlace: (point: Point) => void;
  onAddWire: (points: Point[]) => void;
  onAddJunction: (point: Point) => void;
  onAddAnnotation: (kind: Annotation["kind"], point: Point) => void;
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

export function SchematicCanvas({
  cell,
  library,
  tool,
  placementSymbol,
  selection,
  onSelectionChange,
  onPlace,
  onAddWire,
  onAddJunction,
  onAddAnnotation,
  onMoveSelected,
}: SchematicCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [marquee, setMarquee] = useState<MarqueeState | null>(null);
  const [wireDraft, setWireDraft] = useState<WireDraft | null>(null);
  const [hovered, setHovered] = useState<SelectionRef | null>(null);
  const symbols = useMemo(() => new Map(library.map((symbol) => [symbol.id, symbol])), [library]);
  const connectivity = useMemo(() => buildConnectivity(cell, library), [cell, library]);

  const highlightedNetworks = useMemo(() => {
    const networks = selectedNetworkIds(connectivity, selection);
    const relevant = hovered ? [...selection, hovered] : selection;
    for (const item of relevant) {
      if (item.kind !== "node") {
        continue;
      }
      const node = cell.nodes.find((candidate) => candidate.id === item.id);
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
  }, [connectivity, selection, hovered, cell.nodes, symbols]);

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

  function snapWirePoint(point: Point): Point {
    let closestPin: Point | null = null;
    let closestPinDistance = SNAP_PIXELS;
    for (const node of cell.nodes) {
      const symbol = symbols.get(node.symbolId);
      if (!symbol) {
        continue;
      }
      symbol.pins.forEach((_pin, index) => {
        const pin = nodePinPosition(node, symbol, index);
        const candidateDistance = distance(point, pin);
        if (candidateDistance < closestPinDistance) {
          closestPin = pin;
          closestPinDistance = candidateDistance;
        }
      });
    }
    if (closestPin) {
      return { x: (closestPin as Point).x, y: (closestPin as Point).y };
    }

    let closest: Point | null = null;
    let closestDistance = SNAP_PIXELS;
    for (const segment of connectivity.segments) {
      for (const candidate of [segment.start, segment.end]) {
        const candidateDistance = distance(point, candidate);
        if (candidateDistance < closestDistance) {
          closest = candidate;
          closestDistance = candidateDistance;
        }
      }
      if (point.x === segment.start.x && point.x === segment.end.x) {
        const start = Math.min(segment.start.y, segment.end.y);
        const end = Math.max(segment.start.y, segment.end.y);
        if (point.y >= start - SNAP_PIXELS && point.y <= end + SNAP_PIXELS) {
          const candidate = { x: segment.start.x, y: Math.max(start, Math.min(end, point.y)) };
          const candidateDistance = Math.abs(point.y - candidate.y);
          if (candidateDistance < closestDistance) {
            closest = candidate;
            closestDistance = candidateDistance;
          }
        }
      }
      if (point.y === segment.start.y && point.y === segment.end.y) {
        const start = Math.min(segment.start.x, segment.end.x);
        const end = Math.max(segment.start.x, segment.end.x);
        if (point.x >= start - SNAP_PIXELS && point.x <= end + SNAP_PIXELS) {
          const candidate = { x: Math.max(start, Math.min(end, point.x)), y: segment.start.y };
          const candidateDistance = Math.abs(point.x - candidate.x);
          if (candidateDistance < closestDistance) {
            closest = candidate;
            closestDistance = candidateDistance;
          }
        }
      }
    }
    return closest ? { ...closest } : snapPoint(point);
  }

  function beginNodePointer(
    event: ReactPointerEvent<SVGGElement>,
    nodeId: string,
  ): void {
    event.stopPropagation();
    const point = clientToSvg(event);
    if (placementSymbol) {
      onPlace(snapPoint(point));
      return;
    }
    if (tool === "wire") {
      const start = snapWirePoint(point);
      event.currentTarget.setPointerCapture(event.pointerId);
      setWireDraft({ start, current: start });
      return;
    }
    if (tool === "junction") {
      onAddJunction(snapPoint(point));
      return;
    }
    if (tool === "net-label") {
      onAddAnnotation("net", snapWirePoint(point));
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

  function beginWire(
    event: ReactPointerEvent<SVGSVGElement>,
    segmentId?: string,
  ): void {
    const point = clientToSvg(event);
    if (placementSymbol) {
      onPlace(snapPoint(point));
      return;
    }
    if (tool === "wire") {
      event.currentTarget.setPointerCapture(event.pointerId);
      const start = snapWirePoint(point);
      setWireDraft({ start, current: start });
      return;
    }
    if (tool === "junction") {
      onAddJunction(snapPoint(point));
      return;
    }
    if (tool === "net-label") {
      onAddAnnotation("net", snapWirePoint(point));
      return;
    }
    if (tool === "text") {
      onAddAnnotation("text", snapPoint(point));
      return;
    }
    if (tool !== "select") {
      return;
    }

    if (segmentId) {
      onSelectionChange(
        selectionWith(selection, { kind: "wire", id: segmentId }, event.shiftKey),
      );
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
    if (drag) {
      let delta = {
        x: roundToGrid(point.x - drag.origin.x),
        y: roundToGrid(point.y - drag.origin.y),
      };
      if (event.shiftKey) {
        if (Math.abs(delta.x) >= Math.abs(delta.y)) {
          delta = { x: delta.x, y: 0 };
        } else {
          delta = { x: 0, y: delta.y };
        }
      }
      setDrag({ ...drag, current: point, delta });
    } else if (wireDraft) {
      setWireDraft({ ...wireDraft, current: snapWirePoint(point) });
    } else if (marquee) {
      setMarquee({ ...marquee, current: point });
    }
  }

  function endPointer(): void {
    if (drag) {
      if (drag.delta.x !== 0 || drag.delta.y !== 0) {
        onMoveSelected(drag.delta);
      }
      setDrag(null);
    } else if (wireDraft) {
      if (!pointsEqual(wireDraft.start, wireDraft.current, 0.1)) {
        onAddWire(orthogonalPath(wireDraft.start, wireDraft.current));
      }
      setWireDraft(null);
    } else if (marquee) {
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
    for (const node of cell.nodes) {
      const symbol = symbols.get(node.symbolId);
      if (!symbol) {
        continue;
      }
      const bounds = nodeBounds(node, symbol);
      if (
        bounds.maxX >= minX &&
        bounds.minX <= maxX &&
        bounds.maxY >= minY &&
        bounds.minY <= maxY
      ) {
        add({ kind: "node", id: node.id });
      }
    }
    for (const wire of cell.wires) {
      if (
        wire.points.some(
          (point) => point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY,
        )
      ) {
        add({ kind: "wire", id: wire.id });
      }
    }
    for (const annotation of cell.annotations) {
      if (
        annotation.x >= minX &&
        annotation.x <= maxX &&
        annotation.y >= minY &&
        annotation.y <= maxY
      ) {
        add({ kind: "annotation", id: annotation.id });
      }
    }
    onSelectionChange(next);
  }

  const dragDelta =
    drag && drag.nodeIds.length > 0
      ? drag.delta
      : { x: 0, y: 0 };

  return (
    <div className="canvas-shell" data-testid="schematic-canvas">
      <div className="canvas-ruler canvas-ruler-x" aria-hidden="true">
        <span>0</span>
        <span>400</span>
        <span>800</span>
        <span>1200</span>
      </div>
      <svg
        ref={svgRef}
        className={`schematic-canvas tool-${tool}${placementSymbol ? " is-placing" : ""}`}
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        role="application"
        aria-label={`${cell.name} schematic canvas`}
        onPointerDown={(event) => beginWire(event)}
        onPointerMove={movePointer}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onContextMenu={(event) => {
          event.preventDefault();
          setWireDraft(null);
          setMarquee(null);
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
        <rect width={VIEW_WIDTH} height={VIEW_HEIGHT} fill="#f5f3ec" />
        <rect width={VIEW_WIDTH} height={VIEW_HEIGHT} fill="url(#grid-large)" />

        <g className="wire-layer">
          {cell.wires.map((wire) => {
            const networkId = connectivity.networkIdByWire.get(wire.id);
            const highlighted = networkId ? highlightedNetworks.has(networkId) : false;
            const selected = isSelected(selection, "wire", wire.id);
            return (
              <g
                key={wire.id}
                className={`wire-group${selected ? " is-selected" : ""}${highlighted ? " is-net-highlighted" : ""}`}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  if (placementSymbol) {
                    onPlace(snapPoint(clientToSvg(event)));
                  } else if (tool === "wire") {
                    const point = clientToSvg(event);
                    const start = snapWirePoint(point);
                    event.currentTarget.setPointerCapture(event.pointerId);
                    setWireDraft({ start, current: start });
                  } else if (tool === "junction") {
                    onAddJunction(snapPoint(clientToSvg(event)));
                  } else if (tool === "net-label") {
                    onAddAnnotation("net", snapWirePoint(clientToSvg(event)));
                  } else if (tool === "text") {
                    onAddAnnotation("text", snapPoint(clientToSvg(event)));
                  } else if (tool === "select") {
                    onSelectionChange(
                      selectionWith(
                        selection,
                        { kind: "wire", id: wire.id },
                        event.shiftKey,
                      ),
                    );
                  }
                }}
                onPointerEnter={() => setHovered({ kind: "wire", id: wire.id })}
                onPointerLeave={() => setHovered(null)}
              >
                <path
                  className="wire-hit"
                  d={pathData(wire.points)}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="16"
                />
                <path
                  className="wire-visible"
                  d={pathData(wire.points)}
                  fill="none"
                  strokeWidth={highlighted ? 3.4 : 2.2}
                />
                {selected ? (
                  <path
                    className="wire-selection-outline"
                    d={pathData(wire.points)}
                    fill="none"
                    strokeWidth="7"
                  />
                ) : null}
              </g>
            );
          })}
        </g>

        <g className="component-layer">
          {cell.nodes.map((node) => {
            const symbol = symbols.get(node.symbolId);
            if (!symbol) {
              return (
                <g key={node.id} className="missing-symbol" transform={`translate(${node.x} ${node.y})`}>
                  <rect x="-30" y="-20" width="60" height="40" />
                  <text textAnchor="middle" y="5">
                    Missing symbol
                  </text>
                </g>
              );
            }
            const moving = drag?.nodeIds.includes(node.id) ?? false;
            const selected = isSelected(selection, "node", node.id);
            const bounds = nodeBounds(node, symbol);
            const networkHighlighted = symbol.pins.some((_pin, pinIndex) => {
              const network = connectivity.networkIdByPin.get(`pin:${node.id}:${pinIndex}`);
              return network ? highlightedNetworks.has(network) : false;
            });
            return (
              <g
                key={node.id}
                className={`component-node${selected ? " is-selected" : ""}${networkHighlighted ? " is-net-highlighted" : ""}${moving ? " is-moving" : ""}`}
                data-node-id={node.id}
                transform={
                  moving ? `translate(${dragDelta.x} ${dragDelta.y})` : undefined
                }
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
                  x={node.x + 8}
                  y={node.y - 2}
                >
                  {node.reference || "?"}
                </text>
                {node.value ? (
                  <text className="component-value" x={node.x + 8} y={node.y + 13}>
                    {node.value}
                  </text>
                ) : null}
                {networkHighlighted
                  ? symbol.pins.map((_pin, pinIndex) => {
                      const point = nodePinPosition(node, symbol, pinIndex);
                      return (
                        <circle
                          key={pinIndex}
                          className="net-pin"
                          cx={point.x}
                          cy={point.y}
                          r="4"
                        />
                      );
                    })
                  : null}
              </g>
            );
          })}
        </g>

        <g className="junction-layer">
          {connectivity.junctionPoints.map((point, index) => {
            const explicit = cell.junctions.some((junction) => pointsEqual(junction, point, 0.5));
            return (
              <g key={`${point.x}_${point.y}_${index}`} className="junction">
                <circle cx={point.x} cy={point.y} r="7" fill="#f5f3ec" />
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
          {cell.annotations.map((annotation) => {
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
                      selectionWith(
                        selection,
                        { kind: "annotation", id: annotation.id },
                        event.shiftKey,
                      ),
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
            <path
              d={pathData(orthogonalPath(wireDraft.start, wireDraft.current))}
              fill="none"
            />
            <circle cx={wireDraft.start.x} cy={wireDraft.start.y} r="5" />
            <circle cx={wireDraft.current.x} cy={wireDraft.current.y} r="5" />
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
      <div className="canvas-axis-label">100 mil grid</div>
    </div>
  );
}
