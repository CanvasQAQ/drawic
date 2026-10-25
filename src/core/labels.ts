import {
  nodeInkBounds,
  nodeLabelVisible,
  rectanglesIntersect,
  symbolLabelPosition,
  transformLocalPoint,
} from "./geometry";
import type {
  ComponentNode,
  DocumentTypography,
  DrawingPage,
  LabelSide,
  LabelTextAnchor,
  NodeLabelKind,
  NodeLabelLayout,
  Point,
  SymbolDefinition,
} from "./model";

export { nodeInkBounds };

export const NAME_BASE_FONT_SIZE = 15.116;
export const VALUE_BASE_FONT_SIZE = 12.5;
export const NAME_LABEL_GAP = 4;
export const NAME_CAP_HEIGHT_RATIO = 0.72;
export const SUBSCRIPT_SCALE = 0.76;
export const SUBSCRIPT_BASELINE_DROP = 0.44;
export const SUBSCRIPT_HORIZONTAL_GAP = 0.046;
export const DEFAULT_LINE_HEIGHT = 1;
export const DEFAULT_SANS_FONT_STACK =
  "'ICM Round Period', 'Metropolis', 'DejaVu Sans', Arial, 'Helvetica Neue', Helvetica, sans-serif";
export const DEFAULT_SERIF_FONT_STACK =
  "'ICM Serif', 'Liberation Serif', 'Times New Roman', Times, 'DejaVu Sans', serif";
export const DEFAULT_TYPOGRAPHY: DocumentTypography = {
  family: "sans",
  scale: 1,
};

export type ReferenceSegmentRole = "base" | "subscript" | "plain";

export interface ReferenceSegment {
  text: string;
  role: ReferenceSegmentRole;
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface LayoutOptions {
  typography?: DocumentTypography;
  automatic?: boolean;
  showReference?: boolean;
  showValue?: boolean;
  library?: readonly SymbolDefinition[];
}

const twoTerminalOrSourceIds = new Set([
  "resistor",
  "variable-resistor",
  "capacitor",
  "variable-capacitor",
  "inductor",
  "inductor-compact",
  "variable-inductor",
  "battery",
  "voltage-source",
  "pulse-voltage-source",
  "current-source",
  "vccs",
  "vcvs",
  "cccs",
  "ccvs",
  "diode",
  "zener-diode",
]);

const mosIds = new Set([
  "nmos",
  "pmos",
  "depletion-nmos",
  "depletion-pmos",
  "ndmos",
  "pdmos",
]);

const bjtIds = new Set(["npn", "pnp"]);
const northById = new Set(["tcoil", "center-tap-inductor"]);

function transformDirection(node: ComponentNode, side: LabelSide): LabelSide {
  const vector =
    side === "east"
      ? { x: 1, y: 0 }
      : side === "south"
        ? { x: 0, y: 1 }
        : side === "west"
          ? { x: -1, y: 0 }
          : { x: 0, y: -1 };
  const point = transformLocalPoint(node, vector);
  const dx = point.x - node.x;
  const dy = point.y - node.y;
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? "east" : "west";
  }
  return dy > 0 ? "south" : "north";
}

function portAwaySide(
  node: ComponentNode,
  symbol: SymbolDefinition,
  page: DrawingPage,
): LabelSide {
  const attachedDirections = new Map<LabelSide, number>();
  for (const net of page.nets) {
    for (const wire of net.wires) {
      const endpoints = [wire.start, wire.end].filter(
        (endpoint) =>
          endpoint.kind === "pin" && endpoint.deviceId === node.id,
      );
      if (endpoints.length === 0) {
        continue;
      }
      for (let pointIndex = 0; pointIndex < wire.points.length - 1; pointIndex += 1) {
        const point = wire.points[pointIndex]!;
        const next = wire.points[pointIndex + 1];
        if (!next) {
          continue;
        }
        const dx = next.x - point.x;
        const dy = next.y - point.y;
        const side =
          Math.abs(dx) > Math.abs(dy)
            ? dx >= 0
              ? "east"
              : "west"
            : dy >= 0
              ? "south"
              : "north";
        attachedDirections.set(side, (attachedDirections.get(side) ?? 0) + 1);
      }
    }
  }
  const pinSide = symbol.pins[0]?.side;
  const opposite: Record<LabelSide, LabelSide> = {
    east: "west",
    west: "east",
    north: "south",
    south: "north",
  };
  const preferred = pinSide ? opposite[pinSide] : "west";
  const candidates: LabelSide[] = [...new Set<LabelSide>([
    preferred,
    "east",
    "south",
    "west",
    "north",
  ])];
  return candidates
    .sort(
      (a, b) =>
        (attachedDirections.get(a) ?? 0) - (attachedDirections.get(b) ?? 0) ||
        candidates.indexOf(a) - candidates.indexOf(b),
    )[0]!;
}

