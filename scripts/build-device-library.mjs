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

function searchTerms(entry) {
  return [
    entry.id,
    entry.label,
    entry.category,
    ...entry.pins.map((pin) => pin.key),
    ...entry.pins.map((pin) => pin.role),
  ]
    .map((term) => String(term).trim().toLowerCase())
    .filter((term, index, all) => term && all.indexOf(term) === index)
    .sort();
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

function createDevice(entry, markup, sourceManifest) {
  const body = sanitizeSvgBody(markup);
  const visualPins = visualPinPositions(entry, body);
  const { x, y, width, height } = entry.frame;
  return {
    id: entry.id,
    title: entry.label,
    category: entry.category,
    keywords: searchTerms(entry),
    electrical: Boolean(entry.electrical),
    palette: Boolean(entry.palette),
    frame: { x, y, width, height },
    artwork: {
      type: "svg",
      viewBox: `${x} ${y} ${width} ${height}`,
      body,
      source: entry.file,
      sourceSha256: createHash("sha256").update(markup).digest("hex"),
    },
    pins: entry.pins.map((pin, index) => {
      const point = visualPins.get(index) ?? fallbackPinPosition(entry, pin, index);
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
