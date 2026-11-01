import {
  DEVICE_LIBRARY_FORMAT,
  type DeviceLibraryFile,
  type DeviceLibraryRecord,
  type DeviceSymbol,
  type LoadedDeviceLibrary,
} from "./library";
import type { DrawicDocument } from "./model";
import { sha256Hex } from "./hash";

export const EMBEDDED_DEVICE_LIBRARY_ID = "drawic-embedded";
export const USER_DEVICE_LIBRARY_ID = "drawic-user";
export const BUILT_IN_DEVICE_LIBRARY_ID = "drawic-built-in";
export const USER_DEVICE_LIBRARY_TITLE = "Custom devices";

export type DeviceImportPolicy = "keep-local" | "replace" | "copy";

export interface DeviceImportResult {
  library: DeviceLibraryFile;
  conflicts: DeviceLibraryConflict[];
  added: number;
  skipped: number;
}

export interface DeviceLibraryLayers {
  builtIn: LoadedDeviceLibrary;
  embedded?: LoadedDeviceLibrary;
  user?: LoadedDeviceLibrary;
}

export interface DeviceLibraryConflict {
  id: string;
  identical: boolean;
}

export interface EmbeddedDeviceLibraryResult {
  document: DrawicDocument;
  missing: string[];
}

export function mergeDeviceSymbols(
  layers: DeviceLibraryLayers,
): DeviceSymbol[] {
  const merged = new Map<string, DeviceSymbol>();
  for (const source of [layers.user, layers.embedded, layers.builtIn]) {
    for (const symbol of source?.symbols ?? []) {
      merged.set(symbol.id, symbol);
    }
  }
  return [...merged.values()].sort(
    (left, right) =>
      left.label.localeCompare(right.label) || left.id.localeCompare(right.id),
  );
}

export function resolveDeviceSymbol(
  layers: DeviceLibraryLayers,
  symbolId: string,
): DeviceSymbol | undefined {
  return (
    layers.builtIn.byId.get(symbolId) ??
    layers.embedded?.byId.get(symbolId) ??
    layers.user?.byId.get(symbolId)
  );
}

export function referencedSymbolIds(document: DrawicDocument): string[] {
  const ids = new Set<string>();
  for (const page of document.pages) {
    for (const node of page.nodes) {
      ids.add(node.symbolId);
    }
  }
  return [...ids].sort();
}

export function missingSymbolIds(
  document: DrawicDocument,
  layers: DeviceLibraryLayers,
): string[] {
  return referencedSymbolIds(document).filter(
    (symbolId) => resolveDeviceSymbol(layers, symbolId) === undefined,
  );
}

export function buildDeviceLibraryFile(options: {
  id: string;
  title: string;
  collection: string;
  devices: readonly DeviceLibraryRecord[];
}): DeviceLibraryFile {
  const devices = [...options.devices].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  return {
    format: DEVICE_LIBRARY_FORMAT,
    schemaVersion: 2,
    id: options.id,
    title: options.title,
    revision: sha256Hex(JSON.stringify(devices)),
    source: {
      collection: options.collection,
      manifestVersion: 1,
      entryCount: devices.length,
    },
    devices,
  };
}

export function embedReferencedDevices(
  document: DrawicDocument,
  options: {
    builtIn: LoadedDeviceLibrary;
    userLibrary?: DeviceLibraryFile | null;
    refreshExisting?: boolean;
  },
): EmbeddedDeviceLibraryResult {
  const referenced = referencedSymbolIds(document).filter(
    (symbolId) => !options.builtIn.byId.has(symbolId),
  );
  const existingById = new Map(
    (document.embeddedLibrary?.devices ?? []).map((device) => [
      device.id,
      device,
    ]),
  );
  const userById = new Map(
    (options.userLibrary?.devices ?? []).map((device) => [device.id, device]),
  );
  const devices: DeviceLibraryRecord[] = [];
  const missing: string[] = [];
  for (const symbolId of referenced) {
    const record = options.refreshExisting
      ? userById.get(symbolId) ?? existingById.get(symbolId)
      : existingById.get(symbolId) ?? userById.get(symbolId);
    if (record) {
      devices.push(record);
    } else {
      missing.push(symbolId);
    }
  }

  const withoutEmbedded = { ...document };
  delete withoutEmbedded.embeddedLibrary;
  if (devices.length === 0) {
    return { document: withoutEmbedded, missing };
  }
  return {
    document: {
      ...document,
      embeddedLibrary: buildDeviceLibraryFile({
        id: EMBEDDED_DEVICE_LIBRARY_ID,
        title: "Embedded devices",
        collection: "embedded",
        devices,
      }),
    },
    missing,
  };
}

export function deviceLibraryConflicts(
  existing: DeviceLibraryFile | null,
  incoming: DeviceLibraryFile,
): DeviceLibraryConflict[] {
  if (!existing) {
    return [];
  }
  const existingById = new Map(
    existing.devices.map((device) => [device.id, device]),
  );
  const conflicts: DeviceLibraryConflict[] = [];
  for (const device of incoming.devices) {
    const current = existingById.get(device.id);
    if (!current) {
      continue;
    }
    conflicts.push({
      id: device.id,
      identical: JSON.stringify(current) === JSON.stringify(device),
    });
  }
  return conflicts;
}

export function emptyUserDeviceLibrary(): DeviceLibraryFile {
  return buildDeviceLibraryFile({
    id: USER_DEVICE_LIBRARY_ID,
    title: USER_DEVICE_LIBRARY_TITLE,
    collection: "user",
    devices: [],
  });
}

export function uniqueDeviceId(
  baseId: string,
  existingIds: ReadonlySet<string>,
): string {
  const slug =
    baseId
      .replace(/^custom-/, "")
      .replace(/[^a-z0-9-]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "device";
  let candidate = `custom-${slug}`;
  let index = 1;
  while (existingIds.has(candidate)) {
    index += 1;
    candidate = `custom-${slug}-${index}`;
  }
  return candidate;
}

export function copyDeviceRecord(
  device: DeviceLibraryRecord,
  id: string,
  title: string,
): DeviceLibraryRecord {
  return {
    ...(JSON.parse(JSON.stringify(device)) as DeviceLibraryRecord),
    id,
    title,
  };
}

export function mergeImportedDeviceLibrary(
  existing: DeviceLibraryFile | null,
  incoming: DeviceLibraryFile,
  policy: DeviceImportPolicy,
): DeviceImportResult {
  const base = existing ?? emptyUserDeviceLibrary();
  const devices = new Map(base.devices.map((device) => [device.id, device]));
  const usedIds = new Set(devices.keys());
  const conflicts = deviceLibraryConflicts(existing, incoming);
  const conflictingIds = new Set(conflicts.map((conflict) => conflict.id));
  let added = 0;
  let skipped = 0;
  for (const device of incoming.devices) {
    if (!conflictingIds.has(device.id)) {
      devices.set(device.id, device);
      usedIds.add(device.id);
      added += 1;
      continue;
    }
    if (policy === "keep-local") {
      skipped += 1;
      continue;
    }
    if (policy === "replace") {
      devices.set(device.id, device);
      added += 1;
      continue;
    }
    const id = uniqueDeviceId(device.id, usedIds);
    usedIds.add(id);
    devices.set(id, copyDeviceRecord(device, id, `${device.title} (copy)`));
    added += 1;
  }
  return {
    library: buildDeviceLibraryFile({
      id: base.id,
      title: base.title,
      collection: base.source.collection,
      devices: [...devices.values()],
    }),
    conflicts,
    added,
    skipped,
  };
}
