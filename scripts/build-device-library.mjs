import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

const sourceRoot = resolve("src/renderer/assets/device-symbols");
const outputRoot = resolve("src/renderer/assets/device-libraries");
const outputPath = join(outputRoot, "drawic-built-in.drawiclib.json");

export const LIBRARY_FORMAT = "drawic-device-library";
export const LIBRARY_SCHEMA_VERSION = 1;

const DANGEROUS_ELEMENTS = [
  "script",
  "foreignObject",
  "iframe",
  "object",
  "embed",
  "audio",
  "video",
  "canvas",
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractSvgBody(markup) {
  const source = markup
    .replace(/^\uFEFF/, "")
    .replace(/<\?xml[\s\S]*?\?>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!DOCTYPE[\s\S]*?>/gi, "");
  const match = source.match(/<svg\b[^>]*>([\s\S]*?)<\/svg>/i);
  if (!match?.[1]) {
    throw new Error("A bundled symbol is not a valid SVG document.");
  }
  return match[1];
}

export function sanitizeSvgBody(markup) {
  let body = extractSvgBody(markup);
  for (const element of DANGEROUS_ELEMENTS) {
    body = body.replace(
      new RegExp(`<${escapeRegExp(element)}\\b[\\s\\S]*?<\\/${escapeRegExp(element)}>`, "gi"),
      "",
    );
    body = body.replace(new RegExp(`<${escapeRegExp(element)}\\b[^>]*\\/?>`, "gi"), "");
  }
  body = body
    .replace(/<title\b[\s\S]*?<\/title>/gi, "")
    .replace(/<desc\b[\s\S]*?<\/desc>/gi, "")
    .replace(/\s+on[a-z][\w:-]*\s*=\s*(?:"[^"]*"|'[^']*')/gi, "")
    .replace(
      /\s+(?:xlink:)?href\s*=\s*(?:"(?:https?:|\/\/|javascript:|data:)[^"]*"|'(?:https?:|\/\/|javascript:|data:)[^']*')/gi,
      "",
    )
    .replace(/\s+(?:xlink:)?href\s*=\s*(?:"[^"]*"|'[^']*')/gi, "")
    .replace(/(fill|stroke)\s*=\s*(["'])(?:#000(?:000)?|black)\2/gi, '$1="currentColor"')
    .replace(
      /((?:fill|stroke)\s*:\s*)(?:#000(?:000)?|black)\b/gi,
      "$1currentColor",
    )
    .replace(/\s+style\s*=\s*(["'])\s*\1/gi, "")
    .trim();

  if (/<script\b|\son[a-z]+\s*=|javascript:/i.test(body)) {
    throw new Error("SVG sanitization left executable content behind.");
  }
  return body;
}

function pinsOnSide(entry, side) {
  return entry.pins
    .map((pin, index) => ({ pin, index }))
    .filter((candidate) => candidate.pin.side === side);
}

function fallbackPinPosition(entry, pin, pinIndex) {
  const sameSide = pinsOnSide(entry, pin.side);
  const order = Math.max(0, sameSide.findIndex((candidate) => candidate.index === pinIndex));
  const fraction = (order + 1) / (sameSide.length + 1);
  const { x, y, width, height } = entry.frame;
  switch (pin.side) {
    case "north":
      return { x: x + width * fraction, y };
    case "south":
      return { x: x + width * fraction, y: y + height };
    case "west":
      return { x, y: y + height * fraction };
    case "east":
      return { x: x + width, y: y + height * fraction };
    default:
      throw new Error(`Unsupported pin direction ${String(pin.side)} for ${entry.id}.`);
  }
}

function numberAttribute(source, name) {
  const match = source.match(new RegExp(`\\b${name}\\s*=\\s*["'](-?[\\d.]+)["']`));
  return match ? Number(match[1]) : null;
}

function attributes(source) {
  const result = {};
  for (const match of source.matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    result[match[1]] = match[2] ?? match[3] ?? "";
  }
  return result;
}

function cubicValue(start, control1, control2, end, t) {
  const inverse = 1 - t;
  return (
    inverse ** 3 * start +
    3 * inverse ** 2 * t * control1 +
    3 * inverse * t ** 2 * control2 +
    t ** 3 * end
  );
}

function cubicExtrema(start, control1, control2, end) {
  const a = -start + 3 * control1 - 3 * control2 + end;
  const b = 2 * (start - 2 * control1 + control2);
  const c = control1 - start;
  const roots = [];
  const addRoot = (value) => {
    if (Number.isFinite(value) && value > 0 && value < 1) {
      roots.push(value);
    }
  };
  if (Math.abs(a) < 1e-9) {
    if (Math.abs(b) > 1e-9) {
      addRoot(-c / b);
    }
  } else {
    const discriminant = b * b - 4 * a * c;
    if (discriminant >= 0) {
      const root = Math.sqrt(discriminant);
      addRoot((-b + root) / (2 * a));
      addRoot((-b - root) / (2 * a));
    }
  }
  const values = [start, end];
  for (const t of roots) {
    values.push(cubicValue(start, control1, control2, end, t));
  }
  return values;
}

function pathBounds(path) {
  const tokens = path.match(
    /[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g,
  );
  if (!tokens) {
    return null;
  }
  const xs = [];
  const ys = [];
  let index = 0;
  let command = "";
  let current = { x: 0, y: 0 };
  let subpathStart = { x: 0, y: 0 };
  let previousCubicControl = null;
  let previousQuadraticControl = null;

  const add = (point) => {
    xs.push(point.x);
    ys.push(point.y);
  };
  const readNumber = () => {
    const value = Number(tokens[index]);
    if (tokens[index] === undefined || !Number.isFinite(value)) {
      throw new Error(`Invalid SVG path near token ${index}.`);
    }
    index += 1;
    return value;
  };

  for (let iteration = 0; index < tokens.length; iteration += 1) {
    if (iteration > 10000) {
      throw new Error("SVG path contains too many commands.");
    }
    if (/^[a-zA-Z]$/.test(tokens[index])) {
      command = tokens[index];
      index += 1;
      if (command === "Z" || command === "z") {
        current = { ...subpathStart };
        add(current);
        previousCubicControl = null;
        previousQuadraticControl = null;
        continue;
      }
    }
    if (!command) {
      throw new Error("SVG path starts without a command.");
    }

    const relative = command === command.toLowerCase();
    const origin = relative ? current : { x: 0, y: 0 };
    const upper = command.toUpperCase();
    if (upper === "M") {
      const point = {
        x: origin.x + readNumber(),
        y: origin.y + readNumber(),
      };
      current = point;
      subpathStart = { ...point };
      add(point);
      command = relative ? "l" : "L";
      previousCubicControl = null;
      previousQuadraticControl = null;
    } else if (upper === "L") {
      const point = {
        x: origin.x + readNumber(),
        y: origin.y + readNumber(),
      };
      add(point);
      current = point;
      previousCubicControl = null;
      previousQuadraticControl = null;
    } else if (upper === "H") {
      current = { x: origin.x + readNumber(), y: current.y };
      add(current);
      previousCubicControl = null;
      previousQuadraticControl = null;
    } else if (upper === "V") {
      current = { x: current.x, y: origin.y + readNumber() };
      add(current);
      previousCubicControl = null;
      previousQuadraticControl = null;
    } else if (upper === "C") {
      const start = { ...current };
      const first = {
        x: origin.x + readNumber(),
        y: origin.y + readNumber(),
      };
      const second = {
        x: origin.x + readNumber(),
        y: origin.y + readNumber(),
      };
      const end = {
        x: origin.x + readNumber(),
        y: origin.y + readNumber(),
      };
      xs.push(...cubicExtrema(start.x, first.x, second.x, end.x));
      ys.push(...cubicExtrema(start.y, first.y, second.y, end.y));
      current = end;
      previousCubicControl = second;
      previousQuadraticControl = null;
    } else if (upper === "S") {
      const start = { ...current };
      const first = previousCubicControl
        ? {
            x: current.x * 2 - previousCubicControl.x,
            y: current.y * 2 - previousCubicControl.y,
          }
        : start;
      const second = {
        x: origin.x + readNumber(),
        y: origin.y + readNumber(),
      };
      const end = {
        x: origin.x + readNumber(),
        y: origin.y + readNumber(),
      };
      xs.push(...cubicExtrema(start.x, first.x, second.x, end.x));
      ys.push(...cubicExtrema(start.y, first.y, second.y, end.y));
      current = end;
      previousCubicControl = second;
      previousQuadraticControl = null;
    } else if (upper === "Q") {
      const start = { ...current };
      const control = {
        x: origin.x + readNumber(),
        y: origin.y + readNumber(),
      };
      const end = {
        x: origin.x + readNumber(),
        y: origin.y + readNumber(),
      };
      xs.push(start.x, control.x, end.x);
      ys.push(start.y, control.y, end.y);
      current = end;
      previousQuadraticControl = control;
      previousCubicControl = null;
    } else if (upper === "T") {
      const start = { ...current };
      const control = previousQuadraticControl
        ? {
            x: current.x * 2 - previousQuadraticControl.x,
            y: current.y * 2 - previousQuadraticControl.y,
          }
        : start;
      const end = {
        x: origin.x + readNumber(),
        y: origin.y + readNumber(),
      };
      xs.push(start.x, control.x, end.x);
      ys.push(start.y, control.y, end.y);
      current = end;
      previousQuadraticControl = control;
      previousCubicControl = null;
    } else {
      throw new Error(`Unsupported SVG path command ${command}.`);
    }
  }

  if (xs.length === 0 || ys.length === 0) {
    return null;
  }
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

function textBounds(attributesSource, content) {
  const values = attributes(attributesSource);
  const text = content
    .replace(/<[^>]+>/g, "")
    .replace(/&(?:#\d+|#x[\da-f]+|[a-z]+);/gi, " ")
    .trim();
  if (!text) {
    return null;
  }
  const x = Number(values.x ?? 0);
  const y = Number(values.y ?? 0);
  const fontSize = Number(values["font-size"] ?? 10);
  const width = Math.max(fontSize * 0.45, text.length * fontSize * 0.58);
  const anchor = values["text-anchor"] ?? "start";
  return {
    minX: anchor === "middle" ? x - width / 2 : anchor === "end" ? x - width : x,
    minY: y - fontSize * 0.82,
    maxX: anchor === "middle" ? x + width / 2 : anchor === "end" ? x : x + width,
    maxY: y + fontSize * 0.25,
  };
}

function includeBounds(bounds, next) {
  if (!next) {
    return bounds;
  }
  if (!bounds) {
    return { ...next };
  }
  bounds.minX = Math.min(bounds.minX, next.minX);
  bounds.minY = Math.min(bounds.minY, next.minY);
  bounds.maxX = Math.max(bounds.maxX, next.maxX);
  bounds.maxY = Math.max(bounds.maxY, next.maxY);
  return bounds;
}

export function svgContentBounds(markup, padding = 2) {
  let bounds = null;
  for (const match of markup.matchAll(/<(line|polyline|polygon|rect|circle|path)\b([^>]*)>/gi)) {
    const kind = match[1].toLowerCase();
    const values = attributes(match[2] ?? "");
    if (kind === "line") {
      const x1 = Number(values.x1);
      const y1 = Number(values.y1);
      const x2 = Number(values.x2);
      const y2 = Number(values.y2);
      if ([x1, y1, x2, y2].every(Number.isFinite)) {
        bounds = includeBounds(bounds, {
          minX: Math.min(x1, x2),
          minY: Math.min(y1, y2),
          maxX: Math.max(x1, x2),
          maxY: Math.max(y1, y2),
        });
      }
    } else if (kind === "polyline" || kind === "polygon") {
      const points = [...(values.points ?? "").matchAll(/(-?[\d.]+)[,\s]+(-?[\d.]+)/g)]
        .map((pair) => ({ x: Number(pair[1]), y: Number(pair[2]) }))
        .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
      if (points.length > 0) {
        bounds = includeBounds(bounds, {
          minX: Math.min(...points.map((point) => point.x)),
          minY: Math.min(...points.map((point) => point.y)),
          maxX: Math.max(...points.map((point) => point.x)),
          maxY: Math.max(...points.map((point) => point.y)),
        });
      }
    } else if (kind === "rect") {
      const x = Number(values.x ?? 0);
      const y = Number(values.y ?? 0);
      const width = Number(values.width);
      const height = Number(values.height);
      if ([x, y, width, height].every(Number.isFinite)) {
        bounds = includeBounds(bounds, {
          minX: x,
          minY: y,
          maxX: x + width,
          maxY: y + height,
        });
      }
    } else if (kind === "circle") {
      const x = Number(values.cx ?? 0);
      const y = Number(values.cy ?? 0);
      const radius = Number(values.r);
      if ([x, y, radius].every(Number.isFinite)) {
        bounds = includeBounds(bounds, {
          minX: x - radius,
          minY: y - radius,
          maxX: x + radius,
          maxY: y + radius,
        });
      }
    } else if (kind === "path" && values.d) {
      bounds = includeBounds(bounds, pathBounds(values.d));
    }
  }
  for (const match of markup.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/gi)) {
    bounds = includeBounds(bounds, textBounds(match[1] ?? "", match[2] ?? ""));
  }
  if (!bounds) {
    return null;
  }
  return {
    minX: bounds.minX - padding,
    minY: bounds.minY - padding,
    maxX: bounds.maxX + padding,
    maxY: bounds.maxY + padding,
  };
}

function drawingEndpoints(markup) {
  const points = [];
  for (const match of markup.matchAll(/<line\b([^>]*)>/gi)) {
    const attributes = match[1] ?? "";
    const x1 = numberAttribute(attributes, "x1");
    const y1 = numberAttribute(attributes, "y1");
    const x2 = numberAttribute(attributes, "x2");
    const y2 = numberAttribute(attributes, "y2");
    if ([x1, y1, x2, y2].every((value) => typeof value === "number")) {
      points.push({ x: x1, y: y1 }, { x: x2, y: y2 });
    }
  }
  for (const match of markup.matchAll(/<polyline\b([^>]*)>/gi)) {
    const attributes = match[1] ?? "";
    const values = attributes.match(/\bpoints\s*=\s*["']([^"']+)["']/i)?.[1] ?? "";
    for (const pair of values.matchAll(/(-?[\d.]+)[,\s]+(-?[\d.]+)/g)) {
      points.push({ x: Number(pair[1]), y: Number(pair[2]) });
    }
  }
  for (const match of markup.matchAll(/<polygon\b([^>]*)>/gi)) {
    const attributes = match[1] ?? "";
    const values = attributes.match(/\bpoints\s*=\s*["']([^"']+)["']/i)?.[1] ?? "";
    for (const pair of values.matchAll(/(-?[\d.]+)[,\s]+(-?[\d.]+)/g)) {
      points.push({ x: Number(pair[1]), y: Number(pair[2]) });
    }
  }
  for (const match of markup.matchAll(/\bd\s*=\s*["']([^"']+)["']/gi)) {
    const path = match[1] ?? "";
    for (const point of path.matchAll(/[ML]\s*(-?[\d.]+)[,\s]+(-?[\d.]+)/gi)) {
      points.push({ x: Number(point[1]), y: Number(point[2]) });
    }
  }
  return points.filter(
    (point, index, all) =>
      all.findIndex(
        (candidate) =>
          Math.abs(candidate.x - point.x) < 0.001 &&
          Math.abs(candidate.y - point.y) < 0.001,
      ) === index,
  );
}

function visualPinPositions(entry, markup) {
  const endpoints = drawingEndpoints(markup);
  const positions = new Map();
  for (const side of ["north", "east", "south", "west"]) {
    const sidePins = pinsOnSide(entry, side);
    if (sidePins.length === 0 || endpoints.length === 0) {
      continue;
    }
    const coordinate = (point) => {
      if (side === "north" || side === "south") {
        return point.y;
      }
      return point.x;
    };
    const extreme =
      side === "north"
        ? Math.min(...endpoints.map(coordinate))
        : side === "south"
          ? Math.max(...endpoints.map(coordinate))
          : side === "west"
            ? Math.min(...endpoints.map(coordinate))
            : Math.max(...endpoints.map(coordinate));
    const candidates = endpoints
      .filter((point) => Math.abs(coordinate(point) - extreme) < 0.01)
      .sort((a, b) =>
        side === "north" || side === "south" ? a.x - b.x : a.y - b.y,
      );
    if (candidates.length < sidePins.length) {
      continue;
    }
    const selected = candidates.slice(0, sidePins.length);
    sidePins.forEach(({ index }, order) => {
      positions.set(index, selected[order]);
    });
  }
  return positions;
}

function labelAnchors(entry) {
  const right = entry.frame.x + entry.frame.width;
  const centerY = entry.frame.y + entry.frame.height / 2;
  return {
    reference: { x: right + 6, y: centerY - 3, anchor: "start" },
    value: { x: right + 6, y: centerY + 12, anchor: "start" },
  };
}

function searchTerms(entry, variantId, variantOf) {
  return [
    entry.id,
    entry.label,
    entry.category,
    variantId,
    variantOf,
    ...entry.pins.map((pin) => pin.key),
    ...entry.pins.map((pin) => pin.role),
  ]
    .map((term) => String(term).trim().toLowerCase())
    .filter((term, index, all) => term && all.indexOf(term) === index)
    .sort();
}

function artworkVariant(markup) {
  return markup.match(/\bdata-variant\s*=\s*["']([^"']+)["']/i)?.[1] ?? null;
}

function visiblePinsForVariant(entry, variant) {
  return /(?:^|-)3terminal$/i.test(variant)
    ? entry.pins.filter(
        (pin) =>
          String(pin.role).toLowerCase() !== "bulk" &&
          String(pin.key).toUpperCase() !== "B",
      )
    : entry.pins;
}

function assertTerminalVariant(entry, pins, markup) {
  const variant = markup.match(/\bdata-variant\s*=\s*["']([^"']+)["']/i)?.[1];
  if (!variant) {
    return;
  }
  const hasBulk = pins.some(
    (pin) =>
      String(pin.role).toLowerCase() === "bulk" ||
      String(pin.key).toUpperCase() === "B",
  );
  if (/-3terminal\b/i.test(variant) && hasBulk) {
    throw new Error(
      `${entry.id} declares ${variant} artwork but includes a bulk pin.`,
    );
  }
  if (/-4terminal\b/i.test(variant) && !hasBulk) {
    throw new Error(
      `${entry.id} declares ${variant} artwork but is missing its bulk pin.`,
    );
  }
}

function variantTitle(entry, variant, pins) {
  if (variant === "base" && pins.some((pin) => pin.role === "bulk")) {
    return `${entry.label} (4-terminal)`;
  }
  return `${entry.label} (${variant})`;
}

const referencePrefixes = {
  resistor: "R",
  "variable-resistor": "R",
  capacitor: "C",
  "variable-capacitor": "C",
  inductor: "L",
  "variable-inductor": "L",
  "center-tap-inductor": "L",
  "voltage-source": "V",
  "pulse-voltage-source": "V",
  "current-source": "I",
  diode: "D",
  "zener-diode": "D",
  nmos: "M",
  pmos: "M",
  npn: "Q",
  pnp: "Q",
  ground: "GND",
};

const defaultValues = {
  resistor: "1k",
  "variable-resistor": "1k",
  capacitor: "1u",
  "variable-capacitor": "1u",
  inductor: "1m",
  "variable-inductor": "1m",
  "center-tap-inductor": "1m",
  "voltage-source": "DC 5",
  "pulse-voltage-source": "PULSE",
  "current-source": "DC 1m",
  diode: "D",
  "zener-diode": "D",
  nmos: "NMOS",
  pmos: "PMOS",
  npn: "NPN",
  pnp: "PNP",
};

function describeSpice(entry) {
  return {
    prefix:
      referencePrefixes[entry.id] ??
      entry.id.replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase(),
    defaultValue: defaultValues[entry.id] ?? "",
    supported: Boolean(entry.electrical && entry.id in referencePrefixes),
  };
}

function createDevice(entry, markup, sourceManifest, options = {}) {
  const variant = options.variant ?? entry.primaryVariant ?? artworkVariant(markup) ?? "base";
  const visiblePins = visiblePinsForVariant(entry, variant);
  assertTerminalVariant(entry, visiblePins, markup);
  const body = sanitizeSvgBody(markup);
  const appearanceEntry = { ...entry, pins: visiblePins };
  const visualPins = visualPinPositions(appearanceEntry, body);
  const { x, y, width, height } = entry.frame;
  const artworkBounds = svgContentBounds(body);
  const selectionBox = artworkBounds
    ? {
        x: Number(artworkBounds.minX.toFixed(6)),
        y: Number(artworkBounds.minY.toFixed(6)),
        width: Number((artworkBounds.maxX - artworkBounds.minX).toFixed(6)),
        height: Number((artworkBounds.maxY - artworkBounds.minY).toFixed(6)),
    }
    : { x, y, width, height };
  const unpaddedBounds = svgContentBounds(body, 0);
  const labelBoundsSource =
    unpaddedBounds ?? { minX: x, minY: y, maxX: x + width, maxY: y + height };
  const allPinPositions = visiblePins.map(
    (pin, index) =>
      visualPins.get(index) ?? fallbackPinPosition(appearanceEntry, pin, index),
  );
  const labelMinX = Math.min(
    labelBoundsSource.minX,
    ...allPinPositions.map((pin) => pin.x),
  );
  const labelMinY = Math.min(
    labelBoundsSource.minY,
    ...allPinPositions.map((pin) => pin.y),
  );
  const labelMaxX = Math.max(
    labelBoundsSource.maxX,
    ...allPinPositions.map((pin) => pin.x),
  );
  const labelMaxY = Math.max(
    labelBoundsSource.maxY,
    ...allPinPositions.map((pin) => pin.y),
  );
  const labelBounds = {
    x: Number(labelMinX.toFixed(6)),
    y: Number(labelMinY.toFixed(6)),
    width: Number((labelMaxX - labelMinX).toFixed(6)),
    height: Number((labelMaxY - labelMinY).toFixed(6)),
  };
  return {
    id: options.id ?? entry.id,
    ...(options.variantOf ? { variantOf: options.variantOf } : {}),
    variantId: variant,
    title: options.title ?? entry.label,
    category: entry.category,
    keywords: searchTerms(entry, variant, options.variantOf),
    electrical: Boolean(entry.electrical),
    palette: Boolean(entry.palette),
    ...(entry.referenceLabel === false ? { referenceLabel: false } : {}),
    frame: { x, y, width, height },
    selectionBox,
    labelBounds,
    artwork: {
      type: "svg",
      viewBox: `${x} ${y} ${width} ${height}`,
      body,
      source: options.sourceFile ?? entry.file,
      sourceSha256: createHash("sha256").update(markup).digest("hex"),
    },
    pins: visiblePins.map((pin, index) => {
      const point = visualPins.get(index) ?? fallbackPinPosition(appearanceEntry, pin, index);
      return {
        id: String(pin.key),
        key: String(pin.key),
        name: String(pin.key),
        role: String(pin.role),
        direction: pin.side,
        side: pin.side,
        x: Number((point.x - (x + width / 2)).toFixed(6)),
        y: Number((point.y - (y + height / 2)).toFixed(6)),
      };
    }),
    labelAnchors: labelAnchors(entry),
    spice: describeSpice(entry),
    metadata: {
      sourceCollection: sourceManifest.collection,
      sourceRevision: sourceManifest.sourceRevision ?? null,
    },
  };
}

export async function buildDeviceLibrary() {
  const manifest = JSON.parse(
    await readFile(join(sourceRoot, "manifest.json"), "utf8"),
  );
  if (manifest.manifestVersion !== 1 || !Array.isArray(manifest.entries)) {
    throw new Error("Unsupported source device manifest.");
  }

  const devices = [];
  for (const entry of manifest.entries) {
    const markup = await readFile(join(sourceRoot, "svg", basename(entry.file)), "utf8");
    devices.push(createDevice(entry, markup, manifest));
    for (const variant of entry.variants ?? []) {
      if (variant.default || variant.file === entry.file) {
        continue;
      }
      const variantMarkup = await readFile(
        join(sourceRoot, "svg", variant.file),
        "utf8",
      );
      const pins = visiblePinsForVariant(entry, variant.id);
      devices.push(
        createDevice(entry, variantMarkup, manifest, {
          id: `${entry.id}--${variant.id}`,
          title: variantTitle(entry, variant.id, pins),
          variant: variant.id,
          variantOf: entry.id,
          sourceFile: variant.file.replace(/^svg\//, ""),
        }),
      );
    }
  }
  devices.sort((a, b) => a.id.localeCompare(b.id));

  const ids = new Set();
  for (const device of devices) {
    if (ids.has(device.id)) {
      throw new Error(`Duplicate device id ${device.id}.`);
    }
    ids.add(device.id);
    const halfWidth = device.frame.width / 2;
    const halfHeight = device.frame.height / 2;
    for (const pin of device.pins) {
      if (
        pin.x < -halfWidth ||
        pin.x > halfWidth ||
        pin.y < -halfHeight ||
        pin.y > halfHeight
      ) {
        throw new Error(`Pin ${pin.id} is outside ${device.id}'s frame.`);
      }
    }
  }

  return {
    format: LIBRARY_FORMAT,
    schemaVersion: LIBRARY_SCHEMA_VERSION,
    id: "drawic-built-in",
    title: "Drawic Built-in Devices",
    revision: createHash("sha256")
      .update(JSON.stringify(devices))
      .digest("hex"),
    source: {
      collection: manifest.collection,
      manifestVersion: manifest.manifestVersion,
      entryCount: manifest.entries.length,
    },
    devices,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const library = await buildDeviceLibrary();
  await mkdir(outputRoot, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(library, null, 2)}\n`);
  const bytes = (await readFile(outputPath)).byteLength;
  console.log(
    `Built ${library.devices.length} devices in one library file (${bytes.toLocaleString()} bytes).`,
  );
}