export function defaultLabelSide(
  node: ComponentNode,
  symbol: SymbolDefinition,
  page: DrawingPage,
): LabelSide {
  const id = symbol.variantOf ?? symbol.id;
  let local: LabelSide;
  if (id === "port" || symbol.category === "interface") {
    local = portAwaySide(node, symbol, page);
  } else if (northById.has(id)) {
    local = "north";
  } else if (
    mosIds.has(id) ||
    bjtIds.has(id) ||
    symbol.category === "transistor" ||
    symbol.category === "source" ||
    symbol.category === "passive" ||
    symbol.category === "switch" ||
    twoTerminalOrSourceIds.has(id) ||
    id === "battery" ||
    id === "diode" ||
    id === "zener-diode"
  ) {
    local = "east";
  } else {
    local = "south";
  }
  return transformDirection(node, local);
}

export function fontStack(typography: DocumentTypography = DEFAULT_TYPOGRAPHY): string {
  return typography.family === "serif"
    ? DEFAULT_SERIF_FONT_STACK
    : DEFAULT_SANS_FONT_STACK;
}

export function effectiveNameFontSize(
  layout?: NodeLabelLayout,
  typography: DocumentTypography = DEFAULT_TYPOGRAPHY,
): number {
  return (
    NAME_BASE_FONT_SIZE *
    typography.scale *
    (layout?.fontSizeScale ?? 1)
  );
}

export function effectiveValueFontSize(
  layout?: NodeLabelLayout,
  typography: DocumentTypography = DEFAULT_TYPOGRAPHY,
): number {
  return (
    VALUE_BASE_FONT_SIZE *
    typography.scale *
    (layout?.fontSizeScale ?? 1)
  );
}

export function parseReferenceAppearance(reference: string): ReferenceSegment[] {
  const text = reference.trim();
  if (!text) {
    return [];
  }
  const greek = text.match(/^(\p{Script=Greek})(.+)$/u);
  if (greek) {
    return [
      { text: greek[1]!, role: "base" },
      { text: greek[2]!, role: "subscript" },
    ];
  }
  const multiLetter = text.match(/^(XU|OA)(\d+)$/);
  if (multiLetter) {
    return [
      { text: multiLetter[1]!, role: "base" },
      { text: multiLetter[2]!, role: "subscript" },
    ];
  }
  const separated = text.match(/^([MRCLVIDQ])_([A-Za-z0-9]+)$/);
  if (separated) {
    return [
      { text: separated[1]!, role: "base" },
      { text: separated[2]!, role: "subscript" },
    ];
  }
  const standard = text.match(/^([MRCLVIDQ])([A-Za-z0-9]+)$/);
  if (standard) {
    return [
      { text: standard[1]!, role: "base" },
      { text: standard[2]!, role: "subscript" },
    ];
  }
  return [{ text, role: "plain" }];
}

function sidePosition(
  side: LabelSide,
  bounds: Bounds,
  fontSize: number,
): { point: Point; anchor: LabelTextAnchor } {
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const capHeight = NAME_CAP_HEIGHT_RATIO * fontSize;
  const subscriptDrop =
    SUBSCRIPT_SCALE * SUBSCRIPT_BASELINE_DROP * fontSize;
  switch (side) {
    case "east":
      return {
        point: {
          x: Math.round(bounds.maxX + NAME_LABEL_GAP),
          y: Math.round(centerY + capHeight / 2),
        },
        anchor: "start",
      };
    case "west":
      return {
        point: {
          x: Math.round(bounds.minX - NAME_LABEL_GAP),
          y: Math.round(centerY + capHeight / 2),
        },
        anchor: "end",
      };
    case "south":
      return {
        point: {
          x: Math.round(centerX),
          y: Math.round(bounds.maxY + NAME_LABEL_GAP + capHeight),
        },
        anchor: "middle",
      };
    case "north":
      return {
        point: {
          x: Math.round(centerX),
          y: Math.round(bounds.minY - NAME_LABEL_GAP - subscriptDrop),
        },
        anchor: "middle",
      };
  }
}

