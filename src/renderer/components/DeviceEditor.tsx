import { AlertDialog, Button, Checkbox, TextField, ownsShortcut } from "../ui";
import { FilterSelect } from "./FilterSelect";
import { SvgArtworkEditor, svgArtworkPreview } from "./SvgArtworkEditor";
import type { DeviceActions } from "../deviceWorkspace";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { DeviceLibraryPin, DeviceLibraryRecord } from "../../core/library";
import type { Point, SymbolSide } from "../../core/model";
import {
  arcPath,
  defaultLabelAnchors,
  deviceShapeBounds,
  labelBoundsForArtwork,
  moveShape,
  nextPinId,
  nextShapeId,
  scaleShape,
  snapArtworkShape,
  selectionBoxForArtwork,
  serializeDeviceArtwork,
  snapPinToFrame,
  validateDeviceArtwork,
  type DeviceArtworkShape,
  type DeviceBox,
  type DeviceFrame,
} from "../../core/deviceArtwork";
import { sha256Hex } from "../../core/hash";
import { Icon, type IconName } from "./Icons";

type EditorTool =
  | "select"
  | "line"
  | "polyline"
  | "rect"
  | "circle"
  | "ellipse"
  | "arc"
  | "text"
  | "pin";

type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

interface Snapshot {
  svgBody?: string;
  shapes: DeviceArtworkShape[];
  pins: DeviceLibraryPin[];
}

interface HistoryState {
  past: Snapshot[];
  present: Snapshot;
  future: Snapshot[];
}

interface Selection {
  kind: "shape" | "pin";
  id: string;
}

interface DragState {
  mode: "create" | "move" | "resize" | "pin";
  start: Point;
  original: Snapshot;
  tool?: EditorTool;
  shapeId?: string;
  shapeIds?: string[];
  pinId?: string;
  handle?: ResizeHandle;
}

interface DeviceEditorProps {
  savedRecord?: DeviceLibraryRecord | undefined;
  actions?: React.RefObject<DeviceActions | null> | undefined;
  onDirty?: ((dirty: boolean) => void) | undefined;
  initial: DeviceLibraryRecord;
  mode: "create" | "edit" | "clone";
  artworkLocked: boolean;
  onSave: (record: DeviceLibraryRecord) => void;
  onCancel: () => void;
}

const DIRECTION_LABELS: Record<SymbolSide, string> = {
  north: "North",
  east: "East",
  south: "South",
  west: "West",
};

const TOOLS: { tool: EditorTool; label: string; title: string; icon: IconName }[] = [
  { tool: "select", label: "Select", title: "Select and move shapes (V)", icon: "select" },
  { tool: "line", label: "Line", title: "Draw a line", icon: "line" },
  { tool: "polyline", label: "Poly", title: "Draw connected lines; finish with Enter", icon: "polyline" },
  { tool: "rect", label: "Rect", title: "Draw a rectangle", icon: "rectangle" },
  { tool: "circle", label: "Circle", title: "Draw a circle", icon: "circle" },
  { tool: "ellipse", label: "Ellipse", title: "Draw an ellipse", icon: "ellipse" },
  { tool: "arc", label: "Arc", title: "Draw an arc from a center point", icon: "arc" },
  { tool: "text", label: "Text", title: "Add a text label", icon: "text" },
  { tool: "pin", label: "Pin", title: "Add a pin on the nearest frame edge", icon: "pin" },
];

const TOOL_GROUPS: { label: string; tools: EditorTool[] }[] = [
  { label: "Edit", tools: ["select"] },
  { label: "Draw", tools: ["line", "polyline", "rect", "circle", "ellipse", "arc", "text"] },
  { label: "Connect", tools: ["pin"] },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function snapValue(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function parseKeywords(value: string): string[] {
  return [...new Set(
    value
      .split(",")
      .map((term) => term.trim().toLowerCase())
      .filter(Boolean),
  )];
}

function pointDistance(left: Point, right: Point): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function normalizeBox(start: Point, current: Point): DeviceBox {
  return {
    x: Math.min(start.x, current.x),
    y: Math.min(start.y, current.y),
    width: Math.abs(current.x - start.x),
    height: Math.abs(current.y - start.y),
  };
}

function createShapeFromDrag(
  tool: EditorTool,
  start: Point,
  current: Point,
  existing: readonly DeviceArtworkShape[],
): DeviceArtworkShape | null {
  const box = normalizeBox(start, current);
  const id = nextShapeId(existing);
  switch (tool) {
    case "line":
      if (pointDistance(start, current) < 0.5) {
        return null;
      }
      return {
        id,
        kind: "line",
        x1: start.x,
        y1: start.y,
        x2: current.x,
        y2: current.y,
      };
    case "rect":
      if (box.width < 0.5 || box.height < 0.5) {
        return null;
      }
      return { id, kind: "rect", ...box };
    case "circle": {
      const r = Math.min(box.width, box.height) / 2;
      if (r < 0.5) {
        return null;
      }
      return snapArtworkShape({
        id,
        kind: "circle",
        cx: box.x + box.width / 2,
        cy: box.y + box.height / 2,
        r,
      });
    }
    case "ellipse":
      if (box.width < 0.5 || box.height < 0.5) {
        return null;
      }
      return snapArtworkShape({
        id,
        kind: "ellipse",
        cx: box.x + box.width / 2,
        cy: box.y + box.height / 2,
        rx: box.width / 2,
        ry: box.height / 2,
      });
    case "arc": {
      const r = pointDistance(start, current);
      if (r < 0.5) {
        return null;
      }
      return snapArtworkShape({
        id,
        kind: "arc",
        cx: start.x,
        cy: start.y,
        r,
        startAngle: 0,
        endAngle:
          (Math.atan2(current.y - start.y, current.x - start.x) * 180) /
          Math.PI,
      });
    }
    default:
      return null;
  }
}

function hitShape(shape: DeviceArtworkShape) {
  const common = {
    "data-shape-id": shape.id,
    stroke: "transparent",
    strokeWidth: Math.max(8, (shape.strokeWidth ?? 1.6) + 6),
    fill: "none",
    style: { pointerEvents: "stroke" as const },
  };
  switch (shape.kind) {
    case "line":
      return (
        <line
          {...common}
          x1={shape.x1}
          y1={shape.y1}
          x2={shape.x2}
          y2={shape.y2}
        />
      );
    case "polyline":
      return (
        <polyline
          {...common}
          points={shape.points.map((point) => `${point.x},${point.y}`).join(" ")}
        />
      );
    case "rect":
      return (
        <rect
          {...common}
          x={shape.x}
          y={shape.y}
          width={shape.width}
          height={shape.height}
          fill="transparent"
          style={{ pointerEvents: "all" }}
        />
      );
    case "circle":
      return (
        <circle
          {...common}
          cx={shape.cx}
          cy={shape.cy}
          r={shape.r}
          fill="transparent"
          style={{ pointerEvents: "all" }}
        />
      );
    case "ellipse":
      return (
        <ellipse
          {...common}
          cx={shape.cx}
          cy={shape.cy}
          rx={shape.rx}
          ry={shape.ry}
          fill="transparent"
          style={{ pointerEvents: "all" }}
        />
      );
    case "arc":
      return <path {...common} d={arcPath(shape)} />;
    case "text": {
      const bounds = deviceShapeBounds(shape);
      return (
        <rect
          data-shape-id={shape.id}
          x={bounds.x}
          y={bounds.y}
          width={Math.max(4, bounds.width)}
          height={Math.max(4, bounds.height)}
          fill="transparent"
          stroke="none"
          style={{ pointerEvents: "all" }}
        />
      );
    }
  }
}

function NumericField({
  label,
  value,
  onChange,
  step = 1,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <label className="device-editor-field">
      <span>{label}</span>
      <TextField.Root
        type="number"
        value={Number.isFinite(value) ? value : 0}
        step={step}
        min={min}
        max={max}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) {
            onChange(next);
          }
        }}
      />
    </label>
  );
}

