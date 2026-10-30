import {
  nodeBounds,
  nodeLabelVisible,
  symbolLabelPosition,
  symbolTransform,
} from "../geometry";
import {
  allJunctions,
  allWires,
  DEFAULT_ANNOTATION_TEXT_COLOR,
  DEFAULT_NET_LABEL_COLOR,
  DEFAULT_NOTE_FILL,
  DEFAULT_NOTE_FILL_OPACITY,
  DEFAULT_NOTE_STROKE,
  DEFAULT_NOTE_STROKE_WIDTH,
  DEFAULT_NOTE_TEXT_COLOR,
  DEFAULT_SHAPE_FILL,
  DEFAULT_SHAPE_STROKE,
  DEFAULT_SHAPE_STROKE_WIDTH,
  DEFAULT_SHAPE_TEXT_ALIGN,
  DEFAULT_SHAPE_TEXT_COLOR,
  DEFAULT_SHAPE_TEXT_SIZE,
  type DocumentTypography,
  type DrawingPage,
  type SymbolDefinition,
} from "../model";
import { buildConnectivity } from "../connectivity";
import { resolveWirePoints } from "../wireMotion";
import { wireHops, wireOverlaps, wirePathData } from "../wireHops";
import {
  NOTE_PADDING,
  NOTE_TEXT_TOP,
  clampNoteTextOffset,
  layoutNoteText,
} from "../noteText";
import {
  DEFAULT_TYPOGRAPHY,
  SUBSCRIPT_BASELINE_DROP,
  SUBSCRIPT_HORIZONTAL_GAP,
  SUBSCRIPT_SCALE,
  effectiveNameFontSize,
  effectiveValueFontSize,
  fontStack,
  parseReferenceAppearance,
} from "../labels";
import {
  richTextRunMetrics,
  richTextRunsForReference,
} from "../richText";