function shiftedLayout(
  point: Point,
  anchor: LabelTextAnchor,
  side: LabelSide,
  hidden: boolean,
  previous?: NodeLabelLayout,
): NodeLabelLayout {
  return {
    ...previous,
    offset: { x: 0, y: 0 },
    hidden,
    position: { x: point.x, y: point.y },
    anchor,
    placement: "default",
    side,
  };
}

function groupPositions(
  side: LabelSide,
  bounds: Bounds,
  nameSize: number,
  valueSize: number,
  showReference: boolean,
  showValue: boolean,
): {
  reference?: { point: Point; anchor: LabelTextAnchor };
  value?: { point: Point; anchor: LabelTextAnchor };
} {
  const slot = sidePosition(side, bounds, nameSize);
  if (showReference && !showValue) {
    return { reference: slot };
  }
  if (!showReference && showValue) {
    return { value: sidePosition(side, bounds, valueSize) };
  }
  if (!showReference && !showValue) {
    return {};
  }
  if (side === "north") {
    return {
      value: slot,
      reference: {
        ...slot,
        point: {
          x: slot.point.x,
          y: slot.point.y - nameSize * DEFAULT_LINE_HEIGHT,
        },
      },
    };
  }
  return {
    reference: slot,
    value: {
      ...slot,
      point: {
        x: slot.point.x,
        y: slot.point.y + nameSize * DEFAULT_LINE_HEIGHT,
      },
    },
  };
}

function labelWidth(
  text: string,
  fontSize: number,
  rich: boolean,
): number {
  if (!rich) {
    return Math.max(fontSize * 0.5, text.length * fontSize * 0.6);
  }
  return parseReferenceAppearance(text).reduce(
    (total, segment) =>
      total +
      (segment.role === "subscript"
        ? segment.text.length * fontSize * SUBSCRIPT_SCALE * 0.6 +
          fontSize * SUBSCRIPT_HORIZONTAL_GAP
        : segment.text.length * fontSize * 0.62),
    0,
  );
}

function wireEnclosesBox(page: DrawingPage, box: Bounds): boolean {
  const centerX = (box.minX + box.maxX) / 2;
  const centerY = (box.minY + box.maxY) / 2;
  const segments = page.nets.flatMap((net) =>
    net.wires.flatMap((wire) =>
      wire.points.slice(0, -1).map((start, index) => ({
        start,
        end: wire.points[index + 1]!,
      })),
    ),
  );
  const left = segments.some(
    (segment) =>
      Math.abs(segment.start.x - segment.end.x) < 0.01 &&
      segment.start.x < box.minX &&
      centerY >= Math.min(segment.start.y, segment.end.y) &&
      centerY <= Math.max(segment.start.y, segment.end.y),
  );
  const right = segments.some(
    (segment) =>
      Math.abs(segment.start.x - segment.end.x) < 0.01 &&
      segment.start.x > box.maxX &&
      centerY >= Math.min(segment.start.y, segment.end.y) &&
      centerY <= Math.max(segment.start.y, segment.end.y),
  );
  const above = segments.some(
    (segment) =>
      Math.abs(segment.start.y - segment.end.y) < 0.01 &&
      segment.start.y < box.minY &&
      centerX >= Math.min(segment.start.x, segment.end.x) &&
      centerX <= Math.max(segment.start.x, segment.end.x),
  );
  const below = segments.some(
    (segment) =>
      Math.abs(segment.start.y - segment.end.y) < 0.01 &&
      segment.start.y > box.maxY &&
      centerX >= Math.min(segment.start.x, segment.end.x) &&
      centerX <= Math.max(segment.start.x, segment.end.x),
  );
  return left && right && above && below;
}

export function labelTextBounds(
  point: Point,
  anchor: LabelTextAnchor,
  text: string,
  fontSize: number,
  rich = false,
): Bounds {
  const width = labelWidth(text, fontSize, rich);
  const left =
    anchor === "middle" ? point.x - width / 2 : anchor === "end" ? point.x - width : point.x;
  return {
    minX: left,
    minY: point.y - fontSize * NAME_CAP_HEIGHT_RATIO,
    maxX: left + width,
    maxY: point.y + fontSize * 0.2,
  };
}