function shapeLabel(shape: DeviceArtworkShape): string {
  switch (shape.kind) {
    case "line":
      return "Line";
    case "polyline":
      return shape.closed ? "Polygon" : "Polyline";
    case "rect":
      return "Rectangle";
    case "circle":
      return "Circle";
    case "ellipse":
      return "Ellipse";
    case "arc":
      return "Arc";
    case "text":
      return "Text";
  }
}

export function DeviceEditor({
  initial,
  mode,
  artworkLocked,
  onSave,
  onCancel, actions, onDirty, savedRecord,
}: DeviceEditorProps) {
  const initialCenter = {
    x: initial.frame.x + initial.frame.width / 2,
    y: initial.frame.y + initial.frame.height / 2,
  };
  const initialShapes = initial.artwork.shapes ?? [];
  const initialPins = initial.pins.map((pin) => ({
    ...pin,
    x: pin.x + initialCenter.x,
    y: pin.y + initialCenter.y,
  }));
  const [history, setHistory] = useState<HistoryState>({
    past: [],
    present: { shapes: initialShapes, pins: initialPins, ...(artworkLocked ? { svgBody: initial.artwork.baseBody ?? initial.artwork.body } : {}) },
    future: [],
  });
  const [preview, setPreview] = useState<Snapshot | null>(null);
  const previewRef = useRef<Snapshot | null>(null);
  const [tool, setTool] = useState<EditorTool>("select");
  const [svgSelection, setSvgSelection] = useState(-1);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [selectedShapeIds, setSelectedShapeIds] = useState<string[]>([]);
  const [pendingPolyline, setPendingPolyline] = useState<Point[]>([]);
  const [title, setTitle] = useState(initial.title);
  const [category, setCategory] = useState(initial.category);
  const [keywordsText, setKeywordsText] = useState(initial.keywords.join(", "));
  const [frameWidth, setFrameWidth] = useState(initial.frame.width);
  const [frameHeight, setFrameHeight] = useState(initial.frame.height);
  const [electrical, setElectrical] = useState(initial.electrical);
  const [palette, setPalette] = useState(initial.palette);
  const [spicePrefix, setSpicePrefix] = useState(initial.spice.prefix);
  const [spiceDefault, setSpiceDefault] = useState(initial.spice.defaultValue);
  const [spiceSupported, setSpiceSupported] = useState(initial.spice.supported);
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmBack, setConfirmBack] = useState(false);
  const [pixelsPerUnit, setPixelsPerUnit] = useState(10);
  const dragRef = useRef<DragState | null>(null);
  const canvasRef = useRef<SVGSVGElement | null>(null);

  const frame = useMemo<DeviceFrame>(
    () => ({
      x: -frameWidth / 2,
      y: -frameHeight / 2,
      width: frameWidth,
      height: frameHeight,
    }),
    [frameHeight, frameWidth],
  );

  useEffect(() => {
    const svg = canvasRef.current;
    if (!svg) {
      return;
    }
    const update = () => {
      const rect = svg.getBoundingClientRect();
      const scale = Math.min(
        rect.width / Math.max(0.1, frame.width),
        rect.height / Math.max(0.1, frame.height),
      );
      if (Number.isFinite(scale) && scale > 0) {
        setPixelsPerUnit(scale);
      }
    };
    update();
    window.addEventListener("resize", update);
    if (typeof ResizeObserver === "undefined") {
      return () => window.removeEventListener("resize", update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(svg);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [frame.height, frame.width]);
  const snapshot = preview ?? history.present;
  const draftFingerprint = JSON.stringify({
    artwork: history.present,
    title,
    category,
    keywordsText,
    frameWidth,
    frameHeight,
    electrical,
    palette,
    spicePrefix,
    spiceDefault,
    spiceSupported,
  });
  const [savedFingerprint, setSavedFingerprint] = useState(draftFingerprint);
  const isDirty = draftFingerprint !== savedFingerprint;
  const updatePreview = (next: Snapshot) => {
    previewRef.current = next;
    setPreview(next);
  };
  const clearPreview = () => {
    previewRef.current = null;
    setPreview(null);
  };
  const handleSize = 8 / pixelsPerUnit;
  const handleHit = 16 / pixelsPerUnit;
  const pinRadius = 3.5 / pixelsPerUnit;
  const pinHit = 9 / pixelsPerUnit;
  const gridLabelSize = Math.min(10 / pixelsPerUnit, frame.height * 0.06);
  const pinTick = 7 / pixelsPerUnit;
  const snap = (value: number): number => snapValue(value, 1);
  const selectedShape =
    selection?.kind === "shape" && selectedShapeIds.length <= 1
      ? snapshot.shapes.find((shape) => shape.id === selection.id) ?? null
      : null;
  const selectedPin =
    selection?.kind === "pin"
      ? snapshot.pins.find((pin) => pin.id === selection.id) ?? null
      : null;

  const commit = useCallback((next: Snapshot) => {
    setHistory((current) => ({
      past: [...current.past, current.present],
      present: next,
      future: [],
    }));
    previewRef.current = null;
    setPreview(null);
  }, []);

  const undo = useCallback(() => {
    setHistory((current) => {
      const previous = current.past.at(-1);
      if (!previous) {
        return current;
      }
      return {
        past: current.past.slice(0, -1),
        present: previous,
        future: [current.present, ...current.future],
      };
    });
    previewRef.current = null;
    setPreview(null);
  }, []);

  const redo = useCallback(() => {
    setHistory((current) => {
      const next = current.future[0];
      if (!next) {
        return current;
      }
      return {
        past: [...current.past, current.present],
        present: next,
        future: current.future.slice(1),
      };
    });
    previewRef.current = null;
    setPreview(null);
  }, []);

  const pointFromEvent = useCallback(
    (event: React.PointerEvent<SVGSVGElement> | React.MouseEvent<SVGSVGElement>): Point => {
      const svg = canvasRef.current;
      if (!svg) {
        return { x: 0, y: 0 };
      }
      const rect = svg.getBoundingClientRect();
      const scale = Math.min(
        rect.width / Math.max(0.1, frame.width),
        rect.height / Math.max(0.1, frame.height),
      );
      const offsetX = (rect.width - frame.width * scale) / 2;
      const offsetY = (rect.height - frame.height * scale) / 2;
      return {
        x: frame.x + (event.clientX - rect.left - offsetX) / scale,
        y: frame.y + (event.clientY - rect.top - offsetY) / scale,
      };
    },
    [frame.height, frame.width, frame.x, frame.y],
  );

  const updateShape = (shape: DeviceArtworkShape) => {
    commit({
      ...snapshot,
      shapes: snapshot.shapes.map((candidate) =>
        candidate.id === shape.id ? snapArtworkShape(shape) : candidate,
      ),
    });
  };

  const updatePin = (pin: DeviceLibraryPin) => {
    const previous = snapshot.pins.find(candidate => candidate.id === pin.id);
    const gridded = previous && (previous.x !== pin.x || previous.y !== pin.y)
      ? { ...pin, x: snapValue(pin.x, 10), y: snapValue(pin.y, 10) }
      : pin;
    commit({
      ...snapshot,
      pins: snapshot.pins.map((candidate) =>
        candidate.id === pin.id ? gridded : candidate,
      ),
    });
  };

  const deleteSelection = useCallback(() => {
    if (!selection) {
      return;
    }
    if (selection.kind === "shape") {
      const ids = selectedShapeIds.length ? selectedShapeIds : [selection.id];
      commit({
        ...history.present,
        shapes: history.present.shapes.filter(
          (shape) => !ids.includes(shape.id),
        ),
      });
    } else {
      commit({
        ...history.present,
        pins: history.present.pins.filter((pin) => pin.id !== selection.id),
      });
    }
    setSelection(null);
    setSelectedShapeIds([]);
  }, [commit, history.present, selection, selectedShapeIds]);

  const finishPolyline = useCallback(() => {
    if (pendingPolyline.length < 2) {
      setPendingPolyline([]);
      return;
    }
    const id = nextShapeId(history.present.shapes);
    commit({
      ...history.present,
      shapes: [
        ...history.present.shapes,
        { id, kind: "polyline", points: pendingPolyline },
      ],
    });
    setPendingPolyline([]);
    setSelection({ kind: "shape", id });
    setTool("select");
  }, [commit, history.present, pendingPolyline]);

  const addPin = (point: Point) => {
    const snapped = snapPinToFrame(point, frame);
    const id = nextPinId(history.present.pins);
    const label = String(history.present.pins.length + 1);
    const pin: DeviceLibraryPin = {
      id,
      key: label,
      name: label,
      role: "passive",
      direction: snapped.direction,
      side: snapped.direction,
      x: snapped.x,
      y: snapped.y,
    };
    commit({
      ...history.present,
      pins: [...history.present.pins, pin],
    });
    setSelection({ kind: "pin", id });
    setTool("select");
  };

  const addText = (point: Point) => {
    const id = nextShapeId(history.present.shapes);
    commit({
      ...history.present,
      shapes: [
        ...history.present.shapes,
        {
          id,
          kind: "text",
          x: point.x,
          y: point.y,
          text: "TEXT",
          fontSize: 10,
          anchor: "middle",
        },
      ],
    });
    setSelection({ kind: "shape", id });
    setTool("select");
  };

  const startDrag = (
    event: React.PointerEvent<SVGSVGElement>,
    drag: Omit<DragState, "start" | "original">,
    start: Point,
  ) => {
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic pointers and some platforms do not support capture.
    }
    dragRef.current = {
      ...drag,
      start,
      original: history.present,
    };
  };

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) {
      return;
    }
    const rawPoint = pointFromEvent(event);
    const point = { x: snap(rawPoint.x), y: snap(rawPoint.y) };
    if (tool === "select") {
      const target = event.target as SVGElement;
      const handle = target.dataset.handle as ResizeHandle | undefined;
      if (handle && selectedBounds && selection?.kind === "shape") {
        startDrag(
          event,
          {
            mode: "resize",
            shapeId: selection.id,
            shapeIds: selectedShapeIds.length ? selectedShapeIds : [selection.id],
            handle,
          },
          point,
        );
        return;
      }
      const pinId = target.dataset.pinId;
      if (pinId) {
        setSelectedShapeIds([]);
        setSelection({ kind: "pin", id: pinId });
        startDrag(event, { mode: "pin", pinId }, point);
        return;
      }
      const shapeId = target.dataset.shapeId;
      if (shapeId) {
        if (event.shiftKey) {
          const next = selectedShapeIds.includes(shapeId)
            ? selectedShapeIds.filter(id => id !== shapeId)
            : [...selectedShapeIds, shapeId];
          setSelectedShapeIds(next);
          setSelection(next.length ? { kind: "shape", id: next[0]! } : null);
          return;
        }
        const ids = selectedShapeIds.includes(shapeId) ? selectedShapeIds : [shapeId];
        setSelectedShapeIds(ids);
        setSelection({ kind: "shape", id: shapeId });
        startDrag(event, { mode: "move", shapeId, shapeIds: ids }, point);
        return;
      }
      setSelection(null);
      setSelectedShapeIds([]);
      return;
    }
    if (tool === "pin") {
      addPin(rawPoint);
      return;
    }
    if (tool === "text") {
      addText(point);
      return;
    }
    if (tool === "polyline") {
      setPendingPolyline((current) => [...current, point]);
      return;
    }
    startDrag(event, { mode: "create", tool }, point);
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) {
      return;
    }
    const rawPoint = pointFromEvent(event);
    const point = { x: snap(rawPoint.x), y: snap(rawPoint.y) };
    if (drag.mode === "create" && drag.tool) {
      const shape = createShapeFromDrag(
        drag.tool,
        drag.start,
        point,
        drag.original.shapes,
      );
      updatePreview(
        shape
          ? { ...drag.original, shapes: [...drag.original.shapes, shape] }
          : drag.original,
      );
      return;
    }
    if (drag.mode === "move" && drag.shapeId) {
      const delta = {
        x: snap(point.x - drag.start.x),
        y: snap(point.y - drag.start.y),
      };
      updatePreview({
        ...drag.original,
        shapes: drag.original.shapes.map((shape) =>
          (drag.shapeIds ?? [drag.shapeId]).includes(shape.id) ? moveShape(shape, delta) : shape,
        ),
      });
      return;
    }
    if (drag.mode === "resize" && drag.shapeId && drag.handle) {
      const targetIds = drag.shapeIds ?? [drag.shapeId];
      const targetShapes = drag.original.shapes.filter(candidate => targetIds.includes(candidate.id));
      if (!targetShapes.length) {
        return;
      }
      const boxes = targetShapes.map(deviceShapeBounds);
      const left = Math.min(...boxes.map(box => box.x));
      const top = Math.min(...boxes.map(box => box.y));
      const right = Math.max(...boxes.map(box => box.x + box.width));
      const bottom = Math.max(...boxes.map(box => box.y + box.height));
      const bounds = { x: left, y: top, width: right - left, height: bottom - top };
      const anchor = {
        x: drag.handle.includes("w")
          ? bounds.x + bounds.width
          : drag.handle.includes("e")
            ? bounds.x
            : bounds.x + bounds.width / 2,
        y: drag.handle.includes("n")
          ? bounds.y + bounds.height
          : drag.handle.includes("s")
            ? bounds.y
            : bounds.y + bounds.height / 2,
      };
      const baseX =
        drag.handle.includes("w")
          ? bounds.x
          : drag.handle.includes("e")
            ? bounds.x + bounds.width
            : bounds.x + bounds.width / 2;
      const baseY =
        drag.handle.includes("n")
          ? bounds.y
          : drag.handle.includes("s")
            ? bounds.y + bounds.height
            : bounds.y + bounds.height / 2;
      const scaleX =
        drag.handle.includes("w") || drag.handle.includes("e")
          ? clamp((point.x - anchor.x) / (baseX - anchor.x || 1), 0.05, 20)
          : 1;
      const scaleY =
        drag.handle.includes("n") || drag.handle.includes("s")
          ? clamp((point.y - anchor.y) / (baseY - anchor.y || 1), 0.05, 20)
          : 1;
      updatePreview({
        ...drag.original,
        shapes: drag.original.shapes.map((candidate) =>
          targetIds.includes(candidate.id)
            ? snapArtworkShape(scaleShape(candidate, anchor, scaleX, scaleY))
            : candidate,
        ),
      });
      return;
    }
    if (drag.mode === "pin" && drag.pinId) {
      const snapped = snapPinToFrame(rawPoint, frame);
      updatePreview({
        ...drag.original,
        pins: drag.original.pins.map((pin) =>
          pin.id === drag.pinId
            ? {
                ...pin,
                x: snapped.x,
                y: snapped.y,
                direction: snapped.direction,
                side: snapped.direction,
              }
            : pin,
        ),
      });
    }
  };

  const handlePointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) {
      return;
    }
    dragRef.current = null;
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Capture is optional for synthetic and unsupported pointers.
    }
    const next = previewRef.current;
    if (!next) {
      clearPreview();
      return;
    }
    let changed = false;
    if (drag.mode === "create") {
      changed = next.shapes.length !== drag.original.shapes.length;
    } else if (drag.mode === "move" || drag.mode === "resize") {
      changed =
        JSON.stringify(next.shapes) !== JSON.stringify(drag.original.shapes);
    } else {
      changed = JSON.stringify(next.pins) !== JSON.stringify(drag.original.pins);
    }
    if (changed) {
      commit(next);
      if (drag.mode === "create") {
        const created = next.shapes.at(-1);
        if (created) {
          setSelection({ kind: "shape", id: created.id });
        }
        setTool("select");
      }
    } else {
      clearPreview();
    }
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (ownsShortcut(event)) return;
      if (confirmBack) {
        if (event.key === "Escape") {
          setConfirmBack(false);
          event.preventDefault();
        }
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }
      if ((event.ctrlKey || event.metaKey) && key === "y") {
        event.preventDefault();
        redo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && key === "a" && tool === "select") {
        event.preventDefault();
        if (snapshot.shapes.length) {
          setSelectedShapeIds(snapshot.shapes.map(shape => shape.id));
          setSelection({ kind: "shape", id: snapshot.shapes[0]!.id });
        } else if (artworkLocked) setSvgSelection(-2);
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (selection) {
          event.preventDefault();
          deleteSelection();
        }
        return;
      }
      if (event.key === "Enter" && pendingPolyline.length > 0) {
        event.preventDefault();
        finishPolyline();
        return;
      }
      if (event.key === "Escape") {
        if (dragRef.current) {
          dragRef.current = null;
          clearPreview();
        } else if (pendingPolyline.length > 0) {
          setPendingPolyline([]);
        } else if (selection) {
          setSelection(null);
        } else {
          if (isDirty) setConfirmBack(true);
          else onCancel();
        }
        event.preventDefault();
        return;
      }
      if (!event.ctrlKey && !event.metaKey && !event.altKey) {
        if (key === "v") {
          setTool("select");
        } else if (key === "l") {
          setTool("line");
        } else if (key === "r") {
          setTool("rect");
        } else if (key === "c") {
          setTool("circle");
        } else if (key === "t") {
          setTool("text");
        } else if (key === "p") {
          setTool("pin");
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    deleteSelection,
    finishPolyline,
    confirmBack,
    isDirty,
    onCancel,
    pendingPolyline.length,
    redo,
    selection,
    snapshot.shapes,
    artworkLocked,
    tool,
    undo,
  ]);

  const save = () => {
    const shapes = snapshot.shapes;
    const pins = snapshot.pins.map((pin) => ({
      ...pin,
      key: pin.key || pin.name || pin.id,
      side: pin.direction,
    }));
    const validation = validateDeviceArtwork(shapes, pins, frame, {
      requireShapes: !artworkLocked,
      shapeGrid: 1,
      pinGrid: 10,
      pinGridExemptIds: new Set(pins.filter(pin => initialPins.some(original =>
        original.id === pin.id && original.x === pin.x && original.y === pin.y)).map(pin => pin.id)),
    });
    const nextErrors = [...validation];
    if (!title.trim()) {
      nextErrors.push("Device title is required.");
    }
    const body = artworkLocked
      ? (snapshot.svgBody ?? initial.artwork.baseBody ?? initial.artwork.body) + serializeDeviceArtwork(shapes)
      : serializeDeviceArtwork(shapes);
    if (!body) {
      nextErrors.push("Device artwork is empty.");
    }
    setErrors(nextErrors);
    if (nextErrors.length > 0) {
      return false;
    }
    const svgChanged = artworkLocked && body !== initial.artwork.body;
    const selectionBox = svgChanged ? { ...frame } : artworkLocked
      ? initial.selectionBox ??
        selectionBoxForArtwork([], pins, { x: 0, y: 0 })
      : selectionBoxForArtwork(shapes, pins, { x: 0, y: 0 });
    const labelBounds = svgChanged ? { ...frame } : artworkLocked
      ? initial.labelBounds
      : labelBoundsForArtwork(shapes, { x: 0, y: 0 });
    const labelAnchors = svgChanged ? defaultLabelAnchors(frame) : artworkLocked
      ? initial.labelAnchors
      : defaultLabelAnchors(selectionBox);
    const viewBox = `${frame.x} ${frame.y} ${frame.width} ${frame.height}`;
    onSave({
      ...initial,
      title: title.trim(),
      category: category.trim() || "custom",
      keywords: parseKeywords(keywordsText),
      electrical,
      palette,
      frame,
      ...(selectionBox ? { selectionBox } : {}),
      ...(labelBounds ? { labelBounds } : {}),
      artwork: {
        type: "svg",
        viewBox,
        body,
        ...(artworkLocked ? { baseBody: snapshot.svgBody ?? initial.artwork.baseBody ?? initial.artwork.body } : {}),
        ...(shapes.length > 0 ? { shapes } : {}),
        source: initial.artwork.source || "custom.svg",
        sourceSha256: sha256Hex(body),
      },
      pins,
      labelAnchors,
      spice: {
        prefix: spicePrefix.trim(),
        defaultValue: spiceDefault,
        supported: spiceSupported,
      },
      metadata: {
        ...initial.metadata,
        sourceCollection: "user",
        sourceRevision: null,
      },
    });
    setSavedFingerprint(draftFingerprint);
    return true;
  };

  React.useLayoutEffect(() => {
    onDirty?.(isDirty);
    return () => onDirty?.(false);
  }, [isDirty, onDirty]);
  React.useLayoutEffect(() => {
    if (!actions) return;
    actions.current = { save: () => (mode === "edit" && !isDirty) || save(), undo, redo, remove: deleteSelection };
    return () => { actions.current = null; };
  });

  const onDisk = useMemo(() => savedRecord !== undefined &&
    (savedRecord === initial || JSON.stringify(savedRecord) === JSON.stringify(initial)), [initial, savedRecord]);
  const saveState = isDirty ? "Edits only in this editor"
    : mode === "create" ? "New device · editor only"
    : mode === "clone" ? "New clone · editor only"
    : onDisk ? "Device saved to disk" : "Saved to library draft · not on disk";
  const requestBack = () => {
    if (isDirty) setConfirmBack(true);
    else onCancel();
  };

  const grid = useMemo(() => {
    const minorStep = Math.max(
      1,
      Math.round(Math.max(frame.width, frame.height) / 80),
    );
    const majorStep = 10;
    const minor: { x1: number; y1: number; x2: number; y2: number }[] = [];
    const major: typeof minor = [];
    const majorX: number[] = [];
    const majorY: number[] = [];
    const limit = 400;
    for (
      let x = Math.ceil(frame.x / minorStep) * minorStep;
      x <= frame.x + frame.width + 0.001 &&
      minor.length + major.length < limit;
      x += minorStep
    ) {
      const isMajor =
        Math.abs(x - Math.round(x / majorStep) * majorStep) < 1e-6;
      const line = { x1: x, y1: frame.y, x2: x, y2: frame.y + frame.height };
      if (isMajor) {
        major.push(line);
        majorX.push(x);
      } else {
        minor.push(line);
      }
    }
    for (
      let y = Math.ceil(frame.y / minorStep) * minorStep;
      y <= frame.y + frame.height + 0.001 &&
      minor.length + major.length < limit * 2;
      y += minorStep
    ) {
      const isMajor =
        Math.abs(y - Math.round(y / majorStep) * majorStep) < 1e-6;
      const line = { x1: frame.x, y1: y, x2: frame.x + frame.width, y2: y };
      if (isMajor) {
        major.push(line);
        majorY.push(y);
      } else {
        minor.push(line);
      }
    }
    return { minor, major, majorX, majorY };
  }, [frame.height, frame.width, frame.x, frame.y]);

  const selectedShapes = snapshot.shapes.filter(shape => selectedShapeIds.includes(shape.id));
  const selectedBounds = selectedShapes.length > 1
    ? (() => {
        const boxes = selectedShapes.map(deviceShapeBounds);
        const left = Math.min(...boxes.map(box => box.x));
        const top = Math.min(...boxes.map(box => box.y));
        const right = Math.max(...boxes.map(box => box.x + box.width));
        const bottom = Math.max(...boxes.map(box => box.y + box.height));
        return { x: left, y: top, width: right - left, height: bottom - top };
      })()
    : selectedShape ? deviceShapeBounds(selectedShape) : null;
  const showHandles =
    selectedBounds !== null &&
    Math.min(selectedBounds.width, selectedBounds.height) * pixelsPerUnit >= 44;
  const handles: { handle: ResizeHandle; x: number; y: number }[] =
    selectedBounds && showHandles
      ? [
          { handle: "nw", x: selectedBounds.x, y: selectedBounds.y },
          {
            handle: "ne",
            x: selectedBounds.x + selectedBounds.width,
            y: selectedBounds.y,
          },
          {
            handle: "se",
            x: selectedBounds.x + selectedBounds.width,
            y: selectedBounds.y + selectedBounds.height,
          },
          {
            handle: "sw",
            x: selectedBounds.x,
            y: selectedBounds.y + selectedBounds.height,
          },
        ]
      : [];

  return (
    <section
      className="device-editor"
      role="dialog"
      aria-modal="true"
      aria-labelledby="device-editor-title"
    >
      <header className="device-editor-header">
        <Button type="button" className="device-editor-back" onClick={requestBack}>
          <span aria-hidden="true">←</span> Device library
        </Button>
        <div className="device-editor-identity">
          <span className="eyebrow">
            {mode === "create"
              ? "Device workspace / New"
              : mode === "clone"
                ? "Device workspace / Clone"
                : "Device workspace / Edit"}
          </span>
          <h2 id="device-editor-title">{title || "Untitled device"}</h2>
        </div>
        <div className="device-editor-meta" aria-label="Device summary">
          <span>{snapshot.pins.length} {snapshot.pins.length === 1 ? "pin" : "pins"}</span>
          <span>{artworkLocked ? "Editable SVG artwork" : `${snapshot.shapes.length} ${snapshot.shapes.length === 1 ? "shape" : "shapes"}`}</span>
        </div>
        <div className="device-editor-header-actions">
          <span className={`device-editor-save-state${isDirty ? " is-dirty" : ""}`} role="status">
            {saveState}
          </span>
          <Button variant="solid"
            type="button"
            className="device-draft-button"
            disabled={!title.trim()}
            onClick={save}
          >
            <Icon name="save" /> Save device to draft
          </Button>
        </div>
      </header>

      <div className="device-editor-toolbar">
        <div className="device-editor-toolbar-tools" role="toolbar" aria-label="Artwork tools">
          {TOOL_GROUPS.map((group) => (
            <div className="device-editor-tool-group" key={group.label}>
              <span className="device-editor-tool-group-label">{group.label}</span>
              {TOOLS.filter((item) => group.tools.includes(item.tool)).map((item) => (
                <Button variant={tool === item.tool ? "solid" : "soft"}
                  key={item.tool}
                  type="button"
                  className={`device-editor-tool${tool === item.tool ? " is-active" : ""}`}
                  title={item.title}
                  aria-pressed={tool === item.tool}
                  onClick={() => {
                    setTool(item.tool);
                    setPendingPolyline([]);
                  }}
                >
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                </Button>
              ))}
            </div>
          ))}
        </div>
        <div className="device-editor-toolbar-actions">
          {pendingPolyline.length > 0 ? (
            <Button variant="solid" type="button" className="primary-button" onClick={finishPolyline}>
              Finish polyline ({pendingPolyline.length})
            </Button>
          ) : null}
          <Button type="button" className="device-editor-history" disabled={history.past.length === 0} onClick={undo} title="Undo">
            <Icon name="undo" /> <span>Undo</span>
          </Button>
          <Button type="button" className="device-editor-history" disabled={history.future.length === 0} onClick={redo} title="Redo">
            <Icon name="redo" /> <span>Redo</span>
          </Button>
          <Button type="button" className="device-editor-history" disabled={!snapshot.shapes.length && !artworkLocked}
            onClick={() => {
              setTool("select");
              if (snapshot.shapes.length) {
                setSelectedShapeIds(snapshot.shapes.map(shape => shape.id));
                setSelection({ kind: "shape", id: snapshot.shapes[0]!.id });
              } else setSvgSelection(-2);
            }}>Select all</Button>
          <span className="device-editor-snap">Artwork 1 · Pins 10</span>
        </div>
      </div>

      <div className="device-editor-body">
        <div className="device-editor-canvas-wrap">
          <div className="device-editor-stage-label" aria-hidden="true">
            <strong>Artwork</strong>
            <span>{frameWidth} × {frameHeight} units</span>
          </div>
          <svg
            ref={canvasRef}
            className="device-editor-canvas"
            viewBox={`${frame.x} ${frame.y} ${frame.width} ${frame.height}`}
            preserveAspectRatio="xMidYMid meet"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <rect
              className="device-editor-paper"
              x={frame.x}
              y={frame.y}
              width={frame.width}
              height={frame.height}
            />
            <g className="device-editor-grid" aria-hidden="true">
              {grid.minor.map((line, index) => (
                <line
                  key={`minor-${index}`}
                  className="device-editor-grid-minor"
                  {...line}
                />
              ))}
              {grid.major.map((line, index) => (
                <line
                  key={`major-${index}`}
                  className="device-editor-grid-major"
                  {...line}
                />
              ))}
              {frame.x < 0 && frame.x + frame.width > 0 ? (
                <line
                  className="device-editor-axis"
                  x1={0}
                  y1={frame.y}
                  x2={0}
                  y2={frame.y + frame.height}
                />
              ) : null}
              {frame.y < 0 && frame.y + frame.height > 0 ? (
                <line
                  className="device-editor-axis"
                  x1={frame.x}
                  y1={0}
                  x2={frame.x + frame.width}
                  y2={0}
                />
              ) : null}
            </g>
            <rect
              className="device-editor-frame"
              x={frame.x}
              y={frame.y}
              width={frame.width}
              height={frame.height}
            />
            <g
              className="device-editor-art"
              style={{ "--svg-selection-width": `${1.5 / pixelsPerUnit}px` } as React.CSSProperties}
              onPointerDown={event => {
                if (!artworkLocked) return;
                const part = (event.target as Element).closest("[data-svg-element]");
                if (part) { event.stopPropagation(); setSelection(null); setSvgSelection(Number(part.getAttribute("data-svg-element"))); }
              }}
              dangerouslySetInnerHTML={{
                __html: artworkLocked
                  ? svgArtworkPreview(snapshot.svgBody ?? initial.artwork.baseBody ?? initial.artwork.body, svgSelection) + serializeDeviceArtwork(snapshot.shapes)
                  : serializeDeviceArtwork(snapshot.shapes),
              }}
            />
            {snapshot.shapes.map((shape) => (
              <g key={shape.id}>{hitShape(shape)}</g>
            ))}
            {!artworkLocked && snapshot.shapes.length === 0 ? (
              <text
                className="device-editor-empty-hint"
                x={0}
                y={0}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={12 / pixelsPerUnit}
              >
                Pick a tool and drag to draw
              </text>
            ) : null}
            {frame.x <= 0 &&
            frame.x + frame.width >= 0 &&
            frame.y <= 0 &&
            frame.y + frame.height >= 0 ? (
              <circle
                className="device-editor-origin"
                cx={0}
                cy={0}
                r={3 / pixelsPerUnit}
              />
            ) : null}
            <g className="device-editor-grid-labels" aria-hidden="true">
              {grid.majorX.map((x) => (
                <text
                  key={`x-${x}`}
                  x={x + 0.4}
                  y={frame.y + gridLabelSize + 0.4}
                  fontSize={gridLabelSize}
                >
                  {Math.round(x)}
                </text>
              ))}
              {grid.majorY.map((y) => (
                <text
                  key={`y-${y}`}
                  x={frame.x + 0.4}
                  y={y - 0.4}
                  fontSize={gridLabelSize}
                >
                  {Math.round(y)}
                </text>
              ))}
            </g>
            {pendingPolyline.length > 0 ? (
              <polyline
                className="device-editor-pending"
                points={pendingPolyline
                  .map((point) => `${point.x},${point.y}`)
                  .join(" ")}
              />
            ) : null}
            {snapshot.pins.map((pin) => {
              const directionOffset =
                pin.direction === "north"
                  ? { x: 0, y: -1 }
                  : pin.direction === "south"
                    ? { x: 0, y: 1 }
                    : pin.direction === "east"
                      ? { x: 1, y: 0 }
                      : { x: -1, y: 0 };
              const labelOffset = pinRadius * 2.4;
              const labelX =
                pin.x +
                (pin.direction === "east"
                  ? -labelOffset
                  : pin.direction === "west"
                    ? labelOffset
                    : 0);
              const labelY =
                pin.y +
                (pin.direction === "north"
                  ? labelOffset * 1.3
                  : pin.direction === "south"
                    ? -labelOffset * 0.6
                    : pinRadius * 0.9);
              const labelAnchor =
                pin.direction === "east"
                  ? "end"
                  : pin.direction === "west"
                    ? "start"
                    : "middle";
              return (
                <g key={pin.id} className="device-editor-pin">
                  <circle
                    cx={pin.x}
                    cy={pin.y}
                    r={pinHit}
                    fill="transparent"
                    data-pin-id={pin.id}
                    style={{ pointerEvents: "all" }}
                  />
                  <line
                    className="device-editor-pin-tick"
                    x1={pin.x}
                    y1={pin.y}
                    x2={pin.x + directionOffset.x * pinTick}
                    y2={pin.y + directionOffset.y * pinTick}
                  />
                  <circle
                    className="device-editor-pin-dot"
                    cx={pin.x}
                    cy={pin.y}
                    r={pinRadius}
                    style={{ pointerEvents: "none" }}
                  />
                  <text
                    className="device-editor-pin-label"
                    x={labelX}
                    y={labelY}
                    textAnchor={labelAnchor}
                    fontSize={gridLabelSize}
                    style={{ pointerEvents: "none" }}
                  >
                    {pin.name || pin.id}
                  </text>
                </g>
              );
            })}
            {selectedBounds ? (
              <rect
                className="device-editor-selection"
                x={selectedBounds.x}
                y={selectedBounds.y}
                width={selectedBounds.width}
                height={selectedBounds.height}
              />
            ) : null}
            {handles.map((handle) => (
              <g key={handle.handle}>
                <rect
                  className="device-editor-handle"
                  x={handle.x - handleSize / 2}
                  y={handle.y - handleSize / 2}
                  width={handleSize}
                  height={handleSize}
                />
                <rect
                  className={`device-editor-handle-hit handle-${handle.handle}`}
                  data-handle={handle.handle}
                  x={handle.x - handleHit / 2}
                  y={handle.y - handleHit / 2}
                  width={handleHit}
                  height={handleHit}
                  fill="transparent"
                  style={{ pointerEvents: "all" }}
                />
              </g>
            ))}
            {selectedPin ? (
              <circle
                className="device-editor-pin-selection"
                cx={selectedPin.x}
                cy={selectedPin.y}
                r={pinRadius * 1.8}
              />
            ) : null}
          </svg>
          <div className="device-editor-stage-hint" role="status">
            {tool === "select"
              ? "Select a shape or pin to edit its properties"
              : tool === "pin"
                ? "Click on the 10-unit grid to place a pin"
                : tool === "polyline"
                  ? "Click to add points, then finish the polyline"
                  : "Drag on the artwork to draw"}
          </div>
        </div>

        <aside className="device-editor-inspector">
          <div className="device-editor-inspector-heading">
            <span className="eyebrow">Inspector</span>
            <h2>{selectedShapes.length > 1 ? `${selectedShapes.length} shapes` : selectedShape ? shapeLabel(selectedShape) : selectedPin ? "Pin" : "Device"}</h2>
            <p>{selectedShapes.length > 1 ? "Drag any selected shape to move the group" : selectedShape || selectedPin ? "Selected object" : "Device settings"}</p>
          </div>
          {artworkLocked && <SvgArtworkEditor body={snapshot.svgBody ?? initial.artwork.baseBody ?? initial.artwork.body} selected={svgSelection}
            onSelect={index => { setSelection(null); setSvgSelection(index); }}
            onChange={svgBody => commit({ ...snapshot, svgBody })}/>}
          {snapshot.pins.length > 0 && <section className="editor-pin-index" aria-label="Pin connections">
            <h3>Pin connections</h3>
            <div>{snapshot.pins.map(pin => <Button variant={selectedPin?.id === pin.id ? "solid" : "soft"} key={pin.id} type="button"
              aria-pressed={selectedPin?.id === pin.id}
              onClick={() => { setTool("select"); setSelection({kind:"pin",id:pin.id}); }}>
              <strong>{pin.name || pin.key}</strong><span>{DIRECTION_LABELS[pin.direction]}</span>
            </Button>)}</div>
          </section>}
          {selectedShape ? (
            <section className="device-editor-object-section">
              <div className="device-editor-section-heading">
                <h3>{shapeLabel(selectedShape)}</h3>
                <Button variant="ghost"
                  type="button"
                  color="red" className="text-button is-danger"
                  onClick={deleteSelection}
                >
                  Delete
                </Button>
              </div>
              {!showHandles ? (
                <p className="device-editor-note">
                  Tiny shape: resize it with the fields below; corner handles are
                  hidden to keep the artwork visible.
                </p>
              ) : null}
              {selectedShape.kind === "line" ? (
                <>
                  <div className="device-editor-row">
                    <NumericField
                      label="X1"
                      value={selectedShape.x1}
                      onChange={(value) =>
                        updateShape({ ...selectedShape, x1: value })
                      }
                    />
                    <NumericField
                      label="Y1"
                      value={selectedShape.y1}
                      onChange={(value) =>
                        updateShape({ ...selectedShape, y1: value })
                      }
                    />
                  </div>
                  <div className="device-editor-row">
                    <NumericField
                      label="X2"
                      value={selectedShape.x2}
                      onChange={(value) =>
                        updateShape({ ...selectedShape, x2: value })
                      }
                    />
                    <NumericField
                      label="Y2"
                      value={selectedShape.y2}
                      onChange={(value) =>
                        updateShape({ ...selectedShape, y2: value })
                      }
                    />
                  </div>
                </>
              ) : null}
              {selectedShape.kind === "rect" ? (
                <>
                  <div className="device-editor-row">
                    <NumericField
                      label="X"
                      value={selectedShape.x}
                      onChange={(value) =>
                        updateShape({ ...selectedShape, x: value })
                      }
                    />
                    <NumericField
                      label="Y"
                      value={selectedShape.y}
                      onChange={(value) =>
                        updateShape({ ...selectedShape, y: value })
                      }
                    />
                  </div>
                  <div className="device-editor-row">
                    <NumericField
                      label="Width"
                      value={selectedShape.width}
                      min={0.1}
                      onChange={(value) =>
                        updateShape({
                          ...selectedShape,
                          width: Math.max(0.1, value),
                        })
                      }
                    />
                    <NumericField
                      label="Height"
                      value={selectedShape.height}
                      min={0.1}
                      onChange={(value) =>
                        updateShape({
                          ...selectedShape,
                          height: Math.max(0.1, value),
                        })
                      }
                    />
                  </div>
                </>
              ) : null}
              {selectedShape.kind === "circle" ? (
                <>
                  <div className="device-editor-row">
                    <NumericField
                      label="CX"
                      value={selectedShape.cx}
                      onChange={(value) =>
                        updateShape({ ...selectedShape, cx: value })
                      }
                    />
                    <NumericField
                      label="CY"
                      value={selectedShape.cy}
                      onChange={(value) =>
                        updateShape({ ...selectedShape, cy: value })
                      }
                    />
                  </div>
                  <NumericField
                    label="Radius"
                    value={selectedShape.r}
                    min={0.1}
                    onChange={(value) =>
                      updateShape({ ...selectedShape, r: Math.max(0.1, value) })
                    }
                  />
                </>
              ) : null}
              {selectedShape.kind === "ellipse" ? (
                <>
                  <div className="device-editor-row">
                    <NumericField
                      label="CX"
                      value={selectedShape.cx}
                      onChange={(value) =>
                        updateShape({ ...selectedShape, cx: value })
                      }
                    />
                    <NumericField
                      label="CY"
                      value={selectedShape.cy}
                      onChange={(value) =>
                        updateShape({ ...selectedShape, cy: value })
                      }
                    />
                  </div>
                  <div className="device-editor-row">
                    <NumericField
                      label="RX"
                      value={selectedShape.rx}
                      min={0.1}
                      onChange={(value) =>
                        updateShape({
                          ...selectedShape,
                          rx: Math.max(0.1, value),
                        })
                      }
                    />
                    <NumericField
                      label="RY"
                      value={selectedShape.ry}
                      min={0.1}
                      onChange={(value) =>
                        updateShape({
                          ...selectedShape,
                          ry: Math.max(0.1, value),
                        })
                      }
                    />
                  </div>
                </>
              ) : null}
              {selectedShape.kind === "arc" ? (
                <>
                  <div className="device-editor-row">
                    <NumericField
                      label="CX"
                      value={selectedShape.cx}
                      onChange={(value) =>
                        updateShape({ ...selectedShape, cx: value })
                      }
                    />
                    <NumericField
                      label="CY"
                      value={selectedShape.cy}
                      onChange={(value) =>
                        updateShape({ ...selectedShape, cy: value })
                      }
                    />
                  </div>
                  <div className="device-editor-row">
                    <NumericField
                      label="Radius"
                      value={selectedShape.r}
                      min={0.1}
                      onChange={(value) =>
                        updateShape({
                          ...selectedShape,
                          r: Math.max(0.1, value),
                        })
                      }
                    />
                    <NumericField
                      label="Start °"
                      value={selectedShape.startAngle}
                      onChange={(value) =>
                        updateShape({ ...selectedShape, startAngle: value })
                      }
                    />
                    <NumericField
                      label="End °"
                      value={selectedShape.endAngle}
                      onChange={(value) =>
                        updateShape({ ...selectedShape, endAngle: value })
                      }
                    />
                  </div>
                </>
              ) : null}
              {selectedShape.kind === "text" ? (
                <>
                  <label className="device-editor-field">
                    <span>Text</span>
                    <TextField.Root
                      value={selectedShape.text}
                      onChange={(event) =>
                        updateShape({ ...selectedShape, text: event.target.value })
                      }
                    />
                  </label>
                  <div className="device-editor-row">
                    <NumericField
                      label="X"
                      value={selectedShape.x}
                      onChange={(value) =>
                        updateShape({ ...selectedShape, x: value })
                      }
                    />
                    <NumericField
                      label="Y"
                      value={selectedShape.y}
                      onChange={(value) =>
                        updateShape({ ...selectedShape, y: value })
                      }
                    />
                    <NumericField
                      label="Size"
                      value={selectedShape.fontSize ?? 10}
                      min={2}
                      onChange={(value) =>
                        updateShape({
                          ...selectedShape,
                          fontSize: Math.max(2, value),
                        })
                      }
                    />
                  </div>
                  <label className="device-editor-field">
                    <span>Anchor</span>
                    <FilterSelect label="Anchor" value={selectedShape.anchor ?? "middle"}
                      options={["start", "middle", "end"].map(value => ({ value, label: value[0]!.toUpperCase() + value.slice(1) }))}
                      onChange={value => updateShape({ ...selectedShape, anchor: value as "start" | "middle" | "end" })} />
                  </label>
                </>
              ) : null}
              {selectedShape.kind === "polyline" ? (
                <>
                  <p className="device-editor-note">
                    {selectedShape.points.length} points. Move the polyline with the
                    canvas; use the tool to draw a new one.
                  </p>
                  <label className="pin-audit-toggle">
                    <Checkbox
                      checked={selectedShape.closed === true}
                      onCheckedChange={checked =>
                        updateShape({
                          ...selectedShape,
                          closed: checked === true,
                        })
                      }
                    />
                    Closed
                  </label>
                </>
              ) : null}
              <NumericField
                label="Stroke width"
                value={selectedShape.strokeWidth ?? 1.6}
                min={0.2}
                step={0.2}
                onChange={(value) =>
                  updateShape({
                    ...selectedShape,
                    strokeWidth: Math.max(0.2, value),
                  })
                }
              />
            </section>
          ) : null}

          {selectedPin ? (
            <section className="device-editor-object-section">
              <div className="device-editor-section-heading">
                <h3>Pin</h3>
                <Button variant="ghost"
                  type="button"
                  color="red" className="text-button is-danger"
                  onClick={deleteSelection}
                >
                  Delete
                </Button>
              </div>
              <label className="device-editor-field">
                <span>Name</span>
                <TextField.Root
                  value={selectedPin.name}
                  onChange={(event) =>
                    updatePin({ ...selectedPin, name: event.target.value })
                  }
                />
              </label>
              <label className="device-editor-field">
                <span>Role</span>
                <TextField.Root
                  value={selectedPin.role}
                  onChange={(event) =>
                    updatePin({ ...selectedPin, role: event.target.value })
                  }
                />
              </label>
              <label className="device-editor-field">
                <span>Direction</span>
                <FilterSelect label="Direction" value={selectedPin.direction}
                  options={Object.entries(DIRECTION_LABELS).map(([value, label]) => ({ value, label }))}
                  onChange={value => {
                    const side = value as SymbolSide;
                    updatePin({ ...selectedPin, direction: side, side });
                  }} />
              </label>
              <div className="device-editor-row">
                <NumericField
                  label="X"
                  value={selectedPin.x}
                  onChange={(value) => updatePin({ ...selectedPin, x: value })}
                />
                <NumericField
                  label="Y"
                  value={selectedPin.y}
                  onChange={(value) => updatePin({ ...selectedPin, y: value })}
                />
              </div>
              <p className="device-editor-note">
                {artworkLocked ? "Select SVG artwork to edit its geometry. Check the pin against the visible lead." :
                  "New pins snap to the 10-unit grid. Use the fields for exact coordinates."}
              </p>
            </section>
          ) : null}

          <details
            key={selectedShape || selectedPin ? "object" : "device"}
            className="device-editor-metadata"
            open={!selectedShape && !selectedPin}
          >
            <summary>Device setup</summary>
            <div className="device-editor-metadata-fields">
            <label className="device-editor-field">
              <span>Title</span>
              <TextField.Root value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>
            <label className="device-editor-field">
              <span>Category</span>
              <TextField.Root
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              />
            </label>
            <label className="device-editor-field">
              <span>Keywords</span>
              <TextField.Root
                value={keywordsText}
                onChange={(event) => setKeywordsText(event.target.value)}
                placeholder="analog, divider"
              />
            </label>
            <div className="device-editor-row">
              <NumericField
                label="Frame width"
                value={frameWidth}
                min={8}
                onChange={(value) => setFrameWidth(clamp(snapValue(value, 20), 20, 2000))}
              />
              <NumericField
                label="Frame height"
                value={frameHeight}
                min={8}
                onChange={(value) => setFrameHeight(clamp(snapValue(value, 20), 20, 2000))}
              />
            </div>
            <div className="device-editor-row">
              <label className="pin-audit-toggle">
                <Checkbox
                  checked={electrical}
                  onCheckedChange={checked => setElectrical(checked === true)}
                />
                Electrical
              </label>
              <label className="pin-audit-toggle">
                <Checkbox
                  checked={palette}
                  onCheckedChange={checked => setPalette(checked === true)}
                />
                Show in palette
              </label>
            </div>
            <div className="device-editor-row">
              <label className="device-editor-field">
                <span>SPICE prefix</span>
                <TextField.Root
                  value={spicePrefix}
                  onChange={(event) => setSpicePrefix(event.target.value)}
                />
              </label>
              <label className="device-editor-field">
                <span>Default value</span>
                <TextField.Root
                  value={spiceDefault}
                  onChange={(event) => setSpiceDefault(event.target.value)}
                />
              </label>
            </div>
            <label className="pin-audit-toggle">
              <Checkbox
                checked={spiceSupported}
                onCheckedChange={checked => setSpiceSupported(checked === true)}
              />
              SPICE supported
            </label>
            </div>
          </details>

          {errors.length > 0 ? (
            <section className="device-editor-errors" role="alert">
              <h3>Fix before saving</h3>
              <ul>
                {errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>
      {confirmBack ? (
        <AlertDialog.Root open onOpenChange={open => { if (!open) setConfirmBack(false); }}>
          <AlertDialog.Content className="modal-card device-editor-leave-dialog">
            <span className="modal-kicker">Unsaved device changes</span>
            <AlertDialog.Title>Return to the device library?</AlertDialog.Title>
            <AlertDialog.Description>Save this device to the library draft or discard the edits made since the last save.</AlertDialog.Description>
            <div className="modal-actions">
              <AlertDialog.Cancel><Button type="button">Keep editing</Button></AlertDialog.Cancel>
              <Button type="button" onClick={onCancel}>Discard changes</Button>
              <Button variant="solid"
                type="button"
                className="primary-button"
                onClick={() => {
                  if (save()) onCancel();
                  else setConfirmBack(false);
                }}
              >
                <Icon name="save" /> Save and return to library draft
              </Button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Root>
      ) : null}
    </section>
  );
}