export interface SvgExportOptions {
  includeBackground?: boolean;
  typography?: DocumentTypography;
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function numberOf(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function rotatePointAround(
  point: { x: number; y: number },
  origin: { x: number; y: number },
  rotation: number,
): { x: number; y: number } {
  const x = point.x - origin.x;
  const y = point.y - origin.y;
  switch (rotation) {
    case 90:
      return { x: origin.x - y, y: origin.y + x };
    case 180:
      return { x: origin.x - x, y: origin.y - y };
    case 270:
      return { x: origin.x + y, y: origin.y - x };
    default:
      return point;
  }
}

function referenceLabelMarkup(
  node: DrawingPage["nodes"][number],
  symbol: SymbolDefinition,
  typography: DocumentTypography,
): string {
  if (
    symbol.referenceLabel === false ||
    !node.reference.trim() ||
    !nodeLabelVisible(node, "reference")
  ) {
    return "";
  }
  const label = symbolLabelPosition(node, symbol, "reference");
  const layout = node.labelLayout?.reference;
  const fontSize = effectiveNameFontSize(layout, typography);
  const custom =
    layout?.fontStyle !== undefined ||
    layout?.fontWeight !== undefined ||
    layout?.script !== undefined;
  const segments = custom
    ? [{ text: node.reference, role: "plain" as const }]
    : parseReferenceAppearance(node.reference);
  const customShift =
    layout?.script === "superscript"
      ? -SUBSCRIPT_BASELINE_DROP * fontSize
      : layout?.script === "subscript"
        ? SUBSCRIPT_BASELINE_DROP * fontSize
        : 0;
  const richRuns = layout?.richText
    ? richTextRunsForReference(node.reference, layout.richText)
    : null;
  let baselineOffset = 0;
  const tspans = richRuns
    ? richRuns
        .map((run, index) => {
          const metrics = richTextRunMetrics(run, fontSize);
          const dy = metrics.dy - baselineOffset;
          baselineOffset = metrics.dy;
          const role =
            run.script === "normal"
              ? index === 0
                ? "base"
                : "plain"
              : run.script;
          return `<tspan data-rich-role="${role}" font-weight="${run.bold ? 700 : 400}" font-style="${run.italic ? "italic" : "normal"}" font-size="${numberOf(metrics.fontSize)}"${metrics.dx ? ` dx="${numberOf(metrics.dx)}"` : ""}${dy ? ` dy="${numberOf(dy)}"` : ""}${run.color ? ` fill="${xmlEscape(run.color)}"` : ""}>${xmlEscape(run.text)}</tspan>`;
        })
        .join("")
    : segments
    .map((segment) => {
      const subscript = segment.role === "subscript";
      const weight =
        layout?.fontWeight ??
        (subscript || segment.role === "base" ? 700 : 400);
      const style =
        layout?.fontStyle ??
        (subscript ? "normal" : segment.role === "base" ? "italic" : "normal");
      const size = subscript ? fontSize * SUBSCRIPT_SCALE : fontSize;
      const dx = subscript ? fontSize * SUBSCRIPT_HORIZONTAL_GAP : 0;
      const dy = subscript
        ? fontSize * SUBSCRIPT_BASELINE_DROP
        : custom
          ? customShift
          : 0;
      return `<tspan data-rich-role="${segment.role}" font-weight="${weight}" font-style="${style}" font-size="${numberOf(size)}"${dx ? ` dx="${numberOf(dx)}"` : ""}${dy ? ` dy="${numberOf(dy)}"` : ""}>${xmlEscape(segment.text)}</tspan>`;
    })
    .join("");
  return `    <text class="component-reference" data-label-kind="reference" data-label-placement="${layout?.placement ?? "legacy"}" x="${numberOf(label.point.x)}" y="${numberOf(label.point.y)}" text-anchor="${label.anchor}" fill="${xmlEscape(layout?.color ?? "#15323d")}" font-family="${xmlEscape(fontStack(typography))}" font-size="${numberOf(fontSize)}" style="font-synthesis:style weight">${tspans}</text>`;
}

function valueLabelMarkup(
  node: DrawingPage["nodes"][number],
  symbol: SymbolDefinition,
  typography: DocumentTypography,
): string {
  if (!node.value.trim() || !nodeLabelVisible(node, "value")) {
    return "";
  }
  const label = symbolLabelPosition(node, symbol, "value");
  const layout = node.labelLayout?.value;
  return `    <text class="component-value" data-label-kind="value" data-label-placement="${layout?.placement ?? "legacy"}" x="${numberOf(label.point.x)}" y="${numberOf(label.point.y)}" text-anchor="${label.anchor}" fill="${xmlEscape(layout?.color ?? "#425866")}" font-family="${xmlEscape(fontStack(typography))}" font-size="${numberOf(effectiveValueFontSize(layout, typography))}">${xmlEscape(node.value)}</text>`;
}

export function buildSchematicSvg(
  page: DrawingPage,
  library: readonly SymbolDefinition[],
  options: SvgExportOptions = {},
): string {
  const symbols = new Map(library.map((symbol) => [symbol.id, symbol]));
  const typography = options.typography ?? DEFAULT_TYPOGRAPHY;
  const connectivity = buildConnectivity(page, library);
  const hopPositions = wireHops(connectivity);
  const overlapRanges = wireOverlaps(connectivity);
  const netColorById = new Map(
    page.nets.map((net) => [net.id, net.color] as const),
  );
  const bounds = page.nodes
    .map((node) => {
      const symbol = symbols.get(node.symbolId);
      return symbol ? nodeBounds(node, symbol) : null;
    })
    .filter((value): value is { minX: number; minY: number; maxX: number; maxY: number } => value !== null);

  const allPoints = [
    ...allWires(page).flatMap(
      ({ wire }) => resolveWirePoints(page, library, wire) ?? [],
    ),
    ...allJunctions(page).map(({ junction }) => junction.point),
    ...page.annotations.flatMap((annotation) => {
      const lines = annotation.text.split(/\r?\n/);
      const width =
        Math.max(1, ...lines.map((line) => line.length)) * annotation.size * 0.62;
      const height = Math.max(1, lines.length) * annotation.size * 1.2;
      const origin = { x: annotation.x, y: annotation.y };
      const corners = [
        { x: annotation.x, y: annotation.y },
        { x: annotation.x + width, y: annotation.y },
        { x: annotation.x + width, y: annotation.y - height },
        { x: annotation.x, y: annotation.y - height },
      ];
      return corners.map((corner) =>
        rotatePointAround(corner, origin, annotation.rotation ?? 0),
      );
    }),
    ...page.shapes.flatMap((shape) => [
      { x: shape.x, y: shape.y },
      { x: shape.x + shape.width, y: shape.y + shape.height },
    ]),
  ];
  const minX = Math.min(
    0,
    ...bounds.map((box) => box.minX),
    ...allPoints.map((point) => point.x),
  ) - 48;
  const minY = Math.min(
    0,
    ...bounds.map((box) => box.minY),
    ...allPoints.map((point) => point.y),
  ) - 48;
  const maxX = Math.max(
    800,
    ...bounds.map((box) => box.maxX),
    ...allPoints.map((point) => point.x),
  ) + 48;
  const maxY = Math.max(
    500,
    ...bounds.map((box) => box.maxY),
    ...allPoints.map((point) => point.y),
  ) + 48;
  const width = maxX - minX;
  const height = maxY - minY;

  const wireMarkup = allWires(page)
    .flatMap(({ net, wire }) => {
      const points = resolveWirePoints(page, library, wire);
      return points
        ? [
            `    <path class="wire" d="${wirePathData(points, hopPositions.get(wire.id), overlapRanges.get(wire.id))}" fill="none" stroke="${xmlEscape(net.color ?? "#1a2833")}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
          ]
        : [];
    })
    .join("\n");

  const nodeMarkup = page.nodes
    .map((node) => {
      const symbol = symbols.get(node.symbolId);
      if (!symbol) {
        return "";
      }
      return [
        `    <g class="component" data-symbol="${xmlEscape(symbol.id)}" transform="${symbolTransform(node, symbol)}">`,
        `      ${symbol.svgBody.trim()}`,
        `    </g>`,
        referenceLabelMarkup(node, symbol, typography),
        valueLabelMarkup(node, symbol, typography),
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  const annotationMarkup = page.annotations
    .map((annotation) => {
      const isNet = annotation.kind === "net";
      const color = isNet
        ? (annotation.netId ? netColorById.get(annotation.netId) : undefined) ??
          annotation.color ??
          DEFAULT_NET_LABEL_COLOR
        : annotation.color ?? DEFAULT_ANNOTATION_TEXT_COLOR;
      const weight = isNet || annotation.bold ? 700 : 400;
      const italic = annotation.italic ? ' font-style="italic"' : "";
      const fontFamily = isNet
        ? "ui-monospace, SFMono-Regular, Consolas, monospace"
        : "Arial, sans-serif";
      const align = annotation.align ?? "start";
      const rotation = annotation.rotation ?? 0;
      const transform =
        rotation === 0
          ? ""
          : ` transform="rotate(${rotation} ${numberOf(annotation.x)} ${numberOf(annotation.y)})"`;
      const halo = isNet
        ? ' paint-order="stroke" stroke="#ffffff" stroke-width="4" stroke-linejoin="round"'
        : "";
      const lines = annotation.text.split(/\r?\n/);
      const lineHeight = annotation.size * 1.2;
      const spans = lines
        .map(
          (line, index) =>
            `<tspan x="${numberOf(annotation.x)}"${index === 0 ? "" : ` dy="${numberOf(lineHeight)}"`}>${xmlEscape(line)}</tspan>`,
        )
        .join("");
      return `    <text class="annotation annotation-${annotation.kind}" x="${numberOf(annotation.x)}" y="${numberOf(annotation.y)}" text-anchor="${align}"${transform}${halo} fill="${xmlEscape(color)}" font-family="${fontFamily}" font-size="${numberOf(annotation.size)}" font-weight="${weight}"${italic}>${spans}</text>`;
    })
    .join("\n");

  const junctionMarkup = allJunctions(page)
    .map(
      ({ net, junction }) =>
        `    <circle class="junction" cx="${numberOf(junction.point.x)}" cy="${numberOf(junction.point.y)}" r="4" fill="${xmlEscape(net.color ?? "#1a2833")}"/>`,
    )
    .join("\n");

  const shapeMarkupParts = page.shapes.map((shape) => {
      const centerX = shape.x + shape.width / 2;
      const centerY = shape.y + shape.height / 2;
      const transform =
        shape.rotation === 0
          ? ""
          : ` transform="rotate(${shape.rotation} ${numberOf(centerX)} ${numberOf(centerY)})"`;
      const strokeWidth =
        shape.strokeWidth ??
        (shape.kind === "note" ? DEFAULT_NOTE_STROKE_WIDTH : DEFAULT_SHAPE_STROKE_WIDTH);
      const dash =
        shape.dash === "dashed"
          ? ' stroke-dasharray="7 5"'
          : shape.dash === "dotted"
            ? ' stroke-dasharray="2 4"'
            : "";
      const opacity = shape.opacity ?? 1;
      const fillOpacity =
        shape.fillOpacity ??
        (shape.kind === "note" ? DEFAULT_NOTE_FILL_OPACITY : 1);
      const fill =
        shape.fill ||
        (shape.kind === "note" ? DEFAULT_NOTE_FILL : DEFAULT_SHAPE_FILL);
      const stroke =
        shape.stroke ||
        (shape.kind === "note" ? DEFAULT_NOTE_STROKE : DEFAULT_SHAPE_STROKE);
      const textSize = shape.textSize ?? DEFAULT_SHAPE_TEXT_SIZE;
      const textColor =
        shape.textColor ??
        (shape.kind === "note" ? DEFAULT_NOTE_TEXT_COLOR : DEFAULT_SHAPE_TEXT_COLOR);
      const textAlign = shape.textAlign ?? (shape.kind === "note" ? "start" : DEFAULT_SHAPE_TEXT_ALIGN);
      const lines = shape.text?.split(/\r?\n/) ?? [];
      const textX =
        textAlign === "middle"
          ? centerX
          : textAlign === "end"
            ? shape.x + shape.width - 14
            : shape.x + 14;

      if (shape.kind === "note") {
        const layout = layoutNoteText(shape.text ?? "", shape.width, textSize);
        const offset = clampNoteTextOffset(
          shape.textOffset ?? { x: 0, y: 0 },
          shape.text ?? "",
          shape.width,
          shape.height,
          textSize,
        );
        const noteTextX =
          textAlign === "middle"
            ? shape.x + shape.width / 2 + offset.x
            : textAlign === "end"
              ? shape.x + shape.width - NOTE_PADDING + offset.x
              : shape.x + NOTE_PADDING + offset.x;
        const noteTextTop = shape.y + NOTE_TEXT_TOP + offset.y;
        let lineOffset = 0;
        const spans = layout
          .map((line) => {
            const y = noteTextTop + lineOffset;
            lineOffset += line.lineHeight;
            return `<tspan x="${numberOf(noteTextX)}" y="${numberOf(y)}" font-size="${numberOf(line.fontSize)}" font-weight="${line.heading ? 700 : 400}">${xmlEscape(line.text)}</tspan>`;
          })
          .join("");
        const text =
          layout.length > 0
            ? `<text class="note-text" x="${numberOf(noteTextX)}" text-anchor="${textAlign}" fill="${xmlEscape(textColor)}" font-family="Arial, sans-serif">${spans}</text>`
            : "";
        const body = `<rect x="${numberOf(shape.x)}" y="${numberOf(shape.y)}" width="${numberOf(shape.width)}" height="${numberOf(shape.height)}" rx="${numberOf(Math.min(10, shape.width / 2, shape.height / 2))}" fill="${xmlEscape(fill)}" fill-opacity="${numberOf(fillOpacity)}" stroke="${xmlEscape(stroke)}" stroke-width="${numberOf(strokeWidth)}"${opacity === 1 ? "" : ` opacity="${numberOf(opacity)}"`}/>`;
        return {
          note: true,
          markup: `    <g${transform}>${body}${text}</g>`,
        };
      }

      const paint = `fill="${xmlEscape(fill)}" fill-opacity="${numberOf(fillOpacity)}" stroke="${xmlEscape(stroke)}" stroke-width="${numberOf(strokeWidth)}"${dash}${opacity === 1 ? "" : ` opacity="${numberOf(opacity)}"`}`;
      const shapeElement =
        shape.kind === "ellipse"
          ? `<ellipse cx="${numberOf(centerX)}" cy="${numberOf(centerY)}" rx="${numberOf(shape.width / 2)}" ry="${numberOf(shape.height / 2)}" ${paint}/>`
          : `<rect x="${numberOf(shape.x)}" y="${numberOf(shape.y)}" width="${numberOf(shape.width)}" height="${numberOf(shape.height)}" ${paint}/>`;
      const textBold = shape.textBold ?? true;
      const lineHeight = textSize * 1.25;
      const firstY = centerY - ((lines.length - 1) * lineHeight) / 2;
      const spans = lines
        .map(
          (line, index) =>
            `<tspan x="${numberOf(textX)}"${index === 0 ? "" : ` dy="${numberOf(lineHeight)}"`}>${xmlEscape(line)}</tspan>`,
        )
        .join("");
      const text =
        lines.length > 0
          ? `<text x="${numberOf(textX)}" y="${numberOf(firstY)}" text-anchor="${textAlign}" dominant-baseline="central" fill="${xmlEscape(textColor)}" font-family="Arial, sans-serif" font-size="${numberOf(textSize)}" font-weight="${textBold ? 600 : 400}">${spans}</text>`
          : "";
      return {
        note: false,
        markup: `    <g${transform}>${shapeElement}${text}</g>`,
      };
    })
  const shapeMarkup = shapeMarkupParts
    .filter((part) => !part.note)
    .map((part) => part.markup)
    .join("\n");
  const noteMarkup = shapeMarkupParts
    .filter((part) => part.note)
    .map((part) => part.markup)
    .join("\n");

  const background = options.includeBackground === false
    ? ""
    : `  <rect x="${numberOf(minX)}" y="${numberOf(minY)}" width="${numberOf(width)}" height="${numberOf(height)}" fill="#ffffff"/>\n`;

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${numberOf(minX)} ${numberOf(minY)} ${numberOf(width)} ${numberOf(height)}" width="${numberOf(width)}" height="${numberOf(height)}" role="img" aria-label="${xmlEscape(page.name)}">`,
    `  <title>${xmlEscape(page.name)} — Drawic schematic</title>`,
    background.trimEnd(),
    '  <g id="wires">',
    wireMarkup,
    "  </g>",
    '  <g id="junctions">',
    junctionMarkup,
    "  </g>",
    '  <g id="shapes">',
    shapeMarkup,
    "  </g>",
    '  <g id="components">',
    nodeMarkup,
    "  </g>",
    '  <g id="notes">',
    noteMarkup,
    "  </g>",
    '  <g id="annotations">',
    annotationMarkup,
    "  </g>",
    "</svg>",
    "",
  ]
    .filter((line) => line !== "")
    .join("\n");
}
