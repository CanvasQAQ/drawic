import { nodeBounds, symbolTransform } from "../geometry";
import type { SchematicCell, SymbolDefinition } from "../model";

export interface SvgExportOptions {
  includeBackground?: boolean;
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

function wirePath(points: Array<{ x: number; y: number }>): string {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${numberOf(point.x)} ${numberOf(point.y)}`)
    .join(" ");
}

export function buildSchematicSvg(
  cell: SchematicCell,
  library: readonly SymbolDefinition[],
  options: SvgExportOptions = {},
): string {
  const symbols = new Map(library.map((symbol) => [symbol.id, symbol]));
  const bounds = cell.nodes
    .map((node) => {
      const symbol = symbols.get(node.symbolId);
      return symbol ? nodeBounds(node, symbol) : null;
    })
    .filter((value): value is { minX: number; minY: number; maxX: number; maxY: number } => value !== null);

  const allPoints = [
    ...cell.wires.flatMap((wire) => wire.points),
    ...cell.annotations.map((annotation) => ({ x: annotation.x, y: annotation.y })),
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

  const wireMarkup = cell.wires
    .filter((wire) => wire.points.length >= 2)
    .map(
      (wire) =>
        `    <path class="wire" d="${wirePath(wire.points)}" fill="none" stroke="#1a2833" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    )
    .join("\n");

  const nodeMarkup = cell.nodes
    .map((node) => {
      const symbol = symbols.get(node.symbolId);
      if (!symbol) {
        return "";
      }
      const reference = xmlEscape(node.reference || "?");
      const value = xmlEscape(node.value);
      return [
        `    <g class="component" data-symbol="${xmlEscape(symbol.id)}" transform="${symbolTransform(node, symbol)}">`,
        `      ${symbol.svgBody.trim()}`,
        `    </g>`,
        `    <text x="${numberOf(node.x + 8)}" y="${numberOf(node.y - 2)}" fill="#15323d" font-family="Arial, sans-serif" font-size="13" font-weight="700">${reference}</text>`,
        value
          ? `    <text x="${numberOf(node.x + 8)}" y="${numberOf(node.y + 13)}" fill="#425866" font-family="Arial, sans-serif" font-size="12">${value}</text>`
          : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  const annotationMarkup = cell.annotations
    .map((annotation) => {
      const color = annotation.kind === "net" ? "#9a3f18" : "#34434c";
      const weight = annotation.kind === "net" ? "700" : "400";
      return `    <text x="${numberOf(annotation.x)}" y="${numberOf(annotation.y)}" fill="${color}" font-family="Arial, sans-serif" font-size="${numberOf(annotation.size)}" font-weight="${weight}">${xmlEscape(annotation.text)}</text>`;
    })
    .join("\n");

  const junctionMarkup = cell.junctions
    .map(
      (junction) =>
        `    <circle cx="${numberOf(junction.x)}" cy="${numberOf(junction.y)}" r="4" fill="#1a2833"/>`,
    )
    .join("\n");

  const background = options.includeBackground === false
    ? ""
    : `  <rect x="${numberOf(minX)}" y="${numberOf(minY)}" width="${numberOf(width)}" height="${numberOf(height)}" fill="#ffffff"/>\n`;

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${numberOf(minX)} ${numberOf(minY)} ${numberOf(width)} ${numberOf(height)}" width="${numberOf(width)}" height="${numberOf(height)}" role="img" aria-label="${xmlEscape(cell.name)}">`,
    `  <title>${xmlEscape(cell.name)} — Drawic schematic</title>`,
    background.trimEnd(),
    '  <g id="wires">',
    wireMarkup,
    "  </g>",
    '  <g id="junctions">',
    junctionMarkup,
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
