import type { SymbolDefinition, SymbolSide } from "./model";

export const DEVICE_LIBRARY_FORMAT = "drawic-device-library" as const;
export const DEVICE_LIBRARY_SCHEMA_VERSION = 1 as const;

export interface DeviceLibraryLabelAnchor {
  x: number;
  y: number;
  anchor: "start" | "middle" | "end";
}

export interface DeviceLibraryPin {
  id: string;
  key: string;
  name: string;
  role: string;
  direction: SymbolSide;
  side: SymbolSide;
  x: number;
  y: number;
}

export interface DeviceLibrarySpice {
  prefix: string;
  defaultValue: string;
  supported: boolean;
}

export interface DeviceLibraryRecord {
  id: string;
  variantOf?: string;
  variantId?: string;
  title: string;
  category: string;
  keywords: string[];
  electrical: boolean;
  palette: boolean;
  referenceLabel?: boolean;
  frame: { x: number; y: number; width: number; height: number };
  selectionBox?: { x: number; y: number; width: number; height: number };
  labelBounds?: { x: number; y: number; width: number; height: number };
  artwork: {
    type: "svg";
    viewBox: string;
    body: string;
    source: string;
    sourceSha256: string;
  };
  pins: DeviceLibraryPin[];
  labelAnchors: {
    reference: DeviceLibraryLabelAnchor;
    value: DeviceLibraryLabelAnchor;
  };
  spice: DeviceLibrarySpice;
  metadata: {
    sourceCollection: string;
    sourceRevision: string | null;
  };
}

export interface DeviceLibraryFile {
  format: typeof DEVICE_LIBRARY_FORMAT;
  schemaVersion: typeof DEVICE_LIBRARY_SCHEMA_VERSION;
  id: string;
  title: string;
  revision: string;
  source: {
    collection: string;
    manifestVersion: number;
    entryCount: number;
  };
  devices: DeviceLibraryRecord[];
}

export interface DeviceSymbol extends SymbolDefinition {
  pins: DeviceLibraryPin[];
  viewBox: string;
  labelAnchors: DeviceLibraryRecord["labelAnchors"];
  keywords: string[];
  spice: DeviceLibrarySpice;
  libraryId: string;
}

export interface LoadedDeviceLibrary {
  id: string;
  title: string;
  revision: string;
  symbols: DeviceSymbol[];
  byId: ReadonlyMap<string, DeviceSymbol>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expectString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string.`);
  }
  return value;
}

function expectNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number.`);
  }
  return value;
}

function expectBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${field} must be boolean.`);
  }
  return value;
}

function parseAnchor(value: unknown, field: string): DeviceLibraryLabelAnchor {
  if (
    !isRecord(value) ||
    (value.anchor !== "start" && value.anchor !== "middle" && value.anchor !== "end")
  ) {
    throw new Error(`${field} must be a valid label anchor.`);
  }
  return {
    x: expectNumber(value.x, `${field}.x`),
    y: expectNumber(value.y, `${field}.y`),
    anchor: value.anchor,
  };
}

function parsePin(value: unknown, field: string): DeviceLibraryPin {
  if (!isRecord(value)) {
    throw new Error(`${field} must be an object.`);
  }
  const direction = value.direction;
  if (
    direction !== "north" &&
    direction !== "east" &&
    direction !== "south" &&
    direction !== "west"
  ) {
    throw new Error(`${field}.direction is invalid.`);
  }
  return {
    id: expectString(value.id, `${field}.id`),
    key: expectString(value.key, `${field}.key`),
    name: expectString(value.name, `${field}.name`),
    role: expectString(value.role, `${field}.role`),
    direction,
    side: direction,
    x: expectNumber(value.x, `${field}.x`),
    y: expectNumber(value.y, `${field}.y`),
  };
}

function parseDevice(value: unknown, index: number): DeviceLibraryRecord {
  const field = `devices[${index}]`;
  if (
    !isRecord(value) ||
    !isRecord(value.frame) ||
    !isRecord(value.artwork) ||
    !isRecord(value.spice) ||
    !isRecord(value.labelAnchors)
  ) {
    throw new Error(`${field} has an invalid shape.`);
  }
  if (!Array.isArray(value.pins) || !Array.isArray(value.keywords)) {
    throw new Error(`${field} must contain pins and keywords arrays.`);
  }
  if (value.artwork.type !== "svg") {
    throw new Error(`${field}.artwork.type is unsupported.`);
  }
  const body = expectString(value.artwork.body, `${field}.artwork.body`);
  if (/<script\b|\son[a-z]+\s*=|javascript:/i.test(body)) {
    throw new Error(`${field}.artwork.body contains executable content.`);
  }
  const parsedFrame = {
    x: expectNumber(value.frame.x, `${field}.frame.x`),
    y: expectNumber(value.frame.y, `${field}.frame.y`),
    width: expectNumber(value.frame.width, `${field}.frame.width`),
    height: expectNumber(value.frame.height, `${field}.frame.height`),
  };
  const selectionBox =
    value.selectionBox === undefined
      ? undefined
      : isRecord(value.selectionBox)
        ? {
            x: expectNumber(value.selectionBox.x, `${field}.selectionBox.x`),
            y: expectNumber(value.selectionBox.y, `${field}.selectionBox.y`),
            width: expectNumber(value.selectionBox.width, `${field}.selectionBox.width`),
            height: expectNumber(value.selectionBox.height, `${field}.selectionBox.height`),
          }
        : (() => {
            throw new Error(`${field}.selectionBox must be an object.`);
          })();
  const labelBounds =
    value.labelBounds === undefined
      ? undefined
      : isRecord(value.labelBounds)
        ? {
            x: expectNumber(value.labelBounds.x, `${field}.labelBounds.x`),
            y: expectNumber(value.labelBounds.y, `${field}.labelBounds.y`),
            width: expectNumber(value.labelBounds.width, `${field}.labelBounds.width`),
            height: expectNumber(value.labelBounds.height, `${field}.labelBounds.height`),
          }
        : (() => {
            throw new Error(`${field}.labelBounds must be an object.`);
          })();
  const variantOf =
    value.variantOf === undefined
      ? undefined
      : expectString(value.variantOf, `${field}.variantOf`);
  const variantId =
    value.variantId === undefined
      ? undefined
      : expectString(value.variantId, `${field}.variantId`);
  return {
    id: expectString(value.id, `${field}.id`),
    ...(variantOf ? { variantOf } : {}),
    ...(variantId ? { variantId } : {}),
    title: expectString(value.title, `${field}.title`),
    category: expectString(value.category, `${field}.category`),
    keywords: value.keywords.map((term, termIndex) =>
      expectString(term, `${field}.keywords[${termIndex}]`),
    ),
    electrical: expectBoolean(value.electrical, `${field}.electrical`),
    palette: expectBoolean(value.palette, `${field}.palette`),
    ...(value.referenceLabel === undefined
      ? {}
      : {
          referenceLabel: expectBoolean(
            value.referenceLabel,
            `${field}.referenceLabel`,
          ),
        }),
    frame: parsedFrame,
    ...(selectionBox ? { selectionBox } : {}),
    ...(labelBounds ? { labelBounds } : {}),
    artwork: {
      type: "svg",
      viewBox: expectString(value.artwork.viewBox, `${field}.artwork.viewBox`),
      body,
      source: expectString(value.artwork.source, `${field}.artwork.source`),
      sourceSha256: expectString(value.artwork.sourceSha256, `${field}.artwork.sourceSha256`),
    },
    pins: value.pins.map((pin, pinIndex) =>
      parsePin(pin, `${field}.pins[${pinIndex}]`),
    ),
    labelAnchors: {
      reference: parseAnchor(
        value.labelAnchors.reference,
        `${field}.labelAnchors.reference`,
      ),
      value: parseAnchor(value.labelAnchors.value, `${field}.labelAnchors.value`),
    },
    spice: {
      prefix: expectString(value.spice.prefix, `${field}.spice.prefix`),
      defaultValue: expectString(value.spice.defaultValue, `${field}.spice.defaultValue`),
      supported: expectBoolean(value.spice.supported, `${field}.spice.supported`),
    },
    metadata: {
      sourceCollection: expectString(
        isRecord(value.metadata) ? value.metadata.sourceCollection : undefined,
        `${field}.metadata.sourceCollection`,
      ),
      sourceRevision:
        isRecord(value.metadata) && typeof value.metadata.sourceRevision === "string"
          ? value.metadata.sourceRevision
          : null,
    },
  };
}

export function parseDeviceLibrary(value: unknown): DeviceLibraryFile {
  if (!isRecord(value)) {
    throw new Error("Device library root must be an object.");
  }
  if (value.format !== DEVICE_LIBRARY_FORMAT) {
    throw new Error("This file is not a Drawic device library.");
  }
  if (value.schemaVersion !== DEVICE_LIBRARY_SCHEMA_VERSION) {
    throw new Error("This Drawic device library version is not supported.");
  }
  if (!Array.isArray(value.devices)) {
    throw new Error("Device library must contain a devices array.");
  }
  const devices = value.devices.map(parseDevice);
  const ids = new Set<string>();
  for (const device of devices) {
    if (ids.has(device.id)) {
      throw new Error(`Duplicate device id ${device.id}.`);
    }
    ids.add(device.id);
  }
  return {
    format: DEVICE_LIBRARY_FORMAT,
    schemaVersion: DEVICE_LIBRARY_SCHEMA_VERSION,
    id: expectString(value.id, "id"),
    title: expectString(value.title, "title"),
    revision: expectString(value.revision, "revision"),
    source: {
      collection: expectString(
        isRecord(value.source) ? value.source.collection : undefined,
        "source.collection",
      ),
      manifestVersion: expectNumber(
        isRecord(value.source) ? value.source.manifestVersion : undefined,
        "source.manifestVersion",
      ),
      entryCount: expectNumber(
        isRecord(value.source) ? value.source.entryCount : undefined,
        "source.entryCount",
      ),
    },
    devices,
  };
}

const libraryCache = new WeakMap<DeviceLibraryFile, LoadedDeviceLibrary>();

export function loadDeviceLibrary(value: DeviceLibraryFile): LoadedDeviceLibrary {
  const cached = libraryCache.get(value);
  if (cached) {
    return cached;
  }
  const symbols = value.devices
    .map(
      (device): DeviceSymbol => ({
        id: device.id,
        ...(device.variantOf ? { variantOf: device.variantOf } : {}),
        ...(device.variantId ? { variantId: device.variantId } : {}),
        label: device.title,
        category: device.category,
        electrical: device.electrical,
        palette: device.palette,
        ...(device.referenceLabel === false
          ? { referenceLabel: false }
          : {}),
        frame: device.frame,
        ...(device.selectionBox ? { selectionBox: device.selectionBox } : {}),
        ...(device.labelBounds ? { labelBounds: device.labelBounds } : {}),
        pins: device.pins,
        file: device.artwork.source,
        svgBody: device.artwork.body,
        viewBox: device.artwork.viewBox,
        labelAnchors: device.labelAnchors,
        keywords: device.keywords,
        spice: device.spice,
        libraryId: value.id,
      }),
    )
    .sort((a, b) => a.label.localeCompare(b.label));
  const loaded = {
    id: value.id,
    title: value.title,
    revision: value.revision,
    symbols,
    byId: new Map(symbols.map((symbol) => [symbol.id, symbol])),
  };
  libraryCache.set(value, loaded);
  return loaded;
}

export function symbolById(
  library: readonly SymbolDefinition[],
  symbolId: string,
): SymbolDefinition | undefined {
  return library.find((symbol) => symbol.id === symbolId);
}

export function suggestedReference(
  symbol: SymbolDefinition & { spice?: DeviceLibrarySpice },
  existingReferences: readonly string[],
): string {
  const prefixes: Record<string, string> = {
    resistor: "R",
    "variable-resistor": "R",
    capacitor: "C",
    "variable-capacitor": "C",
    inductor: "L",
    "variable-inductor": "L",
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
  const prefix =
    symbol.spice?.prefix ??
    prefixes[symbol.id] ??
    symbol.id.replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase();
  let number = 1;
  while (existingReferences.includes(`${prefix}${number}`)) {
    number += 1;
  }
  return `${prefix}${number}`;
}

export function defaultDeviceValue(
  symbolId: string,
  symbol?: SymbolDefinition & { spice?: DeviceLibrarySpice },
): string {
  if (symbol?.spice?.defaultValue) {
    return symbol.spice.defaultValue;
  }
  switch (symbolId) {
    case "resistor":
    case "variable-resistor":
      return "1k";
    case "capacitor":
    case "variable-capacitor":
      return "1u";
    case "inductor":
    case "variable-inductor":
      return "1m";
    case "voltage-source":
    case "pulse-voltage-source":
      return "DC 5";
    case "current-source":
      return "DC 1m";
    case "diode":
    case "zener-diode":
      return "D";
    case "nmos":
      return "NMOS";
    case "pmos":
      return "PMOS";
    case "npn":
      return "NPN";
    case "pnp":
      return "PNP";
    default:
      return "";
  }
}

export interface MxLibraryDevice {
  xml: string;
  w: number;
  h: number;
  title: string;
  aspect?: string;
}

function escapeXmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function encodeBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function deviceToMxLibraryEntry(device: DeviceLibraryRecord): MxLibraryDevice {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${device.artwork.viewBox}">${device.artwork.body}</svg>`;
  const image = `data:image/svg+xml;base64,${encodeBase64Utf8(svg)}`;
  const title = escapeXmlAttribute(device.title);
  const xml = [
    `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>`,
    `<mxCell id="${escapeXmlAttribute(device.id)}" value="${title}" `,
    `style="shape=image;verticalLabelPosition=bottom;verticalAlign=top;`,
    `imageAspect=0;aspect=fixed;image=${image};" vertex="1" parent="1">`,
    `<mxGeometry width="${device.frame.width}" height="${device.frame.height}" as="geometry"/>`,
    `</mxCell></root></mxGraphModel>`,
  ].join("");
  return {
    xml,
    w: device.frame.width,
    h: device.frame.height,
    title: device.title,
    aspect: "fixed",
  };
}

export function deviceLibraryToMxLibrary(library: DeviceLibraryFile): string {
  return `${JSON.stringify(library.devices.map(deviceToMxLibraryEntry), null, 2)}\n`;
}

export function parseMxLibraryTitles(text: string): string[] {
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed)) {
    throw new Error("An mxlibrary file must contain a JSON array.");
  }
  return parsed.map((entry, index) => {
    if (!isRecord(entry) || typeof entry.title !== "string" || typeof entry.xml !== "string") {
      throw new Error(`mxlibrary entry ${index} is invalid.`);
    }
    return entry.title;
  });
}
