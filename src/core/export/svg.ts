import {
  nodeBounds,
  nodeLabelVisible,
  symbolLabelPosition,
  symbolTransform,
} from "../geometry";
import {
  allJunctions,
  allWires,
  type DocumentTypography,
  type DrawingPage,
  type SymbolDefinition,
} from "../model";
import { buildConnectivity } from "../connectivity";
import { resolveWirePoints } from "../wireMotion";
import { wireHops, wireOverlaps, wirePathData } from "../wireHops";
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
    ...page.annotations.map((annotation) => ({ x: annotation.x, y: annotation.y })),
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
      const color = annotation.kind === "net" ? "#9a3f18" : "#34434c";
      const weight = annotation.kind === "net" ? "700" : "400";
      return `    <text x="${numberOf(annotation.x)}" y="${numberOf(annotation.y)}" fill="${color}" font-family="Arial, sans-serif" font-size="${numberOf(annotation.size)}" font-weight="${weight}">${xmlEscape(annotation.text)}</text>`;
    })
    .join("\n");

  const junctionMarkup = allJunctions(page)
    .map(
      ({ net, junction }) =>
        `    <circle class="junction" cx="${numberOf(junction.point.x)}" cy="${numberOf(junction.point.y)}" r="4" fill="${xmlEscape(net.color ?? "#1a2833")}"/>`,
    )
    .join("\n");

  const shapeMarkup = page.shapes
    .map((shape) => {
      const centerX = shape.x + shape.width / 2;
      const centerY = shape.y + shape.height / 2;
      const transform =
        shape.rotation === 0
          ? ""
          : ` transform="rotate(${shape.rotation} ${numberOf(centerX)} ${numberOf(centerY)})"`;
      const paint = `fill="${xmlEscape(shape.fill)}" stroke="${xmlEscape(shape.stroke)}" stroke-width="2"`;
      const shapeElement =
        shape.kind === "ellipse"
          ? `<ellipse cx="${numberOf(centerX)}" cy="${numberOf(centerY)}" rx="${numberOf(shape.width / 2)}" ry="${numberOf(shape.height / 2)}" ${paint}/>`
          : `<rect x="${numberOf(shape.x)}" y="${numberOf(shape.y)}" width="${numberOf(shape.width)}" height="${numberOf(shape.height)}" ${paint}/>`;
      const text = shape.text
        ? `<text x="${numberOf(centerX)}" y="${numberOf(centerY)}" text-anchor="middle" dominant-baseline="central" fill="#263d48" font-family="Arial, sans-serif" font-size="13">${xmlEscape(shape.text)}</text>`
        : "";
      return `    <g${transform}>${shapeElement}${text}</g>`;
    })
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
    '  <g id="annotations">',
    annotationMarkup,
    "  </g>",
    "</svg>",
    "",
  ]
    .filter((line) => line !== "")
    .join("\n");
}