function layoutBounds(
  layouts: Partial<Record<NodeLabelKind, NodeLabelLayout>>,
  node: ComponentNode,
  typography: DocumentTypography,
): Bounds | null {
  const boxes: Bounds[] = [];
  const reference = layouts.reference;
  if (
    reference &&
    !reference.hidden &&
    reference.position &&
    reference.anchor &&
    node.reference.trim()
  ) {
    boxes.push(
      labelTextBounds(
        reference.position,
        reference.anchor,
        node.reference,
        effectiveNameFontSize(reference, typography),
        true,
      ),
    );
  }
  const value = layouts.value;
  if (
    value &&
    !value.hidden &&
    value.position &&
    value.anchor &&
    node.value.trim()
  ) {
    boxes.push(
      labelTextBounds(
        value.position,
        value.anchor,
        node.value,
        effectiveValueFontSize(value, typography),
        false,
      ),
    );
  }
  if (boxes.length === 0) {
    return null;
  }
  return {
    minX: Math.min(...boxes.map((box) => box.minX)),
    minY: Math.min(...boxes.map((box) => box.minY)),
    maxX: Math.max(...boxes.map((box) => box.maxX)),
    maxY: Math.max(...boxes.map((box) => box.maxY)),
  };
}

function pageObstacles(
  page: DrawingPage,
  symbol: SymbolDefinition,
  nodeId: string,
  library: readonly SymbolDefinition[] = [],
  typography: DocumentTypography = DEFAULT_TYPOGRAPHY,
): Bounds[] {
  const obstacles: Bounds[] = [];
  const symbols = new Map(library.map((candidate) => [candidate.id, candidate]));
  for (const node of page.nodes) {
    if (node.id === nodeId) {
      continue;
    }
    const nodeSymbol = symbols.get(node.symbolId);
    if (nodeSymbol) {
      obstacles.push(nodeInkBounds(node, nodeSymbol));
    }
    const layouts = node.labelLayout ?? {};
    for (const kind of ["reference", "value"] as const) {
      const layout = layouts[kind];
      if (layout?.hidden) {
        continue;
      }
      const text = kind === "reference" ? node.reference : node.value;
      if (!text.trim()) {
        continue;
      }
      const position =
        layout?.position && layout.anchor
          ? { point: layout.position, anchor: layout.anchor }
          : nodeSymbol
            ? displayedLabelPosition(node, nodeSymbol, kind)
            : null;
      if (!position) {
        continue;
      }
      obstacles.push(
        labelTextBounds(
          position.point,
          position.anchor,
          text,
          kind === "reference"
            ? effectiveNameFontSize(layout, typography)
            : effectiveValueFontSize(layout, typography),
          kind === "reference",
        ),
      );
    }
  }
  for (const net of page.nets) {
    for (const wire of net.wires) {
      for (let index = 1; index < wire.points.length; index += 1) {
        const start = wire.points[index - 1]!;
        const end = wire.points[index]!;
        obstacles.push({
          minX: Math.min(start.x, end.x) - 1,
          minY: Math.min(start.y, end.y) - 1,
          maxX: Math.max(start.x, end.x) + 1,
          maxY: Math.max(start.y, end.y) + 1,
        });
      }
    }
    obstacles.push(
      ...net.junctions.map((junction) => ({
        minX: junction.point.x - 3,
        minY: junction.point.y - 3,
        maxX: junction.point.x + 3,
        maxY: junction.point.y + 3,
      })),
    );
  }
  for (const annotation of page.annotations) {
    obstacles.push(
      labelTextBounds(
        { x: annotation.x, y: annotation.y },
        "start",
        annotation.text,
        annotation.size,
      ),
    );
  }
  for (const shape of page.shapes) {
    obstacles.push({
      minX: shape.x,
      minY: shape.y,
      maxX: shape.x + shape.width,
      maxY: shape.y + shape.height,
    });
  }
  return obstacles;
}

function shiftedForCandidate(
  layouts: Partial<Record<NodeLabelKind, NodeLabelLayout>>,
  side: LabelSide,
  offset: number,
): Partial<Record<NodeLabelKind, NodeLabelLayout>> {
  return {
    ...(layouts.reference
      ? {
          reference: {
            ...layouts.reference,
            position: {
              x:
                layouts.reference.position!.x +
                (side === "north" || side === "south" ? offset : 0),
              y:
                layouts.reference.position!.y +
                (side === "east" || side === "west" ? offset : 0),
            },
          },
        }
      : {}),
    ...(layouts.value
      ? {
          value: {
            ...layouts.value,
            position: {
              x:
                layouts.value.position!.x +
                (side === "north" || side === "south" ? offset : 0),
              y:
                layouts.value.position!.y +
                (side === "east" || side === "west" ? offset : 0),
            },
          },
        }
      : {}),
  };
}

function avoidCollisions(
  node: ComponentNode,
  symbol: SymbolDefinition,
  page: DrawingPage,
  typography: DocumentTypography,
  preferredSide: LabelSide,
  showReference: boolean,
  showValue: boolean,
  library: readonly SymbolDefinition[] = [],
): Partial<Record<NodeLabelKind, NodeLabelLayout>> {
  const bounds = nodeInkBounds(node, symbol);
  const nameSize = effectiveNameFontSize(
    node.labelLayout?.reference,
    typography,
  );
  const valueSize = effectiveValueFontSize(
    node.labelLayout?.value,
    typography,
  );
  const sideOrder: LabelSide[] = [...new Set<LabelSide>([
    preferredSide,
    "east",
    "south",
    "west",
    "north",
  ])];
  const obstacles = pageObstacles(page, symbol, node.id, library, typography);
  let best:
    | {
        layouts: Partial<Record<NodeLabelKind, NodeLabelLayout>>;
        score: number;
      }
    | undefined;

  for (const side of sideOrder) {
    const positions = groupPositions(
      side,
      bounds,
      nameSize,
      valueSize,
      showReference,
      showValue,
    );
    const base: Partial<Record<NodeLabelKind, NodeLabelLayout>> = {};
    if (positions.reference) {
      base.reference = shiftedLayout(
        positions.reference.point,
        positions.reference.anchor,
        side,
        !showReference,
        node.labelLayout?.reference,
      );
    }
    if (positions.value) {
      base.value = shiftedLayout(
        positions.value.point,
        positions.value.anchor,
        side,
        !showValue,
        node.labelLayout?.value,
      );
    }

    const step = nameSize + NAME_LABEL_GAP;
    for (let slot = 0; slot <= 12; slot += 1) {
      const offsets = slot === 0 ? [0] : [slot * step, -slot * step];
      for (const offset of offsets) {
        const layouts = shiftedForCandidate(base, side, offset);
        const box = layoutBounds(layouts, node, typography);
        if (!box) {
          continue;
        }
        const score = obstacles.reduce(
          (total, obstacle) =>
            total +
            (rectanglesIntersect(box, obstacle)
              ? 100 +
                Math.max(
                  0,
                  Math.min(box.maxX, obstacle.maxX) -
                    Math.max(box.minX, obstacle.minX),
                ) *
                  Math.max(
                    0,
                    Math.min(box.maxY, obstacle.maxY) -
                      Math.max(box.minY, obstacle.minY),
                  )
              : 0),
          0,
        ) + (wireEnclosesBox(page, box) ? 10000 : 0);
        const cost = score + slot * 0.01 + sideOrder.indexOf(side) * 0.001;
        if (!best || cost < best.score) {
          best = { layouts, score: cost };
        }
        if (score === 0) {
          return layouts;
        }
      }
    }
  }
  return best?.layouts ?? {};
}

export function layoutNodeLabels(
  node: ComponentNode,
  symbol: SymbolDefinition,
  page: DrawingPage,
  options: LayoutOptions = {},
): Partial<Record<NodeLabelKind, NodeLabelLayout>> {
  const typography = options.typography ?? DEFAULT_TYPOGRAPHY;
  const hasReference =
    node.reference.trim() !== "" && symbol.referenceLabel !== false;
  const showReference =
    options.showReference ??
    (node.labelLayout?.reference
      ? !node.labelLayout.reference.hidden
      : hasReference);
  const showValue =
    options.showValue ??
    (node.labelLayout?.value
      ? !node.labelLayout.value.hidden
      : false);
  const visibleReference = hasReference && showReference;
  const visibleValue = node.value.trim() !== "" && showValue;

  if (!visibleReference && !visibleValue) {
    return {
      ...(node.reference.trim() || node.labelLayout?.reference
        ? {
            reference: {
              offset: { x: 0, y: 0 },
              ...(node.labelLayout?.reference ?? {}),
              hidden: true,
            },
          }
        : {}),
      ...(node.value.trim() || node.labelLayout?.value
        ? {
            value: {
              offset: { x: 0, y: 0 },
              ...(node.labelLayout?.value ?? {}),
              hidden: true,
            },
          }
        : {}),
    };
  }

  const side = defaultLabelSide(node, symbol, page);
  if (options.automatic) {
    return avoidCollisions(
      node,
      symbol,
      page,
      typography,
      side,
      visibleReference,
      visibleValue,
      options.library ?? [symbol],
    );
  }

  const bounds = nodeInkBounds(node, symbol);
  const nameSize = effectiveNameFontSize(
    node.labelLayout?.reference,
    typography,
  );
  const valueSize = effectiveValueFontSize(
    node.labelLayout?.value,
    typography,
  );
  const positions = groupPositions(
    side,
    bounds,
    nameSize,
    valueSize,
    visibleReference,
    visibleValue,
  );
  return {
    ...(positions.reference
      ? {
          reference: shiftedLayout(
            positions.reference.point,
            positions.reference.anchor,
            side,
            false,
            node.labelLayout?.reference,
          ),
        }
      : node.labelLayout?.reference
        ? {
            reference: {
              ...node.labelLayout.reference,
              hidden: true,
            },
          }
        : {}),
    ...(positions.value
      ? {
          value: shiftedLayout(
            positions.value.point,
            positions.value.anchor,
            side,
            false,
            node.labelLayout?.value,
          ),
        }
      : node.labelLayout?.value
        ? {
            value: {
              ...node.labelLayout.value,
              hidden: true,
            },
          }
        : {}),
  };
}

export function reflowDefaultNodeLabels(
  page: DrawingPage,
  library: readonly SymbolDefinition[],
  typography: DocumentTypography = DEFAULT_TYPOGRAPHY,
  nodeIds?: ReadonlySet<string>,
): DrawingPage {
  const symbols = new Map(library.map((symbol) => [symbol.id, symbol]));
  let changed = false;
  const nodes = page.nodes.map((node) => {
    if (nodeIds && !nodeIds.has(node.id)) {
      return node;
    }
    const symbol = symbols.get(node.symbolId);
    if (!symbol || !node.labelLayout) {
      return node;
    }
    const reflowReference = node.labelLayout.reference?.placement === "default";
    const reflowValue = node.labelLayout.value?.placement === "default";
    if (!reflowReference && !reflowValue) {
      return node;
    }
    const layouts = layoutNodeLabels(node, symbol, page, {
      typography,
      library,
      showReference: reflowReference ? !node.labelLayout.reference?.hidden : false,
      showValue: reflowValue ? !node.labelLayout.value?.hidden : false,
    });
    const labelLayout = {
      ...node.labelLayout,
      ...(reflowReference && layouts.reference
        ? { reference: layouts.reference }
        : {}),
      ...(reflowValue && layouts.value ? { value: layouts.value } : {}),
    };
    changed = true;
    return { ...node, labelLayout };
  });
  return changed ? { ...page, nodes } : page;
}

export function translateNodeLabelLayouts(
  node: ComponentNode,
  delta: Point,
): ComponentNode {
  if (!node.labelLayout) {
    return node;
  }
  let changed = false;
  const labelLayout = { ...node.labelLayout };
  for (const kind of ["reference", "value"] as const) {
    const layout = labelLayout[kind];
    if (!layout?.position) {
      continue;
    }
    labelLayout[kind] = {
      ...layout,
      position: {
        x: layout.position.x + delta.x,
        y: layout.position.y + delta.y,
      },
    };
    changed = true;
  }
  return changed ? { ...node, labelLayout } : node;
}

export function displayedLabelPosition(
  node: ComponentNode,
  symbol: SymbolDefinition,
  kind: NodeLabelKind,
): { point: Point; anchor: LabelTextAnchor } {
  return symbolLabelPosition(node, symbol, kind);
}

export function isNodeLabelVisible(
  node: ComponentNode,
  kind: NodeLabelKind,
): boolean {
  return nodeLabelVisible(node, kind);
}
